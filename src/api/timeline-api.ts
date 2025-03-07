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
import {PlayheadMoveEvent, ScrubberMoveEvent, TimecodeClickEvent, TimecodeMouseMoveEvent, TimelineReadyEvent, TimelineScrollEvent, TimelineZoomEvent} from '../types';
import {ScrubberLane, TimelineStyle} from '../timeline';
import {TimelineLaneApi} from './timeline-lane-api';
import {ThumbnailVttFile} from '../vtt';

export interface TimelineApi extends Api {
  /**
   * Fires when Timeline is ready and all timeline lanes are created. Initial value is undefined.
   * Always emits the current value on subscription.
   *
   * @readonly
   */
  onReady$: Observable<TimelineReadyEvent | undefined>;

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
   * Fires on click anywhere on Timeline where timecode of the video can be determined
   */
  onTimecodeClick$: Observable<TimecodeClickEvent>;

  /**
   * Fires on mouse move anywhere on Timeline where timecode of the video can be determined
   */
  onTimecodeMouseMove$: Observable<TimecodeMouseMoveEvent>;

  /**
   * Fires on moving the scrubber
   */
  onScrubberMove$: Observable<ScrubberMoveEvent>;

  /**
   * Fires on moving the playhead
   */
  onPlayheadMove$: Observable<PlayheadMoveEvent>;

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
   * @returns true if visible, false if not visible
   */
  get descriptionPaneVisible(): boolean;

  /**
   * Timeline zoom
   * @param percent number between 100 and TimelineConfig.zoomMax
   */
  zoomTo(percent: number): number;

  /**
   * Timeline zoom
   * @param percent number between 100 and {@link TimelineConfig.zoomMax}
   * @param zoomFocusPercent in range from 0 - timeline start or first timestamp, to 100 - timeline end or last timestamop
   */
  zoomTo(percent: number, zoomFocusPercent: number | undefined): number;

  /**
   * Timeline zoom
   * @param percent number between 100 and {@link TimelineConfig.zoomMax}
   */
  zoomToEased(percent: number): Observable<number>;

  /**
   * Timeline zoom
   * @param percent number between 100 and {@link TimelineConfig.zoomMax}
   * @param zoomFocusPercent in range from 0 - timeline start or first timestamp, to 100 - timeline end or last timestamop
   */
  zoomToEased(percent: number, zoomFocusPercent: number | undefined): Observable<number>;

  /**
   * Zoom in. Zoom scale in single method call is defined with TimelineConfig.zoomScale
   */
  zoomInEased(): Observable<number>;

  /**
   * Zoom out. Zoom scale in single method call is defined with {@link TimelineConfig.zoomScale}
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
   * Adds {@link TimelineLaneApi} instance to timeline
   * @param timelineLane
   */
  addTimelineLane(timelineLane: TimelineLaneApi): TimelineLaneApi;

  /**
   * Adds {@link TimelineLaneApi} instance to timeline
   * @param timelineLane
   * @param index
   */
  addTimelineLaneAtIndex(timelineLane: TimelineLaneApi, index: number): TimelineLaneApi;

  /**
   * Removes {@link TimelineLaneApi} instance by id
   * @param id {@link TimelineLaneApi.id}
   */
  removeTimelineLane(id: string): void;

  /**
   * Removes {@link TimelineLaneApi} instances by ids
   * @param ids {@link TimelineLaneApi.id}s
   */
  removeTimelineLanes(ids: string[]): void;

  /**
   * Removes all timeline lanes
   */
  removeAllTimelineLanes(): void;

  /**
   * Adds multiple instantiated {@link TimelineLaneApi} instances to timeline
   * @param timelineLanes
   */
  addTimelineLanes(timelineLanes: TimelineLaneApi[]): TimelineLaneApi[];

  /**
   * @returns all {@link TimelineLaneApi} instances
   */
  getTimelineLanes(): TimelineLaneApi[];

  /**
   * @returns single {@link TimelineLaneApi} instance
   * @param id {@link TimelineLaneApi.id}
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
   * Toggles the CTI between its interactive and read-only state
   */
  toggleTimecodeEdit(): void;

  /**
   * Load ThumbnailVttFile
   */
  loadThumbnailVttFileFromUrl(vttUrl: string): Observable<ThumbnailVttFile | undefined>;

  /**
   * Load ThumbnailVttFile by url
   */
  loadThumbnailVttFile(vttFile: ThumbnailVttFile): void;

  /**
   * Minimize timeline lanes
   * @param timelineLanes
   */
  minimizeTimelineLanes(timelineLanes: TimelineLaneApi[]): void;

  /**
   * Maximize timeline lanes
   * @param timelineLanes
   */
  maximizeTimelineLanes(timelineLanes: TimelineLaneApi[]): void;

  /**
   * Recalculates and settles layout, called on window resize event
   */
  settleLayout(): void;

  /**
   * Destroys Timeline and it's dependencies
   */
  destroy(): void;
}
