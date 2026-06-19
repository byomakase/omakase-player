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
import type {HlsPlayerPlaybackEngine} from '../hls';
import type {Mp4PlayerPlaybackEngine} from '../mp4';
import type {PlayerController} from './player-controller-api';
import type {AudioFilePlayerPlaybackEngine} from '../audio/audio-file-playback-engine';

export type PlayerPlaybackEngineMapping = {
  [MainMediaType.HLS]: HlsPlayerPlaybackEngine;
  [MainMediaType.MP4]: Mp4PlayerPlaybackEngine;
  [MainMediaType.AUDIO_FILE]: AudioFilePlayerPlaybackEngine;
};

export interface PlayerPlaybackEngine {}

export abstract class BasePlayerPlaybackEngine implements PlayerPlaybackEngine {
  protected readonly _playerController: PlayerController;

  protected constructor(playerController: PlayerController) {
    this._playerController = playerController;
  }
}
