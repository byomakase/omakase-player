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
import {ALL_FORMATS, BufferSource, EncodedPacketSink, Input, UrlSource} from 'mediabunny';
import {httpGetArrayBuffer, withByteRange} from '../http';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {AuthConfig} from '../common';
import {StringUtil} from '../util/string-util';
import {Fmp4SampleTimes} from './fmp4-sample-times';

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

/** HLS segment location, byteRange is [start, end) as in EXT-X-BYTERANGE (hls.js Fragment.byteRange), empty for whole resource */
export interface SegmentLocation {
  url: string;
  byteRange?: [number, number] | [] | undefined;
}

export class MediaMetadataResolver {
  static getMediaMetadata<K extends keyof MediaMetadata>(src: string, keys: K[]): Observable<Pick<MediaMetadata, K>> {
    return this.getMediaMetadataWithMediabunny(src, keys);
  }

  /**
   * Presentation time of the first video frame of a fMP4 media segment, read together with its init segment (a bare media
   * segment is not parsable on its own). Lowest video packet timestamp of the segment, in seconds.
   *
   * @returns first video frame time, undefined if there is no video track or packets
   */
  static getFmp4FirstVideoFrameTime(initSegment: SegmentLocation, segment: SegmentLocation): Observable<number | undefined> {
    let fetchSegment = (location: SegmentLocation) => from(httpGetArrayBuffer(location.url, withByteRange(AuthConfig.createRequestInit(location.url, AuthConfig.authentication), location.byteRange)));

    return forkJoin([fetchSegment(initSegment), fetchSegment(segment)]).pipe(
      switchMap(([initSegmentBuffer, segmentBuffer]) => {
        let bytes = new Uint8Array(initSegmentBuffer.byteLength + segmentBuffer.byteLength);
        bytes.set(new Uint8Array(initSegmentBuffer), 0);
        bytes.set(new Uint8Array(segmentBuffer), initSegmentBuffer.byteLength);
        return from(MediaMetadataResolver.getFirstVideoFrameTime(bytes));
      })
    );
  }

  /**
   * Resolves where the first video frame of fMP4 HLS stream lands on media element timeline. hls.js passes fMP4 through without
   * rewriting timestamps (in every version), so it is the first fragment's lowest video presentation time, read from the init segment
   * and first fragment together.
   *
   * Falls back to probing the fragment alone, which only works for self-contained fragments, and to 0 if that fails too.
   *
   * @param firstFragment First fragment of media playlist, with its init segment
   */
  static getHlsFmp4FirstVideoFrameTime(firstFragment: SegmentLocation & {initSegment?: SegmentLocation | null | undefined}): Observable<number | undefined> {
    let probeFragment = () =>
      MediaMetadataResolver.getMediaMetadata(firstFragment.url, ['firstVideoTrackInitSegmentTime']).pipe(
        map((mediaMetadata) => mediaMetadata.firstVideoTrackInitSegmentTime),
        catchError((err) => {
          console.debug(`Could not resolve init segment time offset, setting default`, err);
          return of(0);
        })
      );

    let initSegment = firstFragment.initSegment;
    if (!initSegment || !StringUtil.isNonEmpty(initSegment.url)) {
      return probeFragment();
    }

    return MediaMetadataResolver.getFmp4FirstVideoFrameTime(initSegment, firstFragment).pipe(
      switchMap((firstVideoFrameTime) => (firstVideoFrameTime !== void 0 ? of(firstVideoFrameTime) : probeFragment())),
      catchError((err) => {
        console.debug(`Could not read fMP4 init and first fragment, probing fragment`, err);
        return probeFragment();
      })
    );
  }

  /**
   * First video frame time of fMP4 HLS stream as appended to MSE SourceBuffer - first fragment's lowest video presentation time from its
   * decode time and composition offsets, without edit lists, which browsers ignore for fragmented MP4 in MSE, see {@link Fmp4SampleTimes}.
   * hls.js further shifts it by initPTS. Falls back to {@link getHlsFmp4FirstVideoFrameTime} if it can't be read.
   *
   * @param firstFragment First fragment of media playlist, with its init segment
   */
  static getHlsFmp4MseFirstVideoFrameTime(firstFragment: SegmentLocation & {initSegment?: SegmentLocation | null | undefined}): Observable<number | undefined> {
    let initSegment = firstFragment.initSegment;
    if (!initSegment || !StringUtil.isNonEmpty(initSegment.url)) {
      return MediaMetadataResolver.getHlsFmp4FirstVideoFrameTime(firstFragment);
    }
    let fetchSegment = (location: SegmentLocation) => from(httpGetArrayBuffer(location.url, withByteRange(AuthConfig.createRequestInit(location.url, AuthConfig.authentication), location.byteRange)));
    return forkJoin([fetchSegment(initSegment), fetchSegment(firstFragment)]).pipe(
      map(([initSegmentBuffer, segmentBuffer]) => Fmp4SampleTimes.getFirstVideoFrameTime(new Uint8Array(initSegmentBuffer), new Uint8Array(segmentBuffer))),
      switchMap((firstVideoFrameTime) => (firstVideoFrameTime !== void 0 ? of(firstVideoFrameTime) : MediaMetadataResolver.getHlsFmp4FirstVideoFrameTime(firstFragment))),
      catchError((err) => {
        console.debug(`Could not read fMP4 sample times, falling back to media metadata`, err);
        return MediaMetadataResolver.getHlsFmp4FirstVideoFrameTime(firstFragment);
      })
    );
  }

  /**
   * Lowest video packet timestamp of given media bytes, in seconds. Packets are scanned (metadata only) because first packet in
   * decode order is not necessarily the first presented one.
   */
  static async getFirstVideoFrameTime(bytes: Uint8Array): Promise<number | undefined> {
    let input = new Input({source: new BufferSource(bytes), formats: ALL_FORMATS});
    try {
      let videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        return void 0;
      }
      let firstVideoFrameTime: number | undefined;
      for await (let packet of new EncodedPacketSink(videoTrack).packets(void 0, void 0, {metadataOnly: true})) {
        firstVideoFrameTime = firstVideoFrameTime === void 0 ? packet.timestamp : Math.min(firstVideoFrameTime, packet.timestamp);
      }
      return firstVideoFrameTime;
    } finally {
      input.dispose();
    }
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
