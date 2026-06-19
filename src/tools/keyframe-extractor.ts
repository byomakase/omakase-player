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

import {Observable} from 'rxjs';
import {DomUtil} from '../dom/dom-util';
import {OmpError} from '../types';
import {BlobUtil} from '../util/blob-util';
import {nextCompleteObserver} from '../util/rxjs-util';
import {Validators} from '../common/validators';

export enum VideoKeyframeType {
  PNG = 'PNG',
  JPEG = 'JPEG',
}

export interface VideoKeyframeOptions {
  type?: VideoKeyframeType;
}

export interface VideoKeyframe {
  src: string;
}

export class VideoKeyframeExtractor {
  static extractVideoKeyframe(options: VideoKeyframeOptions = {type: VideoKeyframeType.JPEG}, videoElement: HTMLVideoElement): Observable<VideoKeyframe> {
    return new Observable<VideoKeyframe>((observer) => {
      Validators.videoKeyframeType()(options.type!);

      let canvasElem: HTMLCanvasElement | undefined = DomUtil.createElement<'canvas'>('canvas');
      let canvasCtx = canvasElem!.getContext('2d');
      if (!canvasCtx) {
        throw new OmpError('Unable to extract video frame');
      }

      let width = videoElement.videoWidth;
      let height = videoElement.videoHeight;
      canvasElem.width = width;
      canvasElem.height = height;

      canvasCtx.drawImage(videoElement, 0, 0, width, height);

      let destroyCanvas = () => {
        if (canvasCtx) {
          canvasCtx.clearRect(0, 0, width, height);
          canvasCtx = null;
        }
        canvasElem!.width = 0;
        canvasElem!.height = 0;
        canvasElem = void 0;
      };

      canvasElem.toBlob(
        (blob) => {
          if (!blob) {
            throw new OmpError('Current video frame could not be extracted because it is empty');
          }

          let videoKeyframe = {src: BlobUtil.createObjectURL(blob)};
          nextCompleteObserver(observer, videoKeyframe);

          destroyCanvas();
        },
        `image/${options.type!.toLowerCase()}`,
        1
      );
    });
  }
}
