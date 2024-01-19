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

import {BaseComponent, ComponentConfig, ComponentConfigStyleComposed} from '../../common/component';
import Konva from 'konva';
import {Dimension, HasRectMeasurement, Position, RectMeasurement} from '../../common/measurement';
import {OgChartCue, WithOptionalPartial} from '../../types';
import Decimal from 'decimal.js';
import {Constants} from '../../constants';

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
  chartCue: OgChartCue;
  valueMax: number;
  x: number;
  width: number;
  listening?: boolean;
}

const configDefault: Partial<OgChartLaneItemConfig> = {
  listening: false,
  style: {
    height: 20,
    opacity: 1,
    visible: true,
    fillLinearGradientColorStops: Constants.FILL_LINEAR_GRADIENT_AUDIO_PEAK,

    paddingX: 2,
    paddingY: 2,
    scaleRatio: 1
  }
}

export class OgChartLaneItem extends BaseComponent<OgChartLaneItemConfig, OgChartLaneItemStyle, Konva.Group> implements HasRectMeasurement {
  private x: number;
  private width: number;
  private listening: boolean;

  // region konva
  private group: Konva.Group;
  // endregion

  private chartCue: OgChartCue;
  private valueMax: number;

  constructor(config: ComponentConfigStyleComposed<OgChartLaneItemConfig>) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this.chartCue = this.config.chartCue;
    this.valueMax = this.config.valueMax;
    this.x = this.config.x;
    this.width = this.config.width;
    this.listening = this.config.listening;

    if ((this.style.paddingX) >= this.width) {
      throw new Error('Horizontal padding is larger than width')
    }
  }

  protected createCanvasNode(): Konva.Group {
    this.group = new Konva.Group({
      x: this.x,
      y: 0,
      width: this.width,
      height: this.style.height,
      visible: this.style.visible,
      listening: this.listening
    });

    // value is smaller than 0, in this graph there is nothing to show
    if (this.chartCue.value <= 0) {
      return this.group;
    }

    let clipGroup = new Konva.Group({
      x: 0,
      y: 0,
      width: this.group.width(),
      height: this.group.height(),
    });

    this.group.add(clipGroup);

    // this.group.add(new Konva.Rect({
    //   x: 0,
    //   y: 0,
    //   width: this.group.width(),
    //   height: this.group.height(),
    //   fill: 'red',
    //   stroke: 'black',
    //   strokeWidth: 1,
    //   opacity: 0.2
    // }))

    clipGroup.add(new Konva.Rect({
      width: this.group.width(),
      height: this.group.height(),
      fillLinearGradientColorStops: this.style.fillLinearGradientColorStops,
      fillLinearGradientStartPoint: {x: 0, y: 0},
      fillLinearGradientEndPoint: {x: 0, y: this.group.height()},
    }))

    let valueRatioDecimal = new Decimal(this.chartCue.value).div(this.valueMax);
    let valueHeightExactDecimal = valueRatioDecimal.mul(clipGroup.height());

    let circleWidth = this.width - this.style.paddingX;
    let circleMaxRadius = circleWidth / 2;

    let numOfCirclesDecimal = new Decimal(valueHeightExactDecimal).div(circleWidth + this.style.paddingY).round();
    let numOfCircles = numOfCirclesDecimal.toNumber();

    let maxNumOfCircles = new Decimal(new Decimal(this.style.height)).div(circleWidth).floor().toNumber();

    let circlesGroupHeightDecimal = numOfCirclesDecimal.mul(circleWidth).plus(numOfCirclesDecimal.minus(1));

    clipGroup.clipFunc((ctx) => {
      let circleX = circleMaxRadius + this.style.paddingX / 2;
      for (let i = 0; i < numOfCircles; i++) {

        let circleRadius = new Decimal(1 - this.style.scaleRatio).div(maxNumOfCircles).mul((maxNumOfCircles - i)).plus(this.style.scaleRatio).mul(circleMaxRadius).toNumber();

        // let yFromTop = i * (circleMaxRadius * 2 + this.style.paddingY) + circleMaxRadius;
        let yFromTop = i * (circleMaxRadius * 2 + this.style.paddingY) + circleRadius;

        let y = clipGroup.height() - yFromTop;

        // ctx.arc(circleX, y, circleMaxRadius, 0, Constants.TWO_PI_RADIANS, false);
        ctx.arc(circleX, y, circleRadius, 0, Constants.TWO_PI_RADIANS, false);
      }
    })

    return this.group;
  }

  setPosition(position: WithOptionalPartial<Position, 'y'>) {
    this.x = position.x;
    if (this.isInitialized()) {
      this.group.position({
        x: this.x,
        y: 0
      })
    }
  }

  getPosition(): Position {
    return this.group.getPosition();
  }

  getDimension(): Dimension {
    return this.group.getSize();
  }

  getRect(): RectMeasurement {
    return {
      ...this.getPosition(),
      ...this.getDimension()
    };
  }

  getChartCue(): OgChartCue {
    return this.chartCue;
  }

  destroy() {
    this.chartCue = void 0;
    super.destroy();
  }
}
