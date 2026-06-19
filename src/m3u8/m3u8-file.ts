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

import {from, map, Observable} from 'rxjs';
import type {Manifest} from './m3u8.model';
import {AuthConfig, type AuthenticationData} from '../common/authentication';
import {M3u8Parser} from './m3u8-parser';
import {httpGetText} from '../http';

export abstract class BaseM3u8File {
  private readonly _url: string;
  private _requestInit?: RequestInit | undefined;
  private _manifest?: Manifest;

  protected constructor(url: string, requestInit?: RequestInit) {
    this._url = url;
    this._requestInit = requestInit;
  }

  fetch(): Observable<boolean> {
    return from(httpGetText(this._url, this._requestInit)).pipe(
      map((m3u8FileText) => {
        try {
          this._manifest = M3u8Parser.parse(m3u8FileText);
          return true;
        } catch (e) {
          console.error(e);
          return false;
        }
      })
    );
  }

  get manifest(): Manifest | undefined {
    return this._manifest;
  }

  get url(): string {
    return this._url;
  }
}

export class M3u8File extends BaseM3u8File {
  static create(url: string, authentication?: AuthenticationData): Observable<M3u8File> {
    const instance = new M3u8File(url, AuthConfig.createRequestInit(url, authentication));
    return instance.fetch().pipe(map(() => instance));
  }
}
