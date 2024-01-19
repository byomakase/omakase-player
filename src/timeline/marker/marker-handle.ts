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

import {BaseComponent, Component, ComponentConfig} from '../../common/component';
import Konva from 'konva';
import {OnMeasurementsChange, Position, VerticalMeasurement} from '../../common/measurement';
import {WindowUtil} from '../../util/window-util';
import {MarkerLane} from './marker-lane';
import {Timeline} from '../timeline';
import {MarkerRenderType, MarkerSymbolType} from './marker';

export interface MarkerHandleStyle {
  color: string,
  markerRenderType: MarkerRenderType,
  markerSymbolType: MarkerSymbolType,
  lineStrokeWidth: number;
  lineOpacity: number;
}

export const MARKER_HANDLE_STYLE_DEFAULT: MarkerHandleStyle = {
  color: '#ff6c6c',
  markerRenderType: 'lane',
  markerSymbolType: 'square',
  lineStrokeWidth: 1,
  lineOpacity: 0.7
}

export interface MarkerHandleConfig<S extends MarkerHandleStyle> extends ComponentConfig<S> {
  x: number;
  editable: boolean;
}

export interface MarkerHandle<C extends MarkerHandleConfig<S>, S extends MarkerHandleStyle> extends Component<C, S, Konva.Group>, OnMeasurementsChange {
  getPosition(): Position;

  setPosition(position: Position);

  getHandleGroup(): Konva.Group;

  getSymbol(): Konva.Shape;

  getVerticalMeasurement(): VerticalMeasurement;

  setColor(color: string);

  onDrag: (markerHandleGroup: Konva.Group) => void;

  onDragEnd: (markerHandleGroup: Konva.Group) => void;
}

export abstract class BaseMarkerHandle<C extends MarkerHandleConfig<S>, S extends MarkerHandleStyle> extends BaseComponent<C, S, Konva.Group> implements MarkerHandle<C, S> {
  protected x: number;
  protected editable: boolean;

  // region konva
  protected group: Konva.Group;
  protected symbol: Konva.Shape;
  protected line: Konva.Line;
  protected handleGroup: Konva.Group;
  // endregion

  protected markerLane: MarkerLane;
  protected timeline: Timeline

  onDrag: (markerHandleGroup: Konva.Group) => void = (markerHandleGroup) => {
  };
  onDragEnd: (markerHandleGroup: Konva.Group) => void = (markerHandleGroup) => {
  };

  protected constructor(config: C, markerLane: MarkerLane, timeline: Timeline) {
    super(config);
    this.markerLane = markerLane;
    this.timeline = timeline;

    this.x = this.config.x;
    this.editable = this.config.editable;
  }

  protected createCanvasNode(): Konva.Group {
    let verticalMeasurement = this.getVerticalMeasurement();

    this.group = new Konva.Group({
      x: this.x,
      y: verticalMeasurement.y,
      draggable: this.editable
    });

    this.line = new Konva.Line({
      stroke: this.style.color,
      strokeWidth: this.style.lineStrokeWidth,
      opacity: this.style.lineOpacity,
      points: [
        0, 0,
        0, verticalMeasurement.height
      ],
      listening: false
    })

    this.handleGroup = new Konva.Group({
      x: 0,
      y: this.markerLane.getPosition().y - verticalMeasurement.y + this.markerLane.getDimension().height / 2
    });

    this.symbol = this.createSymbol();
    this.handleGroup.add(this.symbol);

    this.handleGroup.on('mouseover', (event) => {
      if (this.editable) {
        this.handleGroup.to({
          scaleX: 1.5,
          scaleY: 1.5,
          duration: 0.1,
        })
        WindowUtil.cursor('grab')
      }
    })

    this.handleGroup.on('mouseleave', () => {
      if (this.editable) {
        this.handleGroup.to({
          scaleX: 1,
          scaleY: 1,
          duration: 0.1
        })
        WindowUtil.cursor('default')
      }
    })

    this.group.add(this.line)
    this.group.add(this.handleGroup)

    return this.group;
  }

  protected abstract createSymbol(): Konva.Shape;

  protected afterCanvasNodeInit() {
    let verticalMeasurement = this.getVerticalMeasurement();

    this.group.on('dragstart dragmove', (event) => {
      WindowUtil.cursor('grabbing')
      let newX = this.timeline.constrainTimelinePosition(this.group.getPosition().x);
      this.group.setAttrs({
        x: newX,
        y: verticalMeasurement.y  // restrict vertical movement
      })
      this.onDrag(this.group);
    })

    this.group.on('dragend', (event) => {
      let newX = this.timeline.constrainTimelinePosition(this.group.getPosition().x);
      this.group.setAttrs({
        x: newX,
        y: verticalMeasurement.y   // restrict vertical movement
      })
      this.onDragEnd(this.group);
      WindowUtil.cursor('default')
    })
  }

  onMeasurementsChange() {
    let verticalMeasurement = this.getVerticalMeasurement();

    this.group.setAttrs({
      y: verticalMeasurement.y,
    })

    this.line.setAttrs({
      points: [
        0, 0,
        0, verticalMeasurement.height
      ],
    })

    this.handleGroup.setAttrs({
      y: this.markerLane.getPosition().y - verticalMeasurement.y + this.markerLane.getDimension().height / 2
    })
  }

  getVerticalMeasurement(): VerticalMeasurement {
    switch (this.style.markerRenderType) {
      case 'spanning':
        return {
          y: 0,
          height: this.timeline.getTimecodedGroupDimension().height
        }
      default:
        return {
          y: this.markerLane.getTimelinePosition().y,
          height: this.markerLane.getDimension().height
        }
    }
  }

  getHandleGroup(): Konva.Group {
    return this.handleGroup;
  }

  getSymbol(): Konva.Shape {
    return this.symbol;
  }

  /**
   * Caution: returns group that is draggable
   */
  getPosition(): Position {
    return this.group.getPosition();
  }

  setPosition(position: Position) {
    this.group.setAttrs({
      ...position
    });
    this.onMeasurementsChange();
  }

  setColor(color: string) {
    this.style.color = color;
    this.line.setAttrs({
      stroke: this.style.color
    })
    this.symbol.setAttrs({
      fill: this.style.color
    })
  }

  setEditable(editable: boolean) {
    this.editable = editable;
    this.group.draggable(this.editable);
  }

}
