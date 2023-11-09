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

import {BaseComponent, ComponentConfig, ComponentConfigStyleComposed, composeConfigAndDefault} from "../common/component";
import Konva from "konva";
import {Constants} from "../constants";
import {OnMeasurementsChange} from "../common/measurement";
import {Timeline} from "./timeline";
import {filter, takeUntil} from "rxjs";
import {StylesProvider} from "../common/styles-provider";

export interface PlayheadHoverStyle {
  x: number;
  y: number;
  height: number;
  fill: string;
  fillSnapped: string;
  lineWidth: number;
  symbolY: number;
  symbolHeight: number;
  textFontSize: number;
  textFill: string;
  textSnappedFill: string;
  visible: boolean;
}

export interface PlayheadHoverConfig extends ComponentConfig<PlayheadHoverStyle> {

}

const configDefault: PlayheadHoverConfig = {
  style: {
    ...Constants.POSITION_TOP_LEFT,
    height: 100,
    fill: '#737373',
    fillSnapped: '#ffd500',
    lineWidth: 2,
    symbolY: 0,
    symbolHeight: 15,
    textFontSize: 12,
    textFill: '#0d0f05',
    textSnappedFill: '#f43530',
    visible: false
  }
}

export class PlayheadHover extends BaseComponent<PlayheadHoverConfig, PlayheadHoverStyle, Konva.Group> implements OnMeasurementsChange {
  protected readonly stylesProvider: StylesProvider = StylesProvider.instance();

  protected group: Konva.Group;
  protected line: Konva.Line;
  protected symbol: Konva.Circle;
  protected label: Konva.Label;
  protected text: Konva.Text;

  private timeline: Timeline;

  constructor(config: Partial<ComponentConfigStyleComposed<PlayheadHoverConfig>>, timeline: Timeline) {
    super(composeConfigAndDefault(config, configDefault));
    this.timeline = timeline;
  }

  protected createCanvasNode(): Konva.Group {
    this.group = new Konva.Group({
      x: this.style.x,
      y: this.style.y,
      visible: this.style.visible,
      listening: false
    });

    this.line = new Konva.Line({
      points: [this.style.x, 0, this.style.x, this.style.height],
      stroke: this.style.fill,
      strokeWidth: this.style.lineWidth,
      listening: false
    })

    this.symbol = new Konva.Circle({
      y: this.style.symbolY,
      fill: this.style.fill,
      radius: this.style.symbolHeight / 2,
      offsetY: -this.style.symbolHeight / 2
    });

    this.group.add(this.symbol);
    this.group.add(this.line);

    this.label = new Konva.Label({
      ...Constants.POSITION_TOP_LEFT,
      listening: false
    });

    this.text = new Konva.Text({
      fontSize: this.style.textFontSize,
      fontFamily: this.stylesProvider.styles.omakasePlayerStyle.fontFamily,
      fill: this.style.textFill,
      ...Constants.POSITION_TOP_LEFT,
      text: ``,
      listening: false
    });

    this.label.y(-this.text.getSelfRect().height);

    this.label.add(this.text);
    this.group.add(this.label)

    return this.group;
  }

  protected afterCanvasNodeInit() {
    this.styleAdapter.onChange$.pipe(takeUntil(this.onDestroy$)).subscribe((style) => {
      this.onMeasurementsChange();
    })

    this.stylesProvider.onChange$.pipe(filter(p => !!p), takeUntil(this.onDestroy$)).subscribe((styles) => {
      this.text.setAttrs({
        fontFamily: this.stylesProvider.styles.omakasePlayerStyle.fontFamily
      })
    })
  }

  onMeasurementsChange() {
    this.line.points([this.line.x(), 0, this.line.x(), this.style.height])
  }

  sync(x: number, isSnapped = false) {
    if (!this.style.visible) {
      this.toggleVisible(true);
    }

    let text = this.timeline.timelinePositionToTimeFormatted(x);

    let textRect = this.text.getSelfRect();
    let textHalfWidth = textRect.width / 2
    let labelX = -textHalfWidth;
    let horizontalMeasurement = this.timeline.getTimecodedGroupHorizontalMeasurement();

    if ((horizontalMeasurement.width - x) < (textHalfWidth)) {
      labelX = -textRect.width + (horizontalMeasurement.width - x);
    } else if (x < textHalfWidth) {
      labelX = -textHalfWidth + (textHalfWidth - x);
    }

    this.group.x(x);
    this.text.text(text);
    this.label.x(labelX)

    if (isSnapped) {
      this.line.stroke(this.style.fillSnapped)
      this.text.fill(this.style.fillSnapped)
      this.symbol.visible(false);
    } else {
      this.line.stroke(this.style.fill)
      this.text.fill(this.style.fill)
      this.symbol.visible(true);
    }
  }

  toggleVisible(visible: boolean) {
    this.style = {
      visible: visible
    }
    this.group.visible(visible);
  }

}
