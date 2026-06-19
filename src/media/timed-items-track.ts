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

import {BaseTrack, type BaseTrackArgs, type BaseTrackLoadOptions, type Track, TrackEventType, type TrackState} from './track';
import type {Destroyable, Serializable} from '../common/capabilities';
import type {OmpEventGroup} from '../common';
import {isNonNullable, objectHasOwnProperty} from '../util/util-functions';
import {CryptoUtil} from '../util/crypto-util';

export enum TimedItemsTrackEventType {
  TIMED_ITEMS_TRACK_ITEMS_ADDED = 'TIMED_ITEMS_TRACK_ITEMS_ADDED',
  TIMED_ITEMS_TRACK_ITEMS_DELETED = 'TIMED_ITEMS_TRACK_ITEMS_DELETED',

  TIMED_ITEMS_TRACK_ITEMS_UPDATING = 'TIMED_ITEMS_TRACK_ITEMS_UPDATING',
  TIMED_ITEMS_TRACK_ITEMS_UPDATED = 'TIMED_ITEMS_TRACK_ITEMS_UPDATED',
}

export interface TimedItemsTrackEventData {
  trackId: TimedItemsTrack['id'];
  updatedTimedItems: TimedItemState[];
}

export type TimedItemsTrackEventTypeDataMap = {
  [TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED]: TimedItemsTrackEventData;
  [TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED]: TimedItemsTrackEventData;
  [TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATING]: TimedItemsTrackEventData;
  [TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED]: TimedItemsTrackEventData;
};

export type TimedItemsTrackEvent = OmpEventGroup<TimedItemsTrackEventType, TimedItemsTrackEventTypeDataMap>;

export enum TimedItemTemporalType {
  MOMENT = 'MOMENT',
  SPAN = 'SPAN',
  SPAN_START = 'SPAN_START',
  SPAN_END = 'SPAN_END',
}

export interface MomentTemporal {
  type: TimedItemTemporalType.MOMENT;
  time: string;
}

export interface SpanStartTemporal {
  type: TimedItemTemporalType.SPAN_START;
  start: string;
}

export interface SpanEndTemporal {
  type: TimedItemTemporalType.SPAN_END;
  end: string;
}

export interface SpanTemporal {
  type: TimedItemTemporalType.SPAN;
  start: string;
  end: string;
}

export type TimedItemTemporal = MomentTemporal | SpanStartTemporal | SpanEndTemporal | SpanTemporal;

export class TimedItemTemporalUtil {
  static extractDuration(temporal: TimedItemTemporal): number | undefined {
    switch (temporal.type) {
      case TimedItemTemporalType.SPAN:
        return Number(temporal.end) - Number(temporal.start);
      default:
        return void 0;
    }
  }

  static touchesTimeRange(temporal: TimedItemTemporal, start: number, end: number): boolean {
    switch (temporal.type) {
      case TimedItemTemporalType.MOMENT:
        return Number(temporal.time) >= start && Number(temporal.time) <= end;
      case TimedItemTemporalType.SPAN:
        return Number(temporal.start) <= end && Number(temporal.end) >= start;
      default:
        return false;
    }
  }

  static extractStartTime(temporal: TimedItemTemporal): number | undefined {
    switch (temporal.type) {
      case TimedItemTemporalType.MOMENT:
        return Number(temporal.time);
      case TimedItemTemporalType.SPAN:
      case TimedItemTemporalType.SPAN_START:
        return Number(temporal.start);
      case TimedItemTemporalType.SPAN_END:
        return undefined;
    }
  }

  static extractEndTime(temporal: TimedItemTemporal): number | undefined {
    switch (temporal.type) {
      case TimedItemTemporalType.MOMENT:
        return Number(temporal.time);
      case TimedItemTemporalType.SPAN:
      case TimedItemTemporalType.SPAN_END:
        return Number(temporal.end);
      case TimedItemTemporalType.SPAN_START:
        return undefined;
    }
  }

  static compareByStartTime(a: TimedItemTemporal, b: TimedItemTemporal): number {
    const aStart = TimedItemTemporalUtil.extractStartTime(a);
    const bStart = TimedItemTemporalUtil.extractStartTime(b);
    if (aStart === undefined && bStart === undefined) return 0;
    if (aStart === undefined) return -1;
    if (bStart === undefined) return 1;
    return aStart - bStart;
  }

  static validate(temporal: TimedItemTemporal): void {
    switch (temporal.type) {
      case TimedItemTemporalType.MOMENT:
        TimedItemTemporalUtil.validateMoment(temporal);
        break;
      case TimedItemTemporalType.SPAN:
        TimedItemTemporalUtil.validateSpan(temporal);
        break;
      case TimedItemTemporalType.SPAN_START:
        TimedItemTemporalUtil.validateSpanStart(temporal);
        break;
      case TimedItemTemporalType.SPAN_END:
        TimedItemTemporalUtil.validateSpanEnd(temporal);
        break;
    }
  }

  private static validateFiniteTime(value: string, label: string): void {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid temporal: ${label} must be a finite number, got '${value}'`);
    }
  }

  private static validateMoment(temporal: MomentTemporal): void {
    TimedItemTemporalUtil.validateFiniteTime(temporal.time, 'time');
  }

  private static validateSpan(temporal: SpanTemporal): void {
    TimedItemTemporalUtil.validateFiniteTime(temporal.start, 'start');
    TimedItemTemporalUtil.validateFiniteTime(temporal.end, 'end');
    if (Number(temporal.start) > Number(temporal.end)) {
      throw new Error(`Invalid temporal: start (${temporal.start}) must be <= end (${temporal.end})`);
    }
  }

  private static validateSpanStart(temporal: SpanStartTemporal): void {
    TimedItemTemporalUtil.validateFiniteTime(temporal.start, 'start');
  }

  private static validateSpanEnd(temporal: SpanEndTemporal): void {
    TimedItemTemporalUtil.validateFiniteTime(temporal.end, 'end');
  }
}

export interface TimedItemState extends Serializable {
  id: string;
  data: Record<string, any>;
  temporal: TimedItemTemporal;
}

export interface TimedItemsTrackState<T extends TimedItemState = TimedItemState> extends TrackState {
  timedItems: T[];

  timedItemsLocked: boolean;
}

export interface TimedItem<S extends TimedItemState = TimedItemState> {
  /** Unique identifier (UUID). */
  id: string;

  temporal: TimedItemTemporal;

  /** Arbitrary data. */
  data: Record<string, any>;

  state: S;
}

export interface MutableTimedItem<S extends TimedItemState = TimedItemState, U extends TimedItemUpdateableAttrs = TimedItemUpdateableAttrs> extends TimedItem<S> {
  update(attrs: U): void;
}

export interface TimedItemArgs {
  temporal: TimedItemTemporal;
  data?: Record<string, any> | undefined;
}

export class BaseTimedItem<S extends TimedItemState = TimedItemState, U extends TimedItemUpdateableAttrs = TimedItemUpdateableAttrs> implements MutableTimedItem<S, U> {
  protected readonly _id: string;
  protected _temporal: TimedItemTemporal;
  protected _data: Record<string, any>;

  constructor(args: TimedItemArgs) {
    this._id = CryptoUtil.uuid();
    this._temporal = args.temporal;
    this._data = args.data ?? {};
  }

  protected _getState(): TimedItemState {
    return {
      id: this._id,
      temporal: this._temporal,
      data: this._data,
    } as S;
  }

  /**
   * @internal
   */
  update(attrs: U) {
    if (attrs.hasOwnProperty('temporal') && attrs.temporal) {
      TimedItemTemporalUtil.validate(attrs.temporal);
      this._temporal = attrs.temporal;
    }

    if (attrs.hasOwnProperty('data') && attrs.data) {
      this._data = attrs.data;
    }
  }

  get id(): string {
    return this._id;
  }

  get temporal(): TimedItemTemporal {
    return this._temporal;
  }

  get data(): Record<string, any> {
    return this._data;
  }

  get state(): S {
    return this._getState() as S;
  }
}

export interface TimedItemUpdateableAttrs {
  data?: Record<string, any> | undefined;
  temporal?: TimedItemTemporal | undefined;
}

export type TrackTimedItem<T extends TimedItemsTrack> = T extends TimedItemsTrack<infer I> ? I : never;

export interface TimedItemsTrackLoadOptions extends BaseTrackLoadOptions {}

export interface TimedItemsTrack<
  T extends TimedItem = TimedItem,
  S extends TimedItemsTrackState = TimedItemsTrackState,
  U extends TimedItemUpdateableAttrs = TimedItemUpdateableAttrs,
  E extends OmpEventGroup<any, any> = any,
> extends Track<S, E | TimedItemsTrackEvent> {
  timedItems: T[];

  /**
   * Returns the timed items sorted by their start time.
   */
  timedItemsSorted: T[];

  areTimedItemsLocked: boolean;

  areTimedItemsFetched: boolean;

  getTimedItem(id: T['id']): T | undefined;

  addTimedItems(timedItems: T | T[]): void;

  deleteTimedItems(id: T['id'] | T['id'][]): void;

  updateTimedItem(id: T['id'], attrs: U): void;

  findTimedItemsAtTime(time: number): T[];

  findFirstTimedItemAtTime(time: number): T | undefined;

  findTimedItemsInRange(start: number, end: number): T[];

  findNearestTimedItem(time: number): T | undefined;
}

export type TimedItemHooks = {
  beforeCreate?: (timedItem: TimedItem) => void | undefined;
  afterCreate?: (timedItem: TimedItem) => void | undefined;
};

export interface TimedItemsTrackArgs extends BaseTrackArgs {
  timedItemsLocked?: boolean | undefined;
  timedItemHooks?: TimedItemHooks | undefined;
}

export type InferUpdateAttrs<T> = T extends MutableTimedItem<any, infer U> ? U : TimedItemUpdateableAttrs;

export abstract class BaseTimedItemsTrack<T extends TimedItem, TM extends T & MutableTimedItem<T['state']>, S extends TimedItemsTrackState, E extends OmpEventGroup<any, any> = never>
  extends BaseTrack<S, E | TimedItemsTrackEvent>
  implements TimedItemsTrack<T, S, InferUpdateAttrs<TM>, E | TimedItemsTrackEvent>, Destroyable
{
  protected _timedItems: TM[] = [];
  protected _timedItemsSorted: TM[] = [];
  protected _timedItemsById: Map<TM['id'], TM> = new Map<TM['id'], TM>();
  protected _timedItemHooks?: TimedItemHooks | undefined;
  protected _areTimedItemsLocked = false;
  protected _areTimedItemsFetched = false;

  protected constructor(args?: TimedItemsTrackArgs) {
    super(args);

    if (args) {
      if (objectHasOwnProperty(args, 'timedItemsLocked')) {
        this._areTimedItemsLocked = !!args.timedItemsLocked;
      }

      this._timedItemHooks = args.timedItemHooks;
    }
  }

  protected _getState(): TimedItemsTrackState<T['state']> {
    return {
      ...super._getState(),
      timedItems: this._timedItems.map((p) => p.state),
      timedItemsLocked: this._areTimedItemsLocked,
    };
  }

  updateTimedItem(id: T['id'], attrs: InferUpdateAttrs<TM>) {
    this.checkTimedItemsLocked();

    let timedItem = this._timedItemsById.get(id);
    if (timedItem) {
      this._onEvent$.next({
        type: TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATING,
        data: {
          trackId: this.id,
          updatedTimedItems: [timedItem.state],
        },
      });

      timedItem.update(attrs);

      if (attrs.temporal) {
        this.sortTimedItemsSorted();
      }

      this._onEvent$.next({
        type: TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED,
        data: {
          trackId: this.id,
          updatedTimedItems: [timedItem.state],
        },
      });
    } else {
      throw new Error(`Timed item not found, id=${id}`);
    }
  }

  findTimedItemsInRange(start: number, end: number): T[] {
    let lo = 0;
    let hi = this._timedItemsSorted.length;
    while (lo < hi) {
      let mid = (lo + hi) >>> 1;
      const midStart = TimedItemTemporalUtil.extractStartTime(this._timedItemsSorted[mid]!.temporal);
      if (midStart === undefined || midStart < start) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    let result: T[] = [];
    for (let i = lo; i < this._timedItemsSorted.length; i++) {
      const item = this._timedItemsSorted[i];
      if (!item) break;

      const itemStartTime = TimedItemTemporalUtil.extractStartTime(item.temporal);
      if (itemStartTime !== undefined && itemStartTime > end) {
        break;
      }

      const temporal = item.temporal;
      switch (temporal.type) {
        case TimedItemTemporalType.MOMENT:
          result.push(item);
          break;
        case TimedItemTemporalType.SPAN:
          if (Number(temporal.end) <= end) {
            result.push(item);
          }
          break;
        case TimedItemTemporalType.SPAN_START:
          result.push(item);
          break;
        case TimedItemTemporalType.SPAN_END:
          if (Number(temporal.end) >= start && Number(temporal.end) <= end) {
            result.push(item);
          }
          break;
      }
    }
    return result;
  }

  findNearestTimedItem(time: number): T | undefined {
    if (this._timedItemsSorted.length === 0) return undefined;

    let lo = 0;
    let hi = this._timedItemsSorted.length;
    while (lo < hi) {
      let mid = (lo + hi) >>> 1;
      const midStart = TimedItemTemporalUtil.extractStartTime(this._timedItemsSorted[mid]!.temporal);
      if (midStart === undefined || midStart < time) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    let before = lo > 0 ? this._timedItemsSorted[lo - 1] : undefined;
    let after = lo < this._timedItemsSorted.length ? this._timedItemsSorted[lo] : undefined;

    if (!before) return after;
    if (!after) return before;

    const beforeStart = TimedItemTemporalUtil.extractStartTime(before.temporal);
    const afterStart = TimedItemTemporalUtil.extractStartTime(after.temporal);
    if (beforeStart === undefined) return after;
    if (afterStart === undefined) return before;

    return Math.abs(time - beforeStart) <= Math.abs(afterStart - time) ? before : after;
  }

  private sortTimedItemsSorted(): void {
    this._timedItemsSorted.sort((a, b) => TimedItemTemporalUtil.compareByStartTime(a.temporal, b.temporal));
  }

  private matchesTime(temporal: TimedItemTemporal, time: number): boolean {
    switch (temporal.type) {
      case TimedItemTemporalType.MOMENT:
        return Number(temporal.time) === time;
      case TimedItemTemporalType.SPAN:
        return Number(temporal.start) <= time && Number(temporal.end) >= time;
      default:
        return false;
    }
  }

  findTimedItemsAtTime(time: number): T[] {
    return this._timedItemsSorted.filter((item) => this.matchesTime(item.temporal, time));
  }

  findFirstTimedItemAtTime(time: number): T | undefined {
    return this._timedItemsSorted.find((item) => this.matchesTime(item.temporal, time));
  }

  get timedItems(): T[] {
    return this._timedItems;
  }

  get timedItemsSorted(): T[] {
    return this._timedItemsSorted;
  }

  get areTimedItemsLocked(): boolean {
    return this._areTimedItemsLocked;
  }

  set areTimedItemsLocked(value: boolean) {
    if (value !== this._areTimedItemsLocked) {
      this._onEvent$.next({
        type: TrackEventType.TRACK_UPDATING,
        data: {
          trackState: this.state,
        },
      });

      this._areTimedItemsLocked = value;

      this._onEvent$.next({
        type: TrackEventType.TRACK_UPDATED,
        data: {
          trackState: this.state,
        },
      });
    }
  }

  get areTimedItemsFetched() {
    return this._areTimedItemsFetched;
  }

  set areTimedItemsFetched(areTimedItemsFetched: boolean) {
    this._areTimedItemsFetched = areTimedItemsFetched;
  }

  getTimedItem(id: T['id']): T | undefined {
    return this._timedItemsById.get(id);
  }

  protected checkTimedItemsLocked() {
    if (this._areTimedItemsFetched && this._areTimedItemsLocked) {
      throw new Error('Timed items track is locked');
    }
  }

  addTimedItems(timedItems: TM | TM[]) {
    this.checkTimedItemsLocked();

    let newTimedItems: TM[];
    if (Array.isArray(timedItems)) {
      newTimedItems = timedItems;
    } else {
      newTimedItems = [timedItems];
    }

    this._onEvent$.next({
      type: TrackEventType.TRACK_UPDATING,
      data: {
        trackState: this.state,
      },
    });

    newTimedItems.forEach((timedItem) => {
      this._timedItemHooks?.beforeCreate?.(timedItem);
    });

    this._timedItems.push(...newTimedItems);
    this._timedItemsSorted.push(...newTimedItems);
    this.sortTimedItemsSorted();
    newTimedItems.forEach((timedItem) => this._timedItemsById.set(timedItem.id, timedItem));

    newTimedItems.forEach((timedItem) => {
      this._timedItemHooks?.afterCreate?.(timedItem);
    });

    this._onEvent$.next({
      type: TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED,
      data: {
        trackId: this.id,
        updatedTimedItems: newTimedItems.map((p) => p.state),
      },
    });

    this._onEvent$.next({
      type: TrackEventType.TRACK_UPDATED,
      data: {
        trackState: this.state,
      },
    });
  }

  deleteTimedItems(ids: T['id'] | T['id'][]) {
    this.checkTimedItemsLocked();

    let idsArray: T['id'][];
    if (Array.isArray(ids)) {
      idsArray = ids;
    } else {
      idsArray = [ids];
    }

    let timedItems = idsArray.map((id) => this._timedItemsById.get(id)).filter(isNonNullable);
    if (timedItems.length > 0) {
      this._onEvent$.next({
        type: TrackEventType.TRACK_UPDATING,
        data: {},
      });

      timedItems.forEach((timedItem) => {
        this._timedItemsById.delete(timedItem.id);
        this._timedItems.splice(this._timedItems.indexOf(timedItem), 1);
        this._timedItemsSorted.splice(this._timedItemsSorted.indexOf(timedItem), 1);
      });

      this._onEvent$.next({
        type: TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED,
        data: {
          trackId: this.id,
          updatedTimedItems: timedItems.map((p) => p.state),
        },
      });
      this._onEvent$.next({
        type: TrackEventType.TRACK_UPDATED,
        data: {
          trackState: this.state,
        },
      });
    }
  }
}
