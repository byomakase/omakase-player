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

import type {LocalizationDetachedApi} from '../../localization';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import {takeUntil} from 'rxjs';
import type {OmpProvider} from '../../omp-provider';

export interface LocalizationDetachedMessageChannel extends LocalizationDetachedApi {}

export class LocalizationDetachedMessageChannelBinding extends BaseMessageChannelBinding {
  private _localizationDetachedMessageChannel: MessageChannel<LocalizationDetachedMessageChannel>;
  private _localizationDetached: LocalizationDetachedApi;

  constructor(messageChannel: MessageChannel<LocalizationDetachedMessageChannel>, localizationDetached: LocalizationDetachedApi, ompProvider: OmpProvider) {
    super(ompProvider);
    this._localizationDetachedMessageChannel = messageChannel;
    this._localizationDetached = localizationDetached;
  }

  bind() {
    this._localizationDetachedMessageChannel
      .receiveAndSendResponse('restoreLocalization')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[overrides], sendResponseHook]) => {
          sendResponseHook(this._localizationDetached.restoreLocalization(overrides));
        },
      });
  }
}
