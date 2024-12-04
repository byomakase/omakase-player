/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {HTMLVideoElementEventKeys, VIDEO_CONTROLLER_CONFIG_DEFAULT, VideoController, VideoControllerConfig} from './video-controller';
import {first, forkJoin, fromEvent, Observable} from 'rxjs';
import {z} from 'zod';
import {Video, VideoLoadOptions} from './model';
import Decimal from 'decimal.js';
import {VideoDomControllerApi} from './video-dom-controller-api';
import {nextCompleteObserver, passiveObservable} from '../util/rxjs-util';

export interface VideoNativeControllerConfig extends VideoControllerConfig {}

export const VIDEO_NATIVE_CONTROLLER_CONFIG_DEFAULT: Omit<VideoNativeControllerConfig, 'videoDomController'> = {
  ...VIDEO_CONTROLLER_CONFIG_DEFAULT,
};

export class VideoNativeController extends VideoController<VideoNativeControllerConfig> {
  constructor(config: VideoNativeControllerConfig, videoDomController: VideoDomControllerApi) {
    super(
      {
        ...VIDEO_NATIVE_CONTROLLER_CONFIG_DEFAULT,
        ...config,
      },
      videoDomController
    );
  }

  loadVideoUsingLoader(sourceUrl: string, frameRate: number, options?: VideoLoadOptions): Observable<Video> {
    return passiveObservable<Video>((observer) => {
      let videoLoadedData$ = fromEvent(this.videoElement, HTMLVideoElementEventKeys.LOADEDDATA).pipe(first());

      forkJoin([videoLoadedData$])
        .pipe(first())
        .subscribe((result) => {
          let duration: number;
          if (options && options.duration !== void 0) {
            duration = z.coerce.number().parse(options.duration);
            duration = duration ? duration : this.videoElement.duration;
          } else {
            duration = this.videoElement.duration;
          }

          let dropFrame = options && options.dropFrame !== void 0 ? options.dropFrame : false;

          let video: Video = {
            sourceUrl: sourceUrl,
            frameRate: frameRate,
            dropFrame: dropFrame,
            duration: duration,
            totalFrames: Decimal.mul(duration, frameRate).ceil().toNumber(),
            frameDuration: Decimal.div(1, frameRate).toNumber(),
            audioOnly: false,
            // initSegmentTimeOffset: Decimal.div(2, frameRate).toNumber() // TODO manually, how to identify initSegment ????
          }; // TODO adjust for audio only

          nextCompleteObserver(observer, video);
        });

      this.videoElement.src = sourceUrl;
      this.videoElement.load(); // TODO in progressive watch for load event and then complete observable
    });
  }
}
