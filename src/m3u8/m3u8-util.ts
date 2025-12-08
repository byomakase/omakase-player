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

// @ts-ignore
import webvtt from 'node-webvtt';
import {forkJoin, from, map, Observable, of, switchMap} from 'rxjs';
import {M3u8File} from './m3u8-file';
import {UrlUtil} from '../util/url-util';
import {httpGet} from '../http';
import {VttFileParsed} from '../vtt';
import {AuthConfig, AuthenticationData} from '../common/authentication';
import {OmpError} from '../types';

const webvttParseOptions = {strict: false, meta: true};

export class M3u8Util {
  static fetchVttSegmentedConcat(m3u8Url: string, authentication?: AuthenticationData): Observable<string | undefined> {
    return M3u8File.create(m3u8Url, authentication).pipe(
      switchMap((m3u8File) => {
        return this.fetchFromM3u8FileVttSegmentedConcat(m3u8File, authentication);
      })
    );
  }

  static fetchFromM3u8FileVttSegmentedConcat(m3u8File: M3u8File, authentication?: AuthenticationData): Observable<string | undefined> {
    if (m3u8File.manifest) {
      let vttRootUrl = m3u8File.url.substring(0, m3u8File.url.lastIndexOf('/'));

      let vttUrls = m3u8File.manifest.segments.filter((p) => !!p.uri).map((p) => UrlUtil.absolutizeUrl(vttRootUrl, p.uri));

      return this.fetchSegmentedConcat(vttUrls, authentication);
    } else {
      return of(void 0);
    }
  }

  static fetchSegmentedConcat(urls: string[], authentication?: AuthenticationData): Observable<string | undefined> {
    let vttTexts$ = urls.map((url) => {
      return from(httpGet<string>(url, AuthConfig.createAxiosRequestConfig(url, authentication))).pipe(map((result) => result.data));
    });
    return forkJoin(vttTexts$).pipe(
      map((vttTexts) => {
        return this.concatSegmented(vttTexts);
      })
    );
  }

  static concatSegmented(vttTexts: string[]): string | undefined {
    if (vttTexts && vttTexts.length > 0) {
      if (vttTexts.length === 1) {
        // nothing to concat, just return first one
        return vttTexts[0];
      } else {
        let first: VttFileParsed = webvtt.parse(vttTexts[0], webvttParseOptions);
        if (first.errors.length) {
          console.error(`Errors found while parsing vtt file: ${first.errors}`);
        }
        vttTexts
          .filter((p, index) => index !== 0)
          .forEach((vttText, index) => {
            let vttFileParsed: VttFileParsed = webvtt.parse(vttText, webvttParseOptions);
            if (vttFileParsed.errors.length) {
              throw new OmpError(`Errors found while parsing vtt file: ${vttFileParsed.errors}`);
            }
            first.cues = first.cues.concat(vttFileParsed.cues);
          });
        return webvtt.compile(first);
      }
    } else {
      return void 0;
    }
  }
}
