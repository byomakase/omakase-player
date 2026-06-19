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
import type {TrackEvent, TrackState} from '../../media';
import type {TrackRepositoryMessageChannel} from './track-repository-message-channel';
import type {TrackRepositoryEvent} from '../../repository';
import type {RemoteNode} from '../remote-node';

export class TrackRepositoryProxy extends BaseMessageChannelProxy<TrackRepositoryMessageChannel> implements TrackRepositoryMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('TrackRepository'));
    this._onInitialized$.next(true);
  }

  get onEvent$(): Observable<TrackRepositoryEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  get onTrackEvent$(): Observable<TrackEvent> {
    return this.messageChannel.listen('onTrackEvent$');
  }

  get(id: TrackState['id']): Observable<TrackState | undefined> {
    return this.messageChannel.sendAndWaitForResponse('get', [id]);
  }

  getOrFail(id: TrackState['id']): Observable<TrackState> {
    return this.messageChannel.sendAndWaitForResponse('getOrFail', [id]);
  }

  find(): Observable<TrackState[]> {
    return this.messageChannel.sendAndWaitForResponse('find');
  }

  add(state: TrackState): Observable<TrackState> {
    return this.messageChannel.sendAndWaitForResponse('add', [state]);
  }

  addAll(states: TrackState[]): Observable<TrackState[]> {
    return this.messageChannel.sendAndWaitForResponse('addAll', [states]);
  }

  delete(id: TrackState['id']) {
    return this.messageChannel.sendAndWaitForResponse('delete', [id]);
  }
}
