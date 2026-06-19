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

import {filter, isObservable, merge, Observable, of, Subject, takeUntil, zip} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import {MarkerType, TimedItemTemporalUtil, type Marker, type MarkerState, type MarkerTrackState, type TimedItemTemporal} from '../../media';
import {CryptoUtil} from '../../util/crypto-util';
import {
  ChromingMarkerBarElementEventType,
  type MarkerOnChromingStyle,
  type ChromingMarkerBarConfig,
  type ChromingMarkerBarElementApi,
  type ChromingMarkerBarElementEvent,
} from '../chroming-marker-bar';
import {TimedItemTemporalType, type MomentTemporal, type SpanTemporal} from '../../media';
import {DomUtil} from '../../dom/dom-util';
import {affectsStyledElement, Ui, type StyledElement} from '../../ui';
import type {UiProxy} from '../../remoting/impl/ui-proxy';
import Decimal from 'decimal.js';
import {isNullOrUndefined} from '../../util/util-functions';

export const OmakaseMarkerTrackAttributes = {
  OMAKASE: 'omakase',
  MEDIA_DURATION: 'mediaduration',
  MARKER_ID: 'data-marker-id',
};

export const OmakaseMarkerTrackDomClasses = {
  ACTIVE_MARKER: 'active-marker',
  FOCUSED_MARKER: 'focused-marker',
  READONLY_MARKER: 'readonly-marker',
  CONTAINER: 'omakase-marker-bar-container',
  MOMENT_MARKER: 'omakase-moment-marker',
  MOMENT_MARKER_CIRCLE: 'omakase-moment-marker-circle',
  MOMENT_MARKER_LINE: 'omakase-moment-marker-line',
  MOMENT_MARKER_SELECTED_AREA: 'omakase-moment-marker-selected-area',
  PERIOD_MARKER: 'omakase-period-marker',
  PERIOD_MARKER_RECTANGLE: 'omakase-period-marker-rectangle',
  PERIOD_MARKER_START_LINE: 'omakase-period-marker-start-line',
  PERIOD_MARKER_END_LINE: 'omakase-period-marker-end-line',
  PERIOD_MARKER_SELECTED_AREA: 'omakase-period-marker-selected-area',
};

export interface OmakaseMarkerBarMarker {
  state: MarkerState;
  trackId: MarkerTrackState['id'];
  styledElement: StyledElement<MarkerOnChromingStyle>;
  displayElement: HTMLDivElement;
}

export class OmakaseMarkerBar extends HTMLElement implements ChromingMarkerBarElementApi {
  protected readonly _onEvent$: Subject<ChromingMarkerBarElementEvent> = new Subject<ChromingMarkerBarElementEvent>();

  private _markers: Map<MarkerState['id'], OmakaseMarkerBarMarker> = new Map();
  private _tracks: Map<MarkerTrackState['id'], MarkerTrackState> = new Map();
  private _config: ChromingMarkerBarConfig = {
    id: CryptoUtil.uuid(),
    visible: true,
  };
  private _containerSize?: number | undefined;
  private _container?: HTMLDivElement;
  private _draggingPointMarker?: HTMLDivElement;
  private _draggingPeriodMarker?: HTMLDivElement;
  private _draggingPeriodMarkerEnd?: 'start' | 'end';
  private _markerMoved = false;
  private _markerDragStartTime?: Date;
  private _markerDragDelay = 100;
  private _mouseupListener?: (event: MouseEvent) => void;
  private _mousemoveListener?: (event: MouseEvent) => void;
  private _resizeObserver = new ResizeObserver(() => {
    for (const marker of this._markers.values()) {
      this.updateMarkerSize(marker.displayElement);
    }
  });
  private _uiOrUiProxy?: UiProxy | Ui | undefined;

  private _destroyBreaker = new ObserverBreaker();

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
    return this._tracks.values().toArray();
  }

  set markerTracks(markerTracks: MarkerTrackState[]) {
    for (const markerTrack of markerTracks) {
      this._tracks.set(markerTrack.id, markerTrack);
    }
    this.loadMarkers(markerTracks);
  }

  get mediaDuration(): number {
    return parseFloat(this.getAttribute(OmakaseMarkerTrackAttributes.MEDIA_DURATION) ?? '0');
  }

  set mediaDuration(duration: number) {
    this.setAttribute(OmakaseMarkerTrackAttributes.MEDIA_DURATION, duration.toString());
    this.updateMarkers(
      this._markers
        .values()
        .toArray()
        .map((marker) => marker.state)
    );
  }

  set containerSize(containerSize: number | undefined) {
    this._containerSize = containerSize;
    if (containerSize) {
      this._container!.style.width = `${containerSize}px`;
    }
    this.updateMarkers(
      this._markers
        .values()
        .toArray()
        .map((marker) => marker.state)
    );
  }

  get destroy$(): Observable<void> {
    return this._destroyBreaker.observer;
  }

  get onEvent$(): Observable<ChromingMarkerBarElementEvent> {
    return this._onEvent$.asObservable();
  }

  get isOmakase() {
    return this.hasAttribute(OmakaseMarkerTrackAttributes.OMAKASE);
  }

  set isOmakase(isOmakase: boolean) {
    if (isOmakase) {
      this.setAttribute(OmakaseMarkerTrackAttributes.OMAKASE, '');
    } else {
      this.removeAttribute(OmakaseMarkerTrackAttributes.OMAKASE);
    }
  }

  protected get _ui(): Ui | UiProxy {
    if (this._uiOrUiProxy === void 0) {
      throw new Error('called to early');
    }
    return this._uiOrUiProxy;
  }

  setUiOrUiProxy(ui: UiProxy | Ui) {
    this._uiOrUiProxy = ui;
  }

  connectedCallback() {
    this._container = document.createElement('div');
    this._container.classList.add(OmakaseMarkerTrackDomClasses.CONTAINER);
    this._container.onclick = (event) => {
      event.stopPropagation();
    };
    this._mouseupListener = () => setTimeout(() => this.clearDraggingMarker(), 0);
    document.addEventListener('mouseup', this._mouseupListener);
    this._mousemoveListener = this.moveDraggingMarker.bind(this);
    document.addEventListener('mousemove', this._mousemoveListener);
    this.appendChild(this._container);
    if (!this._containerSize) {
      this._containerSize = this._container.offsetWidth;
    }
    this._resizeObserver.observe(this._container);
  }

  disconnectedCallback() {
    if (this._mouseupListener) {
      document.removeEventListener('mouseup', this._mouseupListener);
    }
    if (this._mousemoveListener) {
      document.removeEventListener('mousemove', this._mousemoveListener);
    }
    this._resizeObserver.disconnect();
    this._destroyBreaker.destroy();
  }

  hide(): void {
    this._config.visible = false;
    DomUtil.hideElements(this);
  }

  show(): void {
    this._config.visible = true;
    DomUtil.showElements(this);
  }

  addTrack(track: MarkerTrackState) {
    this._tracks.set(track.id, track);
    track.timedItems.forEach((marker) => {
      this.addMarker(marker, track.id);
    });
  }

  removeTrack(track: MarkerTrackState) {
    this._tracks.delete(track.id);
    for (const marker of this._markers.values()) {
      if (marker.trackId === track.id) {
        this.removeMarker(marker.state.id);
      }
    }
  }

  updateTrack(trackState: MarkerTrackState) {
    const track = this._tracks.get(trackState.id);
    const editableChanged = track?.timedItemsLocked !== trackState.timedItemsLocked;
    this._tracks.set(trackState.id, trackState);
    for (const markerState of trackState.timedItems) {
      const marker = this._markers.get(markerState.id);
      if (marker) {
        marker.state = markerState;
        if (editableChanged) {
          this.updateMarkerEditable(markerState.id);
        }
      } else {
        this.addMarker(markerState, trackState.id);
      }
    }
  }

  hasTrack(trackId: string): boolean {
    return this._tracks.has(trackId);
  }

  addMarker(marker: MarkerState, trackId: MarkerTrackState['id']) {
    const track = this._tracks.get(trackId);

    if (!track) {
      return;
    }

    const styledElement = {
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

    this.toObservable(this._ui.resolveStyle<MarkerOnChromingStyle>(styledElement))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((style) => {
        let duration = TimedItemTemporalUtil.extractDuration(marker.temporal);
        if (
          marker.temporal.type === TimedItemTemporalType.MOMENT ||
          (marker.temporal.type === TimedItemTemporalType.SPAN && style.momentToSpanningThreshold && duration !== undefined && new Decimal(style.momentToSpanningThreshold).greaterThan(duration))
        ) {
          const displayElement = this.addMomentMarker(marker, track, style as MarkerOnChromingStyle);
          this._markers.set(marker.id, {state: marker, displayElement, styledElement, trackId: track.id});
        } else if (marker.temporal.type === TimedItemTemporalType.SPAN || marker.temporal.type === TimedItemTemporalType.SPAN_START || marker.temporal.type === TimedItemTemporalType.SPAN_END) {
          const displayElement = this.addPeriodMarker(marker, track, style as MarkerOnChromingStyle);
          this._markers.set(marker.id, {state: marker, displayElement, styledElement, trackId: track.id});
        }
      });
    this._ui.onEvent$
      .pipe(filter((event) => affectsStyledElement(event, styledElement)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.toObservable(this._ui.resolveStyle<MarkerOnChromingStyle>(styledElement))
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe((style) => {
            this.updateMarkerStyle(marker.id, style as MarkerOnChromingStyle);
          });
      });
  }

  updateMarker(markerState: MarkerState) {
    const marker = this._markers.get(markerState.id);
    if (marker) {
      marker.state = markerState;
      this.toObservable(this._ui.resolveStyle<MarkerOnChromingStyle>(marker.styledElement)).subscribe((style) => {
        this.updateMarkerStyle(markerState.id, style as MarkerOnChromingStyle);
        if (marker.displayElement.classList.contains(OmakaseMarkerTrackDomClasses.MOMENT_MARKER)) {
          this.updateMomentMarker(marker.state);
        } else if (marker.displayElement.classList.contains(OmakaseMarkerTrackDomClasses.PERIOD_MARKER)) {
          this.updatePeriodMarker(marker.state);
        }
      });
    }
  }

  private loadMarkers(markerTracks: MarkerTrackState[]) {
    this.removeAllMarkers();
    for (const markerTrack of markerTracks) {
      for (const marker of markerTrack.timedItems) {
        this.addMarker(marker, markerTrack.id);
      }
    }
  }

  private updateMarkers(markers: MarkerState[]) {
    for (const marker of markers) {
      if (marker.markerType === MarkerType.MOMENT_MARKER) {
        this.updateMomentMarker(marker);
      } else if (marker.markerType === MarkerType.SPANNING_MARKER) {
        this.updatePeriodMarker(marker);
      }
    }
  }

  private addMomentMarker(marker: MarkerState, track: MarkerTrackState, style: MarkerOnChromingStyle) {
    const isEditable = !track.timedItemsLocked;
    const markerContainer = document.createElement('div');
    const circleDiv = document.createElement('div');
    const containerHeight = this._container!.offsetHeight;
    circleDiv.style.width = DomUtil.getPixelValue(containerHeight / 2);
    if (this.isOmakase) {
      circleDiv.style.height = DomUtil.getPixelValue(containerHeight);
    } else {
      circleDiv.style.height = DomUtil.getPixelValue(containerHeight / 2);
      circleDiv.style.top = DomUtil.getPixelValue(containerHeight / 4);
    }
    circleDiv.style.transform = `translateX(${DomUtil.getPixelValue(-containerHeight / 4)})`;
    circleDiv.style.backgroundColor = style.markerColor;
    circleDiv.classList.add(OmakaseMarkerTrackDomClasses.MOMENT_MARKER_CIRCLE);
    markerContainer.appendChild(circleDiv);
    const lineDiv = document.createElement('div');
    lineDiv.style.height = DomUtil.getPixelValue(containerHeight);
    lineDiv.style.backgroundColor = style.markerColor;
    lineDiv.classList.add(OmakaseMarkerTrackDomClasses.MOMENT_MARKER_LINE);
    markerContainer.appendChild(lineDiv);
    const selectedDiv = document.createElement('div');
    selectedDiv.style.height = DomUtil.getPixelValue(containerHeight);
    selectedDiv.style.backgroundColor = style.markerColor;
    if (this.isOmakase) {
      selectedDiv.style.width = circleDiv.style.width;
    }
    selectedDiv.classList.add(OmakaseMarkerTrackDomClasses.MOMENT_MARKER_SELECTED_AREA);
    markerContainer.appendChild(selectedDiv);
    markerContainer.style.left = DomUtil.getPixelValue(((TimedItemTemporalUtil.extractStartTime(marker.temporal) ?? 0) * this._containerSize!) / this.mediaDuration);
    markerContainer.classList.add(OmakaseMarkerTrackDomClasses.MOMENT_MARKER);
    markerContainer.setAttribute(OmakaseMarkerTrackAttributes.MARKER_ID, marker.id);
    if (isEditable) {
      markerContainer.onmousedown = (event) => {
        event.stopPropagation();
        this._draggingPointMarker = markerContainer;
        this._markerDragStartTime = new Date();
      };
    } else {
      markerContainer.classList.add(OmakaseMarkerTrackDomClasses.READONLY_MARKER);
    }
    if (style.active) {
      markerContainer.classList.add(OmakaseMarkerTrackDomClasses.ACTIVE_MARKER);
    }
    markerContainer.onclick = (event) => {
      event.stopPropagation();
      if (!this._markerMoved) {
        this._onEvent$.next({type: ChromingMarkerBarElementEventType.CHROMING_MARKER_CLICK, data: {item: this.getMarkerStateOrFail(marker.id)}});
      }
    };
    markerContainer.onmouseenter = () => {
      this.focusMarker(marker.id);
      this._onEvent$.next({type: ChromingMarkerBarElementEventType.CHROMING_MARKER_FOCUS, data: {item: this.getMarkerStateOrFail(marker.id)}});
    };
    markerContainer.onmouseleave = (event) => {
      this._onEvent$.next({type: ChromingMarkerBarElementEventType.CHROMING_MARKER_UNFOCUS, data: {item: this.getMarkerStateOrFail(marker.id)}});
    };
    this._container!.appendChild(markerContainer);
    return markerContainer;
  }

  private addPeriodMarker(marker: MarkerState, track: MarkerTrackState, style: MarkerOnChromingStyle) {
    const isEditable = !track.timedItemsLocked;
    const markerContainer = document.createElement('div');
    const rectangleDiv = document.createElement('div');
    const containerHeight = this._container!.offsetHeight;
    if (this.isOmakase) {
      rectangleDiv.style.height = DomUtil.getPixelValue(containerHeight);
    } else {
      rectangleDiv.style.height = DomUtil.getPixelValue(containerHeight / 2);
      rectangleDiv.style.top = DomUtil.getPixelValue(containerHeight / 4);
    }
    rectangleDiv.style.backgroundColor = style.markerColor;
    rectangleDiv.classList.add(OmakaseMarkerTrackDomClasses.PERIOD_MARKER_RECTANGLE);
    markerContainer.appendChild(rectangleDiv);
    const startLine = document.createElement('div');
    startLine.style.height = DomUtil.getPixelValue(containerHeight);
    startLine.style.backgroundColor = style.markerColor;
    startLine.classList.add(OmakaseMarkerTrackDomClasses.PERIOD_MARKER_START_LINE);
    markerContainer.appendChild(startLine);
    const endLine = document.createElement('div');
    endLine.style.height = DomUtil.getPixelValue(containerHeight);
    endLine.style.backgroundColor = style.markerColor;
    endLine.classList.add(OmakaseMarkerTrackDomClasses.PERIOD_MARKER_END_LINE);
    markerContainer.appendChild(endLine);
    const selectedDiv = document.createElement('div');
    selectedDiv.style.height = DomUtil.getPixelValue(containerHeight);
    selectedDiv.style.backgroundColor = style.markerColor;
    selectedDiv.classList.add(OmakaseMarkerTrackDomClasses.PERIOD_MARKER_SELECTED_AREA);
    markerContainer.appendChild(selectedDiv);
    const startTime = TimedItemTemporalUtil.extractStartTime(marker.temporal)!;
    const endTime = TimedItemTemporalUtil.extractEndTime(marker.temporal)!;
    markerContainer.style.left = DomUtil.getPixelValue((startTime * this._containerSize!) / this.mediaDuration);
    markerContainer.style.right = DomUtil.getPixelValue(this._containerSize! - (endTime * this._containerSize!) / this.mediaDuration);
    markerContainer.classList.add(OmakaseMarkerTrackDomClasses.PERIOD_MARKER);
    markerContainer.setAttribute(OmakaseMarkerTrackAttributes.MARKER_ID, marker.id);
    if (isEditable) {
      startLine.onmousedown = (event) => {
        event.stopPropagation();
        this._draggingPeriodMarker = markerContainer;
        this._draggingPeriodMarkerEnd = 'start';
        this._markerDragStartTime = new Date();
      };
      endLine.onmousedown = (event) => {
        event.stopPropagation();
        this._draggingPeriodMarker = markerContainer;
        this._draggingPeriodMarkerEnd = 'end';
        this._markerDragStartTime = new Date();
      };
      startLine.onmouseenter = () => {
        this.focusMarker(marker.id);
      };
      endLine.onmouseenter = () => {
        this.focusMarker(marker.id);
      };
    } else {
      markerContainer.classList.add(OmakaseMarkerTrackDomClasses.READONLY_MARKER);
    }
    if (style.active) {
      markerContainer.classList.add(OmakaseMarkerTrackDomClasses.ACTIVE_MARKER);
    }
    markerContainer.onclick = (event) => {
      event.stopPropagation();
      if (!this._markerMoved) {
        this._onEvent$.next({type: ChromingMarkerBarElementEventType.CHROMING_MARKER_CLICK, data: {item: this.getMarkerStateOrFail(marker.id)}});
      }
    };
    markerContainer.onmouseenter = () => {
      this._onEvent$.next({type: ChromingMarkerBarElementEventType.CHROMING_MARKER_FOCUS, data: {item: this.getMarkerStateOrFail(marker.id)}});
    };
    markerContainer.onmouseleave = (event) => {
      this._onEvent$.next({type: ChromingMarkerBarElementEventType.CHROMING_MARKER_UNFOCUS, data: {item: this.getMarkerStateOrFail(marker.id)}});
    };
    this._container!.appendChild(markerContainer);
    return markerContainer;
  }

  private focusMarker(id: string): void {
    this.unfocusMarkers();
    this.getMarkerElement(id)?.classList.add(OmakaseMarkerTrackDomClasses.FOCUSED_MARKER);
  }

  private unfocusMarkers(): void {
    this._container!.querySelectorAll(`.${OmakaseMarkerTrackDomClasses.FOCUSED_MARKER}`).forEach((element) => {
      element.classList.remove(OmakaseMarkerTrackDomClasses.FOCUSED_MARKER);
    });
  }

  private clearDraggingMarker() {
    if (this._draggingPointMarker) {
      const markerId = this._draggingPointMarker.getAttribute(OmakaseMarkerTrackAttributes.MARKER_ID)!;
      const marker = this._markers.get(markerId);
      if (marker) {
        let temporal: SpanTemporal | MomentTemporal = this.getDraggingPointMarkerTime();
        if (marker.state.temporal.type === TimedItemTemporalType.SPAN) {
          temporal = {
            type: TimedItemTemporalType.SPAN,
            start: temporal.time,
            end: new Decimal(temporal.time).add(TimedItemTemporalUtil.extractDuration(marker.state.temporal) ?? 0).toString(),
          };
        }
        const attrs = {temporal};
        const track = this._tracks.get(marker.trackId)!;
        if (this.isMarkerTemporalChanged(markerId, attrs.temporal)) {
          this._onEvent$.next({
            type: ChromingMarkerBarElementEventType.CHROMING_MARKER_UPDATE,
            data: {
              item: this.getMarkerStateOrFail(markerId)!,
              attrs,
              track,
            },
          });
        }
      }
    }
    if (this._draggingPeriodMarker) {
      const markerId = this._draggingPeriodMarker.getAttribute(OmakaseMarkerTrackAttributes.MARKER_ID)!;
      const marker = this._markers.get(markerId)!;
      const track = this._tracks.get(marker.trackId)!;
      const attrs = {temporal: this.getDraggingPeriodMarkerTime()};
      if (this.isMarkerTemporalChanged(markerId, attrs.temporal)) {
        this._onEvent$.next({
          type: ChromingMarkerBarElementEventType.CHROMING_MARKER_UPDATE,
          data: {
            track,
            item: this.getMarkerStateOrFail(markerId)!,
            attrs,
          },
        });
      }
    }
    delete this._draggingPointMarker;
    delete this._markerDragStartTime;
    delete this._draggingPeriodMarker;
    delete this._draggingPeriodMarkerEnd;
    this._markerMoved = false;
  }

  private moveDraggingMarker(event: MouseEvent) {
    if (this._markerDragStartTime && new Date().getTime() - this._markerDragStartTime!.getTime() > this._markerDragDelay) {
      const x = Math.min(Math.max(event.clientX - this._container!.getBoundingClientRect().x, 0), this._container!.getBoundingClientRect().width);
      if (this._draggingPointMarker) {
        this._draggingPointMarker.style.left = DomUtil.getPixelValue(x);
        this._markerMoved = true;
      } else if (this._draggingPeriodMarker) {
        if (this._draggingPeriodMarkerEnd === 'start') {
          this._draggingPeriodMarker.style.left = DomUtil.getPixelValue(Math.min(x, this._containerSize! - parseFloat(this._draggingPeriodMarker.style.right)));
        } else if (this._draggingPeriodMarkerEnd === 'end') {
          this._draggingPeriodMarker.style.right = DomUtil.getPixelValue(
            Math.min(this._container!.getBoundingClientRect().width - x, this._containerSize! - parseFloat(this._draggingPeriodMarker.style.left))
          );
        }
        this._markerMoved = true;
      }
    }
  }

  private getDraggingPointMarkerTime(): MomentTemporal {
    return {
      type: TimedItemTemporalType.MOMENT,
      time: new Decimal(this.mediaDuration * (parseFloat(this._draggingPointMarker!.style.left) / this._containerSize!)).toDecimalPlaces(3).toString(),
    };
  }

  private getDraggingPeriodMarkerTime(): SpanTemporal {
    return {
      type: TimedItemTemporalType.SPAN,
      start: new Decimal(this.mediaDuration * (parseFloat(this._draggingPeriodMarker!.style.left) / this._containerSize!)).toDecimalPlaces(3).toString(),
      end: new Decimal(this.mediaDuration * ((this._containerSize! - parseFloat(this._draggingPeriodMarker!.style.right)) / this._containerSize!)).toDecimalPlaces(3).toString(),
    };
  }

  isMarkerTemporalChanged(id: MarkerState['id'], temporal: TimedItemTemporal) {
    const marker = this.getMarkerStateOrFail(id);
    if (temporal.type === TimedItemTemporalType.MOMENT) {
      return !(marker.temporal.type === TimedItemTemporalType.MOMENT && Decimal(marker.temporal.time).equals(Decimal(temporal.time)));
    } else if (temporal.type === TimedItemTemporalType.SPAN) {
      return !(marker.temporal.type === TimedItemTemporalType.SPAN && Decimal(marker.temporal.start).equals(Decimal(temporal.start)) && Decimal(marker.temporal.end).equals(Decimal(temporal.end)));
    } else {
      return true;
    }
  }

  private updateMomentMarker(marker: Pick<MarkerState, 'id' | 'temporal'>) {
    const markerElement = this.getMarkerElement(marker.id);
    const time = TimedItemTemporalUtil.extractStartTime(marker.temporal);
    if (markerElement && !isNullOrUndefined(time)) {
      markerElement.style.left = DomUtil.getPixelValue((time / this.mediaDuration) * this._containerSize!);
    }
  }

  private updatePeriodMarker(marker: Pick<MarkerState, 'id' | 'temporal'>) {
    const markerElement = this.getMarkerElement(marker.id);
    const startTime = TimedItemTemporalUtil.extractStartTime(marker.temporal);
    const endTime = TimedItemTemporalUtil.extractEndTime(marker.temporal);
    if (markerElement && !isNullOrUndefined(startTime) && !isNullOrUndefined(endTime)) {
      markerElement.style.left = DomUtil.getPixelValue((startTime / this.mediaDuration) * this._containerSize!);
      markerElement.style.right = DomUtil.getPixelValue(this._containerSize! - (endTime / this.mediaDuration) * this._containerSize!);
    }
  }

  private updateMarkerStyle(markerId: MarkerState['id'], style: MarkerOnChromingStyle) {
    const marker = this._markers.get(markerId);
    if (marker) {
      const track = this._tracks.get(marker.trackId)!;
      const markerElement = marker.displayElement;
      const duration = TimedItemTemporalUtil.extractDuration(marker.state.temporal);
      if (markerElement.classList.contains(OmakaseMarkerTrackDomClasses.MOMENT_MARKER)) {
        if (
          marker.state.temporal.type === TimedItemTemporalType.SPAN &&
          (!style.momentToSpanningThreshold || duration === undefined || new Decimal(style.momentToSpanningThreshold).lessThanOrEqualTo(duration))
        ) {
          markerElement.remove();
          marker.displayElement = this.addPeriodMarker(marker.state, track, style);
        } else {
          const circleDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.MOMENT_MARKER_CIRCLE}`) as HTMLDivElement | null;
          const lineDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.MOMENT_MARKER_LINE}`) as HTMLDivElement | null;
          const selectedDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.MOMENT_MARKER_SELECTED_AREA}`) as HTMLDivElement | null;
          if (circleDiv) {
            circleDiv.style.backgroundColor = style.markerColor;
          }
          if (lineDiv) {
            lineDiv.style.backgroundColor = style.markerColor;
          }
          if (selectedDiv) {
            selectedDiv.style.backgroundColor = style.markerColor;
          }
          this.updateMarkerActive(marker, style);
        }
      } else if (markerElement.classList.contains(OmakaseMarkerTrackDomClasses.PERIOD_MARKER)) {
        if (
          marker.state.temporal.type === TimedItemTemporalType.SPAN &&
          style.momentToSpanningThreshold &&
          duration !== undefined &&
          new Decimal(style.momentToSpanningThreshold).greaterThan(duration)
        ) {
          markerElement.remove();
          marker.displayElement = this.addMomentMarker(marker.state, track, style);
        } else {
          const rectangleDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_RECTANGLE}`) as HTMLDivElement | null;
          const startLine = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_START_LINE}`) as HTMLDivElement | null;
          const endLine = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_END_LINE}`) as HTMLDivElement | null;
          const selectedDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_SELECTED_AREA}`) as HTMLDivElement | null;
          if (rectangleDiv) {
            rectangleDiv.style.backgroundColor = style.markerColor;
          }
          if (startLine) {
            startLine.style.backgroundColor = style.markerColor;
          }
          if (endLine) {
            endLine.style.backgroundColor = style.markerColor;
          }
          if (selectedDiv) {
            selectedDiv.style.backgroundColor = style.markerColor;
          }
          this.updateMarkerActive(marker, style);
        }
      }
    }
  }

  private updateMarkerActive(marker: OmakaseMarkerBarMarker, style: MarkerOnChromingStyle) {
    if (style.active) {
      marker.displayElement.classList.add(OmakaseMarkerTrackDomClasses.ACTIVE_MARKER);
    } else {
      marker.displayElement.classList.remove(OmakaseMarkerTrackDomClasses.ACTIVE_MARKER);
    }
  }

  private updateMarkerEditable(markerId: MarkerState['id']) {
    const markerElement = this.getMarkerElement(markerId);
    const marker = this._markers.get(markerId);
    if (marker && markerElement) {
      const track = this._tracks.get(marker.trackId);
      const isEditable = !track?.timedItemsLocked;
      if (markerElement.classList.contains(OmakaseMarkerTrackDomClasses.MOMENT_MARKER)) {
        if (isEditable) {
          markerElement.onmousedown = (event) => {
            event.stopPropagation();
            this._draggingPointMarker = markerElement;
            this._markerDragStartTime = new Date();
          };
          markerElement.classList.remove(OmakaseMarkerTrackDomClasses.READONLY_MARKER);
        } else {
          markerElement.onmousedown = null;
          markerElement.classList.add(OmakaseMarkerTrackDomClasses.READONLY_MARKER);
        }
      } else if (markerElement.classList.contains(OmakaseMarkerTrackDomClasses.PERIOD_MARKER)) {
        const startLine = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_START_LINE}`) as HTMLDivElement | null;
        const endLine = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_END_LINE}`) as HTMLDivElement | null;
        if (isEditable) {
          if (startLine) {
            startLine.onmousedown = (event) => {
              event.stopPropagation();
              this._draggingPeriodMarker = markerElement;
              this._draggingPeriodMarkerEnd = 'start';
              this._markerDragStartTime = new Date();
            };
            startLine.onmouseenter = () => {
              this.focusMarker(markerId);
            };
          }
          if (endLine) {
            endLine.onmousedown = (event) => {
              event.stopPropagation();
              this._draggingPeriodMarker = markerElement;
              this._draggingPeriodMarkerEnd = 'end';
              this._markerDragStartTime = new Date();
            };
            endLine.onmouseenter = () => {
              this.focusMarker(markerId);
            };
          }
          markerElement.classList.remove(OmakaseMarkerTrackDomClasses.READONLY_MARKER);
        } else {
          if (startLine) {
            startLine.onmousedown = null;
            startLine.onmouseenter = null;
          }
          if (endLine) {
            endLine.onmousedown = null;
            endLine.onmouseenter = null;
          }
          markerElement.classList.add(OmakaseMarkerTrackDomClasses.READONLY_MARKER);
        }
      }
    }
  }

  private updateMarkerSize(markerElement: HTMLDivElement): void {
    if (markerElement.classList.contains(OmakaseMarkerTrackDomClasses.MOMENT_MARKER)) {
      const circleDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.MOMENT_MARKER_CIRCLE}`) as HTMLDivElement | null;
      const lineDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.MOMENT_MARKER_LINE}`) as HTMLDivElement | null;
      const selectedDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.MOMENT_MARKER_SELECTED_AREA}`) as HTMLDivElement | null;
      const containerHeight = this._container!.offsetHeight;
      if (circleDiv) {
        circleDiv.style.width = DomUtil.getPixelValue(containerHeight / 2);
        circleDiv.style.transform = `translateX(${DomUtil.getPixelValue(-containerHeight / 4)})`;
        if (this.isOmakase) {
          circleDiv.style.height = DomUtil.getPixelValue(containerHeight);
        } else {
          circleDiv.style.height = DomUtil.getPixelValue(containerHeight / 2);
          circleDiv.style.top = DomUtil.getPixelValue(containerHeight / 4);
        }
      }
      if (lineDiv) {
        lineDiv.style.height = DomUtil.getPixelValue(containerHeight);
      }
      if (selectedDiv) {
        selectedDiv.style.height = DomUtil.getPixelValue(containerHeight);
        if (this.isOmakase && circleDiv) {
          selectedDiv.style.transform = circleDiv.style.transform;
          selectedDiv.style.width = circleDiv.style.width;
        }
      }
    } else if (markerElement.classList.contains(OmakaseMarkerTrackDomClasses.PERIOD_MARKER)) {
      const rectangleDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_RECTANGLE}`) as HTMLDivElement | null;
      const startLine = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_START_LINE}`) as HTMLDivElement | null;
      const endLine = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_END_LINE}`) as HTMLDivElement | null;
      const selectedDiv = markerElement.querySelector(`.${OmakaseMarkerTrackDomClasses.PERIOD_MARKER_SELECTED_AREA}`) as HTMLDivElement | null;
      const containerHeight = this._container!.offsetHeight;
      if (rectangleDiv) {
        if (this.isOmakase) {
          rectangleDiv.style.height = DomUtil.getPixelValue(containerHeight);
        } else {
          rectangleDiv.style.height = DomUtil.getPixelValue(containerHeight / 2);
          rectangleDiv.style.top = DomUtil.getPixelValue(containerHeight / 4);
        }
      }
      if (startLine) {
        startLine.style.height = DomUtil.getPixelValue(containerHeight);
      }
      if (endLine) {
        endLine.style.height = DomUtil.getPixelValue(containerHeight);
      }
      if (selectedDiv) {
        selectedDiv.style.height = DomUtil.getPixelValue(containerHeight);
      }
    }
  }

  removeMarker(id: Marker['id']): void {
    this.getMarkerElement(id)?.remove();
    this._markers.delete(id);
  }

  removeAllMarkers() {
    this._markers.clear();
    this._container!.innerHTML = '';
  }

  private getMarkerElement(markerId: string): HTMLDivElement | undefined {
    return this._markers.get(markerId)?.displayElement;
  }

  private toObservable<T>(value: T | Observable<T>): Observable<T> {
    return isObservable(value) ? value : of(value);
  }

  private getMarkerStateOrFail(id: string): MarkerState {
    const marker = this._markers.get(id);
    if (marker) {
      return marker.state;
    } else {
      throw new Error(`Marker with id ${id} not found in marker track`);
    }
  }
}
