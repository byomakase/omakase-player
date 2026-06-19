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
import type {TrackEvent, TrackState, TrackUpdateableAttrs} from '../../media';
import {Observable} from 'rxjs';
import {type TrackMessageChannel} from './track-message-channel';
import type {MessageChannel} from '../message-channel';

export class TrackProxy extends BaseMessageChannelProxy<TrackMessageChannel> implements TrackMessageChannel {
  constructor(messageChannel: MessageChannel<TrackMessageChannel>) {
    super(messageChannel);
    this._onInitialized$.next(true);
  }

  get onEvent$(): Observable<TrackEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  loadStart(): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('loadStart');
  }

  loadSuccess(): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('loadSuccess');
  }

  loadError(error: string | undefined): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('loadError', [error]);
  }

  updateAttrs(attrs: TrackUpdateableAttrs): Observable<TrackState> {
    return this.messageChannel.sendAndWaitForResponse('updateAttrs', [attrs]);
  }
}
