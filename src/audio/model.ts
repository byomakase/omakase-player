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

import {OmpAudioNodeParamType, OmpAudioNodeType} from '../video';

/**
 * Audio node definition for Web Audio API {@link AudioNode} wrapper
 */
export interface OmpAudioNodeDef {
  id: string;
  type: OmpAudioNodeType;

  /**
   * Arbitrary attributes which can be used to describe audio node.
   */
  attrs?: Record<string, any>;

  /**
   * Connections to other {@link OmpAudioNodeDef}'s
   */
  connections?: OmpAudioNodeConnectionDef[];

  /**
   * Used only during {@link AudioNode} creation. This options will be passed in {@link AudioNode} constructor
   */
  audioNodeOptions?: any;

  /**
   * Audio node params
   */
  audioParams?: OmpAudioNodeParamType[];
}

/**
 * Connection definition to {@link OmpAudioNodeDef}
 */
export interface OmpAudioNodeConnectionDef {
  /**
   * {@link OmpAudioNodeDef.id}
   */
  nodeId: string;

  /**
   * {@link OmpAudioNodeDef.audioParams[].name}
   */
  paramName?: string;

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
 * Audio graph definition. Contains {@link OmpAudioNodeDef}'s
 */
export interface OmpAudioGraphDef {
  nodes: OmpAudioNodeDef[];

  /**
   * Audio graph input {@link OmpAudioNodeDef}'s
   */
  sourceNodeIds: string[];

  /**
   * Audio graph output {@link OmpAudioNodeDef}'s
   */
  destinationNodeIds: string[];
}
