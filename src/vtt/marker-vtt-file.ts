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
import {MarkerVttCue, OmakaseVttCueExtension} from '../types';
import {map, Observable} from 'rxjs';
import Decimal from 'decimal.js';
import {VttCueParsed} from './model';
import {VttLoadOptions} from '../api/vtt-aware-api';

export class MarkerVttFile extends BaseOmakaseRemoteVttFile<MarkerVttCue> {
  protected constructor(url: string, options: VttLoadOptions) {
    super(url, options);
  }

  static create(url: string, options: VttLoadOptions): Observable<MarkerVttFile> {
    let instance = new MarkerVttFile(url, options);
    return instance.fetch().pipe(
      map((result) => {
        return instance;
      })
    );
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): MarkerVttCue {
    return {
      index: index,
      id: vttCueParsed.identifier,
      startTime: new Decimal(vttCueParsed.start).toDecimalPlaces(3).toNumber(),
      endTime: new Decimal(vttCueParsed.end).toDecimalPlaces(3).toNumber(),
      text: vttCueParsed.text,
      extension: cueExtension,
    };
  }
}
