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

import type {Observable} from 'rxjs';
import type {MainMedia} from '../../media';
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import type {RemoteNode} from '../remote-node';
import type {TamsMainMediaSessionMessageChannel} from './tams-main-media-session-message-channel';
import type {TamsMainMediaSessionState, TamsMainMediaSessionStateUpdate} from '../../tams/tams-main-media-session';

export class TamsMainMediaSessionProxy extends BaseMessageChannelProxy<TamsMainMediaSessionMessageChannel> implements TamsMainMediaSessionMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('TamsMainMediaSession'));
    this._onInitialized$.next(true);
  }

  get onSessionStateUpdated$(): Observable<TamsMainMediaSessionStateUpdate> {
    return this.messageChannel.listen('onSessionStateUpdated$');
  }

  getSessionState(mainMediaId: MainMedia['id']): Observable<TamsMainMediaSessionState | undefined> {
    return this.messageChannel.sendAndWaitForResponse('getSessionState', [mainMediaId]);
  }
}
