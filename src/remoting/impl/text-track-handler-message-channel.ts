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
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {TextTrackHandlerApi, TextTrackHandlerEvent, TextTrackHandlerState} from '../../text';
import type {MainMedia} from '../../media';
import type {OmpProvider} from '../../omp-provider';

export class TextTrackHandlerMessageChannelUtil {
  static formatMessageChannelTopic(mainMediaId: MainMedia['id'], id: TextTrack['id']) {
    return `player.text.getHandler(${mainMediaId}, ${id})`;
  }
}

export interface TextTrackHandlerMessageChannel {
  onEvent$: Observable<TextTrackHandlerEvent>;

  setEnabled(enabled: boolean): Observable<void>;

  state(): Observable<TextTrackHandlerState>;

  switch(active: boolean): Observable<void>;

  show(): Observable<void>;

  hide(): Observable<void>;

  toggleShowHide(): Observable<void>;
}

export class TextTrackHandlerMessageChannelBinding extends BaseMessageChannelBinding {
  private _textTrackHandler: TextTrackHandlerApi;
  private _messageChannel: MessageChannel<TextTrackHandlerMessageChannel>;

  constructor(messageChannel: MessageChannel<TextTrackHandlerMessageChannel>, textTrackHandler: TextTrackHandlerApi, ompProvider: OmpProvider) {
    super(ompProvider);
    this._messageChannel = messageChannel;
    this._textTrackHandler = textTrackHandler;
  }

  bind() {
    this._textTrackHandler.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onEvent$', event);
    });

    this._messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._textTrackHandler.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('hide')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._textTrackHandler.hide());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('show')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._textTrackHandler.show());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('switch')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[active], sendResponseHook]) => {
          sendResponseHook(this._textTrackHandler.switch(active));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('toggleShowHide')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._textTrackHandler.toggleShowHide());
        },
      });
  }
}
