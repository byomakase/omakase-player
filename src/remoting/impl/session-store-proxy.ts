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
import {Observable} from 'rxjs';
import type {ChromingSession, PlayerSession, SessionEvent, SessionState} from '../../session';
import type {DeepPartial} from '../../types/ts-types';
import {WindowPlaybackMode} from '../../common';
import type {SessionStoreMessageChannel} from './session-store-message-channel';
import type {PlayerPlayback} from '../../player';
import type {RemoteNode} from '../remote-node';

export class SessionStoreProxy extends BaseMessageChannelProxy<SessionStoreMessageChannel> implements SessionStoreMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('SessionStore'));
    this._onInitialized$.next(true);
  }

  get onEvent$(): Observable<SessionEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  setPlayer(playerSession: PlayerSession | undefined): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setPlayer', [playerSession]);
  }

  updatePlayer(patch: DeepPartial<PlayerSession>): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('updatePlayer', [patch]);
  }

  updateChroming(patch: DeepPartial<ChromingSession>): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('updateChroming', [patch]);
  }

  updatePlayerCurrentTime(currentTime: PlayerPlayback['currentTime']): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('updatePlayerCurrentTime', [currentTime]);
  }

  updateWindowPlaybackMode(next: WindowPlaybackMode, error?: string): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('updateWindowPlaybackMode', [next, error]);
  }

  requestWindowPlaybackModeChange(mode: WindowPlaybackMode): void {
    this.messageChannel.send('requestWindowPlaybackModeChange', [mode]);
  }

  state(): Observable<SessionState> {
    return this.messageChannel.sendAndWaitForResponse('state');
  }
}
