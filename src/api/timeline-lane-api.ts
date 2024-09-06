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

import {Destroyable} from '../types';
import {OnMeasurementsChange, RectMeasurement} from '../common/measurement';
import {Timeline, TimelineLaneComponentConfig, TimelineLaneStyle, TimelineNode} from '../timeline';
import {VideoControllerApi} from '../video/video-controller-api';
import {KonvaFlexGroup} from '../layout/konva-flex';
import {Observable} from 'rxjs';

/**
 * Timeline lane API
 */
export interface TimelineLaneApi extends Destroyable, OnMeasurementsChange {
  /**
   * Style getter / setter
   */
  style: TimelineLaneStyle;

  /**
   * @returns TimelineLane id
   */
  get id(): string;

  /**
   * @internal
   */
  get mainLeftFlexGroup(): KonvaFlexGroup;

  /**
   * @internal
   */
  get mainRightFlexGroup(): KonvaFlexGroup;

  /**
   * @internal
   */
  getTimecodedRect(): RectMeasurement;

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
   * Minimize
   */
  minimize(): void;

  /**
   * Minimize with easing
   */
  minimizeEased(): Observable<void>;

  /**
   * Maximize
   */
  maximize(): void;

  /**
   * Maximize with easing
   */
  maximizeEased(): Observable<void>;

  /**
   * Toggles minimize / maximize
   */
  toggleMinimizeMaximize(): void;

  /**
   * Toggles minimize / maximize with easing
   */
  toggleMinimizeMaximizeEased(): Observable<void>;

  /**
   * @internal
   *
   * @param timeline
   * @param videoController
   */
  prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi): void;
}
