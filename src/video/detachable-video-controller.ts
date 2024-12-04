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
import {concat, filter, forkJoin, Observable, Subject, take, takeUntil, timeout, timer} from 'rxjs';
import {nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {destroyer} from '../util/destroy-util';
import {TypedOmpBroadcastChannel} from '../common/omp-broadcast-channel';
import {RemoteVideoController} from './remote-video-controller';
import {Constants} from '../constants';
import {SwitchableVideoController} from './switchable-video-controller';
import {WindowUtil} from '../util/window-util';
import {HandshakeChannelActionsMap, MessageChannelActionsMap} from './types';
import {AudioInputOutputNode, Video, VideoLoadOptions, VideoLoadOptionsInternal, VideoSafeZone, VideoWindowPlaybackState} from './model';
import {AudioWorkletNodeCreatedEvent, HelpMenuGroup, OmakaseAudioTrack, SubtitlesVttTrack} from '../types';
import {CryptoUtil} from '../util/crypto-util';
import {StringUtil} from '../util/string-util';

interface VideoControllerState {
  video: Video;
  videoLoadOptions: VideoLoadOptions | undefined;
  isPlaying: boolean;
  currentTime: number;
  subtitlesTracks: SubtitlesVttTrack[];
  activeSubtitlesTrack: SubtitlesVttTrack | undefined;
  activeAudioTrack: OmakaseAudioTrack | undefined;
  videoSafeZones: VideoSafeZone[];
  helpMenuGroups: HelpMenuGroup[];
  volume: number;
  muted: boolean;
  playbackRate: number;
  audioInputOutputNodes: AudioInputOutputNode[][];
  audioWorkletNodeCreatedEvent: AudioWorkletNodeCreatedEvent | undefined;
  thumbnailVttUrl: string | undefined;
}

export interface DetachableVideoControllerConfig {
  detachedPlayerUrl?: string; // if this property is not set detaching will not be enabled
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

    this._handshakeChannel = new TypedOmpBroadcastChannel(Constants.OMP_HANDSHAKE_BROADCAST_CHANNEL_ID);

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

  override isDetachVideoWindowEnabled(): boolean {
    return !StringUtil.isNullUndefinedOrWhitespace(this._config.detachedPlayerUrl);
  }

  override isAttachVideoWindowEnabled(): boolean {
    return this.isDetachVideoWindowEnabled();
  }

  override getVideoWindowPlaybackState(): VideoWindowPlaybackState {
    return this._videoWindowPlaybackState;
  }

  override detachVideoWindow(): Observable<void> {
    return passiveObservable((observer) => {
      if (!this.isDetachVideoWindowEnabled()) {
        throw new Error('Detaching is not enabled. Try setting detachPlayerUrl config');
      }

      if (!this.isVideoLoaded()) {
        throw new Error('Video not loaded');
      }

      if (this.getVideoWindowPlaybackState() !== 'attached') {
        throw new Error('Video has to be attached to be able to detach');
      }

      if (this.isFullscreen()) {
        this.toggleFullscreen();
      }

      let isDetachVideoWindowPossible = () => {
        return this.getPlaybackState() && !this.getPlaybackState()!.seeking && !this.getPlaybackState()!.waiting && !this.getPlaybackState()!.buffering;
      };

      let proceedDetachVideoWindow = () => {
        this.setVideoWindowPlaybackState('detaching');

        this._detachedWindow = WindowUtil.open(this._config.detachedPlayerUrl!, this._config.detachedPlayerWindowTarget, this._config.detachedPlayerWindowFeatures);
        if (!this._detachedWindow) {
          throw new Error(`Error occurred while opening detached window`);
        }

        this.resetHandshakeChannel();

        // receiving connect message from detached window
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

                    this._remoteVideoController = new RemoteVideoController(messageChannel, () => {
                      return this.attachVideoWindowRemoteControllerHook();
                    });

                    this.switchToControllerRestoreState(this._remoteVideoController, this.captureCurrentState()).subscribe({
                      next: () => {
                        nextCompleteObserver(observer);

                        sendResponseHook({
                          proxyId: proxyId,
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
                      },
                    });
                  },
                });
            },
          });
      };

      let breaker$ = new Subject<void>();
      timer(0, 10)
        .pipe(takeUntil(breaker$))
        .subscribe({
          next: (value) => {
            if (isDetachVideoWindowPossible()) {
              if (!breaker$.closed) {
                nextCompleteSubject(breaker$);
                proceedDetachVideoWindow();
              }
            } else {
              console.debug(`Waiting until video detach preconditions are met.. ${value}`);
            }
          },
        });
    });
  }

  protected attachVideoWindowRemoteControllerHook(): Observable<void> {
    return this.attachVideoWindow();
  }

  override attachVideoWindow(): Observable<void> {
    return passiveObservable(observer => {
      // it's important to capture state before controller switch or RemoteVideoController destruction
      let state = this.captureCurrentState();

      this.pause() // called on RemoteVideoController
        .pipe(timeout(500)) // pause() will timeout if RemoteVideoController cannot get response from DetachedVideoController (window is closed before attachVideoWindow() resolved)
        .subscribe({
          next: () => {
            this.closeDetachedWindow().subscribe({
              error: (err) => {
                console.debug(err)
              }
            })

            this.attachVideoWindowRestoreState(state).subscribe({
              next: () => {
                nextCompleteObserver(observer)
              }
            })

          },
          error: (error) => {
            if (error.name === 'TimeoutError') {
              console.debug(error);
              this.handleAttachDetachError();
            } else {
              console.error(error);
            }
          },
        });

    })
  }

  protected attachVideoWindowRestoreState(state: VideoControllerState): Observable<void> {
    return passiveObservable((observer) => {
      if (!this.isAttachVideoWindowEnabled()) {
        throw new Error('Attaching is not enabled. Try setting detachPlayerUrl config');
      }

      if (this.isVideoLoaded()) {
        if (this.getVideoWindowPlaybackState() === 'attached') {
          throw new Error('I think video is already attached');
        }

        this.setVideoWindowPlaybackState('attaching');

        this.switchToControllerRestoreState(this._localVideoController, state).subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  protected closeDetachedWindow(): Observable<void> {
    return passiveObservable(observer => {

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
    })
  }

  private switchToControllerRestoreState(videoController: VideoControllerApi, state: VideoControllerState): Observable<void> {
    return new Observable((observer) => {
      // let previousState = this.captureCurrentState();
      this.pause()
        .pipe(timeout(500)) // pause() will timeout if RemoteVideoController cannot get response from DetachedVideoController (window is closed before attachVideoWindow() resolved)
        .subscribe({
          next: () => {
            // let state = {
            //   ...this.captureCurrentState(),
            //   isPlaying: previousState.isPlaying,
            // };

            this.switchToController(videoController);

            this.restoreState(state).subscribe({
              next: () => {
                this.setVideoWindowPlaybackState(this._videoController.getVideoWindowPlaybackState());
                nextCompleteObserver(observer);
              },
            });
          },
          error: (error) => {
            if (error.name === 'TimeoutError') {
              console.debug(error);
              this.handleAttachDetachError();
            } else {
              console.error(error);
            }
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
              this.handleAttachDetachError();
            }
          }
        },
      });
  }

  private handleAttachDetachError() {
    console.debug('Handling attach / detach error');

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
      audioInputOutputNodes: this.getAudioInputOutputNodes(),
      audioWorkletNodeCreatedEvent: this.onAudioWorkletNodeCreated$.value,
      thumbnailVttUrl: this.getThumbnailVttUrl(),
    };
  }

  private restoreState(state: VideoControllerState) {
    let loadVideo$ = new Observable((observer) => {
      if (JSON.stringify(this.getVideo()) !== JSON.stringify(state.video) || JSON.stringify(this.getVideoLoadOptions()) !== JSON.stringify(state.videoLoadOptions)) {
        let optionsInternal: VideoLoadOptionsInternal = {
          videoWindowPlaybackState: this.getVideoWindowPlaybackState(),
        };

        this.loadVideoInternal(state.video.sourceUrl, state.video.frameRate, state.videoLoadOptions, optionsInternal).subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
        });
      } else {
        nextCompleteObserver(observer);
      }
    });

    let os$: Observable<void>[] = [];

    let addObservable = (o$: Observable<any>) => {
      os$.push(o$);
    };

    addObservable(
      new Observable((observer) => {
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
                  });
                } else {
                  nextCompleteObserver(observer);
                }
              },
            });
          },
        });
      })
    );

    addObservable(
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

              // check if we have to create subtitles
              state.subtitlesTracks.forEach((subtitlesTrack) => {
                let existsOnActiveController = this.getSubtitlesTracks().find((p) => {
                  return subtitlesTrack.embedded ? p.contentDigest === subtitlesTrack.contentDigest : p.id === subtitlesTrack.id;
                });

                if (existsOnActiveController) {
                  console.debug(
                    `Subtitle transfer skipped for: ${subtitlesTrack.id}, loaded subtitle with same ${subtitlesTrack.embedded ? 'digest' : 'id'}: ${subtitlesTrack.embedded ? subtitlesTrack.contentDigest : subtitlesTrack.id}`
                  );
                } else {
                  console.debug(`Creating subtitle:`, subtitlesTrack.id);
                  this.createSubtitlesVttTrack(subtitlesTrack);
                }
              });

              // check if we have to remove subtitles
              this.getSubtitlesTracks().forEach((subtitlesTrack) => {
                if (!state.subtitlesTracks.find((p) => (subtitlesTrack.embedded ? p.contentDigest === subtitlesTrack.contentDigest : p.id === subtitlesTrack.id))) {
                  console.debug(`Removing subtitle:`, JSON.stringify(subtitlesTrack));
                  this.removeSubtitlesTrack(subtitlesTrack.id);
                }
              });

              if (state.activeSubtitlesTrack) {
                console.debug(`Showing subtitle:`, state.activeSubtitlesTrack);
                this.showSubtitlesTrack(state.activeSubtitlesTrack.id).subscribe({
                  next: () => {
                    if (state.activeSubtitlesTrack!.hidden) {
                      console.debug(`Hiding subtitle:`, state.activeSubtitlesTrack);
                      this.hideSubtitlesTrack(state.activeSubtitlesTrack!.id);
                    }
                  },
                });
              }

              nextCompleteObserver(observer);
            },
          });
      })
    );

    addObservable(
      new Observable((observer) => {
        this.onAudioLoaded$.pipe(take(1), timeout(60000)).subscribe({
          next: (event) => {
            if (state.activeAudioTrack) {
              this.setActiveAudioTrack(state.activeAudioTrack.id);
            }
          },
          error: (error) => {
            console.debug(error);
            // ignore
          },
        });
        nextCompleteObserver(observer);
      })
    );

    addObservable(
      new Observable((observer) => {
        forkJoin([this.clearSafeZones(), ...state.videoSafeZones.map((p) => this.addSafeZone(p))]).subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
        });
      })
    );

    addObservable(
      new Observable((observer) => {
        forkJoin([this.clearHelpMenuGroups(), ...state.helpMenuGroups.map((p) => this.appendHelpMenuGroup(p))]).subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
        });
      })
    );

    addObservable(
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
    );

    addObservable(
      new Observable((observer) => {
        if (state.audioInputOutputNodes.length > 0 && state.audioInputOutputNodes[0] && state.audioInputOutputNodes[0].length > 0) {
          let inputsNumber = state.audioInputOutputNodes.length;
          let ouputsNumber = state.audioInputOutputNodes[0].length;

          this.createAudioRouter(inputsNumber, ouputsNumber).subscribe({
            next: (event) => {
              let nodes = state.audioInputOutputNodes.flatMap((byInput, inputNumber) => byInput.map((audioInputOutputNode, outputNumber) => audioInputOutputNode));
              this.routeAudioInputOutputNodes(nodes).subscribe({
                next: (event) => {
                  if (state.audioWorkletNodeCreatedEvent) {
                    this.createAudioPeakProcessorWorkletNode(state.audioWorkletNodeCreatedEvent.audioMeterStandard).subscribe({
                      next: () => {
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

    addObservable(
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
      })
    );

    return concat(loadVideo$, forkJoin(os$));
  }

  override destroy() {
    super.destroy();

    nextCompleteSubject(this._handshakeChannelBreaker$);
    destroyer(this._handshakeChannel, this._localVideoController, this._remoteVideoController);
  }
}
