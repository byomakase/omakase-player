/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {debounceTime, filter, Subscription, tap} from 'rxjs';
import {type TimedItemsTrack, TimedItemsTrackEventType, TimedItemTemporalUtil, type TrackTimedItem} from '../../media';
import type {Destroyable} from '../../common/capabilities';
import Decimal from 'decimal.js';
import {TEMPORAL} from '../../constants';

export type DownsampleStrategy = 'none' | 'drop' | 'max' | 'min' | 'avg';

export interface DownsampleOptions {
  /**
   * Period for downsampling in milliseconds
   */
  downsamplePeriod?: number;

  /**
   * Strategy for downsampling (supported values: none, drop, min, max, and avg)
   */
  downsampleStrategy?: DownsampleStrategy;
}

export const DEFAULT_DOWNSAMPLE_OPTIONS: Required<DownsampleOptions> = {
  downsamplePeriod: 1000,
  downsampleStrategy: 'avg',
};

export abstract class TimedItemsTrackDownsampler<T extends TimedItemsTrack> implements Destroyable {
  protected readonly _sourceTrack: T;
  protected readonly _downsampledTrack: T;
  protected readonly _options: DownsampleOptions;

  private readonly _samplePeriodDuration: number;
  private readonly _periodBoundary: number;
  private readonly _bucketToItemId = new Map<number, string>();
  private readonly _sourceItemToBucket = new Map<string, number>();
  private _pendingBuckets = new Set<number>();
  private readonly _subscription: Subscription;

  protected constructor(sourceTrack: T, options: DownsampleOptions) {
    this._sourceTrack = sourceTrack;
    this._options = {...DEFAULT_DOWNSAMPLE_OPTIONS, ...options};
    this._samplePeriodDuration = new Decimal(this._options.downsamplePeriod ?? DEFAULT_DOWNSAMPLE_OPTIONS.downsamplePeriod).div(1000).toNumber();
    this._periodBoundary = new Decimal(10).pow(-TEMPORAL.timedItemsMillisPrecision).toNumber();
    this._downsampledTrack = this.createDownsampledTrack();
    this.initialDownsample();

    this._subscription = sourceTrack.onEvent$
      .pipe(
        filter(
          (event) =>
            event.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED ||
            event.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED ||
            event.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED
        ),
        tap((event) => this.collectAffectedBuckets(event)),
        debounceTime(0)
      )
      .subscribe(() => {
        const buckets = new Set(this._pendingBuckets);
        this._pendingBuckets.clear();
        this.recomputeBuckets(buckets);
      });
  }

  protected abstract createDownsampledTrack(): T;

  protected abstract resolveDownsampledTimedItem(index: number, start: number, end: number, items: TrackTimedItem<T>[]): TrackTimedItem<T>;

  get downsampledTrack(): T {
    return this._downsampledTrack;
  }

  destroy(): void {
    this._subscription.unsubscribe();
  }

  private bucketIndex(time: number): number {
    return Math.floor(time / this._samplePeriodDuration);
  }

  private bucketBounds(bucketIndex: number): [number, number] {
    const start = new Decimal(bucketIndex).mul(this._samplePeriodDuration).toDecimalPlaces(TEMPORAL.timedItemsMillisPrecision).toNumber();
    const end = new Decimal(start).plus(this._samplePeriodDuration).minus(this._periodBoundary).toDecimalPlaces(TEMPORAL.timedItemsMillisPrecision).toNumber();
    return [start, end];
  }

  private initialDownsample(): void {
    const sourceItems = this._sourceTrack.timedItemsSorted;
    if (sourceItems.length === 0) return;

    const buckets = new Map<number, TrackTimedItem<T>[]>();
    for (const item of sourceItems) {
      const time = TimedItemTemporalUtil.extractStartTime(item.temporal) ?? 0;
      const bucketIndex = this.bucketIndex(time);
      this._sourceItemToBucket.set(item.id, bucketIndex);
      let bucket = buckets.get(bucketIndex);
      if (!bucket) {
        bucket = [];
        buckets.set(bucketIndex, bucket);
      }
      bucket.push(item as TrackTimedItem<T>);
    }

    const downsampledItems: TrackTimedItem<T>[] = [];
    buckets.forEach((items, bucketIndex) => {
      const [start, end] = this.bucketBounds(bucketIndex);
      const downsampled = this.resolveDownsampledTimedItem(bucketIndex, start, end, items);
      downsampledItems.push(downsampled);
      this._bucketToItemId.set(bucketIndex, downsampled.id);
    });

    this._downsampledTrack.addTimedItems(downsampledItems);
  }

  private collectAffectedBuckets(event: {type: string; data: {updatedTimedItems?: TrackTimedItem<T>[]}}): void {
    switch (event.type) {
      case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED: {
        for (const item of event.data.updatedTimedItems ?? []) {
          const time = TimedItemTemporalUtil.extractStartTime(item.temporal) ?? 0;
          const bucket = this.bucketIndex(time);
          this._sourceItemToBucket.set(item.id, bucket);
          this._pendingBuckets.add(bucket);
        }
        break;
      }
      case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED: {
        for (const item of event.data.updatedTimedItems ?? []) {
          const bucket = this._sourceItemToBucket.get(item.id);
          if (bucket !== undefined) {
            this._sourceItemToBucket.delete(item.id);
            this._pendingBuckets.add(bucket);
          }
        }
        break;
      }
      case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED: {
        for (const item of event.data.updatedTimedItems ?? []) {
          const oldBucket = this._sourceItemToBucket.get(item.id);
          if (oldBucket !== undefined) {
            this._pendingBuckets.add(oldBucket);
          }
          const time = TimedItemTemporalUtil.extractStartTime(item.temporal) ?? 0;
          const newBucket = this.bucketIndex(time);
          this._sourceItemToBucket.set(item.id, newBucket);
          this._pendingBuckets.add(newBucket);
        }
        break;
      }
    }
  }

  private recomputeBuckets(bucketIndices: Set<number>): void {
    const bucketItems = new Map<number, TrackTimedItem<T>[]>();
    for (const bi of bucketIndices) {
      bucketItems.set(bi, []);
    }
    for (const item of this._sourceTrack.timedItemsSorted) {
      const time = TimedItemTemporalUtil.extractStartTime(item.temporal) ?? 0;
      const bi = this.bucketIndex(time);
      if (bucketItems.has(bi)) {
        bucketItems.get(bi)!.push(item as TrackTimedItem<T>);
      }
    }

    const toDelete: string[] = [];
    const toAdd: TrackTimedItem<T>[] = [];

    for (const [bucketIndex, items] of bucketItems) {
      const existingId = this._bucketToItemId.get(bucketIndex);
      if (existingId !== undefined) {
        toDelete.push(existingId);
        this._bucketToItemId.delete(bucketIndex);
      }
      if (items.length > 0) {
        const [start, end] = this.bucketBounds(bucketIndex);
        const downsampled = this.resolveDownsampledTimedItem(bucketIndex, start, end, items);
        toAdd.push(downsampled);
        this._bucketToItemId.set(bucketIndex, downsampled.id);
      }
    }

    if (toDelete.length > 0) this._downsampledTrack.deleteTimedItems(toDelete);
    if (toAdd.length > 0) this._downsampledTrack.addTimedItems(toAdd);
  }


  get sourceTrack(): T {
    return this._sourceTrack;
  }
}
