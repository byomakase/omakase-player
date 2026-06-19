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

import {concat, filter, forkJoin, Observable, Subject, switchMap, takeUntil} from 'rxjs';
import {
  type AudioState,
  type AudioUpdateableAttrs,
  type MainMedia,
  type MainMediaErrorEventData,
  MainMediaEventType,
  type MainMediaState,
  Relation,
  RelationType,
  type TextTrackState,
  type TextTrackUpdateableAttrs,
  type Track,
  TrackEventType,
  TrackType,
} from '../media';
import {OpStageStatus} from '../common/op-stage';
import {describedObservable, errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {ObserverBreaker} from '../common/observer-breaker';
import {PlayerControllerFactory} from './player-controller-factory';
import {type PlayerEvent, PlayerEventType} from './player-event';
import {type PlayerSession} from '../session';
import {MediaTemporalFormat, type MediaTemporalFormatValueMap} from '../common';
import {Validators} from '../common/validators';
import {COMMON_PLAYER_CONFIG_DEFAULT, type PlayerDetachedApi, type PlayerDetachedConfig} from './player-api';
import type {Destroyable} from '../common/capabilities';
import {type MainMediaEssentialArgsHookType, type PlayerController, PlayerControllerEventType} from './player-controller-api';
import {PlayerAudioEventType, type PlayerAudioInternalApi} from './player-audio-api';
import {PlayerAudioInternal} from './player-audio';
import {MainMediaRepositoryProxy} from '../remoting/impl/main-media-repository-proxy';
import {TrackRepositoryProxy} from '../remoting/impl/track-repository-proxy';
import {SessionStoreProxy} from '../remoting/impl/session-store-proxy';
import {ChromingEventType, type ChromingInternalApi} from '../chroming';
import {SourceUtil} from '../source';
import {PlayerTextInternal} from './player-text';
import {PlayerTextEventType, type PlayerTextInternalApi} from './player-text-api';
import {PlayerInternalUtil} from './player-internal-util';
import type {PlayerAudioLoadOptions} from './player-audio-track';
import type {PlayerPlayback} from './player';
import {PLAYER_PLAYBACK_DEFAULT} from '../constants';
import {PlayerTextHandlerType, type PlayerTextTrackLoadOptions} from './player-text-track';
import type {RemoteNode} from '../remoting/remote-node';
import type {TrackUtilsProxy} from '../remoting/impl/track-utils-proxy';
import type {AlertsManagerProxy} from '../remoting/impl/alerts-manager-proxy';
import type {TrackLoadOptions} from '../track';
import type {VideoKeyframe, VideoKeyframeOptions} from '../tools/keyframe-extractor';

export const DETACHED_PLAYER_CONFIG_DEFAULT: PlayerDetachedConfig = {
  ...COMMON_PLAYER_CONFIG_DEFAULT,
};

export class PlayerDetached implements PlayerDetachedApi, Destroyable {
  private readonly _onEvent$: Subject<PlayerEvent> = new Subject<PlayerEvent>();

  private _remoteNode?: RemoteNode;
  private _sessionStore?: SessionStoreProxy;
  private _mainMediaRepository?: MainMediaRepositoryProxy;
  private _trackRepository?: TrackRepositoryProxy;
  private _trackUtils?: TrackUtilsProxy;
  private _alertsManager?: AlertsManagerProxy;

  private _config: PlayerDetachedConfig;

  private _mainMediaState: MainMediaState | undefined;
  private _playerPlayback: PlayerPlayback;

  private _playerAudioInternal: PlayerAudioInternal;
  private _playerTextInternal: PlayerTextInternal;

  private _playerController: PlayerController | undefined;
  private _chromingInternal: ChromingInternalApi | undefined;

  private _loadMainMediaBreaker = new ObserverBreaker();
  private _wiredEventsBreaker = new ObserverBreaker();

  private _destroyBreaker = new ObserverBreaker();

  constructor(config?: Partial<PlayerDetachedConfig>) {
    this._config = {
      ...DETACHED_PLAYER_CONFIG_DEFAULT,
      ...config,
    };

    this._playerPlayback = {
      ...PLAYER_PLAYBACK_DEFAULT,
    };

    this._playerAudioInternal = new PlayerAudioInternal({
      audioMode: this._config.audioMode,
    });
    this._playerTextInternal = new PlayerTextInternal({
      textMode: this._config.textMode,
    });
  }

  setChromingInternal(chromingInternal: ChromingInternalApi): void {
    this._chromingInternal = chromingInternal;
  }

  setRemoteProxies(remoteNode: RemoteNode) {
    this._remoteNode = remoteNode;
    this._mainMediaRepository = remoteNode.getProxyByName('MainMediaRepository');
    this._trackRepository = remoteNode.getProxyByName('TrackRepository');
    this._sessionStore = remoteNode.getProxyByName('SessionStore');
    this._trackUtils = remoteNode.getProxyByName('TrackUtils');
    this._alertsManager = remoteNode.getProxyByName('AlertsManager');

    this._trackRepository.onTrackEvent$
      .pipe(filter((p) => p.type === TrackEventType.TRACK_UPDATED))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        switch (event.data.trackState.trackType) {
          case TrackType.AUDIO:
            this._playerAudioInternal.updateTrack(event.data.trackState as AudioState);
            break;
          case TrackType.TEXT_TRACK:
            this._playerTextInternal.updateTrack(event.data.trackState as TextTrackState);
            break;
          default:
          // nop
        }
      });
  }

  get onEvent$(): Observable<PlayerEvent> {
    return this._onEvent$.asObservable();
  }

  restorePlayerSession(playerSession: PlayerSession): Observable<void> {
    let oCount = 0;
    let initialSpace = 1;
    let describeMe = (title: string, source$: Observable<void>, space = 0) => {
      return describedObservable(`${++oCount} | ${title}`, source$, initialSpace + space);
    };

    this._loadMainMediaBreaker.break();
    this._wiredEventsBreaker.break();

    if (this._playerController) {
      this._playerController.destroy();
      this._playerController = void 0;
    }

    this._playerAudioInternal.teardown();
    this._playerTextInternal.teardown();

    return new Observable<void>((observer) => {
      if (!playerSession.mainMediaId) {
        throw new Error(`mainMediaId must be set`);
      }

      this._mainMediaRepository!.getOrFail(playerSession.mainMediaId).subscribe({
        next: (mainMediaState) => {
          if (!mainMediaState) {
            throw new Error(`MainMedia not found`);
          }

          if (mainMediaState.loadStage.status !== OpStageStatus.SUCCESS) {
            throw new Error(`MainMedia not loaded`);
          }

          if (!this._chromingInternal) {
            throw new Error(`Chroming not set`);
          }
          let playerController = PlayerControllerFactory.create(mainMediaState.mainMediaType, this._chromingInternal.domController, this._config.controllerConfig?.[mainMediaState.mainMediaType]);

          let restoreMainMediaSession$ = describeMe(
            `Restore main media session`,
            playerController.restoreMainMediaSession({
              mainMedia: mainMediaState,
              mainMediaLoadedHook: () => {
                return new Observable((o) => {
                  this._playerController = playerController;

                  this._mainMediaState = mainMediaState;

                  this._sessionStore!.setPlayer(this.playerSession).subscribe(() => {
                    this._playerAudioInternal.setup(playerController, mainMediaState);
                    this._playerTextInternal.setup(playerController, mainMediaState, this._config.textMainTracksHandler);

                    this.wireEvents().subscribe(() => {
                      nextCompleteObserver(o);
                    });
                  });
                });
              },
            })
          );

          let sidecarAudios$ = describeMe(
            `Sidecar audios`,
            new Observable((o) => {
              let load$ = describeMe(
                `Load sidecar audio`,
                new Observable((o1) => {
                  this._trackRepository!.find().subscribe((tracks) => {
                    // find tracks that are not part of main media
                    let sidecarTracks = tracks
                      .filter(
                        (p) =>
                          p.trackType === TrackType.AUDIO &&
                          p.loadStage.status === OpStageStatus.SUCCESS &&
                          !p.relations.find((relation) => relation.relationType === RelationType.PART_OF && relation.entityId === mainMediaState.id)
                      )
                      .map((p) => p as AudioState);

                    if (sidecarTracks) {
                      this.loadSidecarAudios(sidecarTracks).subscribe(() => {
                        nextCompleteObserver(o1);
                      });
                    } else {
                      nextCompleteObserver(o1);
                    }
                  });
                }),
                1
              );

              let restore$ = describeMe(
                `Restore audio state`,
                new Observable((o2) => {
                  if (playerSession.audio) {
                    this._playerAudioInternal.restoreState(playerSession.audio).subscribe(() => {
                      nextCompleteObserver(o2);
                    });
                  } else {
                    nextCompleteObserver(o2);
                  }
                }),
                1
              );

              concat(load$, restore$).subscribe({
                complete: () => {
                  nextCompleteObserver(o);
                },
              });
            })
          );

          let sidecarTextTracks$ = describeMe(
            `Sidecar text`,
            new Observable((o) => {
              let load$ = describeMe(
                `Load sidecar text`,
                new Observable((o1) => {
                  this._trackRepository!.find().subscribe((tracks) => {
                    // find tracks that are not part of main media
                    let sidecarTracks = tracks
                      .filter(
                        (p) =>
                          p.trackType === TrackType.TEXT_TRACK &&
                          p.loadStage.status === OpStageStatus.SUCCESS &&
                          !p.relations.find((relation) => relation.relationType === RelationType.PART_OF && relation.entityId === mainMediaState.id)
                      )
                      .map((p) => p as TextTrackState);

                    if (sidecarTracks) {
                      this.loadSidecarTextTracks(sidecarTracks).subscribe(() => {
                        nextCompleteObserver(o1);
                      });
                    } else {
                      nextCompleteObserver(o1);
                    }
                  });
                }),
                1
              );

              let restore$ = describeMe(
                `Restore text state`,
                new Observable((o2) => {
                  if (playerSession.text) {
                    this._playerTextInternal.restoreState(playerSession.text).subscribe(() => {
                      nextCompleteObserver(o2);
                    });
                  } else {
                    nextCompleteObserver(o2);
                  }
                }),
                1
              );

              concat(load$, restore$).subscribe({
                complete: () => {
                  nextCompleteObserver(o);
                },
              });
            })
          );

          let playback$ = describeMe(
            `Playback`,
            PlayerInternalUtil.restorePlayback(this, playerSession, (message) => {
              this._alertsManager?.info(message);
            })
          );

          describedObservable(
            `Restore player session`,
            new Observable((o) => {
              concat(restoreMainMediaSession$, sidecarAudios$, sidecarTextTracks$, playback$).subscribe({
                complete: () => {
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_SESSION_RESTORED,
                    data: {
                      playerSession: this.playerSession,
                    },
                  });
                  nextCompleteObserver(o);
                },
                error: (err) => {
                  errorCompleteObserver(o, err);
                },
              });
            })
          ).subscribe({
            complete: () => {
              nextCompleteObserver(observer);
            },
            error: (err) => {
              errorCompleteObserver(observer, err);
            },
          });
        },
      });
    });
  }

  loadMainMedia(mainMediaId: MainMedia['id']): Observable<MainMediaState> {
    return new Observable<MainMediaState>((loadMainMediaObserver) => {
      this.unloadMainMedia()
        .pipe(takeUntil(this._loadMainMediaBreaker.observer))
        .subscribe(() => {
          this._mainMediaRepository!.getOrFail(mainMediaId).subscribe((mainMediaState) => {
            this._mainMediaRepository!.onMainMediaEvent$.pipe(takeUntil(this._loadMainMediaBreaker.observer)).subscribe({
              next: (event) => {
                switch (event.type) {
                  case MainMediaEventType.MAIN_MEDIA_LOADED:
                    this._onEvent$.next({
                      type: PlayerEventType.PLAYER_MAIN_MEDIA_LOADED,
                      data: {
                        mainMediaState: event.data.mainMediaState,
                      },
                    });
                    let mainMediaProxy = this._remoteNode!.getOrCreateProxy('MainMedia', mainMediaState.id);
                    mainMediaProxy.state().subscribe((mainMediaState) => {
                      nextCompleteObserver(loadMainMediaObserver, mainMediaState); // return updated state
                    });
                    break;
                  case MainMediaEventType.MAIN_MEDIA_LOAD_ERROR:
                    this._onEvent$.next({
                      type: PlayerEventType.PLAYER_MAIN_MEDIA_LOAD_ERROR,
                      data: {
                        mainMediaState: event.data.mainMediaState,
                        error: (event.data as MainMediaErrorEventData).error,
                      },
                    });
                    errorCompleteObserver(loadMainMediaObserver, (event.data as MainMediaErrorEventData).error);
                    break;
                }
              },
            });

            let mainMediaProxy = this._remoteNode!.getOrCreateProxy('MainMedia', mainMediaState.id);

            let mainMediaEssentialArgsHook: MainMediaEssentialArgsHookType = (args) => {
              return new Observable<void>((observer) => {
                mainMediaProxy.updateAttributes(args).subscribe({
                  next: () => {
                    nextCompleteObserver(observer);
                  },
                });
              });
            };

            let tracksCreatedHook = (tracks: Track[]) => {
              return new Observable<void>((observer) => {
                tracks.forEach((track) => {
                  track.addRelation(Relation.of(RelationType.PART_OF, mainMediaState.id, mainMediaState.mediaType));
                });
                // tracks are added to repository in message channel binding
                mainMediaProxy.addTracks(tracks.map((p) => p.state)).subscribe({
                  next: () => {
                    nextCompleteObserver(observer);
                  },
                });
              });
            };

            this._onEvent$.next({
              type: PlayerEventType.PLAYER_MAIN_MEDIA_LOADING,
              data: {
                mainMediaState: mainMediaState,
              },
            });

            mainMediaProxy
              .loadStart()
              .pipe(takeUntil(this._loadMainMediaBreaker.observer))
              .subscribe({
                next: () => {
                  if (!this._chromingInternal) {
                    throw new Error(`Chroming not set`);
                  }
                  let playerController = PlayerControllerFactory.create(
                    mainMediaState.mainMediaType,
                    this._chromingInternal.domController,
                    this._config.controllerConfig?.[mainMediaState.mainMediaType]
                  );

                  playerController
                    .loadMainMedia({
                      url: SourceUtil.resolveUrlFromSourceState(mainMediaState.source),
                      loadOptions: mainMediaState.loadOptions,
                      mainMediaEssentialArgsHook,
                      tracksCreatedHook,
                    })
                    .pipe(takeUntil(this._loadMainMediaBreaker.observer))
                    .subscribe({
                      next: (result) => {
                        this._playerController = playerController;

                        this._mainMediaRepository!.getOrFail(mainMediaState.id).subscribe((mainMediaState) => {
                          this._mainMediaState = mainMediaState;

                          this._sessionStore!.setPlayer(this.playerSession).subscribe(() => {
                            concat(this.wireEvents()).subscribe({
                              complete: () => {
                                this._playerAudioInternal.setup(playerController, mainMediaState);
                                this._playerTextInternal.setup(playerController, mainMediaState, this._config.textMainTracksHandler);

                                this.loadMainTextTracksAsSidecars(mainMediaState);

                                mainMediaProxy.loadSuccess();
                              },
                            });
                          });
                        });
                      },
                      error: (error) => {
                        mainMediaProxy.loadError(error);
                      },
                    });
                },
                error: (error) => {
                  mainMediaProxy.loadError(error);
                },
              });
          });
        });
    });
  }

  protected loadMainTextTracksAsSidecars(mainMediaState: MainMediaState) {
    let preloadTextTrackHandlers = this._config.textMainTracksHandler.filter((p) => p !== PlayerTextHandlerType.EMBEDDED);
    if (preloadTextTrackHandlers.length > 0) {
      // start text tracks preloading
      let textTracks = mainMediaState.tracks.filter((p) => p.trackType === TrackType.TEXT_TRACK);
      preloadTextTrackHandlers.forEach((preloadTextTrackHandler) => {
        textTracks.forEach((textTrack) => {
          this._trackUtils!.preloadTrack(textTrack.id).subscribe((track) => {
            this.loadSidecarTrack(track.id, {
              trackType: TrackType.TEXT_TRACK,
              handlerType: preloadTextTrackHandler,
            }).subscribe((event) => {});
          });
        });
      });
    }
  }

  protected wireEvents(): Observable<void> {
    return new Observable<void>((observer) => {
      this._wiredEventsBreaker.break();
      forkJoin([this.wirePlayerEvents(), this.wirePlayerAudioEvents(), this.wirePlayerTextEvents(), this.wireChromingEvents()]).subscribe(() => {
        nextCompleteObserver(observer);
      });
    });
  }

  protected wirePlayerEvents(): Observable<void> {
    return new Observable<void>((observer) => {
      if (!this._playerController) {
        throw new Error('Media controller not set');
      }

      this.checkIsMediaLoaded();

      this._mainMediaRepository!.getOrFail(this._mainMediaState!.id).subscribe((mainMediaState) => {
        this._playerController!.wireEvents(mainMediaState);

        let mainMediaProxy = this._remoteNode!.getOrCreateProxy('MainMedia', mainMediaState.id);

        this._playerController!.onEvent$.pipe(takeUntil(this._wiredEventsBreaker.observer))
          .pipe(takeUntil(this._loadMainMediaBreaker.observer))
          .subscribe({
            next: (event) => {
              switch (event.type) {
                case PlayerControllerEventType.PLAYER_CONTROLLER_DURATION_UPDATE:
                  mainMediaProxy
                    .updateAttributes({
                      duration: event.data.duration,
                    })
                    .subscribe(() => {
                      this._mainMediaRepository!.getOrFail(this._mainMediaState!.id).subscribe((mainMediaState) => {
                        this._playerController!.wireEvents(mainMediaState);
                        this._onEvent$.next({
                          type: PlayerEventType.PLAYER_MAIN_MEDIA_UPDATED,
                          data: {
                            mainMediaState: this._mainMediaState!,
                          },
                        });
                      });
                    });
                  break;

                case PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE:
                  this._playerPlayback = {
                    ...this._playerPlayback,
                    ...event.data.mediaElementPlaybackState,
                    currentTime: event.data.currentTime,
                  };
                  this._sessionStore!.updatePlayer({
                    playback: this._playerPlayback,
                  });
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_PLAYBACK_CHANGE,
                    data: {
                      playerPlayback: this._playerPlayback,
                    },
                  });
                  break;
                case PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE:
                  this._playerPlayback = {
                    ...this._playerPlayback,
                    playbackRate: event.data.playbackRate,
                  };
                  this._sessionStore!.updatePlayer({
                    playback: this._playerPlayback,
                  });
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_PLAYBACK_RATE_UPDATE,
                    data: event.data,
                  });
                  break;
                case PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS:
                  this._playerPlayback.currentTime = event.data.currentTime;
                  this._sessionStore!.updatePlayerCurrentTime(event.data.currentTime);
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_PLAYBACK_PROGRESS,
                    data: event.data,
                  });
                  break;

                case PlayerControllerEventType.PLAYER_CONTROLLER_PLAY:
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_PLAY,
                    data: event.data,
                  });
                  break;

                case PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE:
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_PAUSE,
                    data: event.data,
                  });
                  break;

                case PlayerControllerEventType.PLAYER_CONTROLLER_ENDED:
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_ENDED,
                    data: event.data,
                  });
                  break;

                case PlayerControllerEventType.PLAYER_CONTROLLER_BUFFERING:
                  this._playerPlayback = {
                    ...this._playerPlayback,
                    bufferedTimeRanges: event.data.bufferedTimeRanges,
                  };
                  this._sessionStore!.updatePlayer({
                    playback: this._playerPlayback,
                  });
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_BUFFERING,
                    data: event.data,
                  });
                  break;

                case PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING:
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_SEEKING,
                    data: event.data,
                  });
                  break;

                case PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED:
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_SEEKED,
                    data: event.data,
                  });
                  break;
              }
            },
          });

        nextCompleteObserver(observer);
      });
    });
  }

  protected wirePlayerAudioEvents(): Observable<void> {
    return new Observable<void>((observer) => {
      this._playerAudioInternal.onEvent$
        .pipe(takeUntil(this._wiredEventsBreaker.observer))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (event) => {
            switch (event.type) {
              case PlayerAudioEventType.PLAYER_AUDIO_CHANGE:
                this._sessionStore!.updatePlayer({
                  audio: this._playerAudioInternal.state,
                }).subscribe(() => {
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_AUDIO_CHANGE,
                    data: event.data,
                  });
                });
                break;
              case PlayerAudioEventType.PLAYER_AUDIO_TRACKS_REQUESTING_BUFFERING_CHANGE:
                this._playerController?.setWaitingForSyncedMedia(event.data.playerAudioTracks.length > 0);
                break;
            }
          },
        });

      nextCompleteObserver(observer);
    });
  }

  protected wirePlayerTextEvents(): Observable<void> {
    return new Observable<void>((observer) => {
      this._playerTextInternal.onEvent$
        .pipe(takeUntil(this._wiredEventsBreaker.observer))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (event) => {
            switch (event.type) {
              case PlayerTextEventType.PLAYER_TEXT_CHANGE:
                this._sessionStore!.updatePlayer({
                  text: this._playerTextInternal.state,
                }).subscribe(() => {
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_TEXT_CHANGE,
                    data: event.data,
                  });
                });
                break;
            }
          },
        });
      nextCompleteObserver(observer);
    });
  }

  protected wireChromingEvents(): Observable<void> {
    if (!this._chromingInternal) {
      throw new Error(`Chroming not set`);
    }
    return new Observable<void>((observer) => {
      this._chromingInternal!.onEvent$.pipe(takeUntil(this._wiredEventsBreaker.observer)).subscribe((event) => {
        switch (event.type) {
          case ChromingEventType.CHROMING_CHANGE:
            this._onEvent$.next({
              type: PlayerEventType.PLAYER_CHROMING_CHANGE,
              data: event.data,
            });
            break;
        }
      });
      nextCompleteObserver(observer);
    });
  }

  clearPlayerSession(): void {
    this._playerPlayback = {
      ...PLAYER_PLAYBACK_DEFAULT,
    };

    if (this._mainMediaState) {
      this._mainMediaState = void 0;
    } else {
      console.debug(`Main media not loaded, teardown continuing..`);
    }

    this._loadMainMediaBreaker.break();
    this._wiredEventsBreaker.break();
    this._playerAudioInternal.teardown();
    this._playerTextInternal.teardown();

    this._playerController?.destroy();
    this._playerController = void 0;
  }

  unloadMainMedia(): Observable<void> {
    return new Observable((observer) => {
      if (this._mainMediaState) {
        let mainMediaId = this._mainMediaState.id;

        this._onEvent$.next({
          type: PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING,
          data: {
            mainMediaId: mainMediaId,
          },
        });

        this.clearPlayerSession();

        concat(this._sessionStore!.setPlayer(void 0), this._mainMediaRepository!.delete(mainMediaId), this.removeAllSidecarTracks()).subscribe({
          complete: () => {
            this._onEvent$.next({
              type: PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED,
              data: {
                mainMediaId: mainMediaId,
              },
            });
            nextCompleteObserver(observer);
          },
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  protected checkIsMediaLoaded(): void {
    if (!this.isMainMediaLoaded) {
      throw new Error(`Main media not loaded`);
    }
  }

  get isMainMediaLoaded(): boolean {
    return !!this._mainMediaState;
  }

  play(): Observable<void> {
    this.checkIsMediaLoaded();
    return passiveObservable((observer) => {
      this._playerController!.play().subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  pause(): Observable<void> {
    this.checkIsMediaLoaded();
    return passiveObservable((observer) => {
      this._playerController!.pause().subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    format = Validators.mediaTemporalFormat()(format);
    this.checkIsMediaLoaded();
    return passiveObservable<boolean>((observer) => {
      this._playerController!.seekTo(value, format).subscribe({
        next: (result) => {
          nextCompleteObserver(observer, result);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    format = Validators.mediaTemporalFormat()(format);
    this.checkIsMediaLoaded();
    return passiveObservable<boolean>((observer) => {
      this._playerController!.seekFromCurrentTime(value, format).subscribe({
        next: (result) => {
          nextCompleteObserver(observer, result);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  convertTime<S extends MediaTemporalFormat, D extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[S], valueFormat: S, destinationFormat: D): MediaTemporalFormatValueMap[D];
  convertTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], valueFormat: MediaTemporalFormat, destinationFormat: MediaTemporalFormat): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    return this._playerController!.convertTime(value, valueFormat, destinationFormat);
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return passiveObservable((observer) => {
      this._playerController!.setPlaybackRate(playbackRate).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  getCurrentTime(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getCurrentTime<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getCurrentTime(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    format = Validators.mediaTemporalFormat()(format);
    this.checkIsMediaLoaded();
    return this._playerController!.getCurrentTime(format);
  }

  getDuration(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getDuration<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getDuration(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    format = Validators.mediaTemporalFormat()(format);
    this.checkIsMediaLoaded();
    return this._playerController!.getDuration(format);
  }

  loadSidecarTrack(trackId: Track['id'], loadOptions?: TrackLoadOptions | undefined): Observable<void> {
    this.checkIsMediaLoaded();
    return this._trackRepository!.getOrFail(trackId).pipe(
      switchMap((track) => {
        switch (track.trackType) {
          case TrackType.AUDIO:
            return this.loadSidecarAudio(track as AudioState, loadOptions as PlayerAudioLoadOptions | undefined);
          case TrackType.TEXT_TRACK:
            return this.loadSidecarTextTrack(track as TextTrackState, loadOptions as PlayerTextTrackLoadOptions | undefined);
          default:
            throw new Error('niy');
        }
      })
    );
  }

  protected loadSidecarAudio(trackState: AudioState, loadOptions?: PlayerAudioLoadOptions | undefined): Observable<void> {
    return new Observable<void>((observer) => {
      let trackUpdater: (attrs: AudioUpdateableAttrs) => Observable<AudioState> = (attrs: AudioUpdateableAttrs) => {
        return new Observable<AudioState>((observer) => {
          this._remoteNode!.getOrCreateProxy('Track', trackState.id)
            .updateAttrs(attrs)
            .subscribe((trackState) => {
              nextCompleteObserver(observer, trackState as AudioState);
            });
        });
      };
      this._playerAudioInternal.loadSidecarTrack(trackState, trackUpdater, loadOptions).subscribe({
        next: (trackState) => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  protected loadSidecarAudios(trackStates: AudioState[]): Observable<void> {
    return new Observable((observer) => {
      if (trackStates.length > 0) {
        let loaders$ = trackStates.map((p) => this.loadSidecarAudio(p));
        concat(...loaders$).subscribe({
          complete: () => {
            nextCompleteObserver(observer);
          },
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  protected loadSidecarTextTrack(trackState: TextTrackState, loadOptions?: PlayerTextTrackLoadOptions | undefined): Observable<void> {
    return new Observable<void>((observer) => {
      let trackUpdater: (attrs: TextTrackUpdateableAttrs) => Observable<TextTrackState> = (attrs: TextTrackUpdateableAttrs) => {
        return new Observable<TextTrackState>((observer) => {
          this._remoteNode!.getOrCreateProxy('Track', trackState.id)
            .updateAttrs(attrs)
            .subscribe((trackState) => {
              nextCompleteObserver(observer, trackState as TextTrackState);
            });
        });
      };
      this._playerTextInternal.loadSidecarTrack(trackState, trackUpdater, loadOptions).subscribe({
        next: (trackState) => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  protected loadSidecarTextTracks(trackStates: TextTrackState[]): Observable<void> {
    return new Observable((observer) => {
      if (trackStates.length > 0) {
        let loaders$ = trackStates.map((p) => this.loadSidecarTextTrack(p));
        concat(...loaders$).subscribe({
          complete: () => {
            nextCompleteObserver(observer);
          },
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  removeSidecarTrack(trackId: Track['id']): Observable<void> {
    this.checkIsMediaLoaded();
    return this._trackRepository!.getOrFail(trackId).pipe(
      switchMap((track) => {
        switch (track.trackType) {
          case TrackType.AUDIO:
            return this._playerAudioInternal.removeSidecarTrack(track.id);
          case TrackType.TEXT_TRACK:
            return this._playerTextInternal.removeSidecarTrack(track.id);
          default:
            throw new Error('niy');
        }
      })
    );
  }

  removeAllSidecarTracks(): Observable<void> {
    return passiveObservable((observer) => {
      forkJoin([this._playerAudioInternal.removeAllSidecarTracks(), this._playerTextInternal.removeAllSidecarTracks()]).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  toggleFullScreen(): Observable<void> {
    if (!this._chromingInternal) {
      throw new Error(`Chroming not set`);
    }
    return this._chromingInternal.toggleFullScreen();
  }

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe> {
    return passiveObservable<VideoKeyframe>((observer) => {
      this._playerController!.extractVideoKeyframe(options).subscribe({
        next: (result) => {
          nextCompleteObserver(observer, result);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  destroy() {
    this.clearPlayerSession();

    this._loadMainMediaBreaker.destroy();
    this._wiredEventsBreaker.destroy();
    this._destroyBreaker.destroy();

    this._playerController?.destroy();
    this._playerController = void 0;

    this._playerAudioInternal.destroy();
    this._playerTextInternal.destroy();

    freeObserver(this._onEvent$);
  }

  get audioInternal(): PlayerAudioInternalApi {
    return this._playerAudioInternal;
  }

  get textInternal(): PlayerTextInternalApi {
    return this._playerTextInternal;
  }

  get playerSession(): PlayerSession {
    return {
      mainMediaId: this._mainMediaState?.id,
      playback: this._playerPlayback,
      audio: this._playerAudioInternal.state,
      text: this._playerTextInternal.state,
    };
  }
}
