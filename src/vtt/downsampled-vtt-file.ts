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
import {OmakaseVttCue} from '../types';
import {DownsampleConfig, DownsampleStrategy, VttLoadOptions} from '../api/vtt-aware-api';

export abstract class DownsampledVttFile<T extends OmakaseVttCue> extends BaseOmakaseRemoteVttFile<T> {
  protected _downsampleConfig?: DownsampleConfig;
  protected _supportedDownsampleStrategies: DownsampleStrategy[] = ['none'];

  protected constructor(url: string, options: VttLoadOptions) {
    super(url, options);
    this._downsampleConfig = options.downsampleConfig;
  }

  protected override downsampleCues(cues: T[]): T[] {
    if (this._downsampleConfig?.downsampleStrategy) {
      if (!this._supportedDownsampleStrategies.includes(this._downsampleConfig.downsampleStrategy)) {
        throw new Error('Downsampling strategy not supported: ' + this._downsampleConfig.downsampleStrategy);
      }
      if (this._downsampleConfig.downsampleStrategy === 'none') {
        return cues;
      }
    } else {
      return cues;
    }

    let samplePeriodDuration = (this._downsampleConfig?.downsamplePeriod ?? 1000) / 1000; // in seconds
    let periodBoundary = samplePeriodDuration / 1000; // in seconds

    let firstCue = cues[0];

    if (!firstCue) {
      return [];
    } else {
      let firstCueDuration = firstCue.endTime - firstCue.startTime;
      if (firstCueDuration >= samplePeriodDuration - periodBoundary) {
        return cues;
      }
    }

    let cuesSampled: T[] = [];
    let nextSampleStart = 0;
    let sampleIndex = 0;
    let currentSampleCues: T[] = [];

    cues.forEach((cue, index) => {
      let currentSampleStart = nextSampleStart;
      while (cue.startTime >= nextSampleStart + samplePeriodDuration) {
        nextSampleStart += samplePeriodDuration;
      }

      if (currentSampleStart === nextSampleStart) {
        currentSampleCues.push(cue);
      } else {
        if (currentSampleCues && currentSampleCues.length > 0) {
          cuesSampled.push(this.resolveDownsampledCue(sampleIndex++, currentSampleStart, nextSampleStart - periodBoundary, currentSampleCues));
        }
        currentSampleCues = [];
        currentSampleCues.push(cue);
      }

      if (index === cues.length - 1 && currentSampleCues.length > 0) {
        cuesSampled.push(this.resolveDownsampledCue(sampleIndex++, currentSampleStart, currentSampleStart + samplePeriodDuration - periodBoundary, currentSampleCues));
      }
    });

    return cuesSampled;
  }

  protected abstract resolveDownsampledCue(index: number, startTime: number, endTime: number, cues: T[]): T;
}
