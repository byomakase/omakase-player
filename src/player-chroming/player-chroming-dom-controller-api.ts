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

import {MediaController} from 'media-chrome';
import {MediaThemeElement} from 'media-chrome/dist/media-theme-element';
import {Observable} from 'rxjs';
import {VideoControllerApi} from '../video';
import {MarkerTrackConfig} from '../video/model';
import {MarkerTrackApi} from '../api';
import {TimeRangeMarkerTrackApi} from '../api/time-range-marker-track-api';
import {PlayerChroming} from './model';

export interface PlayerChromingDomControllerApi {
  get mediaControllerElement(): MediaController;
  get themeElement(): MediaThemeElement;
  get playerChroming(): PlayerChroming;
  set playerChroming(playerChroming: PlayerChroming);

  createTemplateDom(): string;

  createSlotsDom(): string;

  initializeDomProperties(): void;

  updateControlBar(): void;

  updateBitc(): void;

  loadThumbnailVtt(vttUrl: string): Observable<void>;

  attachVideoController(videoController: VideoControllerApi): void;

  createMarkerTrack(config: MarkerTrackConfig): MarkerTrackApi;

  getProgressMarkerTrack(): TimeRangeMarkerTrackApi | undefined;

  hideStampOverlay(): void;

  destroy(): void;
}
