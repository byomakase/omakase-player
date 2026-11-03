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
import {type Marker, MarkerTrack, TrackType} from '../../media';
import type {PlayerApi, PlayerDetachedApi} from '../../player';
import type {OmakaseTrackApi} from '../../track';
import {type UiApi, UiEventType} from '../../ui';
import {ObserverBreaker} from '../../common/observer-breaker';
import {DomUtil} from '../../dom/dom-util';
import {SegmentationDomClasses} from '../segmentation-dom';
import {ControlBarComponent, ControlBarComponentAttributes} from '../../control-bar/control-bar-component';

export const OmakaseSegmentationButtonAttributes = {
  MARKER_TRACK_ID: 'marker-track-id',
  INACTIVE: 'inactive',
};

/**
 * Shared behavior for segmentation capabilities associated with a {@link MarkerTrack}.
 */
export abstract class OmakaseSegmentationButton extends ControlBarComponent(MediaChromeButton) {
  static get observedAttributes() {
    return [...super.observedAttributes, OmakaseSegmentationButtonAttributes.MARKER_TRACK_ID];
  }

  private _player: PlayerApi | PlayerDetachedApi | undefined;
  private _track: OmakaseTrackApi | undefined;
  private _ui: UiApi | undefined;
  protected _iconSpan: HTMLSpanElement | undefined;
  protected _tooltip: HTMLElement | undefined;
  protected _wireBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  protected abstract get iconClass(): string;

  protected abstract get tooltipText(): string;

  /**
   * Whether the capability is currently active for the given, already-resolved marker track.
   * Only called when a marker track resolves and {@link enabled} is `true`.
   */
  protected abstract isCapabilityActive(track: MarkerTrack): boolean;

  /**
   * Invoked on click (or keyboard activation) while the capability is active, with its resolved
   * marker track.
   */
  protected abstract activate(track: MarkerTrack): void;

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
  }

  get track() {
    return this._track;
  }

  set track(track: OmakaseTrackApi | undefined) {
    this._track = track;
    this.wire();
  }

  get ui() {
    return this._ui;
  }

  set ui(ui: UiApi | undefined) {
    this._ui = ui;
    this.wire();
  }

  get markerTrackId(): string | undefined {
    return DomUtil.getAttribute(this, OmakaseSegmentationButtonAttributes.MARKER_TRACK_ID, undefined);
  }

  set markerTrackId(value: string | undefined) {
    DomUtil.setAttribute(this, OmakaseSegmentationButtonAttributes.MARKER_TRACK_ID, value);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.buildContent();
    this.setAttribute('aria-label', this.tooltipText);
    this.updateActiveState();
  }

  protected buildContent(): void {
    if (!this._iconSpan) {
      this._iconSpan = document.createElement('span');
      this._iconSpan.className = this.iconClass;
      this.appendChild(this._iconSpan);
    }
    if (!this._tooltip) {
      this._tooltip = document.createElement('media-tooltip');
      this._tooltip.textContent = this.tooltipText;
      this.appendChild(this._tooltip);
    }
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakaseSegmentationButtonAttributes.MARKER_TRACK_ID) {
      this.wire();
    } else if (name === ControlBarComponentAttributes.DISABLED) {
      this.updateActiveState();
    }
  }

  override handleClick(): void {
    const track = this.enabled ? this.resolveMarkerTrack() : undefined;
    if (track && this.isCapabilityActive(track)) {
      this.activate(track);
    } else {
      super.handleClick(undefined);
    }
    this.blur();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._wireBreaker.destroy();
    this._destroyBreaker.destroy();
  }

  private wire(): void {
    this._wireBreaker.break();
    this.updateActiveState();

    const track = this._track;
    if (track) {
      track.onEvent$.pipe(takeUntil(this._wireBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
        next: () => this.updateActiveState(),
      });
      track.onTrackEvent$.pipe(takeUntil(this._wireBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
        next: () => this.updateActiveState(),
      });
    }

    const ui = this._ui;
    if (ui) {
      ui.onEvent$
        .pipe(
          filter((event) => event.type === UiEventType.UI_ELEMENT_UPDATED || event.type === UiEventType.UI_ELEMENTS_REMOVED),
          takeUntil(this._wireBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: () => this.updateActiveState(),
        });
    }
  }

  protected resolveMarkerTrack(): MarkerTrack | undefined {
    const trackId = this.markerTrackId;
    if (!trackId || !this._track) {
      return undefined;
    }
    const track = this._track.get(trackId);
    return track?.trackType === TrackType.MARKER_TRACK ? (track as MarkerTrack) : undefined;
  }

  /**
   * Finds every marker on `track` whose `focused` {@link UiElementProps} is `true` (see
   * `UiApi.updateElement`). Available to subclasses whose activity/behavior depends on which
   * marker(s) are currently active/selected.
   */
  protected resolveActiveMarkers(track: MarkerTrack): Marker[] {
    const ui = this._ui;
    if (!ui) {
      return [];
    }
    return track.timedItemsSorted.filter((marker) => ui.getElement(marker.id)?.props?.focused === true);
  }

  /**
   * Finds the first marker on `track` whose `focused` {@link UiElementProps} is `true`, if any.
   */
  protected resolveActiveMarker(track: MarkerTrack): Marker | undefined {
    return this.resolveActiveMarkers(track)[0];
  }

  protected updateActiveState(): void {
    const track = this.enabled ? this.resolveMarkerTrack() : undefined;
    const active = !!track && this.isCapabilityActive(track);
    this.toggleAttribute(OmakaseSegmentationButtonAttributes.INACTIVE, !active);
    if (this.enabled) {
      this.tabIndex = active ? 0 : -1;
    }
    this.disabledStateElement?.classList.toggle(SegmentationDomClasses.disabled, !active);
  }

  /**
   * Element whose {@link SegmentationDomClasses.disabled} class reflects whether the capability
   * is currently active. Defaults to the icon span; subclasses with a different visual (e.g. a
   * text label instead of an icon) can override this.
   */
  protected get disabledStateElement(): HTMLElement | undefined {
    return this._iconSpan;
  }
}
