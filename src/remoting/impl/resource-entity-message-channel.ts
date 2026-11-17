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

import type {ResourceEntity, ResourceEntityState} from '../../entity';
import {type Observable, takeUntil} from 'rxjs';
import {BaseMessageChannelBinding, ManagedBroadcastChannel, MessageChannel} from '../message-channel';
import type {OmpProvider} from '../../omp-provider';

export class ResourceEntityMessageChannelUtil {
  static formatMessageChannelTopic(resourceEntityId: ResourceEntity['id']) {
    return `ResourceEntity[${resourceEntityId}]`;
  }
}

export interface ResourceEntityMessageChannel {
  state(): Observable<ResourceEntityState>;
}

export class ResourceEntityMessageChannelBinding<M extends ResourceEntityMessageChannel = ResourceEntityMessageChannel, T extends ResourceEntity = ResourceEntity> extends BaseMessageChannelBinding {
  protected _resource: T;
  protected _messageChannel: MessageChannel<M>;

  constructor(managedBroadcastChannel: ManagedBroadcastChannel, resource: T, ompProvider: OmpProvider) {
    super(ompProvider);
    this._resource = resource;
    this._messageChannel = new MessageChannel<M>(managedBroadcastChannel, ResourceEntityMessageChannelUtil.formatMessageChannelTopic(this._resource.id));
  }

  bind() {
    const messageChannel = this._messageChannel as MessageChannel<ResourceEntityMessageChannel>;

    messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([_, sendResponseHook]) => {
          sendResponseHook(this._resource.state);
        },
      });
  }
}
