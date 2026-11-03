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
import type {ChromingApi} from '../chroming-api';
import {ChromingEventType} from '../chroming-event';
import {ObserverBreaker} from '../../common/observer-breaker';
import {ChromingDomClasses} from '../chroming-dom';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

const timeVisibleProperty = 'omakaseTimeVisible';

export class OmakaseTimeToggle extends ControlBarComponent(MediaChromeButton) {
  private _chroming: ChromingApi | undefined;
  protected _chromingBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  override connectedCallback() {
    super.connectedCallback();
    this.updateIcon();
  }

  get chroming() {
    return this._chroming;
  }

  set chroming(chroming: ChromingApi | undefined) {
    this._chroming = chroming;
    this._chromingBreaker.break();
    this.updateTimeVisibleFromChroming();
    if (this._chroming) {
      this._chroming.onEvent$
        .pipe(
          filter((event) => event.type === ChromingEventType.CHROMING_THEME_CONFIG_CHANGE),
          takeUntil(this._chromingBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: () => {
            this.updateTimeVisibleFromChroming();
          },
        });
    }
  }

  get timeVisible(): boolean {
    return this.hasAttribute(timeVisibleProperty);
  }

  set timeVisible(value: boolean) {
    this.toggleAttribute(timeVisibleProperty, value);
    this.updateIcon();
    this.updateAriaLabel();
  }

  override handleClick(): void {
    if (this._chroming) {
      this._chroming.setFloatingTimeVisible(!this._chroming.isFloatingTimeVisible);
    }
    this.blur();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyBreaker.destroy();
  }

  private updateTimeVisibleFromChroming() {
    this.timeVisible = this._chroming?.isFloatingTimeVisible ?? false;
  }

  private updateIcon() {
    let icon = this.querySelector<HTMLElement>(':scope > span');
    if (!icon) {
      icon = document.createElement('span');
      this.appendChild(icon);
    }
    icon.classList.toggle(ChromingDomClasses.mediaChromeBitcEnabled, this.timeVisible);
    icon.classList.toggle(ChromingDomClasses.mediaChromeBitcDisabled, !this.timeVisible);
    const tooltip = this.querySelector(':scope > media-tooltip');
    if (tooltip) {
      tooltip.textContent = this.timeVisible ? 'Hide timecode' : 'Show timecode';
    }
  }

  private updateAriaLabel() {
    this.setAttribute('aria-label', this.timeVisible ? 'hide timecode' : 'show timecode');
  }
}
