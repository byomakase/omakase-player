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
import Decimal from 'decimal.js';
import {
  AudioContextChangeEvent,
  AudioLoadedEvent,
  AudioPeakProcessorWorkletNodeMessageEvent,
  AudioRoutingEvent,
  AudioSwitchedEvent,
  AudioWorkletNodeCreatedEvent,
  HelpMenuGroup,
  OmakaseAudioTrack,
  OmpError,
  OmpNamedEvent,
  OmpNamedEvents,
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
  VideoWindowPlaybackStateChangeEvent,
} from '../types';
import {BehaviorSubject, delay, filter, forkJoin, fromEvent, interval, map, merge, Observable, of, Subject, switchMap, take, takeUntil, throwError, timeout} from 'rxjs';
import {FrameRateUtil} from '../util/frame-rate-util';
import {completeSubject, completeSubjects, completeUnsubscribeSubjects, errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {z} from 'zod';
import {TimecodeUtil} from '../util/timecode-util';
import Hls, {HlsConfig} from 'hls.js';
import {Validators} from '../validators';
import {parseErrorMessage, zodErrorMapOverload} from '../util/error-util';
import {VideoControllerApi} from './video-controller-api';
import {destroyer, nullifier} from '../util/destroy-util';
import {
  AudioInputOutputNode,
  AudioMeterStandard,
  BufferedTimespan,
  PlaybackState,
  PlaybackStateMachine,
  Video,
  VideoLoadOptions,
  VideoLoadOptionsInternal,
  VideoSafeZone,
  VideoWindowPlaybackState,
} from './model';
import {isNullOrUndefined} from '../util/object-util';
import {StringUtil} from '../util/string-util';
import {VideoDomControllerApi} from './video-dom-controller-api';
import {AudioUtil} from '../util/audio-util';
import {BlobUtil} from '../util/blob-util';
// @ts-ignore
import blackMp4Base64 from '../../assets/black.mp4.base64.txt?raw';
// import workers for audio processing
// @ts-ignore
import peakSampleProcessor from '../worker/omp-peak-sample-processor.js?raw';
// @ts-ignore
import truePeakProcessor from '../worker/omp-true-peak-processor.js?raw';
import {VideoLoader} from './video-loader';
import {VideoHlsLoader} from './video-hls-loader';
import {VideoNativeLoader} from './video-native-loader';

export const HTMLVideoElementEventKeys = {
  PAUSE: 'pause',
  WAITING: 'waiting',
  PLAYING: 'playing',
  TIMEUPDATE: 'timeupdate',
  SEEKING: 'seeking',
  SEEKED: 'seeked',
  LOAD: 'load',
  LOADEDDATA: 'loadeddata',
  LOADEDMETEDATA: 'loadedmetadata',
  ENDED: 'ended',
  PROGRESS: 'progress',
  VOLUMECHANGE: 'volumechange',
  RATECHANGE: 'ratechange',
  ENTERPIP: 'enterpictureinpicture',
  LEAVEPIP: 'leavepictureinpicture',
};

export interface VideoControllerConfig {
  frameDurationSpillOverCorrection: number;
  hlsConfig: Partial<HlsConfig>;
  hlsFetchManifestSubtitleTracks: boolean;
  hlsSubtitleDisplay: boolean;
}

export const VIDEO_CONTROLLER_CONFIG_DEFAULT: VideoControllerConfig = {
  frameDurationSpillOverCorrection: 0.001,
  hlsConfig: {
    ...Hls.DefaultConfig,
  },
  hlsFetchManifestSubtitleTracks: true,
  hlsSubtitleDisplay: false,
};

interface VideoFrameCallbackData {
  now: DOMHighResTimeStamp;
  metadata: VideoFrameCallbackMetadata;
}

export type SeekDirection = 'bw' | 'fw' | 'o';

interface SyncConditions {
  seekToFrame?: number;
  seekToTime?: number;
  currentTime?: number;
  videoFrameCallbackData?: VideoFrameCallbackData;
  seekDirection?: SeekDirection;
  newTimecode?: string;
}

const defaultAudioOutputsResolver: (maxChannelCount: number) => number = (maxChannelCount: number) => {
  if (maxChannelCount <= 1) {
    return 1;
  } else if (maxChannelCount >= 2 && maxChannelCount <= 5) {
    return 2;
  } else if (maxChannelCount >= 6) {
    return 6;
  } else {
    return maxChannelCount;
  }
};

export class VideoController implements VideoControllerApi {
  public readonly onVideoLoaded$: BehaviorSubject<VideoLoadedEvent | undefined> = new BehaviorSubject<VideoLoadedEvent | undefined>(void 0);
  public readonly onVideoLoading$: Subject<VideoLoadingEvent> = new Subject<VideoLoadingEvent>();

  public readonly onPlay$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onPause$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onVideoTimeChange$: Subject<VideoTimeChangeEvent> = new Subject<VideoTimeChangeEvent>();
  public readonly onSeeking$: Subject<VideoSeekingEvent> = new Subject<VideoSeekingEvent>();
  public readonly onSeeked$: Subject<VideoSeekedEvent> = new Subject<VideoSeekedEvent>();
  public readonly onBuffering$: Subject<VideoBufferingEvent> = new Subject<VideoBufferingEvent>();
  public readonly onEnded$: Subject<VideoEndedEvent> = new Subject<VideoEndedEvent>();
  public readonly onVideoError$: Subject<VideoErrorEvent> = new Subject<VideoErrorEvent>();
  public readonly onVolumeChange$: Subject<VideoVolumeEvent> = new Subject<VideoVolumeEvent>();
  public readonly onFullscreenChange$: Subject<VideoFullscreenChangeEvent> = new Subject<VideoFullscreenChangeEvent>();
  public readonly onVideoSafeZoneChange$: Subject<VideoSafeZoneChangeEvent> = new Subject<VideoSafeZoneChangeEvent>();
  public readonly onVideoWindowPlaybackStateChange$: Subject<VideoWindowPlaybackStateChangeEvent> = new Subject<VideoWindowPlaybackStateChangeEvent>();

  public readonly onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined> = new BehaviorSubject<AudioLoadedEvent | undefined>(void 0);
  public readonly onAudioSwitched$: Subject<AudioSwitchedEvent> = new Subject<AudioSwitchedEvent>();
  public readonly onAudioContextChange$: Subject<AudioContextChangeEvent> = new Subject<AudioContextChangeEvent>();
  public readonly onAudioRouting$: Subject<AudioRoutingEvent> = new Subject<AudioRoutingEvent>();
  public readonly onAudioPeakProcessorWorkletNodeMessage$: Subject<AudioPeakProcessorWorkletNodeMessageEvent> = new Subject<AudioPeakProcessorWorkletNodeMessageEvent>();
  public readonly onAudioWorkletNodeCreated$: BehaviorSubject<AudioWorkletNodeCreatedEvent | undefined> = new BehaviorSubject<AudioWorkletNodeCreatedEvent | undefined>(void 0);

  public readonly onHelpMenuChange$: Subject<VideoHelpMenuChangeEvent> = new Subject<VideoHelpMenuChangeEvent>();
  public readonly onPlaybackState$: Subject<PlaybackState> = new Subject<PlaybackState>();
  public readonly onPlaybackRateChange$: Subject<VideoPlaybackRateEvent> = new Subject<VideoPlaybackRateEvent>();
  public readonly onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined> = new BehaviorSubject<SubtitlesLoadedEvent | undefined>(void 0);
  public readonly onSubtitlesCreate$: Subject<SubtitlesCreateEvent> = new Subject<SubtitlesCreateEvent>();
  public readonly onSubtitlesRemove$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onSubtitlesShow$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onSubtitlesHide$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();

  public readonly onThumbnailVttUrlChanged$: Subject<ThumnbailVttUrlChangedEvent> = new Subject<ThumnbailVttUrlChangedEvent>();

  // VideoHlsLoader specific
  public readonly onActiveNamedEventStreamsChange$: Subject<OmpNamedEvents[]> = new Subject<OmpNamedEvents[]>();
  public readonly onNamedEvent$: Subject<OmpNamedEvent> = new Subject<OmpNamedEvent>();

  protected readonly _config: VideoControllerConfig;
  protected readonly _videoDomController: VideoDomControllerApi;
  /**
   * Stream of data provided by videoElement.requestVideoFrameCallback()
   * @protected
   */
  protected readonly _videoFrameCallback$: Subject<VideoFrameCallbackData | undefined> = new BehaviorSubject<VideoFrameCallbackData | undefined>(void 0);
  protected readonly _animationFrameCallback$: Subject<number | undefined> = new BehaviorSubject<number | undefined>(void 0);

  protected _videoLoader?: VideoLoader;
  protected _video?: Video;
  protected _videoLoadOptions?: VideoLoadOptions;
  protected _playbackStateMachine?: PlaybackStateMachine;
  protected _syncStepCurrentTimeMediaTime: number = 0;
  protected _syncFineFrameTolerancePercent = 20;
  protected _syncLoopMaxIterations = 5;
  protected _videoFrameCallbackHandle?: number;

  protected _videoStalledCheckIntervalMs = 700;
  protected _videoStalledCheckLastCurrentTime?: number;
  protected _videoPausedSeekBufferingThresholdMs = 500;

  protected _requestAnimationFrameId?: number;

  protected _activeNamedEventStreams: OmpNamedEvents[] = [];

  protected _subtitlesTracks: Map<string, SubtitlesVttTrack> = new Map<string, SubtitlesVttTrack>();
  protected _activeSubtitlesTrack?: SubtitlesVttTrack;

  protected _audioTracks: Map<string, OmakaseAudioTrack> = new Map<string, OmakaseAudioTrack>();
  protected _activeAudioTrack?: OmakaseAudioTrack;

  protected _audioContext?: AudioContext;
  protected _mediaElementAudioSource?: MediaElementAudioSourceNode;
  protected _audioChannelSplitterNode?: ChannelSplitterNode;
  protected _audioChannelMergerNode?: ChannelMergerNode;
  protected _audioInputsNumber?: number;
  protected _audioOutputsNumber?: number;
  /**
   * Mapped by inputNumber, then by outputNumber
   * @protected
   */
  protected _audioInputOutputNodes: Map<number, Map<number, AudioInputOutputNode>> = new Map<number, Map<number, AudioInputOutputNode>>();
  protected _audioPeakProcessorWorkletNode?: AudioWorkletNode;

  protected _thumbnailVttUrl?: string;

  protected _helpMenuGroups: HelpMenuGroup[] = [];

  protected _videoEventBreaker$ = new Subject<void>();

  /**
   * Cancels previous unfinished seek operation if ie. new seek is requested
   * @protected
   */
  protected _seekBreaker$ = new Subject<void>();

  /**
   * Cancels previous unfinished pause operation
   * @protected
   */
  protected _pausingBreaker$ = new Subject<void>();

  protected _blackMp4Url: string;

  protected _destroyed$ = new Subject<void>();

  constructor(config: Partial<VideoControllerConfig>, videoDomController: VideoDomControllerApi) {
    this._config = {
      ...VIDEO_CONTROLLER_CONFIG_DEFAULT,
      ...config,
    };
    this._videoDomController = videoDomController;

    this._blackMp4Url = `data:${'video/mp4'};base64,${blackMp4Base64}`;

    this._videoFrameCallback$.pipe(takeUntil(this._destroyed$)).subscribe((videoFrameCallbackData) => {
      if (videoFrameCallbackData) {
        if (!this._playbackStateMachine!.seeking) {
          if (this.isPlaying()) {
            this.dispatchVideoTimeChange();
          } else if (this.isPaused()) {
            // nop
          }
        }
      }
    });

    this._animationFrameCallback$.pipe(takeUntil(this._destroyed$)).subscribe((time) => {
      if (time) {
        if (!this._playbackStateMachine!.seeking) {
          if (this.isPlaying()) {
            this.dispatchVideoTimeChange();
          } else if (this.isPaused()) {
            // nop
          }
        }
      }
    });

    this.onPlay$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      if (this._video!.audioOnly && isNullOrUndefined(this._requestAnimationFrameId)) {
        this.startAnimationFrameLoop();
      }
    });

    merge(this.onPause$, this.onEnded$)
      .pipe(switchMap((value) => [value])) // each new emission switches to latest, racing observables
      .pipe(takeUntil(this._destroyed$))
      .subscribe(() => {
        if (this._video!.audioOnly) {
          this.stopAnimationFrameLoop();
        }
      });
  }

  loadVideoInternal(sourceUrl: string, frameRate: number | string, options: VideoLoadOptions | undefined, optionsInternal?: VideoLoadOptionsInternal): Observable<Video> {
    return passiveObservable<Video>((observer) => {
      try {
        nextCompleteSubject(this._videoEventBreaker$);
        this._videoEventBreaker$ = new Subject<void>();

        this._videoLoadOptions = options;

        if (this.videoElement && this._videoFrameCallbackHandle) {
          this.videoElement.cancelVideoFrameCallback(this._videoFrameCallbackHandle);
        }

        if (this.isVideoLoaded()) {
          // remove while video is still loaded
          this._removeAllSubtitlesTracks(false);

          this._video = void 0;
          this.onVideoLoaded$.next(void 0); // emit new value, BehaviourSubject

          this._audioTracks = new Map<string, OmakaseAudioTrack>();
          this._activeAudioTrack = void 0;
          this.onAudioLoaded$.next(void 0); // emit new value, BehaviourSubject

          // subtitles
          this._subtitlesTracks = new Map<string, SubtitlesVttTrack>();
          this._activeSubtitlesTrack = void 0;
          this.onSubtitlesLoaded$.next(void 0); // emit new value, BehaviourSubject
        }

        sourceUrl = Validators.url()(sourceUrl);

        frameRate = FrameRateUtil.resolveFrameRate(frameRate);

        if (options && !isNullOrUndefined(options.dropFrame)) {
          z.coerce.boolean().parse(options?.dropFrame, zodErrorMapOverload('Invalid dropFrame'));
        }
        let dropFrame = options && options.dropFrame !== void 0 ? options.dropFrame : false;

        if (dropFrame && !FrameRateUtil.isSupportedDropFrameRate(frameRate)) {
          throw new Error(`Frame rate not supported: ${frameRate}, drop frame: ${dropFrame}`);
        }

        if (!isNullOrUndefined(options?.duration)) {
          z.coerce.number().min(0).parse(options?.duration, zodErrorMapOverload('Invalid duration'));
        }

        this.onVideoLoading$.next({
          sourceUrl: sourceUrl,
          frameRate: frameRate,
          options: options,
          isAttaching: optionsInternal && optionsInternal.videoWindowPlaybackState === 'attaching',
          isDetaching: optionsInternal && optionsInternal.videoWindowPlaybackState === 'detaching',
        });

        let videoLoader = this.resolveAndAttachVideoLoader(sourceUrl, options);

        videoLoader
          .loadVideo(sourceUrl, frameRate as number, options)
          .pipe(take(1))
          .subscribe({
            next: (video) => {
              this._video = video;

              if (options && !StringUtil.isNullUndefinedOrWhitespace(options.ffom)) {
                let ffomTimecodeObject = TimecodeUtil.parseTimecodeToTimecodeObject(options.ffom!);
                if (ffomTimecodeObject.dropFrame !== dropFrame) {
                  throw new Error(`Incorrect FFOM format: ${options.ffom}, drop frame: ${dropFrame}`);
                }
                this._video.ffomTimecodeObject = ffomTimecodeObject;
              }

              // this._syncStepCurrentTimeMediaTime = 0;
              this._syncStepCurrentTimeMediaTime = Decimal.div(this._video.frameDuration, 10).toNumber();

              this._playbackStateMachine = new PlaybackStateMachine();

              this.initEventHandlers();
              this.startVideoFrameCallback();

              this.onVideoLoaded$.next({
                video: this._video,
                videoLoadOptions: this._videoLoadOptions,
                isAttaching: optionsInternal && optionsInternal.videoWindowPlaybackState === 'attaching',
                isDetaching: optionsInternal && optionsInternal.videoWindowPlaybackState === 'detaching',
              });

              this._videoDomController.setSafeZoneAspectRatio(`${this.videoElement.videoWidth} / ${this.videoElement.videoHeight}`);

              nextCompleteObserver(observer, video);
            },
            error: (error) => {
              return throwError(() => error);
            },
          });
      } catch (e) {
        this.onVideoError$.next({
          type: 'VIDEO_LOAD_ERROR',
          message: parseErrorMessage(e),
        });
        errorCompleteObserver(observer, e);
      }
    });
  }

  protected resolveAndAttachVideoLoader(sourceUrl: string, options: VideoLoadOptions | undefined): VideoLoader {
    if (this._videoLoader) {
      this._videoLoader.destroy();
    }

    if (options && options.protocol) {
      switch (options.protocol) {
        case 'hls':
          this._videoLoader = new VideoHlsLoader(this);
          break;
        case 'native':
          this._videoLoader = new VideoNativeLoader(this);
          break;
        default:
          throw new OmpError(`Unrecognized video protocol passed in VideoLoadOptions`);
      }
    } else {
      let normalizedUrl = sourceUrl.toLowerCase();
      let url = new URL(normalizedUrl);
      let pathname = url.pathname;

      if (pathname.endsWith('.m3u8')) {
        this._videoLoader = new VideoHlsLoader(this);
      } else if (pathname.endsWith('.mp4')) {
        this._videoLoader = new VideoNativeLoader(this);
      } else {
        throw new OmpError(`Unrecognized video protocol`);
      }
    }

    // audio
    this._videoLoader.onAudioLoaded$
      .pipe(
        filter((p) => !!p),
        takeUntil(this._videoEventBreaker$)
      )
      .subscribe({
        next: (event) => {
          this.setAudioTracks(event!.audioTracks);
          if (event!.activeAudioTrack) {
            this.updateActiveAudioTrack(event!.activeAudioTrack.id);
          }
        },
      });

    this._videoLoader.onAudioSwitched$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        this.updateActiveAudioTrack(event!.activeAudioTrack.id);
      },
    });

    // subtitles
    this._videoLoader.onSubtitlesLoaded$
      .pipe(
        filter((p) => !!p),
        takeUntil(this._videoEventBreaker$)
      )
      .subscribe({
        next: (event) => {
          this.setSubtitlesTracks(event!.tracks);
        },
      });

    // events
    this._videoLoader.onNamedEvent$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        this.onNamedEvent$.next(event);
      },
    });

    return this._videoLoader;
  }

  loadVideo(sourceUrl: string, frameRate: number | string, options?: VideoLoadOptions): Observable<Video> {
    return this.loadVideoInternal(sourceUrl, frameRate, options);
  }

  reloadVideo(): Observable<Video> {
    this.validateVideoLoaded();

    return this.loadVideo(this._video!.sourceUrl, this._video!.frameRate, this._videoLoadOptions);
  }

  get videoElement(): HTMLVideoElement {
    return this._videoDomController.getVideoElement();
  }

  protected initEventHandlers() {
    let latestSeekStartTime: number | undefined;

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PLAYING)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: () => {
          this.onPlay$.next({
            currentTime: this.getCurrentTime(),
            currentTimecode: this.getCurrentTimecode(),
          });
        },
      });

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PAUSE)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: () => {
          // PlaybackState.pausing can be either true (pause through API) or even false (pause initiated externally by browser with PIP close)
          // Thus, we will not inspect this._playbackStateMachine!.pausing
          let afterPauseSync = () => {
            console.debug(`%cpause control sync start`, 'color: purple');
            this._seekFromCurrentFrame(1)
              .pipe(takeUntil(this._pausingBreaker$), takeUntil(this._seekBreaker$), take(1))
              .subscribe({
                next: () => {
                  console.debug(`%cpause control sync end`, 'color: purple');
                  this.dispatchVideoTimeChange();
                  this.onPause$.next({
                    currentTime: this.getCurrentTime(),
                    currentTimecode: this.getCurrentTimecode(),
                  });
                },
              });
          };

          if (this._video!.correctedDuration && this.getCurrentTime() < this._video!.correctedDuration) {
            this._seekToFrame(this.getCurrentTime() >= this._video!.correctedDuration ? this.getTotalFrames() : this.getCurrentFrame()).subscribe(() => {
              afterPauseSync();
            });
          } else {
            this.syncVideoFrames({}).subscribe((result) => {
              afterPauseSync();
            });
          }
        },
      });

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.WAITING)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this._playbackStateMachine!.waiting = true;
      });

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PROGRESS)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this.onBuffering$.next({
          bufferedTimespans: this.getBufferedTimespans(),
        });
      });

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.ENDED)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this.onEnded$.next({});
      });

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.VOLUMECHANGE)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this.onVolumeChange$.next({
          volume: this.getVolume(),
          muted: this.isMuted(),
        });
      });

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.RATECHANGE)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((event) => {
        this.onPlaybackRateChange$.next({
          playbackRate: this.getPlaybackRate(),
        });
      });

    this._videoDomController.onFullscreenChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onFullscreenChange$.next(event);
    });

    this._videoDomController.onVideoSafeZoneChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onVideoSafeZoneChange$.next(event);
    });

    this._playbackStateMachine!.onChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onPlaybackState$.next(event);
    });

    this.onPlay$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.setPlaying();
      this._videoStalledCheckLastCurrentTime = void 0;
    });

    this.onPause$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._videoStalledCheckLastCurrentTime = void 0;
      this._playbackStateMachine!.setPaused();
    });

    this.onSeeking$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.seeking = true;
      latestSeekStartTime = performance.now();
    });

    this.onSeeked$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.seeking = false;
      this._playbackStateMachine!.waiting = false;
      latestSeekStartTime = void 0;
    });

    this.onEnded$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.setEnded();
      this._videoStalledCheckLastCurrentTime = void 0;
    });

    interval(this._videoStalledCheckIntervalMs)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe((value) => {
        let currentTime = this.getCurrentTime();

        if (!this._videoStalledCheckLastCurrentTime) {
          this._videoStalledCheckLastCurrentTime = currentTime;
          return;
        }

        if (this._playbackStateMachine && this._playbackStateMachine.state.playing) {
          let timeOffset = ((this._videoStalledCheckIntervalMs * 0.8) / 1000) * this.getPlaybackRate(); // in seconds
          let comparisonTime = this._videoStalledCheckLastCurrentTime + timeOffset;

          let isWaiting = currentTime < comparisonTime;
          this._playbackStateMachine.waiting = isWaiting;

          this._videoStalledCheckLastCurrentTime = currentTime;
        }

        if (this._playbackStateMachine && !this._playbackStateMachine.state.playing && !isNullOrUndefined(latestSeekStartTime)) {
          let isWaiting = !!latestSeekStartTime && performance.now() - latestSeekStartTime > this._videoPausedSeekBufferingThresholdMs;
          if (isWaiting) {
            // set waiting only if seek operation is taking too long, onSeeked event will eventually reset waiting state
            this._playbackStateMachine.waiting = true;
          }
        }
      });
  }

  getBufferedTimespans(): BufferedTimespan[] {
    if (!this.isVideoLoaded()) {
      return [];
    }

    let result: BufferedTimespan[] = [];
    let timeRanges: TimeRanges = this.videoElement.buffered;
    for (let i = 0; i < timeRanges.length; i++) {
      result.push({
        start: timeRanges.start(i),
        end: timeRanges.end(i),
      });
    }
    return result;
  }

  protected startVideoFrameCallback() {
    let nextVideoFrameCallback = () => {
      if (this.videoElement) {
        this._videoFrameCallbackHandle = this.videoElement.requestVideoFrameCallback((now, metadata) => {
          onVideoFrameCallback({
            now: now,
            metadata: metadata,
          });
        });
      } else {
        console.debug('Cannot call requestVideoFrameCallback, videoElement not found');
      }
    };

    let onVideoFrameCallback = (videoFrameCallbackData: VideoFrameCallbackData) => {
      this._videoFrameCallback$.next(videoFrameCallbackData);
      nextVideoFrameCallback();
    };

    nextVideoFrameCallback();
  }

  private syncVideoFrames(syncConditions: SyncConditions): Observable<boolean> {
    console.debug('syncFrames - START', syncConditions);
    return new Observable<boolean>((o$) => {
      let syncBreaker$ = new BehaviorSubject<boolean>(false);
      let syncLoopVideoCallbackBreaker$ = new Subject<void>();
      let syncLoopIterationsLeft = this._syncLoopMaxIterations;

      this._seekBreaker$.pipe(takeUntil(syncLoopVideoCallbackBreaker$)).subscribe(() => {
        console.debug(`%csyncFrames - seek breaker triggered`, 'color: gray');
        syncBreaker$.next(true);
        completeSync();
      });

      let completeSync = () => {
        nextCompleteSubject(syncLoopVideoCallbackBreaker$);
        o$.next(true);
        o$.complete();
        console.debug(`%csyncFrames - END`, 'color: gray');
      };

      let seek = (time: number) => {
        syncBreaker$.pipe(take(1)).subscribe((syncBreak) => {
          if (syncBreak) {
            console.debug(`%csyncFrames - seek skipped, breaker already triggered`, 'color: gray');
          } else {
            this._seekTimeFireAndForget(time);
          }
        });
      };

      /**
       * For now we want to check frame time tolerance only for fractional non-drop frame rates
       */
      let shouldCheckFrameTimeTolerance = () => {
        return !this.getVideo()!.dropFrame && FrameRateUtil.isFrameRateFractional(this.getVideo()!.frameRate);
      };

      /**
       * Negative percentage indicates currentTime is behind actual video time
       */
      let currentFrameTimeToleranceCheck = () => {
        let currentTime = this.getCurrentTime();
        let currentTimeFrame = this.calculateTimeToFrame(currentTime);
        let currentTimeIdealVsRealDiff = this.calculateFrameToTime(currentTimeFrame) - currentTime;
        let frameDiffPercentage = Decimal.mul(currentTimeIdealVsRealDiff, 100).div(this.getVideo()!.frameDuration).toNumber();
        return frameDiffPercentage;
      };

      if (this.isPlaying()) {
        console.debug(`%csyncFrames - SKIPPED: video is playing`, 'color: gray');
        completeSync();
      } else if (this._video!.correctedDuration && this._video!.correctedDuration <= this.getCurrentTime()) {
        console.debug(`%csyncFrames - SKIPPED: video exceeded duration`, 'color: magenta');
        completeSync();
      } else {
        let checkIfDone = (videoFrameCallbackData?: VideoFrameCallbackData) => {
          let currentTime = this.getCurrentTime();
          let currentTimeFrame = this.calculateTimeToFrame(currentTime);
          let mediaTime = videoFrameCallbackData ? videoFrameCallbackData.metadata.mediaTime : void 0;
          let mediaTimeFrame = mediaTime ? this.calculateTimeToFrame(mediaTime) : void 0;

          // console.debug(`syncFrames.checkIfDone`, {
          //   currentTime: currentTime,
          //   currentTimeFrame: currentTimeFrame,
          //   currentTimeTimecode: TimecodeUtil.formatToTimecode(currentTime, this._frameRateDecimal!, this._video!.dropFrame),
          //   mediaTime: mediaTime,
          //   mediaTimeFrame: mediaTimeFrame,
          //   videoFrameCallbackData: videoFrameCallbackData
          // });

          if (this.isPlaying()) {
            console.debug(`%csyncFrames - UNKNOWN: video is playing`, 'color: gray');
            return true;
          }

          if (currentTimeFrame === 0) {
            console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === 0`, 'color: green');
            return true;
          }

          if (syncConditions.seekToFrame) {
            if (syncConditions.seekToFrame === currentTimeFrame) {
              if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
                console.debug(`%csyncFrames - OK: ((currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]) || !mediaTimeFrame[${mediaTimeFrame}])`, 'color: green');
                return true;
              }
            }
          } else {
            if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
              console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]`, 'color: green', {
                currentTime: currentTime,
                mediaTime: mediaTime,
              });

              if (shouldCheckFrameTimeTolerance()) {
                let frameTolerance = currentFrameTimeToleranceCheck();
                // if frameTolerance exceeds allowed value we're not done yet
                return Math.abs(frameTolerance) <= this._syncFineFrameTolerancePercent;
              }

              return true;
            }
          }

          return false;
        };

        let seekToFrameTimeBaseline: number;

        let syncLoop = (videoFrameCallbackData?: VideoFrameCallbackData) => {
          let syncLoopIteration = this._syncLoopMaxIterations - syncLoopIterationsLeft;
          console.debug(`syncFrames.syncLoop - START (${syncLoopIteration})`, {
            syncConditions: syncConditions,
            videoFrameCallbackData: videoFrameCallbackData,
            dropped: this.videoElement.getVideoPlaybackQuality(),
          });

          if (this.isPlaying()) {
            completeSync();
            return;
          }

          if (checkIfDone(videoFrameCallbackData)) {
            completeSync();
            return;
          }

          let currentTime = this.getCurrentTime();
          let currentTimeFrame = this.calculateTimeToFrame(currentTime);
          let mediaTime = videoFrameCallbackData ? videoFrameCallbackData.metadata.mediaTime : void 0;
          let mediaTimeFrame = mediaTime ? this.calculateTimeToFrame(mediaTime) : void 0;

          if (syncLoopIterationsLeft-- <= 0) {
            console.debug(
              `%csyncFrames - TOO MANY SYNCs, EXITING.. : currentTime[${currentTime}], mediaTime[${mediaTime}], currentTimeFrame[${currentTimeFrame}], mediaTimeFrame[${mediaTimeFrame}]`,
              'color: red'
            );
            completeSync();
            return;
          }

          console.debug(
            `syncFrames - currentTime[${currentTime}|${this.formatToTimecode(currentTime)}], mediaTime[${mediaTime}|${mediaTime ? this.formatToTimecode(mediaTime) : void 0}], currentTimeFrame[${currentTimeFrame}], mediaTimeFrame[${mediaTimeFrame}], `
          );

          if (syncConditions.seekToFrame) {
            if (!seekToFrameTimeBaseline) {
              seekToFrameTimeBaseline = currentTime;
            }

            if (syncConditions.seekToFrame === currentTimeFrame) {
              if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
                console.debug(`%csyncFrames - OK: ((currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]) || !mediaTimeFrame[${mediaTimeFrame}])`, 'color: green');
                completeSync();
              } else {
                console.debug(
                  `%csyncFrames - CORRECTION SEEK TO FRAME; currentTimeFrame[${currentTimeFrame}] ${currentTimeFrame > mediaTimeFrame ? '>' : '<'} mediaTimeFrame[${mediaTimeFrame}]`,
                  'color: red'
                );

                let frameDiff = Math.abs(currentTimeFrame - mediaTimeFrame);
                console.debug(`%csyncFrames - frameDiff: ${frameDiff}`, 'color: orange');

                // in first sync iteration seek without nudging (frameCorrectionTime = 0)
                let frameCorrectionTime = syncLoopIteration === 0 ? 0 : this._syncStepCurrentTimeMediaTime * (currentTimeFrame > mediaTimeFrame ? 1 : -1);

                seek(Decimal.add(currentTime, frameCorrectionTime).toNumber());
              }
            } else {
              console.debug(
                `%csyncFrames - CORRECTION SEEK TO FRAME; syncConditions.seekToFrame[${syncConditions.seekToFrame}] !== currentTimeFrame[${currentTimeFrame}] | seekToFrameTimeBaseline=${seekToFrameTimeBaseline}`,
                'color: red'
              );

              let frameDiff = Math.abs(syncConditions.seekToFrame - currentTimeFrame);
              let frameCorrectionTime = frameDiff * this._video!.frameDuration;

              let seekToDecimal =
                syncConditions.seekToFrame >= currentTimeFrame ? Decimal.add(seekToFrameTimeBaseline, frameCorrectionTime) : Decimal.sub(seekToFrameTimeBaseline, frameCorrectionTime);
              let seekTo = seekToDecimal.toNumber();

              seekToFrameTimeBaseline = seekTo;

              console.debug(`%csyncFrames - frameDiff: ${frameDiff}`, 'color: orange');
              console.debug(`%csyncFrames - frameCorrectionTime: ${frameCorrectionTime}`, 'color: orange');
              console.debug(`%csyncFrames - seekTo: ${seekTo}`, 'color: orange');

              seek(seekTo);
            }
          } else {
            if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
              console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]`, 'color: green');

              if (shouldCheckFrameTimeTolerance()) {
                let currentFrameTimeTolerance = currentFrameTimeToleranceCheck();
                // only seek if we have to seek forward, we don't want to seek backwards
                if (currentFrameTimeTolerance < 0 && Math.abs(currentFrameTimeTolerance) > this._syncFineFrameTolerancePercent) {
                  console.debug(`%c syncFrames - FINE FRAME TUNING`, 'color: blue');
                  // currentTime returned by video element lags behind actual currentTime, shake it up a bit
                  seek(currentTime);
                } else {
                  completeSync();
                }
              } else {
                completeSync();
              }
            } else {
              console.debug(`%csyncFrames - CORRECTION; currentTimeFrame[${currentTimeFrame}] ${currentTimeFrame > mediaTimeFrame ? '>' : '<'} mediaTimeFrame[${mediaTimeFrame}]`, 'color: red');
              if (syncLoopIteration === 0) {
                // first sync loop iteration, give video element some more time to update mediaTime, thus repeat initial seek
                seek(currentTime);
              } else {
                if (currentTimeFrame > mediaTimeFrame) {
                  seek(Decimal.add(currentTime, this._syncStepCurrentTimeMediaTime).toNumber());
                } else if (mediaTime) {
                  seek(mediaTime + this._syncStepCurrentTimeMediaTime);
                }
              }
            }
          }

          console.debug('syncFrames.syncLoop - END');

          completeSync();
        };
        this._videoFrameCallback$.pipe(delay(syncConditions.seekToFrame ? 0 : 0), takeUntil(syncLoopVideoCallbackBreaker$)).subscribe({
          next: (videoFrameCallbackData) => {
            console.debug('syncFrames.syncLoop - videoFrameCallback$ trigger', videoFrameCallbackData);
            syncLoop(videoFrameCallbackData);
          },
        });
      }
    });
  }

  private constrainVideoTime(time: number): number {
    let duration = this._video!.correctedDuration ? this._video!.correctedDuration : this.getDuration();
    return time < 0 ? 0 : time > duration ? duration : time;
  }

  private seekTimeAndSync(newTime: number, syncConditions: SyncConditions = {}): Observable<boolean> {
    let timeBeforeSeek = this.getCurrentTime();
    return new Observable<boolean>((o$) => {
      // if we already have seek in progress, break previous seek operation
      if (this._playbackStateMachine!.seeking) {
        nextCompleteSubject(this._seekBreaker$);
        this._seekBreaker$ = new Subject<void>();
      }

      if (!isNaN(newTime)) {
        newTime = this.constrainVideoTime(newTime);

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKING)
          .pipe(takeUntil(this._seekBreaker$), take(1))
          .subscribe((event) => {
            this.onSeeking$.next({
              toTime: newTime,
              toTimecode: this.formatToTimecode(newTime),
              fromTime: timeBeforeSeek,
              fromTimecode: this.formatToTimecode(timeBeforeSeek),
            });
          });

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKED)
          .pipe(takeUntil(this._seekBreaker$), take(1))
          .subscribe((event) => {
            this.syncVideoFrames(syncConditions).subscribe((result) => {
              if (this._video!.correctedDuration && this._video!.correctedDuration > this.videoElement.duration) {
                /**
                 * If we land on exact time of the frame start at the end of video, there is the chance that we won't load the frame
                 */
                this._video!.correctedDuration = Number.isInteger(this.videoElement.duration * this._video!.frameRate)
                  ? this.videoElement.duration - this._config.frameDurationSpillOverCorrection
                  : this.videoElement.duration;
              }

              let finalizeSeek = () => {
                this._playbackStateMachine!.seeking = false;

                o$.next(true);
                o$.complete();

                this.dispatchVideoTimeChange();
              };

              //Seeking to end of video stream if currentTime exceeded corrected duration
              if (this._video!.correctedDuration && this.getCurrentTime() > this._video!.correctedDuration) {
                this.seekTimeWithoutSync(this._video!.correctedDuration)
                  .pipe(takeUntil(this._seekBreaker$), take(1))
                  .subscribe(() => {
                    this.onEnded$.next({});
                    finalizeSeek();
                  });
              } else {
                this.onSeeked$.next({
                  currentTime: this.getCurrentTime(),
                  currentTimecode: this.getCurrentTimecode(),
                  previousTime: timeBeforeSeek,
                  previousTimecode: this.formatToTimecode(timeBeforeSeek),
                });
                finalizeSeek();
              }
            });
          });

        console.debug(`Seeking to timestamp: ${newTime} \t ${this.formatToTimecode(newTime)}`);
        this.setCurrentTime(newTime);
      }
    });
  }

  private seekTimeWithoutSync(newTime: number): Observable<boolean> {
    let timeBeforeSeek = this.getCurrentTime();
    return new Observable<boolean>((o$) => {
      // do we have seek already in progress
      if (this._playbackStateMachine!.seeking) {
        nextCompleteSubject(this._seekBreaker$);
        this._seekBreaker$ = new Subject<void>();
      }

      if (!isNaN(newTime)) {
        newTime = newTime < 0 ? 0 : newTime > this.getDuration() ? this.getDuration() : newTime;

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKING)
          .pipe(takeUntil(this._seekBreaker$), take(1))
          .subscribe((event) => {
            this.onSeeking$.next({
              toTime: newTime,
              toTimecode: this.formatToTimecode(newTime),
              fromTime: timeBeforeSeek,
              fromTimecode: this.formatToTimecode(timeBeforeSeek),
            });
          });

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKED)
          .pipe(takeUntil(this._seekBreaker$), take(1))
          .subscribe((event) => {
            this.onSeeked$.next({
              currentTime: this.getCurrentTime(),
              currentTimecode: this.getCurrentTimecode(),
              previousTime: timeBeforeSeek,
              previousTimecode: this.formatToTimecode(timeBeforeSeek),
            });

            this._playbackStateMachine!.seeking = false;

            o$.next(true);
            o$.complete();

            this.dispatchVideoTimeChange();
          });

        console.debug(`Seeking to timestamp: ${newTime} \t ${this.formatToTimecode(newTime)}`);

        this.setCurrentTime(newTime);
      }
    });
  }

  private _seekTimeFireAndForget(newTime: number) {
    if (!isNaN(newTime)) {
      let currentTime = this.getCurrentTime();
      newTime = newTime < 0 ? 0 : newTime > this.getDuration() ? this.getDuration() : newTime;
      let seekDirection: SeekDirection = newTime === currentTime ? 'o' : newTime > currentTime ? 'fw' : 'bw';
      let diffDecimal = Decimal.sub(currentTime, newTime).abs();
      console.debug(`Seeking from currentTime[${currentTime}] to newTime[${newTime}], direction: ${seekDirection} ${diffDecimal.toNumber()}`);
      this.setCurrentTime(newTime);
    }
  }

  /**
   *
   * @param timeOffset Time offset in seconds
   * @param syncConditions
   */
  private seekFromCurrentTimeAndSync(timeOffset: number, syncConditions: SyncConditions = {}): Observable<boolean> {
    let currentTime = this.getCurrentTime();

    //Sync to frame start
    if (syncConditions.currentTime) {
      currentTime = syncConditions.currentTime;
    }
    let newTime = Decimal.add(currentTime, timeOffset).toNumber();

    let seekDirection: SeekDirection;

    if (syncConditions.seekDirection) {
      seekDirection = syncConditions.seekDirection;
    } else {
      seekDirection = newTime === currentTime ? 'o' : newTime > currentTime ? 'fw' : 'bw';
    }

    let diff = Decimal.sub(currentTime, newTime).abs().toNumber();
    console.debug(`Seeking from currentTime ${currentTime} to ${newTime}, direction: ${seekDirection} ${diff}`);

    return this.seekTimeAndSync(newTime, syncConditions);
  }

  private setCurrentTime(time: number) {
    this.videoElement.currentTime = time;
  }

  private _seekToFrame(frame: number): Observable<boolean> {
    if (!this.isPlaying() && !isNaN(frame)) {
      console.debug(`Seeking to frame: ${frame}`);
      if (frame <= 0) {
        return this.seekTimeAndSync(0, {});
      } else {
        let newTime = this.calculateFrameToTime(frame) + new Decimal(this._config.frameDurationSpillOverCorrection).toNumber();
        let frameNumberCheck = this.calculateTimeToFrame(newTime);

        if (this._video!.correctedDuration && frameNumberCheck !== frame && frame != this._video!.correctedDuration * this.getFrameRate()) {
          console.error(`Frame numbers don't match. Wanted: ${frame}, calculated: ${frameNumberCheck}`);
          return of(false);
        } else {
          return this.seekTimeAndSync(newTime, {
            seekToFrame: frame,
            seekToTime: newTime,
            currentTime: this.getCurrentTime(),
            newTimecode: this.formatToTimecode(newTime),
          }).pipe(
            map((result) => {
              return result;
            })
          );
        }
      }
    } else {
      return of(false);
    }
  }

  /**
   *
   * @param framesCount Positive or negative number of frames. If positive - seek forward, if negative - seek backward.
   */
  private _seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    let currentFrame = this.getCurrentFrame();
    let seekToFrame = currentFrame + framesCount;

    console.debug(`seekFromCurrentFrame - Current frame: ${currentFrame}, wanted frame: ${seekToFrame}`);

    if (currentFrame !== seekToFrame) {
      if (seekToFrame <= 0) {
        return this._seekToFrame(0);
      } else if (
        this._video!.correctedDuration &&
        (seekToFrame >= this.getTotalFrames() || (seekToFrame >= this._video!.correctedDuration * this.getFrameRate() && !this._playbackStateMachine!.state.ended))
      ) {
        return this._seekToFrame(this._video!.correctedDuration * this.getFrameRate());
      } else if (
        this._video!.correctedDuration &&
        (seekToFrame >= this.getTotalFrames() || (seekToFrame >= this._video!.correctedDuration * this.getFrameRate() && this._playbackStateMachine!.state.ended))
      ) {
        return of(false);
      } else {
        let timeOffset = this.calculateFrameToTime(framesCount);
        let currentTime = Decimal.div(currentFrame, this.getFrameRate()).plus(this._config.frameDurationSpillOverCorrection).toNumber();

        return this.seekFromCurrentTimeAndSync(timeOffset, {
          seekToFrame: seekToFrame,
          currentTime: currentTime,
          seekDirection: framesCount > 0 ? 'fw' : 'bw',
        }).pipe(
          map((result) => {
            return result;
          })
        );
      }
    } else {
      return of(true);
    }
  }

  dispatchVideoTimeChange(): void {
    let currentTime = this.getCurrentTime();
    let frame = this.calculateTimeToFrame(currentTime);

    this.onVideoTimeChange$.next({
      currentTime: currentTime,
      frame: frame,
    });
  }

  private startAnimationFrameLoop() {
    if (isNullOrUndefined(this._requestAnimationFrameId)) {
      this._requestAnimationFrameId = requestAnimationFrame((time) => {
        this.requestAnimationFrameExecutor(time);
      });
    } else {
      // console.debug('requestAnimationFrame already initiated');
    }
  }

  private stopAnimationFrameLoop() {
    if (this._requestAnimationFrameId) {
      cancelAnimationFrame(this._requestAnimationFrameId);
      this._requestAnimationFrameId = void 0;
    } else {
      console.debug('cannot stop requestAnimationFrame, _requestAnimationFrameId not set');
    }
  }

  private requestAnimationFrameExecutor(time: number) {
    this._animationFrameCallback$.next(time);
    this._requestAnimationFrameId = requestAnimationFrame((time) => {
      this.requestAnimationFrameExecutor(time);
    });
  }

  private validateVideoLoaded() {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }
  }

  getPlaybackState(): PlaybackState | undefined {
    return this._playbackStateMachine ? this._playbackStateMachine.state : void 0;
  }

  getVideo(): Video | undefined {
    return this._video;
  }

  getVideoLoadOptions(): VideoLoadOptions | undefined {
    return this._videoLoadOptions;
  }

  getHTMLVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  calculateTimeToFrame(time: number): number {
    this.validateVideoLoaded();
    return FrameRateUtil.videoTimeToVideoFrameNumber(time, this.getVideo()!);
  }

  calculateFrameToTime(frameNumber: number): number {
    this.validateVideoLoaded();
    return FrameRateUtil.videoFrameNumberToVideoTime(frameNumber, this.getVideo()!);
  }

  play(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded() && !this.isPlaying()) {
        this._checkAndCancelPausing();
        // first start request video frame callback cycle
        this.videoElement
          .play()
          .then(() => {
            // handled in HTMLVideoElementEventKeys.PLAYING event handler
            nextCompleteObserver(observer);
          })
          .catch((error) => {
            errorCompleteObserver(observer, error);
          });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  pause(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded() && this.isPlaying()) {
        let pauseApproximateTime = this.getCurrentTime();
        this._pausingBreaker$ = new Subject<void>();
        this._pausingBreaker$.pipe(take(1)).subscribe({
          next: () => {
            console.debug(`%cpausing breaker triggered`, 'color: gray');
            console.log(`%cpausing breaker triggered`, 'color: gray');
            this.onPause$.next({
              currentTime: pauseApproximateTime,
              currentTimecode: this.formatToTimecode(pauseApproximateTime),
            });
          },
        });

        this._playbackStateMachine!.setPausing();

        this.onPause$
          .pipe(take(1))
          .subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
          })
          .add(() => {
            if (this._pausingBreaker$) {
              completeSubject(this._pausingBreaker$);
            }
          });

        this.videoElement.pause();
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  private _checkAndCancelPausing() {
    if (this._playbackStateMachine!.pausing) {
      nextCompleteSubject(this._pausingBreaker$);
    }
  }

  togglePlayPause(): Observable<void> {
    if (this.isPlaying()) {
      return this.pause();
    } else {
      return this.play();
    }
  }

  isPlaying() {
    return (
      this.isVideoLoaded() &&
      this.getCurrentTime() > 0 &&
      this.getCurrentTime() < this.getDuration() &&
      !this.videoElement.paused && // caution: when using default HTML video controls, when seeking while playing - video is actually paused for a moment
      !this.videoElement.ended &&
      this.videoElement.readyState > this.videoElement.HAVE_CURRENT_DATA
    );
  }

  isPaused() {
    return !this.isPlaying();
  }

  isSeeking(): boolean {
    return !!this.getPlaybackState() && this.getPlaybackState()!.seeking;
  }

  getCurrentTime(): number {
    return this.isVideoLoaded() ? this.videoElement.currentTime : 0;
  }

  getCurrentTimecode(): string {
    return this.formatToTimecode(this.getCurrentTime());
  }

  getPlaybackRate(): number {
    return this.isVideoLoaded() ? this.videoElement.playbackRate : 0;
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        try {
          playbackRate = z.coerce.number().min(0.1).max(16).default(1).parse(playbackRate);
        } catch (e) {
          playbackRate = 1;
        }

        if (playbackRate !== this.getPlaybackRate()) {
          this.onPlaybackRateChange$.pipe(take(1), timeout(60000), takeUntil(this._destroyed$)).subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
          });
        } else {
          nextCompleteObserver(observer);
        }

        this.videoElement.playbackRate = playbackRate;

        // TODO we could wait for change event before resolution
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  getVolume(): number {
    return this.isVideoLoaded() ? this.videoElement.volume : 0;
  }

  setVolume(volume: number): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        try {
          volume = z.coerce.number().min(0).max(1).default(1).parse(volume);

          this.videoElement.volume = volume;

          // TODO we could wait for change event before resolution

          nextCompleteObserver(observer);
        } catch (e) {
          // nop
          nextCompleteObserver(observer);
        }
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  /**
   * return Video duration in seconds
   */
  getDuration(): number {
    this.validateVideoLoaded();

    return this._video!.duration;
  }

  getFrameRate(): number {
    this.validateVideoLoaded();

    return this._video!.frameRate;
  }

  getTotalFrames(): number {
    this.validateVideoLoaded();

    return this._video!.totalFrames;
  }

  getCurrentFrame(): number {
    return this.isVideoLoaded() ? this.calculateTimeToFrame(this.getCurrentTime()) : 0;
  }

  seekToFrame(frame: number): Observable<boolean> {
    console.debug(`%cseekToFrame: ${frame}`, 'color: purple');

    this.validateVideoLoaded();

    frame = z.coerce.number().min(0).max(this.getTotalFrames()).parse(frame);

    if (!this.isVideoLoaded() || (this._playbackStateMachine!.state.ended && frame >= this.getCurrentFrame())) {
      return of(false);
    }

    this._checkAndCancelPausing();

    return passiveObservable<boolean>((observer) => {
      this._seekToFrame(frame).subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    this.validateVideoLoaded();

    framesCount = z.coerce.number().parse(framesCount);

    this._checkAndCancelPausing();

    return passiveObservable<boolean>((observer) => {
      this._seekFromCurrentFrame(framesCount).subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  seekFromCurrentTime(timeAmount: number): Observable<boolean> {
    this.validateVideoLoaded();

    timeAmount = z.coerce.number().parse(timeAmount);

    return this.seekToTime(this.getCurrentTime() + timeAmount);
  }

  seekPreviousFrame(): Observable<boolean> {
    this.validateVideoLoaded();

    return this.seekFromCurrentFrame(-1);
  }

  seekNextFrame(): Observable<boolean> {
    this.validateVideoLoaded();

    return this.seekFromCurrentFrame(1);
  }

  seekToTime(time: number): Observable<boolean> {
    console.debug(`%cseekToTime: ${time}`, 'color: purple');

    this.validateVideoLoaded();

    if (this._video!.correctedDuration && (!this.isVideoLoaded() || (this._playbackStateMachine!.state.ended && time >= this._video!.correctedDuration))) {
      return of(false);
    }

    time = z.coerce.number().parse(time);

    if (this._video!.correctedDuration && time > this._video!.correctedDuration) {
      time = this._video!.correctedDuration;
    }

    this._checkAndCancelPausing();

    return passiveObservable<boolean>((observer) => {
      this.seekTimeAndSync(time, {
        seekToTime: time,
        seekDirection: time === this.getCurrentTime() ? 'o' : time > this.getCurrentTime() ? 'fw' : 'bw',
      }).subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  seekToTimecode(timecode: string): Observable<boolean> {
    if (this.isPlaying()) {
      return this.seekToTime(this.parseTimecodeToTime(timecode));
    } else {
      return this.seekToFrame(this.parseTimecodeToFrame(timecode));
    }
  }

  seekToPercent(percent: number): Observable<boolean> {
    this.validateVideoLoaded();

    let percentSafeParsed = z.coerce.number().min(0).max(100).safeParse(percent);

    if (percentSafeParsed.success) {
      let timeToSeek: number;

      if (percent === 0) {
        timeToSeek = 0;
      } else if (percent === 100) {
        timeToSeek = this.getDuration();
      } else {
        timeToSeek = new Decimal(this.getDuration())
          .mul(percent / 100)
          .round()
          .toNumber();
      }

      return this.seekToTime(timeToSeek);
    } else {
      return of(false);
    }
  }

  formatToTimecode(time: number): string {
    this.validateVideoLoaded();
    time = Validators.videoTime()(time);
    return TimecodeUtil.formatToTimecode(time, this.getVideo()!);
  }

  parseTimecodeToFrame(timecode: string): number {
    this.validateVideoLoaded();
    timecode = Validators.videoTimecode()(timecode, this.getVideo()!);
    return TimecodeUtil.parseTimecodeToFrame(timecode, new Decimal(this.getVideo()!.frameRate), this.getVideo()!.ffomTimecodeObject);
  }

  parseTimecodeToTime(timecode: string): number {
    this.validateVideoLoaded();
    timecode = Validators.videoTimecode()(timecode, this.getVideo()!);
    return TimecodeUtil.parseTimecodeToTime(timecode, this.getVideo()!, this.getVideo()!.ffomTimecodeObject);
  }

  mute(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        this.videoElement.muted = true;
      }
      nextCompleteObserver(observer);
    });
  }

  unmute(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        this.videoElement.muted = false;
      }
      nextCompleteObserver(observer);
    });
  }

  isMuted(): boolean {
    return !!this.videoElement && this.videoElement.muted;
  }

  toggleMuteUnmute(): Observable<void> {
    return this.isMuted() ? this.unmute() : this.mute();
  }

  isFullscreen(): boolean {
    if (!this.isVideoLoaded()) {
      return false;
    }

    return this._videoDomController.isFullscreen();
  }

  toggleFullscreen(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        this._videoDomController.toggleFullscreen().subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
          error: (error) => errorCompleteObserver(observer, error),
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  protected setAudioTracks(audioTracks: OmakaseAudioTrack[]): Observable<void> {
    return passiveObservable((observer) => {
      this._audioTracks = new Map<string, OmakaseAudioTrack>(audioTracks.map((audioTrack) => [audioTrack.id, audioTrack]));
      this.onAudioLoaded$.next({
        audioTracks: this.getAudioTracks(),
        activeAudioTrack: this.getActiveAudioTrack(),
      });
      nextCompleteObserver(observer);
    });
  }

  getActiveAudioTrack(): OmakaseAudioTrack | undefined {
    return this._activeAudioTrack;
  }

  getAudioTracks(): OmakaseAudioTrack[] {
    return [...this._audioTracks.values()];
  }

  setActiveAudioTrack(id: string): Observable<void> {
    return passiveObservable((observer) => {
      let activeTrack = this.getActiveAudioTrack();
      let newActiveTrack = this.getAudioTracks().find((p) => p.id === id);
      if (this.isVideoLoaded() && newActiveTrack && newActiveTrack.id !== activeTrack?.id) {
        this._videoLoader!.setActiveAudioTrack(id).subscribe({
          next: (event) => {
            this.updateActiveAudioTrack(id);
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
  }

  protected updateActiveAudioTrack(id: string) {
    let activeTrack = this.getActiveAudioTrack();
    let newActiveTrack = this.getAudioTracks().find((p) => p.id === id);
    if (newActiveTrack && newActiveTrack.id !== activeTrack?.id) {
      this._activeAudioTrack = this._audioTracks.get(id);
      if (this._activeAudioTrack) {
        this.onAudioSwitched$.next({
          activeAudioTrack: this._activeAudioTrack,
        });
      }
    }
  }

  isVideoLoaded(): boolean {
    return !!this.onVideoLoaded$.value;
  }

  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return passiveObservable((observer) => {
      this._helpMenuGroups = [...this.getHelpMenuGroups(), helpMenuGroup];
      this.onHelpMenuChange$.next({
        helpMenuGroups: this.getHelpMenuGroups(),
      });
      nextCompleteObserver(observer);
    });
  }

  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return passiveObservable((observer) => {
      this._helpMenuGroups = [helpMenuGroup, ...this.getHelpMenuGroups()];
      this.onHelpMenuChange$.next({
        helpMenuGroups: this.getHelpMenuGroups(),
      });
      nextCompleteObserver(observer);
    });
  }

  clearHelpMenuGroups(): Observable<void> {
    return passiveObservable((observer) => {
      this._helpMenuGroups = [];
      this.onHelpMenuChange$.next({
        helpMenuGroups: this.getHelpMenuGroups(),
      });
      nextCompleteObserver(observer);
    });
  }

  getHelpMenuGroups(): HelpMenuGroup[] {
    return this._helpMenuGroups;
  }

  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone> {
    return this._videoDomController.addSafeZone(videoSafeZone);
  }

  removeSafeZone(id: string) {
    return this._videoDomController.removeSafeZone(id);
  }

  clearSafeZones(): Observable<void> {
    return this._videoDomController.clearSafeZones();
  }

  getSafeZones(): VideoSafeZone[] {
    return this._videoDomController.getSafeZones();
  }

  isDetachable(): boolean {
    return false;
  }

  canDetach(): boolean {
    return false;
  }

  canAttach(): boolean {
    return false;
  }

  getVideoWindowPlaybackState(): VideoWindowPlaybackState {
    return 'attached';
  }

  detachVideoWindow(): Observable<void> {
    throw new Error('I am not detachable');
  }

  attachVideoWindow(): Observable<void> {
    throw new Error('I am not attachable');
  }

  enablePiP(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        if (!document.pictureInPictureElement && document.pictureInPictureEnabled) {
          this.getHTMLVideoElement().requestPictureInPicture();
        }
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, 'Video is not loaded');
      }
    });
  }

  disablePiP(): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        if (document.pictureInPictureElement && document.pictureInPictureEnabled) {
          document.exitPictureInPicture();
        }
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, 'Video is not loaded');
      }
    });
  }

  protected setSubtitlesTracks(subtitlesVttTracks: SubtitlesVttTrack[]): Observable<void> {
    return passiveObservable((observer) => {
      this._removeAllSubtitlesTracks(false);
      if (subtitlesVttTracks && subtitlesVttTracks.length > 0) {
        forkJoin(subtitlesVttTracks.map((p) => this.createSubtitlesVttTrack(p)))
          .pipe(map((p) => p.filter((p) => !!p) as SubtitlesVttTrack[]))
          .subscribe({
            next: (subtitlesVttTracks) => {
              this._subtitlesTracks = new Map<string, SubtitlesVttTrack>(subtitlesVttTracks.map((subtitlesVttTrack) => [subtitlesVttTrack.id, subtitlesVttTrack]));
              this.onSubtitlesLoaded$.next(this.createSubtitlesEvent());
              nextCompleteObserver(observer);
            },
            error: (err) => {
              errorCompleteObserver(observer, err);
            },
          });
      } else {
        this.onSubtitlesLoaded$.next(this.createSubtitlesEvent());
        nextCompleteObserver(observer);
      }
    });
  }

  createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack | undefined> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        this._createSubtitlesVttTrack(subtitlesVttTrack).subscribe({
          next: (value) => {
            console.debug('Created subtitles track', subtitlesVttTrack);
            nextCompleteObserver(observer, value);
          },
          error: (error) => {
            console.error(error);
            errorCompleteObserver(observer, error);
          },
        });
      } else {
        console.debug('Failed to create subtitles track, video not loaded', subtitlesVttTrack);
        nextCompleteObserver(observer);
      }
    });
  }

  protected _createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack | undefined> {
    return new Observable<SubtitlesVttTrack>((observer) => {
      this._removeSubtitlesTrack(subtitlesVttTrack.id);

      this._videoDomController.appendHTMLTrackElement(subtitlesVttTrack).subscribe((element) => {
        if (element) {
          this._subtitlesTracks.set(subtitlesVttTrack.id, subtitlesVttTrack);
          this.onSubtitlesCreate$.next(this.createSubtitlesEvent());
          console.debug('Created subtitles track, track appended to DOM', subtitlesVttTrack);
          nextCompleteObserver(observer, subtitlesVttTrack);
        } else {
          let message = `Failed to create subtitles track, appending to DOM failed for ${JSON.stringify(subtitlesVttTrack)}`;
          console.debug(message);
          errorCompleteObserver(observer, message);
        }
      });
    });
  }

  getSubtitlesTracks(): SubtitlesVttTrack[] {
    return this.isVideoLoaded() ? [...this._subtitlesTracks.values()] : [];
  }

  removeAllSubtitlesTracks(): Observable<void> {
    return passiveObservable((observer) => {
      this._removeAllSubtitlesTracks();
      nextCompleteObserver(observer);
    });
  }

  protected _removeAllSubtitlesTracks(emitEvent = true): void {
    if (this._subtitlesTracks.size > 0) {
      [...this._subtitlesTracks.values()].map((p) => this._removeSubtitlesTrack(p.id, emitEvent));
    }
  }

  removeSubtitlesTrack(id: string): Observable<void> {
    return passiveObservable((observer) => {
      this._removeSubtitlesTrack(id);
      nextCompleteObserver(observer);
    });
  }

  protected _removeSubtitlesTrack(id: string, emitEvent = true): void {
    if (this.isVideoLoaded()) {
      let track = this._subtitlesTracks.get(id);
      if (track) {
        // remove existing track
        this._subtitlesTracks.delete(id);

        // remove existing track from HTML DOM
        this._videoDomController.removeTextTrackById(track.id);

        if (emitEvent) {
          this.onSubtitlesRemove$.next(this.createSubtitlesEvent());
        }
      }
    }
  }

  getActiveSubtitlesTrack(): SubtitlesVttTrack | undefined {
    return this._activeSubtitlesTrack;
  }

  showSubtitlesTrack(id: string): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        let textTracksList = this._videoDomController.getTextTrackList();
        if (textTracksList && textTracksList.length > 0) {
          for (let i = 0; i < textTracksList.length; i++) {
            let textTrack = textTracksList[i];
            if (textTrack.id !== id && !(textTrack.mode === 'hidden' || textTrack.mode === 'disabled')) {
              textTrack.mode = 'hidden';
            }
          }
        }

        let subtitlesVttTrack = this._subtitlesTracks.get(id);
        if (subtitlesVttTrack) {
          let textTrack = this._videoDomController.getTextTrackById(subtitlesVttTrack.id);

          if (textTrack) {
            textTrack.mode = 'showing';
            subtitlesVttTrack.hidden = false;

            this._activeSubtitlesTrack = subtitlesVttTrack;

            this.onSubtitlesShow$.next(this.createSubtitlesEvent());
          }
        }
      }
      nextCompleteObserver(observer);
    });
  }

  hideSubtitlesTrack(id: string): Observable<void> {
    return passiveObservable((observer) => {
      if (this.isVideoLoaded()) {
        let track = this._subtitlesTracks.get(id);
        if (track) {
          let domTextTrack = this._videoDomController.getTextTrackById(track.id);
          if (domTextTrack) {
            domTextTrack.mode = 'hidden';
            track.hidden = true;

            this.onSubtitlesHide$.next(this.createSubtitlesEvent());
          }
        }
      }
      nextCompleteObserver(observer);
    });
  }

  private createSubtitlesEvent(): SubtitlesEvent {
    return {
      tracks: this.getSubtitlesTracks(),
      currentTrack: this.getActiveSubtitlesTrack(),
    };
  }

  createAudioContext(contextOptions?: AudioContextOptions): Observable<void> {
    return passiveObservable((observer) => {
      this._createAudioContext(contextOptions);
      nextCompleteObserver(observer);
    });
  }

  protected _createAudioContext(contextOptions?: AudioContextOptions): AudioContext {
    if (!this._audioContext) {
      console.debug('Creating AudioContext');
      this._audioContext = new AudioContext(contextOptions);
      this.onPlay$.pipe(take(1)).subscribe({
        next: () => {
          if (this._audioContext?.state !== 'running') {
            // this can be executed only after user gesture, so we have to bind it on some user gesture event (play) to enable it
            this._audioContext?.resume().then((event) => {
              console.debug('AudioContext resumed');
            });
          }
        },
      });
    } else {
      console.debug('AudioContext already created');
    }
    return this._audioContext;
  }

  getAudioContext(): AudioContext | undefined {
    return this._audioContext;
  }

  getMediaElementAudioSourceNode(): MediaElementAudioSourceNode | undefined {
    return this._mediaElementAudioSource;
  }

  createAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<void> {
    inputsNumber = Validators.audioChannelsNumber()(inputsNumber);

    return this.createAudioRouterWithOutputsResolver(inputsNumber, (maxChannelCount: number) => {
      if (!isNullOrUndefined(outputsNumber)) {
        return outputsNumber!;
      } else {
        return defaultAudioOutputsResolver(maxChannelCount);
      }
    });
  }

  createAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<void> {
    return passiveObservable((observer) => {
      if (this._audioChannelSplitterNode || this._audioChannelMergerNode) {
        console.debug('Audio router already created');
        nextCompleteObserver(observer);
      } else {
        console.debug('Creating audio router');

        this._audioInputsNumber = inputsNumber;

        // ensure audio context exists
        let audioContext = this._createAudioContext();

        this._mediaElementAudioSource = audioContext.createMediaElementSource(this.getHTMLVideoElement());

        let audioDestinationNode: AudioDestinationNode = audioContext.destination;
        let maxChannelCount = audioDestinationNode.maxChannelCount; // the maximum number of channels that this hardware is capable of supporting
        this._audioOutputsNumber = outputsNumberResolver(maxChannelCount);

        console.debug('Configuring AudioContext with', {
          inputsNumber: this._audioOutputsNumber,
          outputsNumber: this._audioOutputsNumber,
        });

        this._mediaElementAudioSource.channelCountMode = 'max';
        this._mediaElementAudioSource.channelCount = this._audioInputsNumber;
        this._audioChannelSplitterNode = audioContext.createChannelSplitter(this._audioInputsNumber);
        this._audioChannelMergerNode = audioContext.createChannelMerger(this._audioOutputsNumber);

        this._audioInputOutputNodes.clear();
        for (let inputNumber = 0; inputNumber < this._audioInputsNumber; inputNumber++) {
          let inputAudioInputOutputNodesByOutput: Map<number, AudioInputOutputNode> = new Map<number, AudioInputOutputNode>();
          this._audioInputOutputNodes.set(inputNumber, inputAudioInputOutputNodesByOutput);
          for (let outputNumber = 0; outputNumber < this._audioOutputsNumber; outputNumber++) {
            inputAudioInputOutputNodesByOutput.set(outputNumber, {
              inputNumber: inputNumber,
              outputNumber: outputNumber,
              connected: false,
            });
          }
        }

        this.routeAudioInputOutputNodes(AudioUtil.resolveDefaultAudioRouting(this._audioInputsNumber, this._audioOutputsNumber));

        this._mediaElementAudioSource.connect(this._audioChannelSplitterNode);

        // connect silent gain node to prevent buffer overflows and stalls when audio isn't routed to destination
        let silentGainNode = audioContext.createGain();
        silentGainNode.gain.value = 0; // Set gain to 0 (silent)
        silentGainNode.connect(audioContext.destination);
        this._audioChannelSplitterNode.connect(silentGainNode);

        this._audioChannelMergerNode.connect(audioContext.destination);

        this.onAudioContextChange$.next({
          audioInputsNumber: this._audioInputsNumber!,
          audioOutputsNumber: this._audioOutputsNumber!,
          audioInputOutputNodes: this.getAudioInputOutputNodes(),
        });
        nextCompleteObserver(observer);
      }
    });
  }

  getAudioInputOutputNodes(): AudioInputOutputNode[][] {
    return [...this._audioInputOutputNodes.values()].map((p) => [...p.values()]);
  }

  routeAudioInputOutputNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void> {
    return passiveObservable((observer) => {
      newAudioInputOutputNodes.forEach((p) => this._routeAudioInputOutputNode(p, false));
      this.onAudioRouting$.next({
        audioInputOutputNodes: this.getAudioInputOutputNodes(),
      });
      nextCompleteObserver(observer);
    });
  }

  routeAudioInputOutputNode(newAudioInputOutputNode: AudioInputOutputNode): Observable<void> {
    return passiveObservable((observer) => {
      this._routeAudioInputOutputNode(newAudioInputOutputNode);
      nextCompleteObserver(observer);
    });
  }

  protected _routeAudioInputOutputNode(newNode: AudioInputOutputNode, emitEvent = true) {
    if (!this._audioInputOutputNodes.has(newNode.inputNumber)) {
      console.debug(`Unknown audioInputOutputNode: ${JSON.stringify(newNode)}`);
      return;
    }

    if (this._audioChannelSplitterNode && this._audioChannelMergerNode) {
      let byOutput = this._audioInputOutputNodes.get(newNode.inputNumber)!;
      let existingNode = byOutput.get(newNode.outputNumber);

      // change is required only if newNode doesn't exist already and is connected, or if it exists and new connected state differs from existing
      let changeRequired = (!existingNode && newNode.connected) || (existingNode && existingNode.connected !== newNode.connected);

      if (changeRequired) {
        try {
          if (newNode.connected) {
            this._audioChannelSplitterNode.connect(this._audioChannelMergerNode, newNode.inputNumber, newNode.outputNumber);
          } else {
            this._audioChannelSplitterNode.disconnect(this._audioChannelMergerNode, newNode.inputNumber, newNode.outputNumber);
          }

          byOutput.set(newNode.outputNumber, newNode);
          if (emitEvent) {
            this.onAudioRouting$.next({
              audioInputOutputNodes: this.getAudioInputOutputNodes(),
            });
          }
        } catch (e) {
          console.warn(e);
        }
      }
    }
  }

  protected destroyAudioContext() {
    if (this._audioContext) {
      try {
        this._mediaElementAudioSource?.disconnect();
        if (this._audioContext.state !== 'closed') {
          this._audioContext.close().then(
            () => {
              console.debug('AudioContext closed');
              this._audioContext = void 0;
            },
            (reason) => {
              console.debug('Problem while closing AudioContext', reason);
            }
          );
        }
        this._audioChannelSplitterNode?.disconnect();
        this._audioChannelMergerNode?.disconnect();
        this._audioInputsNumber = void 0;
        this._audioOutputsNumber = void 0;
        this._audioInputOutputNodes.clear();

        this.onAudioContextChange$.next({
          audioInputsNumber: this._audioInputsNumber,
          audioOutputsNumber: this._audioOutputsNumber,
          audioInputOutputNodes: this.getAudioInputOutputNodes(),
        });
      } catch (e) {
        console.debug('Problems in disposing AudioContext', e);
        console.debug(e);
      }
    }
  }

  protected destroyAudioRouter() {
    try {
      this._audioChannelSplitterNode?.disconnect();
      this._audioChannelMergerNode?.disconnect();
    } catch (e) {
      console.debug(e);
    }

    this._audioInputsNumber = void 0;
    this._audioOutputsNumber = void 0;
    this._audioInputOutputNodes.clear();

    this.onAudioContextChange$.next({
      audioInputsNumber: this._audioInputsNumber,
      audioOutputsNumber: this._audioOutputsNumber,
      audioInputOutputNodes: this.getAudioInputOutputNodes(),
    });
  }

  getAudioPeakProcessorWorkletNode(): AudioWorkletNode | undefined {
    return this._audioPeakProcessorWorkletNode;
  }

  createAudioPeakProcessorWorkletNode(audioMeterStandard: AudioMeterStandard): Observable<void> {
    return passiveObservable((observer) => {
      if (this._audioPeakProcessorWorkletNode) {
        console.debug('AudioWorkletNode already exists');
        nextCompleteObserver(observer);
      } else {
        if (this._mediaElementAudioSource) {
          let createAudioWorkletNode: () => Observable<AudioWorkletNode> = () => {
            return passiveObservable((observer) => {
              let audioWorkletNodeName = `omp-${audioMeterStandard}-processor`; // name unique to omakase-player
              try {
                let audioWorkletNode = new AudioWorkletNode(this._mediaElementAudioSource!.context, audioWorkletNodeName, {
                  parameterData: {},
                });
                nextCompleteObserver(observer, audioWorkletNode);
              } catch (e) {
                // console.debug(e)

                const workletCode = audioMeterStandard === 'true-peak' ? truePeakProcessor : peakSampleProcessor;
                let objectURL = BlobUtil.createObjectURL(BlobUtil.createBlob([workletCode], {type: 'application/javascript'}));

                this._mediaElementAudioSource!.context.audioWorklet.addModule(objectURL).then(() => {
                  let audioWorkletNode = new AudioWorkletNode(this._mediaElementAudioSource!.context, audioWorkletNodeName, {
                    parameterData: {},
                  });
                  nextCompleteObserver(observer, audioWorkletNode);
                });
              }
            });
          };

          createAudioWorkletNode().subscribe({
            next: (audioWorkletNode) => {
              this._audioPeakProcessorWorkletNode = audioWorkletNode;
              this._audioPeakProcessorWorkletNode.port.onmessage = (event: MessageEvent) => {
                this.handleAudioPeakProcessorWorkletNodeMessage(event);
              };
              this._mediaElementAudioSource!.connect(this._audioPeakProcessorWorkletNode).connect(this._mediaElementAudioSource!.context.destination);

              this.onAudioWorkletNodeCreated$.next({
                audioMeterStandard: audioMeterStandard,
              });

              nextCompleteObserver(observer);
            },
            error: (error) => {
              errorCompleteObserver(observer, error);
            },
          });
        } else {
          nextCompleteObserver(observer);
        }
      }
    });
  }

  protected handleAudioPeakProcessorWorkletNodeMessage = (event: MessageEvent) => {
    this.onAudioPeakProcessorWorkletNodeMessage$.next({
      data: event.data,
    });
  };

  destroyAudioPeakProcessorWorkletNode() {
    if (this._audioPeakProcessorWorkletNode) {
      try {
        if (this._mediaElementAudioSource) {
          this._audioPeakProcessorWorkletNode.disconnect(this._mediaElementAudioSource.context.destination);
          this._mediaElementAudioSource.disconnect(this._audioPeakProcessorWorkletNode);
        }
        // this._audioPeakProcessorWorkletNode.port.postMessage('stop')  // TODO implement, this doesnt exist yet
        this._audioPeakProcessorWorkletNode.port.onmessage = null;
        this._audioPeakProcessorWorkletNode.port.close();
        this._audioPeakProcessorWorkletNode = void 0;
        this.onAudioWorkletNodeCreated$.next(void 0);
      } catch (e) {
        console.debug(e);
        if (this._audioPeakProcessorWorkletNode) {
          this._audioPeakProcessorWorkletNode.port.onmessage = null;
          this._audioPeakProcessorWorkletNode = void 0;
        }
        this.onAudioWorkletNodeCreated$.next(void 0);
      }
    }
  }

  getThumbnailVttUrl(): string | undefined {
    return this._thumbnailVttUrl;
  }

  loadThumbnailVttUrl(thumbnailVttUrl: string): Observable<void> {
    return passiveObservable((observer) => {
      this._thumbnailVttUrl = thumbnailVttUrl;
      this.onThumbnailVttUrlChanged$.next({thumbnailVttUrl});
      this._videoDomController.loadThumbnailVtt(thumbnailVttUrl);
      nextCompleteObserver(observer);
    });
  }

  getHTMLAudioUtilElement(): HTMLAudioElement {
    return this._videoDomController.getAudioUtilElement();
  }

  getConfig(): VideoControllerConfig {
    return this._config;
  }

  getHls(): Hls | undefined {
    if (this._videoLoader instanceof VideoHlsLoader) {
      return this._videoLoader.getHls();
    } else {
      return void 0;
    }
  }

  updateActiveNamedEventStreams(eventNames: OmpNamedEvents[]): Observable<void> {
    return passiveObservable((observer) => {
      this._activeNamedEventStreams = [...[...new Set(eventNames)].map((eventName) => OmpNamedEvents[eventName as keyof typeof OmpNamedEvents])];
      this.onActiveNamedEventStreamsChange$.next(this.getActiveNamedEventStreams());
      nextCompleteObserver(observer);
    });
  }

  getActiveNamedEventStreams(): OmpNamedEvents[] {
    return [...this._activeNamedEventStreams];
  }

  loadBlackVideo(): Observable<Video> {
    return this.loadVideo(this._blackMp4Url, 30, {
      protocol: 'native'
    })
  }

  destroy() {
    this.destroyAudioContext();
    this.destroyAudioRouter();
    this.destroyAudioPeakProcessorWorkletNode();

    this.removeAllSubtitlesTracks();

    nextCompleteSubject(this._videoEventBreaker$);
    nextCompleteSubject(this._seekBreaker$);
    completeSubjects(this._videoFrameCallback$);

    completeUnsubscribeSubjects(
      this.onVideoLoaded$,
      this.onVideoLoading$,
      this.onPlay$,
      this.onPause$,
      this.onVideoTimeChange$,
      this.onSeeking$,
      this.onSeeked$,
      this.onBuffering$,
      this.onEnded$,
      this.onVideoError$,
      this.onVolumeChange$,
      this.onFullscreenChange$,
      this.onVideoSafeZoneChange$,
      this.onVideoWindowPlaybackStateChange$,

      this.onAudioLoaded$,
      this.onAudioSwitched$,

      this.onHelpMenuChange$,
      this.onPlaybackState$,
      this.onPlaybackRateChange$,

      this.onSubtitlesLoaded$,
      this.onSubtitlesCreate$,
      this.onSubtitlesRemove$,
      this.onSubtitlesShow$,
      this.onSubtitlesHide$,

      this.onActiveNamedEventStreamsChange$,
      this.onNamedEvent$
    );

    destroyer(this._videoLoader);

    nextCompleteSubject(this._destroyed$);

    nullifier(
      this._videoDomController,
      this._playbackStateMachine,
      this._helpMenuGroups,
      this._video,

      this._activeSubtitlesTrack,
      this._subtitlesTracks
    );
  }
}
