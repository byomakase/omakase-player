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

import {type Observable, takeUntil} from 'rxjs';
import {BaseMessageChannelBinding, MessageChannel, type MessageChannelBinding} from '../message-channel';
import {ResourceRepository, type ResourceRepositoryEvent, ResourceRepositoryEventType} from '../../repository';
import type {OmpProvider} from '../../omp-provider';
import {type ResourceEntity, type ResourceEntityState, ResourceEntityType} from '../../entity';
import {ResourceEntityMessageChannelBinding} from './resource-entity-message-channel';
import {ResourceDeserializer} from '../../resource/resource-deserializer';
import {type MarkerTrack, type ThumbnailTrack, TrackType} from '../../media';
import {MarkerTrackMessageChannelBinding} from './marker-track-message-channel';
import {ThumbnailTrackMessageChannelBinding} from './thumbnail-track-message-channel';
import {TrackMessageChannelBinding} from './track-message-channel';
import {SvgResourceMessageChannelBinding} from './svg-resource-message-channel';
import type {SvgResource} from '../../resource';

export interface ResourceRepositoryMessageChannel {
  onEvent$: Observable<ResourceRepositoryEvent>;

  get(id: ResourceEntityState['id']): Observable<ResourceEntityState | undefined>;

  getOrFail(id: ResourceEntityState['id']): Observable<ResourceEntityState>;

  find(): Observable<ResourceEntityState[]>;

  add(state: ResourceEntityState): Observable<ResourceEntityState>;

  addAll(states: ResourceEntityState[]): Observable<ResourceEntityState[]>;

  delete(id: ResourceEntityState['id']): Observable<boolean>;
}

export class ResourceRepositoryMessageChannelBinding extends BaseMessageChannelBinding {
  private _resourceRepository: ResourceRepository;
  private _messageChannel: MessageChannel<ResourceRepositoryMessageChannel>;

  private _innerBindings: Map<string, MessageChannelBinding> = new Map();

  constructor(messageChannel: MessageChannel<ResourceRepositoryMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._resourceRepository = ompProvider.resourceRepository;
    this._messageChannel = messageChannel;
  }

  bind() {
    let createResourceBinding = (resource: ResourceEntity) => {
      let binding: MessageChannelBinding;

      switch (resource.resourceType) {
        case ResourceEntityType.SVG_RESOURCE:
          binding = new SvgResourceMessageChannelBinding(this._messageChannel.managedBroadcastChannel, resource as SvgResource, this._ompProvider);
          break;
        default:
          binding = new ResourceEntityMessageChannelBinding(this._messageChannel.managedBroadcastChannel, resource, this._ompProvider);
      }

      binding.bind();
      this._innerBindings.set(resource.id, binding);
    };

    this._resourceRepository.find().forEach((resource) => createResourceBinding(resource));

    this._resourceRepository.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onEvent$', event);

      if (event.type === ResourceRepositoryEventType.RESOURCE_ADDED) {
        createResourceBinding(this._resourceRepository.getOrFail(event.data.resourceState.id));
      } else if (event.type === ResourceRepositoryEventType.RESOURCE_DELETED) {
        this._innerBindings.get(event.data.resourceState.id)?.destroy();
        this._innerBindings.delete(event.data.resourceState.id);
      }
    });

    this._messageChannel
      .receiveAndSendResponse('get')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._resourceRepository.get(id)?.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('getOrFail')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._resourceRepository.getOrFail(id).state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('find')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._resourceRepository.find().map((p) => p.state));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('add')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[state], sendResponseHook]) => {
          let resource = this._resourceRepository.add(ResourceDeserializer.createResource(state));
          sendResponseHook(resource.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('addAll')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[states], sendResponseHook]) => {
          let resources = states.map((state) => ResourceDeserializer.createResource(state));
          this._resourceRepository.addAll(resources);
          sendResponseHook(resources.map((p) => p.state));
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
  }

  destroy() {
    super.destroy();

    [...this._innerBindings.values()].forEach((binding) => binding.destroy());
    this._innerBindings.clear();
  }
}
