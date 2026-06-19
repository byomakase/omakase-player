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

import {type Observable, Subject} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import type {Destroyable} from './capabilities';

export class ObserverBreaker implements Destroyable {
  private _observer = new Subject<void>();

  break() {
    if (!this._observer) {
      throw new Error('Observer has already been destroyed');
    }

    try {
      nextCompleteObserver(this._observer);
    } catch (e) {
      // nop
    }
    this._observer = new Subject<void>();
  }

  error(error: any) {
    errorCompleteObserver(this._observer, error);
  }

  get observer(): Observable<void> {
    return this._observer.asObservable();
  }

  destroy(): void {
    try {
      nextCompleteObserver(this._observer);
    } catch (e) {
      // nop
    }
    // @ts-ignore
    this._observer = void 0;
  }
}
