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

import {OmpAudioEffectConnectionDef, OmpAudioEffectDef, OmpAudioEffectGraphSlot, OmpAudioEffectsGraphDef} from './model';
import {OmpAudioNodeParam, OmpAudioNodeUtil, OmpAudioNodeValueParam} from './omp-web-audio';
import {OmpError} from '../types';
import {isNonNullable} from '../util/function-util';
import {OmpAudioEffectParamType} from '../video/model';
import {hasProperty} from '../util/object-util';
import {combineLatest, map, mapTo, Observable, ReplaySubject, take, tap} from 'rxjs';

/**
 * Implementation of {@link OmpAudioEffectDef}
 */
export interface OmpAudioEffect {
  /**
   * Converts effect to effect definition
   */
  toDef(): OmpAudioEffectDef;
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
   * Effect's id. Unique at {@link OmpAudioEffectsGraph} level.
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
  setParam(param: OmpAudioEffectParam): void;

  /**
   * Returns all effect parameters
   */
  getParams(): OmpAudioEffectParamType[] | undefined;

  /**
   * Destroys all effect's nodes and sets up the effect to be garbage collected
   */
  destroy(): void;
}

export class DefaultOmpAudioEffectDef implements OmpAudioEffectDef {
  public id: string;
  public effectType: string;
  public attrs?: Record<string, any>;
  public connections?: OmpAudioEffectConnectionDef[];
  public audioParams?: OmpAudioEffectParamType[];

  constructor(id: string, effectType: string) {
    this.id = id;
    this.effectType = effectType;
  }

  withAttrs(attrs: Record<string, any>): DefaultOmpAudioEffectDef {
    this.attrs = attrs;
    return this;
  }

  outputTo(...effectConnections: (string | OmpAudioEffectConnectionDef)[]): DefaultOmpAudioEffectDef {
    if (!this.connections) {
      this.connections = [];
    }

    effectConnections.forEach((effectConnection: string | OmpAudioEffectConnectionDef) => {
      const connection = typeof effectConnection === 'string' ? {effectId: effectConnection} : effectConnection;
      this.connections!.push(connection);
    });
    return this;
  }

  addParam(audioParam: OmpAudioEffectParamType) {
    if (!this.audioParams) {
      this.audioParams = [];
    }

    this.audioParams.push(audioParam);
    return this;
  }
}
export class OmpAudioEffectsGraphDefBuilder {
  protected _effectDefs: OmpAudioEffectDef[] = [];
  protected _effectDefsMap: Map<string, OmpAudioEffectDef> = new Map();

  protected _sourceEffectDefs?: OmpAudioEffectDef[];
  protected _destinationEffectDefs?: OmpAudioEffectDef[];

  private constructor() {}

  public static instance(): OmpAudioEffectsGraphDefBuilder {
    return new OmpAudioEffectsGraphDefBuilder();
  }

  addEffects(effectDefs: OmpAudioEffectDef[]): this {
    effectDefs.forEach((effectDef) => {
      this.addEffect(effectDef);
    });
    return this;
  }

  addEffect(node: OmpAudioEffectDef): this {
    if (this._effectDefsMap.has(node.id)) {
      throw new OmpError(`Node with id "${node.id}" already exists.`);
    }

    this._effectDefs.push(node);
    this._effectDefsMap.set(node.id, node);

    return this;
  }

  connections(connections: [{from: string; to: string}]): this {
    connections.forEach((connection) => {
      this.connect(connection.from, connection.to);
    });
    return this;
  }

  connect(sourceNodeId: string, destinationNodeId: string): this {
    let sourceNode = this._effectDefsMap.get(sourceNodeId);
    let destinationNode = this._effectDefsMap.get(destinationNodeId);

    if (!sourceNode || !destinationNode) {
      throw new OmpError('Source node or destination node does not exist.');
    }

    if (!sourceNode.connections) {
      sourceNode.connections = [];
    }

    sourceNode.connections.push({
      effectId: destinationNodeId,
    });

    return this;
  }

  sourceEffectsIds(ids: string[]): this {
    this._sourceEffectDefs = ids.map((id) => {
      if (this._effectDefsMap.has(id)) {
        return this._effectDefsMap.get(id)!;
      } else {
        throw new OmpError(`Source node "${id}" not found.`);
      }
    });
    return this;
  }

  destinationEffectsIds(ids: string[]): this {
    this._destinationEffectDefs = ids.map((id) => {
      if (this._effectDefsMap.has(id)) {
        return this._effectDefsMap.get(id)!;
      } else {
        throw new OmpError(`Destination node "${id}" not found.`);
      }
    });
    return this;
  }

  build(): OmpAudioEffectsGraphDef {
    if (this._effectDefs.length === 0) {
      throw new OmpError('Cannot build graph with no nodes.');
    }

    if (this._effectDefs.length === 1) {
      this._sourceEffectDefs = this._effectDefs;
    }

    // try to resolve source and destination nodes if they're not set

    // nodes that are not connected to anything are source nodes candidates
    let nodeIdsInConnections = this._effectDefs
      .flatMap((node) => node.connections)
      .map((connection) => connection?.effectId)
      .filter(isNonNullable);
    let sourceNodesCandidates = this._effectDefs.filter((node) => !nodeIdsInConnections.find((p) => p === node.id));

    if (this._sourceEffectDefs && this._sourceEffectDefs.length > 0) {
      let hangingNodes = sourceNodesCandidates.filter((candidate) => !this._sourceEffectDefs!.find((p) => p.id === candidate.id));
      if (hangingNodes.length > 0) {
        console.warn(
          'Hanging source node candidates found, is this intentional?',
          hangingNodes.map((p) => p.id)
        );
      }
    } else {
      this._sourceEffectDefs = sourceNodesCandidates;
    }

    // nodes without connections are destination nodes candidates
    let destinationNodesCandidates = this._effectDefs.filter((node) => !node.connections || node.connections.length < 1);
    if (this._destinationEffectDefs && this._destinationEffectDefs.length > 0) {
      let hangingNodes = destinationNodesCandidates.filter((candidate) => !this._destinationEffectDefs!.find((p) => p.id === candidate.id));
      if (hangingNodes.length > 0) {
        console.warn(
          'Hanging destination node candidates found, is this intentional?',
          hangingNodes.map((p) => p.id)
        );
      }
    } else {
      this._destinationEffectDefs = destinationNodesCandidates;
    }

    if (!this._sourceEffectDefs || this._sourceEffectDefs.length < 1) {
      throw new OmpError('Source nodes must be defined.');
    }

    if (!this._destinationEffectDefs || this._destinationEffectDefs.length < 1) {
      throw new OmpError('Destination nodes must be defined.');
    }

    return {
      effectDefs: this._effectDefs,
      sourceEffectIds: this._sourceEffectDefs.map((p) => p.id),
      destinationEffectIds: this._destinationEffectDefs.map((p) => p.id),
    };
  }
}

/**
 * Audio effects graph definition. Contains {@link OmpAudioEffectDef}'s
 */
export class DefaultOmpAudioEffectsGraphDef implements OmpAudioEffectsGraphDef {
  effectDefs: OmpAudioEffectDef[];
  sourceEffectIds: string[];
  destinationEffectIds: string[];

  private constructor(effectDefs: OmpAudioEffectDef[]) {
    let audioGraphDef = OmpAudioEffectsGraphDefBuilder.instance().addEffects(effectDefs).build();
    this.effectDefs = audioGraphDef.effectDefs as OmpAudioEffectDef[];
    this.sourceEffectIds = audioGraphDef.sourceEffectIds;
    this.destinationEffectIds = audioGraphDef.destinationEffectIds;
  }

  public static create(...effects: OmpAudioEffectDef[]): DefaultOmpAudioEffectsGraphDef {
    return new DefaultOmpAudioEffectsGraphDef(effects);
  }
}

export class OmpAudioEffectParam extends OmpAudioNodeParam {}

export class OmpAudioEffectGainParam extends OmpAudioEffectParam {
  protected readonly _valueParam: OmpAudioNodeValueParam;

  constructor(gain?: number) {
    super('gain');
    this._valueParam = new OmpAudioNodeValueParam(gain === void 0 ? 1 : gain);
    this.addProp(this._valueParam);
  }

  setGain(gain: number) {
    this._valueParam.setValue(gain);
  }
}

export class OmpAudioEffectDelayTimeParam extends OmpAudioEffectParam {
  protected readonly _valueParam: OmpAudioNodeValueParam;

  constructor(delayTime?: number) {
    super('delayTime');
    this._valueParam = new OmpAudioNodeValueParam(delayTime === void 0 ? 1 : delayTime);
    this.addProp(this._valueParam);
  }

  setDelayTime(delayTime: number) {
    this._valueParam.setValue(delayTime);
  }
}

export type OmpAudioEffectFactory = (ctx: AudioContext, effectDef: OmpAudioEffectDef) => OmpAudioEffect;
export class OmpAudioEffectsRegistry {
  private static _instance?: OmpAudioEffectsRegistry;
  private registry: Map<string, OmpAudioEffectFactory> = new Map();

  private constructor() {
    this.registry.set('gain', (ctx, def) => new OmpGainEffect(ctx, def));
    this.registry.set('delay', (ctx, def) => new OmpDelayEffect(ctx, def));
  }

  static get instance(): OmpAudioEffectsRegistry {
    if (!this._instance) {
      this._instance = new OmpAudioEffectsRegistry();
    }
    return this._instance;
  }

  register(name: string, effect: OmpAudioEffectFactory) {
    this.registry.set(name, effect);
  }

  get(name: string) {
    return this.registry.get(name);
  }
}

/**
 * Gain effect
 */
export class OmpGainEffect implements OmpAudioEffect {
  private _gainNode;
  private _def: OmpAudioEffectDef;
  public readonly id: string;
  public readonly effectType: string;
  public attrs = new Map<string, any>();
  public onReady$ = new ReplaySubject<void>(1);
  constructor(audioContext: AudioContext, def: OmpAudioEffectDef) {
    this._def = def;
    this._gainNode = new GainNode(audioContext, {gain: this.extractGainParamFromDef()});
    this.id = def.id;
    this.effectType = def.effectType;

    if (def.attrs) {
      for (const [key, value] of Object.entries(def.attrs)) {
        this.attrs.set(key, value);
      }
    }

    this.onReady$.next();
  }

  private extractGainParamFromDef(): number {
    return this._def.audioParams?.find((param) => param.name === 'gain')?.props[0].value ?? 1;
  }

  getInputNodes(): AudioNode[] {
    return [this._gainNode];
  }

  getOutputNode(): AudioNode {
    return this._gainNode;
  }

  getNodes(): AudioNode[] {
    return [this._gainNode];
  }

  getParams(): OmpAudioEffectParamType[] | undefined {
    return this._def.audioParams;
  }

  toDef(): OmpAudioEffectDef {
    return {
      ...this._def,
    };
  }

  setParam(param: OmpAudioEffectParam): void {
    // @ts-ignore
    let audioParam: AudioParam = this._gainNode[param.name] as AudioParam;
    if (!audioParam) {
      throw new OmpError('AudioParam not found:' + param.name);
    }
    param.props.forEach((prop) => {
      if (hasProperty(audioParam, prop.name)) {
        // @ts-ignore
        audioParam[prop.name] = prop.value;
      }
    });
    this.updateDefParam(param);
  }

  private updateDefParam(param: OmpAudioEffectParamType) {
    if (!this._def.audioParams) {
      this._def.audioParams = [param];
    } else {
      const oldParam = this._def.audioParams.find((oldParam) => oldParam.name === param.name);

      if (!oldParam) {
        this._def.audioParams.push(param);
      } else {
        oldParam.props = param.props;
      }
    }
  }

  destroy(): void {
    this._gainNode.disconnect();
  }

  public static createDef(id: string, gain: number): DefaultOmpAudioEffectDef {
    return new DefaultOmpAudioEffectDef(id, 'gain').addParam({
      name: 'gain',
      props: [
        {
          name: 'value',
          value: gain,
        },
      ],
    });
  }
}

/**
 * Delay effect
 */
export class OmpDelayEffect implements OmpAudioEffect {
  private _delayNode;
  private _def: OmpAudioEffectDef;
  public readonly id: string;
  public readonly effectType: string;
  public attrs = new Map<string, any>();
  public onReady$ = new ReplaySubject<void>(1);

  constructor(audioContext: AudioContext, def: OmpAudioEffectDef) {
    this._def = def;
    this._delayNode = new DelayNode(audioContext, {delayTime: this.extractDelayTimeParamFromDef()});
    this.id = def.id;
    this.effectType = def.effectType;

    if (def.attrs) {
      for (const [key, value] of Object.entries(def.attrs)) {
        this.attrs.set(key, value);
      }
    }

    this.onReady$.next();
  }

  private extractDelayTimeParamFromDef(): number {
    return this._def.audioParams?.find((param) => param.name === 'delayTime')?.props[0].value ?? 0;
  }

  getInputNodes(): AudioNode[] {
    return [this._delayNode];
  }

  getOutputNode(): AudioNode {
    return this._delayNode;
  }

  getNodes(): AudioNode[] {
    return [this._delayNode];
  }

  getParams(): OmpAudioEffectParamType[] | undefined {
    return this._def.audioParams;
  }

  toDef(): OmpAudioEffectDef {
    return {
      ...this._def,
    };
  }

  setParam(param: OmpAudioEffectParam): void {
    // @ts-ignore
    let audioParam: AudioParam = this._delayNode[param.name] as AudioParam;
    if (!audioParam) {
      throw new OmpError('AudioParam not found:' + param.name);
    }
    param.props.forEach((prop) => {
      if (hasProperty(audioParam, prop.name)) {
        // @ts-ignore
        audioParam[prop.name] = prop.value;
      }
    });
    this.updateDefParam(param);
  }

  private updateDefParam(param: OmpAudioEffectParam) {
    if (!this._def.audioParams) {
      this._def.audioParams = [param];
    } else {
      const oldParam = this._def.audioParams.find((oldParam) => oldParam.name === param.name);

      if (!oldParam) {
        this._def.audioParams.push(param);
      } else {
        oldParam.props = param.props;
      }
    }
  }

  destroy(): void {
    this._delayNode.disconnect();
  }

  public static createDef(id: string, delayTime: number): DefaultOmpAudioEffectDef {
    return new DefaultOmpAudioEffectDef(id, 'delay').addParam({
      name: 'delayTime',
      props: [
        {
          name: 'value',
          value: delayTime,
        },
      ],
    });
  }
}

/**
 * Filter values used for filtering {@link OmpAudioEffect}'s
 */
export interface OmpAudioEffectFilter {
  /**
   * {@link OmpAudioEffect.id}
   */
  id?: string;

  /**
   * {@link OmpAudioEffect.type}
   */
  effectType?: string;

  /**
   * {@link OmpAudioEffect.attrs}
   */
  attrs?: Record<string, any>;
}

/**
 * Audio effects graph. Implementation corresponds to definition {@link OmpAudioEffectsGraph.toDef}
 */
export class OmpAudioEffectsGraph {
  protected _effects: OmpAudioEffect[] = [];
  protected _effectsById: Map<string, OmpAudioEffect> = new Map();
  protected _sourceEffects: OmpAudioEffect[] = [];
  protected _destinationEffects: OmpAudioEffect[] = [];
  protected _initialized = false;
  public get initialized() {
    return this._initialized;
  }

  constructor(
    private audioContext: AudioContext,
    private def: OmpAudioEffectsGraphDef
  ) {}

  public initialize(): Observable<void> {
    this._effects = [];
    const effectsRegistry = OmpAudioEffectsRegistry.instance;
    const effectsReady$: Observable<void>[] = [];
    // create effects
    this.def.effectDefs.forEach((effectDef) => {
      const effectFactory = effectsRegistry.get(effectDef.effectType);
      if (!effectFactory) {
        throw new OmpError(`Effect ${effectDef.id} of type ${effectDef.effectType} is not registered`);
      }
      let effect = effectFactory(this.audioContext, effectDef);
      effectsReady$.push(effect.onReady$);

      if (this._effectsById.has(effect.id)) {
        throw new OmpError('Effect with same id already exists in graph: ' + effect.id);
      }

      this._effects.push(effect);
      this._effectsById.set(effect.id, effect);
    });

    const allReady$ = combineLatest(effectsReady$);

    return allReady$.pipe(
      tap(() => {
        // create connections
        this.def.effectDefs.forEach((effectDef) => {
          if (effectDef.connections) {
            effectDef.connections.forEach((connectionDef) => {
              const sourceNode = this._effectsById.get(effectDef.id)!.getOutputNode();
              const destinationEffect = this._effectsById.get(connectionDef.effectId);

              if (!destinationEffect) {
                throw new OmpError('destinationNode not found: ' + connectionDef.effectId);
              }

              destinationEffect.getInputNodes().forEach((destinationNode) => {
                sourceNode.connect(destinationNode, connectionDef.output, connectionDef.input);
              });
            });
          }
        });

        const sourceEffects = this.def.sourceEffectIds.map((id) => this._effectsById.get(id)).filter(isNonNullable);
        if (sourceEffects.length < 1) {
          throw new OmpError('sourceEffects not found: ' + this.def.sourceEffectIds);
        }
        this._sourceEffects = sourceEffects;

        const destinationEffects = this.def.destinationEffectIds.map((id) => this._effectsById.get(id)).filter(isNonNullable);
        if (destinationEffects.length < 1) {
          throw new OmpError('destinationEffects not found: ' + this.def.destinationEffectIds);
        }
        this._destinationEffects = destinationEffects;

        this._initialized = true;
      }),
      map(() => undefined)
    );
  }

  /**
   * Finds all {@link OmpAudioEffect}'s that correspond to {@link filter}
   *
   * @param filter
   */
  findAudioEffects(filter?: OmpAudioEffectFilter): OmpAudioEffect[] {
    if (!filter) {
      return this._effects;
    }
    return this._effects.filter((effect) => {
      let include = true;

      if (filter.id !== void 0) {
        include = effect.id === filter.id;
      }

      if (filter.effectType !== void 0) {
        include = effect.effectType === filter.effectType;
      }

      if (filter.attrs !== void 0) {
        let containsAttrs = (filterAttrs: Record<string, any>): boolean => {
          for (const [key, value] of Object.entries(filterAttrs)) {
            if (!effect.attrs.has(key) || effect.attrs.get(key) !== value) {
              return false;
            }
          }

          return true;
        };
        include = containsAttrs(filter.attrs);
      }

      return include;
    });
  }

  /**
   * Audio effects graph input {@link OmpAudioEffect}'s
   */
  get sourceEffects(): OmpAudioEffect[] {
    return this._sourceEffects;
  }

  /**
   * Audio effects graph output {@link OmpAudioEffect}'s
   */
  get destinationEffects(): OmpAudioEffect[] {
    return this._destinationEffects;
  }

  toDef(): OmpAudioEffectsGraphDef {
    let builder = OmpAudioEffectsGraphDefBuilder.instance();

    this._effects.forEach((effect) => {
      builder.addEffect(effect.toDef());
    });

    builder.sourceEffectsIds(this._sourceEffects.map((effect) => effect.id));
    builder.destinationEffectsIds(this._destinationEffects.map((effect) => effect.id));

    return builder.build();
  }

  destroy() {
    this._effects.forEach((effect) => {
      effect.destroy();
    });
  }
}

export class OmpAudioEffectsUtil {
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
