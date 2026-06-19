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

import {takeUntil, type Observable} from 'rxjs';
import type {AudioRouterApi, AudioRouterEvent, AudioRouterState, AudioRoutingConnection, AudioRoutingInputPath} from '../../audio/audio-router';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {AudioHandlerMessageChannel} from './audio-handler-message-channel';
import type {OmpProvider} from '../../omp-provider';

export class AudioRouterMessageChannelUtil {
  static formatMessageChannelTopic(audioHandlerMessageChannel: MessageChannel<AudioHandlerMessageChannel>) {
    return `${audioHandlerMessageChannel.topic}.router`;
  }
}

export interface AudioRouterMessageChannel {
  onEvent$: Observable<AudioRouterEvent>;
  state: Observable<AudioRouterState>;
  getDefaultRoutingConnections(): Observable<AudioRoutingConnection[]>;
  setDefaultRoutingConnections(connections: AudioRoutingConnection[]): Observable<void>;
  toggleSolo(routingPath: AudioRoutingInputPath): Observable<void>;
  toggleMute(routingPath: AudioRoutingInputPath): Observable<void>;
  resetRouter(): Observable<void>;
  updateConnections(connections: AudioRoutingConnection[]): Observable<void>;
}

export class AudioRouterMessageChannelBinding extends BaseMessageChannelBinding {
  private _audioRouter?: AudioRouterApi | undefined;
  private _messageChannel: MessageChannel<AudioRouterMessageChannel>;

  constructor(messageChannel: MessageChannel<AudioRouterMessageChannel>, audioRouter: AudioRouterApi | undefined, ompProvider: OmpProvider) {
    super(ompProvider);
    this._messageChannel = messageChannel;
    this._audioRouter = audioRouter;
  }

  bind(): void {
    if (!this._audioRouter) {
      return;
    }

    this._audioRouter.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onEvent$', event);
    });

    this._messageChannel
      .receiveAndSendResponse('getDefaultRoutingConnections')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([_, sendResponseHook]) => {
          sendResponseHook(this._audioRouter!.getDefaultRoutingConnections());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('resetRouter')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([_, sendResponseHook]) => {
          sendResponseHook(this._audioRouter!.resetRouter());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('setDefaultRoutingConnections')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[routingConnections], sendResponseHook]) => {
          sendResponseHook(this._audioRouter!.setDefaultRoutingConnections(routingConnections));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([_, sendResponseHook]) => {
          sendResponseHook(this._audioRouter!.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('toggleMute')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[routingPath], sendResponseHook]) => {
          sendResponseHook(this._audioRouter!.toggleMute(routingPath));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('toggleSolo')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[routingPath], sendResponseHook]) => {
          sendResponseHook(this._audioRouter!.toggleSolo(routingPath));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('updateConnections')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[connections], sendResponseHook]) => {
          sendResponseHook(this._audioRouter!.updateConnections(connections));
        },
      });
  }
}
