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

import {BasePlayerTrack, type PlayerTrack, PlayerTrackEventType, type PlayerTrackLoadOptions, type PlayerTrackState} from './player-track';
import {type MediaContainerTrackState, TrackType} from '../media';
import type {PlayerController} from './player-controller-api';
import {Observable, takeUntil} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import type {Destroyable} from '../common/capabilities';
import {HlsSidecarVideoDomController, Mp4SidecarVideoDomController} from '../video/sidecar-video-dom-controller';
import {SidecarVideoTrackControllerImpl} from '../video/sidecar-video-track-controller';
import type {SidecarTrackController, SidecarTrackControllerConfig} from '../video/sidecar-track-controller';
import {FrameImageSidecarDomController} from '../frame-image/frame-image-sidecar-dom-controller';
import {FrameImageSidecarTrackControllerImpl} from '../frame-image/frame-image-sidecar-track-controller';
import {TrickTrackControllerImpl} from '../frame-image/trick-track-controller';
import type {FrameImageTrackState} from '../frame-image/frame-image-track';
import type {FrameImageConfig} from '../frame-image/frame-image-window';
import {isNullOrUndefined} from '../util/util-functions';

/** Load options for sidecar video tracks. */
export interface PlayerVideoLoadOptions extends PlayerTrackLoadOptions {
  /** Sidecar video element crossorigin attribute. */
  crossOrigin?: string | undefined;

  /**
   * Whether sidecar video element is muted, defaults to `false`. Unmuted sidecar audio is played by the element itself,
   * it is not routed through player audio and is not affected by player volume.
   */
  muted?: boolean | undefined;

  /**
   * Seconds before time window start sidecar video starts playing hidden and muted, to pre-buffer and sync before its cut is shown.
   * Limited by sidecar media available before time window cutStartTime. Defaults to {@link SIDECAR_VIDEO_DEFAULTS.warmUpDuration}.
   */
  warmUpDuration?: number | undefined;
}

export interface PlayerVideoTrackState extends PlayerTrackState {
  loadOptions?: PlayerVideoLoadOptions | undefined;

  /** Whether sidecar video is active. Only one sidecar video can be active. */
  active: boolean;
}

export interface PlayerVideoTrack extends PlayerTrack<MediaContainerTrackState, PlayerVideoTrackState>, Destroyable {
  videoTrackController: SidecarTrackController;

  /** Whether sidecar video is active. */
  active: boolean;

  setActive(active: boolean): void;

  loadSource(): Observable<void>;
}

export class PlayerSidecarVideoTrack extends BasePlayerTrack<MediaContainerTrackState, PlayerVideoTrackState, PlayerVideoLoadOptions> implements PlayerVideoTrack {
  private _videoTrackController: SidecarTrackController;

  constructor(
    trackState: MediaContainerTrackState,
    playerController: PlayerController,
    loadOptions: PlayerVideoLoadOptions | undefined,
    controllerConfig?: Partial<Pick<SidecarTrackControllerConfig, 'metadataLoad' | 'awakeBudget' | 'seekStep' | 'minSeekInterval'>> | undefined,
    frameImageConfig?: Partial<FrameImageConfig> | undefined
  ) {
    super(trackState, loadOptions);

    this._videoTrackController = PlayerSidecarVideoTrack.createTrackController(
      trackState,
      playerController,
      loadOptions,
      {
        ...controllerConfig,
        ...(isNullOrUndefined(loadOptions?.warmUpDuration) ? {} : {warmUpDuration: loadOptions!.warmUpDuration}),
      },
      frameImageConfig
    );
    // shown by player while active and inside its time window
    this._videoTrackController.domController.visible = false;
  }

  protected static createTrackController(
    trackState: MediaContainerTrackState,
    playerController: PlayerController,
    loadOptions: PlayerVideoLoadOptions | undefined,
    config: Partial<SidecarTrackControllerConfig>,
    frameImageConfig: Partial<FrameImageConfig> | undefined
  ): SidecarTrackController {
    let hostElement = playerController.sidecarVideosElement;
    let videoDomControllerConfig = {
      hostElement: hostElement,
      crossOrigin: loadOptions?.crossOrigin,
      muted: loadOptions?.muted,
    };
    switch (trackState.trackType) {
      case TrackType.MP4_TRACK:
        return new SidecarVideoTrackControllerImpl(trackState, playerController, new Mp4SidecarVideoDomController(videoDomControllerConfig), config);
      case TrackType.HLS_TRACK:
        return new SidecarVideoTrackControllerImpl(trackState, playerController, new HlsSidecarVideoDomController(videoDomControllerConfig), config);
      case TrackType.FRAME_IMAGE_TRACK:
        return new FrameImageSidecarTrackControllerImpl(
          trackState,
          playerController,
          new FrameImageSidecarDomController({hostElement: hostElement, frameImages: (trackState as FrameImageTrackState).frameImages, frameImageConfig: frameImageConfig}),
          config
        );
      case TrackType.TRICK_TRACK:
        let trickDomController = new FrameImageSidecarDomController({hostElement: hostElement, frameImages: (trackState as FrameImageTrackState).frameImages, frameImageConfig: frameImageConfig});
        // shown over other sidecar videos
        trickDomController.zIndex = '1';
        return new TrickTrackControllerImpl(trackState, playerController, trickDomController, config);
      default:
        throw new Error(`Sidecar video not supported for track type: ${trackState.trackType}`);
    }
  }

  get videoTrackController(): SidecarTrackController {
    return this._videoTrackController;
  }

  get active(): boolean {
    return this._videoTrackController.active;
  }

  setActive(active: boolean) {
    if (this.active === active) {
      return;
    }
    this._videoTrackController.setActive(active);
    this._onEvent$.next({
      type: PlayerTrackEventType.PLAYER_TRACK_SWITCHED,
      data: {
        playerTrackState: this.state,
      },
    });
  }

  loadSource(): Observable<void> {
    return new Observable<void>((observer) => {
      this.loadStart();
      this._videoTrackController
        .loadSource()
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            this.loadSuccess();
            nextCompleteObserver(observer);
          },
          error: (err) => {
            this.loadError(err);
            errorCompleteObserver(observer, err);
          },
        });
    });
  }

  setTrackState(trackState: MediaContainerTrackState) {
    super.setTrackState(trackState);
    this._videoTrackController.setTrackState(trackState);
  }

  protected _getState(): PlayerVideoTrackState {
    return {
      trackId: this._trackState.id,
      loadStage: this._loadStage.state,
      loadOptions: this._loadOptions,
      active: this.active,
    };
  }

  destroy() {
    super.destroy();
    this._videoTrackController.destroy();
  }
}
