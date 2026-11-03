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

import {Observable, Subject} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import {AuthConfig} from '../common';
import {BlobUtil} from '../util/blob-util';
import type {FrameImage} from './frame-image-player-controller';
import type {FrameImageRenderClock, FrameImageRenderRequest, FrameImageRenderResponse, FrameImageRenderSource} from './frame-image-render-protocol';
import type {FrameImageConfig} from './frame-image-window';
// @ts-ignore
import renderWorkerSource from '../worker/frame-image-render-worker.js?raw';

export class FrameImageRenderWorkerClient implements Destroyable {
  protected _worker: Worker;
  protected _workerUrl: string;
  protected _lastClock: FrameImageRenderClock | undefined;
  protected _pendingReady = new Map<number, () => void>();
  protected _nextReadyId = 0;
  protected _destroyed = false;
  protected _started = false;
  protected _status: {version: number | undefined; ready: boolean; buffering: boolean} | undefined;
  protected readonly _onStatus$ = new Subject<void>();

  /**
   * Transfers canvas control to render worker. Returns undefined if not supported, frame images are not rendered in that case.
   */
  static create(canvas: HTMLCanvasElement): FrameImageRenderWorkerClient | undefined {
    if (typeof canvas.transferControlToOffscreen !== 'function' || typeof Worker === 'undefined') {
      console.error(`Frame image render worker not supported, OffscreenCanvas and Worker are required, frame images will not be rendered`);
      return void 0;
    }
    let workerUrl: string | undefined;
    try {
      workerUrl = BlobUtil.createBlobURL([renderWorkerSource], {type: 'application/javascript'});
      let worker = new Worker(workerUrl, {type: 'module'});
      let offscreenCanvas = canvas.transferControlToOffscreen();
      return new FrameImageRenderWorkerClient(worker, workerUrl, offscreenCanvas);
    } catch (error) {
      console.error(`Frame image render worker not available, frame images will not be rendered`, error);
      if (workerUrl) {
        BlobUtil.revokeObjectURL(workerUrl);
      }
      return void 0;
    }
  }

  protected constructor(worker: Worker, workerUrl: string, offscreenCanvas: OffscreenCanvas) {
    this._worker = worker;
    this._workerUrl = workerUrl;
    this._worker.onmessage = (event: MessageEvent<FrameImageRenderResponse>) => {
      if (event.data.type === 'started') {
        this._started = true;
      } else if (event.data.type === 'ready') {
        let resolve = this._pendingReady.get(event.data.id);
        this._pendingReady.delete(event.data.id);
        resolve?.();
      } else if (event.data.type === 'status') {
        this._status = {version: event.data.version, ready: event.data.ready, buffering: event.data.buffering};
        this._onStatus$.next();
      }
    };
    this._worker.onerror = (event) => {
      event.preventDefault();
      let location = `${event.message} (${event.filename}:${event.lineno}:${event.colno})`;
      if (this._started) {
        console.error(`Frame image render worker error: ${location}`, event.error);
        return;
      }
      console.error(`Frame image render worker failed to start, frame images will not be rendered: ${location}`, event.error);
      this.destroy();
    };
    this.post({type: 'init', canvas: offscreenCanvas}, [offscreenCanvas]);
  }

  setFrameImages(frameImages: FrameImage[]) {
    let sources: FrameImageRenderSource[] = frameImages.map((frameImage) => ({
      start: frameImage.start,
      end: frameImage.end,
      url: frameImage.url,
      requestInit: this.resolveRequestInit(frameImage.url),
    }));
    this._lastClock = void 0;
    this.post({type: 'frameImages', frameImages: sources});
  }

  setConfig(config: FrameImageConfig) {
    this.post({type: 'config', config});
  }

  /** Whether render worker reported frame image at time of clock with version as decoded. */
  /** Whether render worker is destroyed, ie. it failed to start. */
  get destroyed(): boolean {
    return this._destroyed;
  }

  isReady(version: number): boolean {
    return !!this._status && this._status.version === version && this._status.ready;
  }

  get buffering(): boolean {
    return !this._destroyed && !!this._status?.buffering;
  }

  get onStatus$(): Observable<void> {
    return this._onStatus$.asObservable();
  }

  setClock(clock: FrameImageRenderClock) {
    let last = this._lastClock;
    if (
      last &&
      last.anchorTime === clock.anchorTime &&
      last.anchorEpoch === clock.anchorEpoch &&
      last.running === clock.running &&
      last.playbackRate === clock.playbackRate &&
      last.duration === clock.duration &&
      last.frameDuration === clock.frameDuration &&
      last.tickDuration === clock.tickDuration &&
      last.minTime === clock.minTime &&
      last.version === clock.version
    ) {
      return;
    }
    this._lastClock = clock;
    this.post({type: 'clock', clock});
  }

  resize(width: number, height: number) {
    this.post({type: 'resize', width, height});
  }

  clear() {
    this._lastClock = void 0;
    this.post({type: 'clear'});
  }

  whenReady$(times: number[]): Observable<void> {
    return new Observable<void>((observer) => {
      let id = this._nextReadyId++;
      this._pendingReady.set(id, () => {
        observer.next();
        observer.complete();
      });
      this.post({type: 'whenReady', id, times});
      return () => this._pendingReady.delete(id);
    });
  }

  protected resolveRequestInit(url: string): FrameImageRenderSource['requestInit'] {
    let requestInit = AuthConfig.createRequestInit(url, AuthConfig.authentication);
    if (!requestInit.headers && !requestInit.credentials) {
      return void 0;
    }
    let headers: Record<string, string> = {};
    new Headers(requestInit.headers).forEach((value, key) => (headers[key] = value));
    return {headers, ...(requestInit.credentials ? {credentials: requestInit.credentials} : {})};
  }

  protected post(request: FrameImageRenderRequest, transfer: Transferable[] = []) {
    if (!this._destroyed) {
      this._worker.postMessage(request, transfer);
    }
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this._worker.terminate();
    BlobUtil.revokeObjectURL(this._workerUrl);
    // pending seeks fall back to their timeout
    this._pendingReady.clear();
    this._onStatus$.next();
    this._onStatus$.complete();
  }
}
