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
import {HasRectMeasurement, OnMeasurementsChange, RectMeasurement} from '../common/measurement';
import {filter, Subject, takeUntil} from 'rxjs';
import {VideoLoadedEvent} from '../types';
import {nextCompleteVoidSubject} from '../util/observable-util';
import {VideoControllerApi} from '../video/video-controller-api';
import {TimelineApi} from '../api';

export interface TimecodeDisplayStyle {
  x: number;
  y: number;
  width: number;
  height: number;

  visible: boolean,

  fontSize?: number;
  fill?: string;
  offsetY?: number,
}

export interface TimecodeDisplayConfig extends ComponentConfig<TimecodeDisplayStyle> {

}

const configDefault: TimecodeDisplayConfig = {
  style: {
    ...Constants.POSITION_TOP_LEFT,
    width: 150,
    height: 20,

    visible: true,

    fontSize: 20,
    fill: '#0d0f05',
    offsetY: -3,
  }
}

export class TimecodeDisplay extends BaseKonvaComponent<TimecodeDisplayConfig, TimecodeDisplayStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement {
  private _timeline: TimelineApi;
  private _videoController: VideoControllerApi;

  private _group: Konva.Group;
  private _text: Konva.Text;

  private _videoEventStreamBreaker$ = new Subject<void>();

  constructor(config: Partial<ConfigWithOptionalStyle<TimecodeDisplayConfig>>, timeline: TimelineApi, videoController: VideoControllerApi) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._timeline = timeline;
    this._videoController = videoController;

    this._group = new Konva.Group({
      x: this.style.x,
      y: this.style.y,
      width: this.style.width,
      height: this.style.height,
      listening: false,
      visible: this.style.visible,
    });

    this._text = new Konva.Text({
      ...Constants.POSITION_TOP_LEFT,
      width: this._group.width(),
      // height: this._group.height(),
      text: ``,
      fontSize: this.style.fontSize,
      fontFamily: this._timeline.style.textFontFamily,
      fontStyle: this._timeline.style.textFontStyle,
      fill: this.style.fill,
      visible: true,
      align: 'left',
      verticalAlign: 'middle',
      offsetY: this.style.offsetY
    });

    this._group.add(this._text);

    this._timeline.onStyleChange$.pipe(takeUntil(this._destroyed$)).subscribe((timelineStyle) => {
      this._text.setAttrs({
        fontFamily: this._timeline.style.textFontFamily,
        fontStyle: this._timeline.style.textFontStyle,
      })
    })

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyed$), filter(p => !!p)).subscribe((styles) => {
      this._text.setAttrs({
        fontSize: styles.fontSize,
        fill: styles.fill
      })
    })

    this._videoController.onVideoLoaded$.pipe(filter(p => !!p), takeUntil(this._destroyed$)).subscribe((event) => {
      this.onVideoLoadedEvent(event!);
    })
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this._text.size({
      ...this._group.size()
    })
  }

  private fireVideoEventStreamBreaker() {
    nextCompleteVoidSubject(this._videoEventStreamBreaker$);
    this._videoEventStreamBreaker$ = new Subject<void>();
  }

  private onVideoLoadedEvent(event: VideoLoadedEvent) {
    this.fireVideoEventStreamBreaker();

    this._text.text(this._videoController.formatToTimecode(0));

    this._videoController.onVideoTimeChange$.pipe(takeUntil(this._videoEventStreamBreaker$)).subscribe((event) => {
      this._text.text(this._videoController.formatToTimecode(event.currentTime));
    })
  }

  setVisible(visible: boolean) {
    this.style = {
      visible: visible
    }
    this._group.visible(visible);
  }

  getRect(): RectMeasurement {
    return this._group.getClientRect();
  }

}
