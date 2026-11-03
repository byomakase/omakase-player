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

import {filter, fromEvent, takeUntil} from 'rxjs';
import type {MediaContainerTrackState} from '../media';
import type {PlayerController} from '../player/player-controller-api';
import {MediaElementPlayback} from '../common/media-element-playback';
import {HTMLMediaElementEvent} from '../dom/dom-media-element';
import {SIDECAR_VIDEO_DEFAULTS} from '../constants';
import {SidecarTimeWindowPosition} from './sidecar-time-window';
import type {SidecarVideoDomController} from './sidecar-video-dom-controller';
import {isMediaElementBuffered, SeekStepper, SeekStepPlaybackUtil} from '../common/seek-step-playback';
import {BaseSidecarTrackController, type SidecarTrackController, type SidecarTrackControllerConfig} from './sidecar-track-controller';

export interface SidecarVideoTrackControllerConfig extends SidecarTrackControllerConfig {}

export interface SidecarVideoTrackController extends SidecarTrackController<SidecarVideoDomController> {}

/**
 * Plays sidecar video in its own {@link SidecarVideoDomController}, synced with main media, see {@link BaseSidecarTrackController}.
 *
 * Sidecar:
 * - before warm-up, holds the frame warm-up starts at, so its playback starts without seeking
 * - in warm-up, right before time window, warms up - plays hidden and muted, to pre-buffer and sync ahead of its cut.
 *   Warm-up is limited by sidecar media before {@link SidecarTimeWindow.cutStartTime}, cut starting at sidecar time 0 has no warm-up
 * - inside time window, if active, plays with its own muted state and is shown. Main media waits while sidecar is buffering.
 *   If inactive, keeps warming up, so it can be activated without seeking
 * - after time window, holds the frame at {@link SidecarTimeWindow.cutEndTime}
 *
 * Sidecar video drifting from main media is corrected by adjusting its playback rate, or by seeking when drift is too large.
 *
 * Video element can't play backwards nor faster than {@link SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate}. At such main media playback rates
 * sidecar is paused and seeked to sidecar time at main media time in steps, see {@link SeekStepper}. Main media doesn't wait for these seeks.
 */
export class SidecarVideoTrackControllerImpl extends BaseSidecarTrackController<SidecarVideoDomController> implements SidecarVideoTrackController {
  /** Sidecar video element muted state before warm-up, restored once warm-up ends */
  protected _mutedBeforeWarmUp = false;

  protected _mediaElementPlayback: MediaElementPlayback;

  protected _driftHistory: number[] = [];

  /** Time active sidecar started seeking inside its time window, for seek watchdog. */
  protected _seekingSince: number | undefined;
  protected _seekRetried = false;

  /** Seeks sidecar in steps while main media plays at playback rate video element can't play at. */
  protected _seekStepper: SeekStepper;

  constructor(trackState: MediaContainerTrackState, playerController: PlayerController, domController: SidecarVideoDomController, config?: Partial<SidecarVideoTrackControllerConfig>) {
    super(trackState, playerController, domController, config);

    this._mediaElementPlayback = new MediaElementPlayback();
    this._seekStepper = new SeekStepper(this._config);

    this.initEventHandlers();
  }

  protected get videoElement(): HTMLVideoElement {
    return this._domController.videoElement;
  }

  /** Whether video element can't play at main media playback rate, sidecar is paused and seeked in steps then. */
  protected isSeekStepPlayback(): boolean {
    return SeekStepPlaybackUtil.isSeekStepPlaybackRate(this._playerController.playbackRate);
  }

  /** Video element playback rate, video element is paused while main media plays at playback rate it can't play at. */
  protected resolveElementPlaybackRate(): number {
    return SeekStepPlaybackUtil.resolveMediaElementPlaybackRate(this._playerController.playbackRate);
  }

  protected override initEventHandlers() {
    super.initEventHandlers();

    fromEvent(this.videoElement, HTMLMediaElementEvent.ENDED)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this._mediaElementPlayback.setEnded();
      });

    fromEvent(this.videoElement, HTMLMediaElementEvent.WAITING)
      .pipe(filter(() => this.isLoaded()))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.updateBufferingRequired();
      });
  }

  protected resolveAttachedDuration(): number {
    return this.videoElement.duration;
  }

  protected onSourceAttached() {
    // loading resets playbackRate to defaultPlaybackRate
    this.videoElement.playbackRate = this.resolveElementPlaybackRate();
    // attached source starts paused
    if (!this._mediaElementPlayback.paused) {
      this._mediaElementPlayback.setPaused();
    }
    this._driftHistory = [];
  }

  protected syncPlayback(position: SidecarTimeWindowPosition, targetTime: number) {
    if (this.isSeekStepPlayback()) {
      this.syncSeekStepPlayback(targetTime);
      return;
    }
    let playing = position === SidecarTimeWindowPosition.WARM_UP || position === SidecarTimeWindowPosition.IN_WINDOW;
    if (playing && this.isPlayerPlaying()) {
      if (this._mediaElementPlayback.playing) {
        this.checkDriftAndTrySync(targetTime);
      } else {
        // entering warm-up or time window, sidecar holds the frame it starts at while main media is already a frame or more past it.
        // Seeking would request buffering and stall main media, so small drift is left to drift correction
        if (Math.abs(targetTime - this.videoElement.currentTime) > SIDECAR_VIDEO_DEFAULTS.driftSeekThreshold) {
          this.seekToTime(targetTime);
        }
        this.videoPlay();
      }
    } else {
      // sidecar holds the frame warm-up starts at, or the frame at cutEndTime, or the frame at main media time while paused
      this.pausePlayback();
      this.seekToTimeIfNeeded(targetTime);
    }
  }

  /**
   * Sidecar stays paused while main media plays at playback rate video element can't play at, or holds the frame at main media time while main media is paused.
   * While main media plays, sidecar is seeked in steps ahead of main media time, see {@link SeekStepper}, so that sidecar media where playback resumes starts buffering.
   * Lead main media time is mapped to sidecar time, clamped to warm-up and time window.
   */
  protected syncSeekStepPlayback(targetTime: number) {
    this.pausePlayback();
    if (!this.isPlayerPlaying()) {
      this.seekToTimeIfNeeded(targetTime);
      return;
    }
    let reverse = this.isReversePlayback();
    let videoElement = this.videoElement;
    let seekTime = this._seekStepper.resolveSeekTime(this._playerController.getCurrentTime(), {
      playbackRate: this._playerController.playbackRate,
      seeking: videoElement.seeking,
      mapTime: (leadTime) => this._timeWindow!.toSidecarTime(leadTime, this._config.warmUpDuration, reverse),
      isBuffered: (seekTime) => isMediaElementBuffered(videoElement, seekTime),
    });
    if (seekTime !== void 0) {
      this.seekToTime(seekTime);
    }
  }

  protected override onPlaybackRateUpdate(_playbackRate: number) {
    this._driftHistory = [];
    // first sync after playback rate change seeks right away
    this._seekStepper.reset();
    if (this.isSeekStepPlayback()) {
      this.pausePlayback();
    } else {
      this.videoElement.playbackRate = this.resolveElementPlaybackRate();
    }
  }

  protected override resetSync() {
    this._driftHistory = [];
    this._seekingSince = void 0;
    this._seekRetried = false;
    this._seekStepper.reset();
  }

  /**
   * Sidecar is muted while warming up, its muted state is restored once warm-up ends.
   */
  protected override onWarmingUpChange(warmingUp: boolean) {
    if (warmingUp) {
      this._mutedBeforeWarmUp = this.videoElement.muted;
      this.videoElement.muted = true;
    } else if (!this._mutedBeforeWarmUp) {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
        // browser pauses playing video unmuted without user activation, playback continues muted rather than stalling sync
        console.warn(`Sidecar video id=${this._trackState.id} playback with sound not allowed, continuing muted`);
      } else {
        this.videoElement.muted = false;
      }
    }
  }

  protected override updateBufferingRequired() {
    this.checkSeekWatchdog();
    super.updateBufferingRequired();
  }

  protected checkDriftAndTrySync(targetTime: number) {
    // positive drift - sidecar is behind main media
    // negative drift - sidecar is in front of main media
    let drift = targetTime - this.videoElement.currentTime;

    this._driftHistory.push(drift);
    if (this._driftHistory.length > SIDECAR_VIDEO_DEFAULTS.driftHistoryLength) {
      this._driftHistory.shift();
    }

    if (this._driftHistory.length < SIDECAR_VIDEO_DEFAULTS.driftHistoryLength) {
      return;
    }

    let averageDrift = this._driftHistory.reduce((sum, val) => sum + val, 0) / this._driftHistory.length;
    let playbackRate = this.resolveElementPlaybackRate();

    if (Math.abs(averageDrift) > SIDECAR_VIDEO_DEFAULTS.driftSeekThreshold) {
      console.debug(`Sidecar video id=${this._trackState.id} seeking to correct drift`, averageDrift);
      this.seekToTime(targetTime);
    } else if (Math.abs(averageDrift) > SIDECAR_VIDEO_DEFAULTS.driftPlaybackRateThreshold) {
      // catch up gradually, adjustment is proportional to drift
      let maxAdjustment = SIDECAR_VIDEO_DEFAULTS.driftMaxPlaybackRateAdjustment;
      let adjustment = Math.min(Math.max(averageDrift, -maxAdjustment), maxAdjustment);
      this.videoElement.playbackRate = playbackRate * (1 + adjustment);
    } else if (this.videoElement.playbackRate !== playbackRate) {
      this.videoElement.playbackRate = playbackRate;
    }
  }

  /**
   * Seek steps are fire-and-forget, main media never waits for sidecar video at playback rate it can't play at, also not while it is waking up.
   */
  protected override checkIsBuffering(): boolean {
    if (this.isSeekStepPlayback()) {
      return false;
    }
    return super.checkIsBuffering();
  }

  protected isAwakeBuffering(): boolean {
    if (this.isSeekStepPlayback()) {
      // seek steps are best effort, main media doesn't wait for them
      return false;
    }
    let videoElement = this.videoElement;
    if (videoElement.seeking) {
      return true;
    }
    if (videoElement.readyState >= videoElement.HAVE_FUTURE_DATA) {
      return false;
    }
    // paused element does not always advance readyState beyond HAVE_CURRENT_DATA, buffered ranges are checked as well
    let time = videoElement.currentTime;
    let requiredEnd = Math.min(time + SIDECAR_VIDEO_DEFAULTS.bufferingRequiredAhead, this._timeWindow!.cutEndTime);
    let isBuffered = this._domController.bufferedTimeRanges.some((p) => p.start <= time && p.end >= requiredEnd);
    return !isBuffered;
  }

  /**
   * Browser can leave seek unfinished even with data at seek time buffered, and main media would wait for active sidecar forever.
   * Active sidecar seeking inside its time window longer than {@link SIDECAR_VIDEO_DEFAULTS.seekWatchdogTimeout} is seeked again,
   * and if that seek doesn't finish either, its source is released and attached again.
   */
  protected checkSeekWatchdog() {
    let mainTime = this._playerController.getCurrentTime();
    // main media doesn't wait for seek steps, they are not watched
    if (!this.isAwake() || !this._timeWindow || !this._active || !this._timeWindow.isInWindow(mainTime) || !this.videoElement.seeking || this.isSeekStepPlayback()) {
      this._seekingSince = void 0;
      this._seekRetried = false;
      return;
    }
    let now = Date.now();
    if (this._seekingSince === void 0) {
      this._seekingSince = now;
      return;
    }
    if (now - this._seekingSince < SIDECAR_VIDEO_DEFAULTS.seekWatchdogTimeout) {
      return;
    }
    if (!this._seekRetried) {
      console.warn(`Sidecar video id=${this._trackState.id} seek not finished, seeking again`);
      this.seekToTime(this._timeWindow.toSidecarTime(mainTime, this._config.warmUpDuration));
      this._seekingSince = now;
      this._seekRetried = true;
    } else {
      console.warn(`Sidecar video id=${this._trackState.id} seek not finished, reloading`);
      this.releaseSource();
      if (this._config.awakeBudget.tryAcquire(this)) {
        this.wake(mainTime);
      }
    }
  }

  protected seekToTimeIfNeeded(time: number) {
    if (Math.abs(this.videoElement.currentTime - time) > SIDECAR_VIDEO_DEFAULTS.seekTolerance) {
      this.seekToTime(time);
    }
  }

  protected seekToTime(time: number) {
    this._driftHistory = [];
    this.videoElement.playbackRate = this.resolveElementPlaybackRate();
    this.videoElement.currentTime = time;
  }

  protected videoPlay() {
    if (this.isLoaded() && !this._mediaElementPlayback.playing && !this.isSeekStepPlayback()) {
      this._driftHistory = [];
      this.videoElement.play().catch((error) => {
        if (error?.name === 'NotAllowedError' && !this.videoElement.muted) {
          // autoplay policy can block unmuted playback started without user activation, playback continues muted rather than stalling sync
          console.warn(`Sidecar video id=${this._trackState.id} playback with sound not allowed, continuing muted`);
          this.videoElement.muted = true;
          this.videoElement.play().catch(() => {
            // we'll just ignore play / pause interruptions
          });
        }
        // we'll just ignore play / pause interruptions
      });
      this._mediaElementPlayback.setPlaying();
    }
  }

  protected pausePlayback() {
    try {
      if (!this.videoElement.paused) {
        this.videoElement.pause();
      }
      if (!this._mediaElementPlayback.paused) {
        this._mediaElementPlayback.setPaused();
      }
      let playbackRate = this.resolveElementPlaybackRate();
      if (this.videoElement.playbackRate !== playbackRate) {
        this.videoElement.playbackRate = playbackRate;
      }
    } catch (e) {
      // nop
      console.debug(e);
    }
  }

  destroy() {
    super.destroy();

    this._mediaElementPlayback.destroy();
  }
}
