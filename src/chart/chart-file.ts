/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {OgChart, OgChartCue, OmakaseChartFile} from '../types';

/**
 * @deprecated
 */
export class BarChartFile implements OmakaseChartFile<OgChart> {
  private _chart: OgChart;
  private _cues: Map<number, OgChartCue> = new Map<number, OgChartCue>();
  private _cuesKeysSorted: number[] = [];

  constructor(chart: OgChart) {
    this._chart = chart;

    this._chart.cues.forEach(cue => {
      this._cues.set(cue.startTime, cue);
      this._cuesKeysSorted.push(cue.startTime);
    })

    this._cuesKeysSorted.sort((a, b) => {
      return a - b;
    });
  }

  get cues(): OgChartCue[] {
    return [...this._cues.values()];
  }

  hasCues() {
    return this._cues && this._cues.size > 0;
  }

  findCue(time: number): OgChartCue | undefined {
    let cues = this.findCues(time, time);
    if (cues && cues.length === 1) {
      return cues[0];
    } else {
      return void 0;
    }
  }

  findCues(startTime: number, endTime: number): OgChartCue[] {
    let startIndex = this.findCueIndex(startTime);
    let endIndex = this.findCueIndex(endTime);
    if (endIndex === -1) {
      return [];
    }
    return this._cuesKeysSorted.slice(startIndex, endIndex + 1)
      .map(startTime => this._cues.get(startTime)!) // safe ! because cuesKeys values always correspond to keys in cue map
      ;
  }

  protected findCueIndex(time: number): number {
    let startIndex = 0;
    let endIndex = this._cuesKeysSorted.length - 1;
    while (startIndex <= endIndex) {
      const mid = Math.floor((startIndex + endIndex) / 2);
      if (this._cuesKeysSorted[mid] === time) {
        return mid;
      } else if (this._cuesKeysSorted[mid] < time) {
        startIndex = mid + 1;
      } else {
        endIndex = mid - 1;
      }
    }
    if (endIndex === -1) {
      endIndex = 0;
    }
    return endIndex;
  }
}
