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
import type {AudioHandlerApi} from '../../audio';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {AudioEffectEvent} from '../../audio';
import type {AudioEffectGraphState, AudioEffectGraphConnection, AudioEffectParam, AudioEffectFilter, AudioEffectState, AudioEffectGraphSpecificConnection} from '../../audio/audio-effects/model';
import type {AudioHandlerMessageChannel} from './audio-handler-message-channel';
import type {OmpProvider} from '../../omp-provider';

export class AudioEffectsMessageChannelUtil {
  static formatMessageChannelTopic(audioHandlerMessageChannel: MessageChannel<AudioHandlerMessageChannel>) {
    return `${audioHandlerMessageChannel.topic}.effects`;
  }
}

export interface AudioEffectsMessageChannel {
  setEffectGraph(effectGraphState: AudioEffectGraphState, effectGraphConnection: AudioEffectGraphConnection): Observable<void>;
  removeEffectGraph(effectGraphConnection: AudioEffectGraphConnection): Observable<void>;
  setEffectsParams(param: AudioEffectParam, effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<void>;
  getEffectStates(effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<AudioEffectState[]>;
  getEffectGraphState(effectGraphConnection: AudioEffectGraphSpecificConnection): Observable<AudioEffectGraphState | undefined>;
  onEvent$: Observable<AudioEffectEvent>;
}

export class AudioEffectsMessageChannelBinding extends BaseMessageChannelBinding {
  private _audioHandler: AudioHandlerApi;
  private _messageChannel: MessageChannel<AudioEffectsMessageChannel>;

  constructor(messageChannel: MessageChannel<AudioEffectsMessageChannel>, audioHandler: AudioHandlerApi, ompProvider: OmpProvider) {
    super(ompProvider);
    this._messageChannel = messageChannel;
    this._audioHandler = audioHandler;
  }

  bind() {
    this._audioHandler.effects.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onEvent$', event);
    });

    this._messageChannel
      .receiveAndSendResponse('setEffectGraph')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[effectGraphState, effectGraphConnection], sendResponseHook]) => {
          sendResponseHook(this._audioHandler.effects.setEffectGraph(effectGraphState, effectGraphConnection));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('removeEffectGraph')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[effectGraphConnection], sendResponseHook]) => {
          sendResponseHook(this._audioHandler.effects.removeEffectGraph(effectGraphConnection));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('setEffectsParams')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[param, effectGraphConnection, filter], sendResponseHook]) => {
          sendResponseHook(this._audioHandler.effects.setEffectsParams(param, effectGraphConnection, filter));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('getEffectStates')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[effectGraphConnection, filter], sendResponseHook]) => {
          sendResponseHook(this._audioHandler.effects.getEffectStates(effectGraphConnection, filter));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('getEffectGraphState')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[effectGraphConnection], sendResponseHook]) => {
          sendResponseHook(this._audioHandler.effects.getEffectGraphState(effectGraphConnection));
        },
      });
  }
}
