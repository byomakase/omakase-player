/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import Decimal from 'decimal.js';
import {AudioEvent, Destroyable, HelpMenuGroup, OmakaseTextTrack, OmakaseTextTrackCue, VideoBufferingEvent, VideoEndedEvent, VideoErrorEvent, VideoLoadedEvent, VideoLoadingEvent, VideoPlayEvent, VideoSeekedEvent, VideoSeekingEvent, VideoTimeChangeEvent} from '../types';
import {BehaviorSubject, catchError, delay, first, fromEvent, interval, map, Observable, of, Subject, take, takeUntil, throwError} from 'rxjs';
import {FrameUtil} from '../util/frame-util';
import {completeSubjects, nextCompleteVoidSubject, nextCompleteVoidSubjects, unsubscribeSubjects} from '../util/observable-util';
import {z} from 'zod';
import {TimestampUtil} from '../util/timestamp-util';
import {Video} from './video';
import {VideoDomController} from './video-dom-controller';
import {PlaybackState, PlaybackStateMachine} from './playback-state';
import Hls from 'hls.js';
import {Validators} from '../validators';
import {parseErrorMessage, zodErrorMapOverload} from '../util/error-util';
import {VideoControllerApi} from './video-controller-api';

export const HTMLVideoElementEventKeys = {
  PAUSE: 'pause',
  WAITING: 'waiting',
  PLAYING: 'playing',
  TIMEUPDATE: 'timeupdate',
  SEEKING: 'seeking',
  SEEKED: 'seeked',
  LOADEDDATA: 'loadeddata',
  LOADEDMETEDATA: 'loadedmetadata',
  ENDED: 'ended',
  PROGRESS: 'progress'
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


export abstract class VideoController implements VideoControllerApi, Destroyable {
  protected videoDomController: VideoDomController;
  protected helpMenuGroups: HelpMenuGroup[] = [];

  protected video: Video;
  protected _isVideoLoaded = false;
  protected playbackStateMachine: PlaybackStateMachine;

  protected frameRateDecimal: Decimal;
  protected frameDurationSpillOverCorrection: number = 0.001;
  protected syncStepCurrentTimeMediaTime: number;
  protected syncLoopMaxIterations = 20;
  protected videoFrameCallbackHandle: number;

  protected seekInProgress: boolean = false;

  protected videoStalledCheckIntervalMs = 700;
  protected videoStalledCheckLastCurrentTime: number;

  // region internal events
  /***
   * Stream of data provided by videoElement.requestVideoFrameCallback()
   * @protected
   */
  protected readonly videoFrameCallback$ = new BehaviorSubject<VideoFrameCallbackData>(null);
  protected videoEventBreaker$ = new Subject<void>();
  protected onDestroy$ = new Subject<void>();
  /***
   * Cancels previous unfinished seek operation if new seek is requested
   * @protected
   */
  protected seekBreaker$ = new Subject<void>();

  // endregion

  public readonly onVideoLoaded$: Subject<VideoLoadedEvent> = new BehaviorSubject<VideoLoadedEvent>(void 0);
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

  protected constructor(config: VideoControllerConfig) {
    this.videoDomController = new VideoDomController(config.playerHTMLElementId, config.crossorigin, this);

    if (!this.videoDomController.videoElement) {
      throw new Error('VideoController element not set');
    }

    this.videoFrameCallback$.pipe(takeUntil(this.onDestroy$)).subscribe(videoFrameCallbackData => {
      if (videoFrameCallbackData) {
        if (!this.seekInProgress) {
          if (this.isPlaying()) {
            this.videoTimeChangeHandlerExecutor();
          } else if (this.isPaused()) {
            // nop
          }
        }
      }
    })
  }

  loadVideo(sourceUrl: string, frameRate: number, duration: number): Observable<Video> {
    try {
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

      this._isVideoLoaded = false;
      this.video = void 0;

      this.detachVideoEventListeners();

      return this.videoLoad(sourceUrl, frameRate, duration).pipe(map(video => {
        this.video = video;

        this.frameRateDecimal = new Decimal(this.video.frameRate);

        //TODO: This change might cause a frame miss
        //this.syncStepCurrentTimeMediaTime = new Decimal(this.video.frameDuration).div(10).toNumber();
        this.syncStepCurrentTimeMediaTime = 0;

        this.playbackStateMachine = new PlaybackStateMachine();

        this.initEventHandlers();
        this.startVideoFrameCallback();

        this._isVideoLoaded = true;

        this.onVideoLoaded$.next({
          video: this.video
        });

        let durationInThreeDigits = Number.parseFloat(this.getDuration().toFixed(3));

        if (Number.isInteger(Number.parseFloat(((this.getDuration()) * this.video.frameRate).toFixed(1)))) {
          durationInThreeDigits = Number.parseFloat((durationInThreeDigits - this.frameDurationSpillOverCorrection).toFixed(3));
          this.video.setCorrectedDuration(durationInThreeDigits);
        }

        this.getHls().on(Hls.Events.FRAG_LOADED, (event, data) => {
          if (data.frag.endList) {
            if (data.frag.type == 'main' && (this.getCorrectedDuration()) > (data.frag.start + data.frag.duration)) {
              /**
               * if we land on exact time of the frame start at the end of video, there is the chance that we won't load the frame
               */
              this.video.setCorrectedDuration(Number.isInteger(data.frag.start + data.frag.duration * this.video.frameRate) ? data.frag.start + data.frag.duration - this.frameDurationSpillOverCorrection : data.frag.start + data.frag.duration);
            }
          }
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

  protected abstract videoLoad(sourceUrl: string, frameRate: number, duration: number): Observable<Video>;

  get videoElement(): HTMLVideoElement {
    return this.videoDomController.videoElement;
  }

  protected initEventHandlers() {
    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PAUSE).pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      /*if (this.browserProvider.isSafari ) {
          // if native video is loaded in Safari, we search one control frame forward, because image in video element and currentTime / mediaTime are not in sync
          let currentTimePlusOneFrame = this.getCurrentTime() + this.video.frameDuration;
          this._seekTimeAndSyncNoEmitEvents(currentTimePlusOneFrame).subscribe(result => {
              this.videoTimeChangeHandlerExecutor();
              this.onPause$.next({})
          })
      } else {*/
      let a = this.getCurrentTime() >= this.getCorrectedDuration() ? this.getTotalFrames() : this.getCurrentFrame();
      if (this.getCurrentTime() < this.getCorrectedDuration()) {
        this.seekToFrame(this.getCurrentTime() >= this.getCorrectedDuration() ? this.getTotalFrames() : this.getCurrentFrame()).subscribe(result => {
          this.videoTimeChangeHandlerExecutor();
          this.onPause$.next({})
        })
      } else {
        this.syncVideoFrames({}).subscribe(result => {
          this.videoTimeChangeHandlerExecutor();
          this.onPause$.next({})
        })
      }
      //  }
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.WAITING).pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.playbackStateMachine.waiting = true;
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PLAYING).pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.playbackStateMachine.setPlaying()
      this.videoStalledCheckLastCurrentTime = void 0;
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PAUSE).pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.playbackStateMachine.setPaused()
      this.videoStalledCheckLastCurrentTime = void 0;
    })

    // https://developer.mozilla.org/en-US/docs/Web/Guide/Audio_and_video_delivery/buffering_seeking_time_ranges
    // fromEvent(this.videoElement, HTMLVideoElementEventKeys.TIMEUPDATE).pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
    // this.videoPlaybackStateHolder.setPlaying()
    // this.lastVideoTime = void 0;
    // })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.PROGRESS).pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.onBuffering$.next({
        bufferedTimespans: this.getBufferedTimespans()
      })
    })

    fromEvent(this.videoElement, HTMLVideoElementEventKeys.ENDED).pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.onEnded$.next({})
    })

    this.playbackStateMachine.onChange$.pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.onPlaybackState$.next(event);
    })

    this.onPlay$.pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.playbackStateMachine.setPlaying()
      this.videoStalledCheckLastCurrentTime = void 0;
    })

    this.onPause$.pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.playbackStateMachine.setPaused()
      this.videoStalledCheckLastCurrentTime = void 0;
    })

    this.onSeeking$.pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.playbackStateMachine.seeking = true;
    })

    this.onSeeked$.pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.playbackStateMachine.seeking = false;
    })

    this.onEnded$.pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.playbackStateMachine.setEnded()
      this.videoStalledCheckLastCurrentTime = void 0;
    })

    interval(this.videoStalledCheckIntervalMs).pipe(takeUntil(this.videoEventBreaker$)).subscribe((value) => {
      let currentTime = this.getCurrentTime();

      if (!this.videoStalledCheckLastCurrentTime) {
        this.videoStalledCheckLastCurrentTime = currentTime;
        return;
      }

      if (this.playbackStateMachine.state.playing) {
        let timeOffset = ((this.videoStalledCheckIntervalMs * 0.8) / 1000) * this.getPlaybackRate(); // in seconds
        let comparisonTime = this.videoStalledCheckLastCurrentTime + timeOffset;

        let isWaiting = currentTime < comparisonTime;

        this.playbackStateMachine.waiting = isWaiting;

        this.videoStalledCheckLastCurrentTime = currentTime
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
        this.videoFrameCallbackHandle = this.videoElement.requestVideoFrameCallback((now, metadata) => {
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
      this.videoFrameCallback$.next(videoFrameCallbackData);
      nextVideoFrameCallback();
    }

    nextVideoFrameCallback();
  }

  private detachVideoEventListeners() {
    nextCompleteVoidSubject(this.videoEventBreaker$);
    this.videoEventBreaker$ = new Subject<void>();

    if (this.videoElement && this.videoFrameCallbackHandle) {
      this.videoElement.cancelVideoFrameCallback(this.videoFrameCallbackHandle);
    }
  }

  private syncVideoFrames(syncConditions: SyncConditions): Observable<boolean> {
    console.debug('syncFrames - START', syncConditions);
    return new Observable<boolean>(o$ => {
      let syncBreaker$ = new BehaviorSubject<boolean>(false);
      let syncLoopVideoCallbackBreaker$ = new Subject<void>();
      let syncLoopIterationsLeft = this.syncLoopMaxIterations;

      this.seekBreaker$.pipe(takeUntil(syncLoopVideoCallbackBreaker$)).subscribe(() => {
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

      let seek = (time) => {
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
      } else if (this.getCorrectedDuration() <= this.getCurrentTime()) {
        console.debug(`%csyncFrames - SKIPPED: video exceeded duration`, 'color: magenta')
        completeSync();
      } else {
        let checkIfDone = (videoFrameCallbackData: VideoFrameCallbackData) => {
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

        let seekToFrameTimeBaseline;

        let syncLoop = (videoFrameCallbackData: VideoFrameCallbackData) => {
          let syncLoopIteration = this.syncLoopMaxIterations - syncLoopIterationsLeft;
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

          console.debug(`syncFrames - currentTime[${currentTime}|${this.formatTimestamp(currentTime)}], mediaTime[${mediaTime}|${this.formatTimestamp(mediaTime)}], currentTimeFrame[${currentTimeFrame}], mediaTimeFrame[${mediaTimeFrame}], `)

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

                let frameCorrectionTime = this.syncStepCurrentTimeMediaTime * (currentTimeFrame > mediaTimeFrame ? 1 : -1);

                seek(Decimal.add(currentTime, frameCorrectionTime).toNumber())
              }
            } else {
              console.debug(`%csyncFrames - CORRECTION SEEK TO FRAME; syncConditions.seekToFrame[${syncConditions.seekToFrame}] !== currentTimeFrame[${currentTimeFrame}] | seekToFrameTimeBaseline=${seekToFrameTimeBaseline}`, 'color: red');

              let frameDiff = Math.abs(syncConditions.seekToFrame - currentTimeFrame);
              let frameCorrectionTime = (frameDiff) * this.video.frameDuration;

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
                  seek(Decimal.add(currentTime, this.syncStepCurrentTimeMediaTime).toNumber())
                } else {
                  seek(mediaTime + this.syncStepCurrentTimeMediaTime)
                }
              }
            }
          }

          console.debug('syncFrames.syncLoop - END');
        }
        this.videoFrameCallback$.pipe(delay(syncConditions.seekToFrame ? 0 : 0), takeUntil(syncLoopVideoCallbackBreaker$)).subscribe(videoFrameCallbackData => {
          console.debug('syncFrames.syncLoop - videoFrameCallback$ trigger', videoFrameCallbackData);
          syncLoop(videoFrameCallbackData);
        })
      }
    });
  }

  private seekTimeAndSync(newTime: number, syncConditions: SyncConditions = {}): Observable<boolean> {
    return new Observable<boolean>(o$ => {
      // do we have seek already in progress
      if (this.seekInProgress) {
        nextCompleteVoidSubject(this.seekBreaker$);
        this.seekBreaker$ = new Subject<void>();
      }
      this.seekInProgress = true;

      if (!isNaN(newTime)) {
        newTime = newTime < 0 ? 0 : newTime > this.getDuration() ? this.getDuration() : newTime;

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKING).pipe(takeUntil(this.seekBreaker$), take(1)).subscribe((event) => {
          this.onSeeking$.next({
            newTime: newTime,
            currentTime: this.getCurrentTime()
          })
        })

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKED).pipe(takeUntil(this.seekBreaker$), take(1)).subscribe((event) => {
          this.syncVideoFrames(syncConditions).subscribe(result => {

            if (this.getCorrectedDuration() > this.videoElement.duration) {
              /**
               * If we land on exact time of the frame start at the end of video, there is the chance that we won't load the frame
               */
              this.video.setCorrectedDuration(Number.isInteger(this.videoElement.duration * this.video.frameRate) ? this.videoElement.duration - this.frameDurationSpillOverCorrection : this.videoElement.duration);
            }

            let finalizeSeek = () => {
              this.seekInProgress = false;

              o$.next(true);
              o$.complete();

              this.videoTimeChangeHandlerExecutor();
            }

            //Seeking to end of video stream if currentTime exceeded corrected duration
            if (this.getCurrentTime() > this.getCorrectedDuration()) {
              this.seekTimeWithoutSync(this.getCorrectedDuration()).pipe(takeUntil(this.seekBreaker$), take(1)).subscribe(() => {
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

        console.debug(`Seeking to timestamp: ${newTime} \t ${this.formatTimestamp(newTime)}`)
        this.setCurrentTime(newTime);
      }
    });
  }

  private seekTimeWithoutSync(newTime: number): Observable<boolean> {
    return new Observable<boolean>(o$ => {
      // do we have seek already in progress
      if (this.seekInProgress) {
        nextCompleteVoidSubject(this.seekBreaker$);
        this.seekBreaker$ = new Subject<void>();
      }
      this.seekInProgress = true;

      if (!isNaN(newTime)) {
        newTime = newTime < 0 ? 0 : newTime > this.getDuration() ? this.getDuration() : newTime;

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKING).pipe(takeUntil(this.seekBreaker$), take(1)).subscribe((event) => {
          this.onSeeking$.next({
            newTime: newTime,
            currentTime: this.getCurrentTime()
          })
        })

        fromEvent(this.videoElement, HTMLVideoElementEventKeys.SEEKED).pipe(takeUntil(this.seekBreaker$), take(1)).subscribe((event) => {
          this.onSeeked$.next({
            currentTime: this.getCurrentTime()
          })

          this.seekInProgress = false;

          o$.next(true);
          o$.complete();

          this.videoTimeChangeHandlerExecutor();
        })

        console.debug(`Seeking to timestamp: ${newTime} \t ${this.formatTimestamp(newTime)}`)

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

  /***
   *
   * @param timeOffset Time offset in seconds
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

  getFrameRateDecimal(): Decimal {
    return this.frameRateDecimal;
  }

  private _seekToFrame(frame: number): Observable<boolean> {
    if (!this.isPlaying() && !isNaN(frame)) {
      console.debug(`Seeking to frame: ${frame}`)
      if (frame <= 0) {
        return this.seekTimeAndSync(0, {});
      } else {
        let newTime = this.calculateFrameToTime(frame) + new Decimal(this.frameDurationSpillOverCorrection).toNumber();
        let frameNumberCheck = this.calculateTimeToFrame(newTime);

        if (frameNumberCheck !== frame && frame != this.getCorrectedDuration() * this.getFrameRate()) {
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
    }
  }

  /***
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
      } else if (seekToFrame >= this.getTotalFrames() || seekToFrame >= this.getCorrectedDuration() * this.getFrameRate() && !this.playbackStateMachine.state.ended) {
        return this._seekToFrame(this.getCorrectedDuration() * this.getFrameRate());
      } else if (seekToFrame >= this.getTotalFrames() || seekToFrame >= this.getCorrectedDuration() * this.getFrameRate() && this.playbackStateMachine.state.ended) {
        return of(false);
      } else {
        let timeOffset = this.calculateFrameToTime(framesCount);
        let currentTime = currentFrame / this.getFrameRate() + this.frameDurationSpillOverCorrection;
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

  getPlaybackState(): PlaybackState {
    return this.playbackStateMachine.state;
  }

  // region VideoController API

  getVideo(): Video {
    return this.isVideoLoaded() ? this.video : void 0;
  }

  getHTMLVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  calculateTimeToFrame(time: number): number {
    return FrameUtil.timeToFrame(time, this.getFrameRateDecimal());
  }

  calculateFrameToTime(frameNumber: number): number {
    return FrameUtil.frameToTime(frameNumber, this.getFrameRateDecimal());
  }

  play() {
    if (this.isVideoLoaded() && !this.isPlaying()) {
      // first start request video frame callback cycle
      this.videoElement.play().then(() => {
        this.onPlay$.next({})
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
    return this.seekInProgress;
  }

  getCurrentTime(): number {
    return this.isVideoLoaded() ? this.videoElement.currentTime : 0;
  }

  getPlaybackRate(): number {
    return this.isVideoLoaded() ? this.videoElement.playbackRate : 0;
  }

  setPlaybackRate(playbackRate: number) {
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
    } catch (e) {
      volume = 1;
    }

    this.videoElement.volume = volume;
  }

  /***
   * return Video duration in seconds
   */
  getDuration(): number {
    return this.isVideoLoaded() ? this.video.duration : 0;
  }

  getCorrectedDuration(): number {
    return this.isVideoLoaded() ? this.video.correctedDuration : 0;
  }

  getFrameRate(): number {
    return this.isVideoLoaded() ? this.video.frameRate : 0;
  }

  getTotalFrames(): number {
    return this.isVideoLoaded() ? this.video.totalFrames : 0;
  }

  getCurrentFrame(): number {
    return this.isVideoLoaded() ? this.calculateTimeToFrame(this.getCurrentTime()) : 0;
  }

  seekToFrame(frame: number): Observable<boolean> {
    if (!this.isVideoLoaded() || this.playbackStateMachine.state.ended && frame >= this.getCurrentFrame()) {
      return of(false);
    }

    frame = z.coerce.number()
      .min(0)
      .max(this.getTotalFrames())
      .parse(frame);

    return this._seekToFrame(frame);
  }

  seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      return of(false);
    }

    framesCount = z.coerce.number()
      .parse(framesCount);

    return this._seekFromCurrentFrame(framesCount);
  }

  seekPreviousFrame(): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      return of(false);
    }
    return this.seekFromCurrentFrame(-1);
  }

  seekNextFrame(): Observable<boolean> {
    if (!this.isVideoLoaded()) {
      return of(false);
    }
    return this.seekFromCurrentFrame(1);
  }

  seekToTimestamp(time: number): Observable<boolean> {
    if (!this.isVideoLoaded() || this.playbackStateMachine.state.ended && time >= this.getCorrectedDuration()) {
      return of(false);
    }

    time = z.coerce.number()
      .parse(time);

    if (time > this.getCorrectedDuration()) {
      time = this.getCorrectedDuration();
    }

    return this.seekTimeAndSync(time, {
      seekToTimestamp: time,
      seekDirection: time === this.getCurrentTime() ? SeekDirection.NONE : time > this.getCurrentTime() ? SeekDirection.FORWARD : SeekDirection.BACKWARD
    });
  }

  seekToFormattedTimestamp(timestamp: string): Observable<boolean> {
    return this.seekToFrame(this.convertTimestampToFrame(timestamp));
  }

  formatTimestamp(time: number): string {
    if (!this.isVideoLoaded()) {
      return TimestampUtil.HOUR_MINUTE_SECOND_FRAME_FORMATTED_ZERO;
    }

    time = z.coerce.number()
      .min(0)
      // .max(this.getDuration())
      .parse(time);

    return TimestampUtil.formatHourMinuteSecondFrame(time, this.getFrameRateDecimal());
  }

  convertTimestampToFrame(timestamp: string): number {
    return TimestampUtil.calculateFramesFromHourMinuteSecondFrameFormatted(timestamp, this.frameRateDecimal)
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

  isFullscreen(): boolean {
    if (!this.isVideoLoaded()) {
      return false;
    }

    return this.videoDomController.isFullscreen();
  }

  toggleFullscreen() {
    if (!this.isVideoLoaded()) {
      return;
    }

    this.videoDomController.toggleFullscreen();
  }

  getAudioTracks(): any[] {
    throw new Error('unsupported')
  }

  getCurrentAudioTrack(): any {
    throw new Error('unsupported')
  }

  setAudioTrack(audioTrackId: number) {
    throw new Error('unsupported')
  }

  isVideoLoaded(): boolean {
    return this._isVideoLoaded;
  }

  getHls(): Hls {
    throw new Error('Unsupported or video not loaded with Hls.js')
  }

  addHelpMenuGroup(helpMenuGroup: HelpMenuGroup) {
    this.helpMenuGroups.push(helpMenuGroup);
    this.onHelpMenuChange$.next();
  }

  getHelpMenuGroups(): HelpMenuGroup[] {
    return this.helpMenuGroups;
  }

  // endregion

  destroy() {
    nextCompleteVoidSubjects(this.videoEventBreaker$, this.seekBreaker$);
    completeSubjects(this.videoFrameCallback$);

    let subjects = [this.onVideoLoaded$, this.onVideoLoading$, this.onPlay$, this.onPause$, this.onVideoTimeChange$, this.onSeeking$, this.onSeeked$, this.onBuffering$, this.onEnded$, this.onAudioSwitched$, this.onPlaybackState$, this.onHelpMenuChange$, this.onVideoError$];
    completeSubjects(...subjects);
    unsubscribeSubjects(...subjects);

    try {
      if (this.getHls()) {
        this.getHls().removeAllListeners();
        this.getHls().destroy();
      }
    } catch (e) {
      console.error(e);
    }

    nextCompleteVoidSubject(this.onDestroy$);

    this.videoDomController.destroy();
    this.videoDomController = void 0;

    this._isVideoLoaded = false;
    this.playbackStateMachine = null;
  }

  addSafeZone(options: {
    topPercent: number,
    bottomPercent: number,
    leftPercent: number,
    rightPercent: number;
    htmlClass?: string
  }): string {
    return this.videoDomController.addSafeZone(options);
  }

  addSafeZoneWithAspectRatio(options: {
    aspectRatioText: string,
    scalePercent?: number,
    htmlClass?: string
  }): string {
    return this.videoDomController.addSafeZoneWithAspectRatio(options);
  }

  removeSafeZone(id: string) {
    this.videoDomController.removeSafeZone(id);
  }

  clearSafeZones() {
    this.videoDomController.clearSafeZones();
  }

  appendHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack<OmakaseTextTrackCue>): Observable<HTMLTrackElement> {
    return this.videoDomController.appendHTMLTrackElement(omakaseTextTrack);
  }

  getTextTrackById(id: string): TextTrack | undefined {
    return this.videoDomController.getTextTrackById(id);
  }

  getTextTrackList(): TextTrackList | undefined {
    return this.videoDomController.getTextTrackList();
  }

  removeTextTrackById(id: string): boolean {
    return this.videoDomController.removeTextTrackById(id);
  }


}
