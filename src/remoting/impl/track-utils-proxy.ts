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

import {BaseMessageChannelProxy} from '../message-channel-proxy';
import type {TrackUtilsMessageChannel} from './track-utils-message-channel';
import type {Observable} from 'rxjs';
import type {Track, TrackState} from '../../media';
import type {RemoteNode} from '../remote-node';

export class TrackUtilsProxy extends BaseMessageChannelProxy<TrackUtilsMessageChannel> implements TrackUtilsMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('TrackUtils'));
    this._onInitialized$.next(true);
  }

  preloadTrack(id: Track['id']): Observable<TrackState> {
    return this.messageChannel.sendAndWaitForResponse('preloadTrack', [id]);
  }
}
