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

import Konva from 'konva';
import {BaseMarker, MarkerConfig} from './marker';
import {PeriodMarkerChangeEvent, PeriodObservation} from '../../types';
import {BaseMarkerHandle, MarkerHandleConfig} from './marker-handle';
import {Position, Verticals} from '../../common';
import {Timeline} from '../timeline';
import {MarkerLane} from './marker-lane';
import {takeUntil} from 'rxjs';
import {z} from 'zod';
import {isNullOrUndefined} from '../../util/object-util';
import {MarkerUtil} from './marker-util';
import {MARKER_STYLE_DEFAULT, MarkerHandleStyle, MarkerStyle} from './marker-types';
import {KonvaFactory} from '../../factory/konva-factory';
import {ConfigWithOptionalStyle} from '../../layout';

// region marker handle
export interface PeriodMarkerHandleStyle extends MarkerHandleStyle {
  periodMarkerHandleType: 'start' | 'end';
}

export interface PeriodMarkerHandleConfig extends MarkerHandleConfig<PeriodMarkerHandleStyle> {

}

export class PeriodMarkerHandle extends BaseMarkerHandle<PeriodMarkerHandleConfig, PeriodMarkerHandleStyle> {

  constructor(config: PeriodMarkerHandleConfig) {
    super(config);
  }

  protected createSymbol(): Konva.Shape {
    return MarkerUtil.createPeriodSymbol({
      handleType: this.style.periodMarkerHandleType,
      color: this.style.color,
      symbolSize: this.style.symbolSize,
      symbolType: this.style.symbolType
    })
  }
}

// endregion

export interface PeriodMarkerStyle extends MarkerStyle {
  selectedAreaOpacity: number;
  markerHandleAreaOpacity: number;
}

export interface PeriodMarkerConfig extends MarkerConfig<PeriodObservation, PeriodMarkerStyle> {

}

const markerConfigDefault: Omit<PeriodMarkerConfig, 'timeObservation'> = {
  editable: false,
  style: {
    ...MARKER_STYLE_DEFAULT,
    selectedAreaOpacity: 0.2,
    markerHandleAreaOpacity: 0.7
  }
}

export class PeriodMarker extends BaseMarker<PeriodObservation, PeriodMarkerConfig, PeriodMarkerStyle, PeriodMarkerChangeEvent> {
  private _startMarkerHandle?: PeriodMarkerHandle;
  private _endMarkerHandle?: PeriodMarkerHandle;

  private _selectedAreaRect?: Konva.Rect;
  private _markerHandleRect?: Konva.Rect;

  constructor(config: ConfigWithOptionalStyle<PeriodMarkerConfig>) {
    super({
      ...markerConfigDefault,
      ...config,
      style: {
        ...markerConfigDefault.style,
        ...config.style,
      },
    });

    this._timeObservation.start = z.coerce.number()
      .min(0)
      .nullable()
      .optional()
      .parse(this._timeObservation.start);

    this._timeObservation.end = z.coerce.number()
      .min(0)
      .nullable()
      .optional()
      .parse(this._timeObservation.end);

    if (!isNullOrUndefined(this._timeObservation.start) && !isNullOrUndefined(this._timeObservation.end)) {
      this._timeObservation.start = z.coerce.number()
        .lte(this._timeObservation.end!)
        .parse(this._timeObservation.start);
    }
  }

  override attachToTimeline(timeline: Timeline, markerLane: MarkerLane) {
    super.attachToTimeline(timeline, markerLane);

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyed$)).subscribe((style) => {
      this.initAll();
    })

    this.initAll();
  }

  private initAll() {
    if (this.hasTimeObservationStart()) {
      this.initStartMarkerHandle();
    }

    if (this.hasTimeObservationEnd()) {
      this.initEndMarkerHandle()
    }

    if (this.hasTimeObservationStart() && this.hasTimeObservationEnd()) {
      this.initSelectedAreaRect();
    }

    this._startMarkerHandle?.konvaNode.moveToTop()
    this._endMarkerHandle?.konvaNode.moveToTop()

    this.refreshTimelinePosition();
  }

  protected onObservationChange() {
    this.refreshTimelinePosition()
    let event: PeriodMarkerChangeEvent = {
      timeObservation: this.timeObservation
    }
    this.onChange$.next(event)
  }

  private initStartMarkerHandle() {
    if (this._startMarkerHandle) {
      this._startMarkerHandle.destroy();
      this._startMarkerHandle = void 0;
    }

    if (!this.hasTimeObservationStart()) {
      return;
    }

    let startX = this._timeline!.timeToTimelinePosition(this.timeObservation.start!);
    this._startMarkerHandle = new PeriodMarkerHandle({
      x: startX,
      editable: this.editable,
      verticalsProviderFn: () => {
        return this.getMarkerHandleVerticals()
      },
      dragPositionConstrainerFn: (newPosition: Position) => {
        return this.onDragMove(newPosition)
      },
      style: {
        periodMarkerHandleType: 'start',
        color: this.style.color,
        symbolType: this.style.symbolType,
        symbolSize: this.style.symbolSize,
        lineStrokeWidth: this.style.lineStrokeWidth,
        lineOpacity: this.style.lineOpacity
      }
    });

    this._startMarkerHandle.onDrag = (markerHandleGroup) => {
      if (this.editable) {
        if (this._endMarkerHandle) {
          if (markerHandleGroup.x() > this._endMarkerHandle.getPosition().x) {
            markerHandleGroup.x(this._endMarkerHandle.getPosition().x);
          }
        }
        this.settleAreaHorizontals()
        if (this._markerHandleRect) {
          this._markerHandleRect.opacity(1);
        }
      }
    }

    this._startMarkerHandle.onDragEnd = (markerHandleGroup) => {
      if (this.editable) {
        let newTime = this._timeline!.timelinePositionToTime(markerHandleGroup.x());
        this.timeObservation = {
          ...this.timeObservation,
          start: newTime
        }
        if (this._markerHandleRect) {
          this._markerHandleRect.opacity(this.style.markerHandleAreaOpacity);
        }
      }
    }

    this._group.add(this._startMarkerHandle.konvaNode);
  }

  private initEndMarkerHandle() {
    if (this._endMarkerHandle) {
      this._endMarkerHandle.destroy();
      this._endMarkerHandle = void 0;
    }

    if (!this.hasTimeObservationEnd()) {
      return;
    }

    let endX = this._timeline!.timeToTimelinePosition(this.timeObservation.end!);
    this._endMarkerHandle = new PeriodMarkerHandle({
      x: endX,
      editable: this.editable,
      verticalsProviderFn: () => {
        return this.getMarkerHandleVerticals()
      },
      dragPositionConstrainerFn: (newPosition: Position) => {
        return this.onDragMove(newPosition)
      },
      style: {
        periodMarkerHandleType: 'end',
        color: this.style.color,
        symbolType: this.style.symbolType,
        symbolSize: this.style.symbolSize,
        lineStrokeWidth: this.style.lineStrokeWidth,
        lineOpacity: this.style.lineOpacity
      }
    });

    this._endMarkerHandle.onDrag = (markerHandleGroup) => {
      if (this.editable) {
        if (this._startMarkerHandle) {
          if (markerHandleGroup.x() < this._startMarkerHandle.getPosition().x) {
            markerHandleGroup.x(this._startMarkerHandle.getPosition().x);
          }
        }
        this.settleAreaHorizontals()
        if (this._markerHandleRect) {
          this._markerHandleRect.opacity(1);
        }
      }
    }

    this._endMarkerHandle.onDragEnd = (markerHandleGroup) => {
      if (this.editable) {
        let newTime = this._timeline!.timelinePositionToTime(markerHandleGroup.x());
        this.timeObservation = {
          ...this.timeObservation,
          end: newTime
        }
        if (this._markerHandleRect) {
          this._markerHandleRect.opacity(this.style.markerHandleAreaOpacity);
        }
      }
    }

    this._group.add(this._endMarkerHandle.konvaNode);
  }

  private initSelectedAreaRect() {
    if (this._selectedAreaRect) {
      this._selectedAreaRect.destroy();
      this._selectedAreaRect = void 0;
    }

    if (this._markerHandleRect) {
      this._markerHandleRect.destroy();
      this._markerHandleRect = void 0;
    }

    if (!this._startMarkerHandle || !this._endMarkerHandle) {
      return;
    }

    this._selectedAreaRect = KonvaFactory.createRect({
      listening: false,
      fill: this.style.color,
      opacity: this.style.selectedAreaOpacity
    })

    this._markerHandleRect = KonvaFactory.createRect({
      listening: false,
      fill: this.style.color,
      opacity: this.style.markerHandleAreaOpacity
    })

    this._group.add(this._selectedAreaRect);
    this._group.add(this._markerHandleRect);
  }

  refreshTimelinePosition() {
    this._startMarkerHandle?.setPosition({
      ...this._startMarkerHandle.getPosition(),
      x: this._timeline!.timeToTimelinePosition(this.timeObservation.start!)
    })

    this._endMarkerHandle?.setPosition({
      ...this._endMarkerHandle.getPosition(),
      x: this._timeline!.timeToTimelinePosition(this.timeObservation.end!)
    })

    this.settleAreaVerticals();
    this.settleAreaHorizontals();
  }

  private settleAreaVerticals() {
    this._selectedAreaRect?.setAttrs({
      ...this.getMarkerHandleVerticals().area
    });

    this._markerHandleRect?.setAttrs({
      ...this.getMarkerHandleRectVerticals()
    });
  }

  private settleAreaHorizontals() {
    if (this._startMarkerHandle && this._endMarkerHandle) {
      this._selectedAreaRect?.setAttrs({
        x: this._startMarkerHandle.getPosition().x,
        width: this._endMarkerHandle.getPosition().x - this._startMarkerHandle.getPosition().x
      })

      this._markerHandleRect?.setAttrs({
        x: this._startMarkerHandle.getPosition().x,
        width: this._endMarkerHandle.getPosition().x - this._startMarkerHandle.getPosition().x
      })
    }
  }

  private getMarkerHandleRectVerticals(): Verticals {
    if (this._startMarkerHandle) {
      let markerHandleVerticals = this.getMarkerHandleVerticals();
      let handleGroupClientRect = this._startMarkerHandle.getHandleGroup().getClientRect();
      return {
        y: markerHandleVerticals.area.y + this.getMarkerHandleVerticals().handle.y - (handleGroupClientRect.height / 2),
        height: handleGroupClientRect.height,
      }
    } else {
      return {
        y: 0,
        height: 0
      }
    }
  }

  private hasTimeObservationStart() {
    return this.timeObservation && !isNullOrUndefined(this.timeObservation.start);
  }

  private hasTimeObservationEnd() {
    return this.timeObservation && !isNullOrUndefined(this.timeObservation.end);
  }

  override set timeObservation(value: PeriodObservation) {
    if (this.editable) {
      this._timeObservation = value;

      this.initStartMarkerHandle();
      this.initEndMarkerHandle();
      this.initSelectedAreaRect();

      this.onObservationChange();
    }
  }

  override get timeObservation(): PeriodObservation {
    return super.timeObservation;
  }

  override set editable(value: boolean) {
    super.editable = value;
    if (this._startMarkerHandle) {
      this._startMarkerHandle.editable = value;
    }
    if (this._endMarkerHandle) {
      this._endMarkerHandle.editable = value;
    }
  }

  override get editable(): boolean {
    return super.editable;
  }
}
