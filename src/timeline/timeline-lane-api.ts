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
   * Unique identifier for this lane instance.
   */
  id: string;

  /**
   * Current resolved style for this lane.
   * Reflects style defaults merged with any overrides applied via {@link setStyle}.
   */
  style: TimelineLaneStyle;

  /**
   * Flex group that owns the left description pane for this lane.
   * @internal
   */
  mainLeftFlexGroup: KonvaFlexGroup;

  /**
   * Flex group that owns the right (static) pane for this lane.
   * @internal
   */
  mainRightFlexGroup: KonvaFlexGroup;

  /**
   * Merges `style` into the lane's current style and triggers a visual refresh.
   * Only the properties present in `style` are changed; omitted properties retain their current values.
   *
   * @param style - Partial style object containing only the properties to update.
   */
  setStyle(style: Partial<S>): void;

  /**
   * Updates mutable lane attributes without removing and re-adding the lane.
   *
   * @param attrs - The attributes to change. Properties that are `undefined` are ignored.
   */
  updateAttrs(attrs: TimelineLaneUpdateableAttrs): void;

  /**
   * Removes all visual content from the lane's timecoded area without destroying the lane itself.
   * Useful for clearing stale data before reloading (e.g. when the main media changes).
   */
  clearContent(): void;

  /**
   * Adds a floating {@link TimelineNode} overlay to this lane — typically an icon button or label
   * anchored to the left or right edge of the lane's timecoded area.
   *
   * @param config - Position, size, margin, and the node instance to add.
   * @returns The created {@link TimelineNode} handle.
   */
  addTimelineNode(config: TimelineLaneComponentConfig): TimelineNode;

  /**
   * Returns `true` when the lane is currently collapsed to zero height.
   */
  isMinimized(): boolean;

  /**
   * Collapses the lane to zero height.
   *
   * Pass `args.easing: true` for an animated transition. When `args` is provided, `args.complete` is set to an
   * `Observable<void>` that completes when the operation finishes (immediately for non-eased, after the animation
   * for eased). Subscribe to `args.complete` after calling this method.
   *
   * @param args - Optional animation and completion options.
   */
  minimize(args?: TimelineLaneMinimizeMaximizeArgs): void;

  /**
   * Expands the lane back to its configured height.
   *
   * Pass `args.easing: true` for an animated transition. When `args` is provided, `args.complete` is set to an
   * `Observable<void>` that completes when the operation finishes (immediately for non-eased, after the animation
   * for eased). Subscribe to `args.complete` after calling this method.
   *
   * @param args - Optional animation and completion options.
   */
  maximize(args?: TimelineLaneMinimizeMaximizeArgs): void;

  /**
   * Collapses the lane if it is expanded, or expands it if it is collapsed.
   *
   * Pass `args.easing: true` for an animated transition. When `args` is provided, `args.complete` is set to an
   * `Observable<void>` that completes when the operation finishes. Subscribe to `args.complete` after calling
   * this method.
   *
   * @param args - Optional animation and completion options.
   */
  toggleMinimizeMaximize(args?: TimelineLaneMinimizeMaximizeArgs): void;

  /**
   * Connects this lane to the timeline engine. Called by the timeline when the lane
   * is added; do not call this directly.
   *
   * @param timeline - The owning {@link TimelineImpl} instance.
   * @param player - The active {@link PlayerApi}.
   * @param ompProvider - The OMP service provider.
   */
  prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider): void;

  /**
   * Returns the bounding rectangle of this lane's timecoded (right) area in stage coordinates.
   * @internal
   */
  getTimecodedRect(): RectMeasurement;
}
