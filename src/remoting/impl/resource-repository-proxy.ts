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
import type {ResourceRepositoryEvent} from '../../repository';
import type {RemoteNode} from '../remote-node';
import type {ResourceRepositoryMessageChannel} from './resource-repository-message-channel';
import type {ResourceEntityState} from '../../entity';

export class ResourceRepositoryProxy extends BaseMessageChannelProxy<ResourceRepositoryMessageChannel> implements ResourceRepositoryMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('ResourceRepository'));
    this._onInitialized$.next(true);
  }

  get onEvent$(): Observable<ResourceRepositoryEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  get(id: ResourceEntityState['id']): Observable<ResourceEntityState | undefined> {
    return this.messageChannel.sendAndWaitForResponse('get', [id]);
  }

  getOrFail(id: ResourceEntityState['id']): Observable<ResourceEntityState> {
    return this.messageChannel.sendAndWaitForResponse('getOrFail', [id]);
  }

  find(): Observable<ResourceEntityState[]> {
    return this.messageChannel.sendAndWaitForResponse('find');
  }

  add(state: ResourceEntityState): Observable<ResourceEntityState> {
    return this.messageChannel.sendAndWaitForResponse('add', [state]);
  }

  addAll(states: ResourceEntityState[]): Observable<ResourceEntityState[]> {
    return this.messageChannel.sendAndWaitForResponse('addAll', [states]);
  }

  delete(id: ResourceEntityState['id']) {
    return this.messageChannel.sendAndWaitForResponse('delete', [id]);
  }
}
