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
import {BarChartCue, WithOptionalPartial} from '../../types';
import Decimal from 'decimal.js';
import {Constants} from '../../constants';

export interface BarChartLaneItemStyle {
  height: number;
  opacity: number;
  visible: boolean;
  fillLinearGradientColorStops: (number | string)[];

  paddingX: number;
  cornerRadius: number;
}

export interface BarChartLaneItemConfig extends ComponentConfig<BarChartLaneItemStyle> {
  chartCue: BarChartCue;
  valueMax: number;
  x: number;
  width: number;
  listening?: boolean;
}

const configDefault: Partial<BarChartLaneItemConfig> = {
  listening: false,
  style: {
    height: 20,
    opacity: 1,
    visible: true,
    fillLinearGradientColorStops: Constants.FILL_LINEAR_GRADIENT_AUDIO_PEAK,

    paddingX: 2,
    cornerRadius: 0
  }
}

export class BarChartLaneItem extends BaseComponent<BarChartLaneItemConfig, BarChartLaneItemStyle, Konva.Group> implements HasRectMeasurement {
  private x: number;
  private width: number;
  private listening: boolean;

  // region konva
  private group: Konva.Group;
  // endregion

  private chartCue: BarChartCue;
  private valueMax: number;

  constructor(config: ComponentConfigStyleComposed<BarChartLaneItemConfig>) {
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

    let barGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      width: this.group.width(),
      height: this.group.height(),
    });

    this.group.add(barGroup);

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

    let valueRatioDecimal = new Decimal(this.chartCue.value).div(this.valueMax);
    let valueHeightExact = valueRatioDecimal.mul(this.group.height()).toNumber();

    barGroup.add(new Konva.Rect({
      x: this.style.paddingX / 2,
      y: barGroup.height() - valueHeightExact,
      width: barGroup.width() - this.style.paddingX,
      height: valueHeightExact,
      fillLinearGradientColorStops: this.style.fillLinearGradientColorStops,
      fillLinearGradientStartPoint: {x: 0, y: -(barGroup.height() - valueHeightExact)},
      fillLinearGradientEndPoint: {x: 0, y: valueHeightExact},
      cornerRadius: [this.style.cornerRadius, this.style.cornerRadius, this.style.cornerRadius, this.style.cornerRadius],
    }))

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

  getChartCue(): BarChartCue {
    return this.chartCue;
  }

  destroy() {
    this.chartCue = void 0;
    super.destroy();
  }
}
