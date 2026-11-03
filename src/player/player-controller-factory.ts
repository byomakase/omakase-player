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
import {TamsPlayerController} from '../tams/tams-player-controller';
import type {PlayerControllerConfigMap} from './player-api';
import {SlatePlayerController, type SlatePlayerControllerConfig} from '../slate/slate-player-controller';
import {FrameImagePlayerController, type FrameImagePlayerControllerConfig} from '../frame-image/frame-image-player-controller';
import {CompositePlayerController} from './composite-player-controller';
import {CompositePlaybackDomController} from './composite-playback-dom-controller';
import {ClockPlayerController} from '../virtual/clock-player-controller';
import type {PlayerControllerConfig} from './player-controller';

export class PlayerControllerFactory {
  static create<T extends MainMediaType>(mainMediaType: T, playerDomController: PlayerDomController, config?: Partial<PlayerControllerConfigMap[T]>): PlayerController {
    switch (mainMediaType) {
      case MainMediaType.HLS:
        return this.createComposite(new HlsPlayerController(playerDomController, config as Partial<HlsPlayerControllerConfig>), playerDomController, config);
      case MainMediaType.MP4:
        return this.createComposite(new Mp4PlayerController(playerDomController, config as Mp4PlayerControllerConfig), playerDomController, config);
      case MainMediaType.AUDIO_FILE:
        return new AudioFilePlayerController(playerDomController, config as AudioFilePlayerControllerConfig);
      case MainMediaType.TAMS:
        return this.createComposite(new TamsPlayerController(playerDomController, config as Partial<HlsPlayerControllerConfig>), playerDomController, config);
      case MainMediaType.SLATE:
        return SlatePlayerController.createMounted(playerDomController, config as Partial<SlatePlayerControllerConfig>);
      case MainMediaType.FRAME_IMAGE:
        return FrameImagePlayerController.createMounted(playerDomController, config as Partial<FrameImagePlayerControllerConfig>);
      default:
        throw new Error(`Unsupported media type: ${mainMediaType}`);
    }
  }

  /**
   * Video element can't play backwards nor faster than {@link SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate}, video element controller is played
   * together with headless clock controller at such playback rates, see {@link CompositePlayerController}.
   */
  protected static createComposite(forward: PlayerController, playerDomController: PlayerDomController, config?: Partial<PlayerControllerConfig>): CompositePlayerController {
    let composite = new CompositePlayerController(forward, new ClockPlayerController(playerDomController), {
      seekStep: config?.seekStep,
      minSeekInterval: config?.minSeekInterval,
    });
    // media-chrome follows composite at every playback rate, wired once
    composite.attachPlaybackDomController(CompositePlaybackDomController.mountAlongside(playerDomController));
    return composite;
  }
}
