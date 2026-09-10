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
import type {UiLiveModel} from '../../live/live-model';

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
  markerState: MarkerState;
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
  private _rangeElementWidth = 0;
  private _thumbElementWidth = 12;
  private _rangeResizeObserver: ResizeObserver;
  private _thumbElement?: HTMLElement | null;
  private _lastPreviewTime?: number;
  private _previewActive = false; // cursor is over the scrubber (preview showing)
  private _previewAtLive = false; // cursor is over the ball of the scrubber
  private _lastPreviewRangeValue: number | undefined;
  protected _destroyBreaker = new ObserverBreaker();

  private _live = false;
  private _windowStart = 0;
  private _windowEnd = 0;
  private _pinnedToLive = false;
  private _pinnedToEnd = false;
  private _liveModelApplied = false;

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
        overflow-x: hidden;
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
    this._thumbElement = this.shadowRoot!.querySelector('#thumb');
    this._rangeElement.addEventListener('keydown', (e) => {
      e.preventDefault();
    });

    this._rangeElementWidth = this._rangeElement.offsetWidth;
    this._thumbElementWidth = this._thumbElement?.offsetWidth || this._thumbElementWidth;
    this._rangeResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this._rangeElement) {
          this._rangeElementWidth = entry.contentRect.width;
        } else if (entry.target === this._thumbElement) {
          this._thumbElementWidth = entry.contentRect.width;
        }
      }
    });
    this._rangeResizeObserver.observe(this._rangeElement);
    if (this._thumbElement) {
      this._rangeResizeObserver.observe(this._thumbElement);
    }

    this.addEventListener('pointerleave', () => {
      this._previewActive = false;
      this._previewAtLive = false;
      this._lastPreviewRangeValue = undefined;
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

  // overrides for live only
  override get mediaSeekableStart(): number {
    return this._live ? this._windowStart : super.mediaSeekableStart;
  }

  override get mediaSeekableEnd(): number | undefined {
    return this._live ? this._windowEnd : super.mediaSeekableEnd;
  }

  override get mediaDuration(): number | undefined {
    return this._live ? this._windowEnd : super.mediaDuration;
  }

  override set mediaDuration(value: number | undefined) {
    super.mediaDuration = value;
  }

  private _seekWindow(): {start: number; end: number} {
    const start = Number.isFinite(this.mediaSeekableStart) ? this.mediaSeekableStart : 0;
    const duration = this.mediaDuration;
    const end = duration != null && Number.isFinite(duration) ? duration : (this.mediaSeekableEnd ?? 0);
    return {start, end};
  }

  /** Maps a media time to its 0..1 range value within the current seek window (0 when the window is empty). */
  private _fractionForTime(time: number): number {
    const {start, end} = this._seekWindow();
    return end > start ? Math.max(0, Math.min(1, (time - start) / (end - start))) : 0;
  }

  setLiveModel(model: UiLiveModel): void {
    // syncPosition is not consumed here, so a tick that only moves it changes nothing to render
    if (this._liveModelApplied && this._live === model.isLive && this._windowStart === model.windowStart && this._windowEnd === model.windowEnd && this._pinnedToLive === model.pinnedToLive) {
      return;
    }
    this._liveModelApplied = true;
    if (!model.isLive) {
      this._releaseEndPin();
    }
    this._live = model.isLive;
    this._windowStart = model.windowStart;
    this._windowEnd = model.windowEnd;
    this._pinnedToLive = model.pinnedToLive;
    this._renderWindow();
    this._refreshPreview();
    for (const [markerId, marker] of this._markers) {
      this.updateMarkerPosition(marker.markerState);
    }
  }

  private _renderWindow(): void {
    const {start, end} = this._seekWindow();
    if (end > start) {
      this.range.valueAsNumber = this._fractionForTime(this.mediaCurrentTime ?? 0);
      this.updateBar();
    }
  }

  /**
   * Re-derives the hover popover from the last cursor position against the current window. Called on
   * pointer move, playback progress, and manifest updates (new segment) so the popover stays correct as
   * the scrubber recalculates. Over the thumb at live it shows the (ticking) live current time.
   */
  private _refreshPreview(): void {
    if (!this._previewActive || this._lastPreviewRangeValue == null) {
      return;
    }
    const {start, end} = this._seekWindow();
    if (!(end > start)) {
      return;
    }
    const rangeValue = this._lastPreviewRangeValue;
    this._previewAtLive = this._live && this._isOverBall(rangeValue);
    const previewTime = this._previewAtLive ? this._liveCurrentTime() : start + rangeValue * (end - start);
    this._lastPreviewTime = previewTime;
    this._onMouseOver$.next(previewTime);
  }

  /** True when the cursor (as a 0..1 range value) is over the thumb ("ball"), i.e. the playhead position. */
  private _isOverBall(rangeValue: number): boolean {
    const width = this._rangeElementWidth;
    if (width <= 0) {
      return false;
    }
    const ballHalf = this._thumbElementWidth / 2 / width;
    return Math.abs(rangeValue - this.range.valueAsNumber) <= ballHalf;
  }

  /** Fresh live playhead time (player value at call time); falls back to the throttled attribute. */
  private _liveCurrentTime(): number {
    try {
      return this._player ? this._player.getCurrentTime() : (this.mediaCurrentTime ?? 0);
    } catch {
      return this.mediaCurrentTime ?? 0;
    }
  }

  private _nearStart(): boolean {
    const currentTime = this.mediaCurrentTime;
    if (!this._live || currentTime == null) {
      return false;
    }
    return currentTime <= this._windowStart;
  }

  /**
   * Holds the thumb at the end once it has reached it.
   *
   */
  override updateBar(): void {
    if (this._live) {
      if (this._pinnedToEnd || this._pinnedToLive) {
        this.range.valueAsNumber = 1;
      } else if (this._nearStart()) {
        this.range.valueAsNumber = 0;
      }

      if (this.range.valueAsNumber >= 1) {
        this._pinnedToEnd = true;
      }
    }
    super.updateBar();
  }

  /** Pause, stall or seek - playback is no longer simply running on at the end. */
  private _releaseEndPin(): void {
    this._pinnedToEnd = false;
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
    this._player.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      if (event.type === PlayerEventType.PLAYER_PAUSE || event.type === PlayerEventType.PLAYER_BUFFERING) {
        this._releaseEndPin();
      }

      if (event.type === PlayerEventType.PLAYER_SEEKING) {
        // A seek lands wherever it lands; reaching the end again re-pins on the next update.
        this._releaseEndPin();
        this.range.valueAsNumber = this._fractionForTime(event.data.toTime);
        this.updateBar();
        this._previewAtLive = false;
        if (this._previewActive) {
          this._lastPreviewTime = event.data.toTime;
          this._onMouseOver$.next(event.data.toTime);
        }
      } else if (event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS) {
        this._refreshPreview();
      }
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
          markerState: marker,
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

  updateMarker(markerState: MarkerState): void {
    const marker = this._markers.get(markerState.id);
    if (marker) {
      marker.markerState = markerState;
      this.updateMarkerPosition(markerState);
    }
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
      const seekTime = this._lastPreviewTime ?? this.getTimeFromRangeValue();
      delete this._lastPreviewTime;
      this._onSeek$.next(seekTime);
      this.updateBar();
    } else if (evt.type === 'pointermove' && evt instanceof MouseEvent) {
      this._previewActive = true;
      this._lastPreviewRangeValue = this.getRangeValueFromMouseEvent(evt);
      this._refreshPreview();
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
    this._rangeResizeObserver.disconnect();
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
    const markerElement = DomUtil.createElement('div');
    markerElement.classList.add(OmakaseTimeRangeDomClasses.MARKER_DISPLAY);
    markerElement.setAttribute(OmakaseTimeRangeAttributes.MARKER_ID, marker.id);
    markerElement.style.backgroundColor = style.markerColor;
    if (this.mediaSeekableEnd) {
      const markerPosition = (markerStart - this.mediaSeekableStart) / (this.mediaSeekableEnd - this.mediaSeekableStart);
      const markerSize = (markerEnd - markerStart) / (this.mediaSeekableEnd - this.mediaSeekableStart);
      markerElement.style.width = DomUtil.getPercentValue(markerSize);
      markerElement.style.left = DomUtil.getPercentValue(markerPosition);
    } else {
      markerElement.style.display = 'none';
    }

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
    const markerElement = DomUtil.createElement('div');
    markerElement.classList.add(OmakaseTimeRangeDomClasses.MARKER_AREA);
    markerElement.setAttribute(OmakaseTimeRangeAttributes.MARKER_ID, marker.id);
    if (this.mediaSeekableEnd) {
      const markerPosition = (markerStart - this.mediaSeekableStart) / (this.mediaSeekableEnd - this.mediaSeekableStart);
      const markerSize = (markerEnd - markerStart) / (this.mediaSeekableEnd - this.mediaSeekableStart);
      markerElement.style.width = DomUtil.getPercentValue(markerSize);
      markerElement.style.left = DomUtil.getPercentValue(markerPosition);
    } else {
      markerElement.style.display = 'none';
    }
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
      if (this.mediaSeekableEnd) {
        const markerPosition = (markerStart - this.mediaSeekableStart) / (this.mediaSeekableEnd - this.mediaSeekableStart);
        const markerSize = (markerEnd - markerStart) / (this.mediaSeekableEnd - this.mediaSeekableStart);
        marker.displayElement.style.removeProperty('display');
        marker.displayElement.style.width = DomUtil.getPercentValue(markerSize);
        marker.displayElement.style.left = DomUtil.getPercentValue(markerPosition);
        marker.areaElement.style.width = DomUtil.getPercentValue(markerSize);
        marker.areaElement.style.left = DomUtil.getPercentValue(markerPosition);
      } else {
        marker.displayElement.style.display = 'none';
      }
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
