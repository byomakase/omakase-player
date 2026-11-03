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

import {takeUntil} from 'rxjs';
import {MediaTemporalFormat} from '../common';
import type {MediaContainerTrackState} from '../media';
import type {PlayerController} from '../player/player-controller-api';
import {BaseSidecarTrackController, type SidecarTrackController, type SidecarTrackControllerConfig} from '../video/sidecar-track-controller';
import {SidecarTimeWindowPosition} from '../video/sidecar-time-window';
import {type FrameImageSidecarClock, FrameImageSidecarDomController} from './frame-image-sidecar-dom-controller';

/** Seconds render clock may drift from main media time before it is anchored again. */
const RENDER_CLOCK_DRIFT_TOLERANCE = 0.04;

export interface FrameImageSidecarTrackController extends SidecarTrackController<FrameImageSidecarDomController> {}

/**
 * Renders frame image sidecar synced with main media, see {@link BaseSidecarTrackController}.
 *
 * Frame image sidecar has no clock of its own. It is rendered from {@link FrameImageSidecarClock} in sidecar time, mapped from main media time
 * and playback state, so that it can be rendered off main thread, see {@link FrameImageSidecarDomController}. Clock is anchored again
 * whenever main media playback state or playback rate changes, main media is seeked, or clock drifts from main media time.
 * Clock is clamped to sidecar time bounds, sidecar holds its frame outside of warm-up and time window.
 *
 * In warm-up, frame images right before the cut, in main media playback direction, are rendered hidden, so frame images of the cut are fetched and decoded ahead of time window.
 * Main media waits while frame image of active sidecar inside its time window is not decoded.
 */
export class FrameImageSidecarTrackControllerImpl extends BaseSidecarTrackController<FrameImageSidecarDomController> implements FrameImageSidecarTrackController {
  constructor(trackState: MediaContainerTrackState, playerController: PlayerController, domController: FrameImageSidecarDomController, config?: Partial<SidecarTrackControllerConfig>) {
    super(trackState, playerController, domController, config);

    this.initEventHandlers();

    // main media waits as soon as render worker reports buffering, not only when buffering is polled
    domController.onStatus$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
      console.debug(
        `Frame image sidecar ${this._trackState.id} status: buffering ${domController.buffering}, player playing ${this._playerController.mediaElementPlayback ? this.isPlayerPlaying() : void 0}, time ${this._playerController.getCurrentTime().toFixed(3)}s`
      );
      this.updateBufferingRequired();
    });
  }

  protected resolveAttachedDuration(): number {
    return this._domController.duration;
  }

  protected onSourceAttached() {
    // render clock is set once sidecar is synced with main media
  }

  /**
   * Render clock from main media time and playback state, anchored at sidecar time at main media time.
   *
   * @param time Sidecar time to anchor clock at, defaults to sidecar time at main media time
   */
  protected resolveRenderClock(time?: number): FrameImageSidecarClock {
    let timeWindow = this._timeWindow!;
    let reverse = this.isReversePlayback();
    let warmUpDuration = this._config.warmUpDuration;
    return {
      anchorTime: time ?? timeWindow.toSidecarTime(this._playerController.getCurrentTime(), warmUpDuration, reverse),
      anchorEpoch: FrameImageSidecarDomController.now(),
      running: this.isPlayerPlaying(),
      playbackRate: this._playerController.playbackRate,
      minTime: timeWindow.toSidecarTime(Number.NEGATIVE_INFINITY, warmUpDuration, reverse),
      maxTime: timeWindow.toSidecarTime(Number.POSITIVE_INFINITY, warmUpDuration, reverse),
      tickDuration: this.resolveTickDuration(),
    };
  }

  protected resolveTickDuration(): number | undefined {
    let converter = this._playerController.mediaTemporalConverter;
    if (!converter) {
      return void 0;
    }
    try {
      return converter.convert(2, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS) - converter.convert(1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
    } catch {
      return void 0;
    }
  }

  /**
   * Sets render clock when it differs from current one - playback state, playback rate or bounds changed, or it drifted from main media time.
   *
   * @param force Whether clock is set regardless
   */
  protected syncRenderClock(force = false) {
    if (!this.isAwake() || !this._timeWindow) {
      return;
    }
    let clock = this.resolveRenderClock();
    let current = this._domController.clock;
    if (
      !force &&
      current &&
      current.running === clock.running &&
      current.playbackRate === clock.playbackRate &&
      current.minTime === clock.minTime &&
      current.maxTime === clock.maxTime &&
      Math.abs(FrameImageSidecarDomController.resolveClockTime(current) - clock.anchorTime) <= RENDER_CLOCK_DRIFT_TOLERANCE
    ) {
      return;
    }
    this._domController.setClock(clock);
  }

  protected syncPlayback(_position: SidecarTimeWindowPosition, _targetTime: number) {
    this.syncRenderClock();
  }

  protected pausePlayback() {
    // main media is seeking or ended, clock stops
    this.syncRenderClock();
  }

  protected seekToTime(time: number) {
    if (this.isAwake() && this._timeWindow) {
      this._domController.setClock({...this.resolveRenderClock(time), running: false});
    }
  }

  protected override onPlaybackRateUpdate(_playbackRate: number) {
    // bounds follow playback direction
    this.syncRenderClock(true);
  }

  protected isAwakeBuffering(): boolean {
    if (this._domController.buffering) {
      return true;
    }
    if (this.isPlayerPlaying()) {
      return false;
    }
    return !this._domController.isReady(this._timeWindow!.toSidecarTime(this._playerController.getCurrentTime(), this._config.warmUpDuration, this.isReversePlayback()));
  }
}
