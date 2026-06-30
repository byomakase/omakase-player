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
import {concat, filter, forkJoin, Observable, Subject, takeUntil} from 'rxjs';
import {type PlayerEvent, PlayerEventType} from './player-event';
import {MainMediaRepository, TrackRepository} from '../repository';
import {ObserverBreaker} from '../common/observer-breaker';
import {
  Audio,
  type AudioState,
  type AudioUpdateableAttrs,
  type MainMedia,
  type MainMediaErrorEventData,
  MainMediaEventType,
  type MainMediaState,
  MainMediaType,
  Relation,
  RelationType,
  type TextTrack,
  type TextTrackState,
  type TextTrackUpdateableAttrs,
  type Track,
  TrackEventType,
  TrackType,
} from '../media';
import {PlayerControllerFactory} from './player-controller-factory';
import {describedObservable, errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {SourceUtil} from '../source';
import {MediaTemporalFormat, type MediaTemporalFormatValueMap} from '../common';
import {Validators} from '../common/validators';
import {COMMON_PLAYER_CONFIG_DEFAULT, type PlayerLocalApi, type PlayerLocalConfig} from './player-api';
import {type PlayerSession, SessionStore} from '../session';
import {OpStageStatus} from '../common/op-stage';
import {type MainMediaEssentialArgsHookType, type PlayerController, PlayerControllerEventType} from './player-controller-api';
import {PlayerAudioInternal} from './player-audio';
import {PlayerAudioEventType, type PlayerAudioInternalApi} from './player-audio-api';
import type {PlayerPlaybackEngineMapping} from './player-playback-engine';
import {HlsPlayerPlaybackEngineImpl} from '../hls';
import {Mp4PlayerPlaybackEngineImpl} from '../mp4';
import {PlayerTextEventType, type PlayerTextInternalApi} from './player-text-api';
import {PlayerTextInternal} from './player-text';
import {PlayerTextHandlerType, type PlayerTextTrackLoadOptions} from './player-text-track';
import {PlayerInternalUtil} from './player-internal-util';
import type {PlayerPlayback} from './player';
import {PLAYER_PLAYBACK_DEFAULT} from '../constants';
import {ChromingEventType, type ChromingInternalApi} from '../chroming';
import {TrackUtils} from '../track/track-utils';
import {AudioFilePlayerPlaybackEngineImpl} from '../audio/audio-file-playback-engine';
import {AlertsManager} from '../session/alert';
import type {TrackLoadOptions} from '../track';
import type {PlayerAudioLoadOptions} from './player-audio-track';
import type {OmpProvider} from '../omp-provider';
import type {VideoKeyframe, VideoKeyframeOptions} from '../tools/keyframe-extractor';

export const PLAYER_LOCAL_CONFIG_DEFAULT: PlayerLocalConfig = {
  ...COMMON_PLAYER_CONFIG_DEFAULT,
};

export class PlayerLocal implements PlayerLocalApi, Destroyable {
  private readonly _onEvent$: Subject<PlayerEvent> = new Subject<PlayerEvent>();

  private _sessionStore: SessionStore;
  private _mainMediaRepository: MainMediaRepository;
  private _trackRepository: TrackRepository;
  private _trackUtils: TrackUtils;
  private _alertsManager: AlertsManager;

  private _config: PlayerLocalConfig;

  private _mainMedia: MainMedia | undefined;
  private _playerPlayback: PlayerPlayback;

  private _playerController: PlayerController | undefined;
  private _chromingInternal: ChromingInternalApi | undefined;

  private _playerAudioInternal: PlayerAudioInternal;
  private _playerTextInternal: PlayerTextInternal;

  private _loadMainMediaBreaker = new ObserverBreaker();
  private _wiredEventsBreaker = new ObserverBreaker();

  private _destroyBreaker = new ObserverBreaker();

  constructor(ompProvider: OmpProvider, config?: Partial<PlayerLocalConfig>) {
    this._sessionStore = ompProvider.sessionStore;
    this._mainMediaRepository = ompProvider.mainMediaRepository;
    this._trackRepository = ompProvider.trackRepository;
    this._trackUtils = ompProvider.trackUtils;
    this._alertsManager = ompProvider.alertsManager;

    this._config = {
      ...PLAYER_LOCAL_CONFIG_DEFAULT,
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

  setChromingInternal(chromingInternal: ChromingInternalApi) {
    this._chromingInternal = chromingInternal;
  }

  protected checkIsMediaLoaded(): void {
    if (!this.isMainMediaLoaded) {
      throw new Error(`Main media not loaded`);
    }
  }

  loadMainMedia(mainMediaId: MainMedia['id']): Observable<MainMedia> {
    return new Observable<MainMedia>((observer) => {
      this.unloadMainMedia()
        .pipe(takeUntil(this._loadMainMediaBreaker.observer))
        .subscribe(() => {
          let mainMedia = this._mainMediaRepository.getOrFail(mainMediaId);

          mainMedia.onEvent$.pipe(takeUntil(this._loadMainMediaBreaker.observer)).subscribe({
            next: (event) => {
              switch (event.type) {
                case MainMediaEventType.MAIN_MEDIA_LOADED:
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_MAIN_MEDIA_LOADED,
                    data: {
                      mainMediaState: event.data.mainMediaState,
                    },
                  });
                  nextCompleteObserver(observer, mainMedia);
                  break;
                case MainMediaEventType.MAIN_MEDIA_LOAD_ERROR:
                  this._onEvent$.next({
                    type: PlayerEventType.PLAYER_MAIN_MEDIA_LOAD_ERROR,
                    data: {
                      mainMediaState: event.data.mainMediaState,
                      error: (event.data as MainMediaErrorEventData).error,
                    },
                  });
                  errorCompleteObserver(observer, (event.data as MainMediaErrorEventData).error);
                  break;
              }
            },
          });

          let mainMediaEssentialArgsHook: MainMediaEssentialArgsHookType = (args) => {
            return new Observable<void>((observer) => {
              mainMedia.updateAttrs(args);
              nextCompleteObserver(observer);
            });
          };

          let tracksCreatedHook = (tracks: Track[]) => {
            return new Observable<void>((observer) => {
              tracks.forEach((track) => {
                track.addRelation(Relation.fromEntity(RelationType.PART_OF, mainMedia));
              });
              this._trackRepository.addAll(tracks);
              mainMedia.addTracks(tracks);
              nextCompleteObserver(observer);
            });
          };

          this._onEvent$.next({
            type: PlayerEventType.PLAYER_MAIN_MEDIA_LOADING,
            data: {
              mainMediaState: mainMedia.state,
            },
          });

          if (!this._chromingInternal) {
            throw new Error(`Chroming not set`);
          }
          let playerController = PlayerControllerFactory.create(mainMedia.mainMediaType, this._chromingInternal.domController, this._config.controllerConfig?.[mainMedia.mainMediaType]);
          this._playerController = playerController;

          mainMedia.loadStart();

          let mainMediaState = mainMedia.state;
          this._playerController
            .loadMainMedia({
              url: SourceUtil.resolveUrlFromSourceState(mainMediaState.source),
              loadOptions: mainMediaState.loadOptions,
              mainMediaEssentialArgsHook: mainMediaEssentialArgsHook,
              tracksCreatedHook: tracksCreatedHook,
            })
            .pipe(takeUntil(this._loadMainMediaBreaker.observer))
            .subscribe({
              next: (result) => {
                this._mainMedia = mainMedia;
                this._sessionStore.setPlayer(this.playerSession);

                concat(this.wireEvents()).subscribe({
                  complete: () => {
                    this._playerAudioInternal.setup(playerController, mainMedia.state);
                    this._playerTextInternal.setup(playerController, mainMedia.state, this._config.textMainTracksHandler);

                    this.loadMainTextTracksAsSidecars(mainMedia.state);

                    mainMedia.loadSuccess();
                  },
                });
              },
              error: (error) => {
                mainMedia.loadError(error);
              },
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
          this._trackUtils
            .preloadTrack(textTrack.id)
            .pipe(takeUntil(this._loadMainMediaBreaker.observer))
            .subscribe((track) => {
              this.loadSidecarTrack(track.id, {
                trackType: TrackType.TEXT_TRACK,
                handlerType: preloadTextTrackHandler,
              }).subscribe((event) => {});
            });
        });
      });
    }
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

      let mainMedia = this._mainMediaRepository.getOrFail(playerSession.mainMediaId);
      let mainMediaState = mainMedia.state;

      if (!mainMedia) {
        throw new Error(`MainMedia not found`);
      }

      if (mainMedia.loadStage.status !== OpStageStatus.SUCCESS) {
        throw new Error(`MainMedia not loaded`);
      }

      if (!this._chromingInternal) {
        throw new Error(`Chroming not set`);
      }
      let playerController = PlayerControllerFactory.create(mainMedia.state.mainMediaType, this._chromingInternal.domController, this._config.controllerConfig?.[mainMedia.mainMediaType]);

      let restoreMainMediaSession$ = describeMe(
        `Restore main media session`,
        playerController.restoreMainMediaSession({
          mainMedia: mainMediaState,
          mainMediaLoadedHook: () => {
            return new Observable((observer) => {
              this._playerController = playerController;

              this._mainMedia = mainMedia;

              this._sessionStore.setPlayer(this.playerSession);

              this._playerAudioInternal.setup(playerController, mainMediaState);
              this._playerTextInternal.setup(playerController, mainMediaState, this._config.textMainTracksHandler);

              this.wireEvents().subscribe(() => {
                nextCompleteObserver(observer);
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
              let sidecarTracks = this._trackRepository
                .find(
                  (p) =>
                    p.trackType === TrackType.AUDIO &&
                    p.loadStage.status === OpStageStatus.SUCCESS &&
                    !p.relations.find((relation) => relation.relationType === RelationType.PART_OF && relation.entityId === mainMediaState.id)
                )
                .map((p) => p as Audio);
              if (sidecarTracks) {
                this.loadSidecarAudios(sidecarTracks).subscribe(() => {
                  nextCompleteObserver(o1);
                });
              } else {
                nextCompleteObserver(o1);
              }
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
              let sidecarTracks = this._trackRepository
                .find(
                  (p) =>
                    p.trackType === TrackType.TEXT_TRACK &&
                    p.loadStage.status === OpStageStatus.SUCCESS &&
                    !p.relations.find((relation) => relation.relationType === RelationType.PART_OF && relation.entityId === mainMediaState.id)
                )
                .map((p) => p as TextTrack);
              if (sidecarTracks) {
                this.loadSidecarTextTracks(sidecarTracks).subscribe(() => {
                  nextCompleteObserver(o1);
                });
              } else {
                nextCompleteObserver(o1);
              }
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
          this._alertsManager.info(message);
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
              nextCompleteObserver(observer);
            },
            error: (err) => {
              errorCompleteObserver(observer, err);
            },
          });
        })
      ).subscribe();
    });
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

      this._playerController.wireEvents(this._mainMedia!.state);

      this._playerController!.onEvent$.pipe(takeUntil(this._wiredEventsBreaker.observer))
        .pipe(takeUntil(this._loadMainMediaBreaker.observer))
        .subscribe({
          next: (event) => {
            switch (event.type) {
              case PlayerControllerEventType.PLAYER_CONTROLLER_DURATION_UPDATE:
                let mainMedia = this._mainMediaRepository.getOrFail(this._mainMedia!.id);
                mainMedia.updateAttrs({
                  duration: event.data.duration,
                });
                this._playerController!.wireEvents(mainMedia.state);
                this._onEvent$.next({
                  type: PlayerEventType.PLAYER_MAIN_MEDIA_UPDATED,
                  data: {
                    mainMediaState: this._mainMedia!.state,
                  },
                });
                break;
              case PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE:
                this._playerPlayback = {
                  ...this._playerPlayback,
                  ...event.data.mediaElementPlaybackState,
                  currentTime: event.data.currentTime,
                };
                this._sessionStore.updatePlayer({
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
                this._sessionStore.updatePlayer({
                  playback: this._playerPlayback,
                });
                this._onEvent$.next({
                  type: PlayerEventType.PLAYER_PLAYBACK_RATE_UPDATE,
                  data: event.data,
                });
                break;
              case PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS:
                this._playerPlayback.currentTime = event.data.currentTime;
                this._sessionStore.updatePlayerCurrentTime(event.data.currentTime);
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
                this._sessionStore.updatePlayer({
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
                this._sessionStore.updatePlayer({
                  audio: this._playerAudioInternal.state,
                });
                this._onEvent$.next({
                  type: PlayerEventType.PLAYER_AUDIO_CHANGE,
                  data: event.data,
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
                this._sessionStore.updatePlayer({
                  text: this._playerTextInternal.state,
                });
                this._onEvent$.next({
                  type: PlayerEventType.PLAYER_TEXT_CHANGE,
                  data: event.data,
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

    if (this._mainMedia) {
      this._mainMedia = void 0;
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
      if (this._mainMedia) {
        let mainMediaId = this._mainMedia.id;

        this._onEvent$.next({
          type: PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING,
          data: {
            mainMediaId: mainMediaId,
          },
        });

        this.clearPlayerSession();
        this._sessionStore.setPlayer(void 0);
        this._mainMediaRepository.delete(mainMediaId);

        this.removeAllSidecarTracks().subscribe(() => {
          this._onEvent$.next({
            type: PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED,
            data: {
              mainMediaId: mainMediaId,
            },
          });
          nextCompleteObserver(observer);
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  get isMainMediaLoaded(): boolean {
    return !!this._mainMedia;
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

    let track = this._trackRepository.getOrFail(trackId);

    switch (track.trackType) {
      case TrackType.AUDIO:
        return this.loadSidecarAudio(track as Audio, loadOptions);
      case TrackType.TEXT_TRACK:
        return this.loadSidecarTextTrack(track as TextTrack, loadOptions);
      default:
        throw new Error('niy');
    }
  }

  loadSidecarAudio(audio: Audio, loadOptions?: TrackLoadOptions | undefined): Observable<void> {
    return new Observable<void>((observer) => {
      let trackUpdater: (attrs: AudioUpdateableAttrs) => Observable<AudioState> = (attrs: AudioUpdateableAttrs) => {
        return new Observable<AudioState>((observer) => {
          audio.updateAttrs(attrs);
          nextCompleteObserver(observer, audio.state);
        });
      };

      this._playerAudioInternal.loadSidecarTrack(audio.state, trackUpdater, loadOptions as PlayerAudioLoadOptions).subscribe({
        next: (audioState) => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  loadSidecarTextTrack(textTrack: TextTrack, loadOptions?: TrackLoadOptions | undefined): Observable<void> {
    return new Observable<void>((observer) => {
      let trackUpdater: (attrs: TextTrackUpdateableAttrs) => Observable<TextTrackState> = (attrs: TextTrackUpdateableAttrs) => {
        return new Observable<TextTrackState>((observer) => {
          textTrack.updateAttrs(attrs);
          nextCompleteObserver(observer, textTrack.state);
        });
      };

      this._playerTextInternal.loadSidecarTrack(textTrack.state, trackUpdater, loadOptions as PlayerTextTrackLoadOptions | undefined).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  removeSidecarTrack(trackId: Track['id']): Observable<void> {
    return passiveObservable((observer) => {
      this.checkIsMediaLoaded();
      let trackState = this._trackRepository.getOrFail(trackId).state;

      let removeSidecarTrack = () => {
        switch (trackState.trackType) {
          case TrackType.AUDIO:
            return this._playerAudioInternal.removeSidecarTrack(trackState.id);
          case TrackType.TEXT_TRACK:
            return this._playerTextInternal.removeSidecarTrack(trackState.id);
          default:
            throw new Error('niy');
        }
      };

      removeSidecarTrack().subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
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

  protected loadSidecarAudios(audios: Audio[]): Observable<void> {
    return new Observable((observer) => {
      if (audios.length > 0) {
        let loaders$ = audios.map((p) => this.loadSidecarAudio(p));
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

  protected loadSidecarTextTracks(tracks: TextTrack[]): Observable<void> {
    return new Observable((observer) => {
      if (tracks.length > 0) {
        let loaders$ = tracks.map((p) => this.loadSidecarTextTrack(p));
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

  getPlaybackEngine(mainMediaType: MainMediaType.HLS): PlayerPlaybackEngineMapping[MainMediaType.HLS];
  getPlaybackEngine(mainMediaType: MainMediaType.MP4): PlayerPlaybackEngineMapping[MainMediaType.MP4];
  getPlaybackEngine(mainMediaType: MainMediaType.AUDIO_FILE): PlayerPlaybackEngineMapping[MainMediaType.AUDIO_FILE];
  getPlaybackEngine(mainMediaType: MainMediaType): PlayerPlaybackEngineMapping[MainMediaType] {
    this.checkIsMediaLoaded();
    switch (mainMediaType) {
      case MainMediaType.HLS:
        return new HlsPlayerPlaybackEngineImpl(this._playerController!);
      case MainMediaType.MP4:
        return new Mp4PlayerPlaybackEngineImpl(this._playerController!);
      case MainMediaType.AUDIO_FILE:
        return new AudioFilePlayerPlaybackEngineImpl(this._playerController!);
      default:
        throw new Error(`Engine for ${mainMediaType} not found`);
    }
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

  get audioInternal(): PlayerAudioInternalApi {
    return this._playerAudioInternal;
  }

  get textInternal(): PlayerTextInternalApi {
    return this._playerTextInternal;
  }

  get playerSession(): PlayerSession {
    return {
      mainMediaId: this._mainMedia?.id,
      playback: this._playerPlayback,
      audio: this._playerAudioInternal.state,
      text: this._playerTextInternal.state,
    };
  }

  get htmlMediaElement(): HTMLMediaElement | undefined {
    return this._playerController?.videoElement;
  }

  get onEvent$(): Observable<PlayerEvent> {
    return this._onEvent$.asObservable();
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
}
