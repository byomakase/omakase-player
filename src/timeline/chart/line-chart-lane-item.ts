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

import {BaseKonvaComponent, ComponentConfig, ConfigWithOptionalStyle} from '../../layout/konva-component';
import Konva from 'konva';
import {Position} from '../../common';
import {LineChartCue, WithOptionalPartial} from '../../types';
import {nullifier} from '../../util/destroy-util';

export interface LineChartLaneItemStyle {
  height: number;
  pointWidth: number;
  pointFill: string;
}

export interface LineChartLaneItemConfig extends ComponentConfig<LineChartLaneItemStyle> {
  cue: LineChartCue;
  pointPosition: Position;

  listening?: boolean;
}

const configDefault: Omit<LineChartLaneItemConfig, 'cue' | 'pointPosition'> = {
  listening: false,
  style: {
    height: 20,
    pointWidth: 1,
    pointFill: 'yellow',
  },
};

export class LineChartLaneItem extends BaseKonvaComponent<LineChartLaneItemConfig, LineChartLaneItemStyle, Konva.Group> {
  private _group: Konva.Group;
  private _shape: Konva.Shape;

  private _cue: LineChartCue;

  constructor(config: ConfigWithOptionalStyle<LineChartLaneItemConfig>) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._cue = this.config.cue;

    this._group = new Konva.Group({
      x: this.config.pointPosition.x,
      y: 0,
      width: 0,
      height: this.style.height,
      listening: this.config.listening,
    });

    this._shape = new Konva.Circle({
      x: 0,
      y: this.config.pointPosition.y,
      width: this.style.pointWidth,
      fill: this.style.pointFill,
    });

    this._group.add(this._shape);
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  set pointPosition(position: WithOptionalPartial<Position, 'y'>) {
    this._group.x(position.x);
    if (position.y) {
      this._shape.y(position.y);
    }
  }

  get pointPosition(): Position {
    return {
      x: this._group.x(),
      y: this._shape.y(),
    };
  }

  get cue(): LineChartCue {
    return this._cue;
  }

  override destroy() {
    super.destroy();
    nullifier(this._cue);
  }
}
