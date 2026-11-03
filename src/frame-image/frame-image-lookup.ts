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

import type {FrameImage} from './frame-image-player-controller';

const UNIFORM_TOLERANCE = 0.001;

export interface FrameImageLookup {
  indexAt(time: number): number;
}

export class BinarySearchFrameImageLookup implements FrameImageLookup {
  constructor(protected readonly _frameImages: FrameImage[]) {}

  indexAt(time: number): number {
    let low = 0;
    let high = this._frameImages.length - 1;
    let found = -1;
    while (low <= high) {
      let mid = (low + high) >> 1;
      if (this._frameImages[mid]!.start <= time) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found;
  }
}

export class UniformFrameImageLookup implements FrameImageLookup {
  constructor(
    protected readonly _frameImages: FrameImage[],
    protected readonly _step: number
  ) {}

  indexAt(time: number): number {
    let frameImages = this._frameImages;
    if (frameImages.length === 0 || time < frameImages[0]!.start) {
      return -1;
    }
    let index = Math.min(Math.floor((time - frameImages[0]!.start) / this._step), frameImages.length - 1);
    while (index > 0 && frameImages[index]!.start > time) {
      index--;
    }
    while (index < frameImages.length - 1 && frameImages[index + 1]!.start <= time) {
      index++;
    }
    return index;
  }
}

export class FrameImageLookupFactory {
  static create(frameImages: FrameImage[]): FrameImageLookup {
    let step = this.resolveUniformStep(frameImages);
    return step !== void 0 ? new UniformFrameImageLookup(frameImages, step) : new BinarySearchFrameImageLookup(frameImages);
  }

  static resolveUniformStep(frameImages: FrameImage[]): number | undefined {
    if (frameImages.length < 2) {
      return void 0;
    }
    let first = frameImages[0]!.start;
    let step = (frameImages[frameImages.length - 1]!.start - first) / (frameImages.length - 1);
    if (!(step > 0)) {
      return void 0;
    }
    return frameImages.every((frameImage, index) => Math.abs(frameImage.start - (first + index * step)) <= UNIFORM_TOLERANCE) ? step : void 0;
  }
}
