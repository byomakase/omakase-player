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

import {Observable} from 'rxjs';
import type {Destroyable, Serializable} from '../common/capabilities';
import type {TimelineLaneApi} from './timeline-lane-api';
import {ScrubberLane} from './scrubber';
import {ThumbnailTrack} from '../media';
import type {Position} from './model';

export type ConfigAndStyle<C, S> = Partial<C> & {style?: Partial<S>};


export enum TimelineEventType {
  TIMELINE_READY = 'TIMELINE_READY',

  TIMELINE_STYLE_CHANGE = 'TIMELINE_STYLE_CHANGE',

  TIMELINE_SCROLL = 'TIMELINE_SCROLL',
  TIMELINE_ZOOM = 'TIMELINE_ZOOM',
  TIMELINE_RESIZE = 'TIMELINE_RESIZE',

  TIMELINE_TIMECODE_CLICK = 'TIMELINE_TIMECODE_CLICK',
  TIMELINE_TIMECODE_MOUSE_MOVE = 'TIMELINE_TIMECODE_MOUSE_MOVE',
  TIMELINE_SCRUBBER_MOVE = 'TIMELINE_SCRUBBER_MOVE',
  TIMELINE_PLAYHEAD_MOVE = 'TIMELINE_PLAYHEAD_MOVE',
}

export interface TimelineState {

}

export interface TimelineEventData extends Serializable {
  timeline: TimelineState;
}

export interface TimelineScrollEventData {
  scrollPercent: number;
}

export interface TimelineResizeEventData extends TimelineEventData {}

export interface TimelineStyleChangeEventData {
  style: TimelineStyle;
}

export interface TimelineCancelableEvent extends Serializable {
  cancelableEvent: {
    cancelBubble: boolean;
  };
}

export interface TimelineMouseEventData extends TimelineCancelableEvent {
  mouseEvent: MouseEvent;
  pointerPosition: Position;
}

export interface TimelineTimecodeMouseMoveEventData extends TimelineMouseEventData {
  timecode: string;
}

export interface TimelineTimecodeClickEventData extends TimelineMouseEventData {
  seconds: number;
  timecode: string;
}

export interface TimelineScrubberMoveEventData extends Serializable {
  timecode: string;
  snapped: boolean;
}

export interface TimelinePlayheadMoveEventData extends Serializable {
  timecode: string;
}

export interface TimelineZoomEventData extends Serializable {
  zoomPercent: number;
}

export type TimelineEventTypeDataMap = {
  [TimelineEventType.TIMELINE_READY]: TimelineEventData;

  [TimelineEventType.TIMELINE_STYLE_CHANGE]: TimelineStyleChangeEventData;

  [TimelineEventType.TIMELINE_SCROLL]: TimelineScrollEventData;
  [TimelineEventType.TIMELINE_ZOOM]: TimelineZoomEventData;
  [TimelineEventType.TIMELINE_RESIZE]: TimelineResizeEventData;

  [TimelineEventType.TIMELINE_TIMECODE_CLICK]: TimelineTimecodeClickEventData;
  [TimelineEventType.TIMELINE_TIMECODE_MOUSE_MOVE]: TimelineTimecodeMouseMoveEventData;
  [TimelineEventType.TIMELINE_SCRUBBER_MOVE]: TimelineScrubberMoveEventData;
  [TimelineEventType.TIMELINE_PLAYHEAD_MOVE]: TimelinePlayheadMoveEventData;
};

export type TimelineEvent = {
  [K in TimelineEventType]: {
    type: K;
    data: TimelineEventTypeDataMap[K];
  };
}[keyof TimelineEventTypeDataMap];

export interface TimelineConfig {
  htmlElementId: string;

  scrubberSnapArea: number;
  playheadDragScrollMaxSpeedAfterPx: number;

  zoomWheelEnabled: boolean;

  zoomScale: number;
  zoomScaleWheel: number;

  zoomBaseline: number;
  zoomMax: number;

  layoutEasingDuration: number;
  zoomEasingDuration: number;
  scrollEasingDuration: number;

  scrubberClickSeek: boolean;
  timecodeClickEdit: boolean;
}

export interface TimelineStyle {
  textFontFamily: string;
  textFontStyle: string;

  stageMinWidth: number;
  stageMinHeight: number;

  backgroundFill: string;
  backgroundOpacity: number;

  headerHeight: number;
  headerMarginBottom: number;
  headerBackgroundFill: string;
  headerBackgroundOpacity: number;

  footerHeight: number;
  footerMarginTop: number;
  footerBackgroundFill: string;
  footerBackgroundOpacity: number;

  // scrollbarHeight: number;
  // scrollbarWidth: number;
  // scrollbarBackgroundFill: string;
  // scrollbarBackgroundFillOpacity: number;
  // scrollbarHandleBarFill: string;
  // scrollbarHandleBarOpacity: number;
  // scrollbarHandleOpacity: number;

  thumbnailHoverWidth: number;
  thumbnailHoverStroke: string;
  thumbnailHoverStrokeWidth: number;
  thumbnailHoverYOffset: number;

  leftPaneWidth: number;
  rightPaneMarginLeft: number;
  rightPaneMarginRight: number;
  rightPaneClipPadding: number;

  // playhead
  playheadVisible: boolean;
  playheadFill: string;
  playheadLineWidth: number;
  playheadSymbolHeight: number;
  playheadScrubberHeight: number;
  playheadBackgroundFill: string;
  playheadBackgroundOpacity: number;
  playheadTextFill: string;
  playheadTextYOffset: number;
  playheadTextFontSize: number;

  playheadPlayProgressFill: string;
  playheadPlayProgressOpacity: number;

  playheadBufferedFill: string;
  playheadBufferedOpacity: number;

  // playhead hover
  scrubberVisible: boolean;
  scrubberFill: string;
  scrubberSnappedFill: string;

  scrubberNorthLineWidth: number;
  scrubberNorthLineOpacity: number;
  scrubberSouthLineWidth: number;
  scrubberSouthLineOpacity: number;

  scrubberSymbolHeight: number;
  scrubberTextFill: string;
  scrubberTextYOffset: number;
  scrubberTextFontSize: number;

  scrubberHeight: number;
  scrubberMarginBottom: number;

  loadingAnimationTheme: 'light' | 'dark';
}

export interface TimelineApi extends Destroyable {
  /**
   * Stream of all events emitted by this timeline instance, including lifecycle events
   * ({@link TimelineEventType.TIMELINE_READY}), viewport changes ({@link TimelineEventType.TIMELINE_SCROLL},
   * {@link TimelineEventType.TIMELINE_ZOOM}, {@link TimelineEventType.TIMELINE_RESIZE}),
   * and interaction events ({@link TimelineEventType.TIMELINE_TIMECODE_CLICK},
   * {@link TimelineEventType.TIMELINE_SCRUBBER_MOVE}, {@link TimelineEventType.TIMELINE_PLAYHEAD_MOVE}).
   */
  onEvent$: Observable<TimelineEvent>;

  /**
   * Unique identifier for this timeline instance.
   */
  id: string;

  /**
   * Current style configuration of the timeline.
   * Reflects the active visual settings such as dimensions, colours, and playhead appearance.
   * @see {@link TimelineStyle}
   */
  style: TimelineStyle;

  /**
   * Current runtime state of the timeline.
   * @see {@link TimelineState}
   */
  state: TimelineState;

  /**
   * @returns true if visible, false if not visible
   */
  descriptionPaneVisible: boolean;

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


  setThumbnailTrack(track: ThumbnailTrack): void;

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
