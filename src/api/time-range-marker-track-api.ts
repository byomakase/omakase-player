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
import {MarkerAwareApi} from './marker-aware-api';
import {MarkerMouseEvent, MarkerVttCue} from '../types';
import {VttLoadOptions} from './vtt-aware-api';
import {MarkerApi} from './marker-api';
import {MarkerVttFile} from '../vtt';

export interface TimeRangeMarkerTrackApi extends MarkerAwareApi {
  /**
   * Fires when the mouse enters the marker area
   */
  onMarkerMouseEnter$: Observable<MarkerMouseEvent>;

  /**
   * Fires when the mouse leaves the marker area
   */
  onMarkerMouseLeave$: Observable<MarkerMouseEvent>;

  /**
   * Fires when the marker area is clicked
   */
  onMarkerClick$: Observable<MarkerMouseEvent>;

  /**
   * Fires after VTT file defined in the config is loaded
   */
  onVttLoaded$: Observable<MarkerVttFile | undefined>;

  /**
   * Destroy all markers in the marker track
   */
  loadVtt(vttUrl: string, options: TimeRangeMarkerTrackVttLoadOptions): void;
}

export interface TimeRangeMarkerTrackVttLoadOptions extends VttLoadOptions {
  /**
   * Function to create markers from vtt cues
   *
   * @param marker marker vtt cue object
   * @param index marker vtt cue index
   * @returns marker object
   */
  vttMarkerCreateFn?: (marker: MarkerVttCue, index: number) => MarkerApi;
}
