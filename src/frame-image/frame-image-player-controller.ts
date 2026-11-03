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

import {map, Observable, of, switchMap, takeUntil, tap} from 'rxjs';
import {type FrameRateModel, FrameRateResolver} from '../common/frame-rate';
import {type LoadMainMediaArgsType, PlayerControllerEventType, type PlayerDomController} from '../player/player-controller-api';
import {type MainMediaState, Relation, RelationType, ThumbnailTrack} from '../media';
import {FileFormatType} from '../common';
import {UrlSource} from '../source';
import {TimedItemsFetcherFactory} from '../track/timed-items-fetcher';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {BaseVirtualPlayerController, VIRTUAL_PLAYER_CONTROLLER_CONFIG_DEFAULT, type VirtualPlayerControllerConfig} from '../virtual/base-virtual-player-controller';
import {FrameImageDomControllerImpl} from './frame-image-dom-controller';
import {FrameImageManifest} from './frame-image-manifest';
import {FrameImageLookupFactory} from './frame-image-lookup';
import type {FrameImageRenderer} from './frame-image-renderer';
import {FrameImageTrack} from './frame-image-track';
import {FRAME_IMAGE_CONFIG_DEFAULT, type FrameImageConfig} from './frame-image-window';

export interface FrameImagePlayerControllerConfig extends VirtualPlayerControllerConfig {
  defaultFrameRate: number | string;
  frameImageConfig: Partial<FrameImageConfig>;
}

export const FRAME_IMAGE_PLAYER_CONTROLLER_CONFIG_DEFAULT: FrameImagePlayerControllerConfig = {
  ...VIRTUAL_PLAYER_CONTROLLER_CONFIG_DEFAULT,
  defaultFrameRate: 25,
  frameImageConfig: {
    ...FRAME_IMAGE_CONFIG_DEFAULT,
  },
};

const FRAME_IMAGE_FRAME_RATE_TOLERANCE = 0.01;
const FRAME_IMAGE_SEEK_READY_TIMEOUT = 1000;
/** Main media is loaded after timeout even if frame images are not ready, ie. when fetch fails */
const FRAME_IMAGE_LOAD_READY_TIMEOUT = 3000;

export interface FrameImage {
  start: number;
  end: number;
  url: string;
  blob?: Blob | undefined;
  bitmap?: ImageBitmap | undefined;
  fetchedAt?: number | undefined;
  decodeRequestedAt?: number | undefined;
}

export class FrameImagePlayerController extends BaseVirtualPlayerController<FrameImagePlayerControllerConfig> {
  static createMounted(playerDomController: PlayerDomController, config?: Partial<FrameImagePlayerControllerConfig>): FrameImagePlayerController {
    let frameImageDomController = FrameImageDomControllerImpl.mountOver(playerDomController);
    let controller = new FrameImagePlayerController(frameImageDomController, config);
    controller._ownedDomController = frameImageDomController;
    controller._renderer = frameImageDomController.renderer;
    controller._renderer.setConfig(controller._config.frameImageConfig);
    controller.watchRendererBuffering();
    frameImageDomController.attachController(controller);
    return controller;
  }

  protected _renderer: FrameImageRenderer | undefined;
  protected _syncedMediaWaiting = false;
  protected _rendererBuffering = false;
  declare protected _ownedDomController: FrameImageDomControllerImpl | undefined;

  constructor(playerDomController: PlayerDomController, config?: Partial<FrameImagePlayerControllerConfig>) {
    super(playerDomController, {
      ...FRAME_IMAGE_PLAYER_CONTROLLER_CONFIG_DEFAULT,
      ...config,
      frameImageConfig: {
        ...FRAME_IMAGE_PLAYER_CONTROLLER_CONFIG_DEFAULT.frameImageConfig,
        ...(config?.frameImageConfig || {}),
      },
    });

    this._onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      if (event.type !== PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS) {
        // ie. seeking and rate changes are applied after clock anchoring
        this.postRenderClock();
      }
    });
  }

  override wireEvents(mainMediaState: MainMediaState): void {
    super.wireEvents(mainMediaState);
    this.postRenderClock();
  }

  protected override anchorClock(time: number) {
    super.anchorClock(time);
    this.postRenderClock();
  }

  protected override startClock() {
    super.startClock();
    this.postRenderClock();
  }

  protected override stopClock(time?: number) {
    super.stopClock(time);
    this.postRenderClock();
  }

  protected postRenderClock() {
    let duration = this._mainMediaState?.duration;
    if (!this._renderer || duration === undefined) {
      return;
    }
    this._renderer.setClock({
      anchorTime: this._anchorTime,
      anchorEpoch: performance.timeOrigin + this._anchorWall,
      running: this._clockRunning && !this._mediaElementPlayback?.seeking,
      playbackRate: this._playbackRate,
      duration: duration,
      frameDuration: this._mainMediaState?.frameRateModel?.frameDuration,
    });
  }

  /**
   * Clock stops while renderer is buffering, the same as while waiting for synced media, and continues once renderer caught up.
   */
  protected watchRendererBuffering() {
    this._renderer?.onStatus$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => this.updateRendererBuffering());
    // playback state changes while worker status doesn't, ie. paused while buffering
    this._onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      if (event.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAY || event.type === PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE) {
        this.updateRendererBuffering();
      }
    });
  }

  protected updateRendererBuffering() {
    let rendererBuffering = !!this._renderer?.buffering && !!this._mediaElementPlayback?.playing;
    if (rendererBuffering !== this._rendererBuffering) {
      console.debug(`Frame image main media renderer buffering ${rendererBuffering} at ${this.resolveClockTime().toFixed(3)}s, synced media waiting ${this._syncedMediaWaiting}`);
      this._rendererBuffering = rendererBuffering;
      this.applyWaiting();
    }
  }

  override setWaitingForSyncedMedia(syncedMediaWaiting: boolean): void {
    this._syncedMediaWaiting = syncedMediaWaiting;
    this.applyWaiting();
  }

  protected applyWaiting() {
    if (!this._mediaElementPlayback) {
      return;
    }
    super.setWaitingForSyncedMedia(this._syncedMediaWaiting || this._rendererBuffering);
  }

  protected override isPlaybackRateSupported(playbackRate: number): boolean {
    return playbackRate > 0 || playbackRate < 0;
  }

  protected override awaitSeekReady(toTime: number): Observable<void> {
    let frameDuration = this._mainMediaState?.frameRateModel?.frameDuration;
    if (!this._renderer || !frameDuration) {
      return super.awaitSeekReady(toTime);
    }
    let times = this._renderer.resolveReadyTimes(toTime, frameDuration, this._playbackRate, this._clockRunning);
    return this._renderer.whenReady$(times, FRAME_IMAGE_SEEK_READY_TIMEOUT);
  }

  protected awaitLoadReady(frameDuration: number, duration: number): Observable<void> {
    if (!this._renderer) {
      return of(void 0);
    }
    this._renderer.setClock({
      anchorTime: this._anchorTime,
      anchorEpoch: performance.timeOrigin + this._anchorWall,
      running: false,
      playbackRate: this._playbackRate,
      duration: duration,
      frameDuration: frameDuration,
    });
    // paused window, same frame images render worker fetches and decodes ahead while paused
    let times = this._renderer.resolveReadyTimes(this._anchorTime, frameDuration, this._playbackRate, false, true);
    return this._renderer.whenReady$(times, FRAME_IMAGE_LOAD_READY_TIMEOUT);
  }

  protected resolveUniformFrameRate(frameImages: FrameImage[]): number | undefined {
    let step = FrameImageLookupFactory.resolveUniformStep(frameImages);
    if (step === void 0) {
      return void 0;
    }
    let frameRate = 1 / step;
    let rounded = Math.round(frameRate);
    if (rounded < 1) {
      return void 0;
    }
    return Math.abs(frameRate - rounded) < FRAME_IMAGE_FRAME_RATE_TOLERANCE ? rounded : frameRate;
  }

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    this._loadBreaker.break();

    return new Observable<boolean>((observer) => {
      let url = args.url;

      if (!url) {
        errorCompleteObserver(observer, new Error(`No url provided`));
        return;
      }

      let loadOptions = args.loadOptions;

      let thumbnailTrack = new ThumbnailTrack({
        source: UrlSource.of(url),
        sourceFileFormatType: FileFormatType.VTT,
        label: 'Frame images',
      });
      thumbnailTrack.loadStart();

      TimedItemsFetcherFactory.createTimedItemsFetcher(thumbnailTrack, void 0)
        .fetchTimedItems()
        .pipe(
          tap(() => thumbnailTrack.loadSuccess()),
          map(() => FrameImageManifest.fromThumbnails(thumbnailTrack.timedItemsSorted)),
          switchMap((frameImages) => {
            this._renderer?.setFrameImages(frameImages);
            this._clockRunning = false;
            this.anchorClock(0);

            const lastFrameImage = frameImages.at(-1);

            if (!lastFrameImage) {
              errorCompleteObserver(observer, new Error(`No frame images`));
              return of(undefined);
            }

            let frameRateModel: FrameRateModel;
            try {
              frameRateModel = FrameRateResolver.resolveFrameRateModel(loadOptions?.frameRate ?? this.resolveUniformFrameRate(frameImages) ?? this._config.defaultFrameRate, loadOptions?.dropFrame);
            } catch (e) {
              errorCompleteObserver(observer, e);
              return of(undefined);
            }

            const duration = lastFrameImage.end;

            let frameImageTrack = new FrameImageTrack({
              source: UrlSource.of(url),
              sourceFileFormatType: FileFormatType.VTT,
              label: 'Frame images',
              duration: duration,
            });
            frameImageTrack.addRelation(Relation.of(RelationType.DERIVED_FROM, thumbnailTrack.id, thumbnailTrack.mediaType));
            frameImageTrack.loadStart();
            frameImageTrack.loadSuccess();
            args
              .mainMediaEssentialArgsHook({
                duration: duration,
                frameRateModel: frameRateModel,
                ffomTimecodeModel: undefined,
                hasVideo: false,
                hasAudio: false,
              })
              .pipe(takeUntil(this._loadBreaker.observer))
              .subscribe({
                next: () => {
                  args
                    .tracksCreatedHook([thumbnailTrack, frameImageTrack])
                    .pipe(
                      switchMap(() => this.awaitLoadReady(frameRateModel.frameDuration, duration)),
                      takeUntil(this._loadBreaker.observer)
                    )
                    .subscribe({
                      next: () => nextCompleteObserver(observer, true),
                      error: (error) => errorCompleteObserver(observer, error),
                    });
                },
                error: (error) => errorCompleteObserver(observer, error),
              });

            return of(undefined);
          }),
          takeUntil(this._loadBreaker.observer)
        )
        .subscribe({
          error: (error) => {
            thumbnailTrack.loadError(error);
            errorCompleteObserver(observer, error);
          },
        });
    });
  }
}
