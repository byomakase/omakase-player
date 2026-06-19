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
import type {OmakaseTrackApiMessageChannel} from './omakase-track-api-message-channel';
import type {Track, TrackState} from '../../media';
import type {Observable} from 'rxjs';
import type {SourceState} from '../../source';
import type {RemoteNode} from '../remote-node';
import type {TrackLoadOptions} from "../../track";

export class OmakaseTrackApiProxy extends BaseMessageChannelProxy<OmakaseTrackApiMessageChannel> implements OmakaseTrackApiMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('OmakaseTrackApi'));
    this._onInitialized$.next(true);
  }

  add(track: TrackState): Observable<TrackState> {
    return this.messageChannel.sendAndWaitForResponse('add', [track]);
  }

  delete(id: Track['id']): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('delete', [id]);
  }

  find(): Observable<TrackState[]> {
    return this.messageChannel.sendAndWaitForResponse('find');
  }

  get(id: TrackState['id']): Observable<TrackState | undefined> {
    return this.messageChannel.sendAndWaitForResponse('get', [id]);
  }

  load(sourceOrUrl: SourceState | string, loadOptions?: TrackLoadOptions | undefined): Observable<TrackState> {
    return this.messageChannel.sendAndWaitForResponse('load', [sourceOrUrl, loadOptions]);
  }
}
