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
import type {PlayerInternalApi} from '../../player';
import type {UiLiveModel} from '../../live/live-model';

/**
 * Live indicator + "go to live" control. Fully custom (extends {@link MediaChromeButton}).
 *  Shown only for live media; lit while pinned to the live edge and dimmed when scrubbed back.
 * Clicking seeks to `syncPosition` (the player clamps to live).
 */
export class OmakaseLiveButton extends MediaChromeButton {
  static getSlotTemplateHTML(): string {
    return `
      <style>
        :host {
          --media-tooltip-display: none;
          cursor: pointer;
          /* Match the control-bar text components (e.g. speed control): Lato, same theme override var. */
          font-family: var(--dropdown-font-family, 'Lato');

        }
        .omakase-live-indicator {
          display: inline-block;
          flex: none;
          width: var(--omakase-live-button-indicator-size, 8px);
          height: var(--omakase-live-button-indicator-size, 8px);
          border-radius: 50%;
          margin-right: 6px;
          background: var(--omakase-live-button-live-color, rgb(255, 0, 0));
        }
        /* DVR (not pinned to live): grey the dot to signal you're behind the edge; click jumps back to live. */
        :host([dvr]) .omakase-live-indicator {
          background: var(--omakase-live-button-dvr-color, rgb(128, 128, 128));
        }
        .omakase-live-text {
          text-transform: uppercase;
        }
      </style>
      <span class="omakase-live-indicator" aria-hidden="true"></span>
      <slot name="text" class="omakase-live-text">LIVE</slot>
    `;
  }

  private _player: PlayerInternalApi | undefined;

  private _live = false;
  private _syncPosition = 0;

  get player(): PlayerInternalApi | undefined {
    return this._player;
  }

  set player(player: PlayerInternalApi | undefined) {
    this._player = player;
  }

  setLiveModel(model: UiLiveModel): void {
    this._live = model.isLive;
    this._syncPosition = model.syncPosition;
    this.style.display = this._live ? '' : 'none';
    this.toggleAttribute('dvr', this._live && !model.pinnedToLive);
  }

  override handleClick(): void {
    if (this._player && this._live) {
      if (this._player?.playerSession.playback.paused || this._player.playerSession.playback.pausing) {
        this._player?.play().subscribe(() => this._player?.seekTo(this._syncPosition));
      } else {
        this._player.seekTo(this._syncPosition).subscribe(() => {});
      }
    }
  }
}
