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

import {Destroyable, OmpError} from '../types';
import {OmpAudioGraphDef, OmpAudioNodeConnectionDef, OmpAudioNodeDef} from './model';
import {hasProperty} from '../util/object-util';
import {OmpAudioNodeParamPropType, OmpAudioNodeParamType, OmpAudioNodeType} from '../video';

/**
 * Connection definition to {@link OmpAudioNode}
 */
export class OmpAudioNodeConnection {
  protected readonly _node: OmpAudioNode;
  protected readonly _paramName?: string;
  protected readonly _output?: number;
  protected readonly _input?: number;

  constructor(node: OmpAudioNode, paramName?: string, output?: number, input?: number) {
    this._node = node;
    this._paramName = paramName;
    this._output = output;
    this._input = input;
  }

  get isAudioParamConnection(): boolean {
    return this._paramName !== null;
  }

  get node(): OmpAudioNode {
    return this._node;
  }

  get paramName(): string | undefined {
    return this._paramName;
  }

  get output(): number | undefined {
    return this._output;
  }

  get input(): number | undefined {
    return this._input;
  }

  toDef(): OmpAudioNodeConnectionDef {
    return {
      nodeId: this._node.id,
      paramName: this._paramName,
      output: this._output,
      input: this._input,
    };
  }
}

/**
 * Web Audio API {@link AudioNode} wrapper
 */
export interface OmpAudioNode extends Destroyable {
  get id(): string;

  get type(): OmpAudioNodeType;

  get attrs(): Map<string, any>;

  get connections(): OmpAudioNodeConnection[];

  get audioNode(): AudioNode;

  connectNode(destinationNode: OmpAudioNode, output?: number, input?: number): OmpAudioNode;

  connectParam(destinationNode: OmpAudioNode, audioParamName: string, output?: number): void;

  toDef(): OmpAudioNodeDef;
}

export abstract class BaseOmpAudioNode<T extends AudioNode> implements OmpAudioNode {
  protected _id: string;
  protected _type: OmpAudioNodeType;
  protected _attrs: Map<string, any> = new Map();

  protected _audioNode: T;
  protected _audioNodeOptions?: any;

  protected _connections: OmpAudioNodeConnection[] = [];

  protected constructor(audioContext: AudioContext, def: OmpAudioNodeDef) {
    this._id = def.id;
    this._type = def.type;

    this._audioNode = this.createAudioNode(audioContext, def);

    this._audioNodeOptions = def.audioNodeOptions;
    if (def.attrs) {
      for (const [key, value] of Object.entries(def.attrs)) {
        this._attrs.set(key, value);
      }
    }

    if (def.audioParams) {
      def.audioParams.forEach((ompAudioParam) => {
        this.setAudioParam(ompAudioParam);
      });
    }
  }

  protected abstract createAudioNode(audioContext: AudioContext, def: OmpAudioNodeDef): T;

  abstract toDef(): OmpAudioNodeDef;

  setAudioParam(ompAudioParam: OmpAudioNodeParamType): void {
    // @ts-ignore
    let audioParam: AudioParam = this._audioNode[ompAudioParam.name] as AudioParam;
    if (!audioParam) {
      throw new OmpError('AudioParam not found:' + ompAudioParam.name);
    }
    ompAudioParam.props.forEach((prop) => {
      if (hasProperty(audioParam, prop.name)) {
        // @ts-ignore
        audioParam[prop.name] = prop.value;
      }
    });
  }

  connectNode(destinationNode: OmpAudioNode, output?: number, input?: number): OmpAudioNode {
    this._audioNode.connect(destinationNode.audioNode, output, input);
    this._connections.push(new OmpAudioNodeConnection(destinationNode, void 0, output, input));
    return destinationNode;
  }

  connectParam(destinationNode: OmpAudioNode, audioParamName: string, output?: number): void {
    // @ts-ignore
    let audioParam: AudioParam = destinationNode.audioNode[audioParamName] as AudioParam;
    if (!audioParam) {
      throw new OmpError('AudioParam not found');
    }
    this._audioNode.connect(audioParam, output);
    this._connections.push(new OmpAudioNodeConnection(destinationNode, audioParamName, output));
  }

  disconnect(input?: number): void {
    if (input === void 0) {
      this._audioNode.disconnect();
      this._connections = [];
    } else {
      this._connections.forEach((p) => {
        if (p.paramName === void 0) {
          this.disconnectNode(p.node, void 0, p.input);
        } else {
          this.disconnectParam(p.node, p.paramName, p.input);
        }
      });
    }
  }

  disconnectNode(destinationNode: OmpAudioNode, output?: number, input?: number): void {
    // TODO check if disconnecting AudioNode disconnects AudioParam as well (if yes condition: p.audioParamName === void 0 has to be removed)
    let connectionsToRemove = this._connections.filter(
      (p) => p.node === destinationNode && p.paramName === void 0 && (output !== void 0 ? output === p.output : true) && (input !== void 0 ? input === p.input : true)
    );
    connectionsToRemove.forEach((connection) => {
      if (connection.output && connection.input) {
        this._audioNode.disconnect(connection.node.audioNode, connection.output, connection.input);
      } else if (connection.output) {
        this._audioNode.disconnect(connection.node.audioNode, connection.output);
      } else {
        this._audioNode.disconnect(connection.node.audioNode);
      }
      this._connections = this._connections.filter((p) => p === connection);
    });
  }

  disconnectParam(destinationNode: OmpAudioNode, audioParamName: string, output?: number): void {
    let connectionsToRemove = this._connections.filter((p) => p.node === destinationNode && p.paramName === audioParamName && (output !== void 0 ? output === p.output : true));
    connectionsToRemove.forEach((connection) => {
      // @ts-ignore
      let audioParam: AudioParam = connection.node.audioNode[audioParamName] as AudioParam;
      if (output !== void 0) {
        this._audioNode.disconnect(audioParam, output);
      } else {
        this._audioNode.disconnect(audioParam);
      }
      this._connections = this._connections.filter((p) => p === connection);
    });
  }

  get audioNode(): T {
    return this._audioNode;
  }

  get id(): string {
    return this._id;
  }

  get type(): OmpAudioNodeType {
    return this._type;
  }

  get attrs(): Map<string, any> {
    return this._attrs;
  }

  get connections(): OmpAudioNodeConnection[] {
    return this._connections;
  }

  destroy() {
    this._audioNode.disconnect();
  }
}

/**
 * Wrapper for {@link AudioParam} attributes
 */
export class OmpAudioNodeValueParam implements OmpAudioNodeParamPropType {
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
export class OmpAudioNodeParam implements OmpAudioNodeParamType {
  name: string;
  props: OmpAudioNodeParamPropType[] = [];

  constructor(name: string) {
    this.name = name;
  }

  protected addProp(prop: OmpAudioNodeParamPropType) {
    this.props.push(prop);
  }
}

/**
 * Audio graph
 */
export interface OmpAudioGraph extends Destroyable {

  /**
   * Definition that represents {@link OmpAudioGraph} or it's current state
   */
  toDef(): OmpAudioGraphDef;
}

export class OmpAudioNodeUtil {
  static extractAudioParamProps(audioParam: AudioParam): OmpAudioNodeParamPropType[] {
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
