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

import {BaseKonvaComponent, ComponentConfig, ConfigWithOptionalStyle} from '../layout/konva-component';
import Konva from 'konva';
import {Constants} from '../constants';
import {OnMeasurementsChange} from '../common/measurement';
import {Timeline} from './timeline';
import {takeUntil} from 'rxjs';

export interface PlayheadHoverStyle {
  x: number;
  y: number;
  height: number;
  fill: string;
  snappedFill: string;
  lineWidth: number;

  symbolHeight: number;
  symbolYOffset: number;

  textFontSize: number;
  textFill: string;
  textSnappedFill: string;
  textYOffset: number;

  visible: boolean;
}

export interface PlayheadHoverConfig extends ComponentConfig<PlayheadHoverStyle> {

}

const configDefault: PlayheadHoverConfig = {
  style: {
    ...Constants.POSITION_TOP_LEFT,
    height: 100,
    fill: '#737373',
    snappedFill: '#ffd500',
    lineWidth: 2,


    symbolHeight: 15,
    symbolYOffset: 0,

    textFontSize: 12,
    textFill: '#0d0f05',
    textSnappedFill: '#f43530',
    textYOffset: 0,

    visible: false
  }
}

export class PlayheadHover extends BaseKonvaComponent<PlayheadHoverConfig, PlayheadHoverStyle, Konva.Group> implements OnMeasurementsChange {
  private _timeline: Timeline;

  protected _group: Konva.Group;
  protected _line: Konva.Line;
  protected _symbol: Konva.Circle;
  protected _label: Konva.Label;
  protected _text: Konva.Text;

  constructor(config: Partial<ConfigWithOptionalStyle<PlayheadHoverConfig>>, timeline: Timeline) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._timeline = timeline;

    this._group = new Konva.Group({
      x: this.style.x,
      y: this.style.y,
      visible: this.style.visible,
      listening: false
    });

    this._line = new Konva.Line({
      points: [this.style.x, 0, this.style.x, this.style.height],
      stroke: this.style.fill,
      strokeWidth: this.style.lineWidth,
      listening: false
    })

    this._symbol = new Konva.Circle({
      fill: this.style.fill,
      radius: this.style.symbolHeight / 2,
      offsetY: this.style.symbolYOffset,
    });

    this._group.add(this._symbol);
    this._group.add(this._line);

    this._label = new Konva.Label({
      y: this.style.textYOffset,
      listening: false
    });

    this._text = new Konva.Text({
      fontSize: this.style.textFontSize,
      fontFamily: this._timeline.style.textFontFamily,
      fill: this.style.textFill,
      ...Constants.POSITION_TOP_LEFT,
      text: ``,
      listening: false
    });

    // this._label.y(-this._text.getSelfRect().height);

    this._label.add(this._text);
    this._group.add(this._label)


    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyed$)).subscribe((style) => {
      this.onMeasurementsChange();
    })

    this._timeline.onStyleChange$.pipe(takeUntil(this._destroyed$)).subscribe((timelineStyle) => {
      this._text.setAttrs({
        fontFamily: this._timeline.style.textFontFamily,
        fontStyle: this._timeline.style.textFontStyle,
      })
    })
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this._line.points([this._line.x(), 0, this._line.x(), this.style.height])
  }

  sync(x: number, isSnapped = false) {
    if (!this.style.visible) {
      this.toggleVisible(true);
    }

    let text = this._timeline.timelinePositionToTimeFormatted(x);

    let textRect = this._text.getSelfRect();
    let textHalfWidth = textRect.width / 2
    let labelX = -textHalfWidth;
    let horizontals = this._timeline.getTimecodedFloatingHorizontals();

    if ((horizontals.width - x) < (textHalfWidth)) {
      labelX = -textRect.width + (horizontals.width - x);
    } else if (x < textHalfWidth) {
      labelX = -textHalfWidth + (textHalfWidth - x);
    }

    this._group.x(x);
    this._text.text(text);
    this._label.x(labelX)

    if (isSnapped) {
      this._line.stroke(this.style.snappedFill)
      this._text.fill(this.style.snappedFill)
      this._symbol.visible(false);
    } else {
      this._line.stroke(this.style.fill)
      this._text.fill(this.style.textFill)
      this._symbol.visible(true);
    }
  }

  toggleVisible(visible: boolean) {
    this.style = {
      visible: visible
    }
    this._group.visible(visible);
  }

}
