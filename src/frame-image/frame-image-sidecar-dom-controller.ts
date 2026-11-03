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

import {map, Observable, of, tap, throwError} from 'rxjs';
import type {SidecarDomController} from '../video/sidecar-track-controller';
import {SidecarVideoDomClasses} from '../video/sidecar-video-dom-controller';
import {FrameImageManifest} from './frame-image-manifest';
import type {FrameImage} from './frame-image-player-controller';
import {FrameImageRenderer} from './frame-image-renderer';
import type {FrameImageTrackItem} from './frame-image-track';
import type {FrameImageConfig} from './frame-image-window';

export interface FrameImageSidecarDomControllerConfig {
  /** Element sidecar canvas will be mounted into. */
  hostElement: HTMLElement;

  /** Frame images held by frame image track, loaded instead of manifest at source url. */
  frameImages?: FrameImageTrackItem[] | undefined;

  frameImageConfig?: Partial<FrameImageConfig> | undefined;
}

/**
 * Clock in sidecar time frame images are rendered from. Sidecar time runs from {@link anchorTime} at playback rate while running,
 * clamped to [{@link minTime}, {@link maxTime}].
 */
export interface FrameImageSidecarClock {
  /** Sidecar time clock was anchored at. */
  anchorTime: number;
  /** `performance.timeOrigin + performance.now()` clock was anchored at. */
  anchorEpoch: number;
  running: boolean;
  playbackRate: number;
  minTime: number;
  maxTime: number;
  tickDuration?: number | undefined;
}

/**
 * Renders frame images of frame image manifest into canvas mounted into host element, from {@link FrameImageSidecarClock}, see {@link FrameImageRenderer}.
 * Frame images are fetched and decoded only around rendered time, see {@link FrameImageWindowUtil.resolveLinearStride}.
 *
 * Without render worker - not supported, or failed to start - frame images are not rendered, and main media doesn't wait for them.
 */
export class FrameImageSidecarDomController implements SidecarDomController {
  protected readonly _hostElement: HTMLElement;
  protected readonly _renderer: FrameImageRenderer;

  /** Frame images of frame image track, no manifest is fetched when set. */
  protected readonly _trackFrameImages: FrameImageTrackItem[] | undefined;

  /** Manifest is fetched once, frame images are set again when source is attached. */
  protected _manifestUrl: string | undefined;
  protected _manifest: FrameImage[] | undefined;

  /** Clock in sidecar time, renderer is driven by it */
  protected _clock: FrameImageSidecarClock | undefined;

  constructor(config: FrameImageSidecarDomControllerConfig) {
    this._hostElement = config.hostElement;
    this._trackFrameImages = config.frameImages;

    this._renderer = new FrameImageRenderer(this._hostElement, {display: 'block'});
    this._renderer.canvas.classList.add(SidecarVideoDomClasses.video);
    this._renderer.setConfig(config.frameImageConfig);
  }

  get canvas(): HTMLCanvasElement {
    return this._renderer.canvas;
  }

  /** Whether frame images are rendered, render worker is supported and running. */
  get rendering(): boolean {
    return this._renderer.rendering;
  }

  get visible(): boolean {
    return this._renderer.canvas.style.visibility !== 'hidden';
  }

  set visible(visible: boolean) {
    this._renderer.canvas.style.visibility = visible ? '' : 'hidden';
  }

  set zIndex(zIndex: string) {
    this._renderer.canvas.style.zIndex = zIndex;
  }

  /** Duration of attached source, end of last frame image. */
  get duration(): number {
    return this._renderer.duration ?? 0;
  }

  get clock(): FrameImageSidecarClock | undefined {
    return this._clock;
  }

  loadSource(url: string | undefined, startTime: number = 0): Observable<void> {
    return new Observable<void>((observer) => {
      let subscription = this.loadManifest(url)
        .pipe(
          tap((manifest) => {
            if (manifest.length === 0) {
              throw new Error(`No frame images in ${url ?? 'track'}`);
            }
            // manifest is kept for next time source is attached, renderer doesn't modify it
            this._renderer.setFrameImages(manifest);
            // holds frame at start time until sidecar is synced with main media
            this.setClock({anchorTime: startTime, anchorEpoch: FrameImageSidecarDomController.now(), running: false, playbackRate: 1, minTime: startTime, maxTime: startTime});
          })
        )
        .subscribe({
          next: () => {
            // nothing is rendered without render worker, source is attached nevertheless, renderer is ready right away then
            this._renderer.whenReady$([startTime]).subscribe({next: () => observer.next(), complete: () => observer.complete()});
          },
          error: (error) => observer.error(error),
        });
      return () => subscription.unsubscribe();
    });
  }

  loadDuration(url: string | undefined): Observable<number> {
    return this.loadManifest(url).pipe(
      map((manifest) => {
        let duration = FrameImageManifest.resolveDuration(manifest);
        if (duration === void 0) {
          throw new Error(`No frame images in ${url ?? 'track'}`);
        }
        return duration;
      })
    );
  }

  protected loadManifest(url: string | undefined): Observable<FrameImage[]> {
    if (this._trackFrameImages) {
      return of(this._trackFrameImages);
    }
    if (!url) {
      return throwError(() => new Error(`Frame image sidecar has neither manifest url nor frame images`));
    }
    if (this._manifest && this._manifestUrl === url) {
      return of(this._manifest);
    }
    return FrameImageManifest.load(url).pipe(
      tap((manifest) => {
        this._manifestUrl = url;
        this._manifest = manifest;
      })
    );
  }

  release(): void {
    this._clock = void 0;
    this._renderer.setFrameImages([]);
    this._renderer.clear();
  }

  /** Renders frame images from clock, sidecar time continues from clock anchor while clock runs. */
  setClock(clock: FrameImageSidecarClock) {
    this._clock = clock;
    this._renderer.setClock({
      anchorTime: clock.anchorTime,
      anchorEpoch: clock.anchorEpoch,
      running: clock.running,
      playbackRate: clock.playbackRate,
      duration: clock.maxTime,
      frameDuration: void 0,
      tickDuration: clock.tickDuration,
      minTime: clock.minTime,
    });
  }

  /**
   * Whether frame image at current clock time is decoded, as reported by render worker. Without render worker nothing is rendered,
   * main media doesn't wait for it.
   */
  isReady(_time: number): boolean {
    return this._renderer.isReady();
  }

  get buffering(): boolean {
    return this._renderer.buffering;
  }

  get onStatus$(): Observable<void> {
    return this._renderer.onStatus$;
  }

  /** Sidecar time of clock, clamped to its bounds. */
  static resolveClockTime(clock: FrameImageSidecarClock): number {
    if (!clock.running) {
      return clock.anchorTime;
    }
    let elapsed = (FrameImageSidecarDomController.now() - clock.anchorEpoch) / 1000;
    return Math.min(Math.max(clock.anchorTime + elapsed * clock.playbackRate, clock.minTime), clock.maxTime);
  }

  /** Same time base as render worker clock. */
  static now(): number {
    return performance.timeOrigin + performance.now();
  }

  destroy() {
    this._renderer.destroy();
  }
}
