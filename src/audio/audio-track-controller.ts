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

import {type AudioState} from '../media';
import {
  BaseTrackController,
  type TrackController,
  type TrackControllerEvent,
  TrackControllerEventType
} from '../player/track-controller';
import {MediaElementPlayback} from '../common/media-element-playback';
import {
  BehaviorSubject,
  combineLatest,
  filter,
  from,
  fromEvent,
  mergeMap,
  Observable,
  sampleTime,
  Subject,
  take,
  takeUntil,
  timer
} from 'rxjs';
import {BrowserProvider} from '../common/browser-provider';
import {OpStageStatus} from '../common/op-stage';
import {type PlayerController, PlayerControllerEventType} from '../player';
import {MediaMetadataResolver} from '../tools';
import {SourceUtil, UrlSource} from '../source';
import {errorCompleteObserver, freeObserver, nextCompleteObserver} from '../util/rxjs-util';
import type {MediaMetadata} from '../tools/media-metadata-resolver';
import {CryptoUtil} from '../util/crypto-util';
import {isNullOrUndefined} from '../util/util-functions';
import {ObserverBreaker} from '../common/observer-breaker';
import {
  AudioHandlerEventType,
  DebugPlayerAudioHandler,
  GainPlayerAudioHandler,
  MediaElementPlayerAudioHandler,
  type PlayerAudioHandlerApi
} from './audio-handler';
import {AuthConfig} from '../common';
import {httpGetArrayBuffer} from '../http';
import {AUDIO_DEFAULTS} from '../constants';
import {DomElementEventType} from '../dom/dom-element';
import {DomAudioElement, HTMLMediaElementEvent} from '../dom/dom-media-element';
import {OmakaseAudioContextProvider} from '../omakase-audio-context-provider';

const audioDriftHistoryMaxLength = 15;

export interface AudioTrackController extends TrackController<TrackControllerEvent> {
  onBufferingRequired$: Observable<boolean>;

  handler: PlayerAudioHandlerApi;
}

export abstract class BaseAudioTrackController extends BaseTrackController<AudioState, TrackControllerEvent> implements AudioTrackController {
  protected readonly _onBufferingRequired$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  protected _playerController: PlayerController;

  protected _mediaElementPlayback: MediaElementPlayback;
  protected _channelsNumber: number = 0;

  protected constructor(trackState: AudioState, playerController: PlayerController) {
    super(trackState);

    this._playerController = playerController;
    this._mediaElementPlayback = new MediaElementPlayback();
  }

  protected abstract getHandler(): PlayerAudioHandlerApi;

  protected abstract audioPlay(): void;

  protected abstract audioPause(): void;

  get handler(): PlayerAudioHandlerApi {
    return this.getHandler();
  }

  get onBufferingRequired$(): Observable<boolean> {
    return this._onBufferingRequired$.asObservable();
  }

  protected isPlayerPlaying(): boolean {
    let state = this._playerController.mediaElementPlayback!.state;
    return state.playing && !(state.waiting || state.buffering || state.ended || state.seeking || state.pausing);
  }

  protected isLoaded(): boolean {
    return this._loadStage.state.status === OpStageStatus.SUCCESS;
  }

  protected isEnabled(): boolean {
    return this.getHandler().enabled;
  }

  protected isPlaying(): boolean {
    return this._mediaElementPlayback.playing;
  }

  protected playOrPause() {
    if (this.isLoaded() && this.isEnabled()) {
      if (this.isPlayerPlaying()) {
        this.audioPlay();
      } else {
        this.audioPause();
      }
    } else {
      this.audioPause();
    }
  }

  destroy() {
    super.destroy();

    try {
      this.audioPause();
    } catch (error) {
      console.debug(error);
    } finally {
    }
  }
}

export class MediaElementAudioTrackController extends BaseAudioTrackController {
  protected _domAudioElement: DomAudioElement;
  protected _playerAudioHandler: PlayerAudioHandlerApi;

  protected _audioDriftHistory: number[] = [];
  protected _isBrowserFirefox = BrowserProvider.instance.isFirefox;

  constructor(trackState: AudioState, playerController: PlayerController) {
    super(trackState, playerController);

    this._domAudioElement = new DomAudioElement({
      crossOrigin: 'anonymous',
    });

    this._playerAudioHandler = new MediaElementPlayerAudioHandler(CryptoUtil.uuid(), this._domAudioElement.htmlElement);
    this._playerAudioHandler.setEnabled(false); // initially disabled, will be enabled depending on PlayerAudioMode in switchTrack method

    this.initEventHandlers();
  }

  protected getHandler(): PlayerAudioHandlerApi {
    return this._playerAudioHandler;
  }

  protected initEventHandlers() {
    let createEnabledFilter = <T>() => {
      return filter<T>(() => this.isEnabled());
    };

    let createLoadedFilter = <T>() => {
      return filter<T>(() => this.isLoaded());
    };

    let createIsPlayingFilter = <T>() => {
      return filter<T>(() => this.isPlaying());
    };

    this._playerAudioHandler.onEvent$
      .pipe(filter((p) => p.type === AudioHandlerEventType.AUDIO_HANDLER_CHANGE))
      .pipe(createLoadedFilter())
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.playOrPause();
      });

    this._onEvent$
      .pipe(createEnabledFilter())
      .pipe(createLoadedFilter())
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.playOrPause();
      });

    fromEvent(this._domAudioElement.htmlElement, HTMLMediaElementEvent.ENDED)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this._mediaElementPlayback.setEnded();
      });

    this._domAudioElement.onEvent$
      .pipe(filter((p) => p.type === DomElementEventType.DOM_ELEMENT_ERROR))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        console.debug(event.data.error);
      });

    this._playerController.onEvent$
      .pipe(createEnabledFilter())
      .pipe(createLoadedFilter())
      .pipe(
        filter((p) =>
          new Set([
            PlayerControllerEventType.PLAYER_CONTROLLER_PLAY,
            PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE,
            PlayerControllerEventType.PLAYER_CONTROLLER_ENDED,
            PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING,
            PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED,
            PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE,
            PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE,
          ]).has(p.type)
        )
      )
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        // console.log(this.getPlayerAudioHandler().id, event);
        switch (event.type) {
          case PlayerControllerEventType.PLAYER_CONTROLLER_PLAY:
            this.audioPlay();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE:
            this.audioPause();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_ENDED:
            this.audioPause();
            this._mediaElementPlayback.setEnded();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING:
            this.audioPause();
            this.seekToTime(event.data.toTime);
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED:
            this.playOrPause();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE:
            let mepState = event.data.mediaElementPlaybackState;
            if (mepState.playing && !mepState.waiting && !mepState.buffering && !mepState.ended && !mepState.seeking && !mepState.pausing) {
              this.audioPlay();
            }
            if (mepState.waiting || mepState.buffering || mepState.ended) {
              this.audioPause();
            }
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE:
            this._domAudioElement.htmlElement.playbackRate = event.data.playbackRate;
            break;
        }
      });

    let bufferPrecision = 2;
    let checkIsBuffering: () => boolean = () => {
      let currentTime = this._playerController.getCurrentTime();
      let isInDuration = currentTime <= this._domAudioElement.htmlElement.duration;
      if (this._isBrowserFirefox) {
        // Firefox defers visible updates to TimeRanges during steady playback unless something interesting happens ( seek / pause / resume), thus we check readyState instead of buffer
        let haveEnoughData = this._domAudioElement.htmlElement.readyState === this._domAudioElement.htmlElement.HAVE_ENOUGH_DATA;
        return isInDuration && !haveEnoughData;
      } else {
        let bufferedTimeRanges = this._domAudioElement.bufferedTimeRanges;
        let isBuffered = !!bufferedTimeRanges.find((p) => currentTime >= Number(p.start.toFixed(bufferPrecision)) && currentTime <= Number(p.end.toFixed(bufferPrecision)));
        return isInDuration && !isBuffered;
      }
    };

    let checkEnoughBuffered = () => {
      let isBuffering = checkIsBuffering();

      if (this._onBufferingRequired$.value !== isBuffering) {
        this._onBufferingRequired$.next(isBuffering);
      }
    };

    let enoughBufferedBreaker = new ObserverBreaker();
    this.onBufferingRequired$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        if (event) {
          // check periodically if audio got enough data to play
          timer(0, 200)
            .pipe(takeUntil(enoughBufferedBreaker.observer))
            .pipe(takeUntil(this._destroyBreaker.observer))
            .subscribe({
              next: () => {
                checkEnoughBuffered();
              },
            });
        } else {
          enoughBufferedBreaker.break();
        }
      },
    });

    this._playerController.onEvent$
      .pipe(createEnabledFilter())
      .pipe(createLoadedFilter())
      .pipe(createIsPlayingFilter())
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(sampleTime(1000)) // throttle
      .subscribe((event) => {
        checkEnoughBuffered();
      });

    this._playerController.onEvent$
      .pipe(createEnabledFilter())
      .pipe(createLoadedFilter())
      .pipe(createIsPlayingFilter())
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.checkAudioDriftAndTrySync(event.data.currentTime);
      });
  }

  loadSource(): Observable<void> {
    if (!this._trackState.source) {
      throw new Error('Track.source not set');
    }

    let url = SourceUtil.resolveUrlFromSourceState(this._trackState.source);

    return new Observable<void>((observer) => {
      this._loadStage.start();
      this._onEvent$.next({
        type: TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOADING,
        data: {},
      });

      let domElementLoaded$ = this._domAudioElement.onEvent$.pipe(filter((p) => p.type === DomElementEventType.DOM_ELEMENT_LOADED)).pipe(take(1));

      let mediaMetadata$ = new Subject<Pick<MediaMetadata, 'firstAudioTrackChannelsNumber'>>();

      combineLatest([domElementLoaded$, mediaMetadata$])
        .pipe(take(1))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: ([ompMediaElementLoadedEvent, mediaMetadata]) => {
            // set number of channels
            this._channelsNumber = mediaMetadata.firstAudioTrackChannelsNumber ? mediaMetadata.firstAudioTrackChannelsNumber : AUDIO_DEFAULTS.channels;

            // set number of channels to all audio nodes
            this._playerAudioHandler.outputAudioNode.channelCount = this._channelsNumber;
            this._playerAudioHandler.setChannelCount(this._channelsNumber);

            this._loadStage.success();
            this._onEvent$.next({
              type: TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOADED,
              data: {},
            });

            nextCompleteObserver(observer);
          },
          error: (error) => {
            this._loadStage.failure(error);
            this._onEvent$.next({
              type: TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOAD_ERROR,
              data: {
                error: error,
              },
            });
            errorCompleteObserver(observer, error);
          },
        });

      if (!isNullOrUndefined(this._trackState.channels)) {
        // console.debug(`Media metadata provided with track`, this._trackState);
        nextCompleteObserver(mediaMetadata$, {
          firstAudioTrackChannelsNumber: this._trackState.channels,
        });
      } else {
        MediaMetadataResolver.getMediaMetadata(url, ['firstAudioTrackChannelsNumber']).subscribe({
          next: (mediaMetadata) => {
            // console.debug(`Media metadata`, mediaMetadata);
            nextCompleteObserver(mediaMetadata$, mediaMetadata);
          },
        });
      }

      this._domAudioElement.loadSource(UrlSource.of(url)).subscribe();
    });
  }

  protected checkAudioDriftAndTrySync(currentTime: number) {
    let mainMediaMediaElementPlayback = this._playerController.mediaElementPlayback;

    if (
      mainMediaMediaElementPlayback &&
      mainMediaMediaElementPlayback.playing &&
      !mainMediaMediaElementPlayback.seeking &&
      !mainMediaMediaElementPlayback.waiting &&
      !mainMediaMediaElementPlayback.ended &&
      !mainMediaMediaElementPlayback.buffering
    ) {
      let drift = currentTime - this._domAudioElement.htmlElement.currentTime;

      // positive drift - video is in front of audio
      // negative drift - audio is in front of video

      this._audioDriftHistory.push(drift);
      if (this._audioDriftHistory.length > audioDriftHistoryMaxLength) {
        this._audioDriftHistory.shift();
      }

      if (this._audioDriftHistory.length === audioDriftHistoryMaxLength) {
        let averageDrift = this._audioDriftHistory.reduce((sum, val) => sum + val, 0) / this._audioDriftHistory.length;

        if (Math.abs(averageDrift) > AUDIO_DEFAULTS.sidecarAudioDriftCorrection) {
          console.debug(`Sidecar audio id=${this._trackState.id} correcting audio drift`, averageDrift);
          this.syncWithVideo();
        }
      }
    }
  }

  protected syncWithVideo() {
    this.seekToTime(this._playerController.getCurrentTime());
  }

  protected seekToTime(time: number) {
    this._audioDriftHistory = [];
    this._domAudioElement.htmlElement.currentTime = time;
  }

  protected fastSeekToTime(time: number) {
    this._audioDriftHistory = [];
    this._domAudioElement.htmlElement.fastSeek(time);
  }

  protected audioPlay() {
    if (this.isLoaded() && !this._mediaElementPlayback.playing) {
      this.syncWithVideo();
      this._domAudioElement.htmlElement.play().catch((e) => {
        // we'll just ignore play / pause interruptions
      });
      this._mediaElementPlayback.setPlaying();
      this.syncWithVideo();
    }
  }

  protected audioPause() {
    try {
      this._domAudioElement.htmlElement.pause();
      this._mediaElementPlayback.setPaused();
    } catch (e) {
      // nop
      console.debug(e);
    }
  }

  destroy() {
    super.destroy();

    freeObserver(this._onBufferingRequired$);

    this._domAudioElement.destroy();
    this._playerAudioHandler.destroy();
  }
}

export class AudioBufferAudioTrackController extends BaseAudioTrackController {
  protected _playerAudioHandler: PlayerAudioHandlerApi;

  protected _originalAudioBuffer: AudioBuffer | undefined;
  protected _audioBuffer: AudioBuffer | undefined;
  protected _audioBufferSourceNode: AudioBufferSourceNode | undefined;

  protected _audioStartTime?: number;
  protected _audioOffset?: number;

  constructor(trackState: AudioState, playerController: PlayerController) {
    super(trackState, playerController);

    this._playerAudioHandler = new GainPlayerAudioHandler(CryptoUtil.uuid());
    this._playerAudioHandler.setEnabled(false); // initially disabled, will be enabled depending on PlayerAudioMode in switchTrack method

    this.initEventHandlers();
  }

  protected initEventHandlers() {
    let createEnabledFilter = <T>() => {
      return filter<T>(() => this.isEnabled());
    };

    let createLoadedFilter = <T>() => {
      return filter<T>(() => this.isLoaded());
    };

    // watch audio handler changes and do play or pause
    this._playerAudioHandler.onEvent$
      .pipe(filter((p) => p.type === AudioHandlerEventType.AUDIO_HANDLER_CHANGE))
      .pipe(createLoadedFilter())
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.playOrPause();
      });
    
    this._onEvent$
      .pipe(createEnabledFilter())
      .pipe(createLoadedFilter())
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((_) => {
        this.playOrPause();
      });

    this._playerController.onEvent$
      .pipe(createEnabledFilter())
      .pipe(createLoadedFilter())
      .pipe(
        filter((p) =>
          new Set([
            PlayerControllerEventType.PLAYER_CONTROLLER_PLAY,
            PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE,
            PlayerControllerEventType.PLAYER_CONTROLLER_ENDED,
            PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING,
            PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED,
            PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE,
            PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE,
          ]).has(p.type)
        )
      )
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        // console.log(event);
        switch (event.type) {
          case PlayerControllerEventType.PLAYER_CONTROLLER_PLAY:
            this.audioPlay();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE:
            this.audioPause();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_ENDED:
            this.audioPause();
            this._mediaElementPlayback.setEnded();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING:
            this.audioPause();
            this.playOrPause();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED:
            this.playOrPause();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE:
            let mepState = event.data.mediaElementPlaybackState;
            if (mepState.playing && !mepState.waiting && !mepState.buffering && !mepState.ended && !mepState.seeking && !mepState.pausing) {
              this.audioPlay();
            }
            if (mepState.waiting || mepState.buffering || mepState.ended) {
              this.audioPause();
            }
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE:
            this.audioPause();
            this.playOrPause();
            break;
        }
      });
  }

  loadSource(): Observable<void> {
    if (!this._trackState.source) {
      throw new Error('Track.source not set');
    }

    let url = SourceUtil.resolveUrlFromSourceState(this._trackState.source);

    return new Observable<void>((observer) => {
      this._loadStage.start();
      this._onEvent$.next({
        type: TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOADING,
        data: {},
      });

      from(httpGetArrayBuffer(url, AuthConfig.createRequestInit(url, AuthConfig.authentication)))
        .pipe(mergeMap((buffer) => from(OmakaseAudioContextProvider.audioContext.decodeAudioData(buffer))))
        .subscribe({
          next: (audioBuffer) => {
            this._originalAudioBuffer = audioBuffer;
            this._audioBuffer = audioBuffer;

            // set number of channels
            this._channelsNumber = this._audioBuffer.numberOfChannels;
            this._playerAudioHandler.setChannelCount(this._channelsNumber);

            this._loadStage.success();
            this._onEvent$.next({
              type: TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOADED,
              data: {},
            });
            nextCompleteObserver(observer);
          },
          error: (error) => {
            this._loadStage.failure(error);
            this._onEvent$.next({
              type: TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOAD_ERROR,
              data: {
                error: error,
              },
            });
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  protected createSourceNode() {
    this._audioBufferSourceNode = OmakaseAudioContextProvider.audioContext.createBufferSource();
    this._audioBufferSourceNode.buffer = this._audioBuffer!;
    this._audioBufferSourceNode.connect(this._playerAudioHandler.inputAudioNode);
  }

  protected stopSourceNode() {
    if (this._audioBufferSourceNode) {
      try {
        this._audioBufferSourceNode.stop();
      } catch (e) {
        console.debug(e);
      }

      try {
        // In case any handlers were attached elsewhere.
        (this._audioBufferSourceNode as any).onended = null;
      } catch (e) {
        console.debug(e);
      }

      try {
        this._audioBufferSourceNode.disconnect();
      } catch (e) {
        console.debug(e);
      }
    }
  }

  protected audioPlay(): void {
    if (this.isLoaded() && !this._mediaElementPlayback.playing) {
      this.stopSourceNode();
      this.createSourceNode();

      this._audioStartTime = OmakaseAudioContextProvider.audioContext.currentTime;
      this._audioOffset = this._playerController.getCurrentTime();

      this._audioBufferSourceNode!.playbackRate.value = this._playerController.playbackRate;
      this._audioBufferSourceNode!.start(this._audioStartTime, this._audioOffset);

      this._mediaElementPlayback.setPlaying();
    }
  }

  protected audioPause(): void {
    if (this.isLoaded() && this._mediaElementPlayback.playing) {
      this.stopSourceNode();
      this._mediaElementPlayback.setPaused();
    }
  }

  protected getHandler(): PlayerAudioHandlerApi {
    return this._playerAudioHandler;
  }

  destroy() {
    this.stopSourceNode();

    this._audioBufferSourceNode = void 0;
    this._audioBuffer = void 0;
    this._originalAudioBuffer = void 0;

    super.destroy();
  }
}

export class DebugAudioTrackController extends BaseAudioTrackController {
  protected _playerAudioHandler: PlayerAudioHandlerApi;

  constructor(trackState: AudioState, playerController: PlayerController) {
    super(trackState, playerController);

    this._playerAudioHandler = new DebugPlayerAudioHandler(CryptoUtil.uuid());
    // this._playerAudioHandler.audioHandlerAdapter.setEnabled(false); // initially disabled, will be enabled depending on PlayerAudioMode in switchTrack method
  }

  loadSource(): Observable<void> {
    return new Observable<void>((observer) => {
      nextCompleteObserver(observer);
    });
  }

  protected audioPause(): void {
    console.debug(`DebugAudioTrackController.audioPause`);
  }

  protected audioPlay(): void {
    console.debug(`DebugAudioTrackController.audioPlay`);
  }

  protected getHandler(): PlayerAudioHandlerApi {
    return this._playerAudioHandler;
  }
}
