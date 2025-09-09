/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

import {BaseVideoLoader} from './video-loader';
import {OmpAudioTrack, OmpAudioTrackCreateType, OmpNamedEventEventName} from '../types';
import {VideoControllerApi} from './video-controller-api';
import {Video, VideoLoadOptions} from './model';
import {combineLatest, first, fromEvent, Observable, Subject, take, takeUntil} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {z} from 'zod';
import {FrameRateUtil} from '../util/frame-rate-util';
import {CryptoUtil} from '../util/crypto-util';
import {AudioUtil} from '../util/audio-util';
import {BlobUtil} from '../util/blob-util';
import {HTMLVideoElementEvents} from '../media-element/omp-media-element';
import {AuthConfig} from '../common/authentication';
import {MediaMetadata, MediaMetadataResolver} from '../tools/media-metadata-resolver';
import {audioChannelsDefault} from '../constants';

export class VideoAudioLoader extends BaseVideoLoader {
  private static audioLabelDefault = 'Default';

  protected _audioTracks: Map<string, OmpAudioTrack> = new Map<string, OmpAudioTrack>();
  protected _activeAudioTrack: OmpAudioTrack | undefined;

  constructor(videoController: VideoControllerApi) {
    super(videoController);
    // console.debug('video load with audio');
  }

  override loadVideo(sourceUrl: string, options?: VideoLoadOptions | undefined): Observable<Video> {
    nextCompleteSubject(this._loadVideoBreaker$);
    this._loadVideoBreaker$ = new Subject<void>();

    return passiveObservable<Video>((observer) => {
      let videoElement = this._videoController.getHTMLVideoElement();

      videoElement.src = '';
      videoElement.load();

      let videoLoadedData$ = fromEvent(videoElement, HTMLVideoElementEvents.LOADEDDATA).pipe(first());
      let videoLoadedMetadata$ = fromEvent(videoElement, HTMLVideoElementEvents.LOADEDMETEDATA).pipe(first());
      let videoLoadError$ = fromEvent(videoElement, HTMLVideoElementEvents.ERROR).pipe(take(1));

      let mediaMetadata$ = new Subject<Pick<MediaMetadata, 'firstAudioTrackChannelsNumber'>>();

      let videoLoad$ = new Subject();

      let audioLoad$ = new Subject<{
        channels: number;
      }>();

      combineLatest([videoLoadedData$, videoLoadedMetadata$])
        .pipe(takeUntil(this._destroyed$))
        .pipe(take(1))
        .subscribe({
          next: ([videoLoadedData, videoLoadedMetadata]) => {
            nextCompleteSubject(videoLoad$);
          },
        });

      combineLatest([videoLoad$, mediaMetadata$])
        .pipe(takeUntil(this._destroyed$))
        .pipe(take(1))
        .subscribe({
          next: ([videoLoadResult, mediaMetadata]) => {
            if (!mediaMetadata.firstAudioTrackChannelsNumber) {
              console.debug(`Could not resolve channels, setting default.`, audioChannelsDefault);
            }

            nextCompleteSubject(audioLoad$, {
              channels: mediaMetadata.firstAudioTrackChannelsNumber ? mediaMetadata.firstAudioTrackChannelsNumber : audioChannelsDefault,
            });
          },
        });

      MediaMetadataResolver.getMediaMetadata(sourceUrl, ['firstAudioTrackChannelsNumber']).subscribe({
        next: (mediaMetadata: MediaMetadata) => {
          console.debug(`Media metadata`, mediaMetadata);
          nextCompleteSubject(mediaMetadata$, mediaMetadata);
        },
      });

      videoLoad$
        .subscribe((event) => {
          let duration: number;
          if (options && options.duration !== void 0) {
            duration = z.coerce.number().parse(options.duration);
            duration = duration ? duration : videoElement.duration;
          } else {
            duration = videoElement.duration;
          }

          let frameRate = FrameRateUtil.AUDIO_FRAME_RATE;

          let video: Video = {
            protocol: 'audio',
            sourceUrl: sourceUrl,
            frameRate: frameRate,
            dropFrame: false,
            duration: duration,
            totalFrames: FrameRateUtil.totalFramesNumber(duration, frameRate),
            frameDuration: FrameRateUtil.frameDuration(frameRate),
            audioOnly: true,
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

      audioLoad$.subscribe((audioLoadResult) => {
        let audioTrack: OmpAudioTrack = {
          id: `${CryptoUtil.uuid()}`,
          src: sourceUrl,
          embedded: true,
          active: true,
          language: VideoAudioLoader.audioLabelDefault,
          label: VideoAudioLoader.audioLabelDefault,
          channelCount: audioLoadResult.channels,
        };

        this._audioTracks.set(audioTrack.id, audioTrack);
        this._activeAudioTrack = audioTrack;

        // assuming interleaved audio
        this.onAudioLoaded$.next({
          audioTracks: [...this._audioTracks.values()],
          activeAudioTrack: this._activeAudioTrack,
        });
      });

      audioLoad$.subscribe(() => {
        // assuming no embedded subtitles
        this.onSubtitlesLoaded$.next({
          tracks: [],
          currentTrack: void 0,
        });
      });

      videoElement.src = sourceUrl;
      videoElement.load();
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
              language: VideoAudioLoader.audioLabelDefault,
              label: VideoAudioLoader.audioLabelDefault,
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
