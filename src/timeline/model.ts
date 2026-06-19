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

export type Position = {
  x: number;
  y: number;
};

export type Dimension = {
  width: number;
  height: number;
};

export type RectMeasurement = Position & Dimension;

export type Horizontals = {
  x: number;
  width: number;
};

export type Verticals = {
  y: number;
  height: number;
};

export interface OnMeasurementsChange {
  /**
   * @internal
   */
  onMeasurementsChange(): void;
}

export interface HasRectMeasurement {
  getRect(): RectMeasurement;
}

export interface OmpCancelableEvent {
  cancelableEvent: {
    cancelBubble: boolean;
  };
}

export interface OmpMouseEvent extends OmpCancelableEvent {
  mouseEvent: MouseEvent;
}

export interface ClickEvent extends OmpMouseEvent {}

export interface MouseEnterEvent extends OmpMouseEvent {}

export interface MouseMoveEvent extends OmpMouseEvent {}

export interface MouseLeaveEvent extends OmpMouseEvent {}

export interface MouseOutEvent extends OmpMouseEvent {}

export interface MouseOverEvent extends OmpMouseEvent {}

export interface ThumbnailVttCueXYWH {
  x: number;
  y: number;
  w: number;
  h: number;
}
