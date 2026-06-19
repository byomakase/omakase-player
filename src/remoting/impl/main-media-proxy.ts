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
import type {MainMediaState, MainMediaUpdateableAttrs, TrackState} from '../../media';
import {Observable} from 'rxjs';
import type {MainMediaMessageChannel} from './main-media-message-channel';
import type {MessageChannel} from '../message-channel';

export class MainMediaProxy extends BaseMessageChannelProxy<MainMediaMessageChannel> implements MainMediaMessageChannel {
  constructor(messageChannel: MessageChannel<MainMediaMessageChannel>) {
    super(messageChannel);
    this._onInitialized$.next(true);
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

  addTrack(trackState: TrackState): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('addTrack', [trackState]);
  }

  addTracks(trackStates: TrackState[]): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('addTracks', [trackStates]);
  }

  updateAttributes(attrs: MainMediaUpdateableAttrs): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('updateAttributes', [attrs]);
  }

  state(): Observable<MainMediaState> {
    return this.messageChannel.sendAndWaitForResponse('state');
  }
}
