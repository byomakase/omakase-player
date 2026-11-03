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

import {NEVER, type Observable, of, timeout} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import type {FrameImage} from './frame-image-player-controller';
import {type FrameImageLookup, FrameImageLookupFactory} from './frame-image-lookup';
import type {FrameImageRenderClock} from './frame-image-render-protocol';
import {FrameImageRenderWorkerClient} from './frame-image-render-worker-client';
import {FRAME_IMAGE_CONFIG_DEFAULT, type FrameImageConfig, FrameImageWindowUtil} from './frame-image-window';

export type FrameImageRendererClock = Omit<FrameImageRenderClock, 'version'>;

export class FrameImageRenderer implements Destroyable {
  protected readonly _canvas: HTMLCanvasElement;
  protected readonly _resizeObserver: ResizeObserver;
  protected _renderWorker: FrameImageRenderWorkerClient | undefined;

  protected _frameImages: FrameImage[] = [];
  protected _frameImageLookup: FrameImageLookup = FrameImageLookupFactory.create([]);

  protected _clock: FrameImageRenderClock | undefined;
  protected _clockVersion = 0;

  protected _config: FrameImageConfig = FRAME_IMAGE_CONFIG_DEFAULT;

  constructor(hostElement: HTMLElement, canvasStyle: Partial<CSSStyleDeclaration> = {}) {
    this._canvas = document.createElement('canvas');
    Object.assign(this._canvas.style, {
      width: '100%',
      height: '100%',
      ...canvasStyle,
    });
    hostElement.appendChild(this._canvas);

    this._renderWorker = FrameImageRenderWorkerClient.create(this._canvas);

    this._resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this._resizeObserver.observe(this._canvas);
  }

  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }

  get rendering(): boolean {
    return !!this._renderWorker && !this._renderWorker.destroyed;
  }

  get frameImages(): FrameImage[] {
    return this._frameImages;
  }

  get duration(): number | undefined {
    return this._frameImages.at(-1)?.end;
  }

  get clock(): FrameImageRendererClock | undefined {
    return this._clock;
  }

  setConfig(config: Partial<FrameImageConfig> | undefined) {
    this._config = {...FRAME_IMAGE_CONFIG_DEFAULT, ...config};
    this._renderWorker?.setConfig(this._config);
  }

  setFrameImages(frameImages: FrameImage[]) {
    this._frameImages = [...frameImages].sort((a, b) => a.start - b.start);
    this._frameImageLookup = FrameImageLookupFactory.create(this._frameImages);
    this._clock = void 0;
    this._renderWorker?.setFrameImages(this._frameImages);
  }

  setClock(clock: FrameImageRendererClock) {
    if (this._clock && this.isSameClock(this._clock, clock)) {
      return;
    }
    this._clock = {...clock, version: ++this._clockVersion};
    this._renderWorker?.setClock(this._clock);
  }

  protected isSameClock(current: FrameImageRenderClock, clock: FrameImageRendererClock): boolean {
    let keys = new Set([...Object.keys(current), ...Object.keys(clock)]);
    keys.delete('version');
    return [...keys].every((key) => current[key as keyof FrameImageRendererClock] === clock[key as keyof FrameImageRendererClock]);
  }

  resolveReadyTimes(time: number, frameDuration: number | undefined, playbackRate: number, running: boolean, ahead: boolean = running): number[] {
    let frameImage = this._frameImages[Math.max(this._frameImageLookup.indexAt(time), 0)];
    if (!frameImage) {
      return [];
    }
    let frameImageStride = frameDuration
      ? FrameImageWindowUtil.resolveStride(frameImage, time, frameDuration, playbackRate, running)
      : FrameImageWindowUtil.resolveLinearStride(frameImage, time, playbackRate, running, this._clock?.tickDuration);
    return FrameImageWindowUtil.resolveSeekReadyTimes(frameImageStride, ahead, this._config);
  }

  whenReady$(times: number[], timeoutMs?: number): Observable<void> {
    if (!this.rendering || times.length === 0) {
      return of(void 0);
    }
    let ready$ = this._renderWorker!.whenReady$(times);
    return timeoutMs === void 0 ? ready$ : ready$.pipe(timeout({first: timeoutMs, with: () => of(void 0)}));
  }

  isReady(): boolean {
    return !this.rendering || this._renderWorker!.isReady(this._clockVersion);
  }

  get buffering(): boolean {
    return this.rendering && this._renderWorker!.buffering;
  }

  get onStatus$(): Observable<void> {
    return this._renderWorker?.onStatus$ ?? NEVER;
  }

  clear() {
    this._clock = void 0;
    this._renderWorker?.clear();
  }

  protected resizeCanvas() {
    this._renderWorker?.resize(Math.round(this._canvas.clientWidth * window.devicePixelRatio), Math.round(this._canvas.clientHeight * window.devicePixelRatio));
  }

  destroy(): void {
    this._resizeObserver.disconnect();
    this._renderWorker?.destroy();
    this._renderWorker = void 0;
    this._canvas.remove();
  }
}
