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

import {filter, takeUntil} from 'rxjs';
import type {MediaContainerTrackState} from '../media';
import {type PlayerController, PlayerControllerEventType} from '../player/player-controller-api';
import {SeekStepPlaybackUtil} from '../common/seek-step-playback';
import type {SidecarTrackControllerConfig} from '../video/sidecar-track-controller';
import type {FrameImageSidecarDomController} from './frame-image-sidecar-dom-controller';
import {FrameImageSidecarTrackControllerImpl} from './frame-image-sidecar-track-controller';

/**
 * Renders trick track while main media plays at playback rate media elements can't play at - backwards, or faster than
 * {@link SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate}, see {@link SeekStepPlaybackUtil.isSeekStepPlaybackRate}.
 *
 * Trick track is active only at such playback rates, regardless of main media type and other sidecars, it can't be activated otherwise.
 * It is shown inside its time window over main media and other sidecar videos, also over active sidecar video, and also when main media
 * plays at such playback rates natively, as virtual main media does.
 * It stays dormant at other playback rates, so its frame images are not fetched during regular playback.
 * Once active it is woken up, and main media waits for frame image at its current time, as for any active sidecar inside its time window.
 *
 * While main media is paused it is never shown, paused main media shows its own frame, and main media doesn't wait for it.
 * While active it stays awake and follows main media seeks, so that it is shown right away once main media plays.
 */
export class TrickTrackControllerImpl extends FrameImageSidecarTrackControllerImpl {
  constructor(trackState: MediaContainerTrackState, playerController: PlayerController, domController: FrameImageSidecarDomController, config?: Partial<SidecarTrackControllerConfig>) {
    // first load only fetches manifest, trick track is woken up once main media plays at seek step playback rate
    super(trackState, playerController, domController, {...config, metadataLoad: true});
    this._active = this.isSeekStepPlaybackRate();

    // shown and buffering depend on main media playing
    let playingEventTypes = [
      PlayerControllerEventType.PLAYER_CONTROLLER_PLAY,
      PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE,
      PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE,
    ];
    playerController.onEvent$
      .pipe(filter((event) => playingEventTypes.includes(event.type)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.updateShown(this._playerController.getCurrentTime());
        this.updateBufferingRequired();
      });
  }

  /**
   * Whether main media plays, also while it waits for data or synced media. Seeking or ended main media plays on unless it was paused.
   */
  protected isMainMediaPlaying(): boolean {
    return !!this._playerController.mediaElementPlayback?.state.playing;
  }

  /** Paused main media shows its own frame. */
  protected override resolveShown(mainTime: number): boolean {
    return super.resolveShown(mainTime) && this.isMainMediaPlaying();
  }

  /** Main media doesn't wait for trick track while paused, it isn't shown then. */
  protected override checkIsBuffering(): boolean {
    return this.isMainMediaPlaying() && super.checkIsBuffering();
  }

  /** Trick track is active only while main media plays at seek step playback rate. */
  override setActive(_active: boolean) {}

  protected isSeekStepPlaybackRate(): boolean {
    return SeekStepPlaybackUtil.isSeekStepPlaybackRate(this._playerController.playbackRate);
  }

  protected updateSeekStepActive() {
    let active = this.isSeekStepPlaybackRate();
    if (this._active !== active) {
      super.setActive(active);
    }
  }

  protected override onPlaybackRateUpdate(playbackRate: number) {
    super.onPlaybackRateUpdate(playbackRate);
    this.updateSeekStepActive();
  }

  protected override updateResidency(mainTime: number) {
    if (!this._active) {
      if (this._residency === 'DORMANT') {
        this._config.awakeBudget.withdraw(this);
      } else {
        this.sleep();
      }
      return;
    }
    super.updateResidency(mainTime);
  }
}
