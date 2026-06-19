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

import {type Observable, takeUntil} from 'rxjs';
import {type ChromingSession, type PlayerSession, type SessionEvent, type SessionState, SessionStore} from '../../session';
import type {DeepPartial} from '../../types/ts-types';
import {WindowPlaybackMode} from '../../common';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {PlayerPlayback} from '../../player';
import type {OmpProvider} from '../../omp-provider';

export interface SessionStoreMessageChannel {
  onEvent$: Observable<SessionEvent>;

  setPlayer(player: PlayerSession | undefined): Observable<void>;

  updatePlayer(patch: DeepPartial<PlayerSession>): Observable<void>;

  updatePlayerCurrentTime(currentTime: PlayerPlayback['currentTime']): Observable<void>;

  updateWindowPlaybackMode(next: WindowPlaybackMode, error?: string): Observable<void>;

  updateChroming(patch: DeepPartial<ChromingSession>): Observable<void>;

  /**
   * Intentionally not Observable, we want to exit method as soon as possible
   * @param mode
   */
  requestWindowPlaybackModeChange(mode: WindowPlaybackMode): void;

  state(): Observable<SessionState>;
}

export class SessionStoreMessageChannelBinding extends BaseMessageChannelBinding {
  protected _sessionStore: SessionStore;

  private _messageChannel: MessageChannel<SessionStoreMessageChannel>;

  constructor(messageChannel: MessageChannel<SessionStoreMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._sessionStore = ompProvider.sessionStore;
    this._messageChannel = messageChannel;
  }

  bind() {
    this._sessionStore.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        this._messageChannel.send('onEvent$', event);
      },
    });
    this._messageChannel
      .receiveAndSendResponse('setPlayer')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[player], sendResponseHook]) => {
          this._sessionStore.setPlayer(player);
          sendResponseHook();
        },
      });

    this._messageChannel
      .receiveAndSendResponse('updatePlayer')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[patch], sendResponseHook]) => {
          this._sessionStore.updatePlayer(patch);
          sendResponseHook();
        },
      });

    this._messageChannel
      .receiveAndSendResponse('updatePlayerCurrentTime')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[currentTime], sendResponseHook]) => {
          this._sessionStore.updatePlayerCurrentTime(currentTime);
          sendResponseHook();
        },
      });

    this._messageChannel
      .receiveAndSendResponse('updateWindowPlaybackMode')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[next, error], sendResponseHook]) => {
          this._sessionStore.updateWindowPlaybackMode(next, error);
          sendResponseHook();
        },
      });

    this._messageChannel
      .receiveAndSendResponse('updateChroming')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[patch], sendResponseHook]) => {
          this._sessionStore.updateChroming(patch);
          sendResponseHook();
        },
      });

    this._messageChannel
      .receive('requestWindowPlaybackModeChange')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([mode]) => {
          this._sessionStore.requestWindowPlaybackModeChange(mode);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._sessionStore.state);
        },
      });
  }
}
