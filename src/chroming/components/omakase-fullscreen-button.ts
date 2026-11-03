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

import {MediaFullscreenButton} from 'media-chrome';
import type {PlayerApi, PlayerDetachedApi} from '../../player';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

export class OmakaseFullscreenButton extends ControlBarComponent(MediaFullscreenButton) {
  private _player: PlayerApi | PlayerDetachedApi | undefined;

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
  }

  override handleClick(e: Event): void {
    if (this._player) {
      this._player.toggleFullScreen();
    } else {
      super.handleClick(e);
    }
    this.blur();
  }
}
