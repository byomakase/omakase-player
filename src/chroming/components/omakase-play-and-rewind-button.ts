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

import {MediaChromeButton} from 'media-chrome';
import {filter, takeUntil} from 'rxjs';
import type {PlayerApi, PlayerDetachedApi} from '../../player';
import {PlayerEventType} from '../../player/player-event';
import {ObserverBreaker} from '../../common/observer-breaker';
import {ChromingDomClasses} from '../chroming-dom';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

export const OmakasePlayAndRewindButtonAttributes = {
  DURATION: 'duration',
};

const DEFAULT_DURATION_SECONDS = 10;

export class OmakasePlayAndRewindButton extends ControlBarComponent(MediaChromeButton) {
  static get observedAttributes() {
    return [...super.observedAttributes, OmakasePlayAndRewindButtonAttributes.DURATION];
  }

  private _player: PlayerApi | PlayerDetachedApi | undefined;
  private _iconSpan: HTMLSpanElement | undefined;
  private _tooltip: HTMLElement | undefined;
  protected _playerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();
  protected _watchBreaker = new ObserverBreaker();

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
    this._playerBreaker.break();
  }

  get duration(): number {
    const value = Number(this.getAttribute(OmakasePlayAndRewindButtonAttributes.DURATION));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_DURATION_SECONDS;
  }

  set duration(value: number) {
    this.setAttribute(OmakasePlayAndRewindButtonAttributes.DURATION, `${value}`);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this._iconSpan) {
      this._iconSpan = document.createElement('span');
      this._iconSpan.className = ChromingDomClasses.mediaChromePlayAndRewind;
      this.appendChild(this._iconSpan);
    }
    if (!this._tooltip) {
      this._tooltip = document.createElement('media-tooltip');
      this.appendChild(this._tooltip);
    }
    this.render();
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakasePlayAndRewindButtonAttributes.DURATION) {
      this.render();
    }
  }

  override handleClick(): void {
    if (this._player) {
      const player = this._player;
      const originalTime = player.getCurrentTime();
      const playTarget = Math.min(player.getDuration(), originalTime + this.duration);
      this._watchBreaker.break();
      player.play().subscribe(() => {
        player.onEvent$
          .pipe(
            filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS),
            takeUntil(this._watchBreaker.observer),
            takeUntil(this._playerBreaker.observer),
            takeUntil(this._destroyBreaker.observer)
          )
          .subscribe(() => {
            if (player.getCurrentTime() >= playTarget) {
              this._watchBreaker.break();
              player.pause().subscribe(() => {
                player.seekTo(originalTime).subscribe();
              });
            }
          });
      });
    } else {
      super.handleClick(undefined);
    }
    this.blur();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._destroyBreaker.destroy();
  }

  private render(): void {
    if (!this._tooltip) {
      return;
    }
    this._tooltip.textContent = `Play ${this.duration}s and rewind to start position`;
  }
}
