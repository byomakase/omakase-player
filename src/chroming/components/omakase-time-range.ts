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

import {MediaTimeRange} from 'media-chrome';
import {filter, isObservable, Observable, of, Subject, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import {MediaUIAttributes} from 'media-chrome/constants';
import type {ChromingMarkerBarConfig, ChromingMarkerBarElementApi, ChromingMarkerBarElementEvent} from '../chroming-marker-bar';
import type {MarkerTrackState, MarkerState, Marker} from '../../media/marker-track';
import {CryptoUtil} from '../../util/crypto-util';
import {TimedItemTemporalType} from '../../media';
import {affectsStyledElement, Ui, type MarkerStyle, type StyledElement} from '../../ui';
import type {UiProxy} from '../../remoting/impl/ui-proxy';
import {DomUtil} from '../../dom/dom-util';
import {isNullOrUndefined} from '../../util/util-functions';
import {PlayerEventType, type PlayerInternalApi} from '../../player';

export const OmakaseTimeRangeAttributes = {
  NAME: 'name',
  OMAKASE: 'omakase',
  MARKER_ID: 'data-marker-id',
};

export const OmakaseTimeRangeDomClasses = {
  MARKER_DISPLAY: 'omakase-marker-display',
  MARKER_AREA: 'omakase-marker-area',
  FOCUSED: 'focused',
  MARKER_HALO: 'marker-halo',
  HAS_MARKERS: 'has-markers',
};

export interface MarkerMouseEvent {
  markerId: MarkerState['id'];
}

export interface OmakaseTimeRangeMarker {
  styledElement: StyledElement<MarkerStyle>;
  displayElement: HTMLDivElement;
  areaElement: HTMLDivElement;
  trackId: MarkerTrackState['id'];
}

export class OmakaseTimeRange extends MediaTimeRange implements ChromingMarkerBarElementApi {
  protected readonly _onEvent$: Subject<ChromingMarkerBarElementEvent> = new Subject<ChromingMarkerBarElementEvent>();

  protected readonly _onSeek$: Subject<number> = new Subject();
  protected readonly _onMouseOver$: Subject<number> = new Subject();

  protected readonly _onMarkerMouseEnter$: Subject<MarkerMouseEvent> = new Subject();
  protected readonly _onMarkerMouseLeave$: Subject<MarkerMouseEvent> = new Subject();
  protected readonly _onMarkerClick$: Subject<MarkerMouseEvent> = new Subject();

  destroy$ = new Subject<void>();

  private _player?: PlayerInternalApi;
  private _markerDisplayContainer: HTMLElement;
  private _markerAreaContainer: HTMLElement;
  private _rangeElement: HTMLInputElement;
  private _lastPreviewTime?: number;
  protected _destroyBreaker = new ObserverBreaker();

  private _markers: Map<MarkerState['id'], OmakaseTimeRangeMarker> = new Map();
  private _tracks: Map<MarkerTrackState['id'], MarkerTrackState> = new Map();
  private _focusedMarkers: Set<OmakaseTimeRangeMarker> = new Set();
  private _config: ChromingMarkerBarConfig = {
    id: CryptoUtil.uuid(),
    visible: true,
  };
  private _uiOrUiProxy?: UiProxy | Ui | undefined;

  constructor() {
    super();
    const style = document.createElement('style');
    style.textContent = `
      #appearance:has(+ #range:hover) {
        height: var(--time-range-hover-height, var(--media-range-track-height, 4px));
      }
      #thumb {
        z-index: 2;
        bottom: var(--time-range-thumb-bottom, unset);
      }
      #markers {
        position: absolute;
        width: 100%;
        z-index: 1;
        height: var(--time-range-markers-height, 100%);
        bottom: var(--time-range-markers-bottom-offset, 0);
        background: var(--time-range-background, transparent);
      }
      #marker-area {
        pointer-events: none;
        position: absolute;
        width: 100%;
        height: 100%;
        z-index: 2;
      }
      .omakase-marker-display {
        position: absolute;
        height: 100%;
        outline: var(--time-range-marker-border-size, 1px) solid var(--time-range-marker-border-color, black);
        min-width: var(--time-range-marker-min-width, 5px);
        opacity: var(--time-range-marker-opacity, 0.7)
      }
      .omakase-marker-area {
        pointer-events: all;
        position: absolute;
        height: 100%;
        min-width: var(--time-range-marker-min-width, 5px);
      }
      .marker-halo {
        position: absolute;
        width: 100%;
        height: var(--time-range-marker-halo-height, 1px);
        bottom: calc(-2px - var(--time-range-marker-halo-height, 1px));
        display: none;
      }
      .omakase-marker-display.focused {
        height: calc(100% + var(--time-range-marker-focus-height, 3px));
        top: var(--time-range-marker-focus-top, calc(-1 * var(--time-range-marker-focus-height, 3px)));
        z-index: 1;
        filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.25));
      }
      .omakase-marker-display.focused .marker-halo {
        display: block;
      }
    `;

    this.shadowRoot!.appendChild(style);

    const appearanceElement = this.shadowRoot!.querySelector('#appearance')!;
    this._markerDisplayContainer = DomUtil.createElement('div');
    this.updateClasses();
    this._markerDisplayContainer.id = 'markers';
    appearanceElement.appendChild(this._markerDisplayContainer);

    const containerElement = this.shadowRoot!.querySelector('#container')!;
    this._markerAreaContainer = DomUtil.createElement('div');
    this._markerAreaContainer.id = 'marker-area';
    containerElement.appendChild(this._markerAreaContainer);

    this._rangeElement = this.shadowRoot!.querySelector('#range') as HTMLInputElement;
    this._rangeElement.addEventListener('keydown', (e) => {
      e.preventDefault();
    });
  }

  get onEvent$(): Observable<ChromingMarkerBarElementEvent> {
    return this._onEvent$.asObservable();
  }

  get onMouseOver$(): Observable<number> {
    return this._onMouseOver$.asObservable();
  }

  get onSeek$(): Observable<number> {
    return this._onSeek$.asObservable();
  }

  get onMarkerMouseEnter$(): Observable<MarkerMouseEvent> {
    return this._onMarkerMouseEnter$.asObservable();
  }

  get onMarkerMouseLeave$(): Observable<MarkerMouseEvent> {
    return this._onMarkerMouseLeave$.asObservable();
  }

  get onMarkerClick(): Observable<MarkerMouseEvent> {
    return this._onMarkerClick$.asObservable();
  }

  get config(): ChromingMarkerBarConfig {
    return this._config;
  }

  set config(config: Partial<ChromingMarkerBarConfig>) {
    this._config = {
      ...this._config,
      ...config,
    };
    if (!this._config.visible) {
      this.hide();
    }
  }

  get markerTracks(): MarkerTrackState[] | undefined {
    return this._tracks.size > 0 ? this._tracks.values().toArray() : undefined;
  }

  set markerTracks(markerTracks: MarkerTrackState[]) {
    for (const markerTrack of markerTracks) {
      this._tracks.set(markerTrack.id, markerTrack);
    }
    this.loadMarkers(markerTracks);
  }

  get name(): string {
    return this.getAttribute(OmakaseTimeRangeAttributes.NAME) ?? '';
  }

  get rangeWidth(): number {
    return this.range.offsetWidth;
  }

  get isOmakase(): boolean {
    return this.hasAttribute(OmakaseTimeRangeAttributes.OMAKASE);
  }

  set isOmakase(isOmakase: boolean) {
    if (isOmakase) {
      this.setAttribute(OmakaseTimeRangeAttributes.OMAKASE, '');
    } else {
      this.removeAttribute(OmakaseTimeRangeAttributes.OMAKASE);
    }
  }

  get player(): PlayerInternalApi | undefined {
    return this._player;
  }

  set player(player: PlayerInternalApi) {
    this._player = player;
    this._player.onEvent$
      .pipe(
        filter((event) => event.type === PlayerEventType.PLAYER_SEEKING),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((event) => {
        const time = event.data.toTime;
        const duration = this._player!.getDuration();
        this.range.valueAsNumber = time / duration;
        this.updateBar();
      });
  }

  protected get _ui(): UiProxy | Ui {
    if (this._uiOrUiProxy === void 0) {
      throw new Error('called to early');
    }
    return this._uiOrUiProxy;
  }

  setUiOrUiProxy(ui: UiProxy | Ui) {
    this._uiOrUiProxy = ui;
  }

  show(): void {
    this._markerDisplayContainer.style.removeProperty('display');
  }

  hide(): void {
    this._markerDisplayContainer.style.display = 'none';
  }

  addTrack(track: MarkerTrackState): void {
    this._tracks.set(track.id, track);
    for (const marker of track.timedItems) {
      this.addMarker(marker, track.id);
    }
  }

  removeTrack(track: MarkerTrackState): void {
    this._tracks.delete(track.id);
    for (const [markerId, marker] of this._markers) {
      if (marker.trackId === track.id) {
        this.removeMarker(markerId);
      }
    }
  }

  updateTrack(track: MarkerTrackState): void {
    this._tracks.set(track.id, track);
    const updatedIds = new Set(track.timedItems.map((m) => m.id));
    for (const marker of track.timedItems) {
      if (this._markers.has(marker.id)) {
        this.updateMarker(marker);
      } else {
        this.addMarker(marker, track.id);
      }
    }
    for (const [markerId, marker] of this._markers) {
      if (marker.trackId === track.id && !updatedIds.has(markerId)) {
        this.removeMarker(markerId);
      }
    }
  }

  hasTrack(trackId: string): boolean {
    return this._tracks.has(trackId);
  }

  addMarker(marker: MarkerState, trackId: MarkerTrackState['id']): void {
    this.updateClasses();
    let styledElement = {
      id: marker.id,
      parent: {
        id: trackId,
        parent: {
          classes: [Ui.formatStyleClassName('MarkerOnChroming')],
          parent: {
            classes: [Ui.formatStyleClassName('MarkerTrack')],
            parent: {
              classes: [Ui.formatStyleClassName('Marker')],
            },
          },
        },
      },
    };
    this.toObservable(this._ui.resolveStyle<MarkerStyle>(styledElement))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((style) => {
        const displayElement = this.createMarkerDisplayElement(marker, style as MarkerStyle);
        const areaElement = this.createMarkerAreaElement(marker);
        this._markers.set(marker.id, {
          styledElement,
          displayElement,
          areaElement,
          trackId,
        });
      });
    this._ui.onEvent$
      .pipe(filter((event) => affectsStyledElement(event, styledElement)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.toObservable(this._ui.resolveStyle<MarkerStyle>(styledElement))
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe(() => {
            this.updateMarkerStyle(marker.id, this._ui.resolveStyle<MarkerStyle>(styledElement) as MarkerStyle);
          });
      });
  }

  updateMarker(marker: MarkerState): void {
    this.updateMarkerPosition(marker);
  }

  removeMarker(markerId: Marker['id']): void {
    const marker = this._markers.get(markerId);
    if (marker) {
      this._markerDisplayContainer.removeChild(marker.displayElement);
      this._markerAreaContainer.removeChild(marker.areaElement);
      this._markers.delete(markerId);
    }
    this.updateClasses();
  }

  removeAllMarkers(): void {
    this.destroy$.next();
    this._tracks.clear();
    this._markerDisplayContainer.innerHTML = '';
    this._markerAreaContainer.innerHTML = '';
    this._markers.clear();
    this.updateClasses();
  }

  private loadMarkers(markerTracks: MarkerTrackState[]) {
    this._markerDisplayContainer.innerHTML = '';
    this._markerAreaContainer.innerHTML = '';
    this._markers.clear();
    for (const markerTrack of markerTracks) {
      for (const marker of markerTrack.timedItems) {
        this.addMarker(marker, markerTrack.id);
      }
    }
  }

  override handleEvent(evt: Event | MouseEvent): void {
    if (evt.type === 'input') {
      if (this._lastPreviewTime) {
        this._onSeek$.next(this._lastPreviewTime);
        delete this._lastPreviewTime;
      } else {
        const detail = this.getTimeFromRangeValue();
        this._onSeek$.next(detail);
      }
      this.updateBar();
    } else if (evt.type === 'pointermove' && evt instanceof MouseEvent) {
      const duration = this.mediaSeekableEnd;
      if (duration) {
        const previewTime = this.getRangeValueFromMouseEvent(evt) * duration;
        this._lastPreviewTime = previewTime;
        this._onMouseOver$.next(previewTime);
      }
      super.handleEvent(evt);
    } else {
      super.handleEvent(evt);
    }
  }

  override attributeChangedCallback(attrName: string, oldValue: string | null, newValue: string | null): void {
    if (attrName === MediaUIAttributes.MEDIA_BUFFERED && newValue) {
      const bufferingStart = newValue.split(':')[0];
      if (bufferingStart && parseFloat(bufferingStart) > 0 && parseFloat(bufferingStart) < 0.1) {
        newValue = newValue.replace(bufferingStart, '0');
        this.setAttribute(MediaUIAttributes.MEDIA_BUFFERED, newValue);
      }
    } else if (attrName === MediaUIAttributes.MEDIA_DURATION && newValue === null) {
      this.range.valueAsNumber = 0;
      this.updateBar();
    }
    super.attributeChangedCallback(attrName, oldValue, newValue);
  }

  destroy(): void {
    this._destroyBreaker.destroy();
    this.remove();
  }

  private getMarkerStart(marker: MarkerState): number {
    if (marker.temporal.type === TimedItemTemporalType.MOMENT) {
      return parseFloat(marker.temporal.time);
    } else if (marker.temporal.type === TimedItemTemporalType.SPAN || marker.temporal.type === TimedItemTemporalType.SPAN_START) {
      return parseFloat(marker.temporal.start);
    } else if (marker.temporal.type === TimedItemTemporalType.SPAN_END) {
      return parseFloat(marker.temporal.end);
    } else {
      return 0;
    }
  }

  private getMarkerEnd(marker: MarkerState): number {
    if (marker.temporal.type === TimedItemTemporalType.MOMENT) {
      return parseFloat(marker.temporal.time);
    } else if (marker.temporal.type === TimedItemTemporalType.SPAN || marker.temporal.type === TimedItemTemporalType.SPAN_END) {
      return parseFloat(marker.temporal.end);
    } else if (marker.temporal.type === TimedItemTemporalType.SPAN_START) {
      return parseFloat(marker.temporal.start);
    } else {
      return 0;
    }
  }

  private createMarkerDisplayElement(marker: MarkerState, style: MarkerStyle): HTMLDivElement {
    const markerStart = this.getMarkerStart(marker);
    const markerEnd = this.getMarkerEnd(marker);
    const mediaDuration = this.mediaDuration ?? 0;
    const markerElement = DomUtil.createElement('div');
    markerElement.classList.add(OmakaseTimeRangeDomClasses.MARKER_DISPLAY);
    markerElement.setAttribute(OmakaseTimeRangeAttributes.MARKER_ID, marker.id);
    markerElement.style.backgroundColor = style.markerColor;
    const markerPosition = markerStart / mediaDuration;
    const markerSize = (markerEnd - markerStart) / mediaDuration;
    markerElement.style.width = DomUtil.getPercentValue(markerSize);
    markerElement.style.left = DomUtil.getPercentValue(markerPosition);
    const markerHalo = DomUtil.createElement('div');
    markerHalo.classList.add(OmakaseTimeRangeDomClasses.MARKER_HALO);
    markerHalo.style.backgroundColor = style.markerColor;
    markerElement.appendChild(markerHalo);
    this._markerDisplayContainer.appendChild(markerElement);
    return markerElement;
  }

  private createMarkerAreaElement(marker: MarkerState): HTMLDivElement {
    const markerStart = this.getMarkerStart(marker);
    const markerEnd = this.getMarkerEnd(marker);
    const mediaDuration = this.mediaDuration ?? 0;
    const markerElement = DomUtil.createElement('div');
    markerElement.classList.add(OmakaseTimeRangeDomClasses.MARKER_AREA);
    markerElement.setAttribute(OmakaseTimeRangeAttributes.MARKER_ID, marker.id);
    const markerPosition = markerStart / mediaDuration;
    const markerSize = (markerEnd - markerStart) / mediaDuration;
    markerElement.style.width = DomUtil.getPercentValue(markerSize);
    markerElement.style.left = DomUtil.getPercentValue(markerPosition);
    markerElement.addEventListener('mousemove', (event) => {
      this.updateFocusedMarkers(event);
    });
    markerElement.addEventListener('mouseleave', () => {
      this.unfocusAllMarkers();
    });
    markerElement.addEventListener('click', () => {
      this._onMarkerClick$.next({markerId: marker.id});
    });
    markerElement.addEventListener('mousedown', (event) => {
      const rangeValue = this.getRangeValueFromMouseEvent(event);
      this._rangeElement.valueAsNumber = rangeValue;
      this._onSeek$.next(this.getTimeFromRangeValue(rangeValue));
      this.updateBar();
    });
    this._markerAreaContainer.appendChild(markerElement);
    return markerElement;
  }

  private updateFocusedMarkers(event: MouseEvent) {
    const rootNode = this.getRootNode() instanceof ShadowRoot ? this.shadowRoot! : document;
    const markerElementsUnderCursor = rootNode.elementsFromPoint(event.clientX, event.clientY).filter((element) => element.classList.contains(OmakaseTimeRangeDomClasses.MARKER_AREA));
    const markersToFocus = markerElementsUnderCursor.map((element) => this._markers.get(element.getAttribute(OmakaseTimeRangeAttributes.MARKER_ID)!)!);
    const markersToUnfocus = Array.from(this._focusedMarkers).filter((marker) => !markersToFocus.includes(marker));
    markersToUnfocus.forEach((marker) => {
      this._focusedMarkers.delete(marker);
      marker.displayElement.classList.remove(OmakaseTimeRangeDomClasses.FOCUSED);
      this._onMarkerMouseLeave$.next({markerId: marker.displayElement.getAttribute(OmakaseTimeRangeAttributes.MARKER_ID)!});
    });
    markersToFocus
      .filter((marker) => !this._focusedMarkers.has(marker))
      .forEach((marker) => {
        this._focusedMarkers.add(marker);
        marker.displayElement.classList.add(OmakaseTimeRangeDomClasses.FOCUSED);
        this._onMarkerMouseEnter$.next({markerId: marker.displayElement.getAttribute(OmakaseTimeRangeAttributes.MARKER_ID)!});
      });
  }

  private unfocusAllMarkers() {
    this._focusedMarkers.forEach((marker) => {
      this._focusedMarkers.delete(marker);
      marker.displayElement.classList.remove(OmakaseTimeRangeDomClasses.FOCUSED);
      this._onMarkerMouseLeave$.next({markerId: marker.displayElement.getAttribute(OmakaseTimeRangeAttributes.MARKER_ID)!});
    });
  }

  private updateMarkerPosition(markerState: MarkerState) {
    const marker = this._markers.get(markerState.id);
    if (marker) {
      const markerStart = this.getMarkerStart(markerState);
      const markerEnd = this.getMarkerEnd(markerState);
      const mediaDuration = this.mediaDuration ?? 0;
      const markerPosition = markerStart / mediaDuration;
      const markerSize = (markerEnd - markerStart) / mediaDuration;
      marker.displayElement.style.width = DomUtil.getPercentValue(markerSize);
      marker.displayElement.style.left = DomUtil.getPercentValue(markerPosition);
      marker.areaElement.style.width = DomUtil.getPercentValue(markerSize);
      marker.areaElement.style.left = DomUtil.getPercentValue(markerPosition);
    }
  }

  private updateMarkerStyle(markerId: string, style: MarkerStyle) {
    const marker = this._markers.get(markerId);
    if (marker) {
      marker.displayElement.style.backgroundColor = style.markerColor;
      const markerHalo = marker.displayElement.querySelector(`.${OmakaseTimeRangeDomClasses.MARKER_HALO}`) as HTMLElement;
      if (markerHalo) {
        markerHalo.style.backgroundColor = style.markerColor;
      }
    }
  }

  private updateClasses() {
    const hasMarkers = this._markers.size > 0;
    const parentControlBar = this.closest('media-control-bar');
    if (hasMarkers) {
      this.classList.add(OmakaseTimeRangeDomClasses.HAS_MARKERS);
      if (parentControlBar) {
        parentControlBar.classList.add(OmakaseTimeRangeDomClasses.HAS_MARKERS);
      }
    } else {
      this.classList.remove(OmakaseTimeRangeDomClasses.HAS_MARKERS);
      if (parentControlBar) {
        parentControlBar.classList.remove(OmakaseTimeRangeDomClasses.HAS_MARKERS);
      }
    }
  }

  private toObservable<T>(value: T | Observable<T>): Observable<T> {
    return isObservable(value) ? value : of(value);
  }

  private getRangeValueFromMouseEvent(event: MouseEvent): number {
    const rects = this._rangeElement.getBoundingClientRect();
    let rangeValue = (event.clientX - rects.x) / rects.width;
    rangeValue = Math.max(0, Math.min(1, rangeValue));
    return rangeValue;
  }

  private getTimeFromRangeValue = (value?: number): number => {
    value = value ?? this._rangeElement.valueAsNumber;
    const startTime = Number.isFinite(this.mediaSeekableStart) ? this.mediaSeekableStart : 0;
    const endTime = Number.isFinite(this.mediaDuration) ? this.mediaDuration : this.mediaSeekableEnd;
    if (Number.isNaN(endTime) || isNullOrUndefined(endTime)) {
      return 0;
    }
    return value * (endTime! - startTime) + startTime;
  };
}
