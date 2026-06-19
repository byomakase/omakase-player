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

import {MediaChromeRange} from 'media-chrome';
import {takeUntil, filter} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import type {PlayerInternalApi} from '../../player/player-api';
import {PlayerEventType} from '../../player/player-event';

export class OmakaseVolumeRange extends MediaChromeRange {
  private _player: PlayerInternalApi | undefined;
  protected _destroyBreaker = new ObserverBreaker();

  get player() {
    return this._player;
  }

  set player(player: PlayerInternalApi | undefined) {
    this._player = player;
    if (this._player) {
      this._player.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_AUDIO_CHANGE),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe(() => {
          this.setVolume(this._player!.audioInternal.volume);
        });
    }
  }

  constructor() {
    super();
    this.range.addEventListener('input', () => {
      if (this._player) {
        this._player.audioInternal.setVolume(parseFloat(this.range.value));
      }
    });
    (this.shadowRoot!.querySelector('#progress') as HTMLDivElement).style.borderRadius = `var(--media-range-progress-border-radius, 0)`;
  }

  setVolume(value: number) {
    this.range.valueAsNumber = value;
    this.range.setAttribute('aria-valuetext', `${Math.round(value * 100)}%`);
    this.updateBar();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.range.setAttribute('aria-label', 'volume');
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyBreaker.destroy();
  }
}
