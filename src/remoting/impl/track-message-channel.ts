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

import type {Track, TrackEvent, TrackState, TrackUpdateableAttrs} from '../../media';
import {type Observable, takeUntil} from 'rxjs';
import {BaseMessageChannelBinding, ManagedBroadcastChannel, MessageChannel} from '../message-channel';
import type {OmpProvider} from '../../omp-provider';

export class TrackMessageChannelUtil {
  static formatMessageChannelTopic(trackId: Track['id']) {
    return `Track[${trackId}]`;
  }
}

export interface TrackMessageChannel {
  onEvent$: Observable<TrackEvent>;

  loadStart(): Observable<boolean>;

  loadSuccess(): Observable<boolean>;

  loadError(error: string | undefined): Observable<boolean>;

  updateAttrs(attrs: TrackUpdateableAttrs): Observable<TrackState>;
}

export class TrackMessageChannelBinding<M extends TrackMessageChannel = TrackMessageChannel, T extends Track = Track> extends BaseMessageChannelBinding {
  protected _track: T;
  protected _messageChannel: MessageChannel<M>;

  constructor(managedBroadcastChannel: ManagedBroadcastChannel, track: T, ompProvider: OmpProvider) {
    super(ompProvider);
    this._track = track;
    this._messageChannel = new MessageChannel<M>(managedBroadcastChannel, TrackMessageChannelUtil.formatMessageChannelTopic(this._track.id));
  }

  bind() {
    const messageChannel = this._messageChannel as MessageChannel<TrackMessageChannel>;

    this._track.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      messageChannel.send('onEvent$', event);
    });

    messageChannel.receiveAndSendResponse('loadStart')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          this._track.loadStart();
          sendResponseHook(true);
        },
      });
    messageChannel.receiveAndSendResponse('loadSuccess')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          this._track.loadSuccess();
          sendResponseHook(true);
        },
      });
    messageChannel.receiveAndSendResponse('loadError')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[error], sendResponseHook]) => {
          this._track.loadError(error);
          sendResponseHook(true);
        },
      });

    messageChannel.receiveAndSendResponse('updateAttrs')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[attrs], sendResponseHook]) => {
          this._track.updateAttrs(attrs);
          sendResponseHook(this._track.state);
        },
      });
  }
}
