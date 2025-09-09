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

import {forkJoin, from, map, Observable, of, switchMap, tap} from 'rxjs';
import {ALL_FORMATS, Input, UrlSource} from 'mediabunny';
import {formatAuthenticationHeaders} from '../http';
import {FrameRateUtil} from '../util/frame-rate-util';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';

export interface MediaMetadata {
  firstVideoTrackFrameRate?: number | undefined;
  firstVideoTrackInitSegmentTime?: number | undefined;
  firstAudioTrackChannelsNumber?: number | undefined;
}

export class MediaMetadataResolver {
  static getMediaMetadata<K extends keyof MediaMetadata>(src: string, keys: K[]): Observable<Pick<MediaMetadata, K>> {
    return this.getMediaMetadataWithMediabunny(src, keys);
  }

  private static getMediaMetadataWithMediabunny<K extends keyof MediaMetadata>(src: string, keys: K[]): Observable<Pick<MediaMetadata, K>> {
    let input = new Input({
      source: new UrlSource(src, {
        requestInit: {
          headers: formatAuthenticationHeaders(src),
        },
      }),
      formats: ALL_FORMATS,
    });

    let mediaMetadataResult: MediaMetadata = {
      firstVideoTrackFrameRate: void 0,
      firstVideoTrackInitSegmentTime: void 0,
      firstAudioTrackChannelsNumber: void 0,
    };

    return new Observable<Pick<MediaMetadata, K>>((observer) => {
      let os$: Observable<any>[] = [];

      let addObservable = (observable: Observable<any>) => {
        os$.push(observable);
      };

      if (keys.find((p) => p === 'firstVideoTrackInitSegmentTime')) {
        addObservable(
          from(input.getVideoTracks())
            .pipe(
              switchMap((videoTracks) => {
                if (videoTracks && videoTracks.length > 0) {
                  let firstVideoTrack = videoTracks[0];
                  return from(firstVideoTrack.getFirstTimestamp());
                } else {
                  return of(void 0);
                }
              })
            )
            .pipe(
              tap((initSegmentTime) => {
                mediaMetadataResult.firstVideoTrackInitSegmentTime = initSegmentTime;
              })
            )
        );
      }

      if (keys.find((p) => p === 'firstVideoTrackFrameRate')) {
        addObservable(
          from(input.getVideoTracks())
            .pipe(
              switchMap((videoTracks) => {
                if (videoTracks && videoTracks.length > 0) {
                  let firstVideoTrack = videoTracks[0];
                  return from(firstVideoTrack.computePacketStats()).pipe(
                    map((packetStats) => {
                      let frameRate = FrameRateUtil.resolveFrameRate(packetStats.averagePacketRate);
                      return frameRate;
                    })
                  );
                } else {
                  return of(void 0);
                }
              })
            )
            .pipe(
              tap((frameRate) => {
                mediaMetadataResult.firstVideoTrackFrameRate = frameRate;
              })
            )
        );
      }

      if (keys.find((p) => p === 'firstAudioTrackChannelsNumber')) {
        addObservable(
          from(input.getAudioTracks())
            .pipe(
              map((audioTracks) => {
                if (audioTracks && audioTracks.length > 0) {
                  return audioTracks[0].numberOfChannels;
                } else {
                  return void 0;
                }
              })
            )
            .pipe(
              tap((channelsNumber) => {
                mediaMetadataResult.firstAudioTrackChannelsNumber = channelsNumber;
              })
            )
        );
      }

      if (os$.length > 0) {
        forkJoin(os$).subscribe({
          next: (event) => {
            nextCompleteObserver(observer, mediaMetadataResult);
          },
          error: (error) => {
            console.debug(`Error parsing file with mediabunny: `, error);
            errorCompleteObserver(observer, error);
          },
        });
      } else {
        console.debug(`No params to resolve`);
        nextCompleteObserver(observer, mediaMetadataResult);
      }
    });
  }
}
