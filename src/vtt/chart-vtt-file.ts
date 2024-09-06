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

import {BaseOmakaseRemoteVttFile} from './vtt-file';
import {BarChartVttCue, LineChartVttCue, OgChartVttCue, OmakaseVttCueExtension} from '../types';
import {map, Observable} from 'rxjs';
import {z} from 'zod';
import Decimal from 'decimal.js';
import {AxiosRequestConfig} from 'axios';
import {VttCueParsed} from './model';

export class LineChartVttFile extends BaseOmakaseRemoteVttFile<LineChartVttCue> {

  protected constructor(url: string, axiosConfig?: AxiosRequestConfig) {
    super(url, axiosConfig);
  }

  static create(url: string, axiosConfig?: AxiosRequestConfig): Observable<LineChartVttFile> {
    let instance = new LineChartVttFile(url, axiosConfig);
    return instance.fetch().pipe(map(result => {
      return instance;
    }))
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): LineChartVttCue {
    return {
      index: index,
      id: vttCueParsed.identifier,
      startTime: new Decimal(vttCueParsed.start).toDecimalPlaces(3).toNumber(),
      endTime: new Decimal(vttCueParsed.end).toDecimalPlaces(3).toNumber(),
      text: vttCueParsed.text,
      value: z.coerce.number()
        .catch(0)
        .parse(cueExtension && cueExtension.rows && cueExtension.rows.length > 0 ? cueExtension.rows[0].value : vttCueParsed.text),
      extension: cueExtension
    }
  }

}

export class BarChartVttFile extends BaseOmakaseRemoteVttFile<BarChartVttCue> {

  protected constructor(url: string, axiosConfig?: AxiosRequestConfig) {
    super(url, axiosConfig);
  }

  static create(url: string, axiosConfig?: AxiosRequestConfig): Observable<BarChartVttFile> {
    let instance = new BarChartVttFile(url, axiosConfig);
    return instance.fetch().pipe(map(result => {
      return instance;
    }))
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): BarChartVttCue {
    return {
      index: index,
      id: vttCueParsed.identifier,
      startTime: new Decimal(vttCueParsed.start).toDecimalPlaces(3).toNumber(),
      endTime: new Decimal(vttCueParsed.end).toDecimalPlaces(3).toNumber(),
      text: vttCueParsed.text,
      value: z.coerce.number()
        .catch(0)
        .parse(cueExtension && cueExtension.rows && cueExtension.rows.length > 0 ? cueExtension.rows[0].value : vttCueParsed.text),
      extension: cueExtension
    }
  }

}

export class OgChartVttFile extends BaseOmakaseRemoteVttFile<OgChartVttCue> {

  protected constructor(url: string, axiosConfig?: AxiosRequestConfig) {
    super(url, axiosConfig);
  }

  static create(url: string, axiosConfig?: AxiosRequestConfig): Observable<OgChartVttFile> {
    let instance = new OgChartVttFile(url, axiosConfig);
    return instance.fetch().pipe(map(result => {
      return instance;
    }))
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): OgChartVttCue {
    return {
      index: index,
      id: vttCueParsed.identifier,
      startTime: new Decimal(vttCueParsed.start).toDecimalPlaces(3).toNumber(),
      endTime: new Decimal(vttCueParsed.end).toDecimalPlaces(3).toNumber(),
      text: vttCueParsed.text,
      value: z.coerce.number()
        .catch(0)
        .parse(cueExtension && cueExtension.rows && cueExtension.rows.length > 0 ? cueExtension.rows[0].value : vttCueParsed.text),
      extension: cueExtension
    }
  }

}
