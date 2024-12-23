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
import {BarChartCue, ChartCueEvent, OgChartCue, WithOptionalPartial} from '../../types';
import Decimal from 'decimal.js';
import {Constants} from '../../constants';
import {nullifier} from '../../util/destroy-util';
import {Subject} from 'rxjs';
import {KonvaFactory} from '../../factory/konva-factory';

export interface OgChartLaneItemStyle {
  height: number;
  opacity: number;
  visible: boolean;
  fillLinearGradientColorStops: (number | string)[];
  paddingX: number;
  paddingY: number;
  scaleRatio: number;
}

export interface OgChartLaneItemConfig extends ComponentConfig<OgChartLaneItemStyle> {
  cue: OgChartCue;

  value: number;
  valueScale: number;

  x: number;
  width: number;

  listening?: boolean;
}

const configDefault: Omit<OgChartLaneItemConfig, 'cue' | 'value' | 'valueScale' | 'x' | 'width'> = {
  listening: false,
  style: {
    height: 20,
    opacity: 1,
    visible: true,
    fillLinearGradientColorStops: Constants.FILL_LINEAR_GRADIENT_AUDIO_PEAK,
    paddingX: 2,
    paddingY: 2,
    scaleRatio: 1,
  },
};

export class OgChartLaneItem extends BaseKonvaComponent<OgChartLaneItemConfig, OgChartLaneItemStyle, Konva.Group> {
  public readonly onClick$: Subject<ChartCueEvent> = new Subject<ChartCueEvent>();

  private _group: Konva.Group;

  private _cue: OgChartCue;

  constructor(config: ConfigWithOptionalStyle<OgChartLaneItemConfig>) {
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
      x: this.config.x,
      y: 0,
      width: this.config.width,
      height: this.style.height,
      visible: this.style.visible,
      listening: this.config.listening,
    });

    if (this.style.paddingX >= this.config.width) {
      throw new Error('Horizontal padding is larger than width');
    }

    let clipGroup = new Konva.Group({
      width: this._group.width(),
      height: this._group.height(),
    });

    this._group.add(clipGroup);

    let valueRatioDecimal = new Decimal(this.config.value).div(this.config.valueScale);
    let valueHeightExactDecimal = valueRatioDecimal.mul(this._group.height());
    let valueHeightExact = valueHeightExactDecimal.toNumber();

    clipGroup.add(
      KonvaFactory.createRect({
        width: this._group.width(),
        height: this._group.height(),
        fillLinearGradientColorStops: this.style.fillLinearGradientColorStops,
        fillLinearGradientStartPoint: {x: 0, y: 0},
        fillLinearGradientEndPoint: {x: 0, y: this._group.height()},
      })
    );

    let circleWidth = this.config.width - this.style.paddingX;
    let circleMaxRadius = circleWidth / 2;

    let numOfCirclesDecimal = new Decimal(valueHeightExactDecimal).div(circleWidth + this.style.paddingY).round();
    let numOfCircles = numOfCirclesDecimal.toNumber();

    let maxNumOfCircles = new Decimal(new Decimal(this.style.height)).div(circleWidth).floor().toNumber();

    let circlesGroupHeightDecimal = numOfCirclesDecimal.mul(circleWidth).plus(numOfCirclesDecimal.minus(1));

    clipGroup.clipFunc((ctx) => {
      let circleX = circleMaxRadius + this.style.paddingX / 2;
      for (let i = 0; i < numOfCircles; i++) {
        let circleRadius = new Decimal(1 - this.style.scaleRatio)
          .div(maxNumOfCircles)
          .mul(maxNumOfCircles - i)
          .plus(this.style.scaleRatio)
          .mul(circleMaxRadius)
          .toNumber();

        // let yFromTop = i * (circleMaxRadius * 2 + this.style.paddingY) + circleMaxRadius;
        let yFromTop = i * (circleMaxRadius * 2 + this.style.paddingY) + circleRadius;

        let y = clipGroup.height() - yFromTop;

        // ctx.arc(circleX, y, circleMaxRadius, 0, Constants.TWO_PI_RADIANS, false);
        ctx.arc(circleX, y, circleRadius, 0, Constants.TWO_PI_RADIANS, false);
      }
    });
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  set barPosition(position: WithOptionalPartial<Position, 'y'>) {
    this._group.position({
      x: position.x,
      y: 0,
    });
  }

  get barPosition(): Position {
    return this._group.getPosition();
  }

  get cue(): BarChartCue {
    return this._cue;
  }

  override destroy() {
    super.destroy();
    nullifier(this._cue);
  }
}
