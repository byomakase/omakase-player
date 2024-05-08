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
import {OmakaseRemoteVttFile, OmakaseVttCue, OmakaseVttFile} from '../types';

// @ts-ignore
import webvtt from 'node-webvtt';
import {AxiosRequestConfig} from 'axios';

export interface VttCueParsed {
  identifier: string;
  start: number;
  end: number;
  text: string;
  styles: string;
}

export interface VttFileMetaParsed {
  kind: string;
  language: string;
}

export interface VttFileParsed {
  valid: any
  meta: VttFileMetaParsed;
  cues: VttCueParsed[];
}

export abstract class BaseOmakaseVttFile<T extends OmakaseVttCue> implements OmakaseVttFile<T> {
  protected _cues: Map<number, T> = new Map<number, T>();
  protected _cuesKeysSorted: number[] = [];

  protected constructor() {

  }

  protected abstract mapCue(vttCueParsed: VttCueParsed, index: number): T;

  parseAndPopulate(vttText: string): void {
    try {
      let vttFileParsed: VttFileParsed = webvtt.parse(vttText, {strict: true, meta: true})

      vttFileParsed.cues.forEach((parsedCue, index) => {
        let cue = this.mapCue(parsedCue, index);
        this._cues.set(cue.startTime, cue);
        this._cuesKeysSorted.push(cue.startTime);
      })

      this._cuesKeysSorted.sort((a, b) => {
        return a - b;
      });
    } catch (e) {
      console.error(e);
    }
  }

  concat(vttFile: OmakaseVttFile<T>) {
    vttFile.cues.forEach(cue => {
      this._cues.set(cue.startTime, cue);
      this._cuesKeysSorted.push(cue.startTime);
    })

    this._cuesKeysSorted.sort((a, b) => {
      return a - b;
    });
  }

  concatAll(...vttFiles: OmakaseVttFile<T>[]) {
    vttFiles.forEach(vttFile => {
      vttFile.cues.forEach(cue => {
        this._cues.set(cue.startTime, cue);
        this._cuesKeysSorted.push(cue.startTime);
      })
    })

    this._cuesKeysSorted.sort((a, b) => {
      return a - b;
    });
  }

  get cues(): T[] {
    return [...this._cues.values()];
  }

  hasCues() {
    return this._cues && this._cues.size > 0;
  }

  findCue(time: number): T | undefined {
    let cues = this.findCues(time, time);
    if (cues && cues.length === 1) {
      return cues[0];
    } else {
      return void 0;
    }
  }

  findCues(startTime: number, endTime: number): T[] {
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

export abstract class BaseOmakaseRemoteVttFile<T extends OmakaseVttCue> extends BaseOmakaseVttFile<T> implements OmakaseRemoteVttFile<T> {
  private _url: string;
  private _axiosConfig?: AxiosRequestConfig;

  protected constructor(url: string, axiosConfig?: AxiosRequestConfig) {
    super();
    this._url = url;
    this._axiosConfig = axiosConfig;
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
