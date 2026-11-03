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

import {Observable, takeUntil} from 'rxjs';
import type {PlayerDetachedApi, PlayerVideoEvent, PlayerVideoState} from '../../player';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {TrackState} from '../../media';
import type {OmpProvider} from '../../omp-provider';

export interface PlayerVideoInternalMessageChannel {
  onEvent$: Observable<PlayerVideoEvent>;

  switchTrack(trackId: TrackState['id'], activate?: boolean): Observable<void>;

  state(): Observable<PlayerVideoState>;
}

export class PlayerVideoInternalMessageChannelBinding extends BaseMessageChannelBinding {
  private _playerDetached: PlayerDetachedApi;
  private _messageChannel: MessageChannel<PlayerVideoInternalMessageChannel>;

  constructor(messageChannel: MessageChannel<PlayerVideoInternalMessageChannel>, playerDetached: PlayerDetachedApi, ompProvider: OmpProvider) {
    super(ompProvider);
    this._messageChannel = messageChannel;
    this._playerDetached = playerDetached;
  }

  bind() {
    this._playerDetached.videoInternal.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        this._messageChannel.send('onEvent$', event);
      },
    });

    this._messageChannel
      .receiveAndSendResponse('switchTrack')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackId, activate], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.videoInternal.switchTrack(trackId, activate));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.videoInternal.state);
        },
      });
  }
}
