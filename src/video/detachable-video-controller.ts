/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {VideoControllerApi} from './video-controller-api';
import {BehaviorSubject, catchError, concat, filter, forkJoin, map, Observable, of, Subject, take, takeUntil, tap, timeout, timer} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {destroyer} from '../util/destroy-util';
import {TypedOmpBroadcastChannel} from '../common/omp-broadcast-channel';
import {RemoteVideoController} from './remote-video-controller';
import {ompHandshakeBroadcastChannelId} from '../constants';
import {SwitchableVideoController} from './switchable-video-controller';
import {WindowUtil} from '../util/window-util';
import {HandshakeChannelActionsMap, MessageChannelActionsMap} from './channel-types';
import {OmpSidecarAudioInputSoloMuteState, OmpSidecarAudioState, Video, VideoLoadOptions, VideoLoadOptionsInternal, VideoSafeZone, VideoWindowPlaybackState} from './model';
import {HelpMenuGroup, MainAudioChangeEvent, MainAudioInputSoloMuteEvent, OmpAudioTrack, OmpError, OmpNamedEventEventName, SubtitlesVttTrack} from '../types';
import {CryptoUtil} from '../util/crypto-util';
import {StringUtil} from '../util/string-util';

interface VideoControllerState {
  video: Video;
  videoLoadOptions: VideoLoadOptions | undefined;
  isPlaying: boolean;
  currentTime: number;
  subtitlesTracks: SubtitlesVttTrack[];
  activeSubtitlesTrack: SubtitlesVttTrack | undefined;
  activeAudioTrack: OmpAudioTrack | undefined;
  videoSafeZones: VideoSafeZone[];
  helpMenuGroups: HelpMenuGroup[];
  volume: number;
  muted: boolean;
  playbackRate: number;

  thumbnailVttUrl: string | undefined;
  activeNamedEventStreams: OmpNamedEventEventName[];

  mainAudioChangeEvent: MainAudioChangeEvent | undefined;
  mainAudioInputSoloMuteEvent: MainAudioInputSoloMuteEvent | undefined;
  sidecarAudioStates: OmpSidecarAudioState[];
  sidecarAudioInputSoloMuteStates: OmpSidecarAudioInputSoloMuteState[];

  audioOutputVolume: number;
  audioOutputMuted: boolean;
}

export interface DetachableVideoControllerConfig {
  /**
   * If not set detaching will not be enabled
   */
  detachedPlayerUrlFn?: (video: Video, videoLoadOptions?: VideoLoadOptions) => string;
  detachedPlayerWindowTarget: '_self' | '_blank' | '_parent' | '_top' | '_unfencedTop';
  detachedPlayerWindowFeatures: string;
  heartbeatCheckInterval: number;
  heartbeatFailureTimeDiffThreshold: number;
  heartbeatFailuresNumberThreshold: number;
  thumbnailVttUrl?: string;
}

export const VIDEO_DETACHABLE_CONTROLLER_CONFIG_DEFAULT: DetachableVideoControllerConfig = {
  detachedPlayerWindowTarget: '_blank',
  detachedPlayerWindowFeatures: 'toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=1280,height=720,left=300,top=300',
  heartbeatCheckInterval: 1000,
  heartbeatFailureTimeDiffThreshold: 2001,
  heartbeatFailuresNumberThreshold: 10,
};

export class DetachableVideoController extends SwitchableVideoController {
  protected _config: DetachableVideoControllerConfig;

  protected _handshakeChannel: TypedOmpBroadcastChannel<HandshakeChannelActionsMap>;

  protected _localVideoController: VideoControllerApi;
  protected _remoteVideoController?: VideoControllerApi;

  protected _videoWindowPlaybackState: VideoWindowPlaybackState = 'attached';
  protected _isDetachInProgress = false;
  protected _isAttachInProgress = false;

  protected _stateBeforeDetach?: VideoControllerState;
  protected _stateBeforeAttach?: VideoControllerState;

  protected _lastHeartbeatTime?: number;
  protected _heartbeatFailuresNumber = 0;

  protected _detachedWindow: WindowProxy | undefined;

  protected _handshakeChannelBreaker$ = new Subject<void>();

  constructor(config: Partial<DetachableVideoControllerConfig>, videoController: VideoControllerApi) {
    super(videoController);

    this._config = {
      ...VIDEO_DETACHABLE_CONTROLLER_CONFIG_DEFAULT,
      ...config,
    };

    this._localVideoController = this._videoController;

    this._handshakeChannel = new TypedOmpBroadcastChannel(ompHandshakeBroadcastChannelId);

    if (this._config.thumbnailVttUrl) {
      this.loadThumbnailVttUrl(this._config.thumbnailVttUrl);
    }
  }

  private resetHandshakeChannel() {
    nextCompleteSubject(this._handshakeChannelBreaker$);
    this._handshakeChannelBreaker$ = new Subject<void>();
  }

  private setVideoWindowPlaybackState(state: VideoWindowPlaybackState) {
    this._videoWindowPlaybackState = state;
    this.onVideoWindowPlaybackStateChange$.next({
      videoWindowPlaybackState: state,
    });
  }

  override isDetachable(): boolean {
    return !!this._config.detachedPlayerUrlFn;
  }

  protected areSidecarAudiosLoaded(): boolean {
    return !this._videoController.getSidecarAudioStates().find(p => !p.loaded)
  }

  override canDetach(): boolean {
    return this.isVideoLoaded() && this.getVideoWindowPlaybackState() === 'attached' && !this._isDetachInProgress && this.isDetachable() && this.areSidecarAudiosLoaded();
  }

  override canAttach(): boolean {
    return this.isVideoLoaded() && this.getVideoWindowPlaybackState() === 'detached' && !this._isAttachInProgress && this.isDetachable();
  }

  override getVideoWindowPlaybackState(): VideoWindowPlaybackState {
    return this._videoWindowPlaybackState;
  }

  override detachVideoWindow(): Observable<void> {
    return passiveObservable((observer) => {
      if (this._isDetachInProgress) {
        console.debug(`Detach in progress, exiting gracefully..`);
        nextCompleteObserver(observer);
      } else if (this.canDetach()) {
        let state = this.captureCurrentState();
        this._stateBeforeDetach = state;

        this._isDetachInProgress = true;

        let handleDetachError = (err: any) => {
          this.handleDetachError();
          this._isDetachInProgress = false;
          errorCompleteObserver(observer, err);
        };

        if (this.isFullscreen()) {
          try {
            this.toggleFullscreen();
          } catch (e) {
            console.debug(e);
          }
        }

        let prerequisitesSatisfied = () => {
          return !!this.getPlaybackState() && !this.getPlaybackState()!.seeking && !this.getPlaybackState()!.waiting && !this.getPlaybackState()!.buffering;
        };

        let proceedDetachVideoWindow = () => {
          this.setVideoWindowPlaybackState('detaching');

          this.resetHandshakeChannel();

          // prepare for receiving connect message from detached window
          this._handshakeChannel
            .createRequestResponseStream('DetachedControllerProxy.connect')
            .pipe(take(1), takeUntil(this._handshakeChannelBreaker$), takeUntil(this._destroyed$))
            .subscribe({
              next: ([request, sendResponseHook]) => {
                let proxyId = request.proxyId;

                console.debug(`Connect received from proxy id: ${proxyId}`);

                let messageChannel = new TypedOmpBroadcastChannel<MessageChannelActionsMap>(CryptoUtil.uuid());

                console.debug(`Message channel created, channelId: ${messageChannel.channelId}`);

                sendResponseHook({
                  proxyId: proxyId,
                  messageChannelId: messageChannel.channelId,
                });

                this._handshakeChannel
                  .createRequestResponseStream(`DetachedControllerProxy.connected`)
                  .pipe(filter(([request, sendResponseHook]) => request.proxyId === proxyId))
                  .pipe(takeUntil(this._handshakeChannelBreaker$), take(1))
                  .subscribe({
                    next: ([request, sendResponseHook]) => {
                      console.debug(`Connection established with proxyId: ${proxyId}`);

                      sendResponseHook({
                        proxyId: proxyId,
                      });

                      this._remoteVideoController = new RemoteVideoController(messageChannel, () => {
                        return this.attachVideoWindowRemoteControllerHook();
                      });

                      this._lastHeartbeatTime = new Date().getTime();
                      this._handshakeChannel
                        .createRequestResponseStream(`DetachedControllerProxy.heartbeat`)
                        .pipe(filter(([request, sendResponseHook]) => request.proxyId === proxyId))
                        .pipe(takeUntil(this._handshakeChannelBreaker$))
                        .subscribe({
                          next: ([request, sendResponseHook]) => {
                            let heartbeatTime = new Date().getTime();
                            sendResponseHook({
                              proxyId: proxyId,
                              heartbeat: request.heartbeat,
                            });
                            this._lastHeartbeatTime = heartbeatTime;
                            this._heartbeatFailuresNumber = 0;
                            // console.debug('Heartbeat', heartbeatTime)
                          },
                        });
                      this.startHeartbeatCheckLoop();

                      let finalize = (): void => {
                        this.switchToControllerRestoreState(this._remoteVideoController!, state).subscribe({
                          complete: () => {
                            nextCompleteObserver(observer);
                            this._isDetachInProgress = false;
                          },
                          error: (err) => handleDetachError(err),
                        });
                      };

                      (state.isPlaying
                        ? this.pause()
                            .pipe(timeout(1000))
                            .pipe(map((p) => true))
                        : of(true)
                      ).subscribe({
                        next: () => {
                          finalize();
                        },
                        error: (err) => {
                          handleDetachError(err);
                        },
                      });
                    },
                    error: (err) => handleDetachError(err),
                  });
              },
              error: (err) => handleDetachError(err),
            });

          // open detached window
          let detachedPlayerUrl = this._config.detachedPlayerUrlFn!(this.getVideo()!, this.getVideoLoadOptions());
          if (StringUtil.isEmpty(detachedPlayerUrl)) {
            throw new Error(`Detached player URL is empty, check config.detachedPlayerUrlFn`);
          }
          this._detachedWindow = WindowUtil.open(detachedPlayerUrl, this._config.detachedPlayerWindowTarget, this._config.detachedPlayerWindowFeatures);
          if (!this._detachedWindow) {
            console.debug(`Detached window was not available immediately after detaching`);
          }
        };

        let breaker$ = new Subject<void>();
        timer(0, 10)
          .pipe(takeUntil(breaker$))
          .subscribe({
            next: (value) => {
              if (prerequisitesSatisfied()) {
                if (!breaker$.closed) {
                  nextCompleteSubject(breaker$);
                  proceedDetachVideoWindow();
                }
              } else {
                console.debug(`Waiting until video detach preconditions are met.. ${value}`);
              }
            },
          });
      } else {
        let message = `Cannot detach. `;

        if (!this.isVideoLoaded()) {
          message = `${message} Video not loaded.`;
        }

        if (!this.areSidecarAudiosLoaded()) {
          message = `${message} Sidecar audios not loaded.`;
        }

        if (this._isDetachInProgress) {
          message = `${message} Detach in progress.`;
        }

        if (!this.isDetachable()) {
          message = `${message} Player is not detachable. Check config.`;
        }

        if (this.getVideoWindowPlaybackState() !== 'attached') {
          message = `${message} Video has to be attached.`;
        }

        errorCompleteObserver(observer, new OmpError(message));
      }
    });
  }

  protected attachVideoWindowRemoteControllerHook(): Observable<void> {
    return this.attachVideoWindow();
  }

  override attachVideoWindow(): Observable<void> {
    return passiveObservable((observer) => {
      if (this._isAttachInProgress) {
        console.debug(`Attach in progress, exiting gracefully..`);
        nextCompleteObserver(observer);
      } else if (this.canAttach()) {
        this._isAttachInProgress = true;

        let handleAttachError = (error: any) => {
          console.debug(error);
          this.handleAttachError();
          nextCompleteObserver(observer);
          this._isAttachInProgress = false;
        };

        // it's important to capture state before controller switch or RemoteVideoController destruction
        let state = this.captureCurrentState();
        this._stateBeforeAttach = state;

        let finalize = () => {
          this.closeDetachedWindow().subscribe({
            error: (err) => {
              console.debug(err);
            },
          });

          this.setVideoWindowPlaybackState('attaching');

          this.switchToControllerRestoreState(this._localVideoController, state).subscribe({
            next: () => {
              nextCompleteObserver(observer);
              this._isAttachInProgress = false;
            },
            error: (error) => {
              handleAttachError(error);
            },
          });
        };

        // if detached window is closed, we will never get response, thus it's safe to timeout and continue as normal
        (state.isPlaying
          ? this.pause()
              .pipe(timeout(100))
              .pipe(map((p) => true))
          : of(true)
        ).subscribe({
          next: () => {
            finalize();
          },
          error: (err) => {
            // handleAttachError(err);
            finalize();
          },
        });
      } else {
        let message = `Cannot attach. `;

        if (!this.isVideoLoaded()) {
          message = `${message} Video not loaded.`;
        }

        if (this._isAttachInProgress) {
          message = `${message} Attach in progress.`;
        }

        if (!this.isDetachable()) {
          message = `${message} Player is not detachable. Check config.`;
        }

        if (this.getVideoWindowPlaybackState() !== 'detached') {
          message = `${message} Video has to be detached.`;
        }

        errorCompleteObserver(observer, new OmpError(message));
      }
    });
  }

  protected closeDetachedWindow(): Observable<void> {
    return passiveObservable((observer) => {
      this.resetHandshakeChannel();
      if (this._detachedWindow) {
        try {
          this._detachedWindow.close();
        } catch (e) {
          console.debug(e);
        }
      } else {
        console.debug(`Window reference not found. Please close it manually.`);
      }

      try {
        if (this._remoteVideoController) {
          this._remoteVideoController.destroy();
        }
      } catch (e) {
        console.debug(e);
      }

      // return immediately, this will enable closing window ASAP
      nextCompleteObserver(observer);
    });
  }

  private switchToControllerRestoreState(videoController: VideoControllerApi, state: VideoControllerState): Observable<void> {
    return new Observable((observer) => {
      this.switchToController(videoController);
      this.restoreState(state).subscribe({
        next: () => {
          this.setVideoWindowPlaybackState(this._videoController.getVideoWindowPlaybackState());
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  private startHeartbeatCheckLoop() {
    timer(0, this._config.heartbeatCheckInterval)
      .pipe(takeUntil(this._handshakeChannelBreaker$), takeUntil(this._destroyed$))
      .subscribe({
        next: () => {
          let now = new Date().getTime();
          let diff = now - this._lastHeartbeatTime!;
          if (diff > this._config.heartbeatFailureTimeDiffThreshold) {
            this._heartbeatFailuresNumber++;
            console.debug(`Heartbeat threshold reached (${diff}), failures number: ${this._heartbeatFailuresNumber}`);

            if (this._heartbeatFailuresNumber >= this._config.heartbeatFailuresNumberThreshold) {
              console.debug(`Heartbeat failures number threshold reached (${this._heartbeatFailuresNumber}), attaching to window`);
              this.handleHeartbeatError();
            }
          }
        },
      });
  }

  private handleDetachError() {
    console.debug('Handling detach error');

    this.setVideoWindowPlaybackState('attaching');

    this.closeDetachedWindow();

    this.switchToController(this._localVideoController!);

    let finalize = () => {
      // OmakasePlayer.alerts.info('Close detected, video attached', {autodismiss: true, duration: 3000})
      this.setVideoWindowPlaybackState(this._videoController.getVideoWindowPlaybackState());
    };

    if (this._stateBeforeDetach) {
      this.restoreState(this._stateBeforeDetach).subscribe({
        next: () => {
          finalize();
        },
        error: (err) => {
          finalize();
        },
      });
    } else {
      finalize();
    }
  }

  private handleAttachError() {
    console.debug('Handling attach error');

    this.setVideoWindowPlaybackState('attaching');

    this.resetHandshakeChannel();

    let state = this._stateBeforeAttach ? this._stateBeforeAttach : this.captureCurrentState();

    this.switchToController(this._localVideoController!);

    this.restoreState(state).subscribe({
      next: () => {
        // OmakasePlayer.alerts.info('Close detected, video attached', {autodismiss: true, duration: 3000})
        this.setVideoWindowPlaybackState(this._videoController.getVideoWindowPlaybackState());
      },
    });

    if (this._remoteVideoController) {
      this._remoteVideoController.destroy();
    }
  }

  private handleHeartbeatError() {
    console.debug('Handling heartbeat error');

    this.setVideoWindowPlaybackState('attaching');

    this.resetHandshakeChannel();

    let state = this.captureCurrentState();

    this.switchToController(this._localVideoController!);

    this.restoreState(state).subscribe({
      next: () => {
        // OmakasePlayer.alerts.info('Close detected, video attached', {autodismiss: true, duration: 3000})
        this.setVideoWindowPlaybackState(this._videoController.getVideoWindowPlaybackState());
      },
    });

    if (this._remoteVideoController) {
      this._remoteVideoController.destroy();
    }
  }

  private captureCurrentState(): VideoControllerState {
    return {
      video: this.getVideo()!,
      videoLoadOptions: this.getVideoLoadOptions(),
      currentTime: this.getCurrentTime(),
      isPlaying: this.isPlaying(),
      subtitlesTracks: this.getSubtitlesTracks(),
      activeSubtitlesTrack: this.getActiveSubtitlesTrack(),
      activeAudioTrack: this.getActiveAudioTrack(),
      videoSafeZones: this.getSafeZones(),
      helpMenuGroups: this.getHelpMenuGroups(),
      volume: this.getVolume(),
      muted: this.isMuted(),
      playbackRate: this.getPlaybackRate(),
      thumbnailVttUrl: this.getThumbnailVttUrl(),
      activeNamedEventStreams: this.getActiveNamedEventStreams(),
      mainAudioChangeEvent: this.onMainAudioChange$.value,
      mainAudioInputSoloMuteEvent: this.onMainAudioInputSoloMute$.value,
      sidecarAudioStates: this.getSidecarAudioStates(),
      sidecarAudioInputSoloMuteStates: this.getSidecarAudioInputSoloMuteStates(),
      audioOutputVolume: this.getAudioOutputVolume(),
      audioOutputMuted: this.isAudioOutputMuted(),
    };
  }

  private restoreState(state: VideoControllerState) {
    let beforeVideoLoads$: Observable<void>[] = [];
    let afterVideoLoads$: Observable<void>[] = [];

    let beforeVideoLoad = (o$: Observable<any>) => {
      beforeVideoLoads$.push(o$);
    };

    let afterVideoLoad = (o$: Observable<any>) => {
      afterVideoLoads$.push(o$);
    };

    let totalObservables = 0;
    let completedObservables = 0;
    let describedObservable = (desc: string, observable$: Observable<any>) => {
      ++totalObservables;
      return observable$.pipe(
        tap(() => {
          ++completedObservables;
          console.debug(`{${desc}} -> COMPLETED | ${completedObservables}/${totalObservables}`);
        })
      );
    };

    beforeVideoLoad(
      describedObservable(
        `Update Active Named Event Streams`,
        new Observable((observer) => {
          this.updateActiveNamedEventStreams(state.activeNamedEventStreams).subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
          });
        })
      )
    );

    let loadVideo$ = describedObservable(
      `Video load`,
      new Observable((observer) => {
        if (JSON.stringify(this.getVideo()) !== JSON.stringify(state.video) || JSON.stringify(this.getVideoLoadOptions()) !== JSON.stringify(state.videoLoadOptions)) {
          let optionsInternal: VideoLoadOptionsInternal = {
            videoWindowPlaybackState: this.getVideoWindowPlaybackState(),
          };

          console.debug(`Video and / or VideoLoadOptions differ, we have to load video`);

          this.loadVideoInternal(
            state.video.sourceUrl,
            {
              frameRate: state.video.frameRate,
              ...state.videoLoadOptions,
            },
            optionsInternal
          ).subscribe({
            next: () => {
              console.debug(`Video load completed`);

              nextCompleteObserver(observer);
            },
            error: (err) => {
              console.error(err);

              errorCompleteObserver(observer, err);
            },
          });
        } else {
          nextCompleteObserver(observer);
        }
      })
    );

    afterVideoLoad(
      describedObservable(
        `Subtitles`,
        new Observable((observer) => {
          this.onSubtitlesLoaded$
            .pipe(
              filter((p) => !!p),
              take(1)
            )
            .subscribe({
              next: (event) => {
                if (state.activeSubtitlesTrack && state.activeSubtitlesTrack.embedded) {
                  // as id's are auto-generated, we have to match loaded embedded subtitles by content-digest
                  let newSubtitlesActiveTrack = this.getSubtitlesTracks().find((p) => p.contentDigest === state.activeSubtitlesTrack!.contentDigest);

                  if (newSubtitlesActiveTrack) {
                    console.debug(
                      `Switching subtitlesCurrentTrack from id:${state.activeSubtitlesTrack.id} to id: ${newSubtitlesActiveTrack.id}, contentDigest: ${newSubtitlesActiveTrack.contentDigest}`
                    );
                    state.activeSubtitlesTrack = {
                      ...newSubtitlesActiveTrack,
                      hidden: state.activeSubtitlesTrack.hidden,
                    };
                  }
                }

                let subtitlesCreation$ = new Observable<void>((observer) => {
                  let subtitlesForCreation = state.subtitlesTracks.filter((subtitlesTrack) => {
                    let existsOnActiveController = this.getSubtitlesTracks().find((p) => {
                      return subtitlesTrack.embedded ? p.contentDigest === subtitlesTrack.contentDigest : p.id === subtitlesTrack.id;
                    });

                    if (existsOnActiveController) {
                      console.debug(
                        `Subtitle transfer skipped for: ${subtitlesTrack.id}, loaded subtitle with same ${subtitlesTrack.embedded ? 'digest' : 'id'}: ${subtitlesTrack.embedded ? subtitlesTrack.contentDigest : subtitlesTrack.id}`
                      );
                      return false;
                    } else {
                      console.debug(`Subtitle marked for creation:`, subtitlesTrack.id);
                      return true;
                    }
                  });

                  if (subtitlesForCreation.length > 0) {
                    forkJoin(
                      subtitlesForCreation.map((subtitlesVttTrack) =>
                        this.createSubtitlesVttTrack(subtitlesVttTrack).pipe(
                          map((p) => ({
                            subtitlesVttTrack: subtitlesVttTrack,
                            created: true,
                          })),
                          catchError((error) => {
                            console.error(error);
                            return of({
                              subtitlesVttTrack: subtitlesVttTrack,
                              created: false,
                            });
                          })
                        )
                      )
                    ).subscribe({
                      next: (result) => {
                        console.debug(
                          `Created subtitles:`,
                          result.filter((p) => p.created).map((p) => p.subtitlesVttTrack.id)
                        );

                        console.debug(
                          `Subtitles failed to create:`,
                          result.filter((p) => !p.created).map((p) => p.subtitlesVttTrack.id)
                        );

                        nextCompleteObserver(observer);
                      },
                      error: (err) => {
                        errorCompleteObserver(observer, err);
                      },
                    });
                  } else {
                    nextCompleteObserver(observer);
                  }
                });

                let subtitlesRemoval$ = new Observable<void>((observer) => {
                  let subtitlesForRemoval = this.getSubtitlesTracks().filter((subtitlesTrack) => {
                    if (!state.subtitlesTracks.find((p) => (subtitlesTrack.embedded ? p.contentDigest === subtitlesTrack.contentDigest : p.id === subtitlesTrack.id))) {
                      console.debug(`Marking for subtitle removal:`, JSON.stringify(subtitlesTrack));
                      return true;
                    } else {
                      return false;
                    }
                  });

                  if (subtitlesForRemoval.length > 0) {
                    forkJoin(subtitlesForRemoval.map((p) => this.removeSubtitlesTrack(p.id))).subscribe({
                      next: () => {
                        console.debug(
                          `Removed subtitles:`,
                          subtitlesForRemoval.map((p) => p.id)
                        );
                        nextCompleteObserver(observer);
                      },
                      error: (err) => {
                        errorCompleteObserver(observer, err);
                      },
                    });
                  } else {
                    nextCompleteObserver(observer);
                  }
                });

                // check if we have to create subtitles
                // state.subtitlesTracks.forEach((subtitlesTrack) => {
                //   let existsOnActiveController = this.getSubtitlesTracks().find((p) => {
                //     return subtitlesTrack.embedded ? p.contentDigest === subtitlesTrack.contentDigest : p.id === subtitlesTrack.id;
                //   });
                //
                //   if (existsOnActiveController) {
                //     console.debug(
                //       `Subtitle transfer skipped for: ${subtitlesTrack.id}, loaded subtitle with same ${subtitlesTrack.embedded ? 'digest' : 'id'}: ${subtitlesTrack.embedded ? subtitlesTrack.contentDigest : subtitlesTrack.id}`
                //     );
                //   } else {
                //     console.debug(`Creating subtitle:`, subtitlesTrack.id);
                //     this.createSubtitlesVttTrack(subtitlesTrack);
                //   }
                // });

                // check if we have to remove subtitles
                // this.getSubtitlesTracks().forEach((subtitlesTrack) => {
                //   if (!state.subtitlesTracks.find((p) => (subtitlesTrack.embedded ? p.contentDigest === subtitlesTrack.contentDigest : p.id === subtitlesTrack.id))) {
                //     console.debug(`Removing subtitle:`, JSON.stringify(subtitlesTrack));
                //     this.removeSubtitlesTrack(subtitlesTrack.id);
                //   }
                // });

                forkJoin([subtitlesCreation$, subtitlesRemoval$]).subscribe({
                  next: () => {
                    if (state.activeSubtitlesTrack) {
                      console.debug(`Showing subtitle:`, state.activeSubtitlesTrack);
                      this.showSubtitlesTrack(state.activeSubtitlesTrack.id).subscribe({
                        next: () => {
                          if (state.activeSubtitlesTrack!.hidden) {
                            console.debug(`Hiding subtitle:`, state.activeSubtitlesTrack);
                            this.hideSubtitlesTrack(state.activeSubtitlesTrack!.id);
                          }
                          nextCompleteObserver(observer);
                        },
                      });
                    } else {
                      nextCompleteObserver(observer);
                    }
                  },
                });
              },
              error: (error) => {
                console.error(error);
                nextCompleteObserver(observer);
              },
            });
        })
      )
    );

    let audioTrackActivation$ = describedObservable(
      `Audio track activation`,
      new Observable((observer) => {
        console.debug('Audio track activation.', state.activeAudioTrack);

        let finalizeAudioLoad = () => {
          console.debug('Trying to restore from state.activeAudioTrack', state.activeAudioTrack);
          if (state.activeAudioTrack) {
            // waiting a bit
            const timerMs = 500;
            console.debug(`Waiting ${timerMs}ms before setting active audio track:`, state.activeAudioTrack!);
            timer(timerMs).subscribe(() => {
              this.setActiveAudioTrack(state.activeAudioTrack!.id).subscribe({
                next: (event) => {
                  if (state.mainAudioChangeEvent && !state.mainAudioChangeEvent.mainAudioState.active) {
                    this.deactivateMainAudio().subscribe({
                      next: () => {
                        nextCompleteObserver(observer);
                      },
                    });
                  } else {
                    nextCompleteObserver(observer);
                  }
                },
                error: (error) => {
                  console.debug(`Problems setting active audio track:`, state.activeAudioTrack);
                  nextCompleteObserver(observer);
                },
              });
            });
          } else {
            nextCompleteObserver(observer);
          }
        };

        let onAudioSwitchedBreaker$ = new Subject<void>();
        let lastActiveAudioTrack$: BehaviorSubject<OmpAudioTrack | undefined> = new BehaviorSubject<OmpAudioTrack | undefined>(this.getActiveAudioTrack());
        this.onAudioSwitched$.pipe(take(1), takeUntil(onAudioSwitchedBreaker$)).subscribe({
          next: (event) => {
            lastActiveAudioTrack$.next(event.activeAudioTrack);
          },
        });

        this.onAudioLoaded$
          .pipe(filter((p) => !!p))
          .pipe(take(1), timeout(20000))
          .subscribe({
            next: (audioLoadedEvent) => {
              if (audioLoadedEvent!.activeAudioTrack) {
                console.debug(`activeAudioTrack provided with AudioLoadedEvent.`);
                nextCompleteSubject(onAudioSwitchedBreaker$);
                finalizeAudioLoad();
              } else {
                lastActiveAudioTrack$
                  .pipe(filter((p) => !!p))
                  .pipe(take(1))
                  .pipe(takeUntil(this._destroyed$))
                  .pipe(timeout(20000))
                  .subscribe({
                    next: (track) => {
                      console.debug(`lastActiveAudioTrack$ caught.`, track);
                      console.debug(`We can proceed with audio track activation.`);
                      nextCompleteSubject(onAudioSwitchedBreaker$);
                      finalizeAudioLoad();
                    },
                    error: (error) => {
                      console.debug(`onAudioSwitchedWithLast$ timeouted, could be that audio track is already loaded.`);
                      nextCompleteSubject(onAudioSwitchedBreaker$);
                      finalizeAudioLoad();
                    },
                  });
              }
            },
            error: (error) => {
              console.debug('Problems detecting AudioLoadedEvent, gracefully exiting.. ');
              // ignore
              nextCompleteObserver(observer);
            },
          });
      })
    );

    let routerConnectionsConsolidation$ = describedObservable(
      `Router connections`,
      new Observable((observer) => {
        console.debug('Router connections consolidation.');
        if (state.mainAudioChangeEvent) {
          let mainAudioState = state.mainAudioChangeEvent.mainAudioState;

          let o1$ = mainAudioState.audioRouterState ? this.createMainAudioRouter(mainAudioState.audioRouterState.inputsNumber, mainAudioState.audioRouterState.outputsNumber) : of(true);
          let o2$ = mainAudioState.audioPeakProcessorState ? this.createMainAudioPeakProcessor(mainAudioState.audioPeakProcessorState.audioMeterStandard) : of(true);

          forkJoin([o1$, o2$]).subscribe({
            next: () => {
              // we will not wait for this to finish, just execute
              if (mainAudioState.audioRouterState) {
                // remove all existing graphs
                this.removeMainAudioEffectsGraphs();

                mainAudioState.audioRouterState.routingRoutes.forEach((routingRoute) => {
                  if (routingRoute.audioEffectsGraph) {
                    this.setMainAudioEffectsGraphs(routingRoute.audioEffectsGraph, routingRoute.path);
                  }
                });
                if (state.mainAudioInputSoloMuteEvent?.mainAudioInputSoloMuteState.audioRouterInputSoloMuteState?.soloed) {
                  let mainAudioInputSoloMuteState = state.mainAudioInputSoloMuteEvent.mainAudioInputSoloMuteState;
                  this.updateMainAudioRouterConnections([
                    ...mainAudioInputSoloMuteState.audioRouterInputSoloMuteState!.inputSoloedConnections,
                    ...mainAudioInputSoloMuteState.audioRouterInputSoloMuteState!.unsoloConnections,
                  ]);
                  this.toggleMainAudioRouterSolo({input: mainAudioInputSoloMuteState.audioRouterInputSoloMuteState!.inputNumber});
                } else {
                  this.updateMainAudioRouterConnections(mainAudioState.audioRouterState.routingRoutes.map((p) => p.connection));
                }
                this.setMainAudioRouterInitialRoutingConnections(mainAudioState.audioRouterState.initialRoutingConnections);
              }
              nextCompleteObserver(observer);
            },
          });
        } else {
          nextCompleteObserver(observer);
        }
      })
    );

    // in case audio track activation is required - we have to activate it first, then consolidate router connections
    // in case audio track activation is not required - we only have to consolidate router connections

    if (state.activeAudioTrack) {
      afterVideoLoad(
        new Observable((observer) => {
          concat(audioTrackActivation$, routerConnectionsConsolidation$).subscribe({
            complete: () => {
              nextCompleteObserver(observer);
            },
            error: (error) => {
              console.error(error);
            },
          });
        })
      );
    } else {
      afterVideoLoad(routerConnectionsConsolidation$);
    }

    afterVideoLoad(
      describedObservable(
        `Safe Zones`,
        new Observable((observer) => {
          forkJoin([this.clearSafeZones(), ...state.videoSafeZones.map((p) => this.addSafeZone(p))]).subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
          });
        })
      )
    );

    afterVideoLoad(
      describedObservable(
        `Help Menu Groups`,
        new Observable((observer) => {
          forkJoin([this.clearHelpMenuGroups(), ...state.helpMenuGroups.map((p) => this.appendHelpMenuGroup(p))]).subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
          });
        })
      )
    );

    afterVideoLoad(
      describedObservable(
        `Volume`,
        new Observable((observer) => {
          this.setVolume(state.volume).subscribe({
            next: () => {
              if (state.muted) {
                this.mute().subscribe({
                  next: () => {
                    nextCompleteObserver(observer);
                  },
                });
              } else {
                this.unmute().subscribe({
                  next: () => {
                    nextCompleteObserver(observer);
                  },
                });
              }
            },
          });
        })
      )
    );

    afterVideoLoad(
      describedObservable(
        `Audio Output Volume`,
        new Observable((observer) => {
          this.setAudioOutputVolume(state.audioOutputVolume).subscribe({
            next: () => {
              this.setAudioOutputMuted(state.audioOutputMuted);
              nextCompleteObserver(observer);
            },
          });
        })
      )
    );

    afterVideoLoad(
      describedObservable(
        `Sidecar audio tracks`,
        new Observable((observer) => {
          // could be optimized
          this.removeAllSidecarAudioTracks().subscribe({
            next: () => {
              if (state.sidecarAudioStates && state.sidecarAudioStates.length > 0) {
                let os$ = state.sidecarAudioStates.map((sidecarAudioState) => {
                  return new Observable((sidecarAudioObserver) => {
                    this.createSidecarAudioTrack(sidecarAudioState.audioTrack).subscribe({
                      next: (sidecarAudioTrack) => {
                        let o1$ = sidecarAudioState.audioRouterState
                          ? this.createSidecarAudioRouter(sidecarAudioState.audioTrack.id, sidecarAudioState.audioRouterState.inputsNumber, sidecarAudioState.audioRouterState.outputsNumber)
                          : of(true);
                        let o2$ = sidecarAudioState.audioPeakProcessorState
                          ? this.createSidecarAudioPeakProcessor(sidecarAudioState.audioTrack.id, sidecarAudioState.audioPeakProcessorState.audioMeterStandard)
                          : of(true);
                        forkJoin([o1$, o2$]).subscribe({
                          next: () => {
                            // we will not wait for this to finish, just execute
                            if (sidecarAudioState.audioRouterState) {
                              // remove all existing graphs
                              this.removeSidecarAudioEffectsGraphs(sidecarAudioState.audioTrack.id);

                              sidecarAudioState.audioRouterState.routingRoutes.forEach((routingRoute) => {
                                if (routingRoute.audioEffectsGraph) {
                                  this.setSidecarAudioEffectsGraph(sidecarAudioState.audioTrack.id, routingRoute.audioEffectsGraph, routingRoute.path);
                                }
                              });

                              let sidecarAudioSoloedInputState = state.sidecarAudioInputSoloMuteStates.find((inputState) => inputState.audioTrack.id === sidecarAudioState.audioTrack.id);
                              if (sidecarAudioSoloedInputState?.audioRouterInputSoloMuteState?.soloed) {
                                this.updateSidecarAudioRouterConnections(sidecarAudioSoloedInputState.audioTrack.id, [
                                  ...sidecarAudioSoloedInputState.audioRouterInputSoloMuteState.inputSoloedConnections,
                                  ...sidecarAudioSoloedInputState.audioRouterInputSoloMuteState.unsoloConnections,
                                ]);
                                this.toggleSidecarAudioRouterSolo(sidecarAudioSoloedInputState.audioTrack.id, {input: sidecarAudioSoloedInputState.audioRouterInputSoloMuteState.inputNumber});
                              } else {
                                this.updateSidecarAudioRouterConnections(
                                  sidecarAudioState.audioTrack.id,
                                  sidecarAudioState.audioRouterState.routingRoutes.map((p) => p.connection)
                                );
                              }

                              this.setSidecarAudioRouterInitialRoutingConnections(sidecarAudioState.audioTrack.id, sidecarAudioState.audioRouterState.initialRoutingConnections);
                              this.setSidecarVolume(sidecarAudioState.volume, [sidecarAudioState.audioTrack.id]);
                              this.setSidecarMuted(sidecarAudioState.muted, [sidecarAudioState.audioTrack.id]);
                            }

                            nextCompleteObserver(sidecarAudioObserver);
                          },
                        });
                      },
                      error: (error) => {
                        console.error(error);
                        nextCompleteObserver(sidecarAudioObserver);
                      },
                    });
                  });
                });

                forkJoin(os$).subscribe({
                  next: () => {
                    nextCompleteObserver(observer);
                  },
                });
              } else {
                nextCompleteObserver(observer);
              }
            },
          });
        })
      )
    );

    afterVideoLoad(
      describedObservable(
        `Thumbnail VTT Url`,
        new Observable((observer) => {
          if (state.thumbnailVttUrl) {
            this.loadThumbnailVttUrl(state.thumbnailVttUrl).subscribe({
              next: () => {
                nextCompleteObserver(observer);
              },
            });
          } else {
            nextCompleteObserver(observer);
          }
        }).pipe(tap(() => {}))
      )
    );

    let playback$ = describedObservable(
      `Playback`,
      new Observable((observer) => {
        if (state.currentTime > 0) {
          this.seekToTime(state.currentTime).subscribe({
            next: () => {
              this.setPlaybackRate(state.playbackRate).subscribe({
                next: () => {
                  if (state.isPlaying) {
                    // if (this.getVideoWindowPlaybackState() === 'detached' && BrowserProvider.instance().isSafari) {
                    //   // Safari just throws to many errors, we will not even try to auto-play in detached mode
                    // }

                    this.play().subscribe({
                      next: () => {
                        nextCompleteObserver(observer);
                      },
                      error: (err) => {
                        console.debug(`play() failed, user action will be required`, err);
                        nextCompleteObserver(observer);
                      },
                    });
                  } else {
                    nextCompleteObserver(observer);
                  }
                },
              });
            },
          });
        } else {
          nextCompleteObserver(observer);
        }
      })
    );

    return new Observable((observer) => {
      concat(forkJoin(beforeVideoLoads$), loadVideo$, forkJoin(afterVideoLoads$), playback$).subscribe({
        complete: () => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  override destroy() {
    super.destroy();

    nextCompleteSubject(this._handshakeChannelBreaker$);
    destroyer(this._handshakeChannel, this._localVideoController, this._remoteVideoController);
  }
}
