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

import Konva from 'konva';
import {BaseMarker, MARKER_STYLE_DEFAULT, MarkerConfig, MarkerStyle} from './marker';
import {MomentMarkerChangeEvent, MomentObservation} from '../../types';
import Decimal from 'decimal.js';
import {BaseMarkerHandle, MARKER_HANDLE_STYLE_DEFAULT, MarkerHandleConfig, MarkerHandleStyle} from './marker-handle';
import {MarkerLane} from './marker-lane';
import {Timeline} from '../timeline';
import {ComponentConfigStyleComposed} from '../../common/component';
import {z} from 'zod';

export interface MomentMarkerHandleStyle extends MarkerHandleStyle {
  markerSymbolSize: number
}

export interface MomentMarkerHandleConfig extends MarkerHandleConfig<MomentMarkerHandleStyle> {

}

const markerHandleConfigDefault: Partial<MomentMarkerHandleConfig> = {
  editable: true,
  style: {
    ...MARKER_HANDLE_STYLE_DEFAULT,
    markerSymbolSize: 20,
  }
}

export class MomentMarkerHandle extends BaseMarkerHandle<MomentMarkerHandleConfig, MomentMarkerHandleStyle> {

  constructor(config: ComponentConfigStyleComposed<MomentMarkerHandleConfig>, markerLane: MarkerLane, timeline: Timeline) {
    super({
      ...markerHandleConfigDefault,
      ...config,
      style: {
        ...markerHandleConfigDefault.style,
        ...config.style,
      },
    }, markerLane, timeline);
  }

  protected createSymbol(): Konva.Shape {
    switch (this.style.markerSymbolType) {
      case 'triangle':
        let diagonal = Decimal.sqrt(2).mul(this.style.markerSymbolSize).toNumber();
        let halfDiagonal = diagonal / 2;
        return new Konva.Line({
          points: [
            -halfDiagonal, 0,
            halfDiagonal, 0,
            0, halfDiagonal
          ],
          fill: this.style.color,
          closed: true,
          offsetY: halfDiagonal / 2,
        })
      case 'circle':
        return new Konva.Circle({
          fill: this.style.color,
          radius: this.style.markerSymbolSize / 2
        })
      case 'square':
        return new Konva.Rect({
          fill: this.style.color,
          width: this.style.markerSymbolSize,
          height: this.style.markerSymbolSize,
          rotation: 45,
          offsetX: this.style.markerSymbolSize / 2,
          offsetY: this.style.markerSymbolSize / 2,
        })
      default:
        throw Error('Unknown type');
    }
  }
}

export interface MomentMarkerStyle extends MarkerStyle {

}

export interface MomentMarkerConfig extends MarkerConfig<MomentObservation, MomentMarkerStyle> {

}

const markerConfigDefault: Partial<MomentMarkerConfig> = {
  description: '',
  editable: true,
  style: {
    ...MARKER_STYLE_DEFAULT
  }
}

/** @ignore */
export class MomentMarker extends BaseMarker<MomentObservation, MomentMarkerConfig, MomentMarkerStyle, MomentMarkerChangeEvent> {
  private markerHandle: MomentMarkerHandle;

  constructor(config: ComponentConfigStyleComposed<MomentMarkerConfig>) {
    super({
      ...markerConfigDefault,
      ...config,
      style: {
        ...markerConfigDefault.style,
        ...config.style,
      },
    });

    this.observation.time = z.coerce.number()
      .min(0)
      .parse(this.observation.time);
  }

  protected createCanvasNode(): Konva.Group {
    super.createCanvasNode();

    this.initMarkerHandle();

    return this.group;
  }

  protected afterCanvasNodeInit() {
    super.afterCanvasNodeInit();

    this.styleAdapter.onChange$.subscribe((style) => {
      this.initMarkerHandle();
    })
  }

  private initMarkerHandle() {
    if (this.markerHandle) {
      this.markerHandle.destroy();
      this.markerHandle = void 0;
    }

    let x = this.timeline.timeToTimelinePosition(this.observation.time);

    this.markerHandle = new MomentMarkerHandle({
      x: x,
      editable: this.editable,
      style: {
        color: this.style.color,
        markerRenderType: this.style.renderType,
        markerSymbolType: this.style.symbolType,
      }
    }, this.markerLane, this.timeline);

    this.markerHandle.onDragEnd = (markerHandleGroup) => {
      if (this.editable) {
        let newTime = this.timeline.timelinePositionToTime(markerHandleGroup.x());
        this.setTimeObservation({
          ...this.observation,
          time: newTime
        })
      }
    }

    this.group.add(this.markerHandle.initCanvasNode());
  }

  onChange() {
    this.settlePosition();

    let event: MomentMarkerChangeEvent = {
      timeObservation: this.observation
    }

    this.onChange$.next(event)
  }

  onMeasurementsChange() {
    super.onMeasurementsChange();
    this.markerHandle.onMeasurementsChange();
    this.settlePosition()
  }

  settlePosition() {
    this.markerHandle.setPosition({
      ...this.markerHandle.getPosition(),
      x: this.timeline.timeToTimelinePosition(this.observation.time)
    })
  }

  setEditable(editable: boolean) {
    super.setEditable(editable);
  }

}
