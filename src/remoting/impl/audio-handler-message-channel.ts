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

import {filter, type Observable, take, takeUntil} from 'rxjs';
import {type AudioHandlerApi, type AudioHandlerEvent, AudioHandlerEventType, type AudioHandlerState} from '../../audio';
import type {PlayerAudioType} from '../../player';
import {isNullOrUndefined} from '../../util/util-functions';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import {type AudioPeakProcessorEvent, AudioPeakProcessorMeterStandard} from '../../audio';
import {Audio, type MainMedia} from '../../media';
import {type AudioEffectsMessageChannel, AudioEffectsMessageChannelBinding, AudioEffectsMessageChannelUtil} from './audio-effects-message-channel';
import {type AudioRouterMessageChannel, AudioRouterMessageChannelBinding, AudioRouterMessageChannelUtil} from './audio-router-message-channel';
import type {OmpProvider} from '../../omp-provider';

export class AudioHandlerMessageChannelUtil {
  static formatMessageChannelTopic(mainMediaId: MainMedia['id'], playerAudioType: PlayerAudioType, id?: Audio['id']) {
    return `player.audio.getHandler(${mainMediaId}, ${playerAudioType}${isNullOrUndefined(id) ? '' : `, ${id}`})`;
  }
}

export interface AudioHandlerMessageChannel {
  onEvent$: Observable<AudioHandlerEvent>;

  onPeakProcessorEvent$: Observable<AudioPeakProcessorEvent>;

  mute(): Observable<void>;

  unmute(): Observable<void>;

  toggleMuted(): Observable<void>;

  setMuted(muted: boolean): Observable<void>;

  setVolume(volume: number): Observable<void>;

  setEnabled(enabled: boolean): Observable<void>;

  state(): Observable<AudioHandlerState>;

  createPeakProcessor(meterStandard?: AudioPeakProcessorMeterStandard): Observable<void>;

  createAudioRouter(inputsNumber?: number, outputsNumber?: number): Observable<void>;
}

export class AudioHandlerMessageChannelBinding extends BaseMessageChannelBinding {
  private _audioHandler: AudioHandlerApi;
  private _messageChannel: MessageChannel<AudioHandlerMessageChannel>;
  private _effectsMessageChannel: MessageChannel<AudioEffectsMessageChannel>;
  private _effectsMessageChannelBinding: AudioEffectsMessageChannelBinding;
  private _routerMessageChannel: MessageChannel<AudioRouterMessageChannel>;
  private _routerMessageChannelBinding?: AudioRouterMessageChannelBinding;

  constructor(messageChannel: MessageChannel<AudioHandlerMessageChannel>, audioHandler: AudioHandlerApi, ompProvider: OmpProvider) {
    super(ompProvider);
    this._messageChannel = messageChannel;
    this._audioHandler = audioHandler;

    this._effectsMessageChannel = new MessageChannel<AudioEffectsMessageChannel>(
      this._messageChannel.managedBroadcastChannel,
      AudioEffectsMessageChannelUtil.formatMessageChannelTopic(this._messageChannel)
    );

    this._routerMessageChannel = new MessageChannel<AudioRouterMessageChannel>(
      this._messageChannel.managedBroadcastChannel,
      AudioRouterMessageChannelUtil.formatMessageChannelTopic(this._messageChannel)
    );

    this._effectsMessageChannelBinding = new AudioEffectsMessageChannelBinding(this._effectsMessageChannel, this._audioHandler, ompProvider);
    if (this._audioHandler.router) {
      this.createAudioRouterMessageChannel();
    } else {
      this._audioHandler.onEvent$
        .pipe(
          filter((event) => event.type === AudioHandlerEventType.AUDIO_HANDLER_CHANGE && event.data.state.router !== undefined),
          take(1)
        )
        .subscribe(() => {
          this.createAudioRouterMessageChannel();
        });
    }
  }

  bind() {
    this._audioHandler.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onEvent$', event);
    });

    this._audioHandler.onPeakProcessorEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onPeakProcessorEvent$', event);
    });

    this._messageChannel
      .receiveAndSendResponse('mute')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._audioHandler.mute());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('unmute')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._audioHandler.unmute());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('toggleMuted')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._audioHandler.toggleMuted());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('setMuted')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[muted], sendResponseHook]) => {
          sendResponseHook(this._audioHandler.setMuted(muted));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('setVolume')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[volume], sendResponseHook]) => {
          sendResponseHook(this._audioHandler.setVolume(volume));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('setEnabled')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[enabled], sendResponseHook]) => {
          sendResponseHook(this._audioHandler.setEnabled(enabled));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._audioHandler.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('createPeakProcessor')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[meterStandard], sendResponseHook]) => {
          sendResponseHook(this._audioHandler.createPeakProcessor(meterStandard));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('createAudioRouter')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[inputsNumber, outputsNumber], sendResponseHook]) => {
          this._audioHandler.createAudioRouter(inputsNumber, outputsNumber).subscribe(() => {
            sendResponseHook();
          });
        },
      });

    this._effectsMessageChannelBinding.bind();
  }

  private createAudioRouterMessageChannel() {
    if (!this._routerMessageChannelBinding) {
      this._routerMessageChannelBinding = new AudioRouterMessageChannelBinding(this._routerMessageChannel, this._audioHandler.router!, this._ompProvider);
      this._routerMessageChannelBinding.bind();
    }
  }
}
