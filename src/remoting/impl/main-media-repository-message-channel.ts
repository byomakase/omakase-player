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

import {type Observable, takeUntil} from 'rxjs';
import {MainMediaRepository, type MainMediaRepositoryEvent, MainMediaRepositoryEventType} from '../../repository';
import type {MainMedia, MainMediaEvent, MainMediaState} from '../../media';
import {BaseMessageChannelBinding, MessageChannel, type MessageChannelBinding} from '../message-channel';
import {MediaDeserializer} from '../../media/media-deserializer';
import {MainMediaMessageChannelBinding} from './main-media-message-channel';
import type {OmpProvider} from '../../omp-provider';

export interface MainMediaRepositoryMessageChannel {
  /**
   * {@link MainMediaRepository.onEvent$}
   */
  onEvent$: Observable<MainMediaRepositoryEvent>;

  /**
   * {@link MainMediaRepository.onMainMediaEvent$}
   */
  onMainMediaEvent$: Observable<MainMediaEvent>;

  /**
   * {@link MainMediaRepository.get}
   */
  get(id: MainMediaState['id']): Observable<MainMediaState | undefined>;

  /**
   * {@link MainMediaRepository.getOrFail}
   */
  getOrFail(id: MainMediaState['id']): Observable<MainMediaState>;

  getFirstOrFail(): Observable<MainMediaState>;

  /**
   * {@link MainMediaRepository.findFirst}
   */
  findFirst(): Observable<MainMediaState | undefined>;

  /**
   * {@link MainMediaRepository.add}
   */
  add(mainMedia: MainMediaState): Observable<MainMediaState>;

  /**
   * {@link MainMediaRepository.delete}
   */
  delete(id: MainMediaState['id']): Observable<boolean>;

  /**
   * {@link MainMediaRepository.clear}
   */
  clear(): Observable<boolean>;
}

export class MainMediaRepositoryMessageChannelBinding extends BaseMessageChannelBinding {
  protected _mainMediaRepository: MainMediaRepository;
  private _messageChannel: MessageChannel<MainMediaRepositoryMessageChannel>;

  private _innerBindings: Map<string, MessageChannelBinding> = new Map();

  constructor(messageChannel: MessageChannel<MainMediaRepositoryMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._mainMediaRepository = ompProvider.mainMediaRepository;
    this._messageChannel = messageChannel;
  }

  bind() {
    let createMainMediaBinding = (mainMedia: MainMedia) => {
      let binding = new MainMediaMessageChannelBinding(this._messageChannel.managedBroadcastChannel, mainMedia, this._ompProvider);
      binding.bind();
      this._innerBindings.set(mainMedia.id, binding);
    };

    this._mainMediaRepository.find().forEach((mainMedia) => createMainMediaBinding(mainMedia));

    this._mainMediaRepository.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onEvent$', event);

      if (event.type === MainMediaRepositoryEventType.MAIN_MEDIA_ADDED) {
        createMainMediaBinding(this._mainMediaRepository.getOrFail(event.data.mainMediaState.id));
      } else if (event.type === MainMediaRepositoryEventType.MAIN_MEDIA_DELETED) {
        this._innerBindings.get(event.data.mainMediaState.id)?.destroy();
        this._innerBindings.delete(event.data.mainMediaState.id);
      }
    });
    this._mainMediaRepository.onMainMediaEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onMainMediaEvent$', event);
    });
    this._messageChannel
      .receiveAndSendResponse('get')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._mainMediaRepository.get(id)?.state);
        },
      });
    this._messageChannel
      .receiveAndSendResponse('getOrFail')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._mainMediaRepository.getOrFail(id)?.state);
        },
      });
    this._messageChannel
      .receiveAndSendResponse('getFirstOrFail')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._mainMediaRepository.getFirstOrFail().state);
        },
      });
    this._messageChannel
      .receiveAndSendResponse('findFirst')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._mainMediaRepository.findFirst()?.state);
        },
      });
    this._messageChannel
      .receiveAndSendResponse('add')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[mainMediaState], sendResponseHook]) => {
          let mainMedia = MediaDeserializer.createMainMedia(mainMediaState);
          this._mainMediaRepository.add(mainMedia);
          sendResponseHook(this._mainMediaRepository.getOrFail(mainMedia.id).state);
        },
      });
    this._messageChannel
      .receiveAndSendResponse('delete')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._mainMediaRepository.delete(id));
        },
      });
    this._messageChannel
      .receiveAndSendResponse('clear')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._mainMediaRepository.clear());
        },
      });
  }

  destroy() {
    super.destroy();

    [...this._innerBindings.values()].forEach((binding) => binding.destroy());
    this._innerBindings.clear();
  }
}
