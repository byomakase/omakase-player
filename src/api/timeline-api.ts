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
import {Observable} from 'rxjs';
import {TimelineScrollEvent, TimelineZoomEvent} from '../types';
import {ScrubberLane, TimelineStyle} from '../timeline';
import {ThumbnailVttFile} from '../track';
import {TimelineLaneApi} from './timeline-lane-api';

export interface TimelineApi extends Api {
  /**
   *  Fires on Timeline scroll
   *  @readonly
   */
  onScroll$: Observable<TimelineScrollEvent>;

  /**
   *  Fires on Timeline zoom
   *  @readonly
   */
  onZoom$: Observable<TimelineZoomEvent>;

  /**
   *  Fires on Timeline style change
   *  @readonly
   */
  onStyleChange$: Observable<TimelineStyle>;

  /**
   * Style getter / setter
   */
  style: TimelineStyle;

  /**
   * Thumbnail VTT file
   * @readonly
   */
  get thumbnailVttFile(): ThumbnailVttFile | undefined;

  /**
   * Timeline zoom
   * @param percent number between 100 and TimelineConfig.zoomMax
   * @param zoomFocusPercent in range from 0 - timeline start or first timestamp, to 100 - timeline end or last timestamop
   */
  zoomTo(percent: number, zoomFocusPercent: number | undefined): number;

  /**
   * Timeline zoom
   * @param percent number between 100 and TimelineConfig.zoomMax
   * @param zoomFocusPercent in range from 0 - timeline start or first timestamp, to 100 - timeline end or last timestamop
   */
  zoomToEased(percent: number, zoomFocusPercent: number | undefined): Observable<number>;

  /**
   * Zoom in. Zoom scale in single method call is defined with TimelineConfig.zoomScale
   */
  zoomInEased(): Observable<number>;

  /**
   * Zoom out. Zoom scale in single method call is defined with TimelineConfig.zoomScale
   */
  zoomOutEased(): Observable<number>;

  /**
   * Zoom to max resolution
   */
  zoomToMaxEased(): Observable<number>;

  /**
   * @returns current zoom perent
   */
  getZoomPercent(): number;

  /**
   * Scrolls timeline
   * @param percent in range from 0 - timeline start or first timestamp, to 100 - timeline end or last timestamop
   */
  scrollToEased(percent: number): Observable<number>;

  /**
   * Scrolls timeline to playhead position
   */
  scrollToPlayheadEased(): Observable<number>;

  /**
   * Adds instantiated TimelineLane to timeline
   * @param timelineLane
   */
  addTimelineLane(timelineLane: TimelineLaneApi): TimelineLaneApi;

  /**
   * Adds instantiated TimelineLane to timeline
   * @param timelineLane
   * @param index
   */
  addTimelineLaneAtIndex(timelineLane: TimelineLaneApi, index: number): TimelineLaneApi;

  /**
   * Removes TimelineLane by id
   * @param id
   */
  removeTimelineLane(id: string): void;

  /**
   * Adds multiple instantiated TimelineLane-s to timeline
   * @param timelineLanes
   */
  addTimelineLanes(timelineLanes: TimelineLaneApi[]): void;

  /**
   * @returns all TimelineLane-s
   */
  getTimelineLanes(): TimelineLaneApi[];

  /**
   * @returns single TimelineLane
   * @param id TimelineLane.id
   */
  getTimelineLane<T extends TimelineLaneApi>(id: string): T | undefined;

  /**
   * @returns ScrubberLane instance
   */
  getScrubberLane(): ScrubberLane;

  /**
   * Shows or hides Timeline description pane
   */
  setDescriptionPaneVisible(visible: boolean): void;

  /**
   * Toggles Timeline description pane
   */
  toggleDescriptionPaneVisible(): void;

  /**
   * Shows or hides Timeline description pane
   */
  setDescriptionPaneVisibleEased(visible: boolean): Observable<void>;

  /**
   * Toggles Timeline description pane
   */
  toggleDescriptionPaneVisibleEased(): Observable<void>;

  /**
   * Load ThumbnailVttFile by url
   */
  loadThumbnailsFromUrl(thumbnailVttUrl: string): Observable<boolean>;

  /**
   * Recalculates and settles layout, called on window resize event
   */
  settleLayout(): void;

  /**
   * Destroys Timeline and it's dependencies
   */
  destroy(): void;
}
