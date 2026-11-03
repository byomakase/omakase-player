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
import type {MarkerTrack} from '../../media';
import type {UiApi} from '../../ui';
import {type Color, type IdStyleRule, type MarkerStyle, type MarkerTrackStyle, UiEventType} from '../../ui';
import {ObserverBreaker} from '../../common/observer-breaker';
import {ColorUtil} from '../../util/color-util';
import {DomUtil} from '../../dom/dom-util';
import {SegmentationDomClasses} from '../segmentation-dom';
import {OmakaseSegmentationButton, OmakaseSegmentationButtonAttributes} from './base-segmentation-button';

export const OmakaseColorSelectorButtonAttributes = {
  SCOPE: 'scope',
  INITIAL_COLOR: 'initial-color',
  PALETTE: 'palette',
  FLYOUT: 'flyout',
};

export type OmakaseColorSelectorScope = 'track' | 'marker';
export type OmakaseColorSelectorFlyoutDirection = 'left' | 'right' | 'up' | 'down';

const flyoutDirections: OmakaseColorSelectorFlyoutDirection[] = ['left', 'right', 'up', 'down'];

export const DEFAULT_COLOR_PALETTE: Color[] = [
  '#C79FD3',
  '#A0ADD3',
  '#7ABEA6',
  '#E6EAAA',
  '#F5BE83',
  '#E6856C',
  '#CEA09E',
  '#D145F7',
  '#406AF6',
  '#6EE8B0',
  '#F1FF5F',
  '#F09440',
  '#EB4828',
  '#EE7B77',
];

export class OmakaseColorSelectorButton extends OmakaseSegmentationButton {
  static get observedAttributes() {
    return [...super.observedAttributes, OmakaseColorSelectorButtonAttributes.SCOPE, OmakaseColorSelectorButtonAttributes.INITIAL_COLOR, OmakaseColorSelectorButtonAttributes.PALETTE];
  }

  private _flyout: HTMLDivElement | undefined;
  private _grid: HTMLDivElement | undefined;
  private _isOpen = false;
  private _documentClickListener: ((event: MouseEvent) => void) | undefined;
  protected _uiEventBreaker = new ObserverBreaker();

  protected get iconClass(): string {
    return SegmentationDomClasses.mediaChromeColorSelector;
  }

  protected get tooltipText(): string {
    return 'Marker color';
  }

  get scope(): OmakaseColorSelectorScope {
    return this.getAttribute(OmakaseColorSelectorButtonAttributes.SCOPE) === 'marker' ? 'marker' : 'track';
  }

  set scope(value: OmakaseColorSelectorScope) {
    DomUtil.setAttribute(this, OmakaseColorSelectorButtonAttributes.SCOPE, value);
  }

  get initialColor(): Color {
    return DomUtil.getAttribute(this, OmakaseColorSelectorButtonAttributes.INITIAL_COLOR, this.palette[0] ?? '#000000');
  }

  set initialColor(value: Color | undefined) {
    DomUtil.setAttribute(this, OmakaseColorSelectorButtonAttributes.INITIAL_COLOR, value);
  }

  get palette(): Color[] {
    const raw = this.getAttribute(OmakaseColorSelectorButtonAttributes.PALETTE);
    if (!raw) {
      return DEFAULT_COLOR_PALETTE;
    }
    const colors = raw
      .split(',')
      .map((color) => color.trim())
      .filter((color) => color.length > 0);
    return colors.length > 0 ? (colors as Color[]) : DEFAULT_COLOR_PALETTE;
  }

  set palette(value: Color[] | undefined) {
    DomUtil.setAttribute(this, OmakaseColorSelectorButtonAttributes.PALETTE, value?.join(','));
  }

  get flyoutDirection(): OmakaseColorSelectorFlyoutDirection {
    const direction = this.getAttribute(OmakaseColorSelectorButtonAttributes.FLYOUT) as OmakaseColorSelectorFlyoutDirection | null;
    return direction && flyoutDirections.includes(direction) ? direction : 'down';
  }

  set flyoutDirection(direction: OmakaseColorSelectorFlyoutDirection | undefined) {
    DomUtil.setAttribute(this, OmakaseColorSelectorButtonAttributes.FLYOUT, direction);
  }

  get selectedColor(): Color {
    const track = this.enabled ? this.resolveMarkerTrack() : undefined;
    return this.resolveSelectedColor(track);
  }

  set selectedColor(color: Color) {
    this.applyColor(color);
  }

  override get ui(): UiApi | undefined {
    return super.ui;
  }

  override set ui(ui: UiApi | undefined) {
    super.ui = ui;
    this._uiEventBreaker.break();
    this.refreshSelectedColor();
    if (ui) {
      ui.onEvent$
        .pipe(
          filter((event) => event.type === UiEventType.UI_STYLE_RULE_UPDATED || event.type === UiEventType.UI_STYLE_RULES_REMOVED),
          takeUntil(this._uiEventBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: () => this.refreshSelectedColor(),
        });
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._documentClickListener = (event: MouseEvent) => {
      if (this._isOpen && !event.composedPath().includes(this)) {
        this.setOpen(false);
      }
    };
    document.addEventListener('click', this._documentClickListener);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._uiEventBreaker.destroy();
    if (this._documentClickListener) {
      document.removeEventListener('click', this._documentClickListener);
      this._documentClickListener = undefined;
    }
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakaseColorSelectorButtonAttributes.PALETTE && this.isConnected) {
      this.renderGrid();
    } else if (name === OmakaseColorSelectorButtonAttributes.SCOPE && this.isConnected) {
      this.updateActiveState();
    } else if (name === OmakaseColorSelectorButtonAttributes.INITIAL_COLOR && this.isConnected) {
      this.refreshSelectedColor();
    }
  }

  override handleClick(event?: Event): void {
    if (event && this._flyout && event.composedPath().includes(this._flyout)) {
      return;
    }
    super.handleClick();
  }

  protected override buildContent(): void {
    super.buildContent();

    this._flyout = document.createElement('div');
    this._flyout.className = SegmentationDomClasses.colorSelectorFlyout;
    this._grid = document.createElement('div');
    this._grid.className = SegmentationDomClasses.colorSelectorGrid;
    this._flyout.appendChild(this._grid);
    this.appendChild(this._flyout);

    this.renderGrid();
  }

  protected isCapabilityActive(track: MarkerTrack): boolean {
    if (this.scope === 'marker') {
      return this.resolveActiveMarkers(track).length > 0;
    }
    return true;
  }

  protected activate(track: MarkerTrack): void {
    this.setOpen(!this._isOpen);
  }

  protected override updateActiveState(): void {
    super.updateActiveState();
    if (this.hasAttribute(OmakaseSegmentationButtonAttributes.INACTIVE)) {
      this.setOpen(false);
    }
    this.refreshSelectedColor();
  }

  private setOpen(open: boolean): void {
    if (this._isOpen === open) {
      return;
    }
    this._isOpen = open;
    this.classList.toggle(SegmentationDomClasses.colorSelectorOpen, open);
  }

  private renderGrid(): void {
    if (!this._grid) {
      return;
    }
    this._grid.innerHTML = '';
    const palette = this.palette;
    this._grid.style.setProperty('--omakase-color-selector-grid-columns', `${this.resolveColumns(palette.length)}`);
    for (const color of palette) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = SegmentationDomClasses.colorSelectorOption;
      swatch.style.backgroundColor = color;
      swatch.dataset.color = color;
      swatch.classList.toggle(SegmentationDomClasses.colorSelectorLight, ColorUtil.isLightColor(color));
      swatch.setAttribute('aria-label', color);
      swatch.addEventListener('click', () => {
        this.applyColor(color);
        this.setOpen(false);
      });
      this._grid.appendChild(swatch);
    }
    this.refreshSelectedColor();
  }

  private resolveColumns(count: number): number {
    if (count < 8) {
      return Math.max(count, 1);
    }
    return count <= 64 ? 8 : 10;
  }

  private resolveSelectedColor(track: MarkerTrack | undefined): Color {
    if (track) {
      if (this.scope === 'marker') {
        const marker = this.resolveActiveMarkers(track)[0];
        if (marker) {
          return this.resolveMarkerOrTrackColor(marker.id) ?? this.resolveMarkerOrTrackColor(track.id) ?? this.initialColor;
        }
      } else {
        return this.resolveMarkerOrTrackColor(track.id) ?? this.initialColor;
      }
    }
    return this.initialColor;
  }

  private resolveMarkerOrTrackColor(id: string): Color | undefined {
    const rule = this.ui?.styleRules.find((r): r is IdStyleRule<MarkerStyle> => 'id' in r && r.id === id);
    return rule?.style.markerColor;
  }

  private applyColor(color: Color): void {
    const track = this.enabled ? this.resolveMarkerTrack() : undefined;
    const ui = this.ui;
    if (!track || !ui) {
      return;
    }
    if (this.scope === 'marker') {
      const markers = this.resolveActiveMarkers(track);
      for (const marker of markers) {
        ui.updateStyleRule<MarkerStyle>({id: marker.id, style: {markerColor: color}});
      }
    } else {
      ui.updateStyleRule<MarkerTrackStyle>({id: track.id, style: {markerColor: color}});
    }
    this.refreshSelectedColor();
  }

  private refreshSelectedColor(): void {
    const track = this.enabled ? this.resolveMarkerTrack() : undefined;
    const color = this.resolveSelectedColor(track);
    if (this._iconSpan) {
      this._iconSpan.style.backgroundColor = color;
    }
    this._grid?.querySelectorAll<HTMLElement>(`.${SegmentationDomClasses.colorSelectorOption}`).forEach((swatch) => {
      swatch.classList.toggle(SegmentationDomClasses.colorSelectorActive, swatch.dataset.color === color);
    });
  }
}
