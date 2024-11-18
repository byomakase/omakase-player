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

import { Observable } from 'rxjs';
import { Api } from './api';
import { MarkerCreateEvent, MarkerDeleteEvent, MarkerInitEvent, MarkerUpdateEvent } from '../types';
import { MarkerApi } from './marker-api';

export interface MarkerAwareApi extends Api {
  /**
   *  Fires on loading the initial list of markers
   *  @readonly
   */
  onMarkerInit$: Observable<MarkerInitEvent>;

  /**
   *  Fires on marker create
   *  @readonly
   */
  onMarkerCreate$: Observable<MarkerCreateEvent>;

  /**
   *  Fires on marker delete
   *  @readonly
   */
  onMarkerDelete$: Observable<MarkerDeleteEvent>;

  /**
   *  Fires on marker update
   *  @readonly
   */
  onMarkerUpdate$: Observable<MarkerUpdateEvent>;

  /**
   * Track name
   */
  get name(): string;

  /**
   * @returns all Markers
   */
  getMarkers(): MarkerApi[];

  /**
   * Adds a new marker
   * @param marker Marker Data
   */
  addMarker(marker: Partial<MarkerApi>): MarkerApi;

  /**
   * Removes Marker by ID
   * @param id Marker ID
   */
  removeMarker(id: string): void;

  /**
   * Updates Marker by ID
   * @param id Marker ID
   */
  updateMarker(id: string, data: Partial<MarkerApi>): void;

  /**
   * Set selected Marker as active
   * @param id Marker ID
   */
  toggleMarker(id: string): void;
}
