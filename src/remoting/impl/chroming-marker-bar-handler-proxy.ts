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

import {type Observable} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import {MessageChannel} from '../message-channel';
import type {AudioHandlerMessageChannel} from './audio-handler-message-channel';
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import {AudioRouterProxy} from './audio-router-proxy';
import type {RemoteNode} from '../remote-node';
import type {ChromingMarkerBarHandlerMessageChannel} from './chroming-marker-bar-handler-message-channel';
import type {ChromingMarkerBarHandlerApi, ChromingMarkerBarEvent, ChromingMarkerBarState} from '../../chroming/chroming-marker-bar';
import type {MarkerTrack} from '../../media/marker-track';
import {nextCompleteObserver, passiveObservable} from '../../util/rxjs-util';

export class ChromingMarkerBarHandlerProxy extends BaseMessageChannelProxy<ChromingMarkerBarHandlerMessageChannel> implements ChromingMarkerBarHandlerApi {
  protected _remoteNode: RemoteNode;

  private _chromingMarkerTrackHandlerState?: ChromingMarkerBarState;

  protected _destroyBreaker = new ObserverBreaker();

  constructor(messageChannel: MessageChannel<AudioHandlerMessageChannel>, remoteNode: RemoteNode, state: ChromingMarkerBarState) {
    super(messageChannel);

    this._remoteNode = remoteNode;

    this.updateFromState(state);
    this._onInitialized$.next(true);
  }

  protected _router: AudioRouterProxy | undefined;

  get router() {
    return this._router;
  }

  updateFromState(markerTrackHandlerState: ChromingMarkerBarState) {
    this._chromingMarkerTrackHandlerState = markerTrackHandlerState;
  }

  private checkLateInitialization() {
    if (!this._chromingMarkerTrackHandlerState) {
      throw new Error('Late to initialize chromingMarkerTrackHandlerState');
    }
  }

  get onEvent$(): Observable<ChromingMarkerBarEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  get state(): ChromingMarkerBarState {
    this.checkLateInitialization();
    return this._chromingMarkerTrackHandlerState!;
  }

  get id(): string {
    return this.state.id;
  }

  setVisibility(visible: boolean): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setVisibility', [visible]);
  }

  getTrackIds() {
    return [...this.state.tracks];
  }

  addTrack(track: MarkerTrack | MarkerTrack['id']): Observable<void> {
    const trackId = typeof track === 'string' ? track : track.id;
    return this.messageChannel.sendAndWaitForResponse('addTrack', [trackId]);
  }

  removeTrack(trackId: string): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeTrack', [trackId]);
  }

  restoreState(state: ChromingMarkerBarState): Observable<void> {
    return passiveObservable((observer) => {
      this.updateFromState(state);
      nextCompleteObserver(observer);
    });
  }

  destroy(): void {
    super.destroy();
    this._destroyBreaker.destroy();
  }
}
