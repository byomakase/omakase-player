/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

import {OmpAudioEffectParamType, OmpAudioRoutingPath} from '../video/model';

export interface OmpAudioEffectsSlot {
  inputNode: AudioNode;
  outputNode: AudioNode;
}

export type OmpAudioEffectGraphSlot = 'source' | 'router' | 'destination';

/**
 * Definition of an audio effect.
 */
export interface OmpAudioEffectDef {
  id: string;

  /**
   * Effect type as used in EffectsRegistry. There are no limitations to effect types
   * but they need to be dynamically added to EffectsRegistry.
   */
  effectType: string;

  /**
   * Arbitrary attributes which can be used to describe audio effect.
   */
  attrs?: Record<string, any>;

  /**
   * Connections to other {@link OmpAudioNodeDef}'s
   */
  connections?: OmpAudioEffectConnectionDef[];

  /**
   * Audio effect params
   */
  audioParams?: OmpAudioEffectParamType[];
}

export interface OmpAudioNodeParamFilter {
  name?: string;
  id?: string;
}
/**
 * Connection definition to {@link OmpAudioEffectDef}
 */
export interface OmpAudioEffectConnectionDef {
  /**
   * {@link OmpAudioNodeDef.id}
   */
  effectId: string;

  /**
   * Input
   */
  output?: number;

  /**
   * Output
   */
  input?: number;
}

/**
 * Audio graph definition. Contains {@link OmpAudioEffectDef}'s
 */
export interface OmpAudioEffectsGraphDef {
  effectDefs: OmpAudioEffectDef[];
  /**
   * Effects graph input effects ids
   */
  sourceEffectIds: string[];

  /**
   * Effects graph output effects ids
   */
  destinationEffectIds: string[];
}

/**
 * Connection definition for audio graph.
 */
export type OmpAudioEffectsGraphConnection =
  | {
      slot: Extract<OmpAudioEffectGraphSlot, 'router'>;
      routingPath?: Partial<OmpAudioRoutingPath>;
    }
  | {slot: Extract<OmpAudioEffectGraphSlot, 'source'>}
  | {slot: Extract<OmpAudioEffectGraphSlot, 'destination'>};
