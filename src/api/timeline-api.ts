/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import {Api} from './api';
import {Observable} from 'rxjs';
import {TimelineScrollEvent, TimelineZoomEvent} from '../types';
import {AudioTrackLane, MarkerLane, SubtitlesLane, ThumbnailLane} from '../timeline';
import {GenericTimelaneLane} from '../timeline/timeline-lane';
import {TimelineStyle} from '../timeline';
import {MarkerLaneConfig} from '../timeline/marker/marker-lane';
import {ThumbnailLaneConfig} from '../timeline/thumbnail/thumbnail-lane';
import {SubtitlesLaneConfig} from '../timeline/subtitles/subtitles-lane';
import {ScrubberLane} from '../timeline/scrubber-lane';
import {Scrollbar} from '../timeline/scrollbar';
import {ThumbnailVttFile} from '../track/thumbnail-vtt-file';

export interface TimelineApi extends Api {
  /***
   *  Fires on Timeline scroll
   */
  onScroll$: Observable<TimelineScrollEvent>;

  /***
   *  Fires on Timeline zoom
   */
  onZoom$: Observable<TimelineZoomEvent>;

  get style(): TimelineStyle;

  /***
   * Timeline zoom
   * @param percent number between 100 and TimelineConfig.zoomMax
   */
  zoomTo(percent: number): Observable<number>;

  /***
   * Zoom in. Zoom scale in single method call is defined with TimelineConfig.zoomScale
   */
  zoomIn(): Observable<number>;

  /***
   * Zoom out. Zoom scale in single method call is defined with TimelineConfig.zoomScale
   */
  zoomOut(): Observable<number>;

  /**
   * Zoom to max resolution
   */
  zoomToMax(): Observable<number>;

  /***
   * Returns current zoom perent
   */
  getZoomPercent(): number;

  /***
   * Scrolls timeline
   * @param percent in range from 0 - timeline start or first timestamp, to 100 - timeline end or last timestamop
   */
  scrollTo(percent: number): Observable<number>;

  /***
   * Scrolls timeline to playhead position
   */
  scrollToPlayhead(): Observable<number>;

  getScrollbar(): Scrollbar;

  /***
   * Adds instantiated TimelineLane to timeline
   * @param timelineLane
   */
  addLane(timelineLane: GenericTimelaneLane): void;

  /***
   * Removes TimelineLane by id
   * @param id
   */
  removeLane(id: string);

  /***
   * Adds multiple instantiated TimelineLane-s to timeline
   * @param timelineLanes
   */
  addLanes(timelineLanes: GenericTimelaneLane[]): void;

  /***
   * Returns all TimelineLane-s
   */
  getLanes(): GenericTimelaneLane[];

  /***
   * Returns single TimelineLane
   * @param id TimelineLane.id
   */
  getLane(id: string): GenericTimelaneLane;

  /***
   * Returns ScrubberLane instance
   */
  getScrubberLane(): ScrubberLane;

  /***
   * Returns MarkerLane instance
   * @param id MarkerLane ID
   */
  getMarkerLane(id: string): MarkerLane;

  /***
   * Returns ThumbnailLane instance
   * @param id ThumbnailLane ID
   */
  getThumbnailLane(id: string): ThumbnailLane

  /***
   * Returns SubtitlesLane instance
   * @param id SubtitlesLane ID
   */
  getSubtitlesLane(id: string): SubtitlesLane;

  /***
   * Returns AudioTrackLane instance
   * @param id AudioTrackLane ID
   */
  getAudioTrackLane(id: string): AudioTrackLane;

  /***
   * Creates new MarkerLane and adds it to Timeline
   * @param config MarkerLane config
   */
  createMarkerLane(config: MarkerLaneConfig): MarkerLane;

  /***
   * Creates new ThumbnailLane and adds it to Timeline
   * @param config ThumbnailLane config
   */
  createThumbnailLane(config: ThumbnailLaneConfig): ThumbnailLane;

  /***
   * Creates new SubtitlesLane and adds it to Timeline
   * @param config SubtitlesLane config
   */
  createSubtitlesLane(config: SubtitlesLaneConfig): SubtitlesLane;

  /***
   * Shows or hides Timeline left panel
   * @param visible
   */
  toggleLeftPanelVisible(visible: boolean): void;

  /**
   * Return ThumbnailVttFile if set
   */
  getThumbnailVttFile(): ThumbnailVttFile;

  /**
   * Load ThumbnailVttFile by url
   */
  loadThumbnailsFromUrl(thumbnailVttUrl: string): Observable<boolean>;

  destroy();
}
