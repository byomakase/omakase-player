/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

import {Destroyable, OmpAudioTrack, SidecarAudioLoadedEvent, SidecarAudioLoadingEvent, VideoPlaybackRateEvent, VideoPlayEvent, VideoSeekedEvent, VideoTimeChangeEvent, VolumeChangeEvent} from '../types';
import {BehaviorSubject, combineLatest, filter, from, merge, mergeMap, Observable, sampleTime, Subject, take, takeUntil} from 'rxjs';
import {OmpAudioRouter} from './audio-router';
import {VideoController} from './video-controller';
import {completeUnsubscribeSubjects, errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {isNullOrUndefined} from '../util/object-util';
import {SidecarAudioApi} from '../api/sidecar-audio-api';
import {AudioRouterApi} from '../api/audio-router-api';
import {OmpAudioPeakProcessor} from './audio-peak-processor';
import {AudioMeterStandard, MediaElementPlaybackState, OmpSidecarAudioInputSoloMuteState, OmpSidecarAudioState} from './model';
import {MediaElementPlayback} from './media-element-playback';
import {OmpAudioElement} from '../media-element/omp-media-element';
import {httpGet} from '../http';
import {VideoControllerApi} from './video-controller-api';
import {AuthConfig} from '../common/authentication';
import {MediaMetadata, MediaMetadataResolver} from '../tools/media-metadata-resolver';

export abstract class BaseOmpSidecarAudio implements SidecarAudioApi, Destroyable {
  public readonly onLoading$: Subject<SidecarAudioLoadingEvent> = new Subject<SidecarAudioLoadingEvent>();
  public readonly onLoaded$: BehaviorSubject<SidecarAudioLoadedEvent | undefined> = new BehaviorSubject<SidecarAudioLoadedEvent | undefined>(void 0);
  public readonly onVideoCurrentTimeBuffering$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  public readonly onStateChange$: Subject<OmpSidecarAudioState> = new Subject<OmpSidecarAudioState>();
  public readonly onInputSoloMute$: Subject<OmpSidecarAudioInputSoloMuteState> = new Subject<OmpSidecarAudioInputSoloMuteState>();
  public readonly onVolumeChange$: Subject<VolumeChangeEvent> = new Subject<VolumeChangeEvent>();

  protected _videoController: VideoControllerApi;

  protected _mediaElementPlayback: MediaElementPlayback;

  protected _channelsNumber: number | undefined;

  protected _loaded: boolean = false;
  protected _audioTrack: OmpAudioTrack;

  protected _audioInputIfNode: GainNode;
  protected _audioRouter?: OmpAudioRouter;
  protected _audioPeakProcessor?: OmpAudioPeakProcessor;

  protected _muted = VideoController.videoMutedDefault;
  protected _volume = VideoController.videoVolumeDefault;

  protected _destroyed$ = new Subject<void>();

  protected constructor(videoController: VideoControllerApi, audioTrack: OmpAudioTrack) {
    this._videoController = videoController;
    this._audioTrack = audioTrack;

    this._mediaElementPlayback = new MediaElementPlayback();

    let audioContext = this._videoController.getAudioContext();
    let audioOutputNode = this._videoController.getSidecarAudiosOutputNode();

    this._audioInputIfNode = audioContext.createGain();
    this._audioInputIfNode.channelCountMode = 'max';

    this._audioInputIfNode.connect(audioOutputNode);
  }

  abstract loadSource(): Observable<SidecarAudioLoadedEvent>;

  protected abstract audioPause(): void;

  protected emitStateChange() {
    this.onStateChange$.next(this.getSidecarAudioState());
  }

  protected emitInputSoloMute() {
    this.onInputSoloMute$.next(this.getSidecarAudioInputSoloMuteState());
  }

  createAudioRouter(inputsNumber?: number, outputsNumber?: number): OmpAudioRouter {
    let audioContext = this._videoController.getAudioContext();
    let audioOutputNode = this._videoController.getSidecarAudiosOutputNode();

    if (this._audioRouter) {
      this._audioRouter.resetInputsSoloMuteState();
      console.debug(`Sidecar audio router already created for ${this.audioTrack.id}`);
      return this._audioRouter;
    } else {
      if (isNullOrUndefined(inputsNumber)) {
        // inputsNumber = this._audioBuffer.numberOfChannels;
      }

      if (isNullOrUndefined(outputsNumber)) {
        this._audioRouter = new OmpAudioRouter(audioContext, audioOutputNode, inputsNumber!);
      } else {
        this._audioRouter = new OmpAudioRouter(audioContext, audioOutputNode, inputsNumber!, (maxChannelCount: number) => outputsNumber!);
      }

      // rewire to router
      // in case of router deletion, we'll have to re-wire it back to destination
      this._audioInputIfNode.disconnect(audioOutputNode);

      this._audioInputIfNode.channelCount = inputsNumber!;

      this._audioRouter.connectSource(this._audioInputIfNode);

      this.emitStateChange();
      this.emitInputSoloMute();

      this._audioRouter.onChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        this.emitStateChange();
      });

      this._audioRouter.onInputSoloMute$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        this.emitInputSoloMute();
      });

      return this._audioRouter;
    }
  }

  createAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<OmpAudioPeakProcessor> {
    return passiveObservable((observer) => {
      if (this._audioPeakProcessor) {
        console.debug(`Sidecar audio peak processor already created for ${this.audioTrack.id}`);
        nextCompleteObserver(observer, this._audioPeakProcessor);
      } else {
        let audioContext = this._videoController.getAudioContext()!;
        this._audioPeakProcessor = new OmpAudioPeakProcessor(audioContext, audioMeterStandard);
        this._audioPeakProcessor.onAudioWorkletLoaded$.pipe(filter((p) => !!p)).subscribe({
          next: () => {
            this._audioPeakProcessor!.connectSource(this._audioInputIfNode);

            this.emitStateChange();
            nextCompleteObserver(observer, this._audioPeakProcessor);
          },
        });
      }
    });
  }

  protected validateLoaded() {
    if (!this._loaded) {
      throw new Error('Audio not loaded');
    }
  }

  get isActive(): boolean {
    return this._audioTrack.active;
  }

  activate() {
    this.setActiveInactive(true);
  }

  deactivate() {
    this.setActiveInactive(false);
  }

  getVolume(): number {
    return this._volume;
  }

  setVolume(volume: number): void {
    let oldVolume = this._volume;
    this._volume = volume;
    this._muted = false;
    this.updateAudioInputIfVolume();
    this.onVolumeChange$.next({
      oldVolume: oldVolume,
      volume: this.getVolume(),
      muted: this.isMuted(),
    });
    this.emitStateChange();
  }

  mute(): void {
    this.setMuted(true);
  }

  unmute() {
    this.setMuted(false);
  }

  isMuted(): boolean {
    return this._muted;
  }

  toggleMuteUnmute() {
    this.setMuted(!this._muted);
  }

  setMuted(muted: boolean = true): void {
    if (this._muted !== muted) {
      this._muted = muted;
      this.updateAudioInputIfVolume();
      this.onVolumeChange$.next({
        oldVolume: this.getVolume(),
        volume: this.getVolume(),
        muted: this.isMuted(),
      });
      this.emitStateChange();
    }
  }

  protected updateAudioInputIfVolume() {
    this._audioInputIfNode.gain.value = this._muted ? 0 : this._volume;
  }

  protected setActiveInactive(value: boolean): void {
    this._audioTrack.active = value;
    this.emitStateChange();
  }

  protected getChannelsNumber(): number {
    return this._channelsNumber ? this._channelsNumber : 0;
  }

  getSidecarAudioState(): OmpSidecarAudioState {
    return {
      active: this.isActive,
      loaded: this._loaded,
      audioTrack: this._audioTrack,
      audioRouterState: this.audioRouter?.getAudioRouterState(),
      audioPeakProcessorState: this.audioPeakProcessor?.getAudioPeakProcessorState(),
      numberOfChannels: this.getChannelsNumber(),
      volume: this.getVolume(),
      muted: this.isMuted(),
    };
  }

  getSidecarAudioInputSoloMuteState(): OmpSidecarAudioInputSoloMuteState {
    return {
      audioTrack: this._audioTrack,
      audioRouterInputSoloMuteState: this.audioRouter?.getAudioRouterInputSoloMuteState(),
    };
  }

  get audioTrack(): OmpAudioTrack {
    return this._audioTrack;
  }

  get audioRouter(): AudioRouterApi | undefined {
    return this._audioRouter;
  }

  get audioPeakProcessor(): OmpAudioPeakProcessor | undefined {
    return this._audioPeakProcessor;
  }

  destroy(): void {
    this.audioPause();

    this._audioInputIfNode.disconnect();

    if (this._audioRouter) {
      this._audioRouter.destroy();
    }

    if (this._audioPeakProcessor) {
      this._audioPeakProcessor.destroy();
    }

    completeUnsubscribeSubjects(this.onLoading$, this.onLoaded$, this.onVideoCurrentTimeBuffering$);
    completeUnsubscribeSubjects(this.onStateChange$, this.onInputSoloMute$, this.onVolumeChange$);

    nextCompleteSubject(this._destroyed$);
  }
}

export class OmpSidecarAudio extends BaseOmpSidecarAudio {
  static readonly audioDriftHistoryMaxLength = 15;
  static readonly audioDriftCorrectionThresholdInSeconds = 0.01;

  protected _mediaElementAudioSourceNode?: MediaElementAudioSourceNode;
  protected _ompAudioElement: OmpAudioElement;

  protected _audioDriftHistory: number[] = [];

  constructor(videoController: VideoControllerApi, audioTrack: OmpAudioTrack) {
    super(videoController, audioTrack);

    this._ompAudioElement = new OmpAudioElement({
      crossOrigin: 'anonymous',
    });

    this.initEventHandlers();
  }

  protected initEventHandlers() {
    let createAttachedModeFilter = <T>() => {
      return filter<T>(() => this._videoController.getVideoWindowPlaybackState() === 'attached');
    };

    let createActiveFilter = <T>() => {
      return filter<T>(() => this.isActive);
    };

    let playOrPause = () => {
      if (this.isActive) {
        if (this._videoController.isPlaying()) {
          if (!this.isPlaying()) {
            this.audioPlay();
          }
        } else {
          this.audioPause();
        }
      } else {
        this.audioPause();
      }
    };

    merge(this.onStateChange$)
      .pipe(createAttachedModeFilter<any>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          playOrPause();
        },
      });

    this._videoController.onVideoWindowPlaybackStateChange$
      .pipe(filter((p) => p.videoWindowPlaybackState === 'detaching' || p.videoWindowPlaybackState === 'attaching'))
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.audioPause();
        },
      });

    this._videoController.onPlay$
      .pipe(createAttachedModeFilter<VideoPlayEvent>())
      .pipe(createActiveFilter<VideoPlayEvent>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.audioPlay();
        },
      });

    merge(this._videoController.onPause$, this._videoController.onEnded$, this._videoController.onSeeking$)
      .pipe(createAttachedModeFilter<any>())
      .pipe(createActiveFilter<any>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.audioPause();
        },
      });

    this._videoController.onSeeked$
      .pipe(createAttachedModeFilter<VideoSeekedEvent>())
      .pipe(createActiveFilter<VideoSeekedEvent>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          playOrPause();
        },
      });

    this._videoController.onPlaybackState$
      .pipe(createAttachedModeFilter<MediaElementPlaybackState>())
      .pipe(createActiveFilter<MediaElementPlaybackState>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (state: MediaElementPlaybackState) => {
          if (state.playing && !state.waiting && !state.buffering && !state.ended && !state.seeking && !state.pausing) {
            this.audioPlay();
          }

          if (state.waiting || state.buffering || state.ended) {
            this.audioPause();
          }
        },
      });

    this._videoController.onPlaybackRateChange$
      .pipe(createAttachedModeFilter<VideoPlaybackRateEvent>())
      .pipe(createActiveFilter<VideoPlaybackRateEvent>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event: VideoPlaybackRateEvent) => {
          this._ompAudioElement.mediaElement.playbackRate = this._videoController.getPlaybackRate();
        },
      });

    let checkVideoCurrentTimeBuffering = (videoCurrentTime: number) => {
      let bufferedTimespans = this._ompAudioElement.getBufferedTimespans();

      let isInDuration = videoCurrentTime <= this._ompAudioElement.mediaElement.duration;
      let isBuffered = bufferedTimespans.find((p) => videoCurrentTime >= p.start && videoCurrentTime <= p.end);

      let isBuffering = isInDuration && !isBuffered;

      if (this.onVideoCurrentTimeBuffering$.value !== isBuffering) {
        this.onVideoCurrentTimeBuffering$.next(isBuffering);
      }
    };

    this._videoController.onVideoTimeChange$
      .pipe(createAttachedModeFilter<VideoTimeChangeEvent>())
      .pipe(createActiveFilter<VideoTimeChangeEvent>())
      .pipe(filter((p) => this._videoController.isPlaying()))
      .pipe(takeUntil(this._destroyed$))
      .pipe(sampleTime(500)) // throttle
      .subscribe({
        next: (event) => {
          checkVideoCurrentTimeBuffering(event.currentTime);
        },
      });

    this._videoController.onVideoTimeChange$
      .pipe(createAttachedModeFilter<VideoTimeChangeEvent>())
      .pipe(createActiveFilter<VideoTimeChangeEvent>())
      .pipe(filter((p) => this._videoController.isPlaying()))
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.checkAudioDriftAndTrySync();
        },
      });

    this._ompAudioElement.onError$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        console.debug(event.error);
      },
    });

    playOrPause();
  }

  loadSource(): Observable<SidecarAudioLoadedEvent> {
    this._loaded = false;

    return passiveObservable<SidecarAudioLoadedEvent>((observer) => {
      // initial track activation
      this.setActiveInactive(this._audioTrack.active);

      let mediaMetadata$ = new Subject<MediaMetadata>();

      MediaMetadataResolver.getMediaMetadata(this._audioTrack.src, ['firstAudioTrackChannelsNumber']).subscribe({
        next: (mediaMetadata: MediaMetadata) => {
          console.debug(`Media metadata`, mediaMetadata);
          nextCompleteSubject(mediaMetadata$, mediaMetadata);
        },
      });

      combineLatest([this._ompAudioElement.onLoaded$.pipe(filter((p) => !!p)), mediaMetadata$])
        .pipe(takeUntil(this._destroyed$))
        .pipe(take(1))
        .subscribe({
          next: ([ompMediaElementLoadedEvent, mediaMetadata]) => {
            this._mediaElementAudioSourceNode = this._videoController.getAudioContext().createMediaElementSource(this._ompAudioElement.mediaElement);
            this._mediaElementAudioSourceNode.channelCountMode = 'max';

            // connect to audio chain
            this._mediaElementAudioSourceNode.connect(this._audioInputIfNode);

            // set number of channels
            this._channelsNumber = mediaMetadata.firstAudioTrackChannelsNumber ? mediaMetadata.firstAudioTrackChannelsNumber : 2;

            // set number of channels to all audio nodes
            this._mediaElementAudioSourceNode.channelCount = this.getChannelsNumber();
            this._audioInputIfNode.channelCount = this.getChannelsNumber();
            this._audioTrack.channelCount = this.getChannelsNumber();

            this._loaded = true;

            let event: SidecarAudioLoadedEvent = {
              sidecarAudioState: this.getSidecarAudioState(),
            };
            this.onLoaded$.next(event);
            nextCompleteObserver(observer, event);
          },
          error: (error) => {
            this.onLoaded$.error(error);
            errorCompleteObserver(observer, error);
          },
        });

      this._ompAudioElement.loadSource(this._audioTrack.src);
    });
  }

  protected getCurrentTime(): number {
    return this._loaded ? this._ompAudioElement.mediaElement.currentTime : 0;
  }

  protected getDuration(): number {
    this.validateLoaded();
    return this._ompAudioElement.mediaElement.duration;
  }

  protected isPlaying() {
    return (
      this._loaded &&
      this.getCurrentTime() > 0 &&
      this.getCurrentTime() < this.getDuration() &&
      this._ompAudioElement.mediaElement &&
      !this._ompAudioElement.mediaElement.paused &&
      !this._ompAudioElement.mediaElement.ended &&
      this._ompAudioElement.mediaElement.readyState > this._ompAudioElement.mediaElement.HAVE_CURRENT_DATA
    );
  }

  protected checkAudioDriftAndTrySync() {
    if (this._videoController.isPlaying()) {
      let drift = this._videoController.getCurrentTime() - this._ompAudioElement.mediaElement.currentTime;

      // positive drift - video is in front of audio
      // negative drift - audio is in front of video

      this._audioDriftHistory.push(drift);
      if (this._audioDriftHistory.length > OmpSidecarAudio.audioDriftHistoryMaxLength) {
        this._audioDriftHistory.shift();
      }

      if (this._audioDriftHistory.length === OmpSidecarAudio.audioDriftHistoryMaxLength) {
        let averageDrift = this._audioDriftHistory.reduce((sum, val) => sum + val, 0) / this._audioDriftHistory.length;

        if (Math.abs(averageDrift) > OmpSidecarAudio.audioDriftCorrectionThresholdInSeconds) {
          // console.debug(`Correcting audio drift`, averageDrift);
          this.syncWithVideo();
        }
      }
    }
  }

  protected syncWithVideo() {
    this._ompAudioElement.mediaElement.currentTime = this._videoController.getCurrentTime();
    this._audioDriftHistory = [];
  }

  protected audioPlay() {
    this.syncWithVideo();
    if (this._loaded && !this.isPlaying()) {
      this._ompAudioElement.mediaElement
        .play()
        .then(() => {
          this.syncWithVideo();
          this._mediaElementPlayback.setPlaying();
        })
        .catch((error) => {
          // nop
        });
    }
  }

  protected audioPause() {
    try {
      this._ompAudioElement.mediaElement.pause();
      this._mediaElementPlayback.setPaused();
    } catch (e) {
      // nop
      console.debug(e);
    }
    this.syncWithVideo();
  }

  override destroy() {
    super.destroy();

    this._ompAudioElement.destroy();
  }
}

export class OmpSidecarBufferedAudio extends BaseOmpSidecarAudio {
  protected _originalAudioBuffer?: AudioBuffer;
  protected _audioBuffer?: AudioBuffer;
  protected _audioBufferSourceNode?: AudioBufferSourceNode;

  protected _audioStartTime?: number;
  protected _audioOffset?: number;
  protected _isPlaying = false;

  constructor(videoController: VideoControllerApi, audioTrack: OmpAudioTrack) {
    super(videoController, audioTrack);

    this.initEventHandlers();
  }

  protected initEventHandlers() {
    let createAttachedModeFilter = <T>() => {
      return filter<T>(() => this._videoController.getVideoWindowPlaybackState() === 'attached');
    };

    let createActiveFilter = <T>() => {
      return filter<T>(() => this.isActive);
    };

    let createLoadedFilter = <T>() => {
      return filter<T>(() => this._loaded);
    };

    let playOrPause = () => {
      if (this.isActive) {
        if (this._videoController.isPlaying()) {
          this.audioPlay();
        } else {
          this.audioPause();
        }
      } else {
        this.audioPause();
      }
    };

    merge(this.onStateChange$)
      .pipe(createAttachedModeFilter<any>())
      .pipe(createLoadedFilter<any>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          playOrPause();
        },
      });

    this._videoController.onVideoWindowPlaybackStateChange$
      .pipe(filter((p) => p.videoWindowPlaybackState === 'detaching' || p.videoWindowPlaybackState === 'attaching'))
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.audioPause();
        },
      });

    this._videoController.onPlay$
      .pipe(createAttachedModeFilter<VideoPlayEvent>())
      .pipe(createActiveFilter<VideoPlayEvent>())
      .pipe(createLoadedFilter<VideoPlayEvent>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.audioPlay();
        },
      });

    merge(this._videoController.onPause$, this._videoController.onEnded$, this._videoController.onSeeking$)
      .pipe(createAttachedModeFilter<any>())
      .pipe(createActiveFilter<any>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.audioPause();
        },
      });

    this._videoController.onSeeked$
      .pipe(createAttachedModeFilter<VideoSeekedEvent>())
      .pipe(createActiveFilter<VideoSeekedEvent>())
      .pipe(createLoadedFilter<VideoSeekedEvent>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          playOrPause();
        },
      });

    this._videoController.onPlaybackState$
      .pipe(createAttachedModeFilter<MediaElementPlaybackState>())
      .pipe(createActiveFilter<MediaElementPlaybackState>())
      .pipe(createLoadedFilter<MediaElementPlaybackState>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (state: MediaElementPlaybackState) => {
          if (state.playing && !state.waiting && !state.buffering && !state.ended && !state.seeking && !state.pausing) {
            this.audioPlay();
          }

          if (state.waiting || state.buffering || state.ended) {
            this.audioPause();
          }
        },
      });

    this._videoController.onPlaybackRateChange$
      .pipe(createAttachedModeFilter<VideoPlaybackRateEvent>())
      .pipe(createActiveFilter<VideoPlaybackRateEvent>())
      .pipe(createLoadedFilter<VideoPlaybackRateEvent>())
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event: VideoPlaybackRateEvent) => {
          this.audioPause();
          playOrPause();
        },
      });

    this.onLoaded$.pipe(filter((p) => !!p)).subscribe({
      next: () => {
        playOrPause();
      },
    });
  }

  loadSource(): Observable<SidecarAudioLoadedEvent> {
    return passiveObservable<SidecarAudioLoadedEvent>((observer) => {
      from(
        httpGet<ArrayBuffer>(this._audioTrack.src, {
          ...AuthConfig.createAxiosRequestConfig(this._audioTrack.src, AuthConfig.authentication),
          responseType: 'arraybuffer',
        })
      )
        .pipe(mergeMap((response) => from(this._videoController.getAudioContext().decodeAudioData(response.data as ArrayBuffer))))
        .subscribe({
          next: (audioBuffer) => {
            this._originalAudioBuffer = audioBuffer;
            this._audioBuffer = audioBuffer;

            // set number of channels
            this._channelsNumber = this._audioBuffer.numberOfChannels;

            // set number of channels to all audio nodes
            this._audioInputIfNode.channelCount = this.getChannelsNumber();
            this._audioTrack.channelCount = this.getChannelsNumber();

            this._loaded = true;

            let event: SidecarAudioLoadedEvent = {
              sidecarAudioState: this.getSidecarAudioState(),
            };
            this.onLoaded$.next(event);
            nextCompleteObserver(observer, event);
          },
          error: (error) => {
            this.onLoaded$.error(error);
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  protected createSourceNode() {
    this._audioBufferSourceNode = this._videoController.getAudioContext().createBufferSource();
    this._audioBufferSourceNode.buffer = this._audioBuffer!;
    this._audioBufferSourceNode.connect(this._audioInputIfNode);
  }

  protected stopSourceNode() {
    if (this._audioBufferSourceNode) {
      try {
        this._audioBufferSourceNode.stop();
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

  protected audioPlay() {
    if (this._loaded && !this._isPlaying) {
      this.stopSourceNode();
      this.createSourceNode();

      this._audioStartTime = this._videoController.getAudioContext().currentTime;
      this._audioOffset = this._videoController.getCurrentTime();

      this._audioBufferSourceNode!.playbackRate.value = this._videoController.getPlaybackRate();
      this._audioBufferSourceNode!.start(this._audioStartTime, this._audioOffset);

      this._isPlaying = true;
    }
  }

  protected audioPause(): void {
    if (this._loaded && this._isPlaying) {
      this.stopSourceNode();
      this._isPlaying = false;
    }
  }
}
