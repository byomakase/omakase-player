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
import type {OnMeasurementsChange, RectMeasurement} from './model';
import type {Destroyable} from '../common/capabilities';
import type {TimelineLaneComponentConfig, TimelineLaneStyle} from './timeline-lane';
import type {KonvaFlexGroup} from './layout/konva-flex';
import type {TimelineNode} from './timeline-component';
import type {TimelineImpl} from './timeline';
import type {PlayerApi} from '../player';
import type {OmpProvider} from '../omp-provider';

export interface TimelineLaneUpdateableAttrs {
  description?: string | undefined;
}

export type TimelineLaneMinimizeMaximizeArgs = {easing?: boolean | undefined; duration?: number | undefined; complete?: Observable<void>};

/**
 * Timeline lane API
 */
export interface TimelineLaneApi<S extends TimelineLaneStyle = TimelineLaneStyle> extends Destroyable, OnMeasurementsChange {
  /**
   * @returns TimelineLane id
   */
  id: string;

  style: TimelineLaneStyle;

  /**
   * @internal
   */
  mainLeftFlexGroup: KonvaFlexGroup;

  /**
   * @internal
   */
  mainRightFlexGroup: KonvaFlexGroup;

  /**
   * @internal
   */
  getTimecodedRect(): RectMeasurement;

  setStyle(style: Partial<S>): void;

  updateAttrs(attrs: TimelineLaneUpdateableAttrs): void;

  /**
   * Clears Timeline lane content
   */
  clearContent(): void;

  /**
   * Adds new timeline node to timeline lane
   *
   * @param config
   */
  addTimelineNode(config: TimelineLaneComponentConfig): TimelineNode;

  /**
   * @returns is timeline lane minimized
   */
  isMinimized(): boolean;

  /**
   * Collapses the lane to zero height.
   *
   * Pass `args.easing: true` for an animated transition. When `args` is provided, `args.complete` is set to an
   * `Observable<void>` that completes when the operation finishes (immediately for non-eased, after the animation
   * for eased). Subscribe to `args.complete` after calling this method.
   */
  minimize(args?: TimelineLaneMinimizeMaximizeArgs): void;

  /**
   * Expands the lane back to its configured height.
   *
   * Pass `args.easing: true` for an animated transition. When `args` is provided, `args.complete` is set to an
   * `Observable<void>` that completes when the operation finishes (immediately for non-eased, after the animation
   * for eased). Subscribe to `args.complete` after calling this method.
   */
  maximize(args?: TimelineLaneMinimizeMaximizeArgs): void;

  /**
   * Toggles between minimized and maximized states.
   *
   * Pass `args.easing: true` for an animated transition. When `args` is provided, `args.complete` is set to an
   * `Observable<void>` that completes when the operation finishes. Subscribe to `args.complete` after calling
   * this method.
   */
  toggleMinimizeMaximize(args?: TimelineLaneMinimizeMaximizeArgs): void;

  /**
   * @internal
   * @param timeline
   * @param player
   * @param ompProvider
   */
  prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider): void;
}
