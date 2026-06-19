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

import {filter, Observable, Subject, takeUntil} from 'rxjs';
import {TimedItemsTrackEventType, TimedItemTemporalType, type TimedItem, type TimedItemsTrack, type TimedItemsTrackEventData} from '../media';
import {ObserverBreaker} from '../common/observer-breaker';
import {freeObserver} from '../util/rxjs-util';

export enum TimedItemsTrackItemEventType {
  TIMED_ITEMS_TRACK_ITEM_ENTRY = 'TIMED_ITEMS_TRACK_ITEM_ENTRY',
  TIMED_ITEMS_TRACK_ITEM_EXIT = 'TIMED_ITEMS_TRACK_ITEM_EXIT',
}

export interface TimedItemsTrackItemEntryEventData {
  nearItems: TimedItem[];
  exactItems: TimedItem[];
  time: number;
}

export interface TimedItemsTrackItemExitEventData {
  items: TimedItem[];
  time: number;
}

export type TimedItemsTrackItemEventTypeDataMap = {
  [TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY]: TimedItemsTrackItemEntryEventData;
  [TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT]: TimedItemsTrackItemExitEventData;
};

export type TimedItemsTrackItemEvent = {
  [K in TimedItemsTrackItemEventType]: {
    type: K;
    data: TimedItemsTrackItemEventTypeDataMap[K];
  };
}[keyof TimedItemsTrackItemEventTypeDataMap];

export enum TimedItemsTrackEventEmitterThresholdType {
  MINIMUM = 'MINIMUM',
  START = 'START',
  END = 'END',
  START_AND_END = 'START_AND_END',
}

interface TimedItemExitInfo {
  position: 'start' | 'end';
  threshold: number;
}

interface TimedItemEntryInfo {
  position: 'start' | 'end';
  range: {
    start: number;
    end: number;
  };
}

interface IneligibleTimedItem {
  timedItem: TimedItem;
  exitInfo: TimedItemExitInfo;
}

interface ActiveTimedItem {
  timedItem: TimedItem;
  entryInfo: TimedItemEntryInfo;
  exact: boolean;
}

export class TimedItemsTrackEventEmitter {
  private _track: TimedItemsTrack;
  private _activeItems: Map<TimedItem['id'], ActiveTimedItem> = new Map();
  private _ineligibleItems: Map<TimedItem['id'], IneligibleTimedItem> = new Map();
  private _threshold?: number | undefined;
  private _thresholdType: TimedItemsTrackEventEmitterThresholdType;
  private readonly _onEvent$ = new Subject<TimedItemsTrackItemEvent>();
  private _destroyBreaker = new ObserverBreaker();

  public readonly onEvent$: Observable<TimedItemsTrackItemEvent> = this._onEvent$.asObservable();

  constructor(track: TimedItemsTrack, timeProvider$: Observable<number>, threshold?: number | undefined, thresholdType?: TimedItemsTrackEventEmitterThresholdType | undefined) {
    this._track = track;
    this._threshold = threshold;
    this._thresholdType = thresholdType ?? TimedItemsTrackEventEmitterThresholdType.START_AND_END;

    // remove deleted track item
    this._track.onEvent$
      .pipe(
        takeUntil(this._destroyBreaker.observer),
        filter((event) => event.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED)
      )
      .subscribe((event) => {
        const data = event.data as TimedItemsTrackEventData;
        const deletedIds = new Set(data.updatedTimedItems.map((item) => item.id));
        for (const id of deletedIds) {
          this._activeItems.delete(id);
          this._ineligibleItems.delete(id);
        }
      });

    timeProvider$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((time) => {
      let range = undefined;
      if (this._threshold !== undefined) {
        // get potentially entered cues, we use start and end threshold an we will filter further
        range = {
          start: Math.max(0, time - this._threshold),
          end: time + this._threshold,
        };
      }

      const currentItems = range ? this._findItemsIntersectingRange(range) : this._track.findTimedItemsAtTime(time);
      const currentIds = new Map(currentItems.map((item) => [item.id, item]));

      const exited = [...this._activeItems].filter(([_, activeTimedItem]) => this._isTimedItemExited(activeTimedItem.timedItem, time));

      const entered = currentItems.filter((item) => this._isTimedItemEntered(item, time) && this._checkItemEligibility(item, time));
      const nearEntered = entered.filter((item) => this._isNearEntered(item, time));
      const exactEntered = entered.filter((item) => this._isExactEntered(item, time));

      if (nearEntered.length + exactEntered.length > 0) {
        this._onEvent$.next({
          type: TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY,
          data: {nearItems: nearEntered, exactItems: exactEntered, time: time},
        });
      }

      if (exited.length > 0) {
        if (this._threshold !== undefined) {
          exited.forEach(([_, exitedItem]) => {
            const exitInfo = this._getExitInfo(exitedItem.timedItem, time);
            if (exitInfo) {
              this._ineligibleItems.set(exitedItem.timedItem.id, {
                timedItem: exitedItem.timedItem,
                exitInfo: exitInfo,
              });
            }

            this._activeItems.delete(exitedItem.timedItem.id);
          });
        }
        this._onEvent$.next({
          type: TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT,
          data: {items: exited.map(([_, activeTimedItem]) => activeTimedItem.timedItem), time: time},
        });
      }

      this._moveNearEnteredToExactEntered(exactEntered);
      const exactEnteredIds = new Set(exactEntered.map((item) => item.id));

      exactEntered.forEach((item) => this._activeItems.set(item.id, {timedItem: item, entryInfo: this._getEntryInfo(item, time), exact: true}));
      nearEntered.forEach((item) => this._activeItems.set(item.id, {timedItem: item, entryInfo: this._getEntryInfo(item, time), exact: false}));
      for (const [id] of this._activeItems) {
        if (!currentIds.has(id)) {
          this._activeItems.delete(id);
        }
      }

      // Clear ineligibility for items that have cleared the threshold
      for (const [id, info] of this._ineligibleItems) {
        if ((info.exitInfo.position === 'end' && time > info.exitInfo.threshold) || (info.exitInfo.position === 'start' && time < info.exitInfo.threshold)) {
          this._ineligibleItems.delete(id);
        } else if (info.exitInfo.position === 'start' && info.timedItem.temporal.type === TimedItemTemporalType.SPAN) {
          const range = this._createThresholdRange(Number(info.timedItem.temporal.start), Number(info.timedItem.temporal.end));
          if (time > range.end) {
            this._ineligibleItems.delete(id);
          }
        } else if (info.exitInfo.position === 'end' && info.timedItem.temporal.type === TimedItemTemporalType.SPAN) {
          const range = this._createThresholdRange(Number(info.timedItem.temporal.start), Number(info.timedItem.temporal.end));
          if (time < range.start) {
            this._ineligibleItems.delete(id);
          }
        }
      }
    });
  }

  private _findItemsIntersectingRange(range: {start: number; end: number}): TimedItem[] {
    const atStart = this._track.findTimedItemsAtTime(range.start);
    const atEnd = this._track.findTimedItemsAtTime(range.end);
    const inRange = this._track.findTimedItemsInRange(range.start, range.end);
    const merged = new Map<TimedItem['id'], TimedItem>();
    for (const item of atStart) {
      merged.set(item.id, item);
    }
    for (const item of atEnd) {
      merged.set(item.id, item);
    }
    for (const item of inRange) {
      merged.set(item.id, item);
    }
    return [...merged.values()];
  }

  private _isTimedItemExited(timedItem: TimedItem, time: number) {
    let range: {start: number; end: number};
    const activeItem = this._activeItems.get(timedItem.id)!;

    switch (activeItem.timedItem.temporal.type) {
      case TimedItemTemporalType.MOMENT:
        const momentTime = Number(activeItem.timedItem.temporal.time);
        range = this._createThresholdRange(momentTime, momentTime);
        return time < range.start || time > range.end;
      case TimedItemTemporalType.SPAN_START:
        if (activeItem.exact) {
          return Number(activeItem.timedItem.temporal.start) > time;
        }
        return activeItem.entryInfo.range.start > time;
      case TimedItemTemporalType.SPAN_END:
        if (activeItem.exact) {
          return Number(activeItem.timedItem.temporal.end) < time;
        }
        return activeItem.entryInfo.range.end < time;
      case TimedItemTemporalType.SPAN:
        if (activeItem.exact) {
          return Number(activeItem.timedItem.temporal.start) > time || Number(activeItem.timedItem.temporal.end) < time;
        }
        if (activeItem.entryInfo.position === 'start') {
          return activeItem.entryInfo.range.start > time || Number(activeItem.timedItem.temporal.end) < time;
        } else {
          return Number(activeItem.timedItem.temporal.start) > time || activeItem.entryInfo.range.end < time;
        }
    }
  }

  private _getExitInfo(timedItem: TimedItem, time: number): TimedItemExitInfo | undefined {
    let range: {start: number; end: number};
    switch (timedItem.temporal.type) {
      case TimedItemTemporalType.MOMENT:
        const timedItemTime = Number(timedItem.temporal.time);
        range = this._createThresholdRange(timedItemTime, timedItemTime);
        return undefined;
      case TimedItemTemporalType.SPAN_START:
        range = this._createThresholdRange(Number(timedItem.temporal.start), Infinity);
        return {
          position: 'start',
          threshold: range.start,
        };
      case TimedItemTemporalType.SPAN_END:
        range = this._createThresholdRange(0, Number(timedItem.temporal.end));
        return {
          position: 'end',
          threshold: range.end,
        };
      case TimedItemTemporalType.SPAN:
        range = this._createThresholdRange(Number(timedItem.temporal.start), Number(timedItem.temporal.end));
        if (time < Number(timedItem.temporal.start)) {
          return {
            position: 'start',
            threshold: range.start,
          };
        } else {
          return {
            position: 'end',
            threshold: range.end,
          };
        }
    }
  }

  private _getEntryInfo(timedItem: TimedItem, time: number): TimedItemEntryInfo {
    let range: {start: number; end: number};
    switch (timedItem.temporal.type) {
      case TimedItemTemporalType.MOMENT:
        const timedItemTime = Number(timedItem.temporal.time);
        range = this._createThresholdRange(timedItemTime, timedItemTime);
        return {
          position: time < timedItemTime ? 'start' : 'end',
          range: range,
        };
      case TimedItemTemporalType.SPAN_START:
        range = this._createThresholdRange(Number(timedItem.temporal.start), Infinity);
        return {
          position: 'start',
          range: range,
        };
      case TimedItemTemporalType.SPAN_END:
        range = this._createThresholdRange(0, Number(timedItem.temporal.end));
        return {
          position: 'end',
          range: range,
        };
      case TimedItemTemporalType.SPAN:
        range = this._createThresholdRange(Number(timedItem.temporal.start), Number(timedItem.temporal.end));
        if (time < Number(timedItem.temporal.start)) {
          return {
            position: 'start',
            range: range,
          };
        } else {
          return {
            position: 'end',
            range: range,
          };
        }
    }
  }

  private _isTimedItemEntered(timedItem: TimedItem, time: number) {
    let range: {start: number; end: number};
    switch (timedItem.temporal.type) {
      case TimedItemTemporalType.MOMENT:
        const timedItemTime = Number(timedItem.temporal.time);
        range = this._createThresholdRange(timedItemTime, timedItemTime);
        return time >= range.start && time <= range.end;
      case TimedItemTemporalType.SPAN_START:
        range = this._createThresholdRange(Number(timedItem.temporal.start), Infinity);
        return time >= range.start;
      case TimedItemTemporalType.SPAN_END:
        range = this._createThresholdRange(0, Number(timedItem.temporal.end));
        return time <= range.end;
      case TimedItemTemporalType.SPAN:
        range = this._createThresholdRange(Number(timedItem.temporal.start), Number(timedItem.temporal.end));
        return time >= range.start && time <= range.end;
    }
  }

  private _isTimedItemEnteredExactly(timedItem: TimedItem, time: number) {
    let range: {start: number; end: number};
    switch (timedItem.temporal.type) {
      case TimedItemTemporalType.MOMENT:
        const timedItemTime = Number(timedItem.temporal.time);
        return Math.abs(time - timedItemTime) < 0.001;
      case TimedItemTemporalType.SPAN_START:
        return time >= Number(timedItem.temporal.start);
      case TimedItemTemporalType.SPAN_END:
        return time <= Number(timedItem.temporal.end);
      case TimedItemTemporalType.SPAN:
        range = this._createThresholdRange(Number(timedItem.temporal.start), Number(timedItem.temporal.end));
        return time >= Number(timedItem.temporal.start) && time <= Number(timedItem.temporal.end);
    }
  }

  private _isExactEntered(timedItem: TimedItem, time: number) {
    if (!this._isTimedItemEnteredExactly(timedItem, time)) {
      return false;
    }

    const activeItem = this._activeItems.get(timedItem.id);
    if (activeItem && activeItem.exact) {
      return false;
    }

    return true;
  }

  private _isNearEntered(timedItem: TimedItem, time: number) {
    if (this._isTimedItemEnteredExactly(timedItem, time)) {
      return false;
    }

    const activeItem = this._activeItems.get(timedItem.id);
    if (activeItem) {
      return false;
    }

    return true;
  }

  private _checkItemEligibility(timedItem: TimedItem, time: number): boolean {
    const ineligibleItemInfo = this._ineligibleItems.get(timedItem.id);

    if (!ineligibleItemInfo) {
      return true;
    }

    const {exitInfo} = ineligibleItemInfo;

    // Ineligible while time is in the exit-side threshold zone
    switch (timedItem.temporal.type) {
      case TimedItemTemporalType.SPAN:
        if (exitInfo.position === 'end' && time > Number(timedItem.temporal.end) && time <= exitInfo.threshold) return false;
        if (exitInfo.position === 'start' && time >= exitInfo.threshold && time < Number(timedItem.temporal.start)) return false;
        break;
      case TimedItemTemporalType.SPAN_START:
        if (exitInfo.position === 'start' && time >= exitInfo.threshold && time < Number(timedItem.temporal.start)) return false;
        break;
      case TimedItemTemporalType.SPAN_END:
        if (exitInfo.position === 'end' && time > Number(timedItem.temporal.end) && time <= exitInfo.threshold) return false;
        break;
    }

    // Outside threshold, inside span, or opposite side — eligible
    this._ineligibleItems.delete(timedItem.id);
    return true;
  }

  private _createThresholdRange(start: number, end: number) {
    const threshold = this._threshold ?? 0;
    const midpoint = (start + end) / 2;

    switch (this._thresholdType) {
      case TimedItemsTrackEventEmitterThresholdType.MINIMUM:
        if (end - start > threshold) {
          return {start: start, end: end};
        }
        return {start: Math.max(midpoint - threshold / 2, 0), end: midpoint + threshold / 2};
      case TimedItemsTrackEventEmitterThresholdType.START:
        return {start: Math.max(start - threshold, 0), end: end};
      case TimedItemsTrackEventEmitterThresholdType.END:
        return {start: start, end: end + threshold};
      case TimedItemsTrackEventEmitterThresholdType.START_AND_END:
        return {start: Math.max(start - threshold, 0), end: end + threshold};
    }
  }

  private _moveNearEnteredToExactEntered(exactEntered: TimedItem[]) {
    exactEntered.forEach((timedItem) => {
      const activeItem = this._activeItems.get(timedItem.id);
      if (activeItem) {
        activeItem.exact = true;
      }
    });
  }

  resetEnteredItems(ids?: TimedItem['id'][]): void {
    if (ids) {
      for (const id of ids) {
        this._activeItems.delete(id);
        this._ineligibleItems.delete(id);
      }
    } else {
      this._activeItems.clear();
      this._ineligibleItems.clear();
    }
  }

  destroy(): void {
    freeObserver(this._onEvent$);
    this._destroyBreaker.destroy();
    this._ineligibleItems.clear();
  }
}
