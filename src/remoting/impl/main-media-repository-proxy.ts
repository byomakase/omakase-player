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
import type {MainMediaRepositoryEvent} from '../../repository';
import type {MainMediaEvent, MainMediaState} from '../../media';
import type {MainMediaRepositoryMessageChannel} from './main-media-repository-message-channel';
import type {RemoteNode} from '../remote-node';

export class MainMediaRepositoryProxy extends BaseMessageChannelProxy<MainMediaRepositoryMessageChannel> implements MainMediaRepositoryMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('MainMediaRepository'));
    this._onInitialized$.next(true);
  }

  get onEvent$(): Observable<MainMediaRepositoryEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  get onMainMediaEvent$(): Observable<MainMediaEvent> {
    return this.messageChannel.listen('onMainMediaEvent$');
  }

  get(id: MainMediaState['id']): Observable<MainMediaState | undefined> {
    return this.messageChannel.sendAndWaitForResponse('get', [id]);
  }

  getOrFail(id: MainMediaState['id']): Observable<MainMediaState> {
    return this.messageChannel.sendAndWaitForResponse('getOrFail', [id]);
  }

  getFirstOrFail(): Observable<MainMediaState> {
    return this.messageChannel.sendAndWaitForResponse('getFirstOrFail');
  }

  findFirst(): Observable<MainMediaState | undefined> {
    return this.messageChannel.sendAndWaitForResponse('findFirst');
  }

  add(mainMedia: MainMediaState): Observable<MainMediaState> {
    return this.messageChannel.sendAndWaitForResponse('add', [mainMedia]);
  }

  delete(id: MainMediaState['id']) {
    return this.messageChannel.sendAndWaitForResponse('delete', [id]);
  }

  clear(): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('clear');
  }
}
