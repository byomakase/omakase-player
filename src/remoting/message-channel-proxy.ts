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

import type {MessageChannelType} from './message-channel-types';
import {MessageChannel} from './message-channel';
import type {Destroyable} from '../common/capabilities';
import {BehaviorSubject, type Observable} from 'rxjs';

export interface MessageChannelProxy<T extends MessageChannelType> extends Destroyable {
  onInitialized$: Observable<boolean>;

  messageChannel: MessageChannel<T>;
}

export abstract class BaseMessageChannelProxy<T extends MessageChannelType> implements MessageChannelProxy<T> {
  private readonly _messageChannel: MessageChannel<T>;

  protected _onInitialized$: BehaviorSubject<boolean> = new BehaviorSubject(false);

  constructor(messageChannel: MessageChannel<T>) {
    this._messageChannel = messageChannel;
  }

  get messageChannel(): MessageChannel<T> {
    return this._messageChannel;
  }

  get onInitialized$(): Observable<boolean> {
    return this._onInitialized$.asObservable();
  }

  destroy() {
    this._messageChannel?.destroy();
  }
}
