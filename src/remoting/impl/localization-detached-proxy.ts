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
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import type {LocalizationDetachedApi, LocalizationKey, Localizations} from '../../localization';
import {DEFAULT_LOCALIZATION} from '../../localization';
import type {LocalizationDetachedMessageChannel} from './localization-detached-message-channel';
import {SessionStore} from '../../session';
import type {RemoteNode} from '../remote-node';
import type {OmpProvider} from '../../omp-provider';

export class LocalizationDetachedProxy extends BaseMessageChannelProxy<LocalizationDetachedMessageChannel> implements LocalizationDetachedApi {
  protected _sessionStore: SessionStore;

  constructor(remoteNode: RemoteNode, ompProvider: OmpProvider) {
    super(remoteNode.getRemoteChannelOrFail('LocalizationDetached'));
    this._sessionStore = ompProvider.sessionStore;
    this._onInitialized$.next(true);
  }

  get(key: LocalizationKey): string {
    return this._sessionStore.state.localization?.[key] ?? DEFAULT_LOCALIZATION[key];
  }

  restoreLocalization(overrides: Localizations | undefined): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('restoreLocalization', [overrides]);
  }
}
