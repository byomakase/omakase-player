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
import {OmakaseEventEmitter} from '../events';
import {OmakasePlayerEventMap, OmakasePlayerEventsType} from '../types';
import {AudioApi} from './audio-api';
import {TimelineApi} from './timeline-api';
import {Video, VideoLoadOptions} from '../video';
import {AlertsApi} from './alerts-api';
import {MarkerListConfig} from '../marker-list/marker-list';
import {MarkerListApi} from './marker-list-api';
import {ConfigWithOptionalStyle} from '../layout';
import {AuthenticationData} from '../authentication/model';

export interface OmakasePlayerApi extends Api, OmakaseEventEmitter<OmakasePlayerEventMap> {
  /**
   * Loads new video
   * @param videoSourceUrl Video manifest URL
   * @param frameRate Video frame rate
   */
  loadVideo(videoSourceUrl: string, frameRate: number | string): Observable<Video>;

  /**
   * Loads new video
   *
   * @param videoSourceUrl Video manifest URL
   * @param frameRate Video frame rate
   * @param options
   */
  loadVideo(videoSourceUrl: string, frameRate: number | string, options?: VideoLoadOptions): Observable<Video>;

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
   * Set authentication for HLS.js, VTT and thumbnail image requests
   * @param authentication Basic authentication, Bearer token authentication or custom authentication function
   */
  setAuthentication(authentication: AuthenticationData): void;

  /**
   * Set thumbnail vtt url for media chrome thumbnail preview
   * @param vttUrl Thumbnail Vtt Url
   */
  setThumbnailVttUrl(thumbnailVttUrl: string): void;

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
   * @returns Alerts API
   */
  get alerts(): AlertsApi;

  /**
   * @returns Omakase Player events enumeration
   */
  get EVENTS(): OmakasePlayerEventsType;

  /**
   * Destroys OmakasePlayer instance and frees up memory
   */
  destroy(): void;
}
