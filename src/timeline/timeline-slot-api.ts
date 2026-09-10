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
import type {TimelineSlotType} from './timeline-slot-type';
import type {TimelineLaneApi} from './timeline-lane-api';
import type {VerticalScrollApi, VerticalScrollEvent, VerticalScrollOptions} from './vertical-scroll';

export enum TimelineSlotEventType {
  TIMELINE_SLOT_RESIZE = 'TIMELINE_SLOT_RESIZE',
  TIMELINE_SLOT_SCROLL = 'TIMELINE_SLOT_SCROLL',
}

export type TimelineSlotEventTypeDataMap = {
  [TimelineSlotEventType.TIMELINE_SLOT_RESIZE]: {};
  [TimelineSlotEventType.TIMELINE_SLOT_SCROLL]: VerticalScrollEvent;
};

export type TimelineSlotEvent = {
  [K in TimelineSlotEventType]: {
    type: K;
    data: TimelineSlotEventTypeDataMap[K];
  };
}[keyof TimelineSlotEventTypeDataMap];

export interface TimelineSlotApi {
  /** Which slot region this is. */
  readonly type: TimelineSlotType;

  /**
   * Vertical scroll API.
   * Only meaningful for the MAIN slot — HEADER and FOOTER return a no-op adapter.
   */
  readonly scroll: VerticalScrollApi;

  /**
   * Stream of slot-level events: resize ({@link TimelineSlotEventType.TIMELINE_SLOT_RESIZE}) —
   * whenever this slot's effective (viewport) or content height may have changed (lane
   * minimize/maximize, add/remove, track updates, zoom, window resize, etc.) — and vertical
   * scroll ({@link TimelineSlotEventType.TIMELINE_SLOT_SCROLL}), mirroring {@link scroll}'s
   * onScroll$ and only meaningful for the MAIN slot.
   */
  readonly onEvent$: Observable<TimelineSlotEvent>;

  /** Add a lane. Appends at the end when index is omitted. */
  addTimelineLane(lane: TimelineLaneApi, index?: number): TimelineLaneApi;

  /** Remove a lane by id. */
  removeTimelineLane(id: string): void;

  /** All lanes currently in this slot, in display order. */
  getTimelineLanes(): TimelineLaneApi[];

  /** Current rendered height of this slot in pixels. */
  getEffectiveHeight(): number;

  /** Total height of this slot's content (sum of all lanes) in pixels, independent of any fixed/scrollable viewport height. */
  getContentHeight(): number;

  /**
   * Explicitly show/hide the vertical scrollbar, on top of it auto-hiding when content fits
   * the viewport. Only meaningful for the MAIN slot — no-op elsewhere. Visible by default.
   */
  setVerticalScrollbarVisible(visible: boolean): void;

  /**
   * Scrolls so the given lane's top aligns with the slot's viewport top. Same passive-observable
   * semantics as {@link VerticalScrollApi.scrollTo}: the scroll (and any easing) starts
   * immediately, and the returned observable resolves, asynchronously, with the final scroll
   * percent once it settles.
   */
  scrollToLane(laneId: TimelineLaneApi['id'], options?: VerticalScrollOptions): Observable<number>;
}
