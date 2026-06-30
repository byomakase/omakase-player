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

import {
  DefaultObservation,
  type ObservationItem,
  type ObservationTrack,
  type ObservationTrackEvent,
  ObservationTrackFile,
  type ObservationTrackState,
  TimedItemTemporalType,
  type TrackTimedItem,
} from '../../media';
import {type InterpolationOptions, TimedItemsInterpolator} from './timed-items-interpolator';

export class ObservationTrackInterpolator extends TimedItemsInterpolator<ObservationTrack<ObservationTrackState, ObservationTrackEvent>> {
  constructor(sourceTrack: ObservationTrack<ObservationTrackState, ObservationTrackEvent>, options: InterpolationOptions) {
    super(sourceTrack, options);
  }

  protected createInterpolatedTrack(): ObservationTrack<ObservationTrackState, ObservationTrackEvent> {
    return new ObservationTrackFile();
  }

  protected resolveInterpolatedTimedItem(
    _index: number,
    start: number,
    end: number,
    timedItems: TrackTimedItem<ObservationTrack<ObservationTrackState, ObservationTrackEvent>>[]
  ): TrackTimedItem<ObservationTrack<ObservationTrackState, ObservationTrackEvent>> {
    const measurementValues: Map<ObservationItem['measurement'], number[]> = new Map();

    for (const timedItem of timedItems) {
      for (const item of timedItem.items) {
        if (item.value == null) continue;
        const num = parseFloat(item.value);
        if (isNaN(num)) continue;
        if (!measurementValues.has(item.measurement)) {
          measurementValues.set(item.measurement, []);
        }
        measurementValues.get(item.measurement)!.push(num);
      }
    }

    const items: ObservationItem[] = [...measurementValues.entries()].map(([measurement, values]) => ({
      measurement,
      value: String(this._getAggregateValue(values)),
      comment: 'INTERPOLATED',
    }));

    return new DefaultObservation({
      temporal: {type: TimedItemTemporalType.SPAN, start: String(start), end: String(end)},
      label: 'INTERPOLATED',
      items,
      data: {
        sourceItemIds: timedItems.map((item) => item.id),
      },
    });
  }

  private _getAggregateValue(values: number[]): number {
    switch (this._options.interpolationStrategy) {
      case 'max':
        return Math.max(...values);
      case 'min':
        return Math.min(...values);
      case 'avg':
      default:
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
  }
}
