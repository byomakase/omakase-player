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
import {HasRectMeasurement, OnMeasurementsChange, Position, RectMeasurement} from "../common/measurement";
import {filter, Subject, takeUntil} from "rxjs";
import {VideoLoadedEvent} from "../types";
import {StylesProvider} from "../common/styles-provider";
import {nextCompleteVoidSubject} from "../util/observable-util";
import {VideoControllerApi} from "../video/video-controller-api";

export interface TimecodeDisplayStyle {
  x: number;
  y: number;
  width: number;
  height: number;
  textFontSize: number;
  textFill: string;
  visible: boolean
}

export interface TimecodeDisplayConfig extends ComponentConfig<TimecodeDisplayStyle> {

}

const configDefault: TimecodeDisplayConfig = {
  style: {
    ...Constants.POSITION_TOP_LEFT,
    width: 150,
    height: 20,
    textFontSize: 20,
    textFill: '#0d0f05',
    visible: true
  }
}

export class TimecodeDisplay extends BaseComponent<TimecodeDisplayConfig, TimecodeDisplayStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement {
  protected readonly stylesProvider: StylesProvider = StylesProvider.instance();

  // region konva
  private group: Konva.Group;
  private text: Konva.Text;
  // endregion

  private videoController: VideoControllerApi;
  private videoEventStreamBreaker$ = new Subject<void>();

  constructor(config: Partial<ComponentConfigStyleComposed<TimecodeDisplayConfig>>, videoController: VideoControllerApi) {
    super(composeConfigAndDefault(config, configDefault));

    this.videoController = videoController;
  }

  protected createCanvasNode(): Konva.Group {
    this.group = new Konva.Group({
      x: this.style.x,
      y: this.style.y,
      width: this.style.width,
      height: this.style.height,
      listening: false,
      visible: this.style.visible
    });

    this.text = new Konva.Text({
      ...Constants.POSITION_TOP_LEFT,
      width: this.group.width(),
      height: this.group.height(),
      text: ``,
      fontSize: this.style.textFontSize,
      fontFamily: this.stylesProvider.styles.omakasePlayerStyle.fontFamily,
      fill: this.style.textFill,
      visible: true,
      align: 'left',
      verticalAlign: 'middle'
    });

    this.group.add(this.text);

    return this.group;
  }

  protected afterCanvasNodeInit() {
    super.afterCanvasNodeInit();

    this.stylesProvider.onChange$.pipe(filter(p => !!p), takeUntil(this.onDestroy$)).subscribe((styles) => {
      this.text.setAttrs({
        fontFamily: this.stylesProvider.styles.omakasePlayerStyle.fontFamily
      })
    })

    this.videoController.onVideoLoaded$.pipe(filter(p => !!p), takeUntil(this.onDestroy$)).subscribe((event) => {
      this.onVideoLoadedEvent(event);
    })
  }

  onMeasurementsChange() {
    this.group.width(this.style.width);
  }

  private fireVideoEventStreamBreaker() {
    nextCompleteVoidSubject(this.videoEventStreamBreaker$);
    this.videoEventStreamBreaker$ = new Subject<void>();
  }

  private onVideoLoadedEvent(event: VideoLoadedEvent) {
    this.fireVideoEventStreamBreaker();

    this.text.text(this.videoController.formatTimestamp(0));

    this.videoController.onVideoTimeChange$.pipe(takeUntil(this.videoEventStreamBreaker$)).subscribe((event) => {
      this.text.text(this.videoController.formatTimestamp(event.currentTime));
    })
  }

  setVisible(visible: boolean) {
    this.style = {
      visible: visible
    }
    if (this.isInitialized()) {
      this.group.visible(visible);
    }
  }

  setPosition(position: Position) {
    this.style = {
      ...position
    }
    this.group.setAttrs({
      ...position
    });
    this.onMeasurementsChange();
  }

  getRect(): RectMeasurement {
    return this.group.getClientRect();
  }

}
