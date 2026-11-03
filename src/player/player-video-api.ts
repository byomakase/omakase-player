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
import type {MediaContainerTrack, MediaContainerTrackState, TrackState} from '../media';
import type {PlayerVideoEvent, PlayerVideoState} from './player-video';

export interface PlayerVideoApi extends PlayerVideoCommonApi {
  /**
   * Returns sidecar video tracks loaded by player
   */
  getTracks(): MediaContainerTrack[];
}

export interface PlayerVideoInternalApi extends PlayerVideoCommonApi {
  getTracks(): MediaContainerTrackState[];
}

export interface PlayerVideoCommonApi {
  /**
   * Observable that emits video events as they occur.
   */
  onEvent$: Observable<PlayerVideoEvent>;

  /**
   * Current video state snapshot.
   */
  state: PlayerVideoState;

  /**
   * Activates or deactivates sidecar video. Only one sidecar video can be active, activating sidecar video deactivates the previously active one.
   *
   * Active sidecar video is shown and played with its sound while main media time is inside its time window, slate or main media is shown otherwise.
   * Every sidecar video warms up - plays hidden and muted - shortly before its time window, to pre-buffer and sync before its cut is shown.
   * Inactive sidecar video keeps warming up inside its time window, so it can be activated without seeking.
   *
   * @param trackId - ID of the sidecar video track.
   * @param activate - Whether to activate or deactivate the track. Defaults to `true`.
   */
  switchTrack(trackId: TrackState['id'], activate?: boolean): Observable<void>;
}
