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

import type Konva from 'konva';
import {takeUntil} from 'rxjs';
import {TIMELINE} from '../../constants';
import {BaseKonvaComponent, type ComponentConfig, type ConfigWithOptionalStyle} from '../layout/konva-component';
import {KonvaFactory} from '../konva/konva-factory';
import type {Dimension, HasRectMeasurement, OnMeasurementsChange, Position, RectMeasurement} from '../model';
import {type TextCue, TimedItemTemporalUtil} from '../../media';
import type {PlayerApi} from '../../player';
import {MediaTemporalFormat} from '../../common';
import {isNullOrUndefined, nullifier} from '../../util/util-functions';
import type {Destroyable} from '../../common/capabilities';
import {TIMELINE_STYLE_DEFAULT} from '../timeline-style';

export interface TextCueVisualizationStyle {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  borderSize: number;
  borderColor: string;
  borderRadius: number;

  contentPadding: number;
  minWidthToShowContent: number;

  textFontSize: number;
  textFontFamily: string;
  textFill: string;
  minHeightToShowText: number;

  timestampsFontSize: number;
  timestampsFontFamily: string;
  timestampsFill: string;
  minHeightToShowTimestamps: number;
}

export interface TextCueVisualizationConfig extends ComponentConfig<TextCueVisualizationStyle> {
  showText: boolean;
  showTimestamps: boolean;
}

const configDefault: TextCueVisualizationConfig = {
  showText: false,
  showTimestamps: false,
  style: {
    ...TIMELINE.positionTopLeft,
    ...TIMELINE.dimensionZero,
    fill: '#001ff0',
    opacity: 1,
    borderSize: 0,
    borderColor: '#ffffff',
    borderRadius: 0,
    contentPadding: 0,
    minWidthToShowContent: 40,
    textFontSize: 10,
    textFontFamily: TIMELINE_STYLE_DEFAULT.textFontFamily,
    textFill: '#efefef',
    minHeightToShowText: 40,
    timestampsFontSize: 10,
    timestampsFontFamily: TIMELINE_STYLE_DEFAULT.textFontFamily,
    timestampsFill: '#efefef',
    minHeightToShowTimestamps: 70,
  },
};

export class TextCueVisualization extends BaseKonvaComponent<TextCueVisualizationConfig, TextCueVisualizationStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement, Destroyable {
  private readonly _group: Konva.Group;
  private readonly _bgRect: Konva.Rect;
  private readonly _textGroup: Konva.Group | undefined;
  private readonly _konvaText: Konva.Text | undefined;
  private readonly _konvaTimestamps: Konva.Text | undefined;

  private readonly _player: PlayerApi | undefined;

  private readonly _contentPlaceholder: string = '...';
  private _cues: TextCue[] = [];

  constructor(config: Partial<ConfigWithOptionalStyle<TextCueVisualizationConfig>>, playerApi?: PlayerApi) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._player = playerApi;

    this._group = KonvaFactory.createGroup({
      x: this.style.x,
      y: this.style.y,
      width: this.style.width,
      height: this.style.height,
    });

    const groupSize = this._group.getSize();
    const contentPadding = this.style.contentPadding;
    const borderSize = this.style.borderSize;

    this._bgRect = KonvaFactory.createBgRect({
      x: borderSize / 2,
      y: borderSize / 2,
      width: groupSize.width,
      height: groupSize.height,
      fill: this.style.fill,
      opacity: this.style.opacity,
      strokeWidth: borderSize,
      stroke: this.style.borderColor,
      cornerRadius: borderSize > 0 ? this.style.borderRadius : 0,
    });

    if (this.config.showText || this.config.showTimestamps) {
      this._textGroup = KonvaFactory.createGroup({
        x: contentPadding + borderSize,
        y: contentPadding + borderSize,
        width: groupSize.width - 2 * contentPadding - borderSize,
        height: groupSize.height - 2 * contentPadding - borderSize,
      });

      if (this.config.showText) {
        let timestampsVisible = this.config.showTimestamps && this.timestampsVisible;
        let text = this.resolveCueText();
        this._konvaText = KonvaFactory.createText({
          x: 0,
          y: 0,
          width: this._textGroup!.width(),
          height: timestampsVisible ? this._textGroup!.height() - this.style.timestampsFontSize : this._textGroup!.height(),
          fill: this.style.textFill,
          fontSize: this.style.textFontSize,
          fontFamily: this.style.textFontFamily,
          wrap: 'none',
          ellipsis: text !== this._contentPlaceholder,
          align: 'center',
          verticalAlign: timestampsVisible ? 'top' : 'middle',
          text,
        });

        this._textGroup.add(this._konvaText);
      }

      if (this.config.showTimestamps) {
        let textVisible = this.config.showText && this.textVisible;
        let text = this.resolveCueTimestamps();
        this._konvaTimestamps = KonvaFactory.createText({
          x: 0,
          y: textVisible ? this._konvaText!.height() : 0,
          width: this._textGroup!.width(),
          height: textVisible ? this.style.timestampsFontSize : this._textGroup!.height(),
          fill: this.style.timestampsFill,
          fontSize: this.style.timestampsFontSize,
          fontFamily: this.style.timestampsFontFamily,
          wrap: 'none',
          ellipsis: text !== this._contentPlaceholder,
          align: 'center',
          verticalAlign: textVisible ? 'bottom' : 'middle',
          text,
        });

        this._textGroup.add(this._konvaTimestamps);
      }
    }

    this._group.add(this._bgRect);
    if (this._textGroup) {
      this._group.add(this._textGroup);
    }

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
      let newBorderSize = this.style.borderSize;
      this._bgRect.setAttrs({
        x: newBorderSize / 2,
        y: newBorderSize / 2,
        fill: this.style.fill,
        opacity: this.style.opacity,
        strokeWidth: newBorderSize,
        stroke: this.style.borderColor,
        cornerRadius: newBorderSize > 0 ? this.style.borderRadius : 0,
      });

      if (this._textGroup) {
        let newContentPadding = this.style.contentPadding;
        this._textGroup.setAttrs({
          x: newContentPadding + newBorderSize,
          y: newContentPadding + newBorderSize,
          width: this._group.width() - 2 * newContentPadding - newBorderSize,
          height: this._group.height() - 2 * newContentPadding - newBorderSize,
        });
      }

      if (this._konvaText) {
        let timestampsVisible = this.config.showTimestamps && this.timestampsVisible;
        let text = this.resolveCueText();
        this._konvaText.setAttrs({
          width: this._textGroup!.width(),
          height: timestampsVisible ? this._textGroup!.height() - this.style.timestampsFontSize : this._textGroup!.height(),
          fill: this.style.textFill,
          fontSize: this.style.textFontSize,
          fontFamily: this.style.textFontFamily,
          verticalAlign: timestampsVisible ? 'top' : 'middle',
          ellipsis: text !== this._contentPlaceholder,
          text,
        });
      }

      if (this._konvaTimestamps) {
        let textVisible = this.config.showText && this.textVisible;
        let text = this.resolveCueTimestamps();
        this._konvaTimestamps.setAttrs({
          y: textVisible ? this._konvaText!.height() : 0,
          width: this._textGroup!.width(),
          height: textVisible ? this.style.timestampsFontSize : this._textGroup!.height(),
          fill: this.style.timestampsFill,
          fontSize: this.style.timestampsFontSize,
          fontFamily: this.style.timestampsFontFamily,
          verticalAlign: textVisible ? 'bottom' : 'middle',
          ellipsis: text !== this._contentPlaceholder,
          text,
        });
      }
    });
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange(): void {
    const size = this._group.getSize();
    this._bgRect.size(size);

    if (this._textGroup) {
      this._textGroup.size({
        width: size.width - 2 * this.style.contentPadding - this.style.borderSize,
        height: size.height - 2 * this.style.contentPadding - this.style.borderSize,
      });

      if (this._konvaText) {
        let timestampsVisible = this.config.showTimestamps && this.timestampsVisible;
        let text = this.resolveCueText();
        this._konvaText.setAttrs({
          width: this._textGroup.width(),
          height: timestampsVisible ? this._textGroup.height() - this.style.timestampsFontSize : this._textGroup.height(),
          verticalAlign: timestampsVisible ? 'top' : 'middle',
          ellipsis: text !== this._contentPlaceholder,
          text,
        });
      }

      if (this._konvaTimestamps) {
        let textVisible = this.config.showText && this.textVisible;
        let text = this.resolveCueTimestamps();
        this._konvaTimestamps.setAttrs({
          y: textVisible ? this._konvaText!.height() : 0,
          width: this._textGroup.width(),
          height: textVisible ? this.style.timestampsFontSize : this._textGroup.height(),
          verticalAlign: textVisible ? 'bottom' : 'middle',
          ellipsis: text !== this._contentPlaceholder,
          text,
        });
      }
    }
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

  get cues(): TextCue[] {
    return this._cues;
  }

  set cues(value: TextCue[]) {
    this._cues = value;
    this.onMeasurementsChange();
  }

  get textVisible(): boolean {
    return this.isCueContentShowable() && this._textGroup!.height() >= this.style.minHeightToShowText;
  }

  get timestampsVisible(): boolean {
    let minHeight = this.config.showText ? this.style.minHeightToShowTimestamps : this.style.minHeightToShowText;
    return !!this._player && this.isCueContentShowable() && this._textGroup!.height() >= minHeight;
  }

  private resolveCueText(): string {
    if (!this.textVisible) {
      if (this.cues.at(0)?.text) {
        return this._contentPlaceholder;
      }
      return '';
    }

    return this.cues.at(0)!.text;
  }

  private resolveCueTimestamps(): string {
    if (!this.timestampsVisible) {
      if (!this.config.showText || !this.resolveCueText()) {
        return this._contentPlaceholder;
      }
      return '';
    }

    const cue = this.cues.at(0)!;
    const startTime = TimedItemTemporalUtil.extractStartTime(cue.temporal);
    const endTime = TimedItemTemporalUtil.extractEndTime(cue.temporal);
    const hyphen = isNullOrUndefined(startTime) || isNullOrUndefined(endTime) ? '' : ' - ';
    const startTimecode = !isNullOrUndefined(startTime) ? this._player!.convertTime(startTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE) : '';
    const endTimecode = !isNullOrUndefined(endTime) ? this._player!.convertTime(endTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE) : '';
    const index = `#${cue.data['index']}`;

    return `${index} ${startTimecode}${hyphen}${endTimecode}`;
  }

  private isCueContentShowable(): boolean {
    return this.cues.length === 1 && !!this._textGroup && this._textGroup.width() >= this.style.minWidthToShowContent;
  }

  destroy() {
    super.destroy();

    this._group.destroy();
    this._bgRect.destroy();
    this._konvaText?.destroy();
    this._konvaTimestamps?.destroy();
    this._textGroup?.destroy();

    nullifier(this._player);
    this._cues = [];
  }
}
