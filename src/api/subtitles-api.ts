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
import {BehaviorSubject, Observable} from 'rxjs';
import {SubtitlesEvent, SubtitlesLoadedEvent, SubtitlesVttTrackConfig} from '../types';
import {SubtitlesVttTrack} from '../track';

export interface SubtitlesApi extends Api {

  /**
   * Fires on subtitles load. Initial value is undefined.
   * @readonly
   */
  onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined>;

  /**
   * Fires on subtitles create
   * @readonly
   */
  onCreate$: Observable<SubtitlesEvent>;

  /**
   * Fires on subtitles remove
   * @readonly
   */
  onRemove$: Observable<SubtitlesEvent>;

  /**
   * Fires on subtitles show
   * @readonly
   */
  onShow$: Observable<SubtitlesEvent>;

  /**
   * Fires on subtitles hide
   * @readonly
   */
  onHide$: Observable<SubtitlesEvent>;

  /**
   * Creates new Subtitles VTT track
   * @param config SubtitlesVttTrack configuration
   */
  createVttTrack(config: SubtitlesVttTrackConfig): Observable<SubtitlesVttTrack | undefined>;

  /**
   * @returns all VTT tracks
   */
  getTracks(): SubtitlesVttTrack[];

  /**
   * Removes VTT track by ID
   * @param id VTT track ID
   */
  removeTrack(id: string): void;

  /**
   * Removes all VTT tracks
   */
  removeAllTracks(): void;

  /**
   * @returns current active VTT track
   */
  getCurrentTrack(): SubtitlesVttTrack | undefined;

  /**
   * Shows VTT track by ID
   * @param id VTT track ID
   */
  showTrack(id: string): void;

  /**
   * Hides VTT track by ID
   * @param id VTT track ID
   */
  hideTrack(id: string): void;

  /**
   * Shows active VTT track
   */
  showActiveTrack(): void;

  /**
   * Hides active VTT track
   */
  hideActiveTrack(): void;

  /**
   * Toggles show / hide of active VTT track
   */
  toggleShowHideActiveTrack(): void;

}
