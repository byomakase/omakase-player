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

import {map, type Observable, takeUntil} from 'rxjs';
import {type TrackMessageChannel, TrackMessageChannelBinding} from './track-message-channel';
import type {ManagedBroadcastChannel} from '../message-channel';
import type {ThumbnailState, ThumbnailTrack} from '../../media';
import type {OmpProvider} from '../../omp-provider';
import {type ResourceEntityMessageChannel, ResourceEntityMessageChannelBinding} from './resource-entity-message-channel';
import type {SvgResource, SvgResourceState} from '../../resource';

export interface SvgResourceMessageChannel extends ResourceEntityMessageChannel {
  resolveBlobUrl(): Observable<string>;
}

export class SvgResourceMessageChannelBinding extends ResourceEntityMessageChannelBinding<SvgResourceMessageChannel, SvgResource> {
  constructor(managedBroadcastChannel: ManagedBroadcastChannel, resource: SvgResource, ompProvider: OmpProvider) {
    super(managedBroadcastChannel, resource, ompProvider);
  }

  override bind() {
    super.bind();

    this._messageChannel
      .receiveAndSendResponse('resolveBlobUrl')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([, sendResponseHook]) => {
          sendResponseHook(this._resource.resolveBlobUrl());
        },
      });
  }
}
