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

import {type Observable, shareReplay} from 'rxjs';
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import type {RemoteNode} from '../remote-node';
import type {LivePlaybackTrackerMessageChannel} from './live-playback-tracker-message-channel';
import {UI_LIVE_MODEL_NOT_LIVE, type UiLiveModel} from '../../live/live-model';

export class LivePlaybackTrackerProxy extends BaseMessageChannelProxy<LivePlaybackTrackerMessageChannel> implements LivePlaybackTrackerMessageChannel {
  private readonly _onChange$: Observable<UiLiveModel>;
  private _latestUiLiveModel: UiLiveModel | undefined = undefined;

  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('LivePlaybackTracker'));

    this._onChange$ = this.messageChannel.listen('onChange$').pipe(shareReplay(1));
    this._onChange$.subscribe((uiLiveModel) => {
      this._latestUiLiveModel = uiLiveModel;
    });

    this._onInitialized$.next(true);
  }

  get onChange$(): Observable<UiLiveModel> {
    return this._onChange$;
  }

  get model(): UiLiveModel {
    return this._latestUiLiveModel ?? UI_LIVE_MODEL_NOT_LIVE;
  }
}
