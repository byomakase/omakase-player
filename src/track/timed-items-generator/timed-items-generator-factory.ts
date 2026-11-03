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

import {AudioObservationType, type Track, TrackType} from '../../media';
import type {TrackGenerationOptions} from '../track-load-options';
import type {TimedItemsGenerator} from './timed-items-generator';
import {OmpError} from '../../types';
import {AudioLevelItemsGenerator, AudioWaveformItemsGenerator} from './default-timed-items-generator';
import {SourceUtil} from '../../source';

export class TimedItemsGeneratorFactory {
  public static createTimedItemsGenerator(track: Track, generationOptions?: TrackGenerationOptions | undefined): TimedItemsGenerator {
    let trackType = track.trackType;
    switch (trackType) {
      case TrackType.AUDIO:
        return this.createAudioObservationItemsGenerator(track, generationOptions);
      default:
        throw new OmpError(`Unsupported track type: ${track.trackType}`);
    }
  }

  private static createAudioObservationItemsGenerator(track: Track, generationOptions?: TrackGenerationOptions | undefined): TimedItemsGenerator {
    if (!track.source) {
      throw new OmpError('Audio.source not defined');
    }

    let url = SourceUtil.resolveUrlFromSourceOrFail(track.source);
    let observationType = generationOptions?.observationType ?? AudioObservationType.WAVEFORM;
    switch (observationType) {
      case AudioObservationType.WAVEFORM:
        return new AudioWaveformItemsGenerator(url, generationOptions);
      case AudioObservationType.LEVELS:
        return new AudioLevelItemsGenerator(url, generationOptions);
      default:
        throw new OmpError(`Unknown audio observation type: ${observationType}`);
    }
  }
}
