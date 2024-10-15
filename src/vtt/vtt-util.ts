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

// @ts-ignore
import webvtt from 'node-webvtt';
import {AxiosRequestConfig} from 'axios';
import {forkJoin, from, map, Observable, of, switchMap} from 'rxjs';
import {httpGet} from '../http';
import {BlobUtil} from '../util/blob-util';
import {M3u8File} from '../m3u8/m3u8-file';
import {OmakaseVttCueExtension, OmakaseWebVttExtensionVersion, VttCueExtensionRow} from '../types';
import {StringUtil} from '../util/string-util';
import {VttCueParsed, VttFileParsed} from './index';
import {AuthenticationData} from '../video/model';
import {AuthUtil} from '../util/auth-util';
import {UrlUtil} from '../util/url-util';

const webvttParseOptions = {strict: true, meta: true};

export class VttUtil {

  static parseVtt(vttText: string): VttFileParsed {
    let vttFileParsed: VttFileParsed = webvtt.parse(vttText, webvttParseOptions);

    const noteMatch = vttText.match(/WEBVTT\s*([\s\S]*?)NOTE\s*([\s\S]*?)(?=\n\s*\n)/);
    vttFileParsed.note = noteMatch ? noteMatch[2] : void 0;

    return vttFileParsed;
  }

  static fetchFromM3u8SegmentedConcat(m3u8Url: string, axiosConfig?: AxiosRequestConfig, authentication?: AuthenticationData): Observable<string | undefined> {
    return M3u8File.create(m3u8Url, axiosConfig, authentication).pipe(switchMap(m3u8File => {
      return VttUtil.fetchFromM3u8FileSegmentedConcat(m3u8File, axiosConfig, authentication);
    }))
  }

  static fetchFromM3u8FileSegmentedConcat(m3u8File: M3u8File, axiosConfig?: AxiosRequestConfig, authentication?: AuthenticationData): Observable<string | undefined> {
    if (m3u8File.m3u8Parsed) {
      let vttRootUrl = m3u8File.url.substring(0, m3u8File.url.lastIndexOf('/'));

      let vttUrls = m3u8File.m3u8Parsed.lines
        .filter(p => p.type === 'URI')
        .map(p => UrlUtil.isUrlAbsolute(p.content) ? p.content : `${vttRootUrl}/${p.content}`)

      return VttUtil.fetchSegmentedConcat(vttUrls, axiosConfig, authentication)
    } else {
      return of(void 0);
    }
  }

  static fetchSegmentedConcat(urls: string[], axiosConfig?: AxiosRequestConfig, authentication?: AuthenticationData): Observable<string | undefined> {
    let vttTexts$ = urls.map(url => {
      let authAxiosConfig: AxiosRequestConfig | undefined = undefined;
      if (!axiosConfig && authentication) {
        authAxiosConfig = AuthUtil.getAuthorizedAxiosConfig(url, authentication);
      }
      return from(httpGet<string, AxiosRequestConfig>(url, axiosConfig ?? authAxiosConfig)).pipe(map(result => result.data))
    })
    return forkJoin(vttTexts$).pipe(map(vttTexts => {
      return VttUtil.concatSegmented(vttTexts);
    }))
  }

  static concatSegmented(vttTexts: string[]): string | undefined {
    if (vttTexts && vttTexts.length > 0) {
      if (vttTexts.length === 1) {
        // nothing to concat, just return first one
        return vttTexts[0];
      } else {
        let first: VttFileParsed = webvtt.parse(vttTexts[0], webvttParseOptions);
        vttTexts
          .filter((p, index) => index !== 0)
          .forEach((vttText, index) => {
            let vttFileParsed: VttFileParsed = webvtt.parse(vttText, webvttParseOptions)
            first.cues = first.cues.concat(vttFileParsed.cues)
          })
        return webvtt.compile(first);
      }
    } else {
      return void 0;
    }
  }

  static createWebvttBlob(webvttText: string): string {
    return BlobUtil.createObjectURL(BlobUtil.createBlob([webvttText], 'text/vtt'));
  }

  static parseVttCueExtension(cue: VttCueParsed, extensionVersion: OmakaseWebVttExtensionVersion): OmakaseVttCueExtension | undefined {
    if (StringUtil.isNonEmpty(cue.text)) {
      let textRows = cue.text.split(/\r?\n|\r|\n/g);
      let extensionRows: VttCueExtensionRow[] | undefined = textRows.map(row => {
        let valueRegexArray = row.match(/(?:^|[^:=])([^:=]+)/);
        let measurementRegexArray = row.match(/(?<=:MEASUREMENT=)[^:]+/)
        let commentRegexArray = row.match(/(?<=:COMMENT=)[^:]+/)
        return {
          value: valueRegexArray ? valueRegexArray[0] : void 0,
          measurement: measurementRegexArray ? measurementRegexArray[0] : void 0,
          comment: commentRegexArray ? commentRegexArray[0] : void 0
        }
      })
      return {
        rows: extensionRows
      }
    }
    return void 0;
  }

}
