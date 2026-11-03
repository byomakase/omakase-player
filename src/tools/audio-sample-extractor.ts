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

import {from, map, merge, Observable, switchMap} from 'rxjs';
import {ALL_FORMATS, AudioSample, AudioSampleSink, Input, UrlSource} from 'mediabunny';
import {AuthConfig} from '../common';
import {errorCompleteObserver} from '../util/rxjs-util';

export interface AudioTrackSample {
  trackIndex: number;
  sample: AudioSample;
}

export class AudioSampleExtractor {
  static extractSamples(src: string): Observable<AudioTrackSample> {
    return new Observable<AudioTrackSample>((observer) => {
      const input = new Input({
        source: new UrlSource(src, {
          requestInit: AuthConfig.createRequestInit(src, AuthConfig.authentication),
        }),
        formats: ALL_FORMATS,
      });

      const subscription = from(input.getAudioTracks())
        .pipe(
          switchMap((audioTracks) =>
            merge(
              ...audioTracks.map((audioTrack, trackIndex) =>
                from(new AudioSampleSink(audioTrack).samples()).pipe(
                  map((sample) => ({
                    trackIndex,
                    sample,
                  }))
                )
              )
            )
          )
        )
        .subscribe({
          next: (item) => {
            try {
              observer.next(item);
            } finally {
              item.sample.close();
            }
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
          complete: () => {
            observer.complete();
          },
        });

      return () => {
        subscription.unsubscribe();
        input.dispose();
      };
    });
  }

  static extractChannelLevels(sample: AudioSample, channel: number): Float32Array {
    let divisor = this.resolveDivisor(sample.format, sample.numberOfChannels);

    const buf = new Float32Array(sample.allocationSize({planeIndex: 0, format: sample.format}) / divisor);
    sample.copyTo(buf, {planeIndex: channel, format: 'f32-planar'});

    return buf;
  }

  static resolveDivisor(format: AudioSampleFormat, noOfChannels: number): number {
    switch (format) {
      case 'f32':
      case 's32':
        return 4 * noOfChannels;
      case 'f32-planar':
      case 's32-planar':
        return 4;
      case 's16':
        return 2 * noOfChannels;
      case 's16-planar':
        return 2;
      case 'u8':
        return noOfChannels;
      case 'u8-planar':
        return 1;
    }
  }
}
