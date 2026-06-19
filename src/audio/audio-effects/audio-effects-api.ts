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
import type {AudioEffectFilter, AudioEffectGraphConnection, AudioEffectGraphSlot, AudioEffectGraphSpecificConnection, AudioEffectGraphState, AudioEffectParam, AudioEffectState} from './model';
import type {Serializable} from '../../common/capabilities';
import type {AudioRoutingPath} from '../audio-router';

export enum AudioEffectEventType {
  AUDIO_EFFECT_PARAMETER_CHANGE = 'AUDIO_EFFECT_PARAMETER_CHANGE',
  AUDIO_EFFECT_GRAPH_ADDED = 'AUDIO_EFFECT_GRAPH_ADDED',
  AUDIO_EFFECT_GRAPH_REMOVED = 'AUDIO_EFFECT_GRAPH_REMOVED',
}

export interface AudioEffectParameterChange {
  effectId: string;
  parameterName: string;
  routingPath?: AudioRoutingPath;
}
export interface AudioEffectEventParametersChangeData extends Serializable {
  connection: AudioEffectGraphConnection;
  changedParameters: AudioEffectParameterChange[];
}

export interface AudioEffectSlotEventChangeData extends Serializable {
  connection: AudioEffectGraphConnection;
}

export type AudioEffectEventTypeDataMap = {
  [AudioEffectEventType.AUDIO_EFFECT_PARAMETER_CHANGE]: AudioEffectEventParametersChangeData;
  [AudioEffectEventType.AUDIO_EFFECT_GRAPH_ADDED]: AudioEffectSlotEventChangeData;
  [AudioEffectEventType.AUDIO_EFFECT_GRAPH_REMOVED]: AudioEffectSlotEventChangeData;
};

export type AudioEffectEvent = {
  [K in AudioEffectEventType]: {
    type: K;
    data: AudioEffectEventTypeDataMap[K];
  };
}[keyof AudioEffectEventTypeDataMap];

export interface AudioEffectsApi {
  setEffectGraph(effectGraphState: AudioEffectGraphState, effectGraphConnection: AudioEffectGraphConnection): Observable<void>;
  removeEffectGraph(effectGraphConnection: AudioEffectGraphConnection): Observable<void>;
  setEffectsParams(param: AudioEffectParam, effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<void>;
  getEffectStates(effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<AudioEffectState[]>;
  getEffectGraphState(effectGraphConnection: AudioEffectGraphSpecificConnection): Observable<AudioEffectGraphState | undefined>;
  onEvent$: Observable<AudioEffectEvent>;
}
