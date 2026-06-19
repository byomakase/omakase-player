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

import {OpStage, type OpStageState} from '../common/op-stage';
import {type BaseTrackLoadOptions, type TrackState} from '../media';
import type {Destroyable, Serializable} from '../common/capabilities';
import {Observable, Subject} from 'rxjs';
import {freeObserver} from '../util/rxjs-util';
import {ObserverBreaker} from '../common/observer-breaker';

/** Base load options shared by all player track types. */
export interface PlayerTrackLoadOptions extends BaseTrackLoadOptions {}

export enum PlayerTrackEventType {
  PLAYER_TRACK_LOADING = 'PLAYER_TRACK_LOADING',
  PLAYER_TRACK_LOADED = 'PLAYER_TRACK_LOADED',
  PLAYER_TRACK_LOAD_ERROR = 'PLAYER_TRACK_LOAD_ERROR',

  PLAYER_TRACK_SWITCHED = 'PLAYER_TRACK_SWITCHED',
}

export type PlayerTrackEventTypeDataMap = {
  [PlayerTrackEventType.PLAYER_TRACK_LOADING]: PlayerTrackEventData;
  [PlayerTrackEventType.PLAYER_TRACK_LOADED]: PlayerTrackEventData;
  [PlayerTrackEventType.PLAYER_TRACK_LOAD_ERROR]: PlayerTrackErrorEventData;

  [PlayerTrackEventType.PLAYER_TRACK_SWITCHED]: PlayerTrackEventData;
};

export interface PlayerTrackEventData extends Serializable {
  playerTrackState: PlayerTrackState;
}

export interface PlayerTrackErrorEventData extends PlayerTrackEventData {
  error: string | undefined;
}

export type PlayerTrackEvent = {
  [K in PlayerTrackEventType]: {
    type: K;
    data: PlayerTrackEventTypeDataMap[K];
  };
}[keyof PlayerTrackEventTypeDataMap];

export interface PlayerTrack<T extends TrackState = TrackState, S extends PlayerTrackState = PlayerTrackState> {
  onEvent$: Observable<PlayerTrackEvent>;

  trackState: T;

  loadStage: OpStage;

  state: S;

  loadStart(): void;

  loadSuccess(): void;

  loadError(error: string | undefined): void;

  setTrackState(trackState: T): void;
}

export interface PlayerTrackState {
  trackId: TrackState['id'];

  loadStage: OpStageState;
}

export abstract class BasePlayerTrack<T extends TrackState, S extends PlayerTrackState, L extends PlayerTrackLoadOptions> implements PlayerTrack<T, S>, Destroyable {
  protected readonly _onEvent$: Subject<PlayerTrackEvent> = new Subject<PlayerTrackEvent>();

  protected readonly _loadStage: OpStage;
  protected readonly _loadOptions: L | undefined;

  protected _trackState: T;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(trackState: T, loadOptions?: L) {
    this._trackState = trackState;
    this._loadStage = new OpStage();
    this._loadOptions = loadOptions;
  }

  protected abstract getState(): S;

  loadStart() {
    this._loadStage.start();
    this._onEvent$.next({
      type: PlayerTrackEventType.PLAYER_TRACK_LOADING,
      data: {
        playerTrackState: this.state,
      },
    });
  }

  loadSuccess() {
    this._loadStage.success();
    this._onEvent$.next({
      type: PlayerTrackEventType.PLAYER_TRACK_LOADED,
      data: {
        playerTrackState: this.state,
      },
    });
  }

  loadError(error: string | undefined) {
    this._loadStage.failure(error);
    this._onEvent$.next({
      type: PlayerTrackEventType.PLAYER_TRACK_LOAD_ERROR,
      data: {
        playerTrackState: this.state,
        error: error,
      },
    });
  }

  setTrackState(trackState: T) {
    this._trackState = trackState;
  }

  get trackState(): T {
    return this._trackState;
  }

  get loadStage(): OpStage {
    return this._loadStage;
  }

  get state(): S {
    return this.getState();
  }

  get onEvent$(): Observable<PlayerTrackEvent> {
    return this._onEvent$.asObservable();
  }

  destroy() {
    freeObserver(this._onEvent$);
    this._destroyBreaker.destroy();
  }
}
