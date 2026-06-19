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

import type {Observable} from 'rxjs';
import {takeUntil} from 'rxjs';
import type {ElementStyleName, StyledElement, StyleRule, UiElement, UiEvent} from '../../ui';
import {Ui} from '../../ui';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {OmpProvider} from '../../omp-provider';

export interface UiMessageChannel {
  onEvent$: Observable<UiEvent>;

  elements: Observable<UiElement[]>;

  styleRules: Observable<StyleRule<any>[]>;

  resolveStyle<S>(element: StyledElement<S>): Observable<Partial<S>>;

  resolveStyleClass<T extends ElementStyleName>(name: T): Observable<string>;

  updateStyleRule(rule: StyleRule<any>): Observable<void>;

  updateElement(element: UiElement): Observable<void>;
}

export class UiMessageChannelBinding extends BaseMessageChannelBinding {
  private _ui: Ui;

  private _messageChannel: MessageChannel<UiMessageChannel>;

  constructor(messageChannel: MessageChannel<UiMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._ui = ompProvider.ui;
    this._messageChannel = messageChannel;
  }

  bind() {
    this._ui.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        this._messageChannel.send('onEvent$', event);
      },
    });

    this._messageChannel
      .receiveAndSendResponse('elements')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([_request, sendResponseHook]) => {
          sendResponseHook(this._ui.elements);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('styleRules')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([_request, sendResponseHook]) => {
          sendResponseHook(this._ui.styleRules);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('resolveStyle')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[element], sendResponseHook]) => {
          sendResponseHook(this._ui.resolveStyle(element));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('resolveStyleClass')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[name], sendResponseHook]) => {
          sendResponseHook(this._ui.resolveStyleClass(name));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('updateStyleRule')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[rule], sendResponseHook]) => {
          this._ui.updateStyleRule(rule);
          sendResponseHook();
        },
      });

    this._messageChannel
      .receiveAndSendResponse('updateElement')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[element], sendResponseHook]) => {
          this._ui.updateElement(element);
          sendResponseHook();
        },
      });
  }
}