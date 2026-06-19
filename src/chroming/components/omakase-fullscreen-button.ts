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
import type {PlayerInternalApi} from '../../player';

export class OmakaseFullscreenButton extends MediaFullscreenButton {
  private _player: PlayerInternalApi | undefined;

  get player() {
    return this._player;
  }

  set player(player: PlayerInternalApi | undefined) {
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
