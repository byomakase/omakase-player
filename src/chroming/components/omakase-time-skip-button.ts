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
import {MediaTemporalFormat} from '../../common';
import type {PlayerApi, PlayerDetachedApi} from '../../player';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

export const OmakaseTimeSkipButtonAttributes = {
  UNIT: 'unit',
  AMOUNT: 'amount',
};

export type OmakaseTimeSkipUnit = 'frame' | 'second' | 'percent';

const UNIT_TEMPORAL_FORMAT: Record<Exclude<OmakaseTimeSkipUnit, 'percent'>, MediaTemporalFormat.FRAME_COUNT | MediaTemporalFormat.SECONDS> = {
  frame: MediaTemporalFormat.FRAME_COUNT,
  second: MediaTemporalFormat.SECONDS,
};

export class OmakaseTimeSkipButton extends ControlBarComponent(MediaChromeButton) {
  static get observedAttributes() {
    return [...super.observedAttributes, OmakaseTimeSkipButtonAttributes.UNIT, OmakaseTimeSkipButtonAttributes.AMOUNT];
  }

  private _player: PlayerApi | PlayerDetachedApi | undefined;
  private _iconSpan: HTMLSpanElement | undefined;
  private _tooltip: HTMLElement | undefined;

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
  }

  get unit(): OmakaseTimeSkipUnit {
    const unit = this.getAttribute(OmakaseTimeSkipButtonAttributes.UNIT);
    return unit === 'second' || unit === 'percent' ? unit : 'frame';
  }

  set unit(unit: OmakaseTimeSkipUnit) {
    this.setAttribute(OmakaseTimeSkipButtonAttributes.UNIT, unit);
  }

  get amount(): number {
    const amount = Number(this.getAttribute(OmakaseTimeSkipButtonAttributes.AMOUNT));
    return Number.isFinite(amount) && amount !== 0 ? amount : 1;
  }

  set amount(amount: number) {
    this.setAttribute(OmakaseTimeSkipButtonAttributes.AMOUNT, `${amount}`);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this._iconSpan) {
      this._iconSpan = document.createElement('span');
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
    if (name === OmakaseTimeSkipButtonAttributes.UNIT || name === OmakaseTimeSkipButtonAttributes.AMOUNT) {
      this.render();
    }
  }

  override handleClick(): void {
    if (this._player) {
      const unit = this.unit;
      const amount = this.amount;
      this._player.pause().subscribe(() => {
        if (unit === 'percent') {
          const nextPercent = Math.min(100, Math.max(0, this._player!.getCurrentTime(MediaTemporalFormat.PERCENT) + amount));
          this._player!.seekTo(nextPercent, MediaTemporalFormat.PERCENT);
        } else {
          this._player!.seekFromCurrentTime(amount, UNIT_TEMPORAL_FORMAT[unit]);
        }
      });
    } else {
      super.handleClick(undefined);
    }
    this.blur();
  }

  private render(): void {
    if (!this._iconSpan || !this._tooltip) {
      return;
    }
    const forward = this.amount > 0;
    const oneUnit = Math.abs(this.amount) === 1;
    this._iconSpan.className = forward
      ? oneUnit
        ? 'media-chrome-frame-forward'
        : 'media-chrome-ten-frames-forward'
      : oneUnit
        ? 'media-chrome-frame-backwards'
        : 'media-chrome-ten-frames-backwards';
    this._tooltip.textContent = this.getTooltipText(forward, oneUnit, Math.abs(this.amount));
  }

  private getTooltipText(forward: boolean, oneUnit: boolean, magnitude: number): string {
    if (this.unit === 'frame' && oneUnit) {
      return forward ? 'Fast forward to next frame' : 'Rewind to previous frame';
    }
    const amountLabel = this.unit === 'percent' ? `${magnitude}%` : `${magnitude} ${this.unit}${magnitude === 1 ? '' : 's'}`;
    return forward ? `Fast forward by ${amountLabel}` : `Rewind by ${amountLabel}`;
  }
}
