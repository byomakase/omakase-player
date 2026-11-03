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

import {defaultIfEmpty, filter, map, type Observable, startWith, Subject, take} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import type {FrameImage} from './frame-image-player-controller';
import {type FrameImageLookup, FrameImageLookupFactory} from './frame-image-lookup';

export interface ReadOnlyFrameImageCache {
  onFrameImageReady$: Observable<string>;
  getFrameImage(time: number): ImageBitmap | undefined;
}

export interface FrameImageCache extends ReadOnlyFrameImageCache, Destroyable {
  setFrameImages(frameImages: FrameImage[]): void;
  indexAt(time: number): number;
  setFetchTimes(times: number[]): void;
  setDecodeTimes(times: number[]): void;
  whenReady$(times: number[]): Observable<void>;
  /** Whether frame images at times are decoded, times without frame image are ready. */
  isReady(times: number[]): boolean;
}

export interface FrameImageCacheOptions {
  requestInit?: (url: string) => RequestInit;
  decode?: (blob: Blob) => Promise<ImageBitmap>;
}

export class FrameImageCacheImpl implements FrameImageCache {
  protected readonly _onFrameImageReady$ = new Subject<string>();
  protected readonly _options: FrameImageCacheOptions;

  protected _frameImages: FrameImage[] = [];
  protected _fetching = new Map<FrameImage, AbortController>();
  protected _decoding = new Set<FrameImage>();
  protected _lookup: FrameImageLookup = FrameImageLookupFactory.create([]);
  protected _fetchIndices = new Set<number>();
  protected _decodeIndices = new Set<number>();

  constructor(options: FrameImageCacheOptions = {}) {
    this._options = options;
  }

  get onFrameImageReady$(): Observable<string> {
    return this._onFrameImageReady$.asObservable();
  }

  getFrameImage(time: number): ImageBitmap | undefined {
    let frameImage = this._frameImages[this._lookup.indexAt(time)];
    return frameImage && time < frameImage.end ? frameImage.bitmap : void 0;
  }

  indexAt(time: number): number {
    return this._lookup.indexAt(time);
  }

  whenReady$(times: number[]): Observable<void> {
    return this._onFrameImageReady$.pipe(
      startWith(void 0),
      filter(() => this.isReady(times)),
      take(1),
      map(() => void 0),
      defaultIfEmpty(void 0)
    );
  }

  isReady(times: number[]): boolean {
    return times.every((time) => {
      let frameImage = this._frameImages[this._lookup.indexAt(time)];
      return !frameImage || !!frameImage.bitmap;
    });
  }

  setFrameImages(frameImages: FrameImage[]): void {
    this.releaseAll();
    this._frameImages = frameImages.sort((a, b) => a.start - b.start);
    this._lookup = FrameImageLookupFactory.create(this._frameImages);
    this._fetchIndices = new Set();
    this._decodeIndices = new Set();
  }

  setFetchTimes(times: number[]): void {
    let indices = this.resolveIndices(times);
    this._fetchIndices.forEach((index) => {
      if (!indices.has(index)) {
        this.release(this._frameImages[index]!);
      }
    });
    this._fetchIndices = indices;
    indices.forEach((index) => this.fetch(this._frameImages[index]!));
  }

  setDecodeTimes(times: number[]): void {
    let indices = this.resolveIndices(times);
    this._decodeIndices.forEach((index) => {
      if (!indices.has(index)) {
        this.releaseBitmap(this._frameImages[index]!);
      }
    });
    this._decodeIndices = indices;
    indices.forEach((index) => this.decode(this._frameImages[index]!));
  }

  protected resolveIndices(times: number[]): Set<number> {
    let indices = new Set<number>();
    times.forEach((time) => {
      let index = this._lookup.indexAt(time);
      if (index >= 0) {
        indices.add(index);
      }
    });
    return indices;
  }

  protected isInDecodeWindow(frameImage: FrameImage): boolean {
    return this._decodeIndices.has(this._lookup.indexAt(frameImage.start));
  }

  protected fetch(frameImage: FrameImage) {
    if (frameImage.blob || this._fetching.has(frameImage)) {
      return;
    }
    let abortController = new AbortController();
    this._fetching.set(frameImage, abortController);

    fetch(frameImage.url, {...this._options.requestInit?.(frameImage.url), signal: abortController.signal})
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch frame image: ${frameImage.url}, status: ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        if (this._fetching.get(frameImage) !== abortController) {
          return;
        }
        this._fetching.delete(frameImage);
        frameImage.blob = blob;
        frameImage.fetchedAt = performance.now();
        if (this.isInDecodeWindow(frameImage)) {
          this.decode(frameImage);
        }
      })
      .catch((error) => {
        if (this._fetching.get(frameImage) === abortController) {
          this._fetching.delete(frameImage);
        }
        if (!abortController.signal.aborted) {
          console.error(error);
        }
      });
  }

  protected decode(frameImage: FrameImage) {
    if (!frameImage.blob || frameImage.bitmap || this._decoding.has(frameImage)) {
      return;
    }
    this._decoding.add(frameImage);
    frameImage.decodeRequestedAt = performance.now();

    let decoded = this._options.decode ? this._options.decode(frameImage.blob) : createImageBitmap(frameImage.blob);
    decoded
      .then((bitmap) => {
        if (!this._decoding.delete(frameImage)) {
          bitmap.close();
          return;
        }
        frameImage.bitmap = bitmap;
        this._onFrameImageReady$.next(frameImage.url);
      })
      .catch((error) => {
        this._decoding.delete(frameImage);
        console.error(error);
      });
  }

  protected releaseBitmap(frameImage: FrameImage) {
    this._decoding.delete(frameImage);
    frameImage.bitmap?.close();
    frameImage.bitmap = void 0;
    frameImage.decodeRequestedAt = void 0;
  }

  protected release(frameImage: FrameImage) {
    this._fetching.get(frameImage)?.abort();
    this._fetching.delete(frameImage);
    frameImage.blob = void 0;
    frameImage.fetchedAt = void 0;
    this.releaseBitmap(frameImage);
  }

  protected releaseAll() {
    this._frameImages.forEach((frameImage) => this.release(frameImage));
  }

  destroy(): void {
    this.releaseAll();
    this._onFrameImageReady$.complete();
  }
}
