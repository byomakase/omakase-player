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
import type {AudioRoutingPath} from '../audio-router';
import type {AudioEffectGraph} from './audio-effect-graph';

export type AudioEffectGraphSlot = 'source' | 'router' | 'destination';

/**
 * Definition of an audio effect.
 */
export interface AudioEffectState {
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
  connections?: AudioEffectConnectionDef[];

  /**
   * Audio effect params
   */
  audioParams?: AudioEffectParamType[];
}

/**
 * Wrapper for {@link AudioParam} attributes
 */
export interface AudioNodeParamPropType {
  name: string;
  value: any;
}

/**
 * Wrapper for {@link AudioParam}
 */
export interface AudioNodeParamType {
  name: string;
  props: AudioNodeParamPropType[];
}

export interface AudioEffectParamType extends AudioNodeParamType {}

export interface AudioNodeParamFilter {
  name?: string;
  id?: string;
}
/**
 * Connection definition to {@link AudioEffectState}
 */
export interface AudioEffectConnectionDef {
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
 * Audio graph definition. Contains {@link AudioEffectState}'s
 */
export interface AudioEffectGraphState {
  effectDefs: AudioEffectState[];
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
export type AudioEffectGraphConnection =
  | {
      slot: Extract<AudioEffectGraphSlot, 'router'>;
      routingPath?: Partial<AudioRoutingPath>;
    }
  | {slot: Extract<AudioEffectGraphSlot, 'source'>}
  | {slot: Extract<AudioEffectGraphSlot, 'destination'>};

export type AudioEffectGraphSpecificConnection =
  | {
      slot: Extract<AudioEffectGraphSlot, 'router'>;
      routingPath: AudioRoutingPath;
    }
  | {slot: Extract<AudioEffectGraphSlot, 'source'>}
  | {slot: Extract<AudioEffectGraphSlot, 'destination'>};
/**
 * Implementation of {@link AudioEffectState}
 */
export interface AudioEffect {
  /**
   * Converts effect to effect definition
   */
  toState(): AudioEffectState;
  /**
   * Returns input audio nodes
   */
  getInputNodes(): AudioNode[];
  /**
   * Returns output audio nodes
   */
  getOutputNode(): AudioNode;

  /**
   * Returns all audio nodes
   */
  getNodes(): AudioNode[];

  /**
   * Effect's id. Unique at {@link AudioEffectGraph} level.
   */
  id: string;

  /**
   * Effect's effect type. Used for dynamic effect instantiation.
   */
  effectType: string;

  /**
   * Arbitrary values used to describe the effect
   */
  attrs: Map<string, any>;

  /**
   * Signals when effect is fully initialized.
   */
  onReady$: Observable<void>;

  /**
   * Sets effect parameter.
   *
   * @param param
   */
  setParam(param: AudioEffectParam): void;

  /**
   * Returns all effect parameters
   */
  getParams(): AudioEffectParamType[] | undefined;

  /**
   * Destroys all effect's nodes and sets up the effect to be garbage collected
   */
  destroy(): void;
}

export interface RoutedAudioEffect {
  effect: AudioEffect;
  routingPath: AudioRoutingPath;
}

export interface RoutedAudioEffectGraph {
  effectGraph: AudioEffectGraph;
  routingPath: AudioRoutingPath;
}

export interface RoutedAudioEffectGraphState {
  effectGraphState: AudioEffectGraphState;
  routingPath: AudioRoutingPath;
}

/**
 * Wrapper for {@link AudioParam} attributes
 */
export class AudioNodeValueParam implements AudioNodeParamPropType {
  name: string = 'value';
  value: any;

  constructor(value: any) {
    this.value = value;
  }

  setValue(value: any) {
    this.value = value;
  }
}

/**
 * Wrapper for {@link AudioParam}
 */
export class AudioNodeParam implements AudioNodeParamType {
  name: string;
  props: AudioNodeParamPropType[] = [];

  constructor(name: string) {
    this.name = name;
  }

  protected addProp(prop: AudioNodeParamPropType) {
    this.props.push(prop);
  }
}

export class AudioNodeUtil {
  static extractAudioParamProps(audioParam: AudioParam): AudioNodeParamPropType[] {
    return [
      {
        name: 'value',
        value: audioParam.value,
      },
      {
        name: 'automationRate',
        value: audioParam.automationRate,
      },
    ];
  }
}

export class AudioEffectParam extends AudioNodeParam {}

/**
 * Filter values used for filtering {@link AudioEffect}'s
 */
export interface AudioEffectFilter {
  /**
   * {@link AudioEffect.id}
   */
  id?: string | undefined;

  /**
   * {@link AudioEffect.type}
   */
  effectType?: string | undefined;

  /**
   * {@link AudioEffect.attrs}
   */
  attrs?: Record<string, any> | undefined;
}

export class AudioEffectsUtil {
  /**
   * Calculates crossfade gain value for {@link value} and {@link curve}
   *
   * @param value in [0, 1] range
   * @param curve
   */
  static crossfadeGain(value: number, curve: 'linear' | 'equal-power' | 'log' | 'sigmoid' = 'equal-power'): {left: number; right: number} {
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const t = clamp(value);

    let left: number, right: number;

    switch (curve) {
      case 'linear':
        left = 1 - t;
        right = t;
        break;

      case 'equal-power':
        left = Math.cos(t * 0.5 * Math.PI);
        right = Math.sin(t * 0.5 * Math.PI);
        break;

      case 'log':
        left = Math.pow(1 - t, 2);
        right = Math.pow(t, 2);
        break;

      case 'sigmoid':
        const k = 10; // Curve sharpness
        left = 1 / (1 + Math.exp((t - 0.5) * k));
        right = 1 - left;
        break;
    }

    return {
      left: round(left),
      right: round(right),
    };
  }
}
