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
import type {AudioEffectEvent, AudioEffectsApi} from '../../audio/audio-effects/audio-effects-api';
import type {AudioEffectsMessageChannel} from './audio-effects-message-channel';
import type {AudioEffectFilter, AudioEffectGraphConnection, AudioEffectGraphSpecificConnection, AudioEffectGraphState, AudioEffectParam, AudioEffectState} from '../../audio/audio-effects/model';
import {BaseMessageChannelProxy} from '../message-channel-proxy';

export class AudioEffectsProxy extends BaseMessageChannelProxy<AudioEffectsMessageChannel> implements AudioEffectsApi {
  protected _destroyBreaker = new ObserverBreaker();

  constructor(messageChannel: MessageChannel<AudioEffectsMessageChannel>) {
    super(messageChannel);
  }

  get onEvent$(): Observable<AudioEffectEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  setEffectGraph(effectGraphState: AudioEffectGraphState, effectGraphConnection: AudioEffectGraphConnection): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setEffectGraph', [effectGraphState, effectGraphConnection]);
  }
  removeEffectGraph(effectGraphConnection: AudioEffectGraphConnection): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeEffectGraph', [effectGraphConnection]);
  }
  setEffectsParams(param: AudioEffectParam, effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setEffectsParams', [param, effectGraphConnection, filter]);
  }
  getEffectStates(effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<AudioEffectState[]> {
    return this.messageChannel.sendAndWaitForResponse('getEffectStates', [effectGraphConnection, filter]);
  }
  getEffectGraphState(effectGraphConnection: AudioEffectGraphSpecificConnection): Observable<AudioEffectGraphState | undefined> {
    return this.messageChannel.sendAndWaitForResponse('getEffectGraphState', [effectGraphConnection]);
  }

  destroy(): void {
    super.destroy();
    this._destroyBreaker.destroy();
  }
}
