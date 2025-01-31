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

import {first, forkJoin, fromEvent, Observable} from 'rxjs';
import {Video, VideoLoadOptions} from './model';
import {BaseVideoLoader} from './video-loader';
import {nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {HTMLVideoElementEventKeys} from './video-controller';
import {z} from 'zod';
import {VideoControllerApi} from './video-controller-api';
import {FrameRateUtil} from '../util/frame-rate-util';
import {OmpNamedEvents} from '../types';

export class VideoNativeLoader extends BaseVideoLoader {
  constructor(videoController: VideoControllerApi) {
    super(videoController);

    console.debug('video load with native');
  }

  override loadVideo(sourceUrl: string, frameRate: number, options?: VideoLoadOptions | undefined): Observable<Video> {
    return passiveObservable<Video>((observer) => {
      this._videoController.getHTMLVideoElement().src = '';
      this._videoController.getHTMLVideoElement().load();

      let videoLoadedData$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEventKeys.LOADEDDATA).pipe(first());
      let videoLoadedMetadata$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEventKeys.LOADEDMETEDATA).pipe(first());

      forkJoin([videoLoadedData$, videoLoadedMetadata$])
        .pipe(first())
        .subscribe((result) => {
          let duration: number;
          if (options && options.duration !== void 0) {
            duration = z.coerce.number().parse(options.duration);
            duration = duration ? duration : this._videoController.getHTMLVideoElement().duration;
          } else {
            duration = this._videoController.getHTMLVideoElement().duration;
          }

          let dropFrame = options && options.dropFrame !== void 0 ? options.dropFrame : false;

          let video: Video = {
            sourceUrl: sourceUrl,
            frameRate: frameRate,
            dropFrame: dropFrame,
            duration: duration,
            totalFrames: FrameRateUtil.totalFramesNumber(duration, frameRate),
            frameDuration: FrameRateUtil.frameDuration(frameRate),
            audioOnly: false,
            drm: false
          };

          nextCompleteObserver(observer, video);
        });

      this._videoController.getHTMLVideoElement().src = sourceUrl;
      this._videoController.getHTMLVideoElement().load();

      // assuming no embedded subtitles
      this.onSubtitlesLoaded$.next({
        tracks: [],
        currentTrack: void 0,
      });

      // assuming interleaved audio
      this.onAudioLoaded$.next({
        audioTracks: [],
        activeAudioTrack: void 0,
      });
    });
  }

  updateActiveNamedEventStreams(eventNames: OmpNamedEvents[]): void {}

  override destroy() {
    super.destroy();
  }
}
