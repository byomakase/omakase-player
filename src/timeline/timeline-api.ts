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
import type {TimelineSlotApi} from './timeline-slot-api';
import type {TimelineSlotType} from './timeline-slot-type';
import type {PrefixKeys} from '../types/ts-types';
import type {VerticalScrollbarStyle} from './scrollbar/vertical-scrollbar';
import type {PlayheadStyle} from './playhead';
import type {PlayheadBufferStyle} from './playhead-buffer';
import type {ScrubberStyle} from './scrubber/scrubber';
import type {LiveEdgeOverlayStyle} from './live/live-edge-overlay';
import type {EvictedRegionOverlayStyle} from './live/evicted-region-overlay';
import type {VerticalScrollOptions} from './vertical-scroll';

export type ConfigAndStyle<C, S> = Partial<C> & {style?: Partial<S>};

export enum TimelineEventType {
  TIMELINE_READY = 'TIMELINE_READY',

  TIMELINE_STYLE_CHANGE = 'TIMELINE_STYLE_CHANGE',

  TIMELINE_SCROLL = 'TIMELINE_SCROLL',
  TIMELINE_ZOOM = 'TIMELINE_ZOOM',
  TIMELINE_SLOT_SCROLL = 'TIMELINE_SLOT_SCROLL',

  TIMELINE_TIMECODE_CLICK = 'TIMELINE_TIMECODE_CLICK',
  TIMELINE_TIMECODE_MOUSE_MOVE = 'TIMELINE_TIMECODE_MOUSE_MOVE',
  TIMELINE_SCRUBBER_MOVE = 'TIMELINE_SCRUBBER_MOVE',
  TIMELINE_PLAYHEAD_MOVE = 'TIMELINE_PLAYHEAD_MOVE',

  /** Live mode only — fires whenever the rendered left bound advances; see {@link TimelineConfig.liveHistoryRetention}. */
  TIMELINE_LIVE_ORIGIN_ADVANCED = 'TIMELINE_LIVE_ORIGIN_ADVANCED',
}

export interface TimelineState {
  /** Whether the timeline is currently rendering live media. When false, {@link liveExtentEnd} is meaningless. */
  isLive: boolean;
  /** Right edge of the live coordinate domain (media-element-absolute time), including any reserved locked region. */
  liveExtentEnd: number;
}

export interface TimelineEventData extends Serializable {
  timeline: TimelineState;
}

export interface TimelineScrollEventData {
  scrollPercent: number;
}

/**
 * Emitted on vertical scroll of a slot. Currently only the MAIN slot scrolls vertically —
 * HEADER and FOOTER never emit this.
 */
export interface TimelineSlotScrollEventData {
  slot: TimelineSlotType;
  scrollPercent: number;
  deltaPercent: number;
}

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

/** `origin` is the new, advanced left edge of the live coordinate domain (media-element-absolute time). */
export interface TimelineLiveOriginAdvancedEventData extends Serializable {
  origin: number;
}

export type TimelineEventTypeDataMap = {
  [TimelineEventType.TIMELINE_READY]: TimelineEventData;

  [TimelineEventType.TIMELINE_STYLE_CHANGE]: TimelineStyleChangeEventData;

  [TimelineEventType.TIMELINE_SCROLL]: TimelineScrollEventData;
  [TimelineEventType.TIMELINE_ZOOM]: TimelineZoomEventData;
  [TimelineEventType.TIMELINE_SLOT_SCROLL]: TimelineSlotScrollEventData;

  [TimelineEventType.TIMELINE_TIMECODE_CLICK]: TimelineTimecodeClickEventData;
  [TimelineEventType.TIMELINE_TIMECODE_MOUSE_MOVE]: TimelineTimecodeMouseMoveEventData;
  [TimelineEventType.TIMELINE_SCRUBBER_MOVE]: TimelineScrubberMoveEventData;
  [TimelineEventType.TIMELINE_PLAYHEAD_MOVE]: TimelinePlayheadMoveEventData;
  [TimelineEventType.TIMELINE_LIVE_ORIGIN_ADVANCED]: TimelineLiveOriginAdvancedEventData;
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

  /**
   * Live mode only. Seconds of "excess space" manually reserved as a locked/unreachable region past the
   * live edge, absorbing manifest growth without reflowing the timeline until it's used up. When
   * undefined, the locked region is always the automatic minimum (`liveEdgeDuration - liveSyncPosition`),
   * so every manifest update that grows the edge reflows the timeline.
   *
   * Its "absorb without reflow" benefit is EVENT-mode-centric: for a CONTINUOUS (sliding-window)
   * stream, `liveStartTime` drifts on essentially every manifest update regardless of this setting,
   * which alone makes the timeline reflow-eligible — this option only governs whether the *extent*
   * side of that reflow also grows, not whether a reflow happens at all. {@link liveReflowCadence} is
   * the setting that actually throttles reflow frequency for CONTINUOUS streams.
   */
  liveEdgeBufferSpace?: number;

  /**
   * Live mode only. Minimum accumulated growth of `liveEdgeDuration` (seconds) required between
   * geometry reflows (timecoded-width resize/reposition) while live. Segment/manifest updates that
   * arrive in between are absorbed silently — the rendered width, scroll position, and every
   * derived coordinate (ticks, markers, playhead) stay exactly as they were — until accumulated
   * growth since the last reflow reaches this cadence, at which point a single reflow catches up
   * all of the held growth at once. The live-edge-proximity overlay keeps tracking every update
   * regardless of this setting. When undefined, every live-state update that changes the geometry
   * reflows immediately (the previous default behavior).
   */
  liveReflowCadence?: number;

  /**
   * Live mode only. When `true`, an automatic scroll-to-live-edge snap animates the scroll position
   * over {@link scrollEasingDuration} instead of jumping there instantly. The timeline's width still
   * resizes immediately to fit the new extent — only the follow-scroll itself eases. Manual
   * scrolling/zooming is unaffected. Defaults to `false` (instant snap).
   */
  liveScrollSmoothing?: boolean;

  /**
   * CONTINUOUS live mode only. Seconds of "evicted but still shown" slack the rendered timeline's
   * left bound is allowed to lag behind the true, current live start by, **at all times** — a
   * continuously-maintained rolling cap, not a one-time batch flush.
   *
   * Undefined (default): today's behavior — the left bound tracks the true live start exactly, on
   * every reflow. The timeline never shows anything the player can no longer actually seek to.
   *
   * Set: the left bound trails the true live start by up to (never more than) this many seconds,
   * advancing incrementally alongside it rather than jumping — so at most this many seconds of
   * otherwise-evicted content stays visible/scrollable-to at any given moment. This cap is enforced
   * every tick regardless of {@link liveReflowCadence} (an unrelated, extent-growth-only throttle) —
   * "at most N seconds" is a hard guarantee. The gap can still be closed completely on demand,
   * independent of the cap, via {@link TimelineApi.evictLiveHistory}. Either way, emits {@link
   * TimelineEventType.TIMELINE_LIVE_ORIGIN_ADVANCED} whenever the left bound actually advances, so
   * lanes holding onto now-unreachable items (e.g. thumbnails, which are never pruned upstream) can
   * release them.
   */
  liveHistoryRetention?: number;
}

export interface TimelineStyle
  extends
    PrefixKeys<VerticalScrollbarStyle, 'verticalScrollbar'>,
    PrefixKeys<Omit<PlayheadStyle, 'draggingFill' | 'symbolYOffset'>, 'playhead'>,
    PrefixKeys<PlayheadBufferStyle, 'playhead'>,
    PrefixKeys<Omit<ScrubberStyle, 'textSnappedFill' | 'symbolYOffset'>, 'scrubber'>,
    PrefixKeys<LiveEdgeOverlayStyle, 'liveEdgeOverlay'>,
    PrefixKeys<EvictedRegionOverlayStyle, 'evictedRegionOverlay'> {
  /**
   * Minimum timeline width in pixels. The timeline never renders narrower than this, regardless of
   * the container's actual width.
   */
  minWidth: number;

  /**
   * Minimum timeline height in pixels. The timeline never renders shorter than this, regardless of
   * content height or {@link maxHeight}.
   */
  minHeight: number;

  /**
   * Maximum total timeline height in pixels.
   * MAIN slot is clamped to maxHeight − HEADER height − FOOTER height.
   * When undefined, the timeline height is unconstrained.
   */
  maxHeight?: number;

  textFontFamily: string;
  textFontStyle: string;

  backgroundFill: string;
  backgroundOpacity: number;

  /**
   * Outer padding around the timeline's content (HEADER + MAIN + FOOTER as a whole), in pixels.
   * Follows CSS `padding` shorthand: a single number applies to all sides; a 2-element array is
   * `[vertical, horizontal]`; a 4-element array is `[top, right, bottom, left]`. Undefined means
   * no padding.
   */
  padding?: number | number[];

  thumbnailHoverWidth: number;
  thumbnailHoverStroke: string;
  thumbnailHoverStrokeWidth: number;
  thumbnailHoverYOffset: number;

  leftPaneWidth: number;
  rightPaneMarginLeft: number;
  rightPaneMarginRight: number;
  rightPaneClipPadding: number;

  leftPaneBackgroundFill?: string;
  leftPaneBackgroundOpacity?: number;
  rightPaneBackgroundFill?: string;
  rightPaneBackgroundOpacity?: number;

  loadingAnimationTheme: 'light' | 'dark';
}

export interface TimelineApi extends Destroyable {
  /**
   * Stream of all events emitted by this timeline instance, including lifecycle events
   * ({@link TimelineEventType.TIMELINE_READY}), viewport changes ({@link TimelineEventType.TIMELINE_SCROLL},
   * {@link TimelineEventType.TIMELINE_ZOOM}, {@link TimelineEventType.TIMELINE_SLOT_SCROLL}),
   * and interaction events ({@link TimelineEventType.TIMELINE_TIMECODE_CLICK},
   * {@link TimelineEventType.TIMELINE_SCRUBBER_MOVE}, {@link TimelineEventType.TIMELINE_PLAYHEAD_MOVE}).
   */
  readonly onEvent$: Observable<TimelineEvent>;

  /**
   * Unique identifier for this timeline instance.
   */
  readonly id: string;

  /**
   * Current style configuration of the timeline.
   * Reflects the active visual settings such as dimensions, colours, and playhead appearance.
   * @see {@link TimelineStyle}
   */
  readonly style: TimelineStyle;

  /**
   * Current runtime state of the timeline.
   * @see {@link TimelineState}
   */
  readonly state: TimelineState;

  /**
   * Live mode only. Forces the rendered left bound to fully catch up to the true, current live
   * start — unlike {@link TimelineConfig.liveHistoryRetention}'s automatic behavior, which only
   * ever maintains a bounded (at-most-threshold) trailing gap and never fully closes it by itself.
   * A no-op if there's nothing to evict, including whenever no threshold is configured (the left
   * bound already tracks the true live start exactly in that case).
   */
  evictLiveHistory(): void;

  /**
   * Live-updates the timeline's style. Only the provided fields are changed; everything else
   * keeps its current value. Propagates to the playhead, scrubber, vertical scrollbar,
   * thumbnail hover preview, slots, and every timeline lane, and emits
   * {@link TimelineEventType.TIMELINE_STYLE_CHANGE}.
   * @param style
   */
  setStyle(style: Partial<TimelineStyle>): void;

  /**
   * @returns true if visible, false if not visible
   */
  readonly descriptionPaneVisible: boolean;

  /**
   * ScrubberLane instance.
   */
  readonly scrubberLane: ScrubberLane;

  /**
   * Get a slot by type — HEADER (adaptive height, stacked above MAIN), MAIN (bounded/scrollable
   * height, the primary content area), or FOOTER (adaptive height, stacked below MAIN).
   */
  getSlot(type: TimelineSlotType): TimelineSlotApi;

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
   * Adds {@link TimelineLaneApi} instance to a slot.
   * @param timelineLane
   * @param options
   * @param options.slot Target slot — HEADER, MAIN, or FOOTER. Defaults to MAIN.
   * @param options.index Position within the slot; defaults to end.
   */
  addTimelineLane(timelineLane: TimelineLaneApi, options?: {index?: number | undefined; slot?: TimelineSlotType | undefined}): TimelineLaneApi;

  /**
   * Adds multiple instantiated {@link TimelineLaneApi} instances to a slot.
   * @param timelineLanes
   * @param options
   * @param options.index Starting index for the added lanes; each subsequent lane is inserted right after the previous one. Defaults to end of slot.
   * @param options.slot Target slot — HEADER, MAIN, or FOOTER. Defaults to MAIN.
   */
  addTimelineLanes(timelineLanes: TimelineLaneApi[], options?: {index?: number | undefined; slot?: TimelineSlotType | undefined}): TimelineLaneApi[];

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
   * @param slot Slot to get lanes from. Defaults to MAIN when omitted (backward-compatible shortcut).
   * @returns {@link TimelineLaneApi} instances in the given slot.
   */
  getTimelineLanes(slot?: TimelineSlotType): TimelineLaneApi[];

  /**
   * @returns single {@link TimelineLaneApi} instance
   * @param id {@link TimelineLaneApi.id}
   */
  getTimelineLane<T extends TimelineLaneApi>(id: string): T | undefined;

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

  scrollToLane(laneId: TimelineLaneApi['id'], options?: VerticalScrollOptions): Observable<number>;

  /**
   * Recalculates and settles layout, called on window resize event
   */
  settleLayout(): void;

  /**
   * Destroys Timeline and it's dependencies
   */
  destroy(): void;
}
