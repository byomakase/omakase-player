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
import {type MarkerState, MarkerTrack, type MarkerTrackState} from '../media';
import type {Destroyable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import {freeObserver} from '../util/rxjs-util';
import {ChromingMarkerBarElementEventType} from '../chroming/chroming-marker-bar';
import type {OmakaseMarkerBar} from '../chroming/components/omakase-marker-bar';
import {OmakaseMarkerBars} from '../chroming/components/omakase-marker-bars';
import type {OmakaseTrackApi} from '../track';

/**
 * Configuration of a marker bar added to a control bar
 */
export interface ControlBarMarkerBarConfig {
  /** Unique id of the marker bar. A random id is generated when not given */
  id: string;
  /** Whether the marker bar is initially visible. Defaults to `true` */
  visible: boolean;
}

export interface ControlBarMarkerBarState {
  id: string;
  tracks: MarkerTrackState['id'][];
  visible: boolean;
}

export enum ControlBarMarkerBarEventType {
  CONTROL_BAR_MARKER_BAR_CHANGE = 'CONTROL_BAR_MARKER_BAR_CHANGE',
  CONTROL_BAR_MARKER_BAR_ITEM_CLICK = 'CONTROL_BAR_MARKER_BAR_ITEM_CLICK',
  CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_ENTER = 'CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_ENTER',
  CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_LEAVE = 'CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_LEAVE',
}

export interface ControlBarMarkerBarChangeEventData {
  state: ControlBarMarkerBarState;
}

export interface ControlBarMarkerBarItemEventData {
  item: MarkerState;
}

export type ControlBarMarkerBarEventTypeDataMap = {
  [ControlBarMarkerBarEventType.CONTROL_BAR_MARKER_BAR_CHANGE]: ControlBarMarkerBarChangeEventData;
  [ControlBarMarkerBarEventType.CONTROL_BAR_MARKER_BAR_ITEM_CLICK]: ControlBarMarkerBarItemEventData;
  [ControlBarMarkerBarEventType.CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_ENTER]: ControlBarMarkerBarItemEventData;
  [ControlBarMarkerBarEventType.CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_LEAVE]: ControlBarMarkerBarItemEventData;
};

export type ControlBarMarkerBarEvent = {
  [K in ControlBarMarkerBarEventType]: {
    type: K;
    data: ControlBarMarkerBarEventTypeDataMap[K];
  };
}[keyof ControlBarMarkerBarEventTypeDataMap];

/**
 * Marker bars API of a standalone control bar, available as {@link ControlBarApi.markerBar}
 */
export interface ControlBarMarkerBarApi {
  /**
   * Adds a marker bar to an `<omakase-marker-bars>` of the control bar, showing the given marker tracks
   * @param markerBars The `<omakase-marker-bars>` element, or a query selector for it within the control bar
   * @param tracks Marker tracks, or their ids, already added to the player
   * @param config Marker bar configuration
   * @returns Handler of the added marker bar
   */
  addMarkerBar(
    markerBars: string | HTMLElement,
    tracks?: MarkerTrack | MarkerTrack['id'] | (MarkerTrack | MarkerTrack['id'])[],
    config?: Partial<ControlBarMarkerBarConfig>
  ): ControlBarMarkerBarHandlerApi;

  /**
   * Returns the handlers of the marker bars added with {@link addMarkerBar}
   */
  getMarkerBars(): ControlBarMarkerBarHandlerApi[];

  /**
   * Returns the handler of a marker bar added with {@link addMarkerBar}
   * @param id Marker bar id
   */
  getMarkerBar(id: string): ControlBarMarkerBarHandlerApi | undefined;

  /**
   * Deletes a marker bar added with {@link addMarkerBar}
   * @param id Marker bar id
   */
  deleteMarkerBar(id: string): void;
}

/**
 * A marker bar added to a control bar with {@link ControlBarMarkerBarApi.addMarkerBar}
 */
export interface ControlBarMarkerBarHandlerApi {
  onEvent$: Observable<ControlBarMarkerBarEvent>;

  id: string;

  /**
   * Current state of the marker bar
   */
  state: ControlBarMarkerBarState;

  /**
   * Shows or hides the marker bar
   * @param visible Marker bar visibility
   */
  setVisibility(visible: boolean): void;

  /**
   * Shows another marker track on the marker bar
   * @param track Marker track, or its id, already added to the player
   */
  addTrack(track: MarkerTrack | MarkerTrack['id']): void;

  /**
   * Stops showing a marker track on the marker bar
   * @param trackId Marker track id
   */
  removeTrack(trackId: MarkerTrack['id']): void;

  /**
   * Returns the ids of the marker tracks shown on the marker bar
   */
  getTrackIds(): MarkerTrack['id'][];
}

const itemEventTypes = {
  [ChromingMarkerBarElementEventType.CHROMING_MARKER_CLICK]: ControlBarMarkerBarEventType.CONTROL_BAR_MARKER_BAR_ITEM_CLICK,
  [ChromingMarkerBarElementEventType.CHROMING_MARKER_FOCUS]: ControlBarMarkerBarEventType.CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_ENTER,
  [ChromingMarkerBarElementEventType.CHROMING_MARKER_UNFOCUS]: ControlBarMarkerBarEventType.CONTROL_BAR_MARKER_BAR_ITEM_MOUSE_LEAVE,
} as const;

export class ControlBarMarkerBarHandler implements ControlBarMarkerBarHandlerApi, Destroyable {
  protected readonly _onEvent$ = new Subject<ControlBarMarkerBarEvent>();

  private _destroyBreaker = new ObserverBreaker();

  /**
   * @param _markerBar The marker bar element
   * @param _resolveTrack Resolves a marker track, or its id, to its state; `undefined` when it isn't added to the player
   */
  constructor(
    private readonly _markerBar: OmakaseMarkerBar,
    private readonly _resolveTrack: (track: MarkerTrack | MarkerTrack['id']) => MarkerTrackState | undefined
  ) {
    this._markerBar.onEvent$
      .pipe(
        filter((event) => event.type in itemEventTypes),
        takeUntil(this._markerBar.destroy$),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((event) => {
        this._onEvent$.next({
          type: itemEventTypes[event.type as keyof typeof itemEventTypes],
          data: {item: (event.data as ControlBarMarkerBarItemEventData).item},
        });
      });
  }

  get id(): string {
    return this._markerBar.config.id;
  }

  get onEvent$(): Observable<ControlBarMarkerBarEvent> {
    return this._onEvent$.asObservable();
  }

  get state(): ControlBarMarkerBarState {
    return {
      id: this.id,
      tracks: this.getTrackIds(),
      visible: this._markerBar.config.visible,
    };
  }

  setVisibility(visible: boolean): void {
    if (visible) {
      this._markerBar.show();
    } else {
      this._markerBar.hide();
    }
    this.emitChangeEvent();
  }

  addTrack(track: MarkerTrack | MarkerTrack['id']): void {
    const markerTrack = this._resolveTrack(track);
    if (!markerTrack) {
      throw new Error(`Marker track ${typeof track === 'string' ? track : track.id} not found`);
    }
    if (this._markerBar.hasTrack(markerTrack.id)) {
      return;
    }
    this._markerBar.addTrack(markerTrack);
    this.emitChangeEvent();
  }

  removeTrack(trackId: MarkerTrack['id']): void {
    // the track may already be deleted from the player
    const markerTrack = this._markerBar.markerTracks?.find((track) => track.id === trackId);
    if (!markerTrack) {
      return;
    }
    this._markerBar.removeTrack(markerTrack);
    this.emitChangeEvent();
  }

  getTrackIds(): MarkerTrack['id'][] {
    return (this._markerBar.markerTracks ?? []).map((track) => track.id);
  }

  protected emitChangeEvent() {
    this._onEvent$.next({
      type: ControlBarMarkerBarEventType.CONTROL_BAR_MARKER_BAR_CHANGE,
      data: {state: this.state},
    });
  }

  destroy(): void {
    this._destroyBreaker.destroy();
    freeObserver(this._onEvent$);
  }
}

interface ControlBarMarkerBarEntry {
  handler: ControlBarMarkerBarHandler;
  markerBars: OmakaseMarkerBars;
}

export class ControlBarMarkerBar implements ControlBarMarkerBarApi, Destroyable {
  private _markerBars: ControlBarMarkerBarEntry[] = [];

  /**
   * @param _controlBarElement The control bar element, holding the `<omakase-marker-bars>` elements
   * @param _track Track API of the player the control bar is created for
   */
  constructor(
    private readonly _controlBarElement: HTMLElement,
    private readonly _track: OmakaseTrackApi
  ) {}

  addMarkerBar(
    markerBars: string | HTMLElement,
    tracks: MarkerTrack | MarkerTrack['id'] | (MarkerTrack | MarkerTrack['id'])[] = [],
    config?: Partial<ControlBarMarkerBarConfig>
  ): ControlBarMarkerBarHandlerApi {
    const markerBarsElement = typeof markerBars === 'string' ? this._controlBarElement.querySelector(markerBars) : markerBars;
    if (!(markerBarsElement instanceof OmakaseMarkerBars) || !this._controlBarElement.contains(markerBarsElement)) {
      throw new Error(`<omakase-marker-bars> ${typeof markerBars === 'string' ? `"${markerBars}" ` : ''}not found in the control bar`);
    }
    if (config?.id && this.getMarkerBar(config.id)) {
      throw new Error(`Marker bar with id ${config.id} already exists`);
    }
    const markerTracks = (Array.isArray(tracks) ? tracks : [tracks]).map((track) => {
      const markerTrack = this.getMarkerTrackState(track);
      if (!markerTrack) {
        throw new Error(`Marker track ${typeof track === 'string' ? track : track.id} not found`);
      }
      return markerTrack;
    });

    const markerBar = markerBarsElement.addMarkerBar();
    if (config) {
      markerBar.config = config;
    }
    markerBar.markerTracks = markerTracks;

    const handler = new ControlBarMarkerBarHandler(markerBar, (track) => this.getMarkerTrackState(track));
    this._markerBars.push({handler, markerBars: markerBarsElement});
    return handler;
  }

  getMarkerBars(): ControlBarMarkerBarHandlerApi[] {
    return this._markerBars.map(({handler}) => handler);
  }

  getMarkerBar(id: string): ControlBarMarkerBarHandlerApi | undefined {
    return this._markerBars.find(({handler}) => handler.id === id)?.handler;
  }

  deleteMarkerBar(id: string): void {
    const markerBar = this._markerBars.find(({handler}) => handler.id === id);
    if (!markerBar) {
      return;
    }
    this._markerBars.splice(this._markerBars.indexOf(markerBar), 1);
    markerBar.markerBars.deleteMarkerBar(id);
    markerBar.handler.destroy();
  }

  private getMarkerTrackState(track: MarkerTrack | MarkerTrack['id']): MarkerTrackState | undefined {
    const markerTrack = typeof track === 'string' ? this._track.get(track) : track;
    return markerTrack instanceof MarkerTrack ? markerTrack.state : undefined;
  }

  destroy(): void {
    this._markerBars.forEach(({handler}) => handler.destroy());
    this._markerBars = [];
  }
}
