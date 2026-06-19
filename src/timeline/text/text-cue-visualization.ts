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

import type Konva from 'konva';
import {TIMELINE} from '../../constants';
import {BaseKonvaComponent, type ComponentConfig, type ConfigWithOptionalStyle} from '../layout/konva-component';
import type {Group} from 'konva/lib/Group';
import {KonvaFactory} from '../konva/konva-factory';
import type {Dimension, HasRectMeasurement, OnMeasurementsChange, Position, RectMeasurement} from '../model';
import type {TextCue} from '../../media';

export interface TextCueVisualizationStyle {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
}

export interface TextCueVisualizationConfig extends ComponentConfig<TextCueVisualizationStyle> {}

const configDefault: TextCueVisualizationConfig = {
  style: {
    ...TIMELINE.positionTopLeft,
    ...TIMELINE.dimensionZero,
    fill: '#001ff0',
    opacity: 1,
  },
};

export class TextCueVisualization extends BaseKonvaComponent<TextCueVisualizationConfig, TextCueVisualizationStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement {
  private _group: Konva.Group;
  private _bgRect: Konva.Rect;
  private _eventCatcherRect: Konva.Rect;
  public cues: TextCue[] = [];
  constructor(config: Partial<ConfigWithOptionalStyle<TextCueVisualization>>) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._group = KonvaFactory.createGroup({
      x: this.style.x,
      y: this.style.y,
      width: this.style.width,
      height: this.style.height,
    });

    this._bgRect = KonvaFactory.createBgRect({
      x: 0,
      y: 0,
      width: this._group.width(),
      height: this._group.height(),
      fill: this.style.fill,
      opacity: this.style.opacity,
    });

    this._eventCatcherRect = KonvaFactory.createEventCatcherRect({
      x: 0,
      y: 0,
      width: this._group.width(),
      height: this._group.height(),
    });

    this._group.add(this._bgRect);
    this._group.add(this._eventCatcherRect);
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange(): void {
    const size = this._group.getSize();
    this._bgRect.size(size);
    this._eventCatcherRect.size(size);
  }

  getPosition(): Position {
    return this._group.getPosition();
  }

  getDimension(): Dimension {
    return this._group.getSize();
  }

  getRect(): RectMeasurement {
    return {
      ...this.getPosition(),
      ...this.getDimension(),
    };
  }
}
