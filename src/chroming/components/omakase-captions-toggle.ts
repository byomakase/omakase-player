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
import {getPlayerTextApi, type PlayerApi, type PlayerDetachedApi} from '../../player/player-api';
import type {PlayerTextCommonApi} from '../../player/player-text-api';
import {PlayerTextEventType} from '../../player/player-text-api';
import {PlayerTextType} from '../../player/player-text';
import {ObserverBreaker} from '../../common/observer-breaker';
import {DomUtil} from '../../dom/dom-util';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

const captionsStateProperty = 'omakaseCaptionsState';

const iconClasses = {
  on: 'media-chrome-text-on',
  off: 'media-chrome-text-off',
  disabled: 'disabled',
};

export type OmakaseCaptionsState = 'on' | 'off' | 'disabled';

export class OmakaseCaptionsToggle extends ControlBarComponent(MediaChromeButton) {
  private _player: PlayerApi | PlayerDetachedApi | undefined;
  private _text: PlayerTextCommonApi | undefined;
  protected _playerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  override connectedCallback() {
    super.connectedCallback();
    this.updateIcon();
  }

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
    this._text = player ? getPlayerTextApi(player) : undefined;
    this._playerBreaker.break();
    this.updateCaptionsState();
    if (this._text) {
      this._text.onEvent$
        .pipe(
          filter((event) => event.type === PlayerTextEventType.PLAYER_TEXT_CHANGE),
          takeUntil(this._playerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: () => {
            this.updateCaptionsState();
          },
        });
    }
  }

  /**
   * @type {OmakaseCaptionsState | undefined}
   */
  get captionsState(): OmakaseCaptionsState | undefined {
    return DomUtil.getAttribute(this, captionsStateProperty) as OmakaseCaptionsState | undefined;
  }

  set captionsState(value: OmakaseCaptionsState | undefined) {
    DomUtil.setAttribute(this, captionsStateProperty, value);
    this.updateIcon();
    this.updateAriaLabel();
  }

  override handleClick(): void {
    if (this._text) {
      this._text.toggleShowHide();
    }
    this.blur();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyBreaker.destroy();
  }

  private updateCaptionsState() {
    const tracks = this._text?.state.tracks;
    const activeTrack = tracks ? (tracks[PlayerTextType.MAIN].find((t) => t.active) ?? tracks[PlayerTextType.SIDECAR].find((t) => t.active)) : undefined;
    this.captionsState = activeTrack ? (activeTrack.shown ? 'on' : 'off') : 'disabled';
  }

  private updateIcon() {
    const state = this.captionsState ?? 'disabled';
    let icon = this.querySelector<HTMLElement>(':scope > span');
    if (!icon) {
      icon = document.createElement('span');
      icon.classList.add(iconClasses.on);
      this.appendChild(icon);
    }
    if (state === 'disabled') {
      icon.classList.add(iconClasses.disabled);
    } else {
      icon.classList.remove(iconClasses.disabled);
      icon.classList.toggle(iconClasses.on, state === 'on');
      icon.classList.toggle(iconClasses.off, state === 'off');
    }
  }

  private updateAriaLabel() {
    const label = this.captionsState === 'on' ? 'hide captions' : 'show captions';
    this.setAttribute('aria-label', label);
  }
}
