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

import type {AudioEffectsApi, AudioHandlerApi, AudioHandlerEvent, AudioHandlerState} from '../../audio';
import {concatMap, map, type Observable, observeOn, type OperatorFunction, queueScheduler, Subject, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import {MessageChannel} from '../message-channel';
import {UnsupportedMethodInDetachedError} from '../../types';
import type {AudioHandlerMessageChannel} from './audio-handler-message-channel';
import {type AudioPeakProcessorEvent, AudioPeakProcessorMeterStandard} from '../../audio/audio-peak-processor';
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import {AudioEffectsProxy} from './audio-effects-proxy';
import {AudioEffectsMessageChannelUtil} from './audio-effects-message-channel';
import {AudioRouterProxy} from './audio-router-proxy';
import {AudioRouterMessageChannelUtil} from './audio-router-message-channel';
import type {RemoteNode} from '../remote-node';
import type {AudioRouterApi} from '../../audio/audio-router';
import {freeObserver} from '../../util/rxjs-util';

export class AudioHandlerProxy extends BaseMessageChannelProxy<AudioHandlerMessageChannel> implements AudioHandlerApi {
  protected _remoteNode: RemoteNode;

  private _state?: AudioHandlerState;

  protected _audioEffects: AudioEffectsProxy;
  protected _audioRouter: AudioRouterProxy | undefined;

  private readonly _onEventQueue$ = new Subject<AudioHandlerEvent>();

  protected _destroyBreaker = new ObserverBreaker();

  constructor(messageChannel: MessageChannel<AudioHandlerMessageChannel>, remoteNode: RemoteNode, state: AudioHandlerState) {
    super(messageChannel);
    this._remoteNode = remoteNode;
    this._audioEffects = remoteNode.getOrCreateProxy('AudioEffects', AudioEffectsMessageChannelUtil.formatMessageChannelTopic(this.messageChannel));

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

  get router() {
    return this._audioRouter;
  }

  get effects(): AudioEffectsApi {
    return this._audioEffects;
  }

  private checkLateInitialization() {
    if (!this._state) {
      throw new Error('Late to initialize playerAudioState');
    }
  }

  updateFromState(state: AudioHandlerState) {
    this._state = state;
    if (this._state?.router) {
      this._audioRouter = this._remoteNode.getOrCreateProxy('AudioRouter', AudioRouterMessageChannelUtil.formatMessageChannelTopic(this.messageChannel), this._state.router);
      this._audioRouter.updateFromState(this._state.router);
    }
  }

  get inputAudioNode(): AudioNode {
    throw new UnsupportedMethodInDetachedError();
  }

  get outputAudioNode(): AudioNode {
    throw new UnsupportedMethodInDetachedError();
  }

  get onEvent$(): Observable<AudioHandlerEvent> {
    return this._onEventQueue$.pipe(observeOn(queueScheduler), takeUntil(this._destroyBreaker.observer));
  }

  get onPeakProcessorEvent$(): Observable<AudioPeakProcessorEvent> {
    return this.messageChannel.listen('onPeakProcessorEvent$');
  }

  get enabled(): boolean {
    return this.state.enabled;
  }

  get channelCount(): number {
    return this.state.channelCount;
  }

  get muted(): boolean {
    return this.state.muted;
  }

  get volume(): number {
    return this.state.volume;
  }

  get state(): AudioHandlerState {
    this.checkLateInitialization();
    return this._state!;
  }

  mute(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('mute').pipe(this.syncStateOperator());
  }

  setEnabled(enabled: boolean): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setEnabled', [enabled]).pipe(this.syncStateOperator());
  }

  setMuted(muted: boolean): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setMuted', [muted]).pipe(this.syncStateOperator());
  }

  setVolume(volume: number): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setVolume', [volume]).pipe(this.syncStateOperator());
  }

  toggleMuted(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('toggleMuted').pipe(this.syncStateOperator());
  }

  unmute(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('unmute').pipe(this.syncStateOperator());
  }

  createPeakProcessor(meterStandard?: AudioPeakProcessorMeterStandard): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('createPeakProcessor', [meterStandard]).pipe(this.syncStateOperator());
  }

  createAudioRouter(inputsNumber?: number, outputsNumber?: number): Observable<AudioRouterApi> {
    return this.messageChannel
      .sendAndWaitForResponse('createAudioRouter', [inputsNumber, outputsNumber])
      .pipe(
        map(() => {
          return this._audioRouter!;
        })
      )
      .pipe(this.syncStateOperator());
  }

  destroy(): void {
    super.destroy();
    freeObserver(this._onEventQueue$);
    this._destroyBreaker.destroy();

    this._audioRouter?.destroy();
    this._audioEffects.destroy();
  }
}
