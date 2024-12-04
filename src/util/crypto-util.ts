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

import {StringUtil} from './string-util';
import {map, Observable} from 'rxjs';
import {fromPromise} from 'rxjs/internal/observable/innerFrom';

export class CryptoUtil {
  public static uuid(): string {
    return crypto.randomUUID();
  }

  public static digest(text: string): Observable<string> {
    return fromPromise(crypto.subtle.digest('SHA-256', StringUtil.toArrayBuffer(text))).pipe(
      map((hashBuffer) => {
        let hashArray = Array.from(new Uint8Array(hashBuffer));
        let hashHex = hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return hashHex;
      })
    );
  }
}
