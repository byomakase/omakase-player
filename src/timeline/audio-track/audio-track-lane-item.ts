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
import {Dimension, HasRectMeasurement, Position, RectMeasurement} from '../../common';
import {AudioVttCue, WithOptionalPartial} from '../../types';
import Decimal from 'decimal.js';
import {fillLinearGradientAudioPeak} from '../../constants';
import {ColorUtil} from '../../util/color-util';
import {nullifier} from '../../util/destroy-util';
import {KonvaFactory} from '../../konva/konva-factory';

export interface AudioTrackLaneItemStyle {
  height: number;
  cornerRadius: number;
  opacity: number;
  visible: boolean;
  maxSampleFillLinearGradientColorStops: (number | string)[];
  minSampleFillLinearGradientColorStops: (number | string)[];
}

export interface AudioTrackLaneItemConfig extends ComponentConfig<AudioTrackLaneItemStyle> {
  audioVttCue: AudioVttCue;
  x: number;
  width: number;

  listening?: boolean;
}

const configDefault: Omit<AudioTrackLaneItemConfig, 'audioVttCue' | 'x' | 'width'> = {
  listening: false,
  style: {
    height: 20,
    cornerRadius: 20,
    opacity: 1,
    visible: true,
    maxSampleFillLinearGradientColorStops: fillLinearGradientAudioPeak,
    minSampleFillLinearGradientColorStops: ColorUtil.inverseFillGradient(fillLinearGradientAudioPeak),
  },
};

export class AudioTrackLaneItem extends BaseKonvaComponent<AudioTrackLaneItemConfig, AudioTrackLaneItemStyle, Konva.Group> implements HasRectMeasurement {
  private _group: Konva.Group;
  private _maxSampleBar: Konva.Rect;
  private _minSampleBar: Konva.Rect;

  private _vttCue: AudioVttCue;

  constructor(config: ConfigWithOptionalStyle<AudioTrackLaneItemConfig>) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._vttCue = this.config.audioVttCue;

    this._group = KonvaFactory.createGroup({
      x: this.config.x,
      y: 0,
      width: this.config.width,
      height: this.style.height,
      visible: this.style.visible,
      listening: this.config.listening,
    });

    let barMaxHeight = this.style.height / 2;
    let maxSampleBarHeight = this.resolveMaxSampleBarHeight();
    let minSampleBarHeight = this.resolveMinSampleBarHeight();

    this._maxSampleBar = KonvaFactory.createRect({
      x: 0,
      width: this._group.width(),
      y: barMaxHeight - maxSampleBarHeight,
      height: maxSampleBarHeight,
      opacity: this.style.opacity,
      cornerRadius: [this.style.cornerRadius, this.style.cornerRadius, 0, 0],
      fillLinearGradientStartPoint: {x: 0, y: -(barMaxHeight - maxSampleBarHeight)},
      fillLinearGradientEndPoint: {x: 0, y: maxSampleBarHeight},
      fillLinearGradientColorStops: this.style.maxSampleFillLinearGradientColorStops,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      hitStrokeWidth: 0,
    });

    this._minSampleBar = KonvaFactory.createRect({
      x: 0,
      width: this._group.width(),
      y: barMaxHeight,
      height: minSampleBarHeight,
      opacity: this.style.opacity,
      cornerRadius: [0, 0, this.style.cornerRadius, this.style.cornerRadius],
      fillLinearGradientStartPoint: {x: 0, y: 0},
      fillLinearGradientEndPoint: {x: 0, y: barMaxHeight},
      fillLinearGradientColorStops: this.style.minSampleFillLinearGradientColorStops,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      hitStrokeWidth: 0,
    });

    this._group.add(this._maxSampleBar);
    this._group.add(this._minSampleBar);
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  private resolveMaxSampleBarHeight() {
    return new Decimal(this._vttCue.maxSample)
      .mul(this.style.height / 2)
      .toDecimalPlaces(2)
      .toNumber();
  }

  private resolveMinSampleBarHeight() {
    return new Decimal(this._vttCue.minSample)
      .abs()
      .mul(this.style.height / 2)
      .toDecimalPlaces(2)
      .toNumber();
  }

  setPosition(position: WithOptionalPartial<Position, 'y'>) {
    this._group.position({
      x: position.x,
      y: 0,
    });
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

  getAudioVttCue(): AudioVttCue {
    return this._vttCue;
  }

  override destroy() {
    super.destroy();

    nullifier(this._vttCue);
  }
}
