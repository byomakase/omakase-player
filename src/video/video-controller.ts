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
import {BehaviorSubject, catchError, delay, first, fromEvent, interval, map, Observable, of, Subject, take, takeUntil, throwError} from 'rxjs';
import {FrameUtil} from '../util/frame-util';
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
import {PlaybackState, PlaybackStateMachine, Video, VideoLoadOptions} from './model';

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
  seekToTimestamp?: number;
  currentTime?: number;
  videoFrameCallbackData?: VideoFrameCallbackData,
  seekDirection?: SeekDirection
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
  public readonly onVideoLoaded$: Subject<VideoLoadedEvent | undefined> = new BehaviorSubject<VideoLoadedEvent | undefined>(void 0);
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
  protected _ffom?: number; // video time offset
  protected _playbackStateMachine?: PlaybackStateMachine;
  protected _frameRateDecimal?: Decimal;
  protected _frameDurationSpillOverCorrection: number = 0.001;
  protected _syncStepCurrentTimeMediaTime: number = 0;
  protected _syncLoopMaxIterations = 20;
  protected _videoFrameCallbackHandle?: number;

  protected _seekInProgress: boolean = false;

  protected _videoStalledCheckIntervalMs = 700;
  protected _videoStalledCheckLastCurrentTime?: number;

  private _isVideoLoaded = false;

  /**
   * Stream of data provided by videoElement.requestVideoFrameCallback()
   * @protected
   */
  protected readonly _videoFrameCallback$: Subject<VideoFrameCallbackData | undefined> = new BehaviorSubject<VideoFrameCallbackData | undefined>(void 0);
  protected _videoEventBreaker$ = new Subject<void>();
  protected _destroyed$ = new Subject<void>();
  /**
   * Cancels previous unfinished seek operation if new seek is requested
   * @protected
   */
  protected _seekBreaker$ = new Subject<void>();

  protected constructor(config: C) {
    this._config = config;
    this._videoDomController = new VideoDomController(this._config.playerHTMLElementId, this._config.crossorigin, this);

    if (!this._videoDomController.videoElement) {
      throw new Error('VideoController element not set');
    }

    this._videoFrameCallback$.pipe(takeUntil(this._destroyed$)).subscribe(videoFrameCallbackData => {
      if (videoFrameCallbackData) {
        if (!this._seekInProgress) {
          if (this.isPlaying()) {
            this.videoTimeChangeHandlerExecutor();
          } else if (this.isPaused()) {
            // nop
          }
        }
      }
    })
  }

  loadVideo(sourceUrl: string, frameRate: number, options?: VideoLoadOptions): Observable<Video> {
    try {
      this.detachVideoEventListeners();
      this._isVideoLoaded = false;
      this._video = void 0;

      if (options?.ffom) {
        this._ffom = z.coerce.number()
          .min(0)
          .parse(options.ffom, zodErrorMapOverload('Invalid ffom'));
      }

      if (options?.duration) {
        this._ffom = z.coerce.number()
          .min(0)
          .parse(options.duration, zodErrorMapOverload('Invalid duration'));
      }

      sourceUrl = Validators.url()(sourceUrl);

      frameRate = z.coerce.number()
        .min(0)
        .max(100)
        .parse(frameRate, zodErrorMapOverload('Invalid frameRate'))
      ;

      this.onVideoLoading$.next({
        sourceUrl: sourceUrl,
        frameRate: frameRate
      });

      return this.loadVideoInternal(sourceUrl, frameRate, options).pipe(map(video => {
        this._video = video;

        this._frameRateDecimal = new Decimal(this._video.frameRate);

        //TODO: This change might cause a frame miss but prevents video frame flickering
        // this.syncStepCurrentTimeMediaTime = new Decimal(this.video.frameDuration).div(10).toNumber();
        this._syncStepCurrentTimeMediaTime = 0;

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
    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PAUSE).pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      if (this._video!.correctedDuration && (this.getCurrentTime() < this._video!.correctedDuration)) {
        this.seekToFrame(this.getCurrentTime() >= this._video!.correctedDuration ? this.getTotalFrames() : this.getCurrentFrame()).subscribe(result => {
          this.videoTimeChangeHandlerExecutor();
          this.onPause$.next({
            currentTime: this.getCurrentTime()
          })
        })
      } else {
        this.syncVideoFrames({}).subscribe(result => {
          this.videoTimeChangeHandlerExecutor();
          this.onPause$.next({
            currentTime: this.getCurrentTime()
          })
        })
      }
      //  }
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.WAITING).pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.waiting = true;
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PLAYING).pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.setPlaying()
      this._videoStalledCheckLastCurrentTime = void 0;
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PAUSE).pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.setPaused()
      this._videoStalledCheckLastCurrentTime = void 0;
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
      this._playbackStateMachine!.setPaused()
      this._videoStalledCheckLastCurrentTime = void 0;
    })

    this.onSeeking$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.seeking = true;
    })

    this.onSeeked$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this._playbackStateMachine!.seeking = false;
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
              console.debug(`%csyncFrames - OK: currentTimeFrame[${currentTimeFrame}] === mediaTimeFrame[${mediaTimeFrame}]`, 'color: green');
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

                let frameCorrectionTime = this._syncStepCurrentTimeMediaTime * (currentTimeFrame > mediaTimeFrame ? 1 : -1);

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
              completeSync();
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
        }
        this._videoFrameCallback$.pipe(delay(syncConditions.seekToFrame ? 0 : 0), takeUntil(syncLoopVideoCallbackBreaker$)).subscribe(videoFrameCallbackData => {
          console.debug('syncFrames.syncLoop - videoFrameCallback$ trigger', videoFrameCallbackData);
          syncLoop(videoFrameCallbackData);
        })
      }
    });
  }

  private seekTimeAndSync(newTime: number, syncConditions: SyncConditions = {}): Observable<boolean> {
    return new Observable<boolean>(o$ => {
      // do we have seek already in progress
      if (this._seekInProgress) {
        nextCompleteVoidSubject(this._seekBreaker$);
        this._seekBreaker$ = new Subject<void>();
      }
      this._seekInProgress = true;

      if (!isNaN(newTime)) {
        newTime = newTime < 0 ? 0 : newTime > this.getDuration() ? this.getDuration() : newTime;

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKING).pipe(takeUntil(this._seekBreaker$), take(1)).subscribe((event) => {
          this.onSeeking$.next({
            newTime: newTime,
            currentTime: this.getCurrentTime()
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
              this._seekInProgress = false;

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
                currentTime: this.getCurrentTime()
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
    return new Observable<boolean>(o$ => {
      // do we have seek already in progress
      if (this._seekInProgress) {
        nextCompleteVoidSubject(this._seekBreaker$);
        this._seekBreaker$ = new Subject<void>();
      }
      this._seekInProgress = true;

      if (!isNaN(newTime)) {
        newTime = newTime < 0 ? 0 : newTime > this.getDuration() ? this.getDuration() : newTime;

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKING).pipe(takeUntil(this._seekBreaker$), take(1)).subscribe((event) => {
          this.onSeeking$.next({
            newTime: newTime,
            currentTime: this.getCurrentTime()
          })
        })

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKED).pipe(takeUntil(this._seekBreaker$), take(1)).subscribe((event) => {
          this.onSeeked$.next({
            currentTime: this.getCurrentTime()
          })

          this._seekInProgress = false;

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

  private _seekTimeAndSyncNoEmitEvents(newTime: number) {
    if (this.isPlaying()) {
      return of(false);
    } else {
      return new Observable<boolean>(o$ => {
        if (!isNaN(newTime)) {
          newTime = newTime < 0 ? 0 : newTime > this.getDuration() ? this.getDuration() : newTime;

          fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKED).pipe(first()).subscribe((event) => {
            this.syncVideoFrames({}).subscribe(result => {
              o$.next(true);
              o$.complete();
              this.videoTimeChangeHandlerExecutor();
            })

          })

          console.debug(`Seeking ${newTime}`)
          this.setCurrentTime(newTime);
        }
      });
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
            seekToTimestamp: newTime,
            currentTime: this.getCurrentTime()
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
        let currentTime = currentFrame / this.getFrameRate() + this._frameDurationSpillOverCorrection;
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
    let frame = this.getCurrentFrame();

    this.onVideoTimeChange$.next({
      currentTime: currentTime,
      frame: frame
    });
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

    return FrameUtil.timeToFrame(time, this._frameRateDecimal!);
  }

  calculateFrameToTime(frameNumber: number): number {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    return FrameUtil.frameToTime(frameNumber, this._frameRateDecimal!);
  }

  play() {
    if (this.isVideoLoaded() && !this.isPlaying()) {
      // first start request video frame callback cycle
      this.videoElement.play().then(() => {
        this.onPlay$.next({
          currentTime: this.getCurrentTime()
        })
      });
    }
  }

  pause() {
    if (this.isVideoLoaded() && this.isPlaying()) {
      // stop request video frame callback cycle ?
      this.videoElement.pause();
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
    return this._seekInProgress;
  }

  getCurrentTime(): number {
    return this.isVideoLoaded() ? this.videoElement.currentTime : 0;
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
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    return this._video!.duration;
  }

  getFrameRate(): number {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    return this._video!.frameRate;
  }

  getTotalFrames(): number {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    return this._video!.totalFrames;
  }

  getCurrentFrame(): number {
    return this.isVideoLoaded() ? this.calculateTimeToFrame(this.getCurrentTime()) : 0;
  }

  seekToFrame(frame: number): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    frame = z.coerce.number()
      .min(0)
      .max(this.getTotalFrames())
      .parse(frame);

    if (!this.isVideoLoaded() || this._playbackStateMachine!.state.ended && frame >= this.getCurrentFrame()) {
      return of(false);
    }

    return this._seekToFrame(frame);
  }

  seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    framesCount = z.coerce.number()
      .parse(framesCount);

    return this._seekFromCurrentFrame(framesCount);
  }

  seekFromCurrentTime(timeAmount: number): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    timeAmount = z.coerce.number()
      .parse(timeAmount);

    return this.seekToTime(this.getCurrentTime() + timeAmount);
  }

  seekPreviousFrame(): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }
    return this.seekFromCurrentFrame(-1);
  }

  seekNextFrame(): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }
    return this.seekFromCurrentFrame(1);
  }

  seekToTime(time: number): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    if (this._video!.correctedDuration && (!this.isVideoLoaded() || this._playbackStateMachine!.state.ended && time >= this._video!.correctedDuration)) {
      return of(false);
    }

    time = z.coerce.number()
      .parse(time);

    if (this._video!.correctedDuration && (time > this._video!.correctedDuration)) {
      time = this._video!.correctedDuration;
    }

    return this.seekTimeAndSync(time, {
      seekToTimestamp: time,
      seekDirection: time === this.getCurrentTime() ? SeekDirection.NONE : time > this.getCurrentTime() ? SeekDirection.FORWARD : SeekDirection.BACKWARD
    });
  }

  seekToTimecode(timestamp: string): Observable<boolean> {
    return this.seekToFrame(this.parseTimecodeToFrame(timestamp));
  }

  seekToPercent(percent: number): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

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
    if (!this.isVideoLoaded()) {
      return TimecodeUtil.HOUR_MINUTE_SECOND_FRAME_FORMATTED_ZERO;
    }

    time = z.coerce.number()
      .min(0)
      .parse(time);

    return TimecodeUtil.formatToTimecode(time, this._frameRateDecimal!, this._ffom);
  }

  parseTimecodeToFrame(timestamp: string): number {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    return TimecodeUtil.parseTimecodeToFrame(timestamp, this._frameRateDecimal!, this._ffom)
  }

  parseTimecodeToTime(timestamp: string): number {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }

    return new Decimal(this.parseTimecodeToFrame(timestamp)).div(this._frameRateDecimal!).toNumber();
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
