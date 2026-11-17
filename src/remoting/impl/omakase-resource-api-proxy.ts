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
import type {Observable} from 'rxjs';
import type {UrlSourceState} from '../../source';
import type {RemoteNode} from '../remote-node';
import type {OmakaseResourceApiMessageChannel} from './omakase-resource-api-message-channel';
import type {ResourceEntityState} from '../../entity';
import type {ResourceCreateOptions} from '../../resource';

export class OmakaseResourceApiProxy extends BaseMessageChannelProxy<OmakaseResourceApiMessageChannel> implements OmakaseResourceApiMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('OmakaseResourceApi'));
    this._onInitialized$.next(true);
  }

  add(resource: ResourceEntityState): Observable<ResourceEntityState> {
    return this.messageChannel.sendAndWaitForResponse('add', [resource]);
  }

  delete(id: ResourceEntityState['id']): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('delete', [id]);
  }

  find(): Observable<ResourceEntityState[]> {
    return this.messageChannel.sendAndWaitForResponse('find');
  }

  get(id: ResourceEntityState['id']): Observable<ResourceEntityState | undefined> {
    return this.messageChannel.sendAndWaitForResponse('get', [id]);
  }

  create(sourceOrInline: UrlSourceState | string, createOptions?: ResourceCreateOptions | undefined): Observable<ResourceEntityState> {
    return this.messageChannel.sendAndWaitForResponse('create', [sourceOrInline, createOptions]);
  }
}
