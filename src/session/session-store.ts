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

import {ObserverBreaker} from '../common/observer-breaker';
import type {Destroyable, Serializable} from '../common/capabilities';
import {BehaviorSubject, distinctUntilChanged, filter, map, Observable, Subject, take, takeUntil} from 'rxjs';
import type {DeepPartial} from '../types/ts-types';
import {deepMerge} from '../util/util-functions';
import {type WindowPlayback, WindowPlaybackMode} from '../common';
import {type SessionEvent, SessionEventType} from './session-event';
import type {MainMedia, MainMediaState, MediaEntityState, Track} from '../media';
import type {PlayerAudioState, PlayerPlayback, PlayerTextState} from '../player';
import type {ChromingState} from '../chroming';
import {freeObserver, nextCompleteObserver} from '../util/rxjs-util';
import {CryptoUtil} from '../util/crypto-util';
import {type SessionApi, WINDOW_PLAYBACK_MODE_TRANSITIONS} from './session-api';
import {SessionFactory} from './session-factory';
import {AlertsManager} from './alert';
import type {AlertState} from './alerts-api';
import {AlertEventType} from './alerts-api';

function assertWindowPlaybackTransition(current: WindowPlaybackMode, next: WindowPlaybackMode): void {
  const allowedFrom = WINDOW_PLAYBACK_MODE_TRANSITIONS[next];
  if (!allowedFrom || !allowedFrom.includes(current)) {
    const expected = allowedFrom?.join(' or ') || 'an allowed state';
    throw new Error(`Window must be in ${expected} status to transition to ${next}, got: ${current}`);
  }
}

export interface SessionState extends Serializable {
  /** Whether player can be detached. */
  isDetachable: boolean;
  /** Current window playback state, including mode and detach/attach availability. */
  windowPlayback: WindowPlayback;
  /** Pending media load requests, used to track in-progress loads. */
  mediaLoadRequests: MediaLoadRequest[];
  /** Active alerts raised during the session. */
  alerts: AlertState[];
  /** Player session state, including playback, audio, and text. */
  player: PlayerSession;
  /** Chroming session state. */
  chroming: ChromingSession;
}

export interface MediaLoadRequest {
  id: string;
  mediaId?: MediaEntityState['id'] | undefined;
}

export interface PlayerSession extends Serializable {
  /** ID of the currently loaded main media, or `undefined` if none is loaded. */
  mainMediaId: MainMediaState['id'] | undefined;
  /** Current playback state. */
  playback: PlayerPlayback;
  /** Current audio state, or `undefined` if audio is not initialized. */
  audio: PlayerAudioState | undefined;
  /** Current text track state, or `undefined` if text is not initialized. */
  text: PlayerTextState | undefined;
}

export type ChromingSession = ChromingState;

export const selectWindowPlayback = (state: SessionState): WindowPlayback => state.windowPlayback;

export const selectPlayer = (state: SessionState): PlayerSession | undefined => state.player;

export const selectChroming = (state: SessionState): ChromingSession | undefined => state.chroming;

export class SessionStore implements SessionApi, Destroyable {
  private readonly _onEvent$: Subject<SessionEvent> = new Subject<SessionEvent>();
  private readonly _sessionState$ = new BehaviorSubject<SessionState>(SessionFactory.createEmptySession());
  private readonly _mediaLoadRequests: Map<string, MediaLoadRequest> = new Map();
  private readonly _destroyBreaker = new ObserverBreaker();

  constructor(alertsManager: AlertsManager) {
    let createIsStableWindowPlaybackFilter = <T>() => {
      return filter<T>(() => this.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED || this.state.windowPlayback.mode === WindowPlaybackMode.DETACHED);
    };

    this.select((state: SessionState) => state.isDetachable)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((isDetachable) => {
        this.patch({
          windowPlayback: {
            canDetach: this.resolveCanDetach(this.state.windowPlayback.mode),
            canAttach: this.resolveCanAttach(this.state.windowPlayback.mode),
          },
        });
        this._onEvent$.next({
          type: SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED,
          data: {
            windowPlayback: this.state.windowPlayback,
          },
        });
      });

    this.select(selectWindowPlayback, (a, b) => JSON.stringify(a) === JSON.stringify(b))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((windowPlayback) => {
        this._onEvent$.next({
          type: SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED,
          data: {windowPlayback},
        });
      });

    this.select(selectPlayer)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(createIsStableWindowPlaybackFilter())
      .subscribe((player) => {
        this.patch({
          windowPlayback: {
            canDetach: this.resolveCanDetach(this.state.windowPlayback.mode),
            canAttach: this.resolveCanAttach(this.state.windowPlayback.mode),
          },
        });
        this._onEvent$.next({
          type: SessionEventType.SESSION_PLAYER_UPDATED,
          data: {player},
        });
      });

    this.select(selectChroming)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(createIsStableWindowPlaybackFilter())
      .subscribe((chroming) => {
        this._onEvent$.next({
          type: SessionEventType.SESSION_CHROMING_UPDATED,
          data: {chroming},
        });
      });

    this.select((state: SessionState) => state.mediaLoadRequests)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((mediaLoadRequests) => {
        this.patch({
          windowPlayback: {
            canDetach: this.resolveCanDetach(this.state.windowPlayback.mode),
            canAttach: this.resolveCanAttach(this.state.windowPlayback.mode),
          },
        });
        this._onEvent$.next({
          type: SessionEventType.SESSION_MEDIA_LOAD_REQUESTS_UPDATED,
          data: {mediaLoadRequests},
        });
      });

    alertsManager.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      if (event.type === AlertEventType.ALERT_RAISED) {
        this.patch({
          alerts: [...this.state.alerts, event.data.alert.state],
        });
      } else if (event.type === AlertEventType.ALERT_DISMISSED) {
        this.patch({
          alerts: this.state.alerts.filter((a) => a.id !== event.data.alert.id),
        });
      }
      this._onEvent$.next({
        type: SessionEventType.SESSION_ALERTS_UPDATED,
        data: {alerts: this.state.alerts},
      });
    });
  }

  get onEvent$(): Observable<SessionEvent> {
    return this._onEvent$.asObservable();
  }

  private patch(patch: DeepPartial<SessionState>): void {
    this._sessionState$.next(deepMerge(this.state, patch));
  }

  select<R>(project: (state: SessionState) => R, compare: (a: R, b: R) => boolean = <T>(a: T, b: T) => a === b): Observable<R> {
    return this._sessionState$.pipe(map(project), distinctUntilChanged(compare));
  }

  update(patch: DeepPartial<SessionState>) {
    return this.patch(patch);
  }

  setPlayer(player: PlayerSession | undefined): void {
    this.patch({
      player: player ? player : SessionFactory.createEmptyPlayerSession(),
    });
  }

  updatePlayer(patch: DeepPartial<PlayerSession>): void {
    if (!this.state.player) {
      throw new Error(`Player is undefined. Use setPlayer() before calling updatePlayer(), patch: ${JSON.stringify(patch)}`);
    }

    this.patch({
      player: deepMerge(this.state.player, patch),
    });
  }

  updatePlayerCurrentTime(currentTime: PlayerPlayback['currentTime']): void {
    if (!this.state.player) {
      throw new Error(`Player is undefined. Use setPlayer() before calling updatePlayer()`);
    }
    let state = {
      ...this.state,
    };
    state.player.playback.currentTime = currentTime;
    this._sessionState$.next(state);
  }

  updateWindowPlaybackMode(next: WindowPlaybackMode, error?: string): void {
    let state = this.state;
    assertWindowPlaybackTransition(state.windowPlayback.mode, next);
    this.patch({
      windowPlayback: {
        mode: next,
        error: void 0, // clear previous error,
        canDetach: this.resolveCanDetach(next),
        canAttach: this.resolveCanAttach(next),
      },
    });
  }

  private resolveCanDetach(mode: WindowPlaybackMode) {
    return this.resolveCanAttachOrDetach() && (mode === WindowPlaybackMode.ATTACHED || mode === WindowPlaybackMode.FAILURE);
  }

  private resolveCanAttach(mode: WindowPlaybackMode) {
    return this.resolveCanAttachOrDetach() && (mode === WindowPlaybackMode.DETACHED || mode === WindowPlaybackMode.FAILURE);
  }

  private resolveCanAttachOrDetach() {
    let isDetachable = this.state.isDetachable;
    let hasMainMedia = !!this.state.player.mainMediaId;
    let noMediaLoadRequests = this.state.mediaLoadRequests.length === 0;
    return isDetachable && hasMainMedia && noMediaLoadRequests;
  }

  requestWindowPlaybackModeChange(mode: WindowPlaybackMode): void {
    this._onEvent$.next({
      type: SessionEventType.SESSION_WINDOW_PLAYBACK_MODE_CHANGE_REQUEST,
      data: {
        mode: mode,
      },
    });
  }

  setChroming(chroming: ChromingSession | undefined): void {
    this.patch({
      chroming: chroming ? chroming : SessionFactory.createEmptyChromingSession(),
    });
  }

  updateChroming(patch: DeepPartial<ChromingSession>): void {
    if (!this.state.chroming) {
      throw new Error(`Chroming is undefined. Use setChroming() before calling updateChroming(), patch: ${JSON.stringify(patch)}`);
    }

    this.patch({
      chroming: deepMerge(this.state.chroming, patch),
    });
  }

  createMediaLoadRequest(media?: Track | MainMedia): MediaLoadRequest {
    let mediaLoadPackage: MediaLoadRequest = {
      id: CryptoUtil.uuid(),
      mediaId: media?.id,
    };
    this._mediaLoadRequests.set(mediaLoadPackage.id, mediaLoadPackage);
    this.patch({
      mediaLoadRequests: [...this._mediaLoadRequests.values()],
    });
    return mediaLoadPackage;
  }

  removeMediaLoadRequest(mediaLoadPackage: MediaLoadRequest) {
    this._mediaLoadRequests.delete(mediaLoadPackage.id);
    this.patch({
      mediaLoadRequests: [...this._mediaLoadRequests.values()],
    });
  }

  onDetached$(): Observable<void> {
    return new Observable<void>((observer) => {
      if (this.state.windowPlayback.mode === WindowPlaybackMode.DETACHED) {
        nextCompleteObserver(observer);
      } else {
        this.onEvent$
          .pipe(filter((p) => p.type === SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED && p.data.windowPlayback.mode === WindowPlaybackMode.DETACHED))
          .pipe(take(1))
          .subscribe(() => {
            nextCompleteObserver(observer);
          });
      }
    });
  }

  get state(): SessionState {
    return this._sessionState$.value;
  }

  destroy() {
    this._mediaLoadRequests.clear();
    freeObserver(this._onEvent$);
    freeObserver(this._sessionState$);
    this._destroyBreaker.destroy();
  }
}
