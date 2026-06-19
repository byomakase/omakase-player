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

import type {MediaTemporalSeconds} from '../common';

export class TimeEventsScheduler {
  private _timeEvents: MediaTemporalSeconds['value'][];
  private _nextIndex = 0;
  private _tolerance: MediaTemporalSeconds['value'];
  private _lastTime = -Infinity;

  constructor(timeEvents: MediaTemporalSeconds['value'][], tolerance = 0) {
    this._timeEvents = [...timeEvents].sort((a, b) => a - b);
    this._tolerance = tolerance;
  }

  /** O(1) per tick, O(log n) on backward seek */
  findTimeEvents(currentTime: number): number[] {
    // Detect backward seek, reposition pointer via binary search
    if (currentTime < this._lastTime - this._tolerance) {
      this.reposition(currentTime);
    }
    this._lastTime = currentTime;

    if (this._nextIndex >= this._timeEvents.length) {
      return [];
    }

    const target = this._timeEvents[this._nextIndex]!;
    if (currentTime < target - this._tolerance) {
      return [];
    }

    // Collect all events reached this tick (handles clustered cues)
    const triggered: number[] = [];
    while (this._nextIndex < this._timeEvents.length && currentTime >= this._timeEvents[this._nextIndex]! - this._tolerance) {
      triggered.push(this._timeEvents[this._nextIndex]!);
      this._nextIndex++;
    }
    return triggered;
  }

  private reposition(currentTime: number): void {
    // Find first cue point not yet reachable at currentTime
    let lo = 0;
    let hi = this._timeEvents.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._timeEvents[mid]! <= currentTime + this._tolerance) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this._nextIndex = lo;
  }

  get timeEvents(): MediaTemporalSeconds['value'][] {
    return this._timeEvents;
  }
}
