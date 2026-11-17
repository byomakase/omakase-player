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
import {BasePlayerPlaybackEngine, type PlayerPlaybackEngine} from '../player/player-playback-engine';
import type {PlayerController} from '../player';

export interface Mp4PlayerPlaybackEngine extends PlayerPlaybackEngine<MainMediaType.MP4> {}

export class Mp4PlayerPlaybackEngineImpl extends BasePlayerPlaybackEngine<MainMediaType.MP4> implements Mp4PlayerPlaybackEngine {
  readonly mainMediaType = MainMediaType.MP4;

  constructor(playerController: PlayerController) {
    super(playerController);
  }
}
