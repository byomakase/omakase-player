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

import {MomentMarker, MomentMarkerConfig} from '../timeline/marker/moment-marker';
import {PeriodMarker, PeriodMarkerConfig} from '../timeline/marker/period-marker';
import {Observable} from 'rxjs';
import {MarkerFocusEvent, MarkerVttCue} from '../types';
import {Marker} from '../timeline';
import {VttAwareApi} from './vtt-aware-api';
import {MarkerVttFile} from '../vtt';
import {ConfigWithOptionalStyle} from '../layout';
import {MarkerAwareApi} from './marker-aware-api';

export interface MarkerLaneApi extends MarkerAwareApi, VttAwareApi<MarkerVttCue, MarkerVttFile> {


  /**
   *  Fires on marker focus
   *  @readonly
   */
  onMarkerFocus$: Observable<MarkerFocusEvent>;

  /**
   * Creates new MomentMarker instance and adds it to MarkerLane
   * @param config MomentMarker configuration
   */
  createMomentMarker(config: ConfigWithOptionalStyle<MomentMarkerConfig>): MomentMarker;

  /**
   * Creates new PeriodMarker instance and adds it to MarkerLane
   * @param config PeriodMarkern configuration
   */
  createPeriodMarker(config: ConfigWithOptionalStyle<PeriodMarkerConfig>): PeriodMarker;

  /**
   * Adds Marker to MarkerLane
   * @param marker Marker instance
   */
  addMarker(marker: Marker): Marker;

  /**
   * @returns Marker by ID
   * @param id Marker ID
   */
  getMarker(id: string): Marker | undefined;

  /**
   * Removes all Marker's
   */
  removeAllMarkers(): void;

  /**
   * Focuses Marker by ID
   * @param id Marker ID
   */
  focusMarker(id: string): void;

  /**
   * @returns Marker in focus
   */
  getMarkerInFocus(): Marker | undefined;
}
