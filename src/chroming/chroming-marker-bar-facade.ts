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

import {distinctUntilChanged, EMPTY, map, type Observable, startWith, Subject, switchMap, takeUntil, throwError} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import {freeObserver} from '../util/rxjs-util';
import type {MarkerTrack} from '../media/marker-track';
import {type ChromingMarkerBarEvent, ChromingMarkerBarEventType, type ChromingMarkerBarHandlerApi, type ChromingMarkerBarState} from './chroming-marker-bar';

/**
 * Marker bar handler returned by the public chroming API. It stays the same object across detach/attach and delegates to the handler of the
 * currently active chroming (local or detached), so subscriptions to {@link onEvent$} keep receiving events from whichever window shows the player.
 */
export class ChromingMarkerBarHandlerFacade implements ChromingMarkerBarHandlerApi, Destroyable {
  private readonly _onEvent$ = new Subject<ChromingMarkerBarEvent>();
  private readonly _destroyBreaker = new ObserverBreaker();

  private readonly _id: string;
  private readonly _resolveHandler: () => ChromingMarkerBarHandlerApi | undefined;
  private _lastState: ChromingMarkerBarState;

  constructor(id: string, resolveHandler: () => ChromingMarkerBarHandlerApi | undefined, handlerChange$: Observable<void>) {
    this._id = id;
    this._resolveHandler = resolveHandler;
    this._lastState = resolveHandler()?.state ?? {id, tracks: [], visible: true};

    handlerChange$
      .pipe(
        startWith(void 0),
        map(() => this._resolveHandler()),
        distinctUntilChanged(),
        switchMap((handler) => (handler ? handler.onEvent$ : EMPTY)),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((event) => {
        if (event.type === ChromingMarkerBarEventType.CHROMING_MARKER_BAR_CHANGE) {
          this._lastState = event.data.state;
        }
        this._onEvent$.next(event);
      });
  }

  get id(): string {
    return this._id;
  }

  get onEvent$(): Observable<ChromingMarkerBarEvent> {
    return this._onEvent$.asObservable();
  }

  get state(): ChromingMarkerBarState {
    const handler = this._resolveHandler();
    if (handler) {
      this._lastState = handler.state;
    }
    return this._lastState;
  }

  setVisibility(visible: boolean): Observable<void> {
    return this.delegate((handler) => handler.setVisibility(visible));
  }

  addTrack(track: MarkerTrack | MarkerTrack['id']): Observable<void> {
    return this.delegate((handler) => handler.addTrack(track));
  }

  removeTrack(trackId: string): Observable<void> {
    return this.delegate((handler) => handler.removeTrack(trackId));
  }

  getTrackIds(): string[] {
    return [...this.state.tracks];
  }

  restoreState(state: ChromingMarkerBarState): Observable<void> {
    return this.delegate((handler) => handler.restoreState(state));
  }

  private delegate(fn: (handler: ChromingMarkerBarHandlerApi) => Observable<void>): Observable<void> {
    const handler = this._resolveHandler();
    return handler ? fn(handler) : throwError(() => new Error(`Marker bar ${this._id} is not available`));
  }

  destroy(): void {
    this._destroyBreaker.destroy();
    freeObserver(this._onEvent$);
  }
}
