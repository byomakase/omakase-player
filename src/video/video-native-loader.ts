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

import {first, forkJoin, fromEvent, Observable, Subject, take, takeUntil} from 'rxjs';
import {Video, VideoLoadOptions} from './model';
import {BaseVideoLoader} from './video-loader';
import {errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {HTMLVideoElementEventKeys} from './video-controller';
import {z} from 'zod';
import {VideoControllerApi} from './video-controller-api';
import {FrameRateUtil} from '../util/frame-rate-util';
import {OmpAudioTrack, OmpAudioTrackCreateType, OmpNamedEventEventName} from '../types';
import {FileUtil} from '../util/file-util';
import {CryptoUtil} from '../util/crypto-util';
import {AudioUtil} from '../util/audio-util';
import {AuthConfig} from '../auth/auth-config';
import {BlobUtil} from '../util/blob-util';

export class VideoNativeLoader extends BaseVideoLoader {
  protected _audioTracks: Map<string, OmpAudioTrack> = new Map<string, OmpAudioTrack>();
  protected _activeAudioTrack: OmpAudioTrack | undefined;

  constructor(videoController: VideoControllerApi) {
    super(videoController);

    console.debug('video load with native');
  }

  override loadVideo(sourceUrl: string, options?: VideoLoadOptions | undefined): Observable<Video> {
    nextCompleteSubject(this._loadVideoBreaker$);
    this._loadVideoBreaker$ = new Subject<void>();

    return passiveObservable<Video>((observer) => {
      this._videoController.getHTMLVideoElement().src = '';
      this._videoController.getHTMLVideoElement().load();

      let videoLoadedData$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEventKeys.LOADEDDATA).pipe(first());
      let videoLoadedMetadata$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEventKeys.LOADEDMETEDATA).pipe(first());
      let videoLoadError$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEventKeys.ERROR).pipe(take(1));

      forkJoin([videoLoadedData$, videoLoadedMetadata$])
        .pipe(takeUntil(this._destroyed$))
        .pipe(take(1))
        .subscribe((result) => {
          let duration: number;
          if (options && options.duration !== void 0) {
            duration = z.coerce.number().parse(options.duration);
            duration = duration ? duration : this._videoController.getHTMLVideoElement().duration;
          } else {
            duration = this._videoController.getHTMLVideoElement().duration;
          }

          let dropFrame = options && options.dropFrame !== void 0 ? options.dropFrame : false;

          let isAudioOnly = FileUtil.isAudioFile(sourceUrl);

          const frameRate = FrameRateUtil.resolveFrameRate(options?.frameRate);

          if (!frameRate) {
            throw new Error('Frame rate must be provided');
          }

          let video: Video = {
            protocol: 'native',
            sourceUrl: sourceUrl,
            frameRate: frameRate,
            dropFrame: dropFrame,
            duration: duration,
            totalFrames: FrameRateUtil.totalFramesNumber(duration, frameRate),
            frameDuration: FrameRateUtil.frameDuration(frameRate),
            audioOnly: isAudioOnly,
            drm: false,
          };

          nextCompleteObserver(observer, video);
        })
        .add(() => {
          nextCompleteSubject(this._loadVideoBreaker$);
        });

      videoLoadError$.pipe(takeUntil(this._destroyed$), takeUntil(this._loadVideoBreaker$)).subscribe((error) => {
        errorCompleteObserver(observer, error);
      });

      this._videoController.getHTMLVideoElement().src = sourceUrl;
      this._videoController.getHTMLVideoElement().load();

      // assuming no embedded subtitles
      this.onSubtitlesLoaded$.next({
        tracks: [],
        currentTrack: void 0,
      });

      let audioTrack: OmpAudioTrack = {
        id: `${CryptoUtil.uuid()}`,
        src: sourceUrl,
        embedded: true,
        active: true,
        channelCount: void 0,
        language: 'default',
        label: 'default',
      };
      this._audioTracks.set(audioTrack.id, audioTrack);
      this._activeAudioTrack = audioTrack;

      // assuming interleaved audio
      this.onAudioLoaded$.next({
        audioTracks: [...this._audioTracks.values()],
        activeAudioTrack: this._activeAudioTrack,
      });
    });
  }

  override setActiveAudioTrack(ompAudioTrackId: string): Observable<void> {
    return new Observable((observer) => {
      if (!this._audioTracks.has(ompAudioTrackId)) {
        throw new Error('Audio track not found');
      }
      console.debug('Audio track active by default');
      nextCompleteObserver(observer);
    });
  }

  override exportAudioTrack(ompAudioTrackId: string): Observable<OmpAudioTrackCreateType> {
    return new Observable((observer) => {
      if (!this._audioTracks.has(ompAudioTrackId)) {
        throw new Error('Audio track not found');
      } else {
        let audioTrack = this._audioTracks.get(ompAudioTrackId)!;

        AudioUtil.fetchAudioFile(audioTrack.src, AuthConfig.authentication).subscribe({
          next: (audioArrayBuffer) => {
            let audioTrack: OmpAudioTrackCreateType = {
              src: BlobUtil.createBlobURL([audioArrayBuffer]),
              language: 'default',
              label: 'default',
            };
            nextCompleteObserver(observer, audioTrack);
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
      }
    });
  }

  updateActiveNamedEventStreams(eventNames: OmpNamedEventEventName[]): void {}

  override destroy() {
    super.destroy();
  }
}
