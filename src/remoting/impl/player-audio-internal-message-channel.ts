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
import {type PlayerAudioEvent, PlayerAudioEventType, type PlayerAudioState, PlayerAudioType} from '../../player';
import {BaseMessageChannelBinding, MessageChannel, type MessageChannelBinding} from '../message-channel';
import type {AudioHandlerApi} from '../../audio';
import {type AudioHandlerMessageChannel, AudioHandlerMessageChannelBinding, AudioHandlerMessageChannelUtil} from './audio-handler-message-channel';
import {Audio, type AudioState} from '../../media';
import type {OmpProvider} from '../../omp-provider';

export interface PlayerAudioInternalMessageChannel {
  onEvent$: Observable<PlayerAudioEvent>;

  switchTrack(trackId: Audio['id'], activate?: boolean): Observable<void>;

  loadSidecarTrack(audioState: AudioState): Observable<AudioState>;

  removeSidecarTrack(trackId: Audio['id']): Observable<void>;

  removeAllSidecarTracks(): Observable<void>;

  mute(): Observable<void>;

  unmute(): Observable<void>;

  toggleMuted(): Observable<void>;

  setMuted(muted: boolean): Observable<void>;

  setVolume(volume: number): Observable<void>;

  state(): Observable<PlayerAudioState>;
}

export class PlayerAudioInternalMessageChannelBinding extends BaseMessageChannelBinding {
  private _playerDetached: PlayerDetachedApi;
  private _messageChannel: MessageChannel<PlayerAudioInternalMessageChannel>;

  private _audioHandlerMessageChannels: Map<string, MessageChannel<AudioHandlerMessageChannel>> = new Map<string, MessageChannel<AudioHandlerMessageChannel>>();
  private _innerBindings: Map<string, MessageChannelBinding> = new Map();

  constructor(messageChannel: MessageChannel<PlayerAudioInternalMessageChannel>, playerDetached: PlayerDetachedApi, ompProvider: OmpProvider) {
    super(ompProvider);
    this._messageChannel = messageChannel;
    this._playerDetached = playerDetached;
  }

  bind() {
    this._playerDetached.audioInternal.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        if (event.type === PlayerAudioEventType.PLAYER_AUDIO_CHANGE) {
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
          sendResponseHook(this._playerDetached.audioInternal.switchTrack(trackId, activate));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('removeAllSidecarTracks')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.audioInternal.removeAllSidecarTracks());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('mute')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.audioInternal.mute());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('unmute')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.audioInternal.unmute());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('toggleMuted')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.audioInternal.toggleMuted());
        },
      });

    this._messageChannel
      .receiveAndSendResponse('setMuted')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[muted], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.audioInternal.setMuted(muted));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('setVolume')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[volume], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.audioInternal.setVolume(volume));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.audioInternal.state);
        },
      });

    this.update();
  }

  private update() {
    this.updateAudioHandlerMessageChannels();
  }

  private updateAudioHandlerMessageChannels() {
    let mainMediaId = this._playerDetached.playerSession.mainMediaId;

    let pairs: {
      topic: string;
      handler: AudioHandlerApi | undefined;
    }[] = [];

    if (mainMediaId) {
      pairs = [
        {
          topic: AudioHandlerMessageChannelUtil.formatMessageChannelTopic(mainMediaId, PlayerAudioType.OUTPUT),
          handler: this._playerDetached.audioInternal.getHandler(PlayerAudioType.OUTPUT),
        },
        {
          topic: AudioHandlerMessageChannelUtil.formatMessageChannelTopic(mainMediaId, PlayerAudioType.MAIN),
          handler: this._playerDetached.audioInternal.getHandler(PlayerAudioType.MAIN),
        },
        ...this._playerDetached.audioInternal.getTracks(PlayerAudioType.SIDECAR).map((trackState) => ({
          topic: AudioHandlerMessageChannelUtil.formatMessageChannelTopic(mainMediaId, PlayerAudioType.SIDECAR, trackState.id),
          handler: this._playerDetached.audioInternal.getHandler(PlayerAudioType.SIDECAR, trackState.id),
        })),
      ];
    }

    pairs.forEach((pair) => {
      if (pair.handler) {
        let topic = pair.topic;

        if (!this._audioHandlerMessageChannels.has(topic)) {
          let messageChannel = new MessageChannel<AudioHandlerMessageChannel>(this._messageChannel.managedBroadcastChannel, topic);
          this._audioHandlerMessageChannels.set(topic, messageChannel);

          let binding = new AudioHandlerMessageChannelBinding(messageChannel, pair.handler, this._ompProvider);
          binding.bind();

          this._innerBindings.set(topic, binding);
        }
      }
    });

    const activeTopics = new Set(pairs.filter((p) => p.handler).map((p) => p.topic));
    const staleTopics = [...this._audioHandlerMessageChannels.keys()].filter((t) => !activeTopics.has(t));
    for (const topic of staleTopics) {
      this._innerBindings.get(topic)?.destroy();
      this._innerBindings.delete(topic);
      this._audioHandlerMessageChannels.get(topic)?.destroy();
      this._audioHandlerMessageChannels.delete(topic);
    }
  }

  destroy() {
    super.destroy();

    [...this._innerBindings.values()].forEach((innerBinding) => innerBinding.destroy());
    [...this._audioHandlerMessageChannels.values()].forEach((p) => p.destroy());
  }
}
