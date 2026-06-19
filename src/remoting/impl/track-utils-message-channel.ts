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

import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {Track, TrackState} from '../../media';
import {map, Observable, takeUntil} from 'rxjs';
import {TrackUtils} from '../../track/track-utils';
import type {OmpProvider} from '../../omp-provider';

export interface TrackUtilsMessageChannel {
  preloadTrack(id: Track['id']): Observable<TrackState>;
}

export class TrackUtilsMessageChannelBinding extends BaseMessageChannelBinding {
  private _trackUtils: TrackUtils;
  private _messageChannel: MessageChannel<TrackUtilsMessageChannel>;

  constructor(messageChannel: MessageChannel<TrackUtilsMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._trackUtils = ompProvider.trackUtils;
    this._messageChannel = messageChannel;
  }

  bind() {
    this._messageChannel
      .receiveAndSendResponse('preloadTrack')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._trackUtils.preloadTrack(id).pipe(map((p) => p.state)));
        },
      });
  }

  destroy() {
    super.destroy();
  }
}
