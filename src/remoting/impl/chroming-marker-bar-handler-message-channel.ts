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
import type {ChromingMarkerBarHandlerApi, ChromingMarkerBarEvent, ChromingMarkerBarState} from '../../chroming/chroming-marker-bar';
import type {OmpProvider} from '../../omp-provider';

export class ChromingMarkerBarHandlerMessageChannelUtil {
  static formatMessageChannelTopic(id: string) {
    return `player.chroming.getMarkerBar('${id}')`;
  }
}

export interface ChromingMarkerBarHandlerMessageChannel {
  onEvent$: Observable<ChromingMarkerBarEvent>;

  state(): Observable<ChromingMarkerBarState>;

  setVisibility(visible: boolean): Observable<void>;
  addTrack(trackId: string): Observable<void>;
  removeTrack(trackId: string): Observable<void>;
}

export class ChromingMarkerBarHandlerMessageChannelBinding extends BaseMessageChannelBinding {
  private _chromingMarkerTrackHandler: ChromingMarkerBarHandlerApi;
  private _messageChannel: MessageChannel<ChromingMarkerBarHandlerMessageChannel>;

  constructor(messageChannel: MessageChannel<ChromingMarkerBarHandlerMessageChannel>, chromingMarkerTrackHandler: ChromingMarkerBarHandlerApi, ompProvider: OmpProvider) {
    super(ompProvider);
    this._messageChannel = messageChannel;
    this._chromingMarkerTrackHandler = chromingMarkerTrackHandler;
  }

  bind() {
    this._chromingMarkerTrackHandler.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onEvent$', event);
    });

    this._messageChannel
      .receiveAndSendResponse('setVisibility')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[visible], sendResponseHook]) => {
          sendResponseHook(this._chromingMarkerTrackHandler.setVisibility(visible));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('addTrack')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackId], sendResponseHook]) => {
          sendResponseHook(this._chromingMarkerTrackHandler.addTrack(trackId));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('removeTrack')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackId], sendResponseHook]) => {
          sendResponseHook(this._chromingMarkerTrackHandler.removeTrack(trackId));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([_request, sendResponseHook]) => {
          sendResponseHook(this._chromingMarkerTrackHandler.state);
        },
      });
  }
}
