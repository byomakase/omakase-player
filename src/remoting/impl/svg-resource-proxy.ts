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
import type {ThumbnailState, TrackEvent, TrackState, TrackUpdateableAttrs} from '../../media';
import {Observable} from 'rxjs';
import type {MessageChannel} from '../message-channel';
import type {ThumbnailTrackMessageChannel} from './thumbnail-track-message-channel';
import type {SvgResourceMessageChannel} from './svg-resource-message-channel';
import type {SvgResourceState} from '../../resource';
import type {ResourceEntityState} from '../../entity';

export class SvgResourceProxy extends BaseMessageChannelProxy<SvgResourceMessageChannel> implements SvgResourceMessageChannel {
  constructor(messageChannel: MessageChannel<SvgResourceMessageChannel>) {
    super(messageChannel);
    this._onInitialized$.next(true);
  }

  state(): Observable<ResourceEntityState> {
    return this.messageChannel.sendAndWaitForResponse('state');
  }

  resolveBlobUrl(): Observable<string> {
    return this.messageChannel.sendAndWaitForResponse('resolveBlobUrl');
  }
}
