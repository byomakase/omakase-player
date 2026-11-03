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

import type {Observable} from 'rxjs';
import {DEFAULT_LOCALIZATION, type LocalizationConfig, type LocalizationDetachedApi, type LocalizationKey, type Localizations} from './localization-api';
import {LocalizationInternalUtil} from './localization-internal-util';
import {nextCompleteObserver, passiveObservable} from '../util/rxjs-util';

export class LocalizationDetached implements LocalizationDetachedApi {
  private _overrides: Localizations | undefined;

  constructor(config: LocalizationConfig) {
    this._overrides = LocalizationInternalUtil.sanitizeLocalization(config.localizations);
  }

  get(key: LocalizationKey): string {
    return this._overrides?.[key] ?? DEFAULT_LOCALIZATION[key];
  }

  restoreLocalization(overrides: Localizations | undefined): Observable<void> {
    return passiveObservable((observer) => {
      this._overrides = LocalizationInternalUtil.sanitizeLocalization(overrides);
      nextCompleteObserver(observer);
    });
  }

  destroy(): void {}
}
