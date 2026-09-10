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

import {takeUntil} from 'rxjs';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {OmpProvider} from '../../omp-provider';
import type {LivePlaybackTracker, LivePlaybackTrackerApi} from '../../live/live-model';

export interface LivePlaybackTrackerMessageChannel extends LivePlaybackTrackerApi {}

export class LivePlaybackTrackerMessageChannelBinding extends BaseMessageChannelBinding {
  private _messageChannel: MessageChannel<LivePlaybackTrackerMessageChannel>;
  private _livePlaybackTracker: LivePlaybackTrackerApi;

  constructor(messageChannel: MessageChannel<LivePlaybackTrackerMessageChannel>, ompProvider: OmpProvider, livePlaybackTracker: LivePlaybackTrackerApi) {
    super(ompProvider);
    this._messageChannel = messageChannel;
    this._livePlaybackTracker = livePlaybackTracker;
  }

  bind() {
    this._livePlaybackTracker.onChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onChange$', event);
    });
  }
}
