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
import {AudioEvent, Destroyable, HelpMenuGroup, OmakaseTextTrack, OmakaseTextTrackCue, VideoBufferingEvent, VideoEndedEvent, VideoErrorEvent, VideoLoadedEvent, VideoLoadingEvent, VideoPlayEvent, VideoSeekedEvent, VideoSeekingEvent, VideoTimeChangeEvent, VideoVolumeEvent} from '../types';
import {BehaviorSubject, catchError, delay, fromEvent, interval, map, Observable, of, race, Subject, take, takeUntil, throwError} from 'rxjs';
import {FrameRateUtil} from '../util/frame-rate-util';
import {completeSubjects, completeUnsubscribeSubjects, nextCompleteVoidSubject, nextCompleteVoidSubjects} from '../util/observable-util';
import {z} from 'zod';
import {TimecodeUtil} from '../util/timecode-util';
import {VideoDomController} from './video-dom-controller';
import Hls from 'hls.js';
import {Validators} from '../validators';
import {parseErrorMessage, zodErrorMapOverload} from '../util/error-util';
import {VideoControllerApi} from './video-controller-api';
import {destroyer, nullifier} from '../util/destroy-util';
import {SubtitlesVttTrack} from '../track';
import {PlaybackState, PlaybackStateMachine, TimecodeObject, Video, VideoLoadOptions} from './model';
import {isNullOrUndefined} from '../util/object-util';
import {StringUtil} from '../util/string-util';
import {AuthUtil} from '../util/auth-util';

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
  VOLUMECHANGE: 'volumechange'
}

export interface BufferedTimespan {
  start: number;
  end: number;
}

enum SeekDirection {
  BACKWARD = 'BACKWARD',
  FORWARD = 'FORWARD',
  NONE = 'NONE'
}

interface VideoFrameCallbackData {
  now: DOMHighResTimeStamp;
  metadata: VideoFrameCallbackMetadata;
}

interface SyncConditions {
  seekToFrame?: number;
  seekToTime?: number;
  currentTime?: number;
  videoFrameCallbackData?: VideoFrameCallbackData,
  seekDirection?: SeekDirection,
  newTimecode?: string;
}

export interface VideoControllerConfig {
  playerHTMLElementId: string;
  crossorigin: 'anonymous' | 'use-credentials'
}

export const VIDEO_CONTROLLER_CONFIG_DEFAULT: VideoControllerConfig = {
  playerHTMLElementId: 'omakase-player',
  crossorigin: 'anonymous',
}


export abstract class VideoController<C extends VideoControllerConfig> implements VideoControllerApi, Destroyable {
  public readonly onVideoLoaded$: BehaviorSubject<VideoLoadedEvent | undefined> = new BehaviorSubject<VideoLoadedEvent | undefined>(void 0);
  public readonly onVideoLoading$: Subject<VideoLoadingEvent> = new Subject<VideoLoadingEvent>();
  public readonly onPlay$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onPause$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onVideoTimeChange$: Subject<VideoTimeChangeEvent> = new Subject<VideoTimeChangeEvent>();
  public readonly onSeeking$: Subject<VideoSeekingEvent> = new Subject<VideoSeekingEvent>();
  public readonly onSeeked$: Subject<VideoSeekedEvent> = new Subject<VideoSeekedEvent>();
  public readonly onBuffering$: Subject<VideoBufferingEvent> = new Subject<VideoBufferingEvent>();
  public readonly onEnded$: Subject<VideoEndedEvent> = new Subject<VideoEndedEvent>();
  public readonly onAudioSwitched$: Subject<AudioEvent> = new Subject<AudioEvent>();
  public readonly onPlaybackState$: Subject<PlaybackState> = new Subject<PlaybackState>();
  public readonly onHelpMenuChange$: Subject<void> = new BehaviorSubject<void>(void 0);
  public readonly onVideoError$: Subject<VideoErrorEvent> = new Subject<VideoErrorEvent>();
  public readonly onVolumeChange$: Subject<VideoVolumeEvent> = new Subject<VideoVolumeEvent>();

  protected _config: C;

  protected _subtitlesVttTracks: SubtitlesVttTrack[] | undefined;
  protected _videoDomController: VideoDomController;
  protected _helpMenuGroups: HelpMenuGroup[] = [];

  protected _video?: Video;
  protected _ffomTimecode?: string; // timecode offset
  protected _ffomTimecodeObject?: TimecodeObject; // timecode offset
  protected _playbackStateMachine?: PlaybackStateMachine;
  protected _frameDurationSpillOverCorrection: number = 0.001;
  protected _syncStepCurrentTimeMediaTime: number = 0;
  protected _syncFineFrameTolerancePercent = 20;
  protected _syncLoopMaxIterations = 5;
  protected _videoFrameCallbackHandle?: number;

  protected _videoStalledCheckIntervalMs = 700;
  protected _videoStalledCheckLastCurrentTime?: number;
  protected _videoPausedSeekBufferingThresholdMs = 500;

  private _isVideoLoaded = false;

  /**
   * Stream of data provided by videoElement.requestVideoFrameCallback()
   * @protected
   */
  protected readonly _videoFrameCallback$: Subject<VideoFrameCallbackData | undefined> = new BehaviorSubject<VideoFrameCallbackData | undefined>(void 0);

  protected readonly _animationFrameCallback$: Subject<number | undefined> = new BehaviorSubject<number | undefined>(void 0);
  protected _requestAnimationFrameId?: number;

  protected _videoEventBreaker$ = new Subject<void>();
  protected _destroyed$ = new Subject<void>();

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

  protected constructor(config: C) {
    this._config = config;
    this._videoDomController = new VideoDomController(this._config.playerHTMLElementId, this._config.crossorigin, this);

    if (!this._videoDomController.videoElement) {
      throw new Error('VideoController element not set');
    }

    this._videoFrameCallback$.pipe(takeUntil(this._destroyed$)).subscribe(videoFrameCallbackData => {
      if (videoFrameCallbackData) {
        if (!this._playbackStateMachine!.seeking) {
          if (this.isPlaying()) {
            this.videoTimeChangeHandlerExecutor();
          } else if (this.isPaused()) {
            // nop
          }
        }
      }
    })

    this._animationFrameCallback$.pipe(takeUntil(this._destroyed$)).subscribe(time => {
      if (time) {
        if (!this._playbackStateMachine!.seeking) {
          if (this.isPlaying()) {
            this.videoTimeChangeHandlerExecutor();
          } else if (this.isPaused()) {
            // nop
          }
        }
      }
    })

    this.onPlay$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      if (this._video!.audioOnly) {
        this.startAnimationFrameLoop();
      }
    })

    race([this.onPause$, this.onEnded$]).pipe(takeUntil(this._destroyed$)).subscribe(() => {
      if (this._video!.audioOnly) {
        this.stopAnimationFrameLoop();
      }
    })
  }

  loadVideo(sourceUrl: string, frameRate: number | string, options?: VideoLoadOptions): Observable<Video> {
    try {
      this.detachVideoEventListeners();

      if (this.isVideoLoaded()) {
        this.onVideoLoaded$.next(void 0); // we have to remove old value as emmiter is BehaviourSubject
      }

      AuthUtil.authentication = options?.authentication;

      this._isVideoLoaded = false;
      this._video = void 0;

      sourceUrl = Validators.url()(sourceUrl);

      frameRate = FrameRateUtil.resolveFrameRate(frameRate);

      if (options && !isNullOrUndefined(options.dropFrame)) {
        z.coerce.boolean()
          .parse(options?.dropFrame, zodErrorMapOverload('Invalid dropFrame'));
      }
      let dropFrame = options && (options.dropFrame !== void 0) ? options.dropFrame : false;

      if (dropFrame && !FrameRateUtil.isSupportedDropFrameRate(frameRate)) {
        throw new Error(`Frame rate not supported: ${frameRate}, drop frame: ${dropFrame}`);
      }

      if (options && !StringUtil.isNullUndefinedOrWhitespace(options.ffom)) {
        let ffomTimecodeObject = TimecodeUtil.parseTimecodeToTimecodeObject(options.ffom!);
        if (ffomTimecodeObject.dropFrame !== dropFrame) {
          throw new Error(`Incorrect FFOM format: ${options.ffom}, drop frame: ${dropFrame}`);
        }
        this._ffomTimecode = options.ffom;
        this._ffomTimecodeObject = ffomTimecodeObject;
      }

      if (!isNullOrUndefined(options?.duration)) {
        z.coerce.number()
          .min(0)
          .parse(options?.duration, zodErrorMapOverload('Invalid duration'));
      }

      this.onVideoLoading$.next({
        sourceUrl: sourceUrl,
        frameRate: frameRate
      });

      return this.loadVideoInternal(sourceUrl, frameRate, options).pipe(map(video => {
        this._video = video;

        // this._syncStepCurrentTimeMediaTime = 0;
        this._syncStepCurrentTimeMediaTime = Decimal.div(this._video.frameDuration, 10).toNumber();

        this._playbackStateMachine = new PlaybackStateMachine();

        this.initEventHandlers();
        this.startVideoFrameCallback();

        this._isVideoLoaded = true;

        this.onVideoLoaded$.next({
          video: this._video
        });

        return video;
      }), catchError((e, caught) => {
        let message = parseErrorMessage(e)
        this.onVideoError$.next({
          type: 'VIDEO_LOAD_ERROR',
          message: message
        })
        return throwError(() => new Error(message));
      }));
    } catch (e) {
      let message = parseErrorMessage(e)
      this.onVideoError$.next({
        type: 'VIDEO_LOAD_ERROR',
        message: message
      })
      return throwError(() => new Error(message));
    }
  }

  protected abstract loadVideoInternal(sourceUrl: string, frameRate: number, options?: VideoLoadOptions): Observable<Video>;

  get videoElement(): HTMLVideoElement {
    return this._videoDomController.videoElement;
  }

  protected initEventHandlers() {
    let latestSeekStartTime: number | undefined;

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PAUSE).pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: () => {
        if (this._playbackStateMachine!.pausing) {
          if (this._video!.correctedDuration && (this.getCurrentTime() < this._video!.correctedDuration)) {
            this._seekToFrame(this.getCurrentTime() >= this._video!.correctedDuration ? this.getTotalFrames() : this.getCurrentFrame()).subscribe(() => {
              afterPauseSync();
            })
          } else {
            this.syncVideoFrames({}).subscribe(result => {
              afterPauseSync();
            })
          }
        }

        let afterPauseSync = () => {
          console.debug(`%cpause control sync start`, 'color: purple');
          this._seekFromCurrentFrame(1).pipe(takeUntil(this._seekBreaker$), take(1)).subscribe({
              next: () => {
                console.debug(`%cpause control sync end`, 'color: purple');
                this.videoTimeChangeHandlerExecutor();
                this.onPause$.next({
                  currentTime: this.getCurrentTime(),
                  currentTimecode: this.getCurrentTimecode()
                })
              }
            })
        }
      }
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.WAITING).pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.waiting = true;
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PROGRESS).pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onBuffering$.next({
        bufferedTimespans: this.getBufferedTimespans()
      })
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.ENDED).pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onEnded$.next({})
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.VOLUMECHANGE).pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onVolumeChange$.next({
        volume: this.getVolume()
      })
    })

    this._playbackStateMachine!.onChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.onPlaybackState$.next(event);
    })

    this.onPlay$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.setPlaying()
      this._videoStalledCheckLastCurrentTime = void 0;
    })

    this.onPause$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._videoStalledCheckLastCurrentTime = void 0;
      this._playbackStateMachine!.setPaused();
    })

    this.onSeeking$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.seeking = true;
      latestSeekStartTime = performance.now();
    })

    this.onSeeked$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.seeking = false;
      this._playbackStateMachine!.waiting = false;
      latestSeekStartTime = void 0;
    })

    this.onEnded$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.setEnded()
      this._videoStalledCheckLastCurrentTime = void 0;
    })

    interval(this._videoStalledCheckIntervalMs).pipe(takeUntil(this._videoEventBreaker$)).subscribe((value) => {
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

        this._videoStalledCheckLastCurrentTime = currentTime
      }

      if (this._playbackStateMachine && !this._playbackStateMachine.state.playing && !isNullOrUndefined(latestSeekStartTime)) {
        let isWaiting = !!latestSeekStartTime && (performance.now() - latestSeekStartTime) > this._videoPausedSeekBufferingThresholdMs;
        if (isWaiting) { // set waiting only if seek operation is taking too long, onSeeked event will eventually reset waiting state
          this._playbackStateMachine.waiting = true;
        }
      }
    })
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
        end: timeRanges.end(i)
      })
    }
    return result;
  }

  protected startVideoFrameCallback() {
    let nextVideoFrameCallback = () => {
      if (this.videoElement) {
        this._videoFrameCallbackHandle = this.videoElement.requestVideoFrameCallback((now, metadata) => {
          onVideoFrameCallback({
            now: now,
            metadata: metadata
          })
        });
      } else {
        console.debug('Cannot call requestVideoFrameCallback, videoElement not found')
      }
    }

    let onVideoFrameCallback = (videoFrameCallbackData: VideoFrameCallbackData) => {
      this._videoFrameCallback$.next(videoFrameCallbackData);
      nextVideoFrameCallback();
    }

    nextVideoFrameCallback();
  }

  private detachVideoEventListeners() {
    nextCompleteVoidSubject(this._videoEventBreaker$);
    this._videoEventBreaker$ = new Subject<void>();

    if (this.videoElement && this._videoFrameCallbackHandle) {
      this.videoElement.cancelVideoFrameCallback(this._videoFrameCallbackHandle);
    }
  }

  private syncVideoFrames(syncConditions: SyncConditions): Observable<boolean> {
    console.debug('syncFrames - START', syncConditions);
    return new Observable<boolean>(o$ => {
      let syncBreaker$ = new BehaviorSubject<boolean>(false);
      let syncLoopVideoCallbackBreaker$ = new Subject<void>();
      let syncLoopIterationsLeft = this._syncLoopMaxIterations;

      this._seekBreaker$.pipe(takeUntil(syncLoopVideoCallbackBreaker$)).subscribe(() => {
        console.debug(`%csyncFrames - seek breaker triggered`, 'color: gray')
        syncBreaker$.next(true);
        completeSync();
      })

      let completeSync = () => {
        nextCompleteVoidSubject(syncLoopVideoCallbackBreaker$)
        o$.next(true);
        o$.complete();
        console.debug(`%csyncFrames - END`, 'color: gray')
      }

      let seek = (time: number) => {
        syncBreaker$.pipe(take(1)).subscribe((syncBreak) => {
          if (syncBreak) {
            console.debug(`%csyncFrames - seek skipped, breaker already triggered`, 'color: gray')
          } else {
            this._seekTimeFireAndForget(time)
          }
        })
      }

      /**
       * For now we want to check frame time tolerance only for fractional non-drop frame rates
       */
      let shouldCheckFrameTimeTolerance = () => {
        return !this.getVideo()!.dropFrame && this.getVideo()!.frameRateFractional
      }

      /**
       * Negative percentage indicates currentTime is behind actual video time
       */
      let currentFrameTimeToleranceCheck = () => {
        let currentTime = this.getCurrentTime();
        let currentTimeFrame = this.calculateTimeToFrame(currentTime);
        let currentTimeIdealVsRealDiff = this.calculateFrameToTime(currentTimeFrame) - currentTime;
        let frameDiffPercentage = Decimal.mul(currentTimeIdealVsRealDiff, 100).div(this.getVideo()!.frameDuration).toNumber();
        return frameDiffPercentage;
      }

      if (this.isPlaying()) {
        console.debug(`%csyncFrames - SKIPPED: video is playing`, 'color: gray')
        completeSync();
      } else if (this._video!.correctedDuration && (this._video!.correctedDuration <= this.getCurrentTime())) {
        console.debug(`%csyncFrames - SKIPPED: video exceeded duration`, 'color: magenta')
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
            console.debug(`%csyncFrames - UNKNOWN: video is playing`, 'color: gray')
            return true;
          }

          if (currentTimeFrame === 0) {
            console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === 0`, 'color: green');
            return true;
          }

          if (syncConditions.seekToFrame) {
            if (syncConditions.seekToFrame === currentTimeFrame) {
              if ((currentTimeFrame === mediaTimeFrame) || !mediaTimeFrame) {
                console.debug(`%csyncFrames - OK: ((currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]) || !mediaTimeFrame[${mediaTimeFrame}])`, 'color: green');
                return true;
              }
            }
          } else {
            if ((currentTimeFrame === mediaTimeFrame) || !mediaTimeFrame) {
              console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]`, 'color: green', {
                currentTime: currentTime,
                mediaTime: mediaTime
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
        }

        let seekToFrameTimeBaseline: number;

        let syncLoop = (videoFrameCallbackData?: VideoFrameCallbackData) => {
          let syncLoopIteration = this._syncLoopMaxIterations - syncLoopIterationsLeft;
          console.debug(`syncFrames.syncLoop - START (${syncLoopIteration})`, {
            syncConditions: syncConditions,
            videoFrameCallbackData: videoFrameCallbackData,
            dropped: this.videoElement.getVideoPlaybackQuality()
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
            console.debug(`%csyncFrames - TOO MANY SYNCs, EXITING.. : currentTime[${currentTime}], mediaTime[${mediaTime}], currentTimeFrame[${currentTimeFrame}], mediaTimeFrame[${mediaTimeFrame}]`, 'color: red');
            completeSync();
            return;
          }

          console.debug(`syncFrames - currentTime[${currentTime}|${this.formatToTimecode(currentTime)}], mediaTime[${mediaTime}|${mediaTime ? this.formatToTimecode(mediaTime) : void 0}], currentTimeFrame[${currentTimeFrame}], mediaTimeFrame[${mediaTimeFrame}], `)

          if (syncConditions.seekToFrame) {

            if (!seekToFrameTimeBaseline) {
              seekToFrameTimeBaseline = currentTime;
            }

            if (syncConditions.seekToFrame === currentTimeFrame) {
              if ((currentTimeFrame === mediaTimeFrame) || !mediaTimeFrame) {
                console.debug(`%csyncFrames - OK: ((currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]) || !mediaTimeFrame[${mediaTimeFrame}])`, 'color: green');
                completeSync();
              } else {
                console.debug(`%csyncFrames - CORRECTION SEEK TO FRAME; currentTimeFrame[${currentTimeFrame}] ${currentTimeFrame > mediaTimeFrame ? '>' : '<'} mediaTimeFrame[${mediaTimeFrame}]`, 'color: red');

                let frameDiff = Math.abs(currentTimeFrame - mediaTimeFrame);
                console.debug(`%csyncFrames - frameDiff: ${frameDiff}`, 'color: orange');

                // in first sync iteration seek without nudging (frameCorrectionTime = 0)
                let frameCorrectionTime = syncLoopIteration === 0 ? 0 : this._syncStepCurrentTimeMediaTime * (currentTimeFrame > mediaTimeFrame ? 1 : -1);

                seek(Decimal.add(currentTime, frameCorrectionTime).toNumber())
              }
            } else {
              console.debug(`%csyncFrames - CORRECTION SEEK TO FRAME; syncConditions.seekToFrame[${syncConditions.seekToFrame}] !== currentTimeFrame[${currentTimeFrame}] | seekToFrameTimeBaseline=${seekToFrameTimeBaseline}`, 'color: red');

              let frameDiff = Math.abs(syncConditions.seekToFrame - currentTimeFrame);
              let frameCorrectionTime = (frameDiff) * this._video!.frameDuration;

              let seekToDecimal = syncConditions.seekToFrame >= currentTimeFrame ? Decimal.add(seekToFrameTimeBaseline, frameCorrectionTime) : Decimal.sub(seekToFrameTimeBaseline, frameCorrectionTime);
              let seekTo = seekToDecimal.toNumber();

              seekToFrameTimeBaseline = seekTo;

              console.debug(`%csyncFrames - frameDiff: ${frameDiff}`, 'color: orange');
              console.debug(`%csyncFrames - frameCorrectionTime: ${frameCorrectionTime}`, 'color: orange');
              console.debug(`%csyncFrames - seekTo: ${seekTo}`, 'color: orange');

              seek(seekTo)
            }

          } else {
            if ((currentTimeFrame === mediaTimeFrame) || !mediaTimeFrame) {
              console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]`, 'color: green');

              if (shouldCheckFrameTimeTolerance()) {
                let currentFrameTimeTolerance = currentFrameTimeToleranceCheck();
                // only seek if we have to seek forward, we don't want to seek backwards
                if ((currentFrameTimeTolerance < 0) && (Math.abs(currentFrameTimeTolerance) > this._syncFineFrameTolerancePercent)) {
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
                seek(currentTime)
              } else {
                if (currentTimeFrame > mediaTimeFrame) {
                  seek(Decimal.add(currentTime, this._syncStepCurrentTimeMediaTime).toNumber())
                } else if (mediaTime) {
                  seek(mediaTime + this._syncStepCurrentTimeMediaTime)
                }
              }
            }
          }

          console.debug('syncFrames.syncLoop - END');

          completeSync();
        }
        this._videoFrameCallback$.pipe(delay(syncConditions.seekToFrame ? 0 : 0), takeUntil(syncLoopVideoCallbackBreaker$)).subscribe({
          next: (videoFrameCallbackData) => {
            console.debug('syncFrames.syncLoop - videoFrameCallback$ trigger', videoFrameCallbackData);
            syncLoop(videoFrameCallbackData);
          }
        })
      }
    });
  }

  private constrainVideoTime(time: number): number {
    let duration = this._video!.correctedDuration ? this._video!.correctedDuration : this.getDuration();
    return time < 0 ? 0 : time > duration ? duration : time;
  }

  private seekTimeAndSync(newTime: number, syncConditions: SyncConditions = {}): Observable<boolean> {
    let timeBeforeSeek = this.getCurrentTime();
    return new Observable<boolean>(o$ => {
      // if we already have seek in progress, break previous seek operation
      if (this._playbackStateMachine!.seeking) {
        nextCompleteVoidSubject(this._seekBreaker$);
        this._seekBreaker$ = new Subject<void>();
      }

      if (!isNaN(newTime)) {
        newTime = this.constrainVideoTime(newTime);

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKING).pipe(takeUntil(this._seekBreaker$), take(1)).subscribe((event) => {
          this.onSeeking$.next({
            toTime: newTime,
            toTimecode: this.formatToTimecode(newTime),
            fromTime: timeBeforeSeek,
            fromTimecode: this.formatToTimecode(timeBeforeSeek)
          })
        })

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKED).pipe(takeUntil(this._seekBreaker$), take(1)).subscribe((event) => {
          this.syncVideoFrames(syncConditions).subscribe(result => {

            if (this._video!.correctedDuration && (this._video!.correctedDuration > this.videoElement.duration)) {
              /**
               * If we land on exact time of the frame start at the end of video, there is the chance that we won't load the frame
               */
              this._video!.correctedDuration = Number.isInteger(this.videoElement.duration * this._video!.frameRate) ? this.videoElement.duration - this._frameDurationSpillOverCorrection : this.videoElement.duration;
            }

            let finalizeSeek = () => {
              this._playbackStateMachine!.seeking = false;

              o$.next(true);
              o$.complete();

              this.videoTimeChangeHandlerExecutor();
            }

            //Seeking to end of video stream if currentTime exceeded corrected duration
            if (this._video!.correctedDuration && (this.getCurrentTime() > this._video!.correctedDuration)) {
              this.seekTimeWithoutSync(this._video!.correctedDuration).pipe(takeUntil(this._seekBreaker$), take(1)).subscribe(() => {
                this.onEnded$.next({})
                finalizeSeek();
              });
            } else {
              this.onSeeked$.next({
                currentTime: this.getCurrentTime(),
                currentTimecode: this.getCurrentTimecode(),
                previousTime: timeBeforeSeek,
                previousTimecode: this.formatToTimecode(timeBeforeSeek)
              });
              finalizeSeek();
            }
          })
        })

        console.debug(`Seeking to timestamp: ${newTime} \t ${this.formatToTimecode(newTime)}`)
        this.setCurrentTime(newTime);
      }
    });
  }

  private seekTimeWithoutSync(newTime: number): Observable<boolean> {
    let timeBeforeSeek = this.getCurrentTime();
    return new Observable<boolean>(o$ => {
      // do we have seek already in progress
      if (this._playbackStateMachine!.seeking) {
        nextCompleteVoidSubject(this._seekBreaker$);
        this._seekBreaker$ = new Subject<void>();
      }

      if (!isNaN(newTime)) {
        newTime = newTime < 0 ? 0 : newTime > this.getDuration() ? this.getDuration() : newTime;

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKING).pipe(takeUntil(this._seekBreaker$), take(1)).subscribe((event) => {
          this.onSeeking$.next({
            toTime: newTime,
            toTimecode: this.formatToTimecode(newTime),
            fromTime: timeBeforeSeek,
            fromTimecode: this.formatToTimecode(timeBeforeSeek)
          })
        })

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKED).pipe(takeUntil(this._seekBreaker$), take(1)).subscribe((event) => {
          this.onSeeked$.next({
            currentTime: this.getCurrentTime(),
            currentTimecode: this.getCurrentTimecode(),
            previousTime: timeBeforeSeek,
            previousTimecode: this.formatToTimecode(timeBeforeSeek)
          })

          this._playbackStateMachine!.seeking = false;

          o$.next(true);
          o$.complete();

          this.videoTimeChangeHandlerExecutor();
        })

        console.debug(`Seeking to timestamp: ${newTime} \t ${this.formatToTimecode(newTime)}`)

        this.setCurrentTime(newTime);
      }
    });
  }

  private _seekTimeFireAndForget(newTime: number) {
    if (!isNaN(newTime)) {
      let currentTime = this.getCurrentTime();
      newTime = newTime < 0 ? 0 : newTime > this.getDuration() ? this.getDuration() : newTime;
      let seekDirection = newTime === currentTime ? SeekDirection.NONE : newTime > currentTime ? SeekDirection.FORWARD : SeekDirection.BACKWARD;
      let diffDecimal = Decimal.sub(currentTime, newTime).abs();
      console.debug(`Seeking from currentTime[${currentTime}] to newTime[${newTime}], direction: ${seekDirection} ${diffDecimal.toNumber()}`)
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

    let seekDirection;

    if (syncConditions.seekDirection) {
      seekDirection = syncConditions.seekDirection;
    } else {
      seekDirection = newTime === currentTime ? SeekDirection.NONE : newTime > currentTime ? SeekDirection.FORWARD : SeekDirection.BACKWARD;
    }

    let diff = Decimal.sub(currentTime, newTime).abs().toNumber();
    console.debug(`Seeking from currentTime ${currentTime} to ${newTime}, direction: ${seekDirection} ${diff}`)

    return this.seekTimeAndSync(newTime, syncConditions);
  }

  private setCurrentTime(time: number) {
    this.videoElement.currentTime = time;
  }

  private _seekToFrame(frame: number): Observable<boolean> {
    if (!this.isPlaying() && !isNaN(frame)) {
      console.debug(`Seeking to frame: ${frame}`)
      if (frame <= 0) {
        return this.seekTimeAndSync(0, {});
      } else {
        let newTime = this.calculateFrameToTime(frame) + new Decimal(this._frameDurationSpillOverCorrection).toNumber();
        let frameNumberCheck = this.calculateTimeToFrame(newTime);

        if (this._video!.correctedDuration && (frameNumberCheck !== frame && frame != this._video!.correctedDuration * this.getFrameRate())) {
          console.error(`Frame numbers don't match. Wanted: ${frame}, calculated: ${frameNumberCheck}`)
          return of(false);
        } else {
          return this.seekTimeAndSync(newTime, {
            seekToFrame: frame,
            seekToTime: newTime,
            currentTime: this.getCurrentTime(),
            newTimecode: this.formatToTimecode(newTime),
          }).pipe(map((result) => {
            return result;
          }));
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

    console.debug(`seekFromCurrentFrame - Current frame: ${currentFrame}, wanted frame: ${seekToFrame}`)

    if (currentFrame !== seekToFrame) {
      if (seekToFrame <= 0) {
        return this._seekToFrame(0);
      } else if (this._video!.correctedDuration && (seekToFrame >= this.getTotalFrames() || seekToFrame >= this._video!.correctedDuration * this.getFrameRate() && !this._playbackStateMachine!.state.ended)) {
        return this._seekToFrame(this._video!.correctedDuration * this.getFrameRate());
      } else if (this._video!.correctedDuration && (seekToFrame >= this.getTotalFrames() || seekToFrame >= this._video!.correctedDuration * this.getFrameRate() && this._playbackStateMachine!.state.ended)) {
        return of(false);
      } else {
        let timeOffset = this.calculateFrameToTime(framesCount);
        let currentTime = Decimal.div(currentFrame, this.getFrameRate()).plus(this._frameDurationSpillOverCorrection).toNumber();

        return this.seekFromCurrentTimeAndSync(timeOffset, {
          seekToFrame: seekToFrame,
          currentTime: currentTime,
          seekDirection: framesCount > 0 ? SeekDirection.FORWARD : SeekDirection.BACKWARD
        }).pipe(map(result => {
          return result;
        }));
      }
    } else {
      return of(true);
    }
  }

  private videoTimeChangeHandlerExecutor() {
    let currentTime = this.getCurrentTime();
    let frame = this.calculateTimeToFrame(currentTime);

    this.onVideoTimeChange$.next({
      currentTime: currentTime,
      frame: frame
    });
  }

  private startAnimationFrameLoop() {
    if (isNullOrUndefined(this._requestAnimationFrameId)) {
      this._requestAnimationFrameId = requestAnimationFrame((time) => {
        this.requestAnimationFrameExecutor(time);
      })
    } else {
      console.debug('requestAnimationFrame already initiated');
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
    this._animationFrameCallback$.next(time)
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
    return this._playbackStateMachine?.state;
  }

  // region VideoController API

  getVideo(): Video | undefined {
    return this._video;
  }

  getHTMLVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  calculateTimeToFrame(time: number): number {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    return FrameRateUtil.timeToFrameNumber(time, this._video!);
  }

  calculateFrameToTime(frameNumber: number): number {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    return FrameRateUtil.frameNumberToTime(frameNumber, this._video!);
  }

  play() {
    if (this.isVideoLoaded() && !this.isPlaying()) {
      this._checkAndCancelPausing();

      // first start request video frame callback cycle
      this.videoElement.play().then(() => {
        this.onPlay$.next({
          currentTime: this.getCurrentTime(),
          currentTimecode: this.getCurrentTimecode()
        })
      });
    }
  }

  pause() {
    if (this.isVideoLoaded() && this.isPlaying()) {

      let pauseApproximateTime = this.getCurrentTime();

      this._pausingBreaker$ = new Subject<void>();
      this._pausingBreaker$.subscribe({
        next: () => {
          console.debug(`%cpausing breaker triggered`, 'color: gray')
          this.onPause$.next({
            currentTime: pauseApproximateTime,
            currentTimecode: this.formatToTimecode(pauseApproximateTime)
          });
        }
      })

      this._playbackStateMachine!.setPausing();

      // stop request video frame callback cycle ?
      this.videoElement.pause();
    }
  }

  private _checkAndCancelPausing() {
    if (this._playbackStateMachine!.pausing) {
      nextCompleteVoidSubject(this._pausingBreaker$);
    }
  }

  togglePlayPause() {
    if (this.isPlaying()) {
      this.pause()
    } else {
      this.play();
    }
  }

  isPlaying() {
    return this.isVideoLoaded()
      && this.videoElement.currentTime > 0
      && this.videoElement.currentTime < this.getDuration()
      && !this.videoElement.paused // caution: when using default HTML video controls, when seeking while playing - video is actually paused for a moment
      && !this.videoElement.ended
      && (this.videoElement.readyState > this.videoElement.HAVE_CURRENT_DATA)
      ;
  }

  isPaused() {
    return !this.isPlaying();
  }

  isSeeking(): boolean {
    return !!this._playbackStateMachine && this._playbackStateMachine.state.seeking;
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

  setPlaybackRate(playbackRate: number): void {
    if (!this.isVideoLoaded()) {
      return;
    }

    try {
      playbackRate = z.coerce.number()
        .min(0.1)
        .max(16)
        .default(1)
        .parse(playbackRate);
    } catch (e) {
      playbackRate = 1;
    }

    this.videoElement.playbackRate = playbackRate;
  }

  getVolume(): number {
    return this.isVideoLoaded() ? this.videoElement.volume : 0;
  }

  setVolume(volume: number) {
    if (!this.isVideoLoaded()) {
      return;
    }

    try {
      volume = z.coerce.number()
        .min(0)
        .max(1)
        .default(1)
        .parse(volume);

      this.videoElement.volume = volume;
    } catch (e) {
      // nop
    }
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

    frame = z.coerce.number()
      .min(0)
      .max(this.getTotalFrames())
      .parse(frame);

    if (!this.isVideoLoaded() || this._playbackStateMachine!.state.ended && frame >= this.getCurrentFrame()) {
      return of(false);
    }

    this._checkAndCancelPausing();

    return this._seekToFrame(frame);
  }

  seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    this.validateVideoLoaded();

    framesCount = z.coerce.number()
      .parse(framesCount);

    this._checkAndCancelPausing();

    return this._seekFromCurrentFrame(framesCount);
  }

  seekFromCurrentTime(timeAmount: number): Observable<boolean> {
    this.validateVideoLoaded();

    timeAmount = z.coerce.number()
      .parse(timeAmount);

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

    if (this._video!.correctedDuration && (!this.isVideoLoaded() || this._playbackStateMachine!.state.ended && time >= this._video!.correctedDuration)) {
      return of(false);
    }

    time = z.coerce.number()
      .parse(time);

    if (this._video!.correctedDuration && (time > this._video!.correctedDuration)) {
      time = this._video!.correctedDuration;
    }

    this._checkAndCancelPausing();

    return this.seekTimeAndSync(time, {
      seekToTime: time,
      seekDirection: time === this.getCurrentTime() ? SeekDirection.NONE : time > this.getCurrentTime() ? SeekDirection.FORWARD : SeekDirection.BACKWARD
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

    let percentSafeParsed = z.coerce.number()
      .min(0)
      .max(100)
      .safeParse(percent);

    if (percentSafeParsed.success) {
      let timeToSeek: number;

      if (percent === 0) {
        timeToSeek = 0;
      } else if (percent === 100) {
        timeToSeek = this.getDuration();
      } else {
        timeToSeek = new Decimal(this.getDuration()).mul(percent / 100).round().toNumber()
      }

      return this.seekToTime(timeToSeek);
    } else {
      return of(false);
    }
  }

  formatToTimecode(time: number): string {
    this.validateVideoLoaded();

    time = z.coerce.number()
      .min(0)
      .parse(time);

    return TimecodeUtil.formatToTimecode(time, this._video!, this._ffomTimecodeObject)
  }

  parseTimecodeToFrame(timecode: string): number {
    this.validateVideoLoaded();

    let timecodeObject = TimecodeUtil.parseTimecodeToTimecodeObject(timecode);
    if (timecodeObject.dropFrame !== this._video!.dropFrame) {
      throw new Error(`Video timecode format (${timecode}) and FFOM format (${this._ffomTimecode}) don't match`);
    }

    return TimecodeUtil.parseTimecodeToFrame(timecode, this._video!.frameRateDecimal, this._ffomTimecodeObject);
  }

  parseTimecodeToTime(timecode: string): number {
    this.validateVideoLoaded();

    let timecodeObject = TimecodeUtil.parseTimecodeToTimecodeObject(timecode);
    if (timecodeObject.dropFrame !== this._video!.dropFrame) {
      throw new Error(`Video timecode format (${timecode}) and FFOM format (${this._ffomTimecode}) don't match`);
    }

    return TimecodeUtil.parseTimecodeToTime(timecode, this._video!, this._ffomTimecodeObject);
  }

  mute() {
    if (!this.isVideoLoaded()) {
      return;
    }

    this.videoElement.muted = true;
  }

  unmute() {
    if (!this.isVideoLoaded()) {
      return;
    }

    this.videoElement.muted = false;
  }

  isMuted(): boolean {
    return !!this.videoElement && this.videoElement.muted;
  }

  toggleMuteUnmute() {
    if (!this.isVideoLoaded()) {
      return;
    }

    if (this.isMuted()) {
      this.unmute();
    } else {
      this.mute();
    }
  }

  isFullscreen(): boolean {
    if (!this.isVideoLoaded()) {
      return false;
    }

    return this._videoDomController.isFullscreen();
  }

  toggleFullscreen() {
    if (!this.isVideoLoaded()) {
      return;
    }

    this._videoDomController.toggleFullscreen();
  }

  getAudioTracks(): any[] {
    throw new Error('unsupported')
  }

  getCurrentAudioTrack(): any {
    throw new Error('unsupported')
  }

  setAudioTrack(audioTrackId: number): void {
    throw new Error('unsupported')
  }

  isVideoLoaded(): boolean {
    return this._isVideoLoaded;
  }

  getHls(): Hls {
    throw new Error('Unsupported or video not loaded with Hls.js')
  }

  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup) {
    this._helpMenuGroups = [...this.getHelpMenuGroups(), helpMenuGroup]
    this.onHelpMenuChange$.next();
  }

  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup) {
    this._helpMenuGroups = [helpMenuGroup, ...this.getHelpMenuGroups()]
    this.onHelpMenuChange$.next();
  }

  getHelpMenuGroups(): HelpMenuGroup[] {
    return this._helpMenuGroups;
  }

  // endregion

  destroy() {
    nextCompleteVoidSubjects(this._videoEventBreaker$, this._seekBreaker$);
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
      this.onAudioSwitched$,
      this.onPlaybackState$,
      this.onHelpMenuChange$,
      this.onVideoError$
    )

    nextCompleteVoidSubject(this._destroyed$);

    destroyer(
      this._videoDomController
    )

    nullifier(
      this._videoDomController,
      this._playbackStateMachine,
      this._helpMenuGroups,
      this._video
    )
  }

  addSafeZone(options: {
    topRightBottomLeftPercent: number[],
    htmlClass?: string
  }): string {
    return this._videoDomController.addSafeZone(options);
  }

  addSafeZoneWithAspectRatio(options: {
    aspectRatioText: string,
    scalePercent?: number,
    htmlClass?: string
  }): string {
    return this._videoDomController.addSafeZoneWithAspectRatio(options);
  }

  removeSafeZone(id: string) {
    this._videoDomController.removeSafeZone(id);
  }

  clearSafeZones() {
    this._videoDomController.clearSafeZones();
  }

  appendHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack<OmakaseTextTrackCue>): Observable<HTMLTrackElement | undefined> {
    return this._videoDomController.appendHTMLTrackElement(omakaseTextTrack);
  }

  getTextTrackById(id: string): TextTrack | undefined {
    return this._videoDomController.getTextTrackById(id);
  }

  getTextTrackList(): TextTrackList | undefined {
    return this._videoDomController.getTextTrackList();
  }

  removeTextTrackById(id: string): boolean {
    return this._videoDomController.removeTextTrackById(id);
  }

  getSubtitlesVttTracks(): SubtitlesVttTrack[] | undefined {
    return this._subtitlesVttTracks;
  }

}
