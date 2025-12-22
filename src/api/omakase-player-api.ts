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

import {Api} from './api';
import {TimelineConfig} from '../timeline';
import {Observable} from 'rxjs';
import {SubtitlesApi} from './subtitles-api';
import {VideoApi} from './video-api';
import {AudioApi} from './audio-api';
import {TimelineApi} from './timeline-api';
import {Video, VideoLoadOptions} from '../video';
import {AlertsApi} from './alerts-api';
import {MarkerListConfig} from '../marker-list/marker-list';
import {MarkerListApi} from './marker-list-api';
import {ConfigWithOptionalStyle} from '../layout';
import {RouterVisualizationConfig} from '../router-visualization/router-visualization';
import {RouterVisualizationApi} from './router-visualization-api';
import {TimeRangeMarkerTrackApi} from './time-range-marker-track-api';
import {AuthenticationData} from '../common/authentication';
import {OmakasePlayerConfig} from '../omakase-player';
import {ChromingApi} from './chroming-api';

export interface OmakasePlayerApi extends Api {
  /**
   * Loads new video
   * @param videoSourceUrl Video manifest URL
   */
  loadVideo(videoSourceUrl: string): Observable<Video>;

  /**
   * Loads new video
   *
   * @param videoSourceUrl Video manifest URL
   * @param options
   */
  loadVideo(videoSourceUrl: string, options?: VideoLoadOptions): Observable<Video>;

  /**
   * Creates Timeline
   * @param config Timeline configuration
   */
  createTimeline(config: Partial<ConfigWithOptionalStyle<TimelineConfig>>): Observable<TimelineApi>;

  /**
   * Creates Marker List
   * @param config Marker List configuration
   */
  createMarkerList(config: MarkerListConfig): Observable<MarkerListApi>;

  /**
   * Initializes Router Visualization component
   * @param config Router Visualization configuration
   */
  initializeRouterVisualization(config: RouterVisualizationConfig): RouterVisualizationApi;

  /**
   * Set authentication for HLS.js, VTT and thumbnail image requests
   * @param authentication Basic authentication, Bearer token authentication or custom authentication function
   */
  setAuthentication(authentication: AuthenticationData): void;

  /**
   * @returns Timeline API
   */
  get timeline(): TimelineApi | undefined;

  /**
   * @returns Video API
   */
  get video(): VideoApi;

  /**
   * @returns Audio API
   */
  get audio(): AudioApi;

  /**
   * @returns Subtitles API
   */
  get subtitles(): SubtitlesApi;

  /**
   * @returns Chroming API
   */
  get chroming(): ChromingApi;

  /**
   * @returns OmakasePlayerConfig
   */
  get config(): OmakasePlayerConfig;

  set config(config: OmakasePlayerConfig);

  /**
   * Destroys OmakasePlayer instance and frees up memory
   */
  destroy(): void;
}
