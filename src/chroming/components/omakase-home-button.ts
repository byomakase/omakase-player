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
import type {PlayerApi, PlayerDetachedApi} from '../../player';
import {ChromingDomClasses} from '../chroming-dom';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

export class OmakaseHomeButton extends ControlBarComponent(MediaChromeButton) {
  private _player: PlayerApi | PlayerDetachedApi | undefined;
  private _iconSpan: HTMLSpanElement | undefined;
  private _tooltip: HTMLElement | undefined;

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this._iconSpan) {
      this._iconSpan = document.createElement('span');
      this._iconSpan.className = ChromingDomClasses.mediaChromeHome;
      this.appendChild(this._iconSpan);
    }
    if (!this._tooltip) {
      this._tooltip = document.createElement('media-tooltip');
      this._tooltip.textContent = 'Go to start';
      this.appendChild(this._tooltip);
    }
  }

  override handleClick(): void {
    if (this._player) {
      const player = this._player;
      player.pause().subscribe(() => {
        player.seekTo(0).subscribe();
      });
    } else {
      super.handleClick(undefined);
    }
    this.blur();
  }
}
