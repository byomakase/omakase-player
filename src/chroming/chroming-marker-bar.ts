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

import {filter, Subject, takeUntil, type Observable} from 'rxjs';
import type {Marker, MarkerState, MarkerTrack, MarkerTrackState, MarkerUpdateableAttrs} from '../media/marker-track';
import {freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import type {Destroyable, Serializable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import type {MarkerTrackStyle} from '../ui';

/**
 * Configuration for a marker track in the player chroming.
 */
export interface ChromingMarkerBarConfig {
  /**
   * Unique identifier for the marker track. If not provided, a random id will be generated. The id is used to identify the marker track when updating or deleting it.
   */
  id: string;

  /**
   * Initial visibility of the marker track. If not provided, the marker track will be visible by default.
   */
  visible: boolean;
}

export interface ChromingMarkerBarState {
  id: string;
  tracks: string[];
  visible: boolean;
}

export interface MarkerOnChromingStyle extends MarkerTrackStyle {
  active: boolean;
}

export enum ChromingMarkerBarElementEventType {
  CHROMING_MARKER_UPDATE = 'CHROMING_MARKER_UPDATE',
  CHROMING_MARKER_CLICK = 'CHROMING_MARKER_CLICK',
  CHROMING_MARKER_FOCUS = 'CHROMING_MARKER_FOCUS',
  CHROMING_MARKER_UNFOCUS = 'CHROMING_MARKER_UNFOCUS',
}

export enum ChromingMarkerBarEventType {
  CHROMING_MARKER_BAR_CHANGE = 'CHROMING_MARKER_BAR_CHANGE',
  CHROMING_MARKER_BAR_ITEM_CLICK = 'CHROMING_MARKER_BAR_ITEM_CLICK',
  CHROMING_MARKER_BAR_ITEM_MOUSE_ENTER = 'CHROMING_MARKER_BAR_ITEM_MOUSE_ENTER',
  CHROMING_MARKER_BAR_ITEM_MOUSE_LEAVE = 'CHROMING_MARKER_BAR_ITEM_MOUSE_LEAVE',
  CHROMING_MARKER_BAR_TRACK_ADDED = 'CHROMING_MARKER_BAR_TRACK_ADDED',
  CHROMING_MARKER_BAR_TRACK_REMOVED = 'CHROMING_MARKER_BAR_TRACK_REMOVED',
}

export interface ChromingMarkerUpdateData extends Serializable {
  track: MarkerTrackState;
  item: MarkerState;
  attrs: MarkerUpdateableAttrs;
}

export interface ChromingMarkerBarStateChangeEventData extends Serializable {
  state: ChromingMarkerBarState;
}

export interface ChromingMarkerBarItemEventData extends Serializable {
  item: MarkerState;
}

export interface ChromingMarkerBarAddedEventData extends Serializable {
  trackId: MarkerTrackState['id'];
}

export interface ChromingMarkerBarRemovedEventData extends Serializable {
  trackId: MarkerTrackState['id'];
}

export type ChromingMarkerBarElementEventTypeDataMap = {
  [ChromingMarkerBarElementEventType.CHROMING_MARKER_UPDATE]: ChromingMarkerUpdateData;
  [ChromingMarkerBarElementEventType.CHROMING_MARKER_CLICK]: ChromingMarkerBarItemEventData;
  [ChromingMarkerBarElementEventType.CHROMING_MARKER_FOCUS]: ChromingMarkerBarItemEventData;
  [ChromingMarkerBarElementEventType.CHROMING_MARKER_UNFOCUS]: ChromingMarkerBarItemEventData;
};

export type ChromingMarkerBarEventTypeDataMap = {
  [ChromingMarkerBarEventType.CHROMING_MARKER_BAR_CHANGE]: ChromingMarkerBarStateChangeEventData;
  [ChromingMarkerBarEventType.CHROMING_MARKER_BAR_TRACK_ADDED]: ChromingMarkerBarAddedEventData;
  [ChromingMarkerBarEventType.CHROMING_MARKER_BAR_TRACK_REMOVED]: ChromingMarkerBarRemovedEventData;
  [ChromingMarkerBarEventType.CHROMING_MARKER_BAR_ITEM_CLICK]: ChromingMarkerBarItemEventData;
  [ChromingMarkerBarEventType.CHROMING_MARKER_BAR_ITEM_MOUSE_ENTER]: ChromingMarkerBarItemEventData;
  [ChromingMarkerBarEventType.CHROMING_MARKER_BAR_ITEM_MOUSE_LEAVE]: ChromingMarkerBarItemEventData;
};

export type ChromingMarkerBarElementEvent = {
  [K in ChromingMarkerBarElementEventType]: {
    type: K;
    data: ChromingMarkerBarElementEventTypeDataMap[K];
  };
}[keyof ChromingMarkerBarElementEventTypeDataMap];

export type ChromingMarkerBarEvent = {
  [K in ChromingMarkerBarEventType]: {
    type: K;
    data: ChromingMarkerBarEventTypeDataMap[K];
  };
}[keyof ChromingMarkerBarEventTypeDataMap];

export interface ChromingMarkerBarElementApi {
  onEvent$: Observable<ChromingMarkerBarElementEvent>;
  destroy$: Observable<void>;

  get config(): ChromingMarkerBarConfig;
  set config(config: Partial<ChromingMarkerBarConfig>);

  get markerTracks(): MarkerTrackState[] | undefined;
  set markerTracks(markerTracks: MarkerTrackState[]);

  show(): void;
  hide(): void;

  addTrack(track: MarkerTrackState): void;
  removeTrack(track: MarkerTrackState): void;
  updateTrack(track: MarkerTrackState): void;
  hasTrack(trackId: string): boolean;

  addMarker(marker: MarkerState, trackId: MarkerTrackState['id']): void;
  updateMarker(marker: MarkerState): void;
  removeMarker(markerId: MarkerState['id']): void;
  removeAllMarkers(): void;
}

export interface ChromingMarkerBarHandlerApi {
  onEvent$: Observable<ChromingMarkerBarEvent>;

  id: string;

  /**
   * Current state of the marker bar.
   */
  state: ChromingMarkerBarState;

  /**
   * Hide or show the marker bar.
   * @param visible Marker bar visibility
   */
  setVisibility(visible: boolean): Observable<void>;

  /**
   * Add another marker track.
   * @param track Marker track or marker track id
   */
  addTrack(track: MarkerTrack | MarkerTrack['id']): Observable<void>;

  /**
   * Remove marker track.
   * @param trackId Marker track id
   */
  removeTrack(trackId: string): Observable<void>;

  /**
   * Returns a list of track ids associated with the marker bar
   */
  getTrackIds(): string[];

  /**
   * Internal method. Restores the state of the marker track from the session.
   * @param state Marker track state
   */
  restoreState(state: ChromingMarkerBarState): Observable<void>;
}

export class ChromingMarkerBarHandler implements ChromingMarkerBarHandlerApi, Destroyable {
  protected readonly _onEvent$: Subject<ChromingMarkerBarEvent> = new Subject<ChromingMarkerBarEvent>();

  private _id: string;
  private _tracks: string[];
  private _visible: boolean;
  private _destroyBreaker = new ObserverBreaker();
  private _elementBreaker = new ObserverBreaker();

  constructor(id: string, tracks: string[], visible: boolean) {
    this._id = id;
    this._tracks = tracks;
    this._visible = visible;
  }

  wireElement(markerBarElement: ChromingMarkerBarElementApi) {
    this._elementBreaker.break();
    markerBarElement.onEvent$
      .pipe(
        takeUntil(this._elementBreaker.observer),
        takeUntil(this._destroyBreaker.observer),
        takeUntil(markerBarElement.destroy$),
        filter(
          (event) =>
            event.type === ChromingMarkerBarElementEventType.CHROMING_MARKER_FOCUS ||
            event.type === ChromingMarkerBarElementEventType.CHROMING_MARKER_UNFOCUS ||
            event.type === ChromingMarkerBarElementEventType.CHROMING_MARKER_CLICK
        )
      )
      .subscribe((event) => {
        switch (event.type) {
          case ChromingMarkerBarElementEventType.CHROMING_MARKER_CLICK:
            this._onEvent$.next({
              type: ChromingMarkerBarEventType.CHROMING_MARKER_BAR_ITEM_CLICK,
              data: event.data,
            });
            break;
          case ChromingMarkerBarElementEventType.CHROMING_MARKER_FOCUS:
            this._onEvent$.next({
              type: ChromingMarkerBarEventType.CHROMING_MARKER_BAR_ITEM_MOUSE_ENTER,
              data: event.data,
            });
            break;
          case ChromingMarkerBarElementEventType.CHROMING_MARKER_UNFOCUS:
            this._onEvent$.next({
              type: ChromingMarkerBarEventType.CHROMING_MARKER_BAR_ITEM_MOUSE_LEAVE,
              data: event.data,
            });
            break;
        }
      });
  }

  setVisibility(visible: boolean): Observable<void> {
    return passiveObservable((observer) => {
      this._visible = visible;
      this.emitChangeEvent();
      nextCompleteObserver(observer);
    });
  }

  addTrack(track: MarkerTrack | MarkerTrack['id']): Observable<void> {
    return passiveObservable((observer) => {
      const trackId = typeof track === 'string' ? track : track.id;
      this._tracks.push(trackId);
      this._onEvent$.next({
        type: ChromingMarkerBarEventType.CHROMING_MARKER_BAR_TRACK_ADDED,
        data: {
          trackId: trackId,
        },
      });
      this.emitChangeEvent();
      nextCompleteObserver(observer);
    });
  }

  removeTrack(trackId: string): Observable<void> {
    return passiveObservable((observer) => {
      const trackIndex = this._tracks.indexOf(trackId);
      if (trackIndex !== -1) {
        this._tracks.splice(this._tracks.indexOf(trackId), 1);
        this._onEvent$.next({
          type: ChromingMarkerBarEventType.CHROMING_MARKER_BAR_TRACK_REMOVED,
          data: {
            trackId,
          },
        });
        this.emitChangeEvent();
      }
      nextCompleteObserver(observer);
    });
  }

  getTrackIds(): string[] {
    return [...this._tracks];
  }

  restoreState(state: ChromingMarkerBarState): Observable<void> {
    return passiveObservable((observer) => {
      this._id = state.id;
      this._tracks = [...state.tracks];
      this._visible = state.visible;
      this.emitChangeEvent();
      nextCompleteObserver(observer);
    });
  }

  protected emitChangeEvent() {
    this._onEvent$.next({
      type: ChromingMarkerBarEventType.CHROMING_MARKER_BAR_CHANGE,
      data: {
        state: this.state,
      },
    });
  }

  destroy() {
    this._elementBreaker.destroy();
    this._destroyBreaker.destroy();
    freeObserver(this._onEvent$);
  }

  get id(): string {
    return this._id;
  }

  get onEvent$(): Observable<ChromingMarkerBarEvent> {
    return this._onEvent$.asObservable();
  }

  get state(): ChromingMarkerBarState {
    return {
      id: this._id,
      visible: this._visible,
      tracks: [...this._tracks],
    };
  }
}
