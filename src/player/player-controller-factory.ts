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

import {MainMediaType} from '../media';
import {HlsPlayerController, type HlsPlayerControllerConfig} from '../hls';
import type {PlayerController, PlayerDomController} from './player-controller-api';
import {Mp4PlayerController, type Mp4PlayerControllerConfig} from '../mp4';
import {AudioFilePlayerController, type AudioFilePlayerControllerConfig} from '../audio/audio-file-player-controller';
import type {PlayerControllerConfigMap} from './player-api';

export class PlayerControllerFactory {
  static create<T extends MainMediaType>(mainMediaType: T, playerDomController: PlayerDomController, config?: Partial<PlayerControllerConfigMap[T]>): PlayerController {
    switch (mainMediaType) {
      case MainMediaType.HLS:
        return new HlsPlayerController(playerDomController, config as Partial<HlsPlayerControllerConfig>);
      case MainMediaType.MP4:
        return new Mp4PlayerController(playerDomController, config as Mp4PlayerControllerConfig);
      case MainMediaType.AUDIO_FILE:
        return new AudioFilePlayerController(playerDomController, config as AudioFilePlayerControllerConfig);
      default:
        throw new Error(`Unsupported media type: ${mainMediaType}`);
    }
  }
}