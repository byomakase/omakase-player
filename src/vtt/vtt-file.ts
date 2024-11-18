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

import {from, map, Observable} from 'rxjs';
import {httpGet} from '../http';
import {OmakaseVttCue, OmakaseVttCueExtension} from '../types';
import {AxiosRequestConfig} from 'axios';
import {VttCueParsed, VttFileParsed} from './model';
import {VttUtil} from './vtt-util';
import {StringUtil} from '../util/string-util';
import {VttLoadOptions} from '../api/vtt-aware-api';

export enum OmakaseWebVttExtensionVersion {
  V1_0 = 'V1.0'
}

export interface OmakaseRemoteVttFile<T extends OmakaseVttCue> extends OmakaseVttFile<T> {
  get url(): string;
}

export interface OmakaseVttFile<T extends OmakaseVttCue> {
  get extensionVersion(): OmakaseWebVttExtensionVersion | undefined;

  get cues(): T[];

  get hasCues(): boolean;

  /**
   * @returns first cue that intersects given time frame
   * @param time
   */
  findCue(time: number): T | undefined;

  /**
   * @returns cues that intersect given time frame
   * @param startTime
   * @param endTime
   */
  findCues(startTime: number, endTime: number | undefined): T[]
}

export abstract class BaseOmakaseVttFile<T extends OmakaseVttCue> implements OmakaseVttFile<T> {
  protected _extensionVersion?: OmakaseWebVttExtensionVersion;
  protected _cues: T[] = [];
  protected _cuesByStartTime: Map<number, T[]> = new Map<number, T[]>();
  protected _cuesStartTimesSorted: number[] = [];

  protected constructor() {

  }

  protected abstract mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): T;

  protected parseAndPopulate(vttText: string): void {
    try {
      let vttFileParsed: VttFileParsed = VttUtil.parseVtt(vttText);

      this._extensionVersion = this.resolveExtensionVersion(vttFileParsed);

      this.downsampleCues(vttFileParsed.cues.map((parsedCue, index) => {
        let cueExtension = this._extensionVersion ? VttUtil.parseVttCueExtension(parsedCue, this._extensionVersion) : void 0;
        return this.mapCue(parsedCue, cueExtension, index);
      })).forEach(cue => {
        this._cues.push(cue);
        this._cuesStartTimesSorted.push(cue.startTime);

        let cuesWithStartTime = this._cuesByStartTime.get(cue.startTime);
        cuesWithStartTime = cuesWithStartTime ? cuesWithStartTime.concat(cue) : [cue];

        this._cuesByStartTime.set(cue.startTime, cuesWithStartTime);
      })

      this.refreshSorted();

    } catch (e) {
      console.error(e);
    }
  }

  protected resolveExtensionVersion(vttFileParsed: VttFileParsed): OmakaseWebVttExtensionVersion | undefined {
    if (StringUtil.isNonEmpty(vttFileParsed.note)) {
      let noteRowsMatch = vttFileParsed.note!.match(/^(.*?)(?:\r?\n|\r)(.*)/);
      if (noteRowsMatch) {
        let firstLine = noteRowsMatch[1];
        let secondLine = noteRowsMatch[2];
        if (firstLine.trim() === 'Omakase Player Web VTT' && secondLine.trim() === 'V1.0') {
          return OmakaseWebVttExtensionVersion.V1_0;
        }
      }
    }
    return void 0;
  }

  /**
   * Prevents cues (and memory) ddos
   *
   * @param cues
   * @protected
   */
  protected downsampleCues(cues: T[]): T[] {
    return cues;
  }

  get cues(): T[] {
    return [...this._cues.values()];
  }

  get hasCues() {
    return this._cues && this._cues.length > 0;
  }

  get extensionVersion(): OmakaseWebVttExtensionVersion | undefined {
    return this._extensionVersion;
  }

  findCue(time: number): T | undefined {
    let cues = this.findCues(time, time);
    if (cues && cues.length > 0) {
      return cues[0];
    } else {
      return void 0;
    }
  }

  findCues(startTime: number, endTime: number): T[] {
    let cuesStartTimesFirstIndex = this.findCuesStartTimesFirstIndex(startTime);

    let resultCues: Set<T> = new Set<T>();

    if (cuesStartTimesFirstIndex > -1) {
      for (let i = cuesStartTimesFirstIndex; i < this._cuesStartTimesSorted.length; i++) {
        let cueStartTime = this._cuesStartTimesSorted[i];

        if (cueStartTime <= endTime) {
          let cues = this._cuesByStartTime.get(cueStartTime);
          if (cues) {
            cues.forEach(cue => {
              resultCues.add(cue);
            })
          }
        } else {
          break;
        }
      }
    }

    return [...resultCues.values()];
  }

  findNearestCue(time: number): T | undefined {
    const cues = this._cues.sort((a, b) => this.getCueDistance(a, time) - this.getCueDistance(b, time))
    return cues[0];
  }

  /**
   * Binary search for closest cue index in _cuesStartTimesSorted
   * @param time
   * @private
   */
  private findCuesStartTimesFirstIndex(time: number): number {
    let startIndex = 0;
    let endIndex = this._cuesStartTimesSorted.length - 1;
    while (startIndex <= endIndex) {
      const mid = Math.floor((startIndex + endIndex) / 2);

      if (this._cuesStartTimesSorted[mid] === time) {
        return mid;
      } else if (this._cuesStartTimesSorted[mid] < time) {
        startIndex = mid + 1;
      } else {
        endIndex = mid - 1;
      }
    }

    // Handle boundary cases and return the closest index
    if (startIndex >= this._cuesStartTimesSorted.length) {
      return endIndex; // Time is beyond the largest cue
    }

    if (endIndex < 0) {
      return startIndex; // Time is smaller than the smallest cue
    }

    // Return the closest between startIndex and endIndex
    return (time - this._cuesStartTimesSorted[endIndex] <= this._cuesStartTimesSorted[startIndex] - time)
      ? endIndex
      : startIndex;
  }

  private refreshSorted() {
    [this._cuesStartTimesSorted].forEach(cuesKeys => cuesKeys.sort((a, b) => {
      return a - b;
    }));
  }

  private getCueDistance(cue: T, time: number) {
    if (cue.startTime <= time && cue.endTime >= time) {
      return 0;
    } else if (cue.startTime > time) {
      return cue.startTime - time;
    } else {
      return time - cue.endTime;
    }
  }

}

export abstract class BaseOmakaseRemoteVttFile<T extends OmakaseVttCue> extends BaseOmakaseVttFile<T> implements OmakaseRemoteVttFile<T> {
  private _url: string;
  private _axiosConfig?: AxiosRequestConfig;

  protected constructor(url: string, options: VttLoadOptions) {
    super();
    this._url = url;
    this._axiosConfig = options.axiosConfig;
  }

  fetch(): Observable<boolean> {
    return from(httpGet<string, AxiosRequestConfig>(this.url, this._axiosConfig)).pipe(map(result => {
      let vttFileText = result.data;

      try {
        this.parseAndPopulate(vttFileText);

        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    }))
  }

  get url(): string {
    return this._url;
  }
}
