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

import {OmpAudioGraphDef, OmpAudioNodeConnectionDef, OmpAudioNodeDef} from './model';
import {OmpAudioNodeParamType, OmpAudioNodeType} from '../video';
import {BaseOmpAudioNode, OmpAudioGraph, OmpAudioNode, OmpAudioNodeParam, OmpAudioNodeUtil, OmpAudioNodeValueParam} from './omp-web-audio';
import {OmpAudioRoutingPath} from '../video';
import {OmpError} from '../types';
import {isNonNullable} from '../util/function-util';

export class OmpAudioEffectsGraphDefBuilder {
  protected _effectDefs: OmpAudioEffectDef[] = [];
  protected _effectDefsMap: Map<string, OmpAudioEffectDef> = new Map();

  protected _sourceEffectDefs?: OmpAudioEffectDef[];
  protected _destinationEffectDefs?: OmpAudioEffectDef[];

  private constructor() {}

  public static instance(): OmpAudioEffectsGraphDefBuilder {
    return new OmpAudioEffectsGraphDefBuilder();
  }

  addEffects(nodes: OmpAudioEffectDef[]): this {
    nodes.forEach((node) => {
      this.addEffect(node);
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
      nodeId: destinationNodeId,
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
      .map((connection) => connection?.nodeId)
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
    if (this._destinationEffectDefs) {
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
      nodes: this._effectDefs,
      sourceNodeIds: this._sourceEffectDefs.map((p) => p.id),
      destinationNodeIds: this._destinationEffectDefs.map((p) => p.id),
    };
  }
}

/**
 * Audio effects graph definition. Contains {@link OmpAudioEffectDef}'s
 */
export class OmpAudioEffectsGraphDef implements OmpAudioGraphDef {
  nodes: OmpAudioEffectDef[];
  sourceNodeIds: string[];
  destinationNodeIds: string[];

  private constructor(nodes: OmpAudioEffectDef[]) {
    let audioGraphDef = OmpAudioEffectsGraphDefBuilder.instance().addEffects(nodes).build();
    this.nodes = audioGraphDef.nodes as OmpAudioEffectDef[];
    this.sourceNodeIds = audioGraphDef.sourceNodeIds;
    this.destinationNodeIds = audioGraphDef.destinationNodeIds;
  }

  public static create(...effects: OmpAudioEffectDef[]): OmpAudioEffectsGraphDef {
    return new OmpAudioEffectsGraphDef(effects);
  }
}

/**
 * Audio effect definition
 */
export interface OmpAudioEffectDef extends OmpAudioNodeDef {

}

export class BaseOmpAudioEffectDef implements OmpAudioEffectDef {
  id: string;
  type: OmpAudioNodeType;
  audioNodeOptions?: any;

  attrs: Record<string, any> = {};
  connections: OmpAudioNodeConnectionDef[] = [];
  audioParams: OmpAudioNodeParamType[] = [];

  constructor(id: string, type: OmpAudioNodeType, audioNodeOptions?: any) {
    this.id = id;
    this.type = type;
    this.audioNodeOptions = audioNodeOptions;
  }

  protected addParam(param: OmpAudioNodeParamType) {
    this.audioParams.push(param);
  }

  outputTo(...effectIds: string[]): BaseOmpAudioEffectDef {
    effectIds.forEach((effectId: string) => {
      this.connections.push({
        nodeId: effectId,
      });
    });
    return this;
  }

  withAttrs(attrs: Record<string, any>): BaseOmpAudioEffectDef {
    this.attrs = attrs;
    return this;
  }
}

/**
 * Gain effect definition
 */
export class OmpGainEffectDef extends BaseOmpAudioEffectDef {
  protected readonly _gainParam: OmpAudioEffectGainParam;

  static create(id: string, gain?: number) {
    return new OmpGainEffectDef(id, gain);
  }

  private constructor(id: string, gain?: number) {
    super(id, 'gain');
    this._gainParam = new OmpAudioEffectGainParam(gain);
    this.addParam(this._gainParam);
  }
}

/**
 * Delay effect definition
 */
export class OmpDelayEffectDef extends BaseOmpAudioEffectDef {
  protected readonly _delayTimeParam: OmpAudioEffectDelayTimeParam;

  static create(id: string, delayTime?: number) {
    return new OmpDelayEffectDef(id, delayTime);
  }

  private constructor(id: string, delayTime?: number) {
    super(id, 'delay');
    this._delayTimeParam = new OmpAudioEffectDelayTimeParam(delayTime);
    this.addParam(this._delayTimeParam);
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

export interface OmpAudioEffect extends OmpAudioNode {
  setParam(param: OmpAudioEffectParam): void;

  toDef(): OmpAudioEffectDef;
}

export abstract class BaseOmpAudioEffect<T extends AudioNode> extends BaseOmpAudioNode<T> implements OmpAudioEffect {
  constructor(audioContext: AudioContext, def: OmpAudioEffectDef) {
    super(audioContext, def);
  }

  setParam(param: OmpAudioEffectParam): void {
    this.setAudioParam(param);
  }

  override toDef(): OmpAudioEffectDef {
    let defAttrs: Record<string, any> = {};
    this._attrs.forEach((value: any, key) => {
      defAttrs[key] = value;
    });

    return {
      id: this._id,
      type: this._type,
      audioNodeOptions: this._audioNodeOptions,
      attrs: defAttrs,
      connections: this._connections.map((p) => p.toDef()),
      audioParams: this.extractAudioNodeParams(),
    };
  }

  protected abstract extractAudioNodeParams(): OmpAudioNodeParamType[];
}

/**
 * Gain effect
 */
export class OmpGainEffect extends BaseOmpAudioEffect<GainNode> {
  protected createAudioNode(audioContext: AudioContext, def: OmpAudioNodeDef): GainNode {
    return new GainNode(audioContext, def.audioNodeOptions);
  }

  protected override extractAudioNodeParams(): OmpAudioNodeParamType[] {
    return [
      {
        name: 'gain',
        props: OmpAudioNodeUtil.extractAudioParamProps(this.audioNode.gain),
      },
    ];
  }
}

/**
 * Delay effect
 */
export class OmpDelayEffect extends BaseOmpAudioEffect<DelayNode> {
  protected createAudioNode(audioContext: AudioContext, def: OmpAudioNodeDef): DelayNode {
    return new DelayNode(audioContext, def.audioNodeOptions);
  }

  protected override extractAudioNodeParams(): OmpAudioNodeParamType[] {
    return [
      {
        name: 'delayTime',
        props: OmpAudioNodeUtil.extractAudioParamProps(this.audioNode.delayTime),
      },
    ];
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
  type?: OmpAudioNodeType;

  /**
   * {@link OmpAudioEffect.attrs}
   */
  attrs?: Record<string, any>;
}

/**
 * Audio effects graph. Implementation corresponds to definition {@link OmpAudioEffectsGraph.toDef}
 */
export class OmpAudioEffectsGraph implements OmpAudioGraph {
  protected readonly _routingPath: OmpAudioRoutingPath;

  protected _effects: OmpAudioEffect[];
  protected _effectsById: Map<string, OmpAudioEffect> = new Map();
  protected _sourceEffects: OmpAudioEffect[];
  protected _destinationEffects: OmpAudioEffect[];

  constructor(audioContext: AudioContext, routingPath: OmpAudioRoutingPath, def: OmpAudioEffectsGraphDef) {
    this._routingPath = routingPath;

    this._effects = [];

    // create nodes
    def.nodes.forEach((effectDef) => {
      let ompAudioNode = this.createEffect(audioContext, effectDef);

      if (this._effectsById.has(ompAudioNode.id)) {
        throw new OmpError('Node with same id already exists in graph: ' + ompAudioNode.id);
      }

      this._effects.push(ompAudioNode);
      this._effectsById.set(ompAudioNode.id, ompAudioNode);
    });

    // create connections
    def.nodes.forEach((audioNodeDef) => {
      if (audioNodeDef.connections) {
        audioNodeDef.connections.forEach((connectionDef) => {
          let sourceNode = this._effectsById.get(audioNodeDef.id)!;
          let destinationNode = this._effectsById.get(connectionDef.nodeId);

          if (destinationNode === void 0) {
            throw new OmpError('destinationNode not found: ' + connectionDef.nodeId);
          }

          if (connectionDef.paramName === void 0) {
            sourceNode.connectNode(destinationNode, connectionDef.output, connectionDef.input);
          } else {
            sourceNode.connectParam(destinationNode, connectionDef.paramName, connectionDef.output);
          }
        });
      }
    });

    let sourceNodes = def.sourceNodeIds.map((id) => this._effectsById.get(id)).filter(isNonNullable);
    if (sourceNodes.length < 1) {
      throw new OmpError('sourceNodes not found: ' + def.sourceNodeIds);
    }
    this._sourceEffects = sourceNodes;

    let destinationNodes = def.destinationNodeIds.map((id) => this._effectsById.get(id)).filter(isNonNullable);
    if (destinationNodes.length < 1) {
      throw new OmpError('destinationNodes not found: ' + def.destinationNodeIds);
    }
    this._destinationEffects = destinationNodes;
  }

  protected createEffect(audioContext: AudioContext, effectDef: OmpAudioEffectDef): OmpAudioEffect {
    switch (effectDef.type) {
      case 'gain':
        return new OmpGainEffect(audioContext, effectDef);
      case 'delay':
        return new OmpDelayEffect(audioContext, effectDef);
      default:
        throw new Error('Method not implemented.');
    }
  }

  /**
   * Finds all {@link OmpAudioEffect}'s that correspond to {@link filter}
   *
   * @param filter
   */
  findAudioEffects(filter: OmpAudioEffectFilter): OmpAudioEffect[] {
    return this._effects.filter((effect) => {
      let include = true;

      if (filter.id !== void 0) {
        include = effect.id === filter.id;
      }

      if (filter.type !== void 0) {
        include = effect.type === filter.type;
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

    this._effects.forEach((node) => {
      builder.addEffect(node.toDef());
    });

    builder.sourceEffectsIds(this._sourceEffects.map((node) => node.id));
    builder.destinationEffectsIds(this._destinationEffects.map((node) => node.id));

    return builder.build();
  }

  destroy() {
    this._effects.forEach((node) => {
      node.destroy();
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
