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

import {Observable} from 'rxjs';
import {MarkerTrackConfig, VideoSafeZone} from '../video/model';
import {Api} from './api';
import {MarkerTrackApi} from './marker-track-api';
import {HelpMenuGroup} from '../types';
import {TimeRangeMarkerTrackApi} from './time-range-marker-track-api';
import {AlertsApi} from './alerts-api';

export interface ChromingApi extends Api {
  /**
   * @returns Alerts API
   */
  get alerts(): AlertsApi;

  /**
   * @returns TimeRangeMarkerTrackApi
   */
  get progressMarkerTrack(): TimeRangeMarkerTrackApi | undefined;

  /**
   * Set thumbnail vtt url for player chroming thumbnail preview
   * @param thumbnailVttUrl Thumbnail Vtt Url
   */
  setThumbnailVttUrl(thumbnailVttUrl: string): void;

  /**
   * Set watermark text or svg for player chroming
   * @param watermark Watermark text or svg
   */
  setWatermark(watermark: string): void;

  /**
   * Get
   * @param querySelector HTML query selector
   */
  getPlayerChromingElement<T>(querySelector: string): T;

  /**
   * Creates Marker Track
   * @param config Marker Track configuration
   */
  createMarkerTrack(config: MarkerTrackConfig): Observable<MarkerTrackApi>;

  /**
   * Appends new HelpMenuGroup to video context menu
   * @param helpMenuGroup
   */
  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void>;

  /**
   * Appends new HelpMenuGroup to video context menu
   * @param helpMenuGroup
   */
  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void>;

  /**
   * Removes help menu groups
   */
  clearHelpMenuGroups(): Observable<void>;

  /**
   * @returns available HelpMenuGroup's
   */
  getHelpMenuGroups(): HelpMenuGroup[];

  /**
   * Adds safe zone area.
   * @returns safe zone id.
   * @param videoSafeZone
   */
  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone>;

  /**
   * Removes safe zone area
   *
   * @param id
   */
  removeSafeZone(id: string): Observable<void>;

  /**
   * Clears all added safe zones
   */
  clearSafeZones(): Observable<void>;

  /**
   * @returns video safe zones
   */
  getSafeZones(): VideoSafeZone[];

  /**
   * Sets the visibility of the floating time (BITC) control
   * @param visible visibility value
   */
  setFloatingTimeVisible(visible: boolean): void;

  /**
   * Returns the current visibility value of the floating time (BITC) control
   */
  isFloatingTimeVisible(): boolean | undefined;
}
