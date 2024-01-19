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
import {AudioVttCue, WithOptionalPartial} from '../../types';
import Decimal from 'decimal.js';
import {Constants} from '../../constants';
import {ColorUtil} from '../../util/color-util';

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

const configDefault: Partial<AudioTrackLaneItemConfig> = {
  listening: false,
  style: {
    height: 20,
    cornerRadius: 20,
    opacity: 1,
    visible: true,
    maxSampleFillLinearGradientColorStops: Constants.FILL_LINEAR_GRADIENT_AUDIO_PEAK,
    minSampleFillLinearGradientColorStops: ColorUtil.inverseFillGradient(Constants.FILL_LINEAR_GRADIENT_AUDIO_PEAK),
  }
}

export class AudioTrackLaneItem extends BaseComponent<AudioTrackLaneItemConfig, AudioTrackLaneItemStyle, Konva.Group> implements HasRectMeasurement {
  private x: number;
  private width: number;
  private listening: boolean;

  // region konva
  private group: Konva.Group;
  private maxSampleBar: Konva.Rect;
  private minSampleBar: Konva.Rect;
  // endregion

  private audioVttCue: AudioVttCue;

  constructor(config: ComponentConfigStyleComposed<AudioTrackLaneItemConfig>) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this.audioVttCue = this.config.audioVttCue;
    this.x = this.config.x;
    this.width = this.config.width;
    this.listening = this.config.listening;
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

    let barMaxHeight = this.style.height / 2;
    let maxSampleBarHeight = this.resolveMaxSampleBarHeight();
    let minSampleBarHeight = this.resolveMinSampleBarHeight();

    this.maxSampleBar = new Konva.Rect({
      x: 0,
      width: this.group.width(),
      y: barMaxHeight - maxSampleBarHeight,
      height: maxSampleBarHeight,
      opacity: this.style.opacity,
      cornerRadius: [this.style.cornerRadius, this.style.cornerRadius, 0, 0],
      fillLinearGradientStartPoint: {x: 0, y: -(barMaxHeight - maxSampleBarHeight)},
      fillLinearGradientEndPoint: {x: 0, y: maxSampleBarHeight},
      fillLinearGradientColorStops: this.style.maxSampleFillLinearGradientColorStops,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      hitStrokeWidth: 0
    })

    this.minSampleBar = new Konva.Rect({
      x: 0,
      width: this.group.width(),
      y: barMaxHeight,
      height: minSampleBarHeight,
      opacity: this.style.opacity,
      cornerRadius: [0, 0, this.style.cornerRadius, this.style.cornerRadius],
      fillLinearGradientStartPoint: {x: 0, y: 0},
      fillLinearGradientEndPoint: {x: 0, y: barMaxHeight},
      fillLinearGradientColorStops: this.style.minSampleFillLinearGradientColorStops,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      hitStrokeWidth: 0
    })

    this.group.add(this.maxSampleBar)
    this.group.add(this.minSampleBar)

    return this.group;
  }

  private resolveMaxSampleBarHeight() {
    return new Decimal(this.audioVttCue.maxSample).mul(this.style.height / 2).toDecimalPlaces(2).toNumber()
  }

  private resolveMinSampleBarHeight() {
    return new Decimal(this.audioVttCue.minSample).abs().mul(this.style.height / 2).toDecimalPlaces(2).toNumber()
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

  getAudioVttCue(): AudioVttCue {
    return this.audioVttCue;
  }

  destroy() {
    this.audioVttCue = void 0;
    super.destroy();
  }
}
