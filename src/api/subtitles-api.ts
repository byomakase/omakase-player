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
import {SubtitlesCreateEvent, SubtitlesEvent, SubtitlesLoadedEvent, SubtitlesVttTrack} from '../types';

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
  onCreate$: Observable<SubtitlesCreateEvent>;

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
   * @param track
   */
  createVttTrack(track: Pick<SubtitlesVttTrack, 'id' | 'src' | 'default' | 'label' | 'language'>): Observable<SubtitlesVttTrack | undefined>;

  /**
   * @returns all VTT tracks
   */
  getTracks(): SubtitlesVttTrack[];

  /**
   * Removes VTT track by ID
   * @param id VTT track ID
   */
  removeTrack(id: string): Observable<void>;

  /**
   * Removes all VTT tracks
   */
  removeAllTracks(): Observable<void>;

  /**
   * @returns active VTT track
   */
  getActiveTrack(): SubtitlesVttTrack | undefined;

  /**
   * Shows VTT track by ID
   * @param id VTT track ID
   */
  showTrack(id: string): Observable<void>;

  /**
   * Hides VTT track by ID
   * @param id VTT track ID
   */
  hideTrack(id: string): Observable<void>;

  /**
   * Shows active VTT track
   */
  showActiveTrack(): Observable<void>;

  /**
   * Hides active VTT track
   */
  hideActiveTrack(): Observable<void>;

  /**
   * Toggles show / hide of active VTT track
   */
  toggleShowHideActiveTrack(): Observable<void>;

}
