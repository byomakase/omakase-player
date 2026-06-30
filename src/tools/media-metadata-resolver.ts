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

import {catchError, forkJoin, from, map, Observable, of, switchMap, tap} from 'rxjs';
import {ALL_FORMATS, Input, UrlSource} from 'mediabunny';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {AuthConfig} from '../common';
import {StringUtil} from '../util/string-util';

export interface MediaMetadata {
  mimeType?: string | undefined;
  videoTracks?:
    | {
        id: number;
      }[]
    | undefined;
  audioTracks?:
    | {
        id: number;
      }[]
    | undefined;
  firstVideoTrackFrameRate?: number | undefined;
  firstVideoTrackInitSegmentTime?: number | undefined;
  firstAudioTrackChannelsNumber?: number | undefined;
  firstAudioTrackAudioCodec?: string | undefined;
}

export class MediaMetadataResolver {
  static getMediaMetadata<K extends keyof MediaMetadata>(src: string, keys: K[]): Observable<Pick<MediaMetadata, K>> {
    return this.getMediaMetadataWithMediabunny(src, keys);
  }

  private static getMediaMetadataWithMediabunny<K extends keyof MediaMetadata>(src: string, keys: K[]): Observable<Pick<MediaMetadata, K>> {
    let input = new Input({
      source: new UrlSource(src, {
        requestInit: AuthConfig.createRequestInit(src, AuthConfig.authentication),
      }),
      formats: ALL_FORMATS,
    });

    let mediaMetadataResult: MediaMetadata = {
      mimeType: void 0,
      videoTracks: void 0,
      audioTracks: void 0,
      firstVideoTrackFrameRate: void 0,
      firstVideoTrackInitSegmentTime: void 0,
      firstAudioTrackChannelsNumber: void 0,
      firstAudioTrackAudioCodec: void 0,
    };

    return new Observable<Pick<MediaMetadata, K>>((observer) => {
      let os$: Observable<any>[] = [];

      let addObservable = (observable: Observable<any>) => {
        os$.push(observable);
      };

      if (keys.find((p) => p === 'mimeType')) {
        addObservable(
          from(input.getMimeType())
            .pipe(
              map((mimeType) => {
                return StringUtil.isNonEmpty(mimeType) ? mimeType : void 0;
              })
            )
            .pipe(
              tap((mimeType) => {
                mediaMetadataResult.mimeType = mimeType;
              })
            )
            .pipe(
              catchError((err) => {
                return of(undefined);
              })
            )
        );
      }

      if (keys.find((p) => p === 'videoTracks')) {
        addObservable(
          from(input.getVideoTracks())
            .pipe(
              map((tracks) => {
                return tracks ? tracks.map((videoTrack) => ({id: videoTrack.id})) : void 0;
              })
            )
            .pipe(
              tap((tracks) => {
                mediaMetadataResult.videoTracks = tracks;
              })
            )
            .pipe(
              catchError((err) => {
                return of(undefined);
              })
            )
        );
      }

      if (keys.find((p) => p === 'audioTracks')) {
        addObservable(
          from(input.getAudioTracks())
            .pipe(
              map((tracks) => {
                return tracks ? tracks.map((videoTrack) => ({id: videoTrack.id})) : void 0;
              })
            )
            .pipe(
              tap((tracks) => {
                mediaMetadataResult.audioTracks = tracks;
              })
            )
            .pipe(
              catchError((err) => {
                return of(undefined);
              })
            )
        );
      }

      if (keys.find((p) => p === 'firstVideoTrackInitSegmentTime')) {
        addObservable(
          from(input.getVideoTracks())
            .pipe(
              switchMap((videoTracks) => {
                if (videoTracks && videoTracks[0]) {
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
            .pipe(
              catchError((err) => {
                return of(undefined);
              })
            )
        );
      }

      if (keys.find((p) => p === 'firstVideoTrackFrameRate')) {
        addObservable(
          from(input.getVideoTracks())
            .pipe(
              switchMap((videoTracks) => {
                if (videoTracks && videoTracks[0]) {
                  let firstVideoTrack = videoTracks[0];
                  return from(firstVideoTrack.computePacketStats()).pipe(map((packetStats) => packetStats.averagePacketRate));
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
            .pipe(
              catchError((err) => {
                // console.debug('Error getting first video track frame rate:', err);
                return of(undefined);
              })
            )
        );
      }

      if (keys.find((p) => p === 'firstAudioTrackChannelsNumber')) {
        addObservable(
          from(input.getAudioTracks())
            .pipe(
              map((audioTracks) => {
                if (audioTracks && audioTracks[0]) {
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
            .pipe(
              catchError((err) => {
                // console.debug('Error getting first audio track channels number:', err);
                return of(undefined);
              })
            )
        );
      }

      if (keys.find((p) => p === 'firstAudioTrackAudioCodec')) {
        addObservable(
          from(input.getAudioTracks())
            .pipe(
              map((audioTracks) => {
                if (audioTracks && audioTracks[0]) {
                  return audioTracks[0].codec;
                } else {
                  return void 0;
                }
              })
            )
            .pipe(
              tap((audioCodec) => {
                if (audioCodec) {
                  mediaMetadataResult.firstAudioTrackAudioCodec = audioCodec;
                }
              })
            )
            .pipe(
              catchError((err) => {
                // console.debug('Error getting first audio track codec:', err);
                return of(undefined);
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
