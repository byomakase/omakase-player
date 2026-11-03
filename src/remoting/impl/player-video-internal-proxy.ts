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

import {concatMap, map, Observable, observeOn, type OperatorFunction, queueScheduler, Subject, takeUntil} from 'rxjs';
import type {Destroyable} from '../../common/capabilities';
import {ObserverBreaker} from '../../common/observer-breaker';
import {TrackRepository} from '../../repository';
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import type {PlayerVideoInternalMessageChannel} from './player-video-internal-message-channel';
import type {PlayerVideoEvent, PlayerVideoInternalApi, PlayerVideoState} from '../../player';
import type {MediaContainerTrackState, TrackState} from '../../media';
import type {RemoteNode} from '../remote-node';
import {freeObserver} from '../../util/rxjs-util';
import type {OmpProvider} from '../../omp-provider';

export class PlayerVideoInternalProxy extends BaseMessageChannelProxy<PlayerVideoInternalMessageChannel> implements PlayerVideoInternalApi, Destroyable {
  private readonly _trackRepository: TrackRepository;

  private _state?: PlayerVideoState;

  private readonly _onEventQueue$ = new Subject<PlayerVideoEvent>();

  private _destroyBreaker = new ObserverBreaker();

  constructor(remoteNode: RemoteNode, ompProvider: OmpProvider) {
    super(remoteNode.getRemoteChannelOrFail('PlayerVideoInternal'));

    this._trackRepository = ompProvider.trackRepository;

    this.messageChannel
      .listen('onEvent$')
      .pipe(this.syncStateOperator())
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this._onEventQueue$.next(event);
      });

    this.initialize();
  }

  private syncStateOperator<T>(): OperatorFunction<T, T> {
    return concatMap((arg) =>
      this.messageChannel
        .sendAndWaitForResponse('state')
        .pipe(takeUntil(this._destroyBreaker.observer))
        .pipe(
          map((state) => {
            this._state = state;
            return arg;
          })
        )
    );
  }

  protected initialize() {
    this.messageChannel
      .sendAndWaitForResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((state) => {
        this._state = state;
        this._onInitialized$.next(true);
      });
  }

  get onEvent$(): Observable<PlayerVideoEvent> {
    return this._onEventQueue$.pipe(observeOn(queueScheduler), takeUntil(this._destroyBreaker.observer));
  }

  get state(): PlayerVideoState {
    if (!this._state) {
      throw new Error('Late to initialize playerVideoState');
    }
    return this._state;
  }

  getTracks(): MediaContainerTrackState[] {
    return this.state.tracks.map((p) => this._trackRepository.getOrFail(p.trackId).state as MediaContainerTrackState);
  }

  switchTrack(trackId: TrackState['id'], activate?: boolean): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('switchTrack', [trackId, activate]).pipe(this.syncStateOperator());
  }

  destroy(): void {
    super.destroy();
    freeObserver(this._onEventQueue$);
    this._destroyBreaker.destroy();
  }
}
