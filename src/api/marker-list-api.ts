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
import {MarkerVttFile, ThumbnailVttFile} from '../vtt';
import {MarkerListActionEvent, MarkerListClickEvent, MarkerListSelectedEvent} from '../types';
import {MarkerAwareApi} from './marker-aware-api';
import {MarkerApi} from './marker-api';

export interface MarkerListApi extends MarkerAwareApi {
  /**
   * Fires after VTT file defined in the config is loaded
   */
  onVttLoaded$: Observable<MarkerVttFile | undefined>;

  /**
   * Fires after a custom action element is clicked
   */
  onMarkerAction$: Observable<MarkerListActionEvent>;

  /**
   * Fires after a marker list item row is clicked
   */
  onMarkerClick$: Observable<MarkerListClickEvent>;

  /**
   * Fires after a marker list item is toggled on or off
   */
  onMarkerSelected$: Observable<MarkerListSelectedEvent>;

  /**
   * VTT file for generating thumbnail images
   */
  get thumbnailVttFile(): ThumbnailVttFile | undefined;

  set thumbnailVttFile(thumbnailVttFile: ThumbnailVttFile | undefined);

  /**
   * Get currently active marker on the list
   */
  getSelectedMarker(): MarkerApi | undefined;

  /**
   * Destroys Marker List and cleans up resources
   */
  destroy(): void;
}
