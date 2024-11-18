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
import {TypedOmpBroadcastChannel} from '../common/omp-broadcast-channel';
import {HandshakeChannelActionsMap, MessageChannelActionsMap} from './types';
import {BehaviorSubject, catchError, filter, interval, Observable, Subject, takeUntil, timeout, timer} from 'rxjs';
import {Constants} from '../constants';
import {CryptoUtil} from '../util/crypto-util';
import {nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {destroyer} from '../util/destroy-util';
import {OmakasePlayer} from '../omakase-player';
import {Alert} from '../alerts/model';
import {WindowUtil} from '../util/window-util';
import {
  AudioContextChangeEvent,
  AudioLoadedEvent,
  AudioPeakProcessorWorkletNodeMessageEvent,
  AudioRoutingEvent,
  AudioSwitchedEvent,
  AudioWorkletNodeCreatedEvent,
  HelpMenuGroup,
  SubtitlesCreateEvent,
  SubtitlesEvent,
  SubtitlesLoadedEvent,
  SubtitlesVttTrack,
  ThumnbailVttUrlChangedEvent,
  VideoBufferingEvent,
  VideoEndedEvent,
  VideoErrorEvent,
  VideoFullscreenChangeEvent,
  VideoHelpMenuChangeEvent,
  VideoLoadedEvent,
  VideoLoadingEvent,
  VideoPlaybackRateEvent,
  VideoPlayEvent,
  VideoSafeZoneChangeEvent,
  VideoSeekedEvent,
  VideoSeekingEvent,
  VideoTimeChangeEvent,
  VideoVolumeEvent,
  VideoWindowPlaybackStateChangeEvent
} from '../types';
import {AudioInputOutputNode, AudioMeterStandard, PlaybackState, Video, VideoLoadOptions, VideoLoadOptionsInternal, VideoSafeZone, VideoWindowPlaybackState} from './model';
import {BufferedTimespan} from './video-controller';
import Hls from 'hls.js';

export class DetachedVideoController implements VideoControllerApi {
  private readonly _proxyId;
  private readonly _handshakeChannel: TypedOmpBroadcastChannel<HandshakeChannelActionsMap>;

  private readonly _videoController: VideoControllerApi;

  private _messageChannel: TypedOmpBroadcastChannel<MessageChannelActionsMap> | undefined;

  private _connectionRetryInterval = 1000;
  private _maxConnectionAttempts = 10;
  private _heartbeatInterval = 1000;
  private _heartbeatTimeout = 2000;

  private _connectionBreaker$ = new Subject<void>();
  private _destroyed$ = new Subject<void>();

  constructor(videoController: VideoControllerApi) {
    this._handshakeChannel = new TypedOmpBroadcastChannel(Constants.OMP_HANDSHAKE_BROADCAST_CHANNEL_ID);

    this._videoController = videoController;

    this._proxyId = CryptoUtil.uuid();

    this.startConnectLoop();
  }

  private startConnectLoop() {
    nextCompleteSubject(this._connectionBreaker$);
    this._connectionBreaker$ = new Subject();

    let connectionAttempt = 1;
    let connect = () => {
      this._handshakeChannel.sendAndObserveResponse('DetachedControllerProxy.connect', {proxyId: this._proxyId})
        // .pipe(filter(p => p.proxyId === this._proxyId))
        .pipe(takeUntil(this._connectionBreaker$))
        .pipe(timeout(this._connectionRetryInterval))
        .subscribe({
          next: (response) => {
            console.debug(`Connect response received, message channel id ${response.messageChannelId}`);

            this.openMessageChannel(response.messageChannelId);

            this._handshakeChannel.sendAndObserveResponse(`DetachedControllerProxy.connected`, {proxyId: this._proxyId, messageChannelId: this._messageChannel!.channelId})
              .pipe(filter(p => p.proxyId === this._proxyId))
              .pipe(takeUntil(this._connectionBreaker$))
              .subscribe({
                next: (response) => {
                  console.debug(`Connection established response received, proxy is now connected, proxyId: ${this._proxyId}`);
                  this.startHeartbeatLoop();
                },
                error: (error) => {
                  console.error(error);
                  this.disconnect();
                }
              })

          },
          error: (error) => {
            console.error(error);
            console.debug(`Could not connect yet, attempt no ${connectionAttempt}`)
            if (connectionAttempt > this._maxConnectionAttempts) {
              console.debug(`Could not connect, quitting`);
              this.disconnect()
            } else {
              connectionAttempt++
              connect()
            }
          }
        })
    }
    connect();
  }

  private startHeartbeatLoop() {
    timer(0, this._heartbeatInterval)
      .pipe(takeUntil(this._connectionBreaker$), takeUntil(this._destroyed$)).subscribe({
      next: (heartbeat) => {
        this._handshakeChannel.sendAndObserveResponse(`DetachedControllerProxy.heartbeat`, {proxyId: this._proxyId, heartbeat: heartbeat})
          .pipe(filter(p => p.proxyId === this._proxyId))
          .pipe(takeUntil(this._connectionBreaker$))
          .pipe(timeout(this._heartbeatTimeout))
          .subscribe({
            next: (response) => {
              // console.debug(`Heartbeat response: ${response}`);
            },
            error: (error) => {
              console.error(error);
              console.debug(`Heartbeat timeout !`);
              this.disconnect();
            }
          })
      }
    })
  }

  private disconnect() {
    if (this._videoController.isPlaying()) {
      this._videoController.pause();
    }

    destroyer(this._handshakeChannel, this._messageChannel);

    nextCompleteSubject(this._connectionBreaker$);

    OmakasePlayer.instance.alerts.error(`Connection to host window lost`);

    let closeCountdown = 10;
    let alert: Alert;

    let intervalInstance = interval(1000).subscribe({
      next: (value) => {
        if ((closeCountdown - value) <= 0) {
          intervalInstance.unsubscribe();
          WindowUtil.close();
        } else {
          if (alert) {
            OmakasePlayer.instance.alerts.dismiss(alert.id);
          }
          alert = OmakasePlayer.instance.alerts.warn(`Closing in ${closeCountdown - value}`)
        }
      }
    })
  }

  private openMessageChannel(channelId: string) {
    this._messageChannel = new TypedOmpBroadcastChannel<MessageChannelActionsMap>(channelId);

    // only message push

    this._videoController.onVideoLoading$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onVideoLoading$', value);
      }
    })

    this._videoController.onVideoLoaded$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onVideoLoaded$', value);
      }
    })

    this._videoController.onVideoTimeChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onVideoTimeChange$', value);
      }
    })

    this._videoController.onPlay$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onPlay$', value);
      }
    })

    this._videoController.onPause$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onPause$', value);
      }
    })

    this._videoController.onSeeking$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onSeeking$', value);
      }
    })

    this._videoController.onSeeked$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onSeeked$', value);
      }
    })

    this._videoController.onEnded$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onEnded$', value);
      }
    })

    this._videoController.onAudioSwitched$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onAudioSwitched$', value);
      }
    })

    this._videoController.onAudioLoaded$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onAudioLoaded$', value);
      }
    })

    this._videoController.onAudioContextChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onAudioContextChange$', value);
      }
    })

    this._videoController.onAudioPeakProcessorWorkletNodeMessage$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onAudioPeakProcessorWorkletNodeMessage$', value);
      }
    })

    this._videoController.onAudioWorkletNodeCreated$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onAudioWorkletNodeCreated$', value);
      }
    })

    this._videoController.onAudioRouting$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onAudioRouting$', value);
      }
    })

    this._videoController.onVideoError$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onVideoError$', value);
      }
    })

    this._videoController.onBuffering$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onBuffering$', value);
      }
    })

    this._videoController.onVolumeChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onVolumeChange$', value);
      }
    })

    this._videoController.onFullscreenChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onFullscreenChange$', value);
      }
    })

    this._videoController.onVideoSafeZoneChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onVideoSafeZoneChange$', value);
      }
    })

    this._videoController.onPlaybackState$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onPlaybackState$', value);
      }
    })

    this._videoController.onHelpMenuChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onHelpMenuChange$', value);
      }
    })

    this._videoController.onVideoWindowPlaybackStateChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onVideoWindowPlaybackStateChange$', value);
      }
    })

    this._videoController.onSubtitlesLoaded$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onSubtitlesLoaded$', value);
      }
    })

    this._videoController.onSubtitlesCreate$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onSubtitlesCreate$', value);
      }
    })

    this._videoController.onSubtitlesRemove$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onSubtitlesRemove$', value);
      }
    })

    this._videoController.onSubtitlesShow$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onSubtitlesShow$', value);
      }
    })

    this._videoController.onSubtitlesHide$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onSubtitlesHide$', value);
      }
    })

    this._videoController.onThumbnailVttUrlChanged$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._messageChannel!.send('VideoControllerApi.onThumbnailVttUrlChanged$', value);
      }
    })

    // listen to messages and handle replies

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.loadVideoInternal').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.loadVideoInternal(request[0], request[1], request[2], request[3]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.loadVideo').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.loadVideo(request[0], request[1], request[2]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.reloadVideo').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.reloadVideo())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.togglePlayPause').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.togglePlayPause().pipe(catchError(error => {
          console.error(error)
          if (this.isPermissionsCheck(error)) {
            OmakasePlayer.instance.alerts.info(`Please initate playback in this window`, {autodismiss: true, duration: 3000})
          }
          throw error;
        })))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.seekToFrame').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.seekToFrame(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.seekFromCurrentFrame').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.seekFromCurrentFrame(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.seekFromCurrentTime').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.seekFromCurrentTime(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.seekPreviousFrame').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.seekPreviousFrame())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.seekNextFrame').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.seekNextFrame())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.seekToTime').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.seekToTime(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.seekToTimecode').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.seekToTimecode(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.seekToPercent').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.seekToPercent(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.toggleFullscreen').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.toggleFullscreen().pipe(catchError(error => {
          console.error(error)
          if (this.isPermissionsCheck(error)) {
            OmakasePlayer.instance.alerts.info(`Please initate toggle fullscreen action in this window`, {autodismiss: true, duration: 3000})
          }
          throw error;
        })))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.play').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.play().pipe(catchError(error => {
          console.error(error)
          if (this.isPermissionsCheck(error)) {
            OmakasePlayer.instance.alerts.info(`Please initate playback in this window`, {autodismiss: true, duration: 3000})
          }
          throw error;
        })))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.pause').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.pause())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.setVolume').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.setVolume(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.setPlaybackRate').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.setPlaybackRate(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.mute').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.mute())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.unmute').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.unmute())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.toggleMuteUnmute').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.toggleMuteUnmute())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.addSafeZone').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.addSafeZone(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.removeSafeZone').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.removeSafeZone(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.clearSafeZones').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.clearSafeZones())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.appendHelpMenuGroup').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.appendHelpMenuGroup(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.prependHelpMenuGroup').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.prependHelpMenuGroup(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.clearHelpMenuGroups').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.clearHelpMenuGroups())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.createSubtitlesVttTrack').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.createSubtitlesVttTrack(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.hideSubtitlesTrack').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.hideSubtitlesTrack(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.removeAllSubtitlesTracks').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.removeAllSubtitlesTracks())
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.removeSubtitlesTrack').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.removeSubtitlesTrack(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.showSubtitlesTrack').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.showSubtitlesTrack(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.setActiveAudioTrack').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.setActiveAudioTrack(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.createAudioContext').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.createAudioContext(request[0], request[1]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.routeAudioInputOutputNode').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.routeAudioInputOutputNode(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.routeAudioInputOutputNodes').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.routeAudioInputOutputNodes(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.createAudioPeakProcessorWorkletNode').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.createAudioPeakProcessorWorkletNode(request[0]))
      }
    })

    this._messageChannel!.createRequestResponseStream('VideoControllerApi.loadThumbnailVttUrl').pipe(takeUntil(this._destroyed$)).subscribe({
      next: ([request, sendResponseHook]) => {
        sendResponseHook(this._videoController.loadThumbnailVttUrl(request[0]))
      }
    })
  }

  private isPermissionsCheck(error: any): boolean {
    // return error.name === 'TypeError' && error.message === 'Permissions check failed';
    return (error.name === 'TypeError' || error.name === 'NotAllowedError'); // chrome throws TypeError, safari throws NotAllowedError
  }

  destroy() {
    nextCompleteSubject(this._destroyed$);
  }

  // region provider mappings

  get onVideoLoaded$(): BehaviorSubject<VideoLoadedEvent | undefined> {
    return this._videoController.onVideoLoaded$;
  }

  get onVideoLoading$(): Observable<VideoLoadingEvent> {
    return this._videoController.onVideoLoading$;
  }

  get onPlay$(): Observable<VideoPlayEvent> {
    return this._videoController.onPlay$;
  }

  get onPause$(): Observable<VideoPlayEvent> {
    return this._videoController.onPause$;
  }

  get onVideoTimeChange$(): Observable<VideoTimeChangeEvent> {
    return this._videoController.onVideoTimeChange$;
  }

  get onSeeking$(): Observable<VideoSeekingEvent> {
    return this._videoController.onSeeking$;
  }

  get onSeeked$(): Observable<VideoSeekedEvent> {
    return this._videoController.onSeeked$;
  }

  get onBuffering$(): Observable<VideoBufferingEvent> {
    return this._videoController.onBuffering$;
  }

  get onEnded$(): Observable<VideoEndedEvent> {
    return this._videoController.onEnded$;
  }

  get onAudioSwitched$(): Observable<AudioSwitchedEvent> {
    return this._videoController.onAudioSwitched$;
  }

  get onAudioPeakProcessorWorkletNodeMessage$(): Observable<AudioPeakProcessorWorkletNodeMessageEvent> {
    return this._videoController.onAudioPeakProcessorWorkletNodeMessage$;
  }

  get onPlaybackState$(): Observable<PlaybackState> {
    return this._videoController.onPlaybackState$;
  }

  get onPlaybackRateChange$(): Observable<VideoPlaybackRateEvent> {
    return this._videoController.onPlaybackRateChange$;
  }

  get onHelpMenuChange$(): Observable<VideoHelpMenuChangeEvent> {
    return this._videoController.onHelpMenuChange$;
  }

  get onVideoWindowPlaybackStateChange$(): Observable<VideoWindowPlaybackStateChangeEvent> {
    return this._videoController.onVideoWindowPlaybackStateChange$;
  }

  get onVideoError$(): Observable<VideoErrorEvent> {
    return this._videoController.onVideoError$;
  }

  get onVolumeChange$(): Observable<VideoVolumeEvent> {
    return this._videoController.onVolumeChange$;
  }

  get onFullscreenChange$(): Observable<VideoFullscreenChangeEvent> {
    return this._videoController.onFullscreenChange$;
  }

  get onVideoSafeZoneChange$(): Observable<VideoSafeZoneChangeEvent> {
    return this._videoController.onVideoSafeZoneChange$;
  }

  get onAudioLoaded$(): BehaviorSubject<AudioLoadedEvent | undefined> {
    return this._videoController.onAudioLoaded$;
  }

  get onSubtitlesLoaded$(): BehaviorSubject<SubtitlesLoadedEvent | undefined> {
    return this._videoController.onSubtitlesLoaded$;
  }

  get onSubtitlesCreate$(): Observable<SubtitlesCreateEvent> {
    return this._videoController.onSubtitlesCreate$;
  }

  get onSubtitlesHide$(): Observable<SubtitlesEvent> {
    return this._videoController.onSubtitlesHide$;
  }

  get onSubtitlesRemove$(): Observable<SubtitlesEvent> {
    return this._videoController.onSubtitlesRemove$;
  }

  get onSubtitlesShow$(): Observable<SubtitlesEvent> {
    return this._videoController.onSubtitlesShow$;
  }

  get onAudioContextChange$(): Observable<AudioContextChangeEvent> {
    return this._videoController.onAudioContextChange$;
  }

  get onAudioRouting$(): Observable<AudioRoutingEvent> {
    return this._videoController.onAudioRouting$;
  }

  get onAudioWorkletNodeCreated$(): BehaviorSubject<AudioWorkletNodeCreatedEvent | undefined> {
    return this._videoController.onAudioWorkletNodeCreated$;
  }

  get onThumbnailVttUrlChanged$(): Observable<ThumnbailVttUrlChangedEvent | undefined> {
    return this._videoController.onThumbnailVttUrlChanged$;
  }

  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone> {
    return this._videoController.addSafeZone(videoSafeZone);
  }

  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return this._videoController.appendHelpMenuGroup(helpMenuGroup);
  }

  calculateFrameToTime(frameNumber: number): number {
    return this._videoController.calculateFrameToTime(frameNumber);
  }

  calculateTimeToFrame(time: number): number {
    return this._videoController.calculateTimeToFrame(time)
  }

  clearSafeZones(): Observable<void> {
    return this._videoController.clearSafeZones();
  }

  getSafeZones(): VideoSafeZone[] {
    return this._videoController.getSafeZones();
  }

  formatToTimecode(time: number): string {
    return this._videoController.formatToTimecode(time);
  }

  getAudioTracks(): any[] {
    return this._videoController.getAudioTracks();
  }

  getBufferedTimespans(): BufferedTimespan[] {
    return this._videoController.getBufferedTimespans();
  }

  getActiveAudioTrack(): any {
    return this._videoController.getActiveAudioTrack();
  }

  getCurrentFrame(): number {
    return this._videoController.getCurrentFrame();
  }

  getCurrentTime(): number {
    return this._videoController.getCurrentTime();
  }

  getCurrentTimecode(): string {
    return this._videoController.getCurrentTimecode();
  }

  getDuration(): number {
    return this._videoController.getDuration();
  }

  getFrameRate(): number {
    return this._videoController.getFrameRate();
  }

  getHTMLVideoElement(): HTMLVideoElement {
    return this._videoController.getHTMLVideoElement();
  }

  getAudioContext(): AudioContext | undefined {
    return this._videoController.getAudioContext();
  }

  getMediaElementAudioSourceNode(): MediaElementAudioSourceNode | undefined {
    return this._videoController.getMediaElementAudioSourceNode();
  }

  getHelpMenuGroups(): HelpMenuGroup[] {
    return this._videoController.getHelpMenuGroups();
  }

  getHls(): Hls | undefined {
    return this._videoController.getHls();
  }

  getPlaybackRate(): number {
    return this._videoController.getPlaybackRate();
  }

  getPlaybackState(): PlaybackState | undefined {
    return this._videoController.getPlaybackState();
  }

  getTotalFrames(): number {
    return this._videoController.getTotalFrames();
  }

  getVideo(): Video | undefined {
    return this._videoController.getVideo();
  }

  getVideoLoadOptions(): VideoLoadOptions | undefined {
    return this._videoController.getVideoLoadOptions();
  }

  getVolume(): number {
    return this._videoController.getVolume();
  }

  isFullscreen(): boolean {
    return this._videoController.isFullscreen();
  }

  isMuted(): boolean {
    return this._videoController.isMuted();
  }

  isPaused(): boolean {
    return this._videoController.isPaused();
  }

  isPlaying(): boolean {
    return this._videoController.isPlaying();
  }

  isSeeking(): boolean {
    return this._videoController.isSeeking();
  }

  isVideoLoaded(): boolean {
    return this._videoController.isVideoLoaded();
  }

  loadVideoInternal(sourceUrl: string, frameRate: number | string, options: VideoLoadOptions | undefined, optionsInternal: VideoLoadOptionsInternal): Observable<Video> {
    return this._videoController.loadVideoInternal(sourceUrl, frameRate, options, optionsInternal);
  }

  loadVideo(sourceUrl: string, frameRate: number | string, options?: VideoLoadOptions): Observable<Video> {
    return this._videoController.loadVideo(sourceUrl, frameRate, options);
  }

  reloadVideo(): Observable<Video> {
    return this._videoController.reloadVideo();
  }

  mute(): Observable<void> {
    return this._videoController.mute()
  }

  parseTimecodeToFrame(timecode: string): number {
    return this._videoController.parseTimecodeToFrame(timecode);
  }

  parseTimecodeToTime(timecode: string): number {
    return this._videoController.parseTimecodeToTime(timecode);
  }

  pause(): Observable<void> {
    return this._videoController.pause();
  }

  play(): Observable<void> {
    return this._videoController.play();
  }

  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return this._videoController.prependHelpMenuGroup(helpMenuGroup)
  }

  clearHelpMenuGroups(): Observable<void> {
    return this._videoController.clearHelpMenuGroups()
  }

  removeSafeZone(id: string): Observable<void> {
    return this._videoController.removeSafeZone(id)
  }

  seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    return this._videoController.seekFromCurrentFrame(framesCount);
  }

  seekFromCurrentTime(timeAmount: number): Observable<boolean> {
    return this._videoController.seekFromCurrentTime(timeAmount);
  }

  seekNextFrame(): Observable<boolean> {
    return this._videoController.seekNextFrame();
  }

  seekPreviousFrame(): Observable<boolean> {
    return this._videoController.seekPreviousFrame();
  }

  seekToFrame(frame: number): Observable<boolean> {
    return this._videoController.seekToFrame(frame);
  }

  seekToPercent(percent: number): Observable<boolean> {
    return this._videoController.seekToPercent(percent);
  }

  seekToTime(time: number): Observable<boolean> {
    return this._videoController.seekToTime(time);
  }

  seekToTimecode(timecode: string): Observable<boolean> {
    return this._videoController.seekToTimecode(timecode);
  }

  setActiveAudioTrack(id: string): Observable<void> {
    return this._videoController.setActiveAudioTrack(id)
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return this._videoController.setPlaybackRate(playbackRate)
  }

  setVolume(volume: number): Observable<void> {
    return this._videoController.setVolume(volume)
  }

  toggleFullscreen(): Observable<void> {
    return this._videoController.toggleFullscreen();
  }

  toggleMuteUnmute(): Observable<void> {
    return this._videoController.toggleMuteUnmute()
  }

  togglePlayPause(): Observable<void> {
    return this._videoController.togglePlayPause();
  }

  unmute(): Observable<void> {
    return this._videoController.unmute()
  }

  getVideoWindowPlaybackState(): VideoWindowPlaybackState {
    return this._videoController.getVideoWindowPlaybackState();
  }

  isDetachVideoWindowEnabled(): boolean {
    return this._videoController.isDetachVideoWindowEnabled();
  }

  detachVideoWindow(): Observable<void> {
    return this._videoController.detachVideoWindow();
  }

  isAttachVideoWindowEnabled(): boolean {
    return true;
  }

  // sent to host
  attachVideoWindow(): Observable<void> {
    return passiveObservable(observer => {
      this._messageChannel!.sendAndObserveResponse('VideoControllerApi.attachVideoWindow').subscribe({
        next: (value) => {
          nextCompleteObserver(observer)
        }
      })
    })
  }

  createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack | undefined> {
    return this._videoController.createSubtitlesVttTrack(subtitlesVttTrack);
  }

  getActiveSubtitlesTrack(): SubtitlesVttTrack | undefined {
    return this._videoController.getActiveSubtitlesTrack();
  }

  getSubtitlesTracks(): SubtitlesVttTrack[] {
    return this._videoController.getSubtitlesTracks();
  }

  hideSubtitlesTrack(id: string): Observable<void> {
    return this._videoController.hideSubtitlesTrack(id);
  }

  removeAllSubtitlesTracks(): Observable<void> {
    return this._videoController.removeAllSubtitlesTracks();
  }

  removeSubtitlesTrack(id: string): Observable<void> {
    return this._videoController.removeSubtitlesTrack(id)
  }

  showSubtitlesTrack(id: string): Observable<void> {
    return this._videoController.showSubtitlesTrack(id);
  }

  // endregion
  createAudioContext(inputsNumber: number, outputsNumber?: number): Observable<void> {
    return this._videoController.createAudioContext(inputsNumber, outputsNumber);
  }

  createAudioContextWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<void> {
    return this._videoController.createAudioContextWithOutputsResolver(inputsNumber, outputsNumberResolver);
  }

  getAudioInputOutputNodes(): AudioInputOutputNode[][] {
    return this._videoController.getAudioInputOutputNodes();
  }

  routeAudioInputOutputNode(newAudioInputOutputNode: AudioInputOutputNode): Observable<void> {
    return this._videoController.routeAudioInputOutputNode(newAudioInputOutputNode);
  }

  routeAudioInputOutputNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void> {
    return this._videoController.routeAudioInputOutputNodes(newAudioInputOutputNodes);
  }

  getAudioPeakProcessorWorkletNode(): AudioWorkletNode | undefined {
    return this._videoController.getAudioPeakProcessorWorkletNode();
  }

  createAudioPeakProcessorWorkletNode(audioMeterStandard: AudioMeterStandard): Observable<void> {
    return this._videoController.createAudioPeakProcessorWorkletNode(audioMeterStandard);
  }

  getThumbnailVttUrl(): string | undefined {
      return this._videoController.getThumbnailVttUrl();
  }

  loadThumbnailVttUrl(thumbnailVttUrl: string): Observable<void> {
      return this._videoController.loadThumbnailVttUrl(thumbnailVttUrl);
  }


}
