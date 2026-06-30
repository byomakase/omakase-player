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

import {
  type AudioState,
  type MainMediaState,
  type MainMediaUpdateableAttrs,
  type TextTrackState,
  type Track
} from '../media';
import {
  BehaviorSubject,
  concat,
  delay,
  filter,
  forkJoin,
  fromEvent,
  interval,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap,
  timeout
} from 'rxjs';
import {ObserverBreaker} from '../common/observer-breaker';
import {isNullOrUndefined} from '../util/util-functions';
import Decimal from 'decimal.js';
import {MediaElementPlayback, type MediaElementPlaybackState} from '../common/media-element-playback';
import {Validators} from '../common/validators';
import {z} from 'zod';
import {
  describedObservable,
  errorCompleteObserver,
  freeObserver,
  nextCompleteObserver,
} from '../util/rxjs-util';
import {MediaTemporalConverter, MediaTemporalFormat, type MediaTemporalFormatValueMap} from '../common';
import {
  type LoadMainMediaArgsType,
  type PlayerController,
  type PlayerControllerEvent,
  PlayerControllerEventType,
  type PlayerControllerPlaybackProgressEventData,
  type PlayerDomController,
  type RestoreMainMediaSessionArgsType,
} from './player-controller-api';
import {PLAYER_CONTROLLER_DEFAULTS} from '../constants';
import {SourceUtil} from '../source';
import {CryptoUtil} from '../util/crypto-util';
import type {HlsAudioState, HlsTextTrackState} from '../hls';
import {HTMLMediaElementEvent, HtmlMediaElementUtil, HTMLVideoElementEvent} from '../dom/dom-media-element';
import {StringUtil} from '../util/string-util';
import {OmakaseAudioContextProvider} from '../omakase-audio-context-provider';
import type {VideoKeyframe, VideoKeyframeOptions} from '../tools/keyframe-extractor';

export interface PlayerControllerConfig {}

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

export type AudioTrackIdentifier = any;
export type TextTrackIdentifier = any;

export abstract class BasePlayerController<C extends PlayerControllerConfig> implements PlayerController {
  protected readonly _onEvent$: Subject<PlayerControllerEvent> = new Subject<PlayerControllerEvent>();

  protected readonly _playerControllerId: string;

  protected _config: C;

  protected _playerDomController: PlayerDomController;
  protected _mainMediaState?: MainMediaState | undefined;
  protected _mediaTemporalConverter?: MediaTemporalConverter | undefined;

  /**
   * Stream of data provided by videoElement.requestVideoFrameCallback()
   * @protected
   */
  protected readonly _videoFrameCallback$: Subject<VideoFrameCallbackData | undefined> = new BehaviorSubject<VideoFrameCallbackData | undefined>(void 0);

  protected _mediaElementPlayback?: MediaElementPlayback | undefined;
  protected _syncFrameNudgeTime: number = 0;
  protected _syncFineFrameTolerancePercent = 20;
  protected _syncLoopMaxIterations = 5;
  protected _videoFrameCallbackHandle?: number | undefined;

  protected _videoStalledCheckIntervalMs = 1000;
  protected _videoStalledCheckLastCurrentTime?: number | undefined;
  protected _videoPausedSeekBufferingThresholdMs = 500;

  protected _createMediaElementSourceEnabled: boolean = true;

  /**
   * Stores last video playback state {@link _mediaElementPlayback} before {@link _mediaElementPlayback.waitingSyncedMedia} changes to true
   * Used for restoring playback after {@link _mediaElementPlayback.waitingSyncedMedia} changes to false
   * @protected
   */
  protected _waitingSyncedMediaLastPlaybackState: MediaElementPlaybackState | undefined = void 0;

  protected _loadBreaker = new ObserverBreaker();
  /**
   * Circut breaker for media events
   * @protected
   */
  protected _mediaEventBreaker = new ObserverBreaker();
  /**
   * Cancels previous unfinished pause operation
   * @protected
   */
  protected _pausingBreaker = new ObserverBreaker();
  /**
   * Cancels previous unfinished seek operation if ie. new seek is requested
   * @protected
   */
  protected _seekBreaker = new ObserverBreaker();
  /**
   * Cancels unfinished keyframe extraction if a new one was triggered
   * @protected
   */
  protected _extractVideoKeyframeBreaker = new ObserverBreaker();

  protected _destroyBreaker = new ObserverBreaker();

  protected _textMediaCaptionsElement: HTMLElement;
  protected _textImscElement: HTMLElement;

  protected constructor(playerDomController: PlayerDomController, config: C) {
    this._playerDomController = playerDomController;

    this._config = config;

    this._playerControllerId = CryptoUtil.uuid();

    this._textMediaCaptionsElement = this._playerDomController.textMediaCaptionsElement;
    this._textImscElement = this._playerDomController.textImscElement;
  }

  abstract loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean>;

  abstract resolveAudioTrackIdentifier(track: HlsAudioState): AudioTrackIdentifier;
  abstract isAudioTrackActive(track: AudioState): boolean;
  abstract resolveActiveAudioTracks(tracks: AudioState[]): AudioState[];
  abstract switchAudioTrack(track: AudioState, activate: boolean): Observable<void>;

  abstract get textTracksDisplayed(): boolean;
  abstract setTextTracksDisplayed(textTracksDisplayed: boolean): void;
  abstract resolveTextTrackIdentifier(track: HlsTextTrackState): TextTrackIdentifier;
  abstract isTextTrackActive(track: TextTrackState): boolean;
  abstract resolveActiveTextTracks(tracks: TextTrackState[]): TextTrackState[];
  abstract switchTextTrack(track: TextTrackState, activate: boolean): Observable<void>;

  get onEvent$(): Observable<PlayerControllerEvent> {
    return this._onEvent$.asObservable();
  }

  protected checkMainMediaEssentials() {
    if (!this._mainMediaState) {
      throw new Error(`Main media is not binded`);
    }

    if (isNullOrUndefined(this._mainMediaState.duration)) {
      throw new Error(`Main media duration not provided`);
    }
  }

  wireEvents(mainMediaState: MainMediaState) {
    this.unwireEvents();

    this._mainMediaState = mainMediaState;
    this._mediaTemporalConverter = MediaTemporalConverter.create({
      duration: mainMediaState.duration,
      frameRateModel: mainMediaState.frameRateModel,
      ffomTimecodeModel: mainMediaState.ffomTimecodeModel,
      initSegmentTimeOffset: mainMediaState.initSegmentTimeOffset,
      hasVideo: mainMediaState.hasVideo,
      hasAudio: mainMediaState.hasAudio
    });

    this.checkMainMediaEssentials();

    if (StringUtil.isNonEmpty(this._mainMediaState.loadOptions?.poster)) {
      this._playerDomController.setVideoPoster(this._mainMediaState.loadOptions!.poster!);
    }

    if (this._mainMediaState.frameRateModel) {
      this._syncFrameNudgeTime = Decimal.mul(this._mainMediaState.frameRateModel.frameDuration, 0.1).toNumber();
    }

    this._mediaElementPlayback = new MediaElementPlayback();

    this.initEventHandlers();
    this.startTimeSynchronizationCallback();
  }

  initEventHandlers() {
    let latestSeekStartTime: number | undefined;

    fromEvent(this._playerDomController.mainMediaVideoElement, HTMLMediaElementEvent.PLAYING)
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe({
        next: () => {
          this._onEvent$.next({
            type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAY,
            data: this.createMediaControllerPlayEvent(),
          });
        },
      });

    fromEvent(this._playerDomController.mainMediaVideoElement, HTMLMediaElementEvent.PAUSE)
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe({
        next: () => {
          let finalizePause = () => {
            this.emitPlaybackProgress();
            this._onEvent$.next({
              type: PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE,
              data: this.createMediaControllerPlayEvent(),
            });

            if (this._getCurrentVideoTime() >= this.getDuration()) {
              this._onEvent$.next({
                type: PlayerControllerEventType.PLAYER_CONTROLLER_ENDED,
                data: this.createMediaControllerPlayEvent(),
              });
            }
          };

          if (this._getCurrentVideoTime() >= this.getDuration() || !this._mainMediaState?.frameRateModel) {
            finalizePause();
          } else {
            // console.debug(`%cpause control sync start`, 'color: purple');
            this._seekFromCurrentFrame(1)
              .pipe(takeUntil(this._pausingBreaker.observer), takeUntil(this._seekBreaker.observer), take(1))
              .subscribe({
                next: () => {
                  // console.debug(`%cpause control sync end`, 'color: purple');
                  finalizePause();
                },
              });
          }
        },
      });

    fromEvent(this._playerDomController.mainMediaVideoElement, HTMLMediaElementEvent.WAITING)
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._mediaElementPlayback!.waiting = true;
      });

    fromEvent(this._playerDomController.mainMediaVideoElement, HTMLMediaElementEvent.PROGRESS)
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._onEvent$.next({
          type: PlayerControllerEventType.PLAYER_CONTROLLER_BUFFERING,
          data: {
            bufferedTimeRanges: HtmlMediaElementUtil.resolveBufferedTimeRanges(this._playerDomController.mainMediaVideoElement),
          },
        });
      });

    fromEvent(this._playerDomController.mainMediaVideoElement, HTMLMediaElementEvent.ENDED)
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._onEvent$.next({
          type: PlayerControllerEventType.PLAYER_CONTROLLER_ENDED,
          data: this.createMediaControllerPlayEvent(),
        });
      });

    fromEvent(this._playerDomController.mainMediaVideoElement, HTMLMediaElementEvent.RATECHANGE)
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._onEvent$.next({
          type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE,
          data: {
            playbackRate: this.playbackRate,
          },
        });
      });

    fromEvent(this._playerDomController.mainMediaVideoElement, HTMLMediaElementEvent.DURATIONCHANGE)
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._onEvent$.next({
          type: PlayerControllerEventType.PLAYER_CONTROLLER_DURATION_UPDATE,
          data: {
            duration: this._playerDomController.mainMediaVideoElement.duration,
          },
        });
      });

    this._mediaElementPlayback!.onChange$.pipe(takeUntil(this._mediaEventBreaker.observer)).subscribe((event) => {
      this._onEvent$.next({
        type: PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE,
        data: {
          mediaElementPlaybackState: this._mediaElementPlayback!.state,
          currentTime: this.getCurrentTime(),
        },
      });
    });

    this.onEvent$
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAY))
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._mediaElementPlayback!.setPlaying();
        this._videoStalledCheckLastCurrentTime = void 0;
      });

    this.onEvent$
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE))
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._videoStalledCheckLastCurrentTime = void 0;
        this._mediaElementPlayback!.setPaused();
      });

    this.onEvent$
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING))
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._mediaElementPlayback!.seeking = true;
        latestSeekStartTime = performance.now();
      });

    this.onEvent$
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED))
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._mediaElementPlayback!.seeking = false;
        this._mediaElementPlayback!.waiting = false;
        latestSeekStartTime = void 0;
      });

    this.onEvent$
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_ENDED))
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((event) => {
        this._mediaElementPlayback!.setEnded();
        this._videoStalledCheckLastCurrentTime = void 0;
      });

    this.onEvent$
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS))
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe({
        next: () => {
          // pauses video if waitingSyncedMedia is set and video is playing
          if (this._mediaElementPlayback && this._mediaElementPlayback.waitingSyncedMedia && this.isPlaying()) {
            this._pause();
          }
        },
      });

    interval(this._videoStalledCheckIntervalMs)
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .subscribe((value) => {
        let currentTime = this.getCurrentTime();

        if (!this._videoStalledCheckLastCurrentTime) {
          this._videoStalledCheckLastCurrentTime = currentTime;
          return;
        }

        if (this._mediaElementPlayback && this._mediaElementPlayback.state.playing) {
          let timeOffset = ((this._videoStalledCheckIntervalMs * 0.8) / 1000) * this.playbackRate; // in seconds
          let comparisonTime = this._videoStalledCheckLastCurrentTime + timeOffset;

          let isWaiting = currentTime < comparisonTime;
          this._mediaElementPlayback.waiting = isWaiting;

          this._videoStalledCheckLastCurrentTime = currentTime;
        }

        if (this._mediaElementPlayback && !this._mediaElementPlayback.state.playing && !isNullOrUndefined(latestSeekStartTime)) {
          let isWaiting = !!latestSeekStartTime && performance.now() - latestSeekStartTime > this._videoPausedSeekBufferingThresholdMs;
          if (isWaiting) {
            // set waiting only if seek operation is taking too long, onSeeked event will eventually reset waiting state
            this._mediaElementPlayback.waiting = true;
          }
        }
      });
  }

  unwireEvents(): void {
    try {
      this._mediaEventBreaker.break();
    } catch (err) {
      // nop
    }

    this._mainMediaState = void 0;
    this._mediaTemporalConverter = void 0;

    this.stopSynchronizationCallbacks();
  }

  restoreMainMediaSession(args: RestoreMainMediaSessionArgsType): Observable<void> {
    let beforeLoad$: Observable<void>[] = [];
    let afterLoad$: Observable<void>[] = [];

    let beforeLoad = (o$: Observable<any>) => {
      beforeLoad$.push(o$);
    };

    let afterLoad = (o$: Observable<any>) => {
      afterLoad$.push(o$);
    };

    let oCount = 0;
    let describeMe = (title: string, source$: Observable<void>) => {
      return describedObservable(`${++oCount} | ${title}`, source$, 2);
    };

    beforeLoad(
      describeMe(
        `Dummy 0`,
        new Observable((observer) => {
          nextCompleteObserver(observer);
        })
      )
    );

    let loadMainMedia$ = describeMe(
      `Main media load`,
      new Observable((observer) => {
        this.loadMainMedia({
          providedMainMedia: args.mainMedia,
          url: SourceUtil.resolveUrlFromSourceState(args.mainMedia.source),
          loadOptions: args.mainMedia.loadOptions,
          mainMediaEssentialArgsHook: (args: MainMediaUpdateableAttrs) => new Observable((o) => nextCompleteObserver(o)),
          tracksCreatedHook: (tracks: Track[]) => new Observable((o) => nextCompleteObserver(o)),
        }).subscribe({
          next: () => {
            args.mainMediaLoadedHook().subscribe({
              next: () => {
                nextCompleteObserver(observer);
              },
              error: (err) => {
                errorCompleteObserver(observer, err);
              },
            });
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
      })
    );

    [1, 2, 3].forEach((e) => {
      afterLoad(
        describeMe(
          `Dummy ${e}`,
          new Observable((observer) => {
            nextCompleteObserver(observer);
          })
        )
      );
    });

    return new Observable((observer) => {
      concat(forkJoin(beforeLoad$), loadMainMedia$, forkJoin(afterLoad$)).subscribe({
        complete: () => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  protected startTimeSynchronizationCallback() {
    this.checkMainMediaEssentials();

    let isSW = (!!this._mainMediaState?.hasAudio && !this._mainMediaState?.hasVideo) || !!this._mainMediaState!.hasDrm;
    let isRVFC = this._playerDomController.mainMediaVideoElement && 'requestVideoFrameCallback' in this._playerDomController.mainMediaVideoElement;

    if (isSW) {
      this.startSWSynchronization();
    } else if (isRVFC) {
      this.startRVFCSynchronization();
    } else {
      throw new Error('Could not detect time synchronization method');
    }
  }

  protected startSWSynchronization() {
    // console.debug('startSWSynchronization');
    OmakaseAudioContextProvider.instance.onSyncTick$
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (event) => {
          if (!this._mediaElementPlayback!.seeking) {
            if (this.isPlaying()) {
              this.emitPlaybackProgress();
            } else if (this.isPaused()) {
              // nop
            }
          }
        },
      });
  }

  protected startRVFCSynchronization() {
    // console.debug('startRVFCSynchronization');
    let nextVideoFrameCallback = () => {
      if (this._playerDomController.mainMediaVideoElement) {
        this._videoFrameCallbackHandle = this._playerDomController.mainMediaVideoElement.requestVideoFrameCallback((now, metadata) => {
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

    this._videoFrameCallback$
      .pipe(takeUntil(this._mediaEventBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((videoFrameCallbackData) => {
        if (videoFrameCallbackData) {
          if (!this._mediaElementPlayback!.seeking) {
            if (this.isPlaying()) {
              this.emitPlaybackProgress();
            } else if (this.isPaused()) {
              // nop
            }
          }
        }
      });
  }

  protected stopSynchronizationCallbacks() {
    this.stopRVFCSynchronization();
  }

  protected stopRVFCSynchronization() {
    if (this._playerDomController.mainMediaVideoElement && this._videoFrameCallbackHandle) {
      this._playerDomController.mainMediaVideoElement.cancelVideoFrameCallback(this._videoFrameCallbackHandle);
    }
  }

  protected emitPlaybackProgress(): void {
    let currentTime = this.getCurrentTime();
    this._onEvent$.next({
      type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS,
      data: {
        currentTime: currentTime,
      },
    });
  }

  getCurrentTime(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getCurrentTime<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getCurrentTime(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    this.checkMainMediaEssentials();
    let videoTime = this._getCurrentVideoTime();
    if (format === MediaTemporalFormat.SECONDS) {
      return this.toPlayerTime(videoTime);
    }
    return this._mediaTemporalConverter!.convert(videoTime, MediaTemporalFormat.SECONDS, format);
  }

  convertTime<S extends MediaTemporalFormat, D extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[S], valueFormat: S, destinationFormat: D): MediaTemporalFormatValueMap[D];
  convertTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], valueFormat: MediaTemporalFormat, destinationFormat: MediaTemporalFormat): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    this.checkMainMediaEssentials();
    const offset = this._mainMediaState?.initSegmentTimeOffset ?? 0;
    const adjustedValue = valueFormat === MediaTemporalFormat.SECONDS ? (value as number) + offset : value;
    const result = this._mediaTemporalConverter!.convert(adjustedValue, valueFormat, destinationFormat);
    return destinationFormat === MediaTemporalFormat.SECONDS ? this.toPlayerTime(result as number) : result;
  }

  private toPlayerTime(mediaSeconds: number): number {
    return Math.max(0, mediaSeconds - (this._mainMediaState?.initSegmentTimeOffset ?? 0));
  }

  getDuration(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getDuration<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getDuration(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    this.checkMainMediaEssentials();
    let seconds = this._mainMediaState!.duration!;
    return this._mediaTemporalConverter!.convert(seconds, MediaTemporalFormat.SECONDS, format);
  }

  protected createMediaControllerPlayEvent(): PlayerControllerPlaybackProgressEventData {
    return {
      currentTime: this.getCurrentTime(),
    };
  }

  private syncVideoFrames(syncConditions: SyncConditions): Observable<boolean> {
    // console.debug('syncFrames - START', syncConditions);
    this.checkMainMediaEssentials();
    if (!this._mainMediaState?.frameRateModel) {
      return new Observable((observer) => {
        nextCompleteObserver(observer, false);
      });
    }
    return new Observable<boolean>((o$) => {
      let syncBreaker$ = new BehaviorSubject<boolean>(false);
      let syncLoopVideoCallbackBreaker$ = new Subject<void>();
      let syncLoopIterationsLeft = this._syncLoopMaxIterations;

      this._seekBreaker.observer.pipe(takeUntil(syncLoopVideoCallbackBreaker$)).subscribe(() => {
        // console.debug(`%csyncFrames - seek breaker triggered`, 'color: gray');
        syncBreaker$.next(true);
        completeSync();
      });

      let completeSync = () => {
        nextCompleteObserver(syncLoopVideoCallbackBreaker$);
        nextCompleteObserver(o$, true);
        // console.debug(`%csyncFrames - END`, 'color: gray');
      };

      let seek = (time: number) => {
        syncBreaker$.pipe(take(1)).subscribe((syncBreak) => {
          if (syncBreak) {
            // console.debug(`%csyncFrames - seek skipped, breaker already triggered`, 'color: gray');
          } else {
            this._seekTimeFireAndForget(time);
          }
        });
      };

      /**
       * For now we want to check frame time tolerance only for fractional non-drop frame rates
       */
      let shouldCheckFrameTimeTolerance = () => {
        return !!(this._mainMediaState!.frameRateModel && !this._mainMediaState!.frameRateModel.dropFrames && Number.isInteger(this._mainMediaState!.frameRateModel.value));
      };

      /**
       * Negative percentage indicates currentTime is behind actual video time
       */
      let currentFrameTimeToleranceCheck = () => {
        let currentTime = this._getCurrentVideoTime();

        let currentTimeFrame = this._mediaTemporalConverter!.convert(currentTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
        let currentTimeIdealVsRealDiff = this._mediaTemporalConverter!.convert(currentTimeFrame, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
        let frameDiffPercentage = Decimal.mul(currentTimeIdealVsRealDiff, 100).div(this._mainMediaState!.frameRateModel!.frameDuration).toNumber();
        return frameDiffPercentage;
      };

      if (this.isPlaying()) {
        // console.debug(`%csyncFrames - SKIPPED: video is playing`, 'color: gray');
        completeSync();
      } else if (this._getCurrentVideoTime() >= this.getDuration()) {
        // console.debug(`%csyncFrames - SKIPPED: video exceeded duration`, 'color: magenta');
        completeSync();
      } else {
        let checkIfDone = (videoFrameCallbackData?: VideoFrameCallbackData) => {
          let currentTime = this._getCurrentVideoTime();
          let currentTimeFrame = this._mediaTemporalConverter!.convert(currentTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
          let mediaTime = videoFrameCallbackData ? videoFrameCallbackData.metadata.mediaTime : void 0;
          let mediaTimeFrame = mediaTime ? this._mediaTemporalConverter!.convert(mediaTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT) : void 0;

          // console.debug(`syncFrames.checkIfDone`, {
          //   currentTime: currentTime,
          //   currentTimeFrame: currentTimeFrame,
          //   currentTimeTimecode: TimecodeUtil.formatToTimecode(currentTime, this._frameRateDecimal!, this._video!.dropFrame),
          //   mediaTime: mediaTime,
          //   mediaTimeFrame: mediaTimeFrame,
          //   videoFrameCallbackData: videoFrameCallbackData
          // });

          if (this.isPlaying()) {
            // console.debug(`%csyncFrames - UNKNOWN: video is playing`, 'color: gray');
            return true;
          }

          if (currentTimeFrame === 0) {
            // console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === 0`, 'color: green');
            return true;
          }

          if (syncConditions.seekToFrame) {
            if (syncConditions.seekToFrame === currentTimeFrame) {
              if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
                // console.debug(`%csyncFrames - OK: ((currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]) || !mediaTimeFrame[${mediaTimeFrame}])`, 'color: green');
                return true;
              }
            }
          } else {
            if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
              // console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]`, 'color: green', {
              //   currentTime: currentTime,
              //   mediaTime: mediaTime,
              // });

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
          // console.debug(`syncFrames.syncLoop - START (${syncLoopIteration})`, {
          //   syncConditions: syncConditions,
          //   videoFrameCallbackData: videoFrameCallbackData,
          //   dropped: this.videoElement.getVideoPlaybackQuality(),
          // });

          if (this.isPlaying()) {
            completeSync();
            return;
          }

          if (checkIfDone(videoFrameCallbackData)) {
            completeSync();
            return;
          }

          let currentTime = this._getCurrentVideoTime();
          let currentTimeFrame = this._mediaTemporalConverter!.convert(currentTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
          let mediaTime = videoFrameCallbackData ? videoFrameCallbackData.metadata.mediaTime : void 0;
          let mediaTimeFrame = mediaTime ? this._mediaTemporalConverter!.convert(mediaTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT) : void 0;

          if (syncLoopIterationsLeft-- <= 0) {
            // console.debug(
            //   `%csyncFrames - TOO MANY SYNCs, EXITING.. : currentTime[${currentTime}], mediaTime[${mediaTime}], currentTimeFrame[${currentTimeFrame}], mediaTimeFrame[${mediaTimeFrame}]`,
            //   'color: red'
            // );
            completeSync();
            return;
          }

          // console.debug(
          //   `syncFrames - currentTime[${currentTime}|${this.formatToTimecode(currentTime)}], mediaTime[${mediaTime}|${mediaTime ? this.formatToTimecode(mediaTime) : void 0}], currentTimeFrame[${currentTimeFrame}], mediaTimeFrame[${mediaTimeFrame}], `
          // );

          if (syncConditions.seekToFrame) {
            if (!seekToFrameTimeBaseline) {
              seekToFrameTimeBaseline = currentTime;
            }

            if (syncConditions.seekToFrame === currentTimeFrame) {
              if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
                // console.debug(`%csyncFrames - OK: ((currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]) || !mediaTimeFrame[${mediaTimeFrame}])`, 'color: green');
                completeSync();
              } else {
                // console.debug(
                //   `%csyncFrames - CORRECTION SEEK TO FRAME; currentTimeFrame[${currentTimeFrame}] ${currentTimeFrame > mediaTimeFrame ? '>' : '<'} mediaTimeFrame[${mediaTimeFrame}]`,
                //   'color: red'
                // );

                let frameDiff = Math.abs(currentTimeFrame - mediaTimeFrame);
                // console.debug(`%csyncFrames - frameDiff: ${frameDiff}`, 'color: orange');

                // in first sync iteration seek without nudging (frameCorrectionTime = 0)
                let frameCorrectionTime = syncLoopIteration === 0 ? 0 : this._syncFrameNudgeTime * (currentTimeFrame > mediaTimeFrame ? 1 : -1);

                seek(Decimal.add(currentTime, frameCorrectionTime).toNumber());
              }
            } else {
              // console.debug(`%csyncFrames - CORRECTION SEEK TO FRAME; syncConditions.seekToFrame[${syncConditions.seekToFrame}] !== currentTimeFrame[${currentTimeFrame}] | seekToFrameTimeBaseline=${seekToFrameTimeBaseline}`, 'color: red');

              let frameDiff = Math.abs(syncConditions.seekToFrame - currentTimeFrame);
              let frameCorrectionTime = frameDiff * this._mainMediaState!.frameRateModel!.frameDuration;

              let seekToDecimal =
                syncConditions.seekToFrame >= currentTimeFrame ? Decimal.add(seekToFrameTimeBaseline, frameCorrectionTime) : Decimal.sub(seekToFrameTimeBaseline, frameCorrectionTime);
              let seekTo = seekToDecimal.toNumber();

              seekToFrameTimeBaseline = seekTo;

              // console.debug(`%csyncFrames - frameDiff: ${frameDiff}`, 'color: orange');
              // console.debug(`%csyncFrames - frameCorrectionTime: ${frameCorrectionTime}`, 'color: orange');
              // console.debug(`%csyncFrames - seekTo: ${seekTo}`, 'color: orange');

              seek(seekTo);
            }
          } else {
            if (currentTimeFrame === mediaTimeFrame || !mediaTimeFrame) {
              // console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]`, 'color: green');

              if (shouldCheckFrameTimeTolerance()) {
                let currentFrameTimeTolerance = currentFrameTimeToleranceCheck();
                // only seek if we have to seek forward, we don't want to seek backwards
                if (currentFrameTimeTolerance < 0 && Math.abs(currentFrameTimeTolerance) > this._syncFineFrameTolerancePercent) {
                  // console.debug(`%c syncFrames - FINE FRAME TUNING`, 'color: blue');
                  // currentTime returned by video element lags behind actual currentTime, shake it up a bit
                  seek(currentTime);
                } else {
                  completeSync();
                }
              } else {
                completeSync();
              }
            } else {
              // console.debug(`%csyncFrames - CORRECTION; currentTimeFrame[${currentTimeFrame}] ${currentTimeFrame > mediaTimeFrame ? '>' : '<'} mediaTimeFrame[${mediaTimeFrame}]`, 'color: red');
              if (syncLoopIteration === 0) {
                // first sync loop iteration, give video element some more time to update mediaTime, thus repeat initial seek
                seek(currentTime);
              } else {
                if (currentTimeFrame > mediaTimeFrame) {
                  seek(Decimal.add(currentTime, this._syncFrameNudgeTime).toNumber());
                } else if (mediaTime) {
                  seek(mediaTime + this._syncFrameNudgeTime);
                }
              }
            }
          }

          // console.debug('syncFrames.syncLoop - END');

          completeSync();
        };
        this._videoFrameCallback$.pipe(delay(syncConditions.seekToFrame ? 0 : 0), takeUntil(syncLoopVideoCallbackBreaker$)).subscribe({
          next: (videoFrameCallbackData) => {
            // console.debug('syncFrames.syncLoop - videoFrameCallback$ trigger', videoFrameCallbackData);
            syncLoop(videoFrameCallbackData);
          },
        });
      }
    });
  }

  /**
   * Three consecutive seeks are executed:
   *  1. Seeks to video duration. After first seek and video.seeked event, video element should trigger video.ondurationchange and we'll have new duration value available
   *  2. Seeks to a time just before last frame ends
   *  3. Seeks to video duration which aligns video.currentTime with video.duration
   *
   * @private
   */
  private _seekToEnd(): Observable<boolean> {
    let duration = this.getDuration();
    console.debug(`%c seekToEnd: ${duration}`, 'color: salmon');
    return this.seekTimeWithoutSync(duration, false, false).pipe(
      switchMap(() => {
        duration = this.getDuration(); // we want fresh value
        let timeInLastFrame = duration - this._syncFrameNudgeTime;
        console.debug(`Seek to before last frame ends`);
        return this.seekTimeWithoutSync(timeInLastFrame, false, false).pipe(
          switchMap(() => {
            console.debug(`Seek to align video.currentTime and video.duration`);
            return this.seekTimeWithoutSync(duration, true, true).pipe(
              tap(() => {
                this._onEvent$.next({
                  type: PlayerControllerEventType.PLAYER_CONTROLLER_ENDED,
                  data: this.createMediaControllerPlayEvent(),
                });
              })
            );
          })
        );
      })
    );
  }

  /**
   *
   * @param framesCount Positive or negative number of frames. If positive - seek forward, if negative - seek backward.
   */
  private _seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    let currentFrame = this.getCurrentTime(MediaTemporalFormat.FRAME_COUNT);
    let seekToFrame = this.constrainSeekFrame(currentFrame + framesCount);

    // console.debug(`seekFromCurrentFrame - Current frame: ${currentFrame}, wanted frame: ${seekToFrame}`);

    if (currentFrame !== seekToFrame) {
      if (seekToFrame <= 0) {
        return this._seekToFrame(0);
      } else if (seekToFrame >= this.getTotalFrames()) {
        return this.seekToEnd();
      } else {
        let timeOffset = this._mediaTemporalConverter!.convert(Math.abs(framesCount), MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS) * Math.sign(framesCount);
        let currentTime = Decimal.div(currentFrame, this._mainMediaState!.frameRateModel!.value).plus(PLAYER_CONTROLLER_DEFAULTS.frameDurationSpillOverCorrection).toNumber();
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

  private _seekTimeFireAndForget(newTime: number) {
    if (!isNaN(newTime)) {
      newTime = this.constrainSeekTime(newTime);
      this.setCurrentTime(newTime);
    }
  }

  private _seekToFrame(frame: number): Observable<boolean> {
    if (!this.isPlaying() && !isNaN(frame)) {
      // console.debug(`Seeking to frame: ${frame}`);
      if (frame <= 0) {
        return this.seekTimeAndSync(0, {});
      } else {
        let duration = this.getDuration();
        let frameStartTime = this._mediaTemporalConverter!.convert(frame, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
        let frameStartTimeWithSpillOver = Decimal.add(frameStartTime, PLAYER_CONTROLLER_DEFAULTS.frameDurationSpillOverCorrection).toNumber();
        let frameTimeToSeek = frameStartTimeWithSpillOver;

        // check last frame edge cases
        if (frameStartTimeWithSpillOver > duration) {
          console.debug(`Frame time start with spillover [${frameStartTimeWithSpillOver}] exceeds video duration [${duration}]`, {
            frameTimeWithSpillOver: frameStartTimeWithSpillOver,
            duration: duration,
            frameStartTime: frameStartTime,
          });

          return this._seekToEnd();
        } else {
          return this.seekTimeAndSync(frameTimeToSeek, {
            seekToFrame: frame,
            seekToTime: frameTimeToSeek,
            currentTime: this._getCurrentVideoTime(),
            newTimecode: this._mediaTemporalConverter!.convert(frameTimeToSeek, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE),
          });
        }
      }
    } else {
      return of(false);
    }
  }

  /**
   *
   * @param timeOffset Time offset in seconds
   * @param syncConditions
   */
  private seekFromCurrentTimeAndSync(timeOffset: number, syncConditions: SyncConditions = {}): Observable<boolean> {
    let currentTime = this._getCurrentVideoTime();
    // sync to frame start
    if (syncConditions.currentTime) {
      currentTime = syncConditions.currentTime;
    }
    let newTime = Decimal.add(currentTime, timeOffset).toNumber();
    return this.seekTimeAndSync(newTime, syncConditions);
  }

  private setCurrentTime(time: number) {
    this._playerDomController.mainMediaVideoElement.currentTime = time;
  }

  private _getCurrentVideoTime(): number {
    return this._playerDomController.mainMediaVideoElement.currentTime;
  }

  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    this._checkAndCancelPausing();
    switch (format) {
      case MediaTemporalFormat.SECONDS:
        return this.seekToTime(value as MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS]);
      case MediaTemporalFormat.FRAME_COUNT:
        return this.seekToFrame(value as MediaTemporalFormatValueMap[MediaTemporalFormat.FRAME_COUNT]);
      case MediaTemporalFormat.PERCENT:
        let percent = value as MediaTemporalFormatValueMap[MediaTemporalFormat.PERCENT];
        return this._seekToVideoTime(this._mediaTemporalConverter!.convert(percent, MediaTemporalFormat.PERCENT, MediaTemporalFormat.SECONDS));
      case MediaTemporalFormat.TIMECODE:
        let timecode = value as MediaTemporalFormatValueMap[MediaTemporalFormat.TIMECODE];
        if (this.isPlaying()) {
          return this._seekToVideoTime(this._mediaTemporalConverter!.convert(timecode, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS));
        } else {
          return this.seekToFrame(this._mediaTemporalConverter!.convert(timecode, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.FRAME_COUNT));
        }
      case MediaTemporalFormat.MEDIA_TIME:
        let mediaTime = value as MediaTemporalFormatValueMap[MediaTemporalFormat.MEDIA_TIME];
        return this.seekToTime(this._mediaTemporalConverter!.convert(mediaTime, MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.SECONDS));
      case MediaTemporalFormat.COUNTDOWN_MEDIA_TIME:
        let countdownMediaTime = value as MediaTemporalFormatValueMap[MediaTemporalFormat.COUNTDOWN_MEDIA_TIME];
        return this._seekToVideoTime(this._mediaTemporalConverter!.convert(countdownMediaTime, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.SECONDS));
      default:
        throw new Error(`Unknown format: MediaTemporalFormat.${format}`);
    }
  }

  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    this._checkAndCancelPausing();
    switch (format) {
      case MediaTemporalFormat.SECONDS:
        return this.seekFromCurrentTimeSeconds(value as MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS]);
      case MediaTemporalFormat.FRAME_COUNT:
        return this.seekFromCurrentTimeFrame(value as MediaTemporalFormatValueMap[MediaTemporalFormat.FRAME_COUNT]);
      case MediaTemporalFormat.TIMECODE:
        let timecode = value as MediaTemporalFormatValueMap[MediaTemporalFormat.TIMECODE];
        if (this.isPlaying()) {
          return this.seekFromCurrentTimeSeconds(this.toPlayerTime(this._mediaTemporalConverter!.convert(timecode, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS) as number));
        } else {
          return this.seekFromCurrentTimeFrame(this._mediaTemporalConverter!.convert(timecode, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.FRAME_COUNT));
        }
      case MediaTemporalFormat.MEDIA_TIME:
        let mediaTime = value as MediaTemporalFormatValueMap[MediaTemporalFormat.MEDIA_TIME];
        return this.seekFromCurrentTimeSeconds(this._mediaTemporalConverter!.convert(mediaTime, MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.SECONDS));
      case MediaTemporalFormat.PERCENT:
      case MediaTemporalFormat.COUNTDOWN_MEDIA_TIME:
        throw new Error(`Cannot resolve seeking value from MediaTemporalFormat.${format} format`);
      default:
        throw new Error(`Unknown format: MediaTemporalFormat.${format}`);
    }
  }

  private seekToTime(contentTime: number): Observable<boolean> {
    return this._seekToVideoTime(contentTime + (this._mainMediaState?.initSegmentTimeOffset ?? 0));
  }

  private _seekToVideoTime(time: number): Observable<boolean> {
    // console.debug(`%cseekToTime: ${time}`, 'color: purple');

    time = Validators.mediaTime()(time);

    if (this._mediaElementPlayback!.state.ended && time >= this.getDuration()) {
      return of(false);
    }

    this._checkAndCancelPausing();

    return new Observable<boolean>((observer) => {
      this.seekTimeAndSync(time, {
        seekToTime: time,
        seekDirection: time === this._getCurrentVideoTime() ? 'o' : time > this._getCurrentVideoTime() ? 'fw' : 'bw',
      }).subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  protected seekToFrame(frame: number): Observable<boolean> {
    // console.debug(`%cseekToFrame: ${frame}`, 'color: purple');

    frame = Validators.mediaFrame()(frame);
    // frame = z.coerce.number().min(0).max(this.getTotalFrames()).parse(frame);

    if (this._mediaElementPlayback!.state.ended && frame >= this.getCurrentTime(MediaTemporalFormat.FRAME_COUNT)) {
      return of(false);
    }

    this._checkAndCancelPausing();

    return new Observable<boolean>((observer) => {
      this._seekToFrame(frame).subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  protected seekFromCurrentTimeFrame(framesCount: number): Observable<boolean> {
    framesCount = z.coerce.number().parse(framesCount); // can be negative

    this._checkAndCancelPausing();

    return new Observable<boolean>((observer) => {
      this._seekFromCurrentFrame(framesCount).subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  protected seekFromCurrentTimeSeconds(timeAmount: number): Observable<boolean> {
    timeAmount = z.coerce.number().parse(timeAmount); // can be negative

    return this.seekToTime(this.getCurrentTime() + timeAmount);
  }

  private _checkAndCancelPausing() {
    if (this._mediaElementPlayback!.pausing) {
      this._pausingBreaker.break();
      this._mediaElementPlayback!.setPausing(false);
    }
  }

  seekToEnd(): Observable<boolean> {
    return new Observable<boolean>((observer) => {
      this._seekToEnd().subscribe({
        next: (value) => nextCompleteObserver(observer, value),
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  protected getTotalFrames(): number {
    return this._mediaTemporalConverter!.convert(this.getDuration(), MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
  }

  private constrainSeekTime(time: number): number {
    let duration = this.getDuration();
    return time < 0 ? 0 : time > duration ? duration : time;
  }

  private constrainSeekFrame(frame: number): number {
    return frame < 0 ? 0 : frame > this.getTotalFrames() ? this.getTotalFrames() : frame;
  }

  private seekTimeAndSync(newTime: number, syncConditions: SyncConditions = {}): Observable<boolean> {
    let timeBeforeSeek = this.getCurrentTime();
    return new Observable<boolean>((o$) => {
      // if we already have seek in progress, break previous seek operation
      if (this._mediaElementPlayback!.seeking) {
        this._seekBreaker.break();
        this._mediaElementPlayback!.seeking = false;
      }

      if (!isNaN(newTime)) {
        newTime = this.constrainSeekTime(newTime);
        let duration = this.getDuration();

        if (newTime <= 0) {
          this.seekTimeWithoutSync(0).subscribe(() => {
            nextCompleteObserver(o$, true);
          });
        } else if (newTime === duration) {
          this._seekToEnd().subscribe(() => {
            nextCompleteObserver(o$, true);
          });
        } else {
          fromEvent(this._playerDomController.mainMediaVideoElement, HTMLVideoElementEvent.SEEKING)
            .pipe(takeUntil(this._seekBreaker.observer), take(1))
            .subscribe((event) => {
              if (this._mediaElementPlayback!.pausing) {
                // nop
              } else {
                this._onEvent$.next({
                  type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING,
                  data: {
                    fromTime: timeBeforeSeek,
                    toTime: newTime,
                  },
                });
              }
            });

          fromEvent(this._playerDomController.mainMediaVideoElement, HTMLVideoElementEvent.SEEKED)
            .pipe(takeUntil(this._seekBreaker.observer), take(1))
            .subscribe((event) => {
              let finalizeSeek = () => {
                if (this._mediaElementPlayback!.pausing) {
                  // nop
                } else {
                  let currentTime = this.getCurrentTime();
                  this._onEvent$.next({
                    type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED,
                    data: {
                      currentTime: currentTime,
                      previousTime: timeBeforeSeek,
                    },
                  });
                  this._mediaElementPlayback!.seeking = false;
                }
              };

              let finishSeek = () => {
                this.emitPlaybackProgress();
                nextCompleteObserver(o$, true);
              };

              if (this._getCurrentVideoTime() >= this.getDuration()) {
                if (this.isPaused()) {
                  finalizeSeek();
                  this._seekToEnd().subscribe((event) => {
                    finishSeek();
                  });
                } else {
                  // video is playing, no need to sync frames if video is near the end, it will be done in onPause finalization when video finally ends
                }
              } else {
                this.syncVideoFrames(syncConditions).subscribe((result) => {
                  finalizeSeek();
                  finishSeek();
                });
              }
            });

          // console.debug(`Seeking to timestamp (sync ON): ${newTime} \t ${this.mediaTemporalConverter!.convert(newTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE)}`);
          this.setCurrentTime(newTime);
        }
      }
    });
  }

  private seekTimeWithoutSync(newTime: number, emitSeeking: boolean = true, emitSeeked: boolean = true): Observable<boolean> {
    let timeBeforeSeek = this.getCurrentTime();
    return new Observable<boolean>((o$) => {
      // do we have seek already in progress
      if (this._mediaElementPlayback!.seeking) {
        this._seekBreaker.break();
        this._mediaElementPlayback!.seeking = false;
      }

      if (!isNaN(newTime)) {
        newTime = this.constrainSeekTime(newTime);

        fromEvent(this._playerDomController.mainMediaVideoElement, HTMLVideoElementEvent.SEEKING)
          .pipe(takeUntil(this._seekBreaker.observer), take(1))
          .subscribe((event) => {
            if (emitSeeking) {
              this._onEvent$.next({
                type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING,
                data: {
                  fromTime: timeBeforeSeek,
                  toTime: newTime,
                },
              });
            }
          });

        fromEvent(this._playerDomController.mainMediaVideoElement, HTMLVideoElementEvent.SEEKED)
          .pipe(takeUntil(this._seekBreaker.observer), take(1))
          .subscribe((event) => {
            if (emitSeeked) {
              let currentTime = this.getCurrentTime();
              this._onEvent$.next({
                type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED,
                data: {
                  currentTime: currentTime,
                  previousTime: timeBeforeSeek,
                },
              });
            }

            this._mediaElementPlayback!.seeking = false;

            nextCompleteObserver(o$, true);

            this.emitPlaybackProgress();
          });

        // console.debug(`Seeking to timestamp (sync OFF): ${newTime} \t ${this.formatToTimecode(newTime)}`);

        this.setCurrentTime(newTime);
      }
    });
  }

  get playbackRate(): number {
    return this._playerDomController.mainMediaVideoElement.playbackRate;
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return new Observable<void>((observer) => {
      let newPlaybackRate: number;
      try {
        newPlaybackRate = z.coerce.number().min(0.1).max(16).default(PLAYER_CONTROLLER_DEFAULTS.playbackRate).parse(playbackRate);
      } catch (e) {
        newPlaybackRate = PLAYER_CONTROLLER_DEFAULTS.playbackRate;
      }

      if (newPlaybackRate !== this.playbackRate) {
        this.onEvent$
          .pipe(timeout(PLAYER_CONTROLLER_DEFAULTS.playbackRateUpdateTimeout))
          .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE))
          .pipe(take(1))
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe((event) => {
            nextCompleteObserver(observer);
          });

        this._playerDomController.mainMediaVideoElement.playbackRate = playbackRate;
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  protected isPlaying(): boolean {
    this.checkMainMediaEssentials();
    return (
      this.getCurrentTime() > 0 &&
      this._getCurrentVideoTime() < this.getDuration() &&
      !this._playerDomController.mainMediaVideoElement.paused && // caution: when using default HTML video controls, when seeking while playing - video is actually paused for a moment
      !this._playerDomController.mainMediaVideoElement.ended &&
      this._playerDomController.mainMediaVideoElement.readyState > this._playerDomController.mainMediaVideoElement.HAVE_CURRENT_DATA
    );
  }

  protected isPaused() {
    return !this.isPlaying();
  }

  /**
   * Enables preventing video from returning to stored playback state, if user manually initiated action after waitingSyncedMedia was set
   * @protected
   */
  protected resetWaitingSyncedMediaLastPlaybackState() {
    this._waitingSyncedMediaLastPlaybackState = void 0;
  }

  play(): Observable<void> {
    this.resetWaitingSyncedMediaLastPlaybackState();
    return this._play();
  }

  protected _play(): Observable<void> {
    return new Observable((observer) => {
      if (!this.isPlaying()) {
        this._checkAndCancelPausing();

        let startPlay = () => {
          // first start request video frame callback cycle
          this._playerDomController.mainMediaVideoElement
            .play()
            .then(() => {
              // handled in HTMLVideoElementEventKeys.PLAYING event handler
              nextCompleteObserver(observer);
            })
            .catch((error) => {
              errorCompleteObserver(observer, error);
            });
        };

        OmakaseAudioContextProvider.instance.tryResumeAudioContext().subscribe((event) => {
          startPlay();
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  pause(): Observable<void> {
    this.resetWaitingSyncedMediaLastPlaybackState();
    return this._pause();
  }

  protected _pause(): Observable<void> {
    return new Observable<void>((observer) => {
      if (this.isPlaying()) {
        // let pauseApproximateTime = this.getCurrentTime();
        this._pausingBreaker.break();
        this._pausingBreaker.observer.pipe(take(1)).subscribe({
          next: () => {
            //   console.debug(`%cpausing breaker triggered`, 'color: gray');
            //   this._onEvent$.next({
            //     type: PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE,
            //     data: this.createMediaControllerPlayEvent(),
            //   });
          },
        });

        this._mediaElementPlayback!.setPausing(true);

        this.onEvent$
          .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE))
          .pipe(take(1))
          .pipe(timeout(PLAYER_CONTROLLER_DEFAULTS.pausingPauseTimeout))
          .subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
            error: (e) => {
              console.error(e);
            },
          })
          .add(() => {
            this._pausingBreaker.break();
          });
        this._playerDomController.mainMediaVideoElement.pause();
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  setWaitingForSyncedMedia(syncedMediaWaiting: boolean) {
    if (syncedMediaWaiting && !this._mediaElementPlayback!.waitingSyncedMedia) {
      this._mediaElementPlayback!.waitingSyncedMedia = true;
      this._waitingSyncedMediaLastPlaybackState = this._mediaElementPlayback!.state;
      console.debug(`Received waiting request for synced media`);
    } else if (!syncedMediaWaiting && this._mediaElementPlayback!.waitingSyncedMedia) {
      this._mediaElementPlayback!.waitingSyncedMedia = false;
      console.debug(`Cleared waiting request for synced media`);
      if (this._waitingSyncedMediaLastPlaybackState) {
        if (this._waitingSyncedMediaLastPlaybackState.playing && !this.isPlaying()) {
          this.play().subscribe(() => {
            console.debug(`Playback resumed after waiting request for synced media cleared`);
          });
        }
      }
    }
  }

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe> {
    this._extractVideoKeyframeBreaker.destroy();
    this._extractVideoKeyframeBreaker = new ObserverBreaker();

    return new Observable((observer) => {
      let extract = () => {
        this._playerDomController
          .extractVideoKeyframe(options)
          .pipe(takeUntil(this._extractVideoKeyframeBreaker.observer))
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: (videoKeyframe) => {
              nextCompleteObserver(observer, videoKeyframe);
            },
          });
      };

      if (this.isSeeking()) {
        this.onEvent$
          .pipe(filter((playerEvent) => playerEvent.type === PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED))
          .pipe(take(1))
          .pipe(takeUntil(this._extractVideoKeyframeBreaker.observer))
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: () => {
              extract();
            },
          });
      } else {
        extract();
      }
    });
  }

  protected isSeeking(): boolean {
    return this._mediaElementPlayback!.seeking;
  }

  destroy(): void {
    this.unwireEvents();

    freeObserver(this._onEvent$);
    freeObserver(this._videoFrameCallback$);

    this._playerDomController.resetMainMediaVideoElement();
    this._mediaElementPlayback?.destroy();

    this._loadBreaker.destroy();
    this._mediaEventBreaker.destroy();
    this._pausingBreaker.destroy();
    this._seekBreaker.destroy();

    this._destroyBreaker.break();
  }

  get mediaElementPlayback(): MediaElementPlayback | undefined {
    return this._mediaElementPlayback;
  }

  get mediaTemporalConverter(): MediaTemporalConverter | undefined {
    return this._mediaTemporalConverter;
  }

  get videoElement(): HTMLVideoElement {
    return this._playerDomController.mainMediaVideoElement;
  }

  get textMediaCaptionsElement(): HTMLElement {
    return this._textMediaCaptionsElement;
  }

  get textImscElement(): HTMLElement {
    return this._textImscElement;
  }

  get createMediaElementSourceEnabled(): boolean {
    return this._createMediaElementSourceEnabled;
  }
}
