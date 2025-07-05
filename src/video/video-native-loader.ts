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

import {combineLatest, first, fromEvent, Observable, Subject, take, takeUntil} from 'rxjs';
import {Video, VideoLoadOptions} from './model';
import {BaseVideoLoader} from './video-loader';
import {errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {z} from 'zod';
import {VideoControllerApi} from './video-controller-api';
import {FrameRateUtil} from '../util/frame-rate-util';
import {OmpAudioTrack, OmpAudioTrackCreateType, OmpNamedEventEventName} from '../types';
import {FileUtil} from '../util/file-util';
import {CryptoUtil} from '../util/crypto-util';
import {AudioUtil} from '../util/audio-util';
import {AuthConfig} from '../auth/auth-config';
import {BlobUtil} from '../util/blob-util';
import {MediaInfoUtil} from '../mediainfo';
import {AudioTrack, MediaInfoResult} from 'mediainfo.js';
import {HTMLVideoElementEvents} from '../dom/html-element';

export class VideoNativeLoader extends BaseVideoLoader {
  private static audioLabelDefault = 'Default';

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

      let videoLoadedData$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEvents.LOADEDDATA).pipe(first());
      let videoLoadedMetadata$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEvents.LOADEDMETEDATA).pipe(first());
      let videoLoadError$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEvents.ERROR).pipe(take(1));
      let mediaInfo$ = new Subject<MediaInfoResult>();

      let videoLoad$ = combineLatest([videoLoadedData$, videoLoadedMetadata$, mediaInfo$]).pipe(takeUntil(this._destroyed$)).pipe(take(1));

      let audioLoad$ = combineLatest([videoLoad$, mediaInfo$]).pipe(takeUntil(this._destroyed$)).pipe(take(1));

      let subtitlesLoad$ = combineLatest([videoLoad$]).pipe(takeUntil(this._destroyed$)).pipe(take(1));

      videoLoad$
        .subscribe(([videoLoadedData, videoLoadedMetadata, mediaInfoResult]) => {
          let duration: number;
          if (options && options.duration !== void 0) {
            duration = z.coerce.number().parse(options.duration);
            duration = duration ? duration : this._videoController.getHTMLVideoElement().duration;
          } else {
            duration = this._videoController.getHTMLVideoElement().duration;
          }

          let isAudioOnly = FileUtil.isAudioFile(sourceUrl);

          const frameRate = options?.frameRate ? FrameRateUtil.resolveFrameRate(options.frameRate) : FrameRateUtil.resolveFrameRate(MediaInfoUtil.findFrameRate(mediaInfoResult));
          if (!frameRate) {
            throw new Error('Frame rate could not be determined');
          }

          let dropFrame = options && options.dropFrame !== void 0 ? options.dropFrame : FrameRateUtil.resolveDropFrameFromFramerate(frameRate);

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

      audioLoad$.subscribe(([videoLoadResult, mediaInfoResult]) => {
        let channelCount = (mediaInfoResult.media?.track.find((p) => p['@type'] === 'Audio') as AudioTrack | undefined)?.Channels;

        let audioTrack: OmpAudioTrack = {
          id: `${CryptoUtil.uuid()}`,
          src: sourceUrl,
          embedded: true,
          active: true,
          language: VideoNativeLoader.audioLabelDefault,
          label: VideoNativeLoader.audioLabelDefault,
          channelCount: channelCount,
        };

        this._audioTracks.set(audioTrack.id, audioTrack);
        this._activeAudioTrack = audioTrack;

        // assuming interleaved audio
        this.onAudioLoaded$.next({
          audioTracks: [...this._audioTracks.values()],
          activeAudioTrack: this._activeAudioTrack,
        });
      });

      audioLoad$.subscribe(([videoLoadResult]) => {
        // assuming no embedded subtitles
        this.onSubtitlesLoaded$.next({
          tracks: [],
          currentTrack: void 0,
        });
      });

      // fetch media info
      MediaInfoUtil.analyze(sourceUrl).subscribe({
        next: (mediaInfoResult) => {
          nextCompleteSubject(mediaInfo$, mediaInfoResult);
        },
      });

      this._videoController.getHTMLVideoElement().src = sourceUrl;
      this._videoController.getHTMLVideoElement().load();
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
              language: VideoNativeLoader.audioLabelDefault,
              label: VideoNativeLoader.audioLabelDefault,
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
