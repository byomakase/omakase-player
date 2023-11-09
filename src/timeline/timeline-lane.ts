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

import {BaseComponent, Component, ComponentConfig} from "../common/component";
import Konva from "konva";
import {Dimension, OnMeasurementsChange, Position, RectMeasurement} from "../common/measurement";
import {Constants} from "../constants";
import {Timeline} from "./timeline";
import {filter, takeUntil} from "rxjs";
import {Validators} from "../validators";
import {StylesProvider} from "../common/styles-provider";
import {VideoController} from "../video/video-controller";
import {VideoControllerApi} from "../video/video-controller-api";

export interface TimelineLaneStyle {
  height: number;
  backgroundFill: string,
  backgroundOpacity: number,
  descriptionTextFill: string;
  descriptionFontSize: number;
  leftBackgroundFill: string,
  leftBackgroundOpacity: number,
}

export const TIMELINE_LANE_STYLE_DEFAULT: TimelineLaneStyle = {
  height: 80,
  backgroundFill: '#ffffff',
  backgroundOpacity: 1,
  descriptionTextFill: '#1c1c1c',
  descriptionFontSize: 15,
  leftBackgroundFill: '#ffffff',
  leftBackgroundOpacity: 1,
}

export interface TimelaneLaneConfig<S extends TimelineLaneStyle> extends ComponentConfig<S> {
  id: string;
  description: string;
}

export interface TimelaneLane<C extends TimelaneLaneConfig<S>, S extends TimelineLaneStyle> extends Component<C, S, Konva.Group>, OnMeasurementsChange {
  style: S;

  getId(): string;

  getDescription(): string;

  getRect(): RectMeasurement;

  getPosition(): Position;

  getDimension(): Dimension;

  setTimelinePosition(position: Position);

  getTimelinePosition(): Position;

  clearContent();

  setTimeline(timeline: Timeline);

  setVideoController(videoController: VideoControllerApi);
}

export type GenericTimelaneLane = TimelaneLane<TimelaneLaneConfig<TimelineLaneStyle>, TimelineLaneStyle>;

export abstract class BaseTimelineLane<C extends TimelaneLaneConfig<S>, S extends TimelineLaneStyle> extends BaseComponent<C, S, Konva.Group> implements TimelaneLane<C, S> {
  protected readonly stylesProvider: StylesProvider = StylesProvider.instance();

  protected id: string;
  protected description: string;

  protected timelinePosition: Position;

  // region konva
  protected bodyGroup: Konva.Group;
  protected bodyBackground: Konva.Rect;
  protected leftGroup: Konva.Group;
  protected leftBackground: Konva.Rect;
  protected leftPanelText: Konva.Text;
  // endregion

  protected timeline: Timeline;
  protected videoController: VideoControllerApi;

  protected constructor(config: C) {
    super(config);

    this.id = Validators.id()(this.config.id);
    this.description = Validators.description()(this.config.description);
  }

  protected createCanvasNode(): Konva.Group {
    this.bodyGroup = new Konva.Group({
      ...this.timelinePosition,
      width: this.timeline.getBodyGroupRect().width,
      height: this.styleAdapter.style.height
    });

    this.bodyBackground = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      ...this.bodyGroup.getSize(),
      fill: this.styleAdapter.style.backgroundFill,
      opacity: this.styleAdapter.style.backgroundOpacity,
      listening: false
    });

    this.leftGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      width: this.timeline.getLeftPanelRect().width,
      listening: false
    })

    this.leftBackground = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      ...this.leftGroup.getSize(),
      fill: this.styleAdapter.style.leftBackgroundFill,
      opacity: this.styleAdapter.style.leftBackgroundOpacity,
      listening: false
    });

    this.leftPanelText = new Konva.Text({
      ...Constants.POSITION_TOP_LEFT,
      text: this.description,
      fontSize: this.style.descriptionFontSize,
      fontFamily: this.stylesProvider.styles.omakasePlayerStyle.fontFamily,
      fill: this.style.descriptionTextFill,
      width: this.leftGroup.width() - 10,
      height: this.getRect().height,
      verticalAlign: 'middle',
      align: 'right'
    })

    this.leftGroup.add(this.leftBackground);
    this.leftGroup.add(this.leftPanelText);

    this.bodyGroup.add(this.bodyBackground);
    this.bodyGroup.add(this.leftGroup);

    return this.bodyGroup;
  }

  protected afterCanvasNodeInit() {
    this.settleLayout();

    // react on timeline zoom
    this.timeline.onZoom$.pipe(takeUntil(this.onDestroy$)).subscribe(event => {
      this.settleLayout();
    })

    this.stylesProvider.onChange$.pipe(takeUntil(this.onDestroy$), filter(p => !!p)).subscribe((styles) => {
      this.onStylesProviderChange();
    })

    this.styleAdapter.onChange$.pipe(takeUntil(this.onDestroy$), filter(p => !!p)).subscribe((styles) => {
      this.onStyleChange();
    })
  }

  onMeasurementsChange() {
    this.settleLayout();
  }

  /***
   * Global styles
   */
  onStylesProviderChange() {
    this.leftPanelText.setAttrs({
      fontFamily: this.stylesProvider.styles.omakasePlayerStyle.fontFamily
    })
  }

  onStyleChange() {
    this.bodyBackground.setAttrs({
      fill: this.styleAdapter.style.backgroundFill,
      opacity: this.styleAdapter.style.backgroundOpacity,
    })

    this.leftBackground.setAttrs({
      fill: this.styleAdapter.style.leftBackgroundFill,
      opacity: this.styleAdapter.style.leftBackgroundOpacity,
    })

    this.leftPanelText.setAttrs({
      fill: this.styleAdapter.style.leftBackgroundFill,
      opacity: this.styleAdapter.style.leftBackgroundOpacity,
    })
  }

  protected settleLayout() {
    this.bodyGroup.setAttrs({
      ...this.timelinePosition,
      width: this.timeline.getBodyGroupRect().width,
    });

    this.bodyBackground.setAttrs({
      ...this.bodyGroup.getSize()
    })

    this.leftGroup.setAttrs({
      width: this.timeline.getLeftPanelRect().width,
      height: this.bodyGroup.height(),
      visible: this.timeline.getLeftPanelVisible()
    })

    this.leftBackground.setAttrs({
      ...this.leftGroup.getSize()
    })
  }

  protected isTimelineReady(): boolean {
    return this.timeline && this.timeline.isTimelineReady();
  }

  clearContent() {
  }

  setTimeline(timeline: Timeline) {
    this.timeline = timeline;
  }

  setVideoController(videoController: VideoController) {
    this.videoController = videoController;
  }

  get style(): S {
    return super.style;
  }

  set style(value: Partial<S>) {
    super.style = value;
  }

  getRect(): RectMeasurement {
    return {
      ...this.getPosition(),
      ...this.getDimension()
    }
  }

  getPosition(): Position {
    return {
      ...this.bodyGroup.getPosition()
    }
  }

  getDimension(): Dimension {
    return {
      ...this.bodyGroup.getSize()
    }
  }

  getId(): string {
    return this.id;
  }

  getDescription(): string {
    return this.description;
  }

  setTimelinePosition(position: Position) {
    this.timelinePosition = position;
  }

  getTimelinePosition(): Position {
    return this.timelinePosition;
  }

  destroy() {
    this.clearContent();


    super.destroy();
  }

}
