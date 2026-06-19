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
import type {PlayerDetachedApi} from '../../player';
import {type PlayerTextEvent, PlayerTextEventType, type PlayerTextState} from '../../player';
import {BaseMessageChannelBinding, MessageChannel, type MessageChannelBinding} from '../message-channel';
import {type TextTrackState} from '../../media';
import type {TextTrackHandlerApi} from '../../text';
import {type TextTrackHandlerMessageChannel, TextTrackHandlerMessageChannelBinding, TextTrackHandlerMessageChannelUtil} from './text-track-handler-message-channel';
import type {OmpProvider} from '../../omp-provider';

export interface PlayerTextInternalMessageChannel {
  onEvent$: Observable<PlayerTextEvent>;

  shown: boolean;

  switchTrack(trackId: TextTrack['id'], activate?: boolean): Observable<void>;

  show(): Observable<void>;

  hide(): Observable<void>;

  toggleShowHide(): Observable<void>;

  loadSidecarTrack(textTrackState: TextTrackState): Observable<TextTrackState>;

  removeSidecarTrack(trackId: TextTrack['id']): Observable<void>;

  removeAllSidecarTracks(): Observable<void>;

  state(): Observable<PlayerTextState>;
}

export class PlayerTextInternalMessageChannelBinding extends BaseMessageChannelBinding {
  private _playerDetached: PlayerDetachedApi;
  private _messageChannel: MessageChannel<PlayerTextInternalMessageChannel>;

  private _textHandlerMessageChannels: Map<string, MessageChannel<TextTrackHandlerMessageChannel>> = new Map<string, MessageChannel<TextTrackHandlerMessageChannel>>();
  private _innerBindings: Map<string, MessageChannelBinding> = new Map();

  constructor(messageChannel: MessageChannel<PlayerTextInternalMessageChannel>, playerDetached: PlayerDetachedApi, ompProvider: OmpProvider) {
    super(ompProvider);
    this._messageChannel = messageChannel;
    this._playerDetached = playerDetached;
  }

  bind() {
    this._playerDetached.textInternal.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        if (event.type === PlayerTextEventType.PLAYER_TEXT_CHANGE) {
          this.update();
        }
        this._messageChannel.send('onEvent$', event);
      },
    });

    this._messageChannel
      .receiveAndSendResponse('switchTrack')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackId, activate], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.textInternal.switchTrack(trackId, activate));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('show')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.textInternal.show());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('hide')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.textInternal.hide());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('toggleShowHide')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.textInternal.toggleShowHide());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.textInternal.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('removeAllSidecarTracks')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.textInternal.removeAllSidecarTracks());
        },
      });

    this.update();
  }

  private update() {
    this.updateTextHandlerMessageChannels();
  }

  private updateTextHandlerMessageChannels() {
    let mainMediaId = this._playerDetached.playerSession.mainMediaId;

    let pairs: {
      topic: string;
      handler: TextTrackHandlerApi | undefined;
    }[] = [];

    if (mainMediaId) {
      pairs = [
        ...this._playerDetached.textInternal.getTracks().map((trackState) => ({
          topic: TextTrackHandlerMessageChannelUtil.formatMessageChannelTopic(mainMediaId, trackState.id),
          handler: this._playerDetached.textInternal.getHandler(trackState.id),
        })),
      ];
    }

    pairs.forEach((pair) => {
      if (pair.handler) {
        let topic = pair.topic;

        if (!this._textHandlerMessageChannels.has(topic)) {
          let messageChannel = new MessageChannel<TextTrackHandlerMessageChannel>(this._messageChannel.managedBroadcastChannel, topic);
          this._textHandlerMessageChannels.set(topic, messageChannel);

          let binding = new TextTrackHandlerMessageChannelBinding(messageChannel, pair.handler, this._ompProvider);
          binding.bind();

          this._innerBindings.set(topic, binding);
        }
      }
    });

    const activeTopics = new Set(pairs.filter((p) => p.handler).map((p) => p.topic));
    const staleTopics = [...this._textHandlerMessageChannels.keys()].filter((t) => !activeTopics.has(t));
    for (const topic of staleTopics) {
      this._innerBindings.get(topic)?.destroy();
      this._innerBindings.delete(topic);
      this._textHandlerMessageChannels.get(topic)?.destroy();
      this._textHandlerMessageChannels.delete(topic);
    }
  }

  destroy() {
    super.destroy();

    [...this._innerBindings.values()].forEach((innerBinding) => innerBinding.destroy());
    [...this._textHandlerMessageChannels.values()].forEach((p) => p.destroy());
  }
}
