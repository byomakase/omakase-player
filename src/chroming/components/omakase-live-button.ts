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
import type {UiLiveModel} from '../../live/live-model';
import type {LocalizationApi} from '../../localization';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

export const OmakaseLiveButtonAttributes = {
  /** Set while live media is loaded; the button is clickable only then */
  LIVE: 'live',
  /** Set while live and pinned to the live edge; the indicator is lit only then */
  LIVE_EDGE: 'live-edge',
  /** Set while live but behind the live edge */
  DVR: 'dvr',
};

/**
 * Live indicator + "go to live" control. Fully custom (extends {@link MediaChromeButton}).
 * Lit while live and pinned to the live edge, dimmed otherwise (behind the live edge, or not live).
 * Clickable only while live: clicking seeks to `syncPosition` (the player clamps to live).
 */
export class OmakaseLiveButton extends ControlBarComponent(MediaChromeButton) {
  static getSlotTemplateHTML(): string {
    return `
      <style>
        :host {
          --media-tooltip-display: none;
          cursor: pointer;
          /* Match the control-bar text components (e.g. speed control): Lato, same theme override var. */
          font-family: var(--dropdown-font-family, 'Lato');

        }
        /* not live: nothing to jump to */
        :host(:not([live])) {
          cursor: default;
          pointer-events: none;
        }
        /* Not pinned to the live edge (behind it, or not live): grey dot. Click jumps back to live while live. */
        .omakase-live-indicator {
          display: inline-block;
          flex: none;
          width: var(--omakase-live-button-indicator-size, 8px);
          height: var(--omakase-live-button-indicator-size, 8px);
          border-radius: 50%;
          background: var(--omakase-live-button-dvr-color, rgb(128, 128, 128));
        }
        :host([live-edge]) .omakase-live-indicator {
          background: var(--omakase-live-button-live-color, rgb(255, 0, 0));
        }
        .omakase-live-text {
          display: var(--omakase-live-button-text-display, inline);
          margin-left: 6px;
          text-transform: uppercase;
        }
        :host([compact]) .omakase-live-text {
          display: none;
        }
      </style>
      <span class="omakase-live-indicator" aria-hidden="true"></span>
      <slot name="text" class="omakase-live-text"></slot>
    `;
  }

  private _player: PlayerApi | PlayerDetachedApi | undefined;
  private _localization: LocalizationApi | undefined;

  private _live = false;
  private _syncPosition = 0;

  private _resizeObserver: ResizeObserver | undefined;
  private _labelWidth = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    this._syncLiveAttributes(false);
    let container = this.parentElement;
    if (container) {
      this._resizeObserver = new ResizeObserver(() => this._syncCompact());
      this._resizeObserver.observe(container);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this._resizeObserver = void 0;
  }

  get player(): PlayerApi | PlayerDetachedApi | undefined {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
  }

  get localization(): LocalizationApi | undefined {
    return this._localization;
  }

  set localization(localization: LocalizationApi | undefined) {
    this._localization = localization;
    if (localization) {
      const textSlot = this.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="text"]');
      if (textSlot) {
        textSlot.textContent = localization.get('live');
      }
    }
  }

  setLiveModel(model: UiLiveModel): void {
    let becameLive = model.isLive && !this._live;
    this._live = model.isLive;
    this._syncPosition = model.syncPosition;
    this._syncLiveAttributes(model.pinnedToLive);
    if (becameLive) {
      this._syncCompact();
    }
  }

  private _syncLiveAttributes(pinnedToLive: boolean): void {
    const liveEdge = this._live && pinnedToLive;
    this.toggleAttribute(OmakaseLiveButtonAttributes.LIVE, this._live);
    this.toggleAttribute(OmakaseLiveButtonAttributes.LIVE_EDGE, liveEdge);
    this.toggleAttribute(OmakaseLiveButtonAttributes.DVR, this._live && !liveEdge);
    this.setAttribute('aria-disabled', `${!this._live}`);
    if (this.enabled) {
      this.tabIndex = this._live ? 0 : -1;
    }
  }

  private _syncCompact(): void {
    let container = this.parentElement;
    if (!container || !this._live) {
      return;
    }

    let free = container.clientWidth - (this.offsetLeft + this.offsetWidth - container.offsetLeft);
    if (this.hasAttribute('compact')) {
      if (free >= this._labelWidth) {
        this.removeAttribute('compact');
        this.removeAttribute('aria-label');
      }
    } else if (free < 0) {
      let expandedWidth = this.offsetWidth;
      this.setAttribute('compact', '');
      this._labelWidth = expandedWidth - this.offsetWidth;
      this.setAttribute('aria-label', 'Live');
    }
  }

  override handleClick(): void {
    if (this._player && this._live) {
      if (this._player?.playerSession.playback.paused || this._player.playerSession.playback.pausing) {
        this._player?.play().subscribe(() => this._player?.seekTo(this._syncPosition));
      } else {
        this._player.seekTo(this._syncPosition).subscribe(() => {});
      }
    }
    this.blur();
  }
}
