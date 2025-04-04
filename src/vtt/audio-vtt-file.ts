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

import {AudioVttCue, OmakaseVttCueExtension} from '../types';
import {map, Observable} from 'rxjs';
import {z} from 'zod';
import Decimal from 'decimal.js';
import {VttCueParsed} from './model';
import {DownsampleStrategy, VttLoadOptions} from '../api/vtt-aware-api';
import {DownsampledVttFile} from './downsampled-vtt-file';

export class AudioVttFile extends DownsampledVttFile<AudioVttCue> {
  protected override _supportedDownsampleStrategies: DownsampleStrategy[] = ['none', 'avg', 'max', 'min', 'drop'];

  protected constructor(url: string, options: VttLoadOptions) {
    super(url, options);
  }

  protected override resolveDownsampledCue(index: number, startTime: number, endTime: number, cues: AudioVttCue[]): AudioVttCue {
    const [maxSample, minSample] = this.getMaxMinSample(cues);
    return {
      index: index,
      id: `SAMPLED_${index}`,
      startTime: startTime,
      endTime: endTime,
      text: `SAMPLED`,
      minSample: minSample,
      maxSample: maxSample,
      extension: {
        rows: [
          {
            measurement: 'min',
            value: `${minSample}`,
            comment: 'SAMPLED',
          },
          {
            measurement: 'max',
            value: `${maxSample}`,
            comment: 'SAMPLED',
          },
        ],
      },
    };
  }

  private getMaxMinSample(cues: AudioVttCue[]): [number, number] {
    let maxSample, minSample;
    switch (this._downsampleConfig?.downsampleStrategy) {
      case 'max':
        maxSample = cues.reduce((max, obj) => Math.max(max, obj.maxSample), cues[0].maxSample);
        minSample = cues.reduce((max, obj) => Math.min(max, obj.minSample), cues[0].minSample);
        return [maxSample, minSample];
      case 'min':
        maxSample = cues.reduce((max, obj) => Math.min(max, obj.maxSample), cues[0].maxSample);
        minSample = cues.reduce((max, obj) => Math.max(max, obj.minSample), cues[0].minSample);
        return [maxSample, minSample];
      case 'avg':
        maxSample = cues.reduce((sum, obj) => sum + obj.maxSample, 0) / cues.length;
        minSample = cues.reduce((sum, obj) => sum + obj.minSample, 0) / cues.length;
        return [maxSample, minSample];
      case 'drop':
        maxSample = cues[0].maxSample;
        minSample = cues[0].minSample;
        return [maxSample, minSample];
      default:
        throw new Error('Usupported downsampling strategy: ' + this._downsampleConfig?.downsampleStrategy);
    }
  }

  static create(url: string, options: VttLoadOptions): Observable<AudioVttFile> {
    let instance = new AudioVttFile(url, options);
    return instance.fetch().pipe(
      map((result) => {
        return instance;
      })
    );
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): AudioVttCue {
    let minSampleText: string | undefined;
    let maxSampleText: string | undefined;

    if (cueExtension && cueExtension.rows && cueExtension.rows.length > 0) {
      minSampleText = cueExtension.rows.find((p) => p.measurement === 'min')?.value;
      maxSampleText = cueExtension.rows.find((p) => p.measurement === 'max')?.value;
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
      minSample: z.coerce.number().min(-1).max(0).catch(0).parse(minSampleText),
      maxSample: z.coerce.number().min(0).max(1).catch(0).parse(maxSampleText),
      extension: cueExtension,
    };
  }
}
