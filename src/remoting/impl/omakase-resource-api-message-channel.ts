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

import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import {map, Observable, takeUntil} from 'rxjs';
import {ResourceRepository} from '../../repository';
import {type UrlSourceState} from '../../source';
import type {OmpProvider} from '../../omp-provider';
import type {ResourceEntityState} from '../../entity';
import type {ResourceCreateOptions} from '../../resource';
import type {OmakaseResourceApiImpl} from '../../resource/omakase-resource';
import {ResourceDeserializer} from '../../resource/resource-deserializer';

export interface OmakaseResourceApiMessageChannel {
  get(id: ResourceEntityState['id']): Observable<ResourceEntityState | undefined>;

  delete(id: ResourceEntityState['id']): Observable<boolean>;

  add(resource: ResourceEntityState): Observable<ResourceEntityState>;

  find(): Observable<ResourceEntityState[]>;

  create(sourceOrInline: UrlSourceState | string, createOptions?: ResourceCreateOptions | undefined): Observable<ResourceEntityState>;
}

export class OmakaseResourceApiMessageChannelBinding extends BaseMessageChannelBinding {
  protected _resourceApi: OmakaseResourceApiImpl;
  protected _resourceRepository: ResourceRepository;

  private _messageChannel: MessageChannel<OmakaseResourceApiMessageChannel>;

  constructor(messageChannel: MessageChannel<OmakaseResourceApiMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._resourceApi = ompProvider.omakaseResource;
    this._resourceRepository = ompProvider.resourceRepository;
    this._messageChannel = messageChannel;
  }

  bind() {
    this._messageChannel
      .receiveAndSendResponse('get')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._resourceRepository.get(id)?.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('delete')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._resourceRepository.delete(id));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('add')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[resourceState], sendResponseHook]) => {
          let resource = ResourceDeserializer.createResource(resourceState);
          let newResource = this._resourceRepository.add(resource);
          sendResponseHook(newResource.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('find')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([_, sendResponseHook]) => {
          sendResponseHook(this._resourceRepository.find().map((p) => p.state));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('create')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[sourceOrInline, createOptions], sendResponseHook]) => {
          let source = ResourceDeserializer.resolveSource(sourceOrInline);

          sendResponseHook(this._resourceApi.create(source, createOptions).pipe(map((p) => p.state)));
        },
      });
  }

  destroy() {
    super.destroy();
  }
}
