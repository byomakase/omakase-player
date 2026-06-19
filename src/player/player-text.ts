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

import {PlayerTrackEventType} from './player-track';
import {type MainMediaState, type TextTrack, type TextTrackState, type TextTrackUpdateableAttrs, TrackEventType, type TrackState, TrackType} from '../media';
import {type PlayerTextApi, type PlayerTextEvent, PlayerTextEventType, type PlayerTextInternalApi, PlayerTextMode, type PlayerTextState} from './player-text-api';
import type {Destroyable} from '../common/capabilities';
import {concat, filter, forkJoin, Observable, observeOn, queueScheduler, Subject, takeUntil} from 'rxjs';
import {SessionStore} from '../session';
import {TrackRepository} from '../repository';
import type {PlayerInternalApi} from './player-api';
import {ObserverBreaker} from '../common/observer-breaker';
import {WindowPlaybackMode} from '../common';
import {describedObservable, errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable, wrapObservable} from '../util/rxjs-util';
import {type PlayerController} from './player-controller-api';
import {OpStageStatus} from '../common/op-stage';
import {type PlayerTextTrackHandlerApi, type TextTrackHandlerApi, TextTrackHandlerEventType} from '../text';
import {PlayerMainTextTrack, PlayerSidecarTextTrack, PlayerTextHandlerType, type PlayerTextTrack, type PlayerTextTrackLoadOptions} from './player-text-track';
import {PlayerAudioType} from './player-audio';
import type {OmpProvider} from '../omp-provider';

export interface PlayerTextConfig {
  textMode: PlayerTextMode;
}

export enum PlayerTextType {
  MAIN = 'MAIN',
  SIDECAR = 'SIDECAR',
}

export class PlayerText implements PlayerTextApi, Destroyable {
  protected readonly _onEvent$: Subject<PlayerTextEvent> = new Subject<PlayerTextEvent>();

  protected _sessionStore: SessionStore;

  protected _trackRepository: TrackRepository;

  protected _player!: PlayerInternalApi;

  protected _playerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  constructor(ompProvider: OmpProvider, player: PlayerInternalApi) {
    this._sessionStore = ompProvider.sessionStore;
    this._trackRepository = ompProvider.trackRepository;
    this.wirePlayer(player);
  }

  wirePlayer(player: PlayerInternalApi) {
    if (this._player === player) {
      return;
    }

    this._playerBreaker.break();

    let createAttachedDetachedFilter = <T>() => {
      return filter<T>(() => this.isAttached() || this.isDetached());
    };

    this._player = player;

    this._player.textInternal.onEvent$
      .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .pipe(createAttachedDetachedFilter())
      .subscribe((event) => {
        this._onEvent$.next(event);
      });
  }

  getHandler(id: TextTrack['id']): TextTrackHandlerApi | undefined {
    return this._player.textInternal.getHandler(id);
  }

  getTracks(): TextTrack[];
  getTracks(playerTextType?: PlayerTextType): TextTrack[] {
    let playerText = this._player.textInternal;
    if (playerTextType) {
      switch (playerTextType) {
        case PlayerTextType.MAIN:
          return playerText.getTracks(playerTextType).map((p) => this._trackRepository.getOrFail(p.id) as TextTrack);
        case PlayerTextType.SIDECAR:
          return playerText.getTracks(playerTextType).map((p) => this._trackRepository.getOrFail(p.id) as TextTrack);
        default:
          throw new Error('niy');
      }
    } else {
      return playerText.getTracks().map((p) => this._trackRepository.getOrFail(p.id) as TextTrack);
    }
  }

  switchTrack(trackId: TextTrack['id'], activate?: boolean): Observable<void> {
    return passiveObservable((observer) => {
      this._player.textInternal.switchTrack(trackId, activate).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  get shown(): boolean {
    return this._player.textInternal.shown;
  }

  show(): Observable<void> {
    return this._player.textInternal.show();
  }

  hide(): Observable<void> {
    return this._player.textInternal.hide();
  }

  toggleShowHide(): Observable<void> {
    return this._player.textInternal.toggleShowHide();
  }

  protected isAttached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED;
  }

  protected isDetached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
  }

  get onEvent$(): Observable<PlayerTextEvent> {
    return this._onEvent$.asObservable();
  }

  get state(): PlayerTextState {
    return this._player.textInternal.state;
  }

  destroy() {
    this._playerBreaker.destroy();
    this._destroyBreaker.destroy();
    freeObserver(this._onEvent$);
  }
}

export class PlayerTextInternal implements PlayerTextInternalApi, Destroyable {
  private readonly _onEvent$: Subject<PlayerTextEvent> = new Subject<PlayerTextEvent>();
  private readonly _onEventQueue$ = new Subject<PlayerTextEvent>();

  private _config: PlayerTextConfig;
  private _playerController: PlayerController | undefined;
  private _textMode: PlayerTextMode;

  private _playerTracks: {
    [PlayerTextType.MAIN]: PlayerTextTrack[];
    [PlayerTextType.SIDECAR]: PlayerTextTrack[];
  };

  private _eventBreaker = new ObserverBreaker();
  private _destroyBreaker = new ObserverBreaker();

  constructor(config: PlayerTextConfig) {
    this._config = config;

    this._textMode = this._config.textMode;

    this._playerTracks = {
      [PlayerTextType.MAIN]: [],
      [PlayerTextType.SIDECAR]: [],
    };

    // guarantees proper event ordering, needed because we're emitting PLAYER_TEXT_TRACK_CHANGE on every event
    this._onEventQueue$.pipe(observeOn(queueScheduler), takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._onEvent$.next(event);
    });

    this._onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type !== PlayerTextEventType.PLAYER_TEXT_CHANGE))
      .subscribe((event) => {
        this.emitPlayerTextChange(); // emit PlayerTextEventType.PLAYER_TEXT_CHANGE for all events except PlayerTextEventType.PLAYER_TEXT_CHANGE of course
      });
  }

  teardown() {
    this._eventBreaker.break();

    this._removeAllSidecarTracks();

    this._playerTracks[PlayerTextType.MAIN].forEach((p) => p.destroy());
    this._playerTracks[PlayerTextType.SIDECAR].forEach((p) => p.destroy()); // remove ?

    this._playerTracks = {
      [PlayerTextType.MAIN]: [],
      [PlayerTextType.SIDECAR]: [],
    };

    this._onEventQueue$.next({
      type: PlayerTextEventType.PLAYER_TEXT_UNLOADED,
      data: {
        playerText: this.state,
      },
    });
  }

  protected checkIsSetup() {
    if (!this._playerController) {
      throw new Error(`Controller not set up`);
    }
  }

  setup(playerController: PlayerController, mainMediaState: MainMediaState, playerTextHandlerType: PlayerTextHandlerType[]): void {
    if (this._playerController) {
      this.teardown();
    }

    this._onEventQueue$.next({
      type: PlayerTextEventType.PLAYER_TEXT_LOADING,
      data: {
        playerText: this.state,
      },
    });

    this._playerController = playerController;

    let mainTracks = mainMediaState.tracks.filter((p) => p.trackType === TrackType.TEXT_TRACK && p.loadStage.status === OpStageStatus.SUCCESS).map((p) => p as TextTrackState);
    let mainPlayerTracks = mainTracks.filter((p) => playerTextHandlerType.includes(PlayerTextHandlerType.EMBEDDED)).map((p) => new PlayerMainTextTrack(p, this._playerController!));

    mainPlayerTracks.forEach((playerTrack) => {
      playerTrack.loadStart();
      playerTrack.loadSuccess();

      playerTrack.onEvent$
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(filter((p) => p.type === PlayerTrackEventType.PLAYER_TRACK_SWITCHED))
        .subscribe((event) => {
          this._onEventQueue$.next({
            type: PlayerTextEventType.PLAYER_TEXT_TRACK_SWITCHED,
            data: {
              playerText: this.state,
              playerTextTrack: playerTrack.state,
            },
          });
        });
    });

    this._playerTracks[PlayerTextType.MAIN] = mainPlayerTracks;

    this._onEventQueue$.next({
      type: PlayerTextEventType.PLAYER_TEXT_LOADED,
      data: {
        playerText: this.state,
      },
    });
  }

  switchTrack(trackId: TextTrack['id'], activate: boolean = true): Observable<void> {
    return new Observable((observer) => {
      this.checkIsSetup();
      let mainPlayerTrack = this._playerTracks[PlayerTextType.MAIN].find((p) => p.trackState.id === trackId);
      let sidecarPlayerTrack = this._playerTracks[PlayerTextType.SIDECAR].find((p) => p.trackState.id === trackId);
      let playerTrack = mainPlayerTrack ? mainPlayerTrack : sidecarPlayerTrack ? sidecarPlayerTrack : void 0;

      if (playerTrack) {
        this.switchTrackPrepare(playerTrack, activate).subscribe((switchedInPrepare) => {
          if ((activate && playerTrack.active) || (!activate && !playerTrack.active)) {
            // nothing to do
            // console.debug(`Switching track skipped, track already ${activate ? 'active' : 'inactive'}`, playerTrack.state);
            if (switchedInPrepare) {
              this.emitPlayerTextChange();
            }
            nextCompleteObserver(observer);
          } else {
            playerTrack.handler.switch(activate).subscribe({
              next: () => {
                nextCompleteObserver(observer);
              },
              error: (err) => {
                errorCompleteObserver(observer, err);
              },
            });
          }
        });
      } else {
        errorCompleteObserver(observer, `Track not found`);
      }
    });
  }

  protected switchTrackPrepare(track: PlayerTextTrack, activate: boolean): Observable<boolean> {
    return new Observable<boolean>((observer) => {
      if (activate && this._textMode === PlayerTextMode.SINGLE) {
        let activeSidecarTracks = this._playerTracks[PlayerTextType.SIDECAR].filter((p) => p.active && p !== track);
        let activeMainTracks = this._playerTracks[PlayerTextType.MAIN].filter((p) => p.active && p !== track);
        let allActive = [...activeSidecarTracks, ...activeMainTracks];

        if (allActive.length > 0) {
          forkJoin([...activeSidecarTracks, ...activeMainTracks].map((p) => p.handler.switch(false))).subscribe(() => {
            nextCompleteObserver(observer, true);
          });
        } else {
          nextCompleteObserver(observer, false);
        }
      } else {
        nextCompleteObserver(observer, false);
      }
    });
  }

  private _getPlayerTracks() {
    return [...this._playerTracks[PlayerTextType.MAIN], ...this._playerTracks[PlayerTextType.SIDECAR]];
  }

  updateTrack(trackState: TextTrackState): void {
    this._getPlayerTracks()
      .filter((p) => p.trackState.id === trackState.id)
      .forEach((p) => p.setTrackState(trackState));
  }

  getTracks(): TextTrackState[];
  getTracks(playerTextTrackType: PlayerTextType.MAIN): TextTrackState[];
  getTracks(playerTextTrackType: PlayerTextType.SIDECAR): TextTrackState[];
  getTracks(playerTextTrackType?: PlayerTextType.MAIN | PlayerTextType.SIDECAR): TextTrackState[] {
    switch (playerTextTrackType) {
      case undefined:
        return this._getPlayerTracks().map((p) => p.trackState);
      case PlayerTextType.MAIN:
        return this._playerTracks[PlayerTextType.MAIN].map((p) => p.trackState);
      case PlayerTextType.SIDECAR:
        return this._playerTracks[PlayerTextType.SIDECAR].map((p) => p.trackState);
      default:
        throw new Error(`Unknown player text track type ${playerTextTrackType}`);
    }
  }

  getHandler(trackId: TextTrack['id']): TextTrackHandlerApi | undefined {
    return this.getPlayerTextTrackHandler(trackId);
  }

  protected getPlayerTextTrackHandler(trackId: TextTrack['id']): PlayerTextTrackHandlerApi | undefined {
    let mainPlayerTrack = this._playerTracks[PlayerTextType.MAIN].find((p) => p.trackState.id === trackId);
    let sidecarPlayerTrack = this._playerTracks[PlayerTextType.SIDECAR].find((p) => p.trackState.id === trackId);
    let playerTrack = mainPlayerTrack ? mainPlayerTrack : sidecarPlayerTrack ? sidecarPlayerTrack : void 0;
    return playerTrack?.handler;
  }

  show(): Observable<void> {
    return this.showOrHide(true);
  }

  hide(): Observable<void> {
    return this.showOrHide(false);
  }

  protected showOrHide(show: boolean): Observable<void> {
    return passiveObservable((observer) => {
      let mainPlayerTrack = this._playerTracks[PlayerTextType.MAIN].filter((p) => p.active);
      let sidecarPlayerTrack = this._playerTracks[PlayerTextType.SIDECAR].filter((p) => p.active);
      let allTracks = [...mainPlayerTrack, ...sidecarPlayerTrack];
      let o$ = allTracks.map((p) => {
        return show ? p.handler.show() : p.handler.hide();
      });
      forkJoin(o$).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  get shown(): boolean {
    let mainPlayerTrack = this._playerTracks[PlayerTextType.MAIN].filter((p) => p.active);
    let sidecarPlayerTrack = this._playerTracks[PlayerTextType.SIDECAR].filter((p) => p.active);
    let allTracks = [...mainPlayerTrack, ...sidecarPlayerTrack];
    let shown = allTracks.filter((p) => p.state.shown);
    return shown.length > 0 && allTracks.length === shown.length;
  }

  toggleShowHide(): Observable<void> {
    return this.shown ? this.hide() : this.show();
  }

  loadSidecarTrack(
    trackState: TextTrackState,
    trackUpdater: (attrs: TextTrackUpdateableAttrs) => Observable<TextTrackState>,
    loadOptions?: PlayerTextTrackLoadOptions | undefined
  ): Observable<TextTrackState> {
    return new Observable((observer) => {
      this.checkIsSetup();

      if (trackState.loadStage.status !== OpStageStatus.SUCCESS) {
        throw new Error(`Track must be loaded before loading in player, id=${trackState.id} ${trackState.loadStage.status}`);
      }

      let existingPlayerTrack = this._playerTracks[PlayerAudioType.SIDECAR].find((p) => p.trackState.id === trackState.id);
      if (existingPlayerTrack) {
        throw new Error(`Track already loaded, id=${trackState.id}`);
      }

      let playerTrack = new PlayerSidecarTextTrack(trackState, this._playerController!, loadOptions);

      this._playerTracks[PlayerTextType.SIDECAR].push(playerTrack);

      let onUnloaded$ = this._onEvent$
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(filter((p) => p.type === PlayerTextEventType.PLAYER_TEXT_TRACK_UNLOADED && p.data.playerTextTrack.trackId === playerTrack.trackState.id));

      playerTrack.onEvent$
        .pipe(filter((p) => p.type === PlayerTrackEventType.PLAYER_TRACK_SWITCHED))
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(takeUntil(onUnloaded$))
        .subscribe((event) => {
          this._onEventQueue$.next({
            type: PlayerTextEventType.PLAYER_TEXT_TRACK_SWITCHED,
            data: {
              playerText: this.state,
              playerTextTrack: playerTrack.state,
            },
          });
        });

      playerTrack.handler.onEvent$
        .pipe(filter((p) => p.type === TextTrackHandlerEventType.TEXT_TRACK_HANDLER_CHANGE))
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(takeUntil(onUnloaded$))
        .subscribe((event) => {
          this.emitPlayerTextChange();
        });

      let loadBreaker = new ObserverBreaker();
      playerTrack.onEvent$
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(takeUntil(loadBreaker.observer))
        .subscribe((event) => {
          switch (event.type) {
            case PlayerTrackEventType.PLAYER_TRACK_LOADING:
              this._onEventQueue$.next({
                type: PlayerTextEventType.PLAYER_TEXT_TRACK_LOADING,
                data: {
                  playerTextTrack: playerTrack.state,
                },
              });
              break;
            case PlayerTrackEventType.PLAYER_TRACK_LOADED:
              this._onEventQueue$.next({
                type: PlayerTextEventType.PLAYER_TEXT_TRACK_LOADED,
                data: {
                  playerTextTrack: playerTrack.state,
                },
              });
              loadBreaker.break();
              nextCompleteObserver(observer, trackState);
              break;
            case PlayerTrackEventType.PLAYER_TRACK_LOAD_ERROR:
              this._onEventQueue$.next({
                type: PlayerTextEventType.PLAYER_TEXT_TRACK_LOAD_ERROR,
                data: {
                  playerTextTrack: playerTrack.state,
                  error: event.data.error,
                },
              });
              loadBreaker.break();
              errorCompleteObserver(observer, event.data.error);
              break;
          }
        });

      playerTrack
        .loadSource()
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe(() => {
          // handled in events above
        });
    });
  }

  removeSidecarTrack(id: TrackState['id']): Observable<void> {
    return new Observable<void>((observer) => {
      this._removeSidecarTrack(id);
      nextCompleteObserver(observer);
    });
  }

  _removeSidecarTrack(id: TrackState['id']): void {
    let playerTrack = this._playerTracks[PlayerTextType.SIDECAR].find((p) => p.trackState.id === id);

    if (!playerTrack) {
      throw new Error('No sidecar track found');
    }

    this._playerTracks[PlayerTextType.SIDECAR].splice(this._playerTracks[PlayerTextType.SIDECAR].indexOf(playerTrack), 1);

    let state = playerTrack.state;

    playerTrack.destroy();

    this._onEventQueue$.next({
      type: PlayerTextEventType.PLAYER_TEXT_TRACK_UNLOADED,
      data: {
        playerTextTrack: state,
      },
    });
  }

  removeAllSidecarTracks(): Observable<void> {
    return new Observable<void>((observer) => {
      this._removeAllSidecarTracks();
      nextCompleteObserver(observer);
    });
  }

  _removeAllSidecarTracks(): void {
    const tracks = [...this._playerTracks[PlayerTextType.SIDECAR]];
    if (tracks.length === 0) {
      return;
    }
    tracks.forEach((p) => this._removeSidecarTrack(p.trackState.id));
  }

  get state(): PlayerTextState {
    return {
      textMode: this._textMode,
      tracks: {
        [PlayerTextType.MAIN]: this._playerTracks[PlayerTextType.MAIN].map((p) => p.state),
        [PlayerTextType.SIDECAR]: this._playerTracks[PlayerTextType.SIDECAR].map((p) => p.state),
      },
      handlers: {
        [PlayerTextType.MAIN]: this._playerTracks[PlayerTextType.MAIN].map((p) => p.handler.state),
        [PlayerTextType.SIDECAR]: this._playerTracks[PlayerTextType.SIDECAR].map((p) => p.handler.state),
      },
      shown: this.shown,
    };
  }

  protected emitPlayerTextChange() {
    this._onEventQueue$.next({
      type: PlayerTextEventType.PLAYER_TEXT_CHANGE,
      data: {
        playerText: this.state,
      },
    });
  }

  restoreState(state: PlayerTextState): Observable<void> {
    return new Observable((observer) => {
      let oCount = 0;
      let describeMe = (title: string, source$: Observable<void>) => {
        return describedObservable(`${++oCount} | ${title}`, source$, 2);
      };

      let os$: Observable<any>[] = [];

      let addObservable = (observable: Observable<any>) => {
        os$.push(observable);
      };

      // IMPORTANT: if inner observable is passive - we have to wrap it if we want to delay the execution

      [...state.tracks[PlayerTextType.MAIN].filter((p) => p.active), ...state.tracks[PlayerTextType.SIDECAR].filter((p) => p.active)].forEach((playerTextTrackState) => {
        let mainPlayerTextTrack = this._playerTracks[PlayerTextType.MAIN].find((p) => p.trackState.id === playerTextTrackState.trackId);
        let sidecarPlayerTextTrack = this._playerTracks[PlayerTextType.SIDECAR].find((p) => p.trackState.id === playerTextTrackState.trackId);

        let playerTextTrack = mainPlayerTextTrack ? mainPlayerTextTrack : sidecarPlayerTextTrack;

        if (!playerTextTrack) {
          throw new Error(`Player text track with track id=${playerTextTrackState.trackId} not found`);
        }

        let handler = this.getPlayerTextTrackHandler(playerTextTrack.trackState.id);

        if (!handler) {
          throw new Error(`TextTrack handler for track with track id=${playerTextTrackState.trackId} not found`);
        }

        addObservable(describeMe(`Track switch, trackId=${playerTextTrack.trackState.id}`, wrapObservable(playerTextTrack.handler.switch(true))));

        // if active and hidden we have to hide it, because it's shown when activated
        if (!playerTextTrackState.shown) {
          addObservable(describeMe(`Track switch, trackId=${playerTextTrack.trackState.id}`, wrapObservable(playerTextTrack.handler.hide())));
        }
      });

      if (os$.length > 0) {
        concat(...os$).subscribe({
          complete: () => {
            nextCompleteObserver(observer);
          },
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  get onEvent$(): Observable<PlayerTextEvent> {
    return this._onEvent$.asObservable();
  }

  destroy(): void {
    this.teardown();
    this._eventBreaker.destroy();
    this._destroyBreaker.destroy();

    freeObserver(this._onEvent$);
    freeObserver(this._onEventQueue$);
  }
}
