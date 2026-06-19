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

import type {Destroyable} from '../common/capabilities';
import {type PlayerController} from './player-controller-api';
import {
  Audio,
  type AudioState,
  type AudioUpdateableAttrs,
  type MainMediaState,
  type TrackState,
  TrackType
} from '../media';
import {ObserverBreaker} from '../common/observer-breaker';
import {concat, filter, forkJoin, merge, Observable, observeOn, queueScheduler, Subject, take, takeUntil} from 'rxjs';
import {
  type PlayerAudioApi,
  type PlayerAudioEvent,
  PlayerAudioEventType,
  type PlayerAudioInternalApi,
  PlayerAudioMode,
  type PlayerAudioState
} from './player-audio-api';
import {PlayerTrackEventType} from './player-track';
import {
  type AudioHandlerApi,
  AudioHandlerEventType,
  DisabledMediaElementSourcePlayerAudioHandler,
  GainPlayerAudioHandler,
  MediaElementPlayerAudioHandler,
  type PlayerAudioHandlerApi,
} from '../audio/audio-handler';
import {CryptoUtil} from '../util/crypto-util';
import {StringUtil} from '../util/string-util';
import {SessionStore} from '../session';
import {TrackRepository} from '../repository';
import {WindowPlaybackMode} from '../common';
import type {PlayerInternalApi} from './player-api';
import {
  describedObservable,
  errorCompleteObserver,
  freeObserver,
  nextCompleteObserver,
  passiveObservable,
  wrapObservable
} from '../util/rxjs-util';
import {AUDIO_DEFAULTS} from '../constants';
import {OpStageStatus} from '../common/op-stage';
import {
  type PlayerAudioLoadOptions,
  type PlayerAudioTrack,
  PlayerMainAudioTrack,
  PlayerSidecarAudioTrack
} from './player-audio-track';
import {OmakaseAudioContextProvider} from '../omakase-audio-context-provider';
import {AudioEffectsRegistry} from '../audio';
import type {OmpProvider} from '../omp-provider';

export interface PlayerAudioConfig {
  audioMode: PlayerAudioMode;
}

export enum PlayerAudioType {
  OUTPUT = 'OUTPUT',
  MAIN = 'MAIN',
  SIDECAR = 'SIDECAR',
}

export class PlayerAudio implements PlayerAudioApi, Destroyable {
  protected readonly _onEvent$: Subject<PlayerAudioEvent> = new Subject<PlayerAudioEvent>();

  protected _sessionStore: SessionStore;
  protected _trackRepository: TrackRepository;
  protected _audioEffectsRegistry: AudioEffectsRegistry;

  protected _player!: PlayerInternalApi;

  protected _playerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  constructor(ompProvider: OmpProvider, player: PlayerInternalApi) {
    this._sessionStore = ompProvider.sessionStore;
    this._trackRepository = ompProvider.trackRepository;
    this._audioEffectsRegistry = ompProvider.audioEffectsRegistry;
    this.wirePlayer(player);
  }

  get audioEffects() {
    return this._audioEffectsRegistry;
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

    this._player.audioInternal.onEvent$
      .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .pipe(createAttachedDetachedFilter())
      .subscribe((event) => {
        this._onEvent$.next(event);
      });
  }

  protected isAttached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED;
  }

  protected isDetached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
  }

  get audioContext(): AudioContext {
    return OmakaseAudioContextProvider.audioContext;
  }

  get onEvent$(): Observable<PlayerAudioEvent> {
    return this._onEvent$.asObservable();
  }

  get state(): PlayerAudioState {
    return this._player.audioInternal.state;
  }

  getHandler(playerAudioType: PlayerAudioType, id?: Audio['id']): AudioHandlerApi | undefined {
    let playerAudioInternal = this._player.audioInternal;
    switch (playerAudioType) {
      case PlayerAudioType.OUTPUT:
      case PlayerAudioType.MAIN:
        return playerAudioInternal.getHandler(playerAudioType);
      case PlayerAudioType.SIDECAR:
        return playerAudioInternal.getHandler(playerAudioType, id!);
    }
  }

  getTracks(): Audio[];
  getTracks(playerAudioType?: PlayerAudioType): Audio[] {
    let playerAudio = this._player.audioInternal;
    if (playerAudioType) {
      switch (playerAudioType) {
        case PlayerAudioType.MAIN:
          return playerAudio.getTracks(playerAudioType).map((p) => this._trackRepository.getOrFail(p.id) as Audio);
        case PlayerAudioType.SIDECAR:
          return playerAudio.getTracks(playerAudioType).map((p) => this._trackRepository.getOrFail(p.id) as Audio);
        default:
          throw new Error('niy');
      }
    } else {
      return playerAudio.getTracks().map((p) => this._trackRepository.getOrFail(p.id) as Audio);
    }
  }

  switchTrack(trackId: Audio['id'], activate?: boolean): Observable<void> {
    return passiveObservable((observer) => {
      this._player.audioInternal.switchTrack(trackId, activate).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  private getOutputHandlerOrFail(): AudioHandlerApi {
    let handler = this.getHandler(PlayerAudioType.OUTPUT);
    if (!handler) {
      throw new Error(`Audio not set up`);
    }
    return handler;
  }

  get muted(): boolean {
    return this.getOutputHandlerOrFail().muted;
  }

  get volume(): number {
    return this.getOutputHandlerOrFail().volume;
  }

  mute(): Observable<void> {
    return this.getOutputHandlerOrFail().mute();
  }

  setMuted(muted: boolean): Observable<void> {
    return this.getOutputHandlerOrFail().setMuted(muted);
  }

  setVolume(volume: number): Observable<void> {
    return this.getOutputHandlerOrFail().setVolume(volume);
  }

  toggleMuted(): Observable<void> {
    return this.getOutputHandlerOrFail().toggleMuted();
  }

  unmute(): Observable<void> {
    return this.getOutputHandlerOrFail().unmute();
  }

  destroy() {
    this._playerBreaker.destroy();
    this._destroyBreaker.destroy();
    freeObserver(this._onEvent$);
  }
}

export class PlayerAudioInternal implements PlayerAudioInternalApi, Destroyable {
  private readonly _onEvent$: Subject<PlayerAudioEvent> = new Subject<PlayerAudioEvent>();
  private readonly _onEventQueue$ = new Subject<PlayerAudioEvent>();

  private _config: PlayerAudioConfig;
  private _playerController: PlayerController | undefined;
  private _audioMode: PlayerAudioMode;

  private _playerTracks: {
    [PlayerAudioType.MAIN]: PlayerAudioTrack[];
    [PlayerAudioType.SIDECAR]: PlayerAudioTrack[];
  };

  private _handlers: {
    [PlayerAudioType.OUTPUT]: PlayerAudioHandlerApi | undefined;
    [PlayerAudioType.MAIN]: PlayerAudioHandlerApi | undefined;
    [PlayerAudioType.SIDECAR]: PlayerAudioHandlerApi[];
  };

  private _playerTracksRequestingBuffering: Set<PlayerSidecarAudioTrack> = new Set<PlayerSidecarAudioTrack>();

  private _eventBreaker = new ObserverBreaker();
  private _destroyBreaker = new ObserverBreaker();

  constructor(config: PlayerAudioConfig) {
    this._config = config;

    this._audioMode = this._config.audioMode;

    this._playerTracks = {
      [PlayerAudioType.MAIN]: [],
      [PlayerAudioType.SIDECAR]: [],
    };

    this._handlers = {
      [PlayerAudioType.OUTPUT]: void 0,
      [PlayerAudioType.MAIN]: void 0,
      [PlayerAudioType.SIDECAR]: [],
    };

    // guarantees proper event ordering, needed because we're emitting PLAYER_AUDIO_CHANGE on every event
    this._onEventQueue$.pipe(observeOn(queueScheduler), takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._onEvent$.next(event);
    });

    this._onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type !== PlayerAudioEventType.PLAYER_AUDIO_CHANGE))
      .subscribe((event) => {
        this.emitPlayerAudioChange(); // emit PlayerAudioEventType.PLAYER_AUDIO_CHANGE for all events except PlayerAudioEventType.PLAYER_AUDIO_CHANGE of course
      });
  }

  teardown() {
    this._eventBreaker.break();

    [...this._playerTracks[PlayerAudioType.SIDECAR]].forEach((p) => {
      
      this._playerTracks[PlayerAudioType.SIDECAR].splice(this._playerTracks[PlayerAudioType.SIDECAR].indexOf(p), 1);
      this._handlers[PlayerAudioType.SIDECAR].splice(this._handlers[PlayerAudioType.SIDECAR].indexOf(p.playerAudioHandler), 1);

      const state = p.state;
      p.destroy();
      this._onEventQueue$.next({
        type: PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED,
        data: {
          playerAudioTrack: state,
        },
      });
    });
    this._playerTracks[PlayerAudioType.SIDECAR] = [];
    this._handlers[PlayerAudioType.SIDECAR] = [];

    this._playerTracks[PlayerAudioType.MAIN].forEach((p) => p.destroy());

    this._playerTracks = {
      [PlayerAudioType.MAIN]: [],
      [PlayerAudioType.SIDECAR]: [],
    };

    this._handlers[PlayerAudioType.OUTPUT]?.destroy();
    this._handlers[PlayerAudioType.MAIN]?.destroy();

    this._handlers = {
      [PlayerAudioType.OUTPUT]: void 0,
      [PlayerAudioType.MAIN]: void 0,
      [PlayerAudioType.SIDECAR]: [],
    };

    this._onEventQueue$.next({
      type: PlayerAudioEventType.PLAYER_AUDIO_UNLOADED,
      data: {
        playerAudio: this.state,
      },
    });
  }

  protected checkIsSetup() {
    if (!this._playerController) {
      throw new Error(`Controller not set up`);
    }
  }

  setup(playerController: PlayerController, mainMediaState: MainMediaState): void {
    if (this._playerController) {
      this.teardown();
    }

    this._onEventQueue$.next({
      type: PlayerAudioEventType.PLAYER_AUDIO_LOADING,
      data: {
        playerAudio: this.state,
      },
    });

    this._playerController = playerController;

    let outputAudioHandler = new GainPlayerAudioHandler(CryptoUtil.uuid());
    outputAudioHandler.setChannelCount(OmakaseAudioContextProvider.audioContext.destination.maxChannelCount); // the maximum number of channels that this hardware is capable of supporting
    outputAudioHandler.outputAudioNode.connect(OmakaseAudioContextProvider.audioContext.destination);

    let createMainAudioHandler = () => {
      let playerAudioHandler: PlayerAudioHandlerApi;
      if (playerController.createMediaElementSourceEnabled) {
        playerAudioHandler = new MediaElementPlayerAudioHandler(CryptoUtil.uuid(), playerController.videoElement);
      } else {
        playerAudioHandler = new DisabledMediaElementSourcePlayerAudioHandler(CryptoUtil.uuid(), playerController.videoElement, outputAudioHandler);
      }
      // some browsers automatically set <video> element volume to last value set in previous sessions, lets reset it to default
      playerAudioHandler.setVolume(AUDIO_DEFAULTS.volume);
      return playerAudioHandler;
    };

    let mainAudioHandler: PlayerAudioHandlerApi = createMainAudioHandler();
    mainAudioHandler.setChannelCount(OmakaseAudioContextProvider.audioContext.destination.maxChannelCount); // the maximum number of channels that this hardware is capable of supporting
    mainAudioHandler.outputAudioNode.connect(outputAudioHandler.inputAudioNode);

    this._handlers = {
      [PlayerAudioType.OUTPUT]: outputAudioHandler,
      [PlayerAudioType.MAIN]: mainAudioHandler,
      [PlayerAudioType.SIDECAR]: [],
    };

    let mainTracks = mainMediaState.tracks.filter((p) => p.trackType === TrackType.AUDIO && p.loadStage.status === OpStageStatus.SUCCESS).map((p) => p as AudioState);
    let mainPlayerTracks = mainTracks.map((p) => new PlayerMainAudioTrack(p, mainAudioHandler, this._playerController!));
    mainPlayerTracks.forEach((playerTrack) => {
      playerTrack.loadStart();
      playerTrack.loadSuccess();

      playerTrack.onEvent$
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(filter((p) => p.type === PlayerTrackEventType.PLAYER_TRACK_SWITCHED))
        .subscribe((event) => {
          this._onEventQueue$.next({
            type: PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED,
            data: {
              playerAudio: this.state,
              playerAudioTrack: playerTrack.state,
            },
          });
        });
    });

    this._playerTracks[PlayerAudioType.MAIN] = mainPlayerTracks;

    merge(
      outputAudioHandler.onEvent$.pipe(filter((p) => p.type === AudioHandlerEventType.AUDIO_HANDLER_CHANGE)),
      mainAudioHandler.onEvent$.pipe(filter((p) => p.type === AudioHandlerEventType.AUDIO_HANDLER_CHANGE))
    )
      .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.emitPlayerAudioChange();
      });

    this._onEventQueue$.next({
      type: PlayerAudioEventType.PLAYER_AUDIO_LOADED,
      data: {
        playerAudio: this.state,
      },
    });
  }

  protected emitPlayerAudioChange() {
    this._onEventQueue$.next({
      type: PlayerAudioEventType.PLAYER_AUDIO_CHANGE,
      data: {
        playerAudio: this.state,
      },
    });
  }

  switchTrack(trackId: Audio['id'], activate: boolean = true): Observable<void> {
    return new Observable((observer) => {
      this.checkIsSetup();
      let mainPlayerTrack = this._playerTracks[PlayerAudioType.MAIN].find((p) => p.trackState.id === trackId);
      let sidecarPlayerTrack = this._playerTracks[PlayerAudioType.SIDECAR].find((p) => p.trackState.id === trackId);

      let playerTrack = mainPlayerTrack ? mainPlayerTrack : sidecarPlayerTrack ? sidecarPlayerTrack : void 0;
      // console.debug(`About to activate audio track:`, playerTrack?.state)

      if (playerTrack) {
        this.switchTrackPrepare(playerTrack, activate).subscribe((switchedInPrepare) => {
          if ((activate && playerTrack.active) || (!activate && !playerTrack.active)) {
            // nothing to do
            // console.debug(`Switching track skipped, track already ${activate ? 'active' : 'inactive'}`, playerTrack.state);
            if (switchedInPrepare) {
              this.emitPlayerAudioChange();
            }
            nextCompleteObserver(observer);
          } else {
            // console.debug(`Activating audio track:`, playerTrack.state)
            playerTrack.setActive(activate).subscribe({
              next: () => {
                // if (playerTrack.trackState.channels) {
                //   this._handlers['MAIN']!.channelCount = playerTrack.trackState.channels;
                // }
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

  protected switchTrackPrepare(track: PlayerAudioTrack, activate: boolean): Observable<boolean> {
    return new Observable<boolean>((observer) => {
      if (activate && this._audioMode === PlayerAudioMode.SINGLE) {
        let activeSidecarTracks = this._playerTracks[PlayerAudioType.SIDECAR].filter((p) => p.active && p !== track);
        let activeMainTracks = this._playerTracks[PlayerAudioType.MAIN].filter((p) => p.active && p !== track);
        let allActive = [...activeSidecarTracks, ...activeMainTracks];
        // console.debug(`Trying to deactivate following audio tracks:`, [...activeSidecarTracks, ...activeMainTracks].map(p => p.trackState))

        if (allActive.length > 0) {
          forkJoin([...activeSidecarTracks, ...activeMainTracks].map((p) => p.setActive(false))).subscribe(() => {
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
    return [...this._playerTracks[PlayerAudioType.MAIN], ...this._playerTracks[PlayerAudioType.SIDECAR]];
  }

  updateTrack(trackState: AudioState): void {
    this._getPlayerTracks()
      .filter((p) => p.trackState.id === trackState.id)
      .forEach((p) => p.setTrackState(trackState));
  }

  getTracks(): AudioState[];
  getTracks(playerAudioType: PlayerAudioType.MAIN): AudioState[];
  getTracks(playerAudioType: PlayerAudioType.SIDECAR): AudioState[];
  getTracks(playerAudioType?: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR): AudioState[] {
    switch (playerAudioType) {
      case undefined:
        return this._getPlayerTracks().map((p) => p.trackState);
      case PlayerAudioType.MAIN:
        return this._playerTracks[PlayerAudioType.MAIN].map((p) => p.trackState);
      case PlayerAudioType.SIDECAR:
        return this._playerTracks[PlayerAudioType.SIDECAR].map((p) => p.trackState);
      default:
        throw new Error(`Unknown player audio type ${playerAudioType}`);
    }
  }

  getHandler(playerAudioType: PlayerAudioType.OUTPUT | PlayerAudioType.MAIN): AudioHandlerApi | undefined;
  getHandler(playerAudioType: PlayerAudioType.SIDECAR, id: Audio['id']): AudioHandlerApi | undefined;
  getHandler(playerAudioType: PlayerAudioType, id?: Audio['id']): AudioHandlerApi | undefined {
    switch (playerAudioType) {
      case PlayerAudioType.OUTPUT:
        return this._handlers[PlayerAudioType.OUTPUT];
      case PlayerAudioType.MAIN:
        return this._handlers[PlayerAudioType.MAIN];
      case PlayerAudioType.SIDECAR:
        if (StringUtil.isNonEmpty(id)) {
          let handlerId = this._playerTracks[PlayerAudioType.SIDECAR].find((p) => p.trackState.id === id)?.playerAudioHandler.id;
          return this._handlers[PlayerAudioType.SIDECAR].find((p) => p.id === handlerId);
        } else {
          throw new Error(`Provide ${PlayerAudioType.SIDECAR} audio id `);
        }
      default:
        throw new Error(`Unknown player audio type ${playerAudioType}`);
    }
  }

  loadSidecarTrack(trackState: AudioState, trackUpdater: (attrs: AudioUpdateableAttrs) => Observable<AudioState>, loadOptions?: PlayerAudioLoadOptions | undefined): Observable<AudioState> {
    return new Observable((observer) => {
      this.checkIsSetup();

      if (trackState.loadStage.status !== OpStageStatus.SUCCESS) {
        throw new Error(`Track must be loaded before loading in player, id=${trackState.id}`);
      }

      let existingPlayerTrack = this._playerTracks[PlayerAudioType.SIDECAR].find((p) => p.trackState.id === trackState.id);
      if (existingPlayerTrack) {
        throw new Error(`Track already loaded, id=${trackState.id}`);
      }

      let outputAudioHandler = this._handlers[PlayerAudioType.OUTPUT];
      if (!outputAudioHandler) {
        throw new Error(`Output audio handler not set`);
      }

      let playerTrack = new PlayerSidecarAudioTrack(trackState, this._playerController!, outputAudioHandler.inputAudioNode);

      this._playerTracks[PlayerAudioType.SIDECAR].push(playerTrack);
      this._handlers[PlayerAudioType.SIDECAR].push(playerTrack.playerAudioHandler);

      let onUnloaded$ = this._onEvent$
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(filter((p) => p.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED && p.data.playerAudioTrack.trackId === playerTrack.trackState.id));

      playerTrack.onEvent$
        .pipe(filter((p) => p.type === PlayerTrackEventType.PLAYER_TRACK_SWITCHED))
        .pipe(takeUntil(onUnloaded$))
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe((event) => {
          this._onEventQueue$.next({
            type: PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED,
            data: {
              playerAudio: this.state,
              playerAudioTrack: playerTrack.state,
            },
          });
        });

      playerTrack.audioTrackController.onBufferingRequired$
        .pipe(takeUntil(onUnloaded$))
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe((bufferingRequired) => {
          let emitEvent = false;
          if (bufferingRequired && !this._playerTracksRequestingBuffering.has(playerTrack)) {
            this._playerTracksRequestingBuffering.add(playerTrack);
            emitEvent = true;
          } else if (!bufferingRequired && this._playerTracksRequestingBuffering.has(playerTrack)) {
            this._playerTracksRequestingBuffering.delete(playerTrack);
            emitEvent = true;
          }

          if (emitEvent) {
            this._onEventQueue$.next({
              type: PlayerAudioEventType.PLAYER_AUDIO_TRACKS_REQUESTING_BUFFERING_CHANGE,
              data: {
                playerAudioTracks: [...this._playerTracksRequestingBuffering.values()].map((p) => p.state),
              },
            });
          }
        });

      playerTrack.playerAudioHandler.onEvent$
        .pipe(filter((p) => p.type === AudioHandlerEventType.AUDIO_HANDLER_CHANGE))
        .pipe(takeUntil(onUnloaded$))
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe((event) => {
          this.emitPlayerAudioChange();
        });

      let loadBreaker = new ObserverBreaker();
      playerTrack.onEvent$
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(takeUntil(loadBreaker.observer))
        .subscribe((event) => {
          switch (event.type) {
            case PlayerTrackEventType.PLAYER_TRACK_LOADING:
              this._onEventQueue$.next({
                type: PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADING,
                data: {
                  playerAudioTrack: playerTrack.state,
                },
              });
              break;
            case PlayerTrackEventType.PLAYER_TRACK_LOADED:

              trackUpdater({
                channels: playerTrack.playerAudioHandler.channelCount,
              }).subscribe((audioState) => {
                playerTrack.setTrackState(audioState);

                this._onEventQueue$.next({
                  type: PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED,
                  data: {
                    playerAudioTrack: playerTrack.state,
                  },
                });
                loadBreaker.break();
                nextCompleteObserver(observer, audioState);
              });
              // // immediately switch to this track
              // this.switchTrack(playerTrack.trackState.id).subscribe({
              //   next: () => {
              //     trackUpdater({
              //       channels: playerTrack.playerAudioHandler.channelCount,
              //     }).subscribe((audioState) => {
              //       playerTrack.setTrackState(audioState);
              //
              //       this._onEventQueue$.next({
              //         type: PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED,
              //         data: {
              //           playerAudioTrack: playerTrack.state,
              //         },
              //       });
              //       loadBreaker.break();
              //       nextCompleteObserver(observer, audioState);
              //     });
              //   },
              //   error: (err) => {
              //     this._onEventQueue$.next({
              //       type: PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOAD_ERROR,
              //       data: {
              //         playerAudioTrack: playerTrack.state,
              //         error: err,
              //       },
              //     });
              //     loadBreaker.break();
              //     errorCompleteObserver(observer, err);
              //   },
              // });
              break;
            case PlayerTrackEventType.PLAYER_TRACK_LOAD_ERROR:
              this._onEventQueue$.next({
                type: PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOAD_ERROR,
                data: {
                  playerAudioTrack: playerTrack.state,
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
        .pipe(take(1))
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe(() => {
          // handled in events above
        });
    });
  }

  removeSidecarTrack(id: TrackState['id']): Observable<void> {
    return this._removeSidecarTrack(id);
  }

  protected _removeSidecarTrack(id: TrackState['id']): Observable<void> {
    return new Observable<void>((observer) => {
      const playerTrack = this._playerTracks[PlayerAudioType.SIDECAR].find((p) => p.trackState.id === id);

      if (!playerTrack) {
        errorCompleteObserver(observer, new Error('No sidecar track found'));
        return;
      }

      const doRemove = () => {
        this._playerTracks[PlayerAudioType.SIDECAR].splice(this._playerTracks[PlayerAudioType.SIDECAR].indexOf(playerTrack), 1);
        this._handlers[PlayerAudioType.SIDECAR].splice(this._handlers[PlayerAudioType.SIDECAR].indexOf(playerTrack.playerAudioHandler), 1);

        const state = playerTrack.state;
        playerTrack.destroy();

        this._onEventQueue$.next({
          type: PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED,
          data: {
            playerAudioTrack: state,
          },
        });

        nextCompleteObserver(observer);
      };

      if (this._audioMode === PlayerAudioMode.SINGLE && playerTrack.active) {
        const mainTrack = this._playerTracks[PlayerAudioType.MAIN][0];
        if (mainTrack) {
          this.switchTrack(mainTrack.trackState.id, true).subscribe({
            next: () => doRemove(),
            error: (err) => errorCompleteObserver(observer, err),
          });
        } else {
          doRemove();
        }
      } else {
        doRemove();
      }
    });
  }

  removeAllSidecarTracks(): Observable<void> {
    return this._removeAllSidecarTracks();
  }

  _removeAllSidecarTracks(): Observable<void> {
    const tracks = [...this._playerTracks[PlayerAudioType.SIDECAR]];
    return tracks.length > 0
      ? concat(...tracks.map((p) => this._removeSidecarTrack(p.trackState.id)))
      : new Observable<void>((observer) => nextCompleteObserver(observer));
  }

  get state(): PlayerAudioState {
    return {
      audioMode: this._audioMode,
      tracks: {
        [PlayerAudioType.MAIN]: this._playerTracks[PlayerAudioType.MAIN].map((p) => p.state),
        [PlayerAudioType.SIDECAR]: this._playerTracks[PlayerAudioType.SIDECAR].map((p) => p.state),
      },
      handlers: {
        [PlayerAudioType.OUTPUT]: this._handlers[PlayerAudioType.OUTPUT]?.state,
        [PlayerAudioType.MAIN]: this._handlers[PlayerAudioType.MAIN]?.state,
        [PlayerAudioType.SIDECAR]: this._handlers[PlayerAudioType.SIDECAR].map((p) => p.state),
      },
    };
  }

  restoreState(state: PlayerAudioState): Observable<void> {
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

      let activeMainTrack = state.tracks[PlayerAudioType.MAIN].find((p) => p.active);
      if (activeMainTrack) {
        addObservable(describeMe(`Main tracks activation`, wrapObservable(this.switchTrack(activeMainTrack.trackId))));
      }

      let activeSidecarTracks = state.tracks[PlayerAudioType.SIDECAR].filter((p) => p.active);
      activeSidecarTracks.forEach((p) => addObservable(describeMe(`Sidecar track switch, trackId=${p.trackId}`, wrapObservable(this.switchTrack(p.trackId)))));

      let mainAudioHandlerState = state.handlers[PlayerAudioType.MAIN];
      let outputAudioHandlerState = state.handlers[PlayerAudioType.OUTPUT];

      if (outputAudioHandlerState && this._handlers[PlayerAudioType.OUTPUT]) {
        addObservable(describeMe(`${PlayerAudioType.OUTPUT} audio handler`, wrapObservable(this._handlers[PlayerAudioType.OUTPUT]!.restoreState(outputAudioHandlerState))));
      }

      if (mainAudioHandlerState && this._handlers[PlayerAudioType.MAIN]) {
        addObservable(describeMe(`${PlayerAudioType.MAIN} audio handler`, wrapObservable(this._handlers[PlayerAudioType.MAIN]!.restoreState(mainAudioHandlerState))));
      }

      state.tracks[PlayerAudioType.SIDECAR].forEach((sidecarAudioTrackState) => {
        let playerAudioTrack = this._playerTracks[PlayerAudioType.SIDECAR].find((p) => p.trackState.id === sidecarAudioTrackState.trackId);
        let sidecarAudioHandlerState = state.handlers[PlayerAudioType.SIDECAR].find((p) => p.id === sidecarAudioTrackState.handlerId);

        if (playerAudioTrack && sidecarAudioHandlerState) {
          let playerAudioHandler = playerAudioTrack.playerAudioHandler;
          addObservable(describeMe(`${PlayerAudioType.SIDECAR} audio handler, trackId=${sidecarAudioTrackState.trackId}`, playerAudioHandler.restoreState(sidecarAudioHandlerState)));
        } else {
          if (!playerAudioTrack) {
            throw new Error(`Player audio track with track id=${sidecarAudioTrackState.trackId} not found`);
          }

          if (!sidecarAudioHandlerState) {
            throw new Error(`Audio handler for track with track id=${sidecarAudioTrackState.trackId} not found`);
          }
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

  get onEvent$(): Observable<PlayerAudioEvent> {
    return this._onEvent$.asObservable();
  }

  private getOutputHandlerOrFail(): AudioHandlerApi {
    let handler = this.getHandler(PlayerAudioType.OUTPUT);
    if (!handler) {
      throw new Error(`Audio not set up`);
    }
    return handler;
  }

  get muted(): boolean {
    let handler = this.getHandler(PlayerAudioType.OUTPUT);
    return handler ? handler.muted : AUDIO_DEFAULTS.muted;
  }

  get volume(): number {
    let handler = this.getHandler(PlayerAudioType.OUTPUT);
    return handler ? handler.volume : AUDIO_DEFAULTS.volume;
  }

  mute(): Observable<void> {
    return this.getOutputHandlerOrFail().mute();
  }

  setMuted(muted: boolean): Observable<void> {
    return this.getOutputHandlerOrFail().setMuted(muted);
  }

  setVolume(volume: number): Observable<void> {
    return this.getOutputHandlerOrFail().setVolume(volume);
  }

  toggleMuted(): Observable<void> {
    return this.getOutputHandlerOrFail().toggleMuted();
  }

  unmute(): Observable<void> {
    return this.getOutputHandlerOrFail().unmute();
  }

  destroy(): void {
    this.teardown();
    this._eventBreaker.destroy();
    this._destroyBreaker.destroy();

    freeObserver(this._onEvent$);
    freeObserver(this._onEventQueue$);
  }
}
