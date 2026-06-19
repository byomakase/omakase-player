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

import {concatMap, map, type Observable, observeOn, type OperatorFunction, queueScheduler, Subject, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import {MessageChannel} from '../message-channel';
import type {TextTrackHandlerApi, TextTrackHandlerEvent, TextTrackHandlerState} from '../../text';
import type {TextTrackHandlerMessageChannel} from './text-track-handler-message-channel';
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import {freeObserver} from '../../util/rxjs-util';
import type {PlayerTextHandlerType} from '../../player';

export class TextTrackHandlerProxy extends BaseMessageChannelProxy<TextTrackHandlerMessageChannel> implements TextTrackHandlerApi {
  private _state?: TextTrackHandlerState;

  private readonly _onEventQueue$ = new Subject<TextTrackHandlerEvent>();

  protected _destroyBreaker = new ObserverBreaker();

  constructor(messageChannel: MessageChannel<TextTrackHandlerMessageChannel>, state: TextTrackHandlerState) {
    super(messageChannel);

    this.updateFromState(state);
    this._onInitialized$.next(true);

    this.messageChannel
      .listen('onEvent$')
      .pipe(this.syncStateOperator())
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this._onEventQueue$.next(event);
      });
  }

  private syncStateOperator<T>(): OperatorFunction<T, T> {
    return concatMap((arg) =>
      this.messageChannel
        .sendAndWaitForResponse('state')
        .pipe(takeUntil(this._destroyBreaker.observer))
        .pipe(
          map((state) => {
            this.updateFromState(state);
            return arg;
          })
        )
    );
  }

  updateFromState(textTrackHandlerState: TextTrackHandlerState) {
    this._state = textTrackHandlerState;
  }

  private checkLateInitialization() {
    if (!this._state) {
      throw new Error('Late to initialize playerTextTrackState');
    }
  }

  get onEvent$(): Observable<TextTrackHandlerEvent> {
    return this._onEventQueue$.pipe(observeOn(queueScheduler), takeUntil(this._destroyBreaker.observer));
  }

  get state(): TextTrackHandlerState {
    this.checkLateInitialization();
    return this._state!;
  }

  get active(): boolean {
    return this.state.active;
  }

  get shown(): boolean {
    return this.state.shown;
  }

  get handlerType(): PlayerTextHandlerType {
    return this.state.handlerType;
  }

  hide(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('hide').pipe(this.syncStateOperator());
  }

  show(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('show').pipe(this.syncStateOperator());
  }

  switch(active: boolean): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('switch', [active]).pipe(this.syncStateOperator());
  }

  toggleShowHide(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('toggleShowHide').pipe(this.syncStateOperator());
  }

  destroy() {
    super.destroy();
    freeObserver(this._onEventQueue$);
    this._destroyBreaker.destroy();
  }
}
