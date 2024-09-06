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

import {AxiosRequestConfig} from 'axios';
import {from, map, Observable} from 'rxjs';
import {httpGet} from '../http';
import {M3u8Parser} from './m3u8-parser';
import HLS from 'parse-hls';

export abstract class BaseM3u8File {
  private _url: string;
  private _axiosConfig?: AxiosRequestConfig;
  private _m3u8Parsed?: HLS;

  protected constructor(url: string, axiosConfig?: AxiosRequestConfig) {
    this._url = url;
    this._axiosConfig = axiosConfig;
  }

  fetch(): Observable<boolean> {
    return from(httpGet<string, AxiosRequestConfig>(this._url, this._axiosConfig)).pipe(map(result => {
      let m3u8FileText = result.data;

      try {
        this._m3u8Parsed = M3u8Parser.parse(m3u8FileText)
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    }))
  }

  get m3u8Parsed(): HLS | undefined {
    return this._m3u8Parsed;
  }

  get url(): string {
    return this._url;
  }
}

export class M3u8File extends BaseM3u8File {

  static create(url: string, axiosConfig?: AxiosRequestConfig): Observable<M3u8File> {
    let instance = new M3u8File(url, axiosConfig);
    return instance.fetch().pipe(map(result => {
      return instance;
    }))
  }

}
