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

import {Observable} from 'rxjs';
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import type {ElementStyleName, StyledElement, StyleRule, UiElement, UiEvent} from '../../ui';
import type {UiMessageChannel} from './ui-message-channel';
import type {RemoteNode} from '../remote-node';

export class UiProxy extends BaseMessageChannelProxy<UiMessageChannel> implements UiMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('Ui'));
    this._onInitialized$.next(true);
  }

  get onEvent$(): Observable<UiEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  get elements(): Observable<UiElement[]> {
    return this.messageChannel.sendAndWaitForResponse('elements');
  }

  get styleRules(): Observable<StyleRule<any>[]> {
    return this.messageChannel.sendAndWaitForResponse('styleRules');
  }

  resolveStyle<S>(element: StyledElement<S>): Observable<Partial<S>> {
    return this.messageChannel.sendAndWaitForResponse('resolveStyle', [element]);
  }

  resolveStyleClass<T extends ElementStyleName>(name: T): Observable<string> {
    return this.messageChannel.sendAndWaitForResponse('resolveStyleClass', [name]);
  }

  updateStyleRule(rule: StyleRule<any>): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('updateStyleRule', [rule]);
  }

  updateElement(element: UiElement): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('updateElement', [element]);
  }
}
