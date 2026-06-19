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

import {combineLatest, map, Observable, tap} from 'rxjs';
import {OmpError} from '../../types';
import {isNonNullable} from '../../util/util-functions';
import {type AudioEffect, type AudioEffectFilter, type AudioEffectGraphState, type AudioEffectState} from './model';
import {AudioEffectsRegistry} from './audio-effect';

/**
 * Audio effects graph definition. Contains {@link AudioEffectState}'s
 */
export class AudioEffectGraphDef implements AudioEffectGraphState {
  effectDefs: AudioEffectState[];
  sourceEffectIds: string[];
  destinationEffectIds: string[];

  private constructor(effectDefs: AudioEffectState[]) {
    let audioGraphDef = AudioEffectsGraphDefBuilder.instance.addEffects(effectDefs).build();
    this.effectDefs = audioGraphDef.effectDefs as AudioEffectState[];
    this.sourceEffectIds = audioGraphDef.sourceEffectIds;
    this.destinationEffectIds = audioGraphDef.destinationEffectIds;
  }

  public static create(...effects: AudioEffectState[]): AudioEffectGraphDef {
    return new AudioEffectGraphDef(effects);
  }
}

export class AudioEffectsGraphDefBuilder {
  protected _effectDefs: AudioEffectState[] = [];
  protected _effectDefsMap: Map<string, AudioEffectState> = new Map();

  protected _sourceEffectDefs?: AudioEffectState[];
  protected _destinationEffectDefs?: AudioEffectState[];

  private constructor() {}

  public static get instance(): AudioEffectsGraphDefBuilder {
    return new AudioEffectsGraphDefBuilder();
  }

  addEffects(effectDefs: AudioEffectState[]): this {
    effectDefs.forEach((effectDef) => {
      this.addEffect(effectDef);
    });
    return this;
  }

  addEffect(node: AudioEffectState): this {
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

  build(): AudioEffectGraphState {
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
 * Audio effects graph. Implementation corresponds to definition {@link AudioEffectGraph.toDef}
 */
export class AudioEffectGraph {
  protected _effects: AudioEffect[] = [];
  protected _effectsById: Map<string, AudioEffect> = new Map();
  protected _sourceEffects: AudioEffect[] = [];
  protected _destinationEffects: AudioEffect[] = [];
  protected _initialized = false;
  public get initialized() {
    return this._initialized;
  }

  constructor(private def: AudioEffectGraphState) {}

  public initialize(): Observable<void> {
    this._effects = [];
    const effectsRegistry = AudioEffectsRegistry.instance;
    const effectsReady$: Observable<void>[] = [];
    // create effects
    this.def.effectDefs.forEach((effectDef) => {
      const effectFactory = effectsRegistry.get(effectDef.effectType);
      if (!effectFactory) {
        throw new OmpError(`Effect ${effectDef.id} of type ${effectDef.effectType} is not registered`);
      }
      let effect = effectFactory(effectDef);
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
   * Finds all {@link AudioEffect}'s that correspond to {@link filter}
   *
   * @param filter
   */
  findAudioEffects(filter?: AudioEffectFilter): AudioEffect[] {
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
   * Audio effects graph input {@link AudioEffect}'s
   */
  get sourceEffects(): AudioEffect[] {
    return this._sourceEffects;
  }

  /**
   * Audio effects graph output {@link AudioEffect}'s
   */
  get destinationEffects(): AudioEffect[] {
    return this._destinationEffects;
  }

  toState(): AudioEffectGraphState {
    let builder = AudioEffectsGraphDefBuilder.instance;

    this._effects.forEach((effect) => {
      builder.addEffect(effect.toState());
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
