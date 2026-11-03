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

import {filter, takeUntil} from 'rxjs';
import {MediaTemporalFormat} from '../../common';
import type {Marker} from '../../media';
import type {PlayerApi, PlayerDetachedApi} from '../../player';
import {PlayerEventType} from '../../player/player-event';
import type {LocalizationApi} from '../../localization';
import {ObserverBreaker} from '../../common/observer-breaker';
import {DomUtil} from '../../dom/dom-util';
import {SegmentationDomClasses} from '../segmentation-dom';
import {OmakaseSegmentationButton} from './base-segmentation-button';

export const OmakaseMarkButtonAttributes = {
  REPRESENTATION: 'representation',
  LABEL: 'label',
};

export type OmakaseMarkButtonRepresentation = 'icon' | 'icon-time' | 'label-time';

const EMPTY_DISPLAY = '-- : -- : -- : --';
const DEFAULT_SIZER = '00:00:00:00';

/**
 * Shared rendering for the Mark-In/Mark-Out capabilities' three representations.
 */
export abstract class OmakaseMarkButton extends OmakaseSegmentationButton {
  static get observedAttributes() {
    return [...super.observedAttributes, OmakaseMarkButtonAttributes.LABEL];
  }

  private _labelSpan: HTMLSpanElement | undefined;
  private _displaySpan: HTMLSpanElement | undefined;
  private _displaySizerSpan: HTMLSpanElement | undefined;
  private _displayValueSpan: HTMLSpanElement | undefined;
  private _localization: LocalizationApi | undefined;
  protected _playerBreaker = new ObserverBreaker();

  /**
   * Default for {@link label} when the `label` attribute/property isn't set - the localized
   * string from {@link localization}, if wired, otherwise a hardcoded English fallback.
   */
  protected abstract get defaultLabel(): string;

  /**
   * Resolves the time to display (in seconds) for the given, currently-active marker, or
   * `undefined` to show the empty placeholder.
   */
  protected abstract resolveDisplayTime(marker: Marker): number | undefined;

  get representation(): OmakaseMarkButtonRepresentation {
    const value = this.getAttribute(OmakaseMarkButtonAttributes.REPRESENTATION);
    return value === 'icon-time' || value === 'label-time' ? value : 'icon';
  }

  set representation(value: OmakaseMarkButtonRepresentation) {
    this.setAttribute(OmakaseMarkButtonAttributes.REPRESENTATION, value);
  }

  /**
   * Localizable label shown in the `label-time` representation. Defaults to {@link defaultLabel}.
   */
  get label(): string {
    return DomUtil.getAttribute(this, OmakaseMarkButtonAttributes.LABEL, this.defaultLabel);
  }

  set label(value: string | undefined) {
    DomUtil.setAttribute(this, OmakaseMarkButtonAttributes.LABEL, value);
  }

  get localization(): LocalizationApi | undefined {
    return this._localization;
  }

  set localization(localization: LocalizationApi | undefined) {
    this._localization = localization;
    // label falls back to defaultLabel, which reads from this - refresh what's on screen unless
    // an explicit label attribute/property is already overriding it.
    if (this._labelSpan && !DomUtil.getAttribute(this, OmakaseMarkButtonAttributes.LABEL, undefined)) {
      this._labelSpan.textContent = this.label;
    }
  }

  override get player() {
    return super.player;
  }

  override set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    super.player = player;
    // Activity (and the displayed time) also depend on the playhead position relative to the
    // active marker's start/end, which the base class has no reason to watch on its own.
    this._playerBreaker.break();
    this.updateActiveState();
    if (player) {
      player.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS || event.type === PlayerEventType.PLAYER_SEEKED),
          takeUntil(this._playerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: () => this.updateActiveState(),
        });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._playerBreaker.destroy();
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakaseMarkButtonAttributes.LABEL && this._labelSpan) {
      this._labelSpan.textContent = this.label;
    }
  }

  protected override buildContent(): void {
    switch (this.representation) {
      case 'label-time':
        this._labelSpan = document.createElement('span');
        this._labelSpan.className = SegmentationDomClasses.markLabel;
        this._labelSpan.textContent = this.label;
        this.appendChild(this._labelSpan);
        this.appendDisplay();
        break;
      case 'icon-time':
        super.buildContent();
        this.appendDisplay();
        break;
      case 'icon':
      default:
        super.buildContent();
        break;
    }
    this.updateDisplay();
  }

  protected override get disabledStateElement(): HTMLElement | undefined {
    return this._labelSpan ?? this._iconSpan;
  }

  protected override updateActiveState(): void {
    super.updateActiveState();
    this.updateDisplay();
  }

  private appendDisplay(): void {
    if (this._displaySpan) {
      return;
    }
    this._displaySpan = document.createElement('span');
    this._displaySpan.className = SegmentationDomClasses.markDisplay;
    this._displaySpan.addEventListener('click', (event) => event.stopPropagation());
    // The display is as wide as a timecode, whether a time or the empty placeholder is shown
    this._displaySizerSpan = document.createElement('span');
    this._displaySizerSpan.className = SegmentationDomClasses.markDisplaySizer;
    this._displaySizerSpan.setAttribute('aria-hidden', 'true');
    this._displaySizerSpan.textContent = DEFAULT_SIZER;
    this._displayValueSpan = document.createElement('span');
    this._displayValueSpan.className = SegmentationDomClasses.markDisplayValue;
    this._displaySpan.append(this._displaySizerSpan, this._displayValueSpan);
    this.appendChild(this._displaySpan);
  }

  private updateDisplay(): void {
    if (!this._displayValueSpan || !this._displaySizerSpan) {
      return;
    }
    const player = this.player;
    const track = this.enabled ? this.resolveMarkerTrack() : undefined;
    const markers = track ? this.resolveActiveMarkers(track) : [];
    const time = player && markers.length === 1 ? this.resolveDisplayTime(markers[0]!) : undefined;
    if (time === undefined) {
      this._displayValueSpan.textContent = EMPTY_DISPLAY;
      return;
    }
    const timecode = player!.convertTime(time, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
    this._displayValueSpan.textContent = timecode;
    this._displaySizerSpan.textContent = timecode.replace(/\d/g, '0');
  }
}
