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

import {Api} from './api';
import {OmpAudioRouterState, OmpAudioRoutingConnection, OmpAudioRoutingPath} from '../video';
import {Observable} from 'rxjs';
import {OmpAudioRouterChangeEvent, OmpAudioRouterInputSoloMuteEvent} from '../types';
import {OmpAudioEffect, OmpAudioEffectFilter, OmpAudioEffectParam, OmpAudioEffectsGraph, OmpAudioEffectsGraphDef} from '../audio';
import {OmpAudioRouterInputSoloMuteState, OmpAudioRoutingInputType} from '../video/model';

/**
 * Audio router
 */
export interface AudioRouterApi extends Api {
  /**
   * Fires when {@link OmpAudioRouterState} changes
   */
  onChange$: Observable<OmpAudioRouterChangeEvent>;

  /**
   * Fires when {@link OmpAudioRouterInputSoloMuteState} changes
   */
  onInputSoloMute$: Observable<OmpAudioRouterInputSoloMuteEvent>;

  /**
   * Updates routing connections
   * @param connections
   */
  updateConnections(connections: OmpAudioRoutingConnection[]): void;

  /**
   * Creates {@link OmpAudioEffectsGraph}'s from provided {@link effectsGraphDef}'s to routing paths provided with {@link routingPath}. </br>
   *
   * If {@link routingPath} is not provided {@link OmpAudioEffectsGraph}s will be set on all available routing paths. </br>
   * If {@link routingPath.output} is not provided {@link OmpAudioEffectsGraph}s will be set on all available routing paths where {@link OmpAudioRoutingPath.input} = {@link routingPath.input}. </br>
   * If {@link routingPath.input} is not provided {@link OmpAudioEffectsGraph}s will be set on all available routing paths where {@link OmpAudioRoutingPath.output} = {@link routingPath.output}. </br>
   *
   * @param effectsGraphDef
   * @param routingPath
   */
  setAudioEffectsGraphs(effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): void;

  /**
   * Removes {@link OmpAudioEffectsGraph}'s from routing paths provided with {@link routingPath}. </br>
   *
   * If {@link routingPath} is not provided {@link OmpAudioEffectsGraph}s will be removed on all available routing paths. </br>
   * If {@link routingPath.output} is not provided {@link OmpAudioEffectsGraph}s will be removed on all available routing paths where {@link OmpAudioRoutingPath.input} = {@link routingPath.input}. </br>
   * If {@link routingPath.input} is not provided {@link OmpAudioEffectsGraph}s will be removed on all available routing paths where {@link OmpAudioRoutingPath.output} = {@link routingPath.output}. </br>
   *
   * @param routingPath
   */
  removeAudioEffectsGraphs(routingPath?: Partial<OmpAudioRoutingPath>): void;

  /**
   * @returns {@link OmpAudioEffectsGraph}'s from routing paths provided with {@link routingPath}. </br>
   *
   * @param routingPath
   */
  findAudioEffectsGraphs(routingPath?: Partial<OmpAudioRoutingPath>): OmpAudioEffectsGraph[];

  /**
   * Returns all audio effects that match {@link filter}
   *
   * @param filter
   */
  findAudioEffects(filter?: {routingPath?: Partial<OmpAudioRoutingPath>} & OmpAudioEffectFilter): OmpAudioEffect[];

  /**
   * Sets {@link OmpAudioEffectParam} for audio effects that match {@link filter}
   *
   * @param param
   * @param filter
   */
  setAudioEffectsParams(param: OmpAudioEffectParam, filter?: {routingPath?: Partial<OmpAudioRoutingPath>} & OmpAudioEffectFilter): void;

  /**
   * Source {@link AudioNode}
   */
  get sourceAudioNode(): AudioNode | undefined;

  /**
   * @returns audio router state
   */
  getAudioRouterState(): OmpAudioRouterState;

  /**
   * @returns last changed (solo/mute/unsolo/unmute) audio router input state
   */
  getAudioRouterInputSoloMuteState(): OmpAudioRouterInputSoloMuteState;

  /**
   * @returs audio router initial/default connections
   */
  getInitialRoutingConnections(): OmpAudioRoutingConnection[];

  /**
   * Overrides audio router initial/default connections
   * @param connections
   */
  setInitialRoutingConnections(connections: OmpAudioRoutingConnection[]): void;

  /**
   * Solo or unsolo (depending on current input state) given audio router input
   * @param routingPath
   */
  toggleSolo(routingPath: OmpAudioRoutingInputType): void;

  /**
   * Mute or unmute (depending on current input state) given audio router input
   * @param routingPath
   */
  toggleMute(routingPath: OmpAudioRoutingInputType): void;

  /**
   * Reset all audio router inputs states
   */
  resetInputsSoloMuteState(): void;
}
