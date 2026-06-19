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

import type {Destroyable, Serializable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import type {TrackState} from '../media';
import {type Observable, Subject} from 'rxjs';
import {OpStage} from '../common/op-stage';
import {freeObserver} from '../util/rxjs-util';

export enum TrackControllerEventType {
  TRACK_CONTROLLER_TRACK_LOADING = 'TRACK_CONTROLLER_TRACK_LOADING',
  TRACK_CONTROLLER_TRACK_LOADED = 'TRACK_CONTROLLER_TRACK_LOADED',
  TRACK_CONTROLLER_TRACK_LOAD_ERROR = 'TRACK_CONTROLLER_TRACK_LOAD_ERROR',
}

export interface TrackControllerEventData extends Serializable {}

export interface TrackControllerErrorEventData extends TrackControllerEventData {
  error: string | undefined;
}

export type TrackControllerEventTypeDataMap = {
  [TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOADING]: TrackControllerEventData;
  [TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOADED]: TrackControllerEventData;
  [TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOAD_ERROR]: TrackControllerErrorEventData;
};

export type TrackControllerEvent = {
  [K in TrackControllerEventType]: {
    type: K;
    data: TrackControllerEventTypeDataMap[K];
  };
}[keyof TrackControllerEventTypeDataMap];

export interface TrackController<E extends TrackControllerEvent = TrackControllerEvent> extends Destroyable {
  onEvent$: Observable<E>;

  loadSource(): Observable<void>;
}

export abstract class BaseTrackController<T extends TrackState, E extends TrackControllerEvent> implements TrackController<E> {
  protected readonly _onEvent$: Subject<E> = new Subject<E>();

  protected readonly _loadStage: OpStage;

  protected _trackState: T;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(trackState: T) {
    this._trackState = trackState;

    this._loadStage = new OpStage();
  }

  abstract loadSource(): Observable<void>;

  get onEvent$(): Observable<E> {
    return this._onEvent$.asObservable();
  }

  destroy(): void {
    this._destroyBreaker.destroy();

    freeObserver(this._onEvent$);
  }
}
