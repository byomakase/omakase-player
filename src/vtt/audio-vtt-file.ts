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
import {AudioVttCue, OmakaseVttCueExtension} from '../types';
import {map, Observable} from 'rxjs';
import {z} from 'zod';
import Decimal from 'decimal.js';
import {AxiosRequestConfig} from 'axios';
import {VttCueParsed} from './model';

export class AudioVttFile extends BaseOmakaseRemoteVttFile<AudioVttCue> {

  protected constructor(url: string, axiosConfig?: AxiosRequestConfig) {
    super(url, axiosConfig);
  }

  static create(url: string, axiosConfig?: AxiosRequestConfig): Observable<AudioVttFile> {
    let instance = new AudioVttFile(url, axiosConfig);
    return instance.fetch().pipe(map(result => {
      return instance;
    }))
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): AudioVttCue {
    let minSampleText: string | undefined;
    let maxSampleText: string | undefined;

    if (cueExtension && cueExtension.rows && cueExtension.rows.length > 0) {
      minSampleText = cueExtension.rows.find(p => p.measurement === 'min')?.value;
      maxSampleText = cueExtension.rows.find(p => p.measurement === 'max')?.value;
    } else {
      let splitted = vttCueParsed.text.split(',');
      minSampleText = splitted[0];
      maxSampleText = splitted[1];
    }

    return {
      index: index,
      id: vttCueParsed.identifier,
      startTime: new Decimal(vttCueParsed.start).toDecimalPlaces(3).toNumber(),
      endTime: new Decimal(vttCueParsed.end).toDecimalPlaces(3).toNumber(),
      text: vttCueParsed.text,
      minSample: z.coerce.number()
        .min(-1)
        .max(0)
        .catch(0)
        .parse(minSampleText),
      maxSample: z.coerce.number()
        .min(0)
        .max(1)
        .catch(0)
        .parse(maxSampleText),
      extension: cueExtension
    }
  }
}
