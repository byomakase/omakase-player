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

import Konva from 'konva';
import {filter, Subject, takeUntil} from 'rxjs';
import {BaseKonvaComponent, type ComponentConfig, type ConfigWithOptionalStyle} from '../layout/konva-component';
import type {OnMeasurementsChange} from '../model';
import type {TimelineImpl} from '../timeline';
import {TIMELINE} from '../../constants';
import {TimelineEventType} from '../timeline-api';

export interface ScrubberStyle {
  fill: string;
  snappedFill: string;

  northLineWidth: number;
  northLineOpacity: number;

  southLineWidth: number;
  southLineOpacity: number;

  symbolHeight: number;
  symbolYOffset: number;
  symbolOpacity: number;

  textFontSize: number;
  textFill: string;
  textSnappedFill: string;
  textYOffset: number;

  visible: boolean;
}

export interface ScrubberConfig extends ComponentConfig<ScrubberStyle> {}

const configDefault: ScrubberConfig = {
  style: {
    fill: '#737373',
    snappedFill: '#ffd500',

    northLineWidth: 2,
    northLineOpacity: 1,

    southLineWidth: 2,
    southLineOpacity: 1,

    symbolHeight: 15,
    symbolYOffset: 0,
    symbolOpacity: 1,

    textFontSize: 12,
    textFill: '#0d0f05',
    textSnappedFill: '#f43530',
    textYOffset: 0,

    visible: false,
  },
};

export interface ScrubberMoveEvent {
  timecode: string;
  snapped: boolean;
}

export class Scrubber extends BaseKonvaComponent<ScrubberConfig, ScrubberStyle, Konva.Group> implements OnMeasurementsChange {
  public readonly onMove$: Subject<ScrubberMoveEvent> = new Subject<ScrubberMoveEvent>();

  protected _timeline: TimelineImpl;

  protected _group: Konva.Group;

  protected _label: Konva.Label;
  protected _text: Konva.Text;
  protected _symbol: Konva.Circle;

  protected _northLine: Konva.Line;
  protected _southLine: Konva.Line;

  constructor(config: Partial<ConfigWithOptionalStyle<ScrubberConfig>>, timeline: TimelineImpl) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    let listening = false;

    this._timeline = timeline;

    this._group = new Konva.Group({
      ...TIMELINE.positionTopLeft,
      visible: this.style.visible,
      listening: listening,
    });

    this._northLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: this.style.fill,
      strokeWidth: this.style.northLineWidth,
      listening: listening,
      opacity: this.style.northLineOpacity,
    });

    this._southLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: this.style.fill,
      strokeWidth: this.style.southLineWidth,
      listening: listening,
      opacity: this.style.southLineOpacity,
    });

    this._symbol = new Konva.Circle({
      fill: this.style.fill,
      radius: this.style.symbolHeight / 2,
      offsetY: this.style.symbolYOffset,
      opacity: this.style.symbolOpacity,
    });

    this._group.add(this._symbol);
    this._group.add(this._northLine);
    this._group.add(this._southLine);

    this._label = new Konva.Label({
      y: this.style.textYOffset,
      listening: listening,
    });

    this._text = new Konva.Text({
      fontSize: this.style.textFontSize,
      fontFamily: this._timeline.style.textFontFamily,
      fill: this.style.textFill,
      ...TIMELINE.positionTopLeft,
      text: ``,
      listening: listening,
    });

    this._label.add(this._text);
    this._group.add(this._label);

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((style) => {
      this.onStyleChange();
    });

    this._timeline.onEvent$
      .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_STYLE_CHANGE))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this._text.setAttrs({
          fontFamily: event.data.style.textFontFamily,
          fontStyle: event.data.style.textFontStyle,
        });
      });
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  protected onStyleChange() {
    this._group.visible(this.style.visible);

    let totalHeight = this._timeline.getTimecodedContainerDimension().height;
    let scrubberLaneHeight = this._timeline.getScrubberLane().getTimecodedRect().height;

    this._northLine.points([this._northLine.x(), 0, this._northLine.x(), scrubberLaneHeight]);
    this._southLine.points([this._southLine.x(), scrubberLaneHeight, this._southLine.x(), totalHeight]);
  }

  onMeasurementsChange() {
    this.onStyleChange();
  }

  move(x: number, isSnapped = false) {
    let timecode = this._timeline.timelinePositionToTimecode(x);
    let text = timecode;

    let textRect = this._text.getSelfRect();
    let textHalfWidth = textRect.width / 2;
    let labelX = -textHalfWidth;
    let horizontals = this._timeline.getTimecodedFloatingHorizontals();

    if (horizontals.width - x < textHalfWidth) {
      labelX = -textRect.width + (horizontals.width - x);
    } else if (x < textHalfWidth) {
      labelX = -textHalfWidth + (textHalfWidth - x);
    }

    this._group.x(x);
    this._text.text(text);
    this._label.x(labelX);

    if (isSnapped) {
      this._northLine.stroke(this.style.snappedFill);
      this._southLine.stroke(this.style.snappedFill);

      this._text.fill(this.style.snappedFill);
      this._symbol.visible(false);
    } else {
      this._northLine.stroke(this.style.fill);
      this._southLine.stroke(this.style.fill);

      this._text.fill(this.style.textFill);
      this._symbol.visible(true);
    }

    this.onMove$.next({timecode: timecode, snapped: isSnapped});
  }
}
