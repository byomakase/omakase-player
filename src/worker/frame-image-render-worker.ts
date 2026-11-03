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

import {FrameImageCacheImpl} from '../frame-image/frame-image-cache';
import {FRAME_IMAGE_CONFIG_DEFAULT, type FrameImageConfig, type FrameImageStride, FrameImageWindowUtil} from '../frame-image/frame-image-window';
import type {FrameImage} from '../frame-image/frame-image-player-controller';
import type {FrameImageRenderClock, FrameImageRenderRequest, FrameImageRenderResponse, FrameImageRenderSource} from '../frame-image/frame-image-render-protocol';

interface RenderWorkerScope {
  onmessage: ((event: MessageEvent<FrameImageRenderRequest>) => void) | null;
  postMessage(message: FrameImageRenderResponse): void;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
}

const scope = self as unknown as RenderWorkerScope;

/**
 * Paints frame images on transferred OffscreenCanvas. Owns frame image fetching and decoding, and resolves current frame from
 * {@link FrameImageRenderClock} on every animation frame, so painting doesn't depend on main thread.
 */
class FrameImageRenderer {
  protected _requestInits = new Map<string, RequestInit>();
  protected _cache = new FrameImageCacheImpl({requestInit: (url) => this._requestInits.get(url) ?? {}});
  protected _config: FrameImageConfig = FRAME_IMAGE_CONFIG_DEFAULT;
  protected _canvas: OffscreenCanvas | undefined;
  protected _context: OffscreenCanvasRenderingContext2D | undefined;
  protected _frameImages: FrameImage[] = [];
  protected _clock: FrameImageRenderClock | undefined;
  protected _index = -1;
  protected _renderedBitmap: ImageBitmap | undefined;
  protected _lastLoopAt = 0;
  /** Last posted status, posted again only when it changes */
  protected _status: {version: number | undefined; ready: boolean; buffering: boolean} | undefined;
  protected _stride: FrameImageStride | undefined;
  protected _buffering: {time: number; playbackRate: number; stride: FrameImageStride; caughtUp: boolean} | undefined;

  constructor() {
    this._cache.onFrameImageReady$.subscribe(() => this.render());
    this.loop();
  }

  handleMessage(request: FrameImageRenderRequest) {
    switch (request.type) {
      case 'init':
        this._canvas = request.canvas;
        this._context = request.canvas.getContext('2d') ?? void 0;
        break;
      case 'config':
        this._config = request.config;
        this._index = -1;
        this.render();
        break;
      case 'frameImages':
        this.setFrameImages(request.frameImages);
        break;
      case 'clock':
        this.applyClockToBuffering(request.clock);
        this._clock = request.clock;
        // window follows clock immediately, ie. seek target starts loading before next animation frame
        this._index = -1;
        this.render();
        break;
      case 'resize':
        this.resize(request.width, request.height);
        break;
      case 'clear':
        // controller detached, nothing renders until next clock
        this._clock = void 0;
        this._status = void 0;
        this._stride = void 0;
        this._buffering = void 0;
        this.clearCanvas();
        break;
      case 'whenReady':
        this._cache.whenReady$(request.times).subscribe(() => scope.postMessage({type: 'ready', id: request.id}));
        break;
    }
  }

  protected setFrameImages(sources: FrameImageRenderSource[]) {
    this._requestInits = new Map(sources.filter((source) => source.requestInit).map((source) => [source.url, source.requestInit!]));
    this._frameImages = sources.map((source) => ({start: source.start, end: source.end, url: source.url}));
    this._cache.setFrameImages(this._frameImages);
    this._index = -1;
    this._stride = void 0;
    this._buffering = void 0;
    this.clearCanvas();
  }

  protected applyClockToBuffering(clock: FrameImageRenderClock) {
    let buffering = this._buffering;
    if (!buffering) {
      return;
    }
    if (clock.playbackRate !== buffering.playbackRate || (!clock.running && Math.abs(clock.anchorTime - buffering.time) > 2 * Math.abs(buffering.stride.stride))) {
      console.debug(
        `Frame image buffering reset by clock at ${clock.anchorTime.toFixed(3)}s, running ${clock.running}, rate ${clock.playbackRate}, buffering at ${buffering.time.toFixed(3)}s, rate ${buffering.playbackRate}`
      );
      this._buffering = void 0;
    } else if (clock.running && buffering.caughtUp) {
      console.debug(`Frame image buffering ended, clock runs again at ${clock.anchorTime.toFixed(3)}s, buffered from ${buffering.time.toFixed(3)}s`);
      this._buffering = void 0;
    }
  }

  protected loop() {
    let now = performance.now();
    let gap = now - this._lastLoopAt;
    this._lastLoopAt = now;
    this.render(gap);
    if (scope.requestAnimationFrame) {
      scope.requestAnimationFrame(() => this.loop());
    } else {
      setTimeout(() => this.loop(), 1000 / 60);
    }
  }

  protected render(loopGap?: number) {
    if (!this._clock || this._frameImages.length === 0) {
      return;
    }
    let time = this.resolveFrameImageTime(this._clock);
    let linearStride: FrameImageStride | undefined;
    if (!this._clock.frameDuration) {
      // time runs linearly, frame image at stride base is rendered, see FrameImageWindowUtil.resolveLinearStride
      let frameImageAtTime = this._frameImages[Math.max(this._cache.indexAt(time), 0)];
      if (frameImageAtTime) {
        // while buffering, clock is stopped at frame image on stride of running clock, which is decoded
        linearStride = FrameImageWindowUtil.resolveLinearStride(frameImageAtTime, time, this._clock.playbackRate, this._clock.running || !!this._buffering, this._clock.tickDuration);
        time = linearStride.base;
      }
    }
    let index = this._cache.indexAt(time);
    let frameImage = this._frameImages[index];
    if (!frameImage) {
      this.postStatus(this._clock.version, this._cache.isReady([time]));
      return;
    }
    if (index !== this._index) {
      this._index = index;
      if (!frameImage.bitmap && loopGap !== void 0 && this._clock.running) {
        console.warn(`Frame image render stall at ${time.toFixed(3)}s, index ${index}, ${frameImage.blob ? 'decode' : 'fetch'} not ready, loop gap ${loopGap.toFixed(0)}ms`);
      }
      this.updateWindow(frameImage, time, linearStride);
    }
    this.updateBuffering(time);
    this.postStatus(this._clock.version, this._cache.isReady([time]));
    let bitmap = this._cache.getFrameImage(time);
    if (bitmap && bitmap !== this._renderedBitmap) {
      this._renderedBitmap = bitmap;
      this.drawBitmap(bitmap);
    }
  }

  protected updateBuffering(time: number) {
    let clock = this._clock!;
    let stride = this._buffering ? this._buffering.stride : clock.running ? this._stride : void 0;
    if (!stride) {
      return;
    }
    let times = FrameImageWindowUtil.resolveBufferTimes(stride, this._config);
    let ratio = times.filter((bufferTime) => this._cache.isReady([bufferTime])).length / times.length;
    if (!this._buffering && ratio < this._config.bufferStopRatio) {
      console.debug(
        `Frame image buffering started at ${time.toFixed(3)}s, rate ${clock.playbackRate}, ratio ${ratio.toFixed(2)}, stride base ${stride.base.toFixed(3)}s, stride ${stride.stride.toFixed(3)}s`
      );
      this._buffering = {time, playbackRate: clock.playbackRate, stride, caughtUp: false};
    } else if (this._buffering && !this._buffering.caughtUp && ratio >= this._config.bufferResumeRatio) {
      console.debug(
        `Frame image buffering caught up at ${time.toFixed(3)}s, clock running ${clock.running} at ${clock.anchorTime.toFixed(3)}s, ratio ${ratio.toFixed(2)}, buffered from ${this._buffering.time.toFixed(3)}s`
      );
      // window keeps buffering stride until clock runs again, so decoded frame images are kept
      this._buffering = {...this._buffering, caughtUp: true};
    }
  }

  protected postStatus(version: number | undefined, ready: boolean) {
    let buffering = !!this._buffering && !this._buffering.caughtUp;
    if (this._status && this._status.version === version && this._status.ready === ready && this._status.buffering === buffering) {
      return;
    }
    this._status = {version, ready, buffering};
    scope.postMessage({type: 'status', version, ready, buffering});
  }

  /**
   * @param linearStride Stride when time runs linearly, without frame duration
   */
  protected updateWindow(frameImage: FrameImage, time: number, linearStride?: FrameImageStride) {
    let clock = this._clock!;
    let stride = clock.running ? linearStride : (this._buffering?.stride ?? linearStride);
    if (!stride) {
      if (!clock.frameDuration) {
        return;
      }
      stride = FrameImageWindowUtil.resolveStride(frameImage, time, clock.frameDuration, clock.playbackRate, clock.running);
    }
    if (this._buffering && clock.running) {
      console.debug(`Frame image buffering follows running clock from ${this._buffering.time.toFixed(3)}s to ${time.toFixed(3)}s`);
      this._buffering = {time, playbackRate: clock.playbackRate, stride, caughtUp: false};
    }
    this._stride = stride;
    this._cache.setFetchTimes(FrameImageWindowUtil.resolveFetchTimes(stride, this._config));
    this._cache.setDecodeTimes(FrameImageWindowUtil.resolveDecodeTimes(stride, this._config));
  }

  protected resolveFrameImageTime(clock: FrameImageRenderClock): number {
    if (!clock.running) {
      return clock.anchorTime;
    }
    let elapsed = (performance.timeOrigin + performance.now() - clock.anchorEpoch) / 1000;
    if (!clock.frameDuration) {
      return Math.min(Math.max(clock.anchorTime + elapsed * clock.playbackRate, clock.minTime ?? 0), clock.duration);
    }
    let anchorFrameImage = this._frameImages[this._cache.indexAt(clock.anchorTime)];
    let frameImageDuration = anchorFrameImage ? anchorFrameImage.end - anchorFrameImage.start : clock.frameDuration;
    return FrameImageWindowUtil.resolveRunningTime(clock.anchorTime, elapsed, clock.playbackRate, clock.frameDuration, frameImageDuration, clock.duration);
  }

  protected drawBitmap(bitmap: ImageBitmap) {
    let canvas = this._canvas;
    let context = this._context;
    if (!canvas || !context || bitmap.width === 0) {
      return;
    }
    let scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    let width = bitmap.width * scale;
    let height = bitmap.height * scale;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }

  protected resize(width: number, height: number) {
    if (!this._canvas || (this._canvas.width === width && this._canvas.height === height)) {
      return;
    }
    this._canvas.width = width;
    this._canvas.height = height;
    if (this._renderedBitmap) {
      this.drawBitmap(this._renderedBitmap);
    }
  }

  protected clearCanvas() {
    this._renderedBitmap = void 0;
    if (this._canvas && this._context) {
      this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
  }
}

const renderer = new FrameImageRenderer();
scope.onmessage = (event) => renderer.handleMessage(event.data);
scope.postMessage({type: 'started'});
