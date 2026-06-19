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

import {DelayEffect} from './delay-effect';
import {GainEffect} from './gain-effect';
import type {AudioEffect, AudioEffectConnectionDef, AudioEffectParamType, AudioEffectState} from './model';
import type {Destroyable} from '../../common/capabilities';

export class AudioEffectDef implements AudioEffectState {
  public id: string;
  public effectType: string;
  public attrs?: Record<string, any>;
  public connections?: AudioEffectConnectionDef[];
  public audioParams?: AudioEffectParamType[];

  constructor(id: string, effectType: string) {
    this.id = id;
    this.effectType = effectType;
  }

  withAttrs(attrs: Record<string, any>): AudioEffectDef {
    this.attrs = attrs;
    return this;
  }

  outputTo(...effectConnections: (string | AudioEffectConnectionDef)[]): AudioEffectDef {
    if (!this.connections) {
      this.connections = [];
    }

    effectConnections.forEach((effectConnection: string | AudioEffectConnectionDef) => {
      const connection = typeof effectConnection === 'string' ? {effectId: effectConnection} : effectConnection;
      this.connections!.push(connection);
    });
    return this;
  }

  addParam(audioParam: AudioEffectParamType) {
    if (!this.audioParams) {
      this.audioParams = [];
    }

    this.audioParams.push(audioParam);
    return this;
  }
}

export type AudioEffectFactory = (effectDef: AudioEffectState) => AudioEffect;
let _activeRegistry: AudioEffectsRegistry | undefined;

export class AudioEffectsRegistry implements Destroyable {
  static get instance(): AudioEffectsRegistry {
    return _activeRegistry!;
  }

  private registry: Map<string, AudioEffectFactory> = new Map();

  constructor() {
    _activeRegistry = this;
    this.registry.set('gain', (def) => new GainEffect(def));
    this.registry.set('delay', (def) => new DelayEffect(def));
  }

  register(name: string, effect: AudioEffectFactory) {
    this.registry.set(name, effect);
  }

  destroy() {
    this.registry.clear();

    if (_activeRegistry === this) {
      _activeRegistry = void 0;
    }
  }

  get(name: string) {
    return this.registry.get(name);
  }
}
