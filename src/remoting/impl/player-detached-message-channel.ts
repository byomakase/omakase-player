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

import type {PlayerDetachedApi} from '../../player';
import {BaseMessageChannelBinding, MessageChannel, type MessageChannelBinding} from '../message-channel';
import {takeUntil} from 'rxjs';
import {type PlayerAudioInternalMessageChannel, PlayerAudioInternalMessageChannelBinding} from './player-audio-internal-message-channel';
import {type PlayerTextInternalMessageChannel, PlayerTextInternalMessageChannelBinding} from './player-text-internal-message-channel';
import type {OmpProvider} from '../../omp-provider';

export interface PlayerDetachedMessageChannel extends PlayerDetachedApi {}

export class PlayerDetachedMessageChannelBinding extends BaseMessageChannelBinding {
  private _playerDetachedMessageChannel: MessageChannel<PlayerDetachedMessageChannel>;
  private _playerDetached: PlayerDetachedApi;

  private _innerBindings: MessageChannelBinding[];

  constructor(
    messageChannel: MessageChannel<PlayerDetachedMessageChannel>,
    playerAudioInternalMessageChannel: MessageChannel<PlayerAudioInternalMessageChannel>,
    playerTextInternalMessageChannel: MessageChannel<PlayerTextInternalMessageChannel>,
    playerDetached: PlayerDetachedApi,
    ompProvider: OmpProvider
  ) {
    super(ompProvider);
    this._playerDetachedMessageChannel = messageChannel;
    this._playerDetached = playerDetached;

    this._innerBindings = [
      new PlayerAudioInternalMessageChannelBinding(playerAudioInternalMessageChannel, this._playerDetached, ompProvider),
      new PlayerTextInternalMessageChannelBinding(playerTextInternalMessageChannel, this._playerDetached, ompProvider),
    ];
  }

  bind() {
    this._playerDetached.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        this._playerDetachedMessageChannel.send('onEvent$', event);
      },
    });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('restorePlayerSession')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[playerSession], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.restorePlayerSession(playerSession));
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('loadMainMedia')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[mainMediaId], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.loadMainMedia(mainMediaId));
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('loadSidecarTrack')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackId], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.loadSidecarTrack(trackId));
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('unloadMainMedia')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.unloadMainMedia());
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('play')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.play());
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('pause')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.pause());
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('seekTo')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[value, format], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.seekTo(value, format));
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('seekFromCurrentTime')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[value, format], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.seekFromCurrentTime(value, format));
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('setPlaybackRate')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[value], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.setPlaybackRate(value));
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('toggleFullScreen')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._playerDetached.toggleFullScreen());
        },
      });

    this._playerDetachedMessageChannel
      .receiveAndSendResponse('extractVideoKeyframe')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[options], sendResponseHook]) => {
          sendResponseHook(this._playerDetached.extractVideoKeyframe(options));
        },
      });

    this._innerBindings.forEach((p) => p.bind());
  }

  destroy() {
    super.destroy();

    this._innerBindings.forEach((p) => p.destroy());
  }
}
