/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
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

import type {Observable} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import type {Marker, MarkerState, MarkerTrack, MarkerUpdateableAttrs} from '../media';
import type {MarkerListEvent} from './marker-list-event';

export interface MarkerListApi extends Destroyable {
  onEvent$: Observable<MarkerListEvent>;

  /**
   * Links another Marker Track to the Marker List
   * @param track Marker Track or Marker Track id
   */
  addTrack(track: MarkerTrack | MarkerTrack['id']): void;

  /**
   * Unlinks a Marker Track from the Marker List
   * @param trackId Marker Track id
   */
  removeTrack(trackId: MarkerTrack['id']): void;

  /**
   * @returns all linked Marker Tracks
   */
  getTracks(): MarkerTrack[];
}
