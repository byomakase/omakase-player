/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {RouterVisualizationSize, RouterVisualizationTrackUpdate} from '../router-visualization/router-visualization';
import {Api} from './api';

export interface RouterVisualizationApi extends Api {
  /**
   * Updates the main track in the Router Visualization component
   * @param track new main track
   */
  updateMainTrack(track: RouterVisualizationTrackUpdate): void;

  /**
   * Updates the size of the Router Visualization component
   * @param size small, medium or large
   */
  updateSize(size: RouterVisualizationSize): void;

  /**
   * Destroys Router Visualization component
   */
  destroy(): void;
}
