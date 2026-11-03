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
import {filter, forkJoin, type Observable, of, takeUntil} from 'rxjs';
import type {ChromingApi, VideoSafeZone, VideoSafeZoneCreate} from '../chroming-api';
import {ChromingEventType} from '../chroming-event';
import {ObserverBreaker} from '../../common/observer-breaker';
import {ChromingDomClasses} from '../chroming-dom';
import {ControlBarComponent, ControlBarComponentAttributes} from '../../control-bar/control-bar-component';

export const OmakaseSafeZoneToggleAttributes = {
  SAFE_ZONES_VISIBLE: 'safe-zones-visible',
  INACTIVE: 'inactive',
};

/**
 * A safe zone shown by the safe zone toggle: either its `[top, right, bottom, left]` percentages, or a full
 * {@link VideoSafeZoneCreate}
 */
export type OmakaseSafeZoneToggleZone = number[] | VideoSafeZoneCreate;

export interface OmakaseSafeZoneToggleConfig {
  /** Safe zones shown and hidden by the toggle. The capability is inactive while none are given */
  safeZones?: OmakaseSafeZoneToggleZone[] | undefined;
}

let instanceCount = 0;

export class OmakaseSafeZoneToggle extends ControlBarComponent(MediaChromeButton) {
  static get observedAttributes(): string[] {
    return [...super.observedAttributes, OmakaseSafeZoneToggleAttributes.SAFE_ZONES_VISIBLE];
  }

  private readonly _idPrefix = `omakase-safe-zone-toggle-${++instanceCount}`;
  private _chroming: ChromingApi | undefined;
  private _safeZones: VideoSafeZoneCreate[] = [];
  private _pending = false;
  private _iconSpan: HTMLSpanElement | undefined;
  private _tooltip: HTMLElement | undefined;
  protected _chromingBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  get chroming() {
    return this._chroming;
  }

  set chroming(chroming: ChromingApi | undefined) {
    this._chroming = chroming;
    this._chromingBreaker.break();
    this.updateSafeZonesVisibleFromChroming();
    if (this._chroming) {
      this._chroming.onEvent$
        .pipe(
          filter((event) => event.type === ChromingEventType.CHROMING_SAFE_ZONES_CHANGE),
          takeUntil(this._chromingBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: () => this.updateSafeZonesVisibleFromChroming(),
        });
    }
  }

  get safeZones(): VideoSafeZoneCreate[] {
    return this._safeZones;
  }

  get safeZonesVisible(): boolean {
    return this.hasAttribute(OmakaseSafeZoneToggleAttributes.SAFE_ZONES_VISIBLE);
  }

  get active(): boolean {
    return this.enabled && this._safeZones.length > 0;
  }

  configure(config: OmakaseSafeZoneToggleConfig): void {
    const visible = this.safeZonesVisible;
    const previousSafeZones = this._safeZones;
    this._safeZones = (config.safeZones ?? []).map((safeZone, index) => this.toSafeZoneCreate(safeZone, index));
    this.updateActiveState();
    if (visible) {
      this.run(this.removeSafeZones(previousSafeZones), () => {
        if (this._safeZones.length > 0) {
          this.run(this.addSafeZones());
        }
      });
    }
  }

  deactivate(): void {
    this.configure({});
  }

  toggle(): void {
    if (!this.active || !this._chroming || this._pending) {
      return;
    }
    this.run(this.safeZonesVisible ? this.removeSafeZones(this._safeZones) : this.addSafeZones());
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
    this.updateActiveState();
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakaseSafeZoneToggleAttributes.SAFE_ZONES_VISIBLE) {
      this.updateIcon();
    } else if (name === ControlBarComponentAttributes.DISABLED) {
      this.updateActiveState();
    }
  }

  override handleClick(): void {
    if (this.active && this._chroming) {
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

  private toSafeZoneCreate(safeZone: OmakaseSafeZoneToggleZone, index: number): VideoSafeZoneCreate {
    const id = `${this._idPrefix}-${index + 1}`;
    if (Array.isArray(safeZone)) {
      return {id, htmlId: id, topRightBottomLeftPercent: [...safeZone]};
    }
    return {...safeZone, id: safeZone.id ?? id, htmlId: safeZone.htmlId ?? id};
  }

  private addSafeZones(): Observable<unknown> {
    const chroming = this._chroming;
    if (!chroming) {
      return of(void 0);
    }
    const shownIds = new Set(chroming.videoSafeZones.map((safeZone) => safeZone.id));
    const added = this._safeZones.filter((safeZone) => !shownIds.has(safeZone.id!)).map((safeZone) => chroming.addSafeZone(safeZone, safeZone.renderingRegion));
    return added.length > 0 ? forkJoin(added) : of(void 0);
  }

  private removeSafeZones(safeZones: VideoSafeZoneCreate[]): Observable<unknown> {
    const chroming = this._chroming;
    if (!chroming) {
      return of(void 0);
    }
    const shownIds = new Set(chroming.videoSafeZones.map((safeZone) => safeZone.id));
    const removed = safeZones.filter((safeZone) => shownIds.has(safeZone.id!)).map((safeZone) => chroming.removeSafeZone(safeZone.id!));
    return removed.length > 0 ? forkJoin(removed) : of(void 0);
  }

  private run(observable: Observable<unknown>, onComplete?: () => void): void {
    this._pending = true;
    observable.subscribe({
      error: (error) => {
        this._pending = false;
        console.error(error);
        this.updateSafeZonesVisibleFromChroming();
      },
      complete: () => {
        this._pending = false;
        this.updateSafeZonesVisibleFromChroming();
        onComplete?.();
      },
    });
  }

  private updateSafeZonesVisibleFromChroming(): void {
    const shownSafeZones: VideoSafeZone[] = this._chroming?.videoSafeZones ?? [];
    const visible = this._safeZones.some((safeZone) => shownSafeZones.some((shown) => shown.id === safeZone.id));
    this.toggleAttribute(OmakaseSafeZoneToggleAttributes.SAFE_ZONES_VISIBLE, visible);
  }

  private updateIcon(): void {
    const visible = this.safeZonesVisible;
    this._iconSpan?.classList.toggle(ChromingDomClasses.mediaChromeSafeZoneOn, visible);
    this._iconSpan?.classList.toggle(ChromingDomClasses.mediaChromeSafeZoneOff, !visible);
    if (this._tooltip) {
      this._tooltip.textContent = visible ? 'Hide safe zones' : 'Show safe zones';
    }
    this.setAttribute('aria-label', visible ? 'hide safe zones' : 'show safe zones');
  }

  private updateActiveState(): void {
    const active = this.active;
    this.toggleAttribute(OmakaseSafeZoneToggleAttributes.INACTIVE, !active);
    if (this.enabled) {
      this.tabIndex = active ? 0 : -1;
    }
  }
}
