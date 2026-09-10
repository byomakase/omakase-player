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

import {of, switchMap, takeUntil, type Observable} from 'rxjs';
import type {MainMedia, MainMediaSessionController} from '../../media';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {OmpProvider} from '../../omp-provider';
import type {TamsMainMediaSession, TamsMainMediaSessionState, TamsMainMediaSessionStateUpdate} from '../../tams/tams-main-media-session';

export interface TamsMainMediaSessionMessageChannel {
  onSessionStateUpdated$: Observable<TamsMainMediaSessionStateUpdate>;
  getSessionState(mainMediaId: MainMedia['id']): Observable<TamsMainMediaSessionState | undefined>;
}

function asTamsSession(sessionController: MainMediaSessionController | undefined): TamsMainMediaSession | undefined {
  return sessionController && 'getSessionState' in sessionController ? (sessionController as unknown as TamsMainMediaSession) : void 0;
}

export class TamsMainMediaSessionMessageChannelBinding extends BaseMessageChannelBinding {
  private _messageChannel: MessageChannel<TamsMainMediaSessionMessageChannel>;

  constructor(messageChannel: MessageChannel<TamsMainMediaSessionMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._messageChannel = messageChannel;
  }

  override bind() {
    this._ompProvider.mainMediaSessionManager.onCreated$
      .pipe(
        switchMap((created) => asTamsSession(created.sessionController)?.onSessionStateUpdated$ ?? of()),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((update) => {
        this._messageChannel.send('onSessionStateUpdated$', update);
      });

    this._messageChannel
      .receiveAndSendResponse('getSessionState')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[mainMediaId], sendResponseHook]) => {
          const session = asTamsSession(this._ompProvider.mainMediaSessionManager.get(mainMediaId));
          sendResponseHook(session ? session.getSessionState(mainMediaId) : of(void 0));
        },
      });
  }
}
