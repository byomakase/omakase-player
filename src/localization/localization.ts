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
import type {Destroyable} from '../common/capabilities';
import {
  type LocalizationApi,
  type LocalizationConfig,
  type LocalizationDetachedApi,
  type LocalizationInternalApi,
  type LocalizationKey,
  type LocalizationLocalApi,
  type Localizations,
} from './localization-api';
import {LocalizationLocal} from './localization-local';
import type {SessionStore} from '../session';
import {WindowPlaybackMode} from '../common';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import type {OmpProvider} from '../omp-provider';

export class Localization implements LocalizationApi, Destroyable {
  protected _sessionStore: SessionStore;

  private _localizationLocal: LocalizationLocalApi;
  private _localizationDetached?: LocalizationDetachedApi | undefined;

  constructor(ompProvider: OmpProvider, config: LocalizationConfig) {
    this._sessionStore = ompProvider.sessionStore;
    this._localizationLocal = new LocalizationLocal(ompProvider, config);
  }

  wireDetached(localizationDetached: LocalizationDetachedApi) {
    this._localizationDetached = localizationDetached;
  }

  protected isAttached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED;
  }

  protected isAttaching(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.ATTACHING;
  }

  protected isDetaching(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.DETACHING;
  }

  protected isDetached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
  }

  get localizationLocal(): LocalizationLocalApi {
    return this._localizationLocal;
  }

  get localizationDetached(): LocalizationDetachedApi | undefined {
    return this._localizationDetached;
  }

  protected getLocalizationInternalOrFail(): LocalizationInternalApi {
    if (this.isAttached()) {
      return this._localizationLocal;
    } else if (this.isDetached()) {
      return this._localizationDetached!;
    } else {
      throw new Error(`Localization is in unstable window playback mode: ${this._sessionStore.state.windowPlayback.mode}`);
    }
  }

  get(key: LocalizationKey): string {
    return this.getLocalizationInternalOrFail().get(key);
  }

  restoreLocalization(overrides: Localizations | undefined): Observable<void> {
    return passiveObservable((observer) => {
      let localizationInternal = this.isAttaching() ? this._localizationLocal : this.isDetaching() ? this._localizationDetached : void 0;

      if (!localizationInternal) {
        throw new Error(`Localization is not in correct window playback mode: ${this._sessionStore.state.windowPlayback.mode}`);
      }

      localizationInternal.restoreLocalization(overrides).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  destroy(): void {
    this._localizationLocal.destroy();
  }
}
