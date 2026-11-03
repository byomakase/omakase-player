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
import type {OmakasePlayerApi} from '../../omakase-player-api';
import {type WindowPlayback, WindowPlaybackMode} from '../../common';
import {SessionEventType} from '../../session';
import {ObserverBreaker} from '../../common/observer-breaker';
import {ChromingDomClasses} from '../chroming-dom';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

export const OmakaseDetachToggleAttributes = {
  DETACHED: 'detached',
  INACTIVE: 'inactive',
};

export interface OmakaseDetachToggleHandler {
  detach(): void;
  attach(): void;
}

export class OmakaseDetachToggle extends ControlBarComponent(MediaChromeButton) {
  static get observedAttributes(): string[] {
    return [...super.observedAttributes, OmakaseDetachToggleAttributes.DETACHED];
  }

  private _omakasePlayer: OmakasePlayerApi | undefined;
  private _handler: OmakaseDetachToggleHandler | undefined;
  private _iconSpan: HTMLSpanElement | undefined;
  private _tooltip: HTMLElement | undefined;
  protected _omakasePlayerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  get omakasePlayer() {
    return this._omakasePlayer;
  }

  set omakasePlayer(omakasePlayer: OmakasePlayerApi | undefined) {
    this._omakasePlayer = omakasePlayer;
    this._omakasePlayerBreaker.break();
    if (omakasePlayer) {
      this.updateFromWindowPlayback(omakasePlayer.session.state.windowPlayback);
      omakasePlayer.session.onEvent$
        .pipe(
          filter((event) => event.type === SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED),
          takeUntil(this._omakasePlayerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: (event) => this.updateFromWindowPlayback((event.data as {windowPlayback: WindowPlayback}).windowPlayback),
        });
    } else {
      this.toggleAttribute(OmakaseDetachToggleAttributes.INACTIVE, false);
    }
  }

  get handler() {
    return this._handler;
  }

  set handler(handler: OmakaseDetachToggleHandler | undefined) {
    this._handler = handler;
  }

  get detached(): boolean {
    return this.hasAttribute(OmakaseDetachToggleAttributes.DETACHED);
  }

  set detached(detached: boolean) {
    this.toggleAttribute(OmakaseDetachToggleAttributes.DETACHED, detached);
  }

  get active(): boolean {
    return this.enabled && !this.hasAttribute(OmakaseDetachToggleAttributes.INACTIVE);
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
    this.updateIcon();
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakaseDetachToggleAttributes.DETACHED) {
      this.updateIcon();
    }
  }

  override handleClick(): void {
    if (this.active) {
      this.toggle();
    } else {
      super.handleClick(undefined);
    }
    this.blur();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._destroyBreaker.destroy();
  }

  private toggle(): void {
    const detached = this.detached;
    if (this._omakasePlayer) {
      try {
        (detached ? this._omakasePlayer.attachPlayer() : this._omakasePlayer.detachPlayer()).subscribe({
          error: (error) => console.error(error),
        });
      } catch (error) {
        console.error(error);
      }
    } else if (this._handler) {
      if (detached) {
        this._handler.attach();
      } else {
        this._handler.detach();
      }
    }
  }

  private updateFromWindowPlayback(windowPlayback: WindowPlayback): void {
    const detached = windowPlayback.mode === WindowPlaybackMode.DETACHED;
    this.detached = detached;
    this.toggleAttribute(OmakaseDetachToggleAttributes.INACTIVE, !(detached ? windowPlayback.canAttach : windowPlayback.canDetach));
  }

  private updateIcon(): void {
    const detached = this.detached;
    if (this._iconSpan) {
      this._iconSpan.className = detached ? ChromingDomClasses.mediaChromeAttach : ChromingDomClasses.mediaChromeDetach;
    }
    if (this._tooltip) {
      this._tooltip.textContent = detached ? 'Attach player' : 'Detach player';
    }
    this.setAttribute('aria-label', detached ? 'attach player' : 'detach player');
  }
}
