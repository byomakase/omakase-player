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

import {BaseKonvaComponent, ComponentConfig, KonvaComponent} from '../../layout/konva-component';
import Konva from 'konva';
import {Position} from '../../common/measurement';
import {WindowUtil} from '../../util/window-util';
import {MarkerHandleStyle, MarkerHandleVerticals} from './marker-types';

export interface MarkerHandleConfig<S extends MarkerHandleStyle> extends ComponentConfig<S> {
  x: number;
  editable: boolean;
  verticalsProviderFn: () => MarkerHandleVerticals;
  dragPositionConstrainerFn: (newPosition: Position) => Position;
}

export interface MarkerHandle<C extends MarkerHandleConfig<S>, S extends MarkerHandleStyle> extends KonvaComponent<C, S, Konva.Group> {
  getPosition(): Position;

  setPosition(position: Position): void;

  getHandleGroup(): Konva.Group;

  getSymbol(): Konva.Shape;

  setColor(color: string): void;

  onDrag: (markerHandleGroup: Konva.Group) => void;

  onDragEnd: (markerHandleGroup: Konva.Group) => void;
}

export abstract class BaseMarkerHandle<C extends MarkerHandleConfig<S>, S extends MarkerHandleStyle> extends BaseKonvaComponent<C, S, Konva.Group> implements MarkerHandle<C, S> {
  private _group: Konva.Group;
  private _symbol: Konva.Shape;
  private _line: Konva.Line;
  private _handleGroup: Konva.Group;

  private _editable: boolean;
  private _verticalsProviderFn: () => MarkerHandleVerticals;
  private _dragPositionConstrainerFn: (newPosition: Position) => Position;

  onDrag: (markerHandleGroup: Konva.Group) => void = (markerHandleGroup) => {};
  onDragEnd: (markerHandleGroup: Konva.Group) => void = (markerHandleGroup) => {};

  protected constructor(config: C) {
    super(config);

    this._editable = this.config.editable;
    this._verticalsProviderFn = this.config.verticalsProviderFn;
    this._dragPositionConstrainerFn = this.config.dragPositionConstrainerFn;

    this._group = new Konva.Group({
      x: this.config.x,
      draggable: this._editable,
    });

    this._line = new Konva.Line({
      stroke: this.style.color,
      strokeWidth: this.style.lineStrokeWidth,
      opacity: this.style.lineOpacity,
      points: [0, 0, 0, 0],
      listening: false,
    });

    this._handleGroup = new Konva.Group({
      x: 0,
    });

    this._symbol = this.createSymbol();
    this._handleGroup.add(this._symbol);

    this._handleGroup.on('mouseover', (event) => {
      if (this._editable) {
        this._handleGroup.to({
          scaleX: 1.5,
          scaleY: 1.5,
          duration: 0.1,
        });
        WindowUtil.cursor('grab');
      }
    });

    this._handleGroup.on('mouseleave', () => {
      if (this._editable) {
        this._handleGroup.to({
          scaleX: 1,
          scaleY: 1,
          duration: 0.1,
        });
        WindowUtil.cursor('default');
      }
    });

    this._group.add(this._line);
    this._group.add(this._handleGroup);

    this._group.on('dragstart', (event) => {
      if (!this._editable) {
        event.target.stopDrag();
      } else {
        WindowUtil.cursor('grabbing');
      }
    });

    this._group.on('dragmove', (event) => {
      this._group.setAttrs(this._dragPositionConstrainerFn(this._group.getPosition()));
      this.onDrag(this._group);
    });

    this._group.on('dragend', (event) => {
      this._group.setAttrs(this._dragPositionConstrainerFn(this._group.getPosition()));
      this.onDragEnd(this._group);
      WindowUtil.cursor('default');
    });
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  protected abstract createSymbol(): Konva.Shape;

  getHandleGroup(): Konva.Group {
    return this._handleGroup;
  }

  getSymbol(): Konva.Shape {
    return this._symbol;
  }

  /**
   * Caution: returns group that is draggable
   */
  getPosition(): Position {
    return this._group.getPosition();
  }

  setPosition(position: Position) {
    this._group.setAttrs({
      ...position,
    });

    let verticals = this._verticalsProviderFn();

    this._group.setAttrs({
      y: verticals.area.y,
    });

    this._line.setAttrs({
      points: [0, 0, 0, verticals.area.height],
    });

    this._handleGroup.setAttrs({
      y: verticals.handle.y,
    });
  }

  setColor(color: string) {
    this.style.color = color;
    this._line.setAttrs({
      stroke: this.style.color,
    });
    this._symbol.setAttrs({
      fill: this.style.color,
    });
  }

  set editable(value: boolean) {
    this._editable = value;
    this._group.draggable(this._editable);
  }
}
