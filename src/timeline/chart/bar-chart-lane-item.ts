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
import {BarChartCue, ChartCueEvent, WithOptionalPartial} from '../../types';
import Decimal from 'decimal.js';
import {Constants} from '../../constants';
import {nullifier} from '../../util/destroy-util';
import {Subject} from 'rxjs';
import {KonvaFactory} from '../../factory/konva-factory';

export interface BarChartLaneItemStyle {
  height: number;
  opacity: number;
  visible: boolean;
  fillLinearGradientColorStops: (number | string)[];
  paddingX: number;
  cornerRadius: number;
}

export interface BarChartLaneItemConfig extends ComponentConfig<BarChartLaneItemStyle> {
  cue: BarChartCue;

  value: number;
  valueScale: number;

  x: number;
  width: number;

  listening?: boolean;
}

const configDefault: Omit<BarChartLaneItemConfig, 'cue' | 'value' | 'valueScale' | 'x' | 'width'> = {
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

export class BarChartLaneItem extends BaseKonvaComponent<BarChartLaneItemConfig, BarChartLaneItemStyle, Konva.Group> {
  public readonly onClick$: Subject<ChartCueEvent> = new Subject<ChartCueEvent>();

  private _group: Konva.Group;

  private _cue: BarChartCue;

  constructor(config: ConfigWithOptionalStyle<BarChartLaneItemConfig>) {
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
      listening: this.config.listening
    });

    if ((this.style.paddingX) >= this.config.width) {
      throw new Error('Horizontal padding is larger than width')
    }

    let barGroup = new Konva.Group({
      width: this._group.width(),
      height: this._group.height(),
    });

    this._group.add(barGroup);

    let valueRatioDecimal = new Decimal(this.config.value).div(this.config.valueScale);
    let valueHeightExact = valueRatioDecimal.mul(this._group.height()).toNumber();

    barGroup.add(KonvaFactory.createRect({
      x: this.style.paddingX / 2,
      y: barGroup.height() - valueHeightExact,
      width: barGroup.width() - this.style.paddingX,
      height: valueHeightExact,
      fillLinearGradientColorStops: this.style.fillLinearGradientColorStops,
      fillLinearGradientStartPoint: {x: 0, y: -(barGroup.height() - valueHeightExact)},
      fillLinearGradientEndPoint: {x: 0, y: valueHeightExact},
      cornerRadius: [this.style.cornerRadius, this.style.cornerRadius, this.style.cornerRadius, this.style.cornerRadius],
    }))

    this._group.on('click', (event) => {
      this.onClick$.next({
        cue: this._cue
      })
    })
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  set barPosition(position: WithOptionalPartial<Position, 'y'>) {
    this._group.position({
      x: position.x,
      y: 0
    })
  }

  get barPosition(): Position {
    return this._group.getPosition();
  }

  get cue(): BarChartCue {
    return this._cue;
  }

  override destroy() {
    super.destroy();
    nullifier(
      this._cue
    );
  }
}
