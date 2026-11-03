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

import {MediaPlayButton} from 'media-chrome';
import {filter, takeUntil} from 'rxjs';
import {PlayerEventType, type PlayerApi, type PlayerDetachedApi} from '../../player';
import {ObserverBreaker} from '../../common/observer-breaker';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

export class OmakasePlayButton extends ControlBarComponent(MediaPlayButton) {
  private _player: PlayerApi | PlayerDetachedApi | undefined;
  protected _playerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
    this._playerBreaker.break();
    if (this._player) {
      this.mediaPaused = !this._player.playerSession.playback.playing;
      this._player.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_PLAY || event.type === PlayerEventType.PLAYER_PAUSE),
          takeUntil(this._playerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe((event) => {
          this.mediaPaused = event.type === PlayerEventType.PLAYER_PAUSE;
        });
    }
  }

  override handleClick(): void {
    if (this._player) {
      if (this._player.playerSession.playback.playing) {
        this._player.pause();
      } else {
        this._player.play();
      }
    } else {
      super.handleClick();
    }
    this.blur();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyBreaker.destroy();
  }
}
