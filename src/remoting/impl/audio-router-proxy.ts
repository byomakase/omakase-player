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

import {concatMap, map, type Observable, type OperatorFunction, Subject, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import {MessageChannel} from '../message-channel';
import type {AudioRouterApi, AudioRouterEvent, AudioRouterState, AudioRoutingConnection, AudioRoutingInputPath} from '../../audio/audio-router';
import type {AudioRouterMessageChannel} from './audio-router-message-channel';
import {BaseMessageChannelProxy} from '../message-channel-proxy';

export class AudioRouterProxy extends BaseMessageChannelProxy<AudioRouterMessageChannel> implements AudioRouterApi {
  protected _destroyBreaker = new ObserverBreaker();
  protected _routerState?: AudioRouterState;
  protected _audioRouterEventEmmiter$ = new Subject<AudioRouterEvent>();

  constructor(messageChannel: MessageChannel<AudioRouterMessageChannel>) {
    super(messageChannel);
    this.tryLateInitialization();
    this.messageChannel
      .listen('onEvent$')
      .pipe(this.syncStateOperator())
      .subscribe((event) => {
        this._audioRouterEventEmmiter$.next(event);
      });
  }
  get onEvent$(): Observable<AudioRouterEvent> {
    return this._audioRouterEventEmmiter$.asObservable();
  }
  get state(): AudioRouterState {
    this.checkLateInitialization();
    return this._routerState!;
  }
  getDefaultRoutingConnections(): AudioRoutingConnection[] {
    return this.state.initialRoutingConnections;
  }
  setDefaultRoutingConnections(connections: AudioRoutingConnection[]): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setDefaultRoutingConnections', [connections]);
  }
  toggleSolo(routingPath: AudioRoutingInputPath): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('toggleSolo', [routingPath]);
  }
  toggleMute(routingPath: AudioRoutingInputPath): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('toggleMute', [routingPath]);
  }
  resetRouter(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('resetRouter');
  }
  updateConnections(connections: AudioRoutingConnection[]): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('updateConnections', [connections]);
  }

  private checkLateInitialization() {
    if (!this._routerState) {
      throw new Error('Late to initialize router state');
    }
  }

  updateFromState(routerState: AudioRouterState) {
    this._routerState = routerState;
  }

  protected tryLateInitialization() {
    this.messageChannel
      .sendAndWaitForResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (audioRouterState) => {
          this.updateFromState(audioRouterState);
        },
        error: (error: Error) => {
          console.error('Late initialization failed', error);
        },
      });
  }

  private syncStateOperator<T>(): OperatorFunction<T, T> {
    return concatMap((arg) =>
      this.messageChannel.sendAndWaitForResponse('state').pipe(
        map((state) => {
          this.updateFromState(state);
          return arg;
        })
      )
    );
  }
}
