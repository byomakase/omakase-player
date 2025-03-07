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
import {AudioInputOutputNode, OmpAudioRouterState} from '../video/model';
import {Observable} from 'rxjs';
import {OmpAudioRouterChangeEvent} from '../types';

/**
 * Audio router
 */
export interface AudioRouterApi extends Api {
  /**
   * Fires when {@link AudioInputOutputNode} nodes changes
   */
  onChange$: Observable<OmpAudioRouterChangeEvent>;

  /**
   * Source {@link AudioNode}
   */
  get sourceAudioNode(): AudioNode | undefined;

  /**
   * Routes provided {@link AudioInputOutputNode} nodes
   * @param newAudioInputOutputNodes
   */
  routeAudioInputOutputNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void>;

  /**
   * @returns audio router state
   */
  getAudioRouterState(): OmpAudioRouterState;
}
