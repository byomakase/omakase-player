/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import {from, map, Observable} from "rxjs";
import {httpGet} from "../http";
import {OmakaseVttCue, OmakaseVttFile} from "../types";
import webvtt from 'node-webvtt';
import {AxiosRequestConfig} from "axios";

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
  protected url: string;
  protected axiosConfig: AxiosRequestConfig;
  protected cues: Map<number, T> = new Map<number, T>();
  protected cuesKeysSorted: number[] = [];

  protected constructor(url: string, axiosConfig?: AxiosRequestConfig) {
    this.url = url;
    this.axiosConfig = axiosConfig;
  }

  fetch(): Observable<boolean> {
    return from(httpGet<string, AxiosRequestConfig>(this.getUrl(), this.axiosConfig)).pipe(map(result => {
      let vttFileText = result.data;

      try {
        let vttFileParsed: VttFileParsed = webvtt.parse(vttFileText, {strict: true, meta: true})

        vttFileParsed.cues.forEach(parsedCue => {
          let cue = this.mapCue(parsedCue);
          this.cues.set(cue.startTime, cue);
          this.cuesKeysSorted.push(cue.startTime);
        })

        this.cuesKeysSorted.sort((a, b) => {
          return a - b;
        });

        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    }))
  }

  protected abstract mapCue(vttCueParsed: VttCueParsed): T;

  getUrl() {
    return this.url;
  }

  hasCues() {
    return this.cues && this.cues.size > 0;
  }

  findCue(time: number): T {
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
    return this.cuesKeysSorted.slice(startIndex, endIndex + 1)
      .map(startTime => this.cues.get(startTime));
  }

  getCues(): T[] {
    return [...this.cues.values()];
  }

  protected findCueIndex(time: number): number {
    let startIndex = 0;
    let endIndex = this.cuesKeysSorted.length - 1;
    while (startIndex <= endIndex) {
      const mid = Math.floor((startIndex + endIndex) / 2);
      if (this.cuesKeysSorted[mid] === time) {
        return mid;
      } else if (this.cuesKeysSorted[mid] < time) {
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
