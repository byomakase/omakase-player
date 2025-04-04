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

import Konva from 'konva';
import {Position, RectMeasurement, StyleAdapter} from '../common';
import {Timeline} from './timeline';
import {filter, Observable, Subject, takeUntil} from 'rxjs';
import {Validators} from '../validators';
import {VideoControllerApi} from '../video';
import {KonvaFlexGroup, KonvaFlexItem} from '../layout/konva-flex';
import {nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {StringUtil} from '../util/string-util';
import {animate} from '../util/animation-util';
import Decimal from 'decimal.js';
import {FlexSpacingBuilder} from '../layout/flex-node';
import {destroyer, nullifier} from '../util/destroy-util';
import {TextLabel, TimelineNode} from './timeline-component';
import {KonvaComponentFlexContentNode} from '../layout/konva-component-flex';
import {TimelineLaneApi} from '../api';
import {KonvaFactory} from '../factory/konva-factory';
import {SelectRequired, WithOptionalPartial, WithRequired} from '../types';
import {isNullOrUndefined} from '../util/object-util';
import {DownsampleConfig} from '../api/vtt-aware-api';
import {CryptoUtil} from '../util/crypto-util';

/**
 * Base configuration for classes that extend {@link BaseTimelineLane}
 */
export interface TimelineLaneConfig<S extends TimelineLaneStyle> {
  style: S;

  id?: string;
  description?: string;
  layoutEasingDuration?: number;

  minimized?: boolean;
}

/**
 * Base style for classes that extend {@link BaseTimelineLane}
 */
export interface TimelineLaneStyle {
  height: number;
  marginBottom?: number;

  backgroundFill?: string;
  backgroundOpacity?: number;
  descriptionTextFill?: string;
  descriptionTextFontSize?: number;
  descriptionTextFontStyle?: string;
  descriptionTextYOffset?: number;

  leftBackgroundFill?: string;
  leftBackgroundOpacity?: number;
  rightBackgroundFill?: string;
  rightBackgroundOpacity?: number;
}

export const TIMELINE_LANE_STYLE_DEFAULT: TimelineLaneStyle = {
  height: 80,
  backgroundFill: '#ffffff',
  backgroundOpacity: 1,
  descriptionTextFill: '#1c1c1c',
  descriptionTextFontSize: 15,
};

export const TIMELINE_LANE_CONFIG_DEFAULT: WithRequired<TimelineLaneConfig<TimelineLaneStyle>, 'layoutEasingDuration'> = {
  style: TIMELINE_LANE_STYLE_DEFAULT,
  layoutEasingDuration: 300,
  minimized: false,
};

export const VTT_DOWNSAMPLE_CONFIG_DEFAULT: DownsampleConfig = {
  downsamplePeriod: 1000,
  downsampleStrategy: 'none',
};

type DefaultStyleOverrides = Pick<WithOptionalPartial<TimelineLaneConfig<any>, 'style'>, 'style'>;

// Omit<T, keyof SelectRequired<TimelineLaneConfig<any>>> - selects only non-required properties
// DefaultStyleOverrides - marks style as non-required and all its members as non-required
// result object is union of two
export type TimelineLaneConfigDefaultsExcluded<T extends TimelineLaneConfig<any>> = Omit<T, keyof SelectRequired<TimelineLaneConfig<any>>> & DefaultStyleOverrides;

export function timelineLaneComposeConfig<T extends Pick<TimelineLaneConfig<any>, 'style'>, K extends DefaultStyleOverrides>(configDefault: T, config: K): T & K {
  return {
    ...configDefault,
    ...config,
    style: {
      ...configDefault.style,
      ...config.style,
    },
  };
}

export interface TimelineLaneComponentConfig {
  /**
   * {@link TimelineNode} to add
   */
  timelineNode: TimelineNode;

  /**
   * Justify to start or end
   */
  justify: 'start' | 'end';

  /**
   * Width
   */
  width: number;

  /**
   * Height
   */
  height: number;

  /**
   * Margins: [top, right, bottom, left]
   */
  margin?: number[]; // top, right, bottom, left
}

export interface TimelineCueSubscriptionConfig {
  /**
   * How often (in seconds) to update cues array
   */
  interval?: number;

  /**
   * Delay (in seconds) to remove cue from array after passing the endTime
   */
  removeDelay?: number;

  /**
   * Maximum count of cues in the array
   */
  maxCount?: number;
}

export abstract class BaseTimelineLane<C extends TimelineLaneConfig<S>, S extends TimelineLaneStyle> implements TimelineLaneApi {
  protected readonly _destroyed$ = new Subject<void>();

  protected _config: C;
  protected _styleAdapter: StyleAdapter<S>;

  protected _id: string;
  protected _description?: string;

  protected _leftBgRect: Konva.Rect;
  protected _rightBgRect: Konva.Rect;

  protected _mainLeftFlexGroup: KonvaFlexGroup;
  protected _mainRightFlexGroup: KonvaFlexGroup;
  protected _mainLeftDescription?: KonvaFlexGroup;
  protected _mainLeftStartJustified!: KonvaFlexGroup;
  protected _mainLeftEndJustified!: KonvaFlexGroup;
  protected _descriptionTextLabel?: TextLabel;

  protected _timeline?: Timeline;
  protected _videoController?: VideoControllerApi;

  protected constructor(config: C) {
    this._config = config;
    this._styleAdapter = new StyleAdapter<S>(this._config.style);

    this._id = StringUtil.isNullUndefinedOrWhitespace(this._config.id) ? CryptoUtil.uuid() : Validators.id()(this._config.id!);

    if (this._config.description) {
      this._description = Validators.description()(this._config.description);
    }

    this._leftBgRect = KonvaFactory.createRect({
      fill: this._styleAdapter.style.leftBackgroundFill ? this._styleAdapter.style.leftBackgroundFill : this._styleAdapter.style.backgroundFill,
      opacity: this._styleAdapter.style.leftBackgroundOpacity ? this._styleAdapter.style.leftBackgroundOpacity : this._styleAdapter.style.backgroundOpacity,
    });

    this._rightBgRect = KonvaFactory.createRect({
      fill: this._styleAdapter.style.rightBackgroundFill ? this._styleAdapter.style.rightBackgroundFill : this._styleAdapter.style.backgroundFill,
      opacity: this._styleAdapter.style.rightBackgroundOpacity ? this._styleAdapter.style.rightBackgroundOpacity : this._styleAdapter.style.backgroundOpacity,
    });

    this._mainLeftFlexGroup = this.createMainLeftFlexGroup();
    this._mainRightFlexGroup = this.createMainRightFlexGroup();

    this._styleAdapter.onChange$
      .pipe(
        takeUntil(this._destroyed$),
        filter((p) => !!p)
      )
      .subscribe((styles) => {
        this.onStyleChange();
      });
  }

  protected abstract settleLayout(): void;

  prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    this._timeline = timeline;
    this._videoController = videoController;

    // react on timeline zoom
    this._timeline.onZoom$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.settleLayout();
    });

    this._timeline.onStyleChange$.pipe(takeUntil(this._destroyed$)).subscribe((timelineStyle) => {
      this.onStyleChange();
    });
  }

  protected createMainLeftFlexGroup(): KonvaFlexGroup {
    let flexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._leftBgRect,
      height: this._config.minimized ? 0 : this._styleAdapter.style.height,
      width: '100%',
      margins: FlexSpacingBuilder.instance()
        .spacing(this.style.marginBottom ? this.style.marginBottom : 0, 'EDGE_BOTTOM')
        .build(),
      justifyContent: 'JUSTIFY_FLEX_START',
    });

    this._mainLeftStartJustified = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: KonvaFactory.createRect({
        fill: 'red',
        opacity: 0,
      }),
      clip: true,
      height: '100%',
      width: '100%',
      justifyContent: 'JUSTIFY_FLEX_START',
      alignItems: 'ALIGN_CENTER',
      positionType: 'POSITION_TYPE_ABSOLUTE',
      paddings: FlexSpacingBuilder.instance().spacing(5, 'EDGE_START').build(),
    });

    this._mainLeftEndJustified = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: KonvaFactory.createRect({
        fill: 'blue',
        opacity: 0,
      }),
      clip: true,
      height: '100%',
      width: '100%',
      flexDirection: 'FLEX_DIRECTION_ROW_REVERSE',
      justifyContent: 'JUSTIFY_FLEX_START',
      alignItems: 'ALIGN_CENTER',
      positionType: 'POSITION_TYPE_ABSOLUTE',
      paddings: FlexSpacingBuilder.instance().spacing(5, 'EDGE_START').build(),
    });

    if (StringUtil.isNonEmpty(this._description)) {
      // if description is to be updated, we will move this outside if
      this._mainLeftDescription = KonvaFlexGroup.of({
        konvaNode: KonvaFactory.createGroup(),
        konvaBgNode: KonvaFactory.createRect({
          fill: 'blue',
          opacity: 0,
        }),
        clip: true,
        height: '100%',
        width: '100%',
        flexDirection: 'FLEX_DIRECTION_ROW_REVERSE',
        justifyContent: 'JUSTIFY_FLEX_START',
        alignItems: 'ALIGN_CENTER',
        positionType: 'POSITION_TYPE_ABSOLUTE',
        paddings: FlexSpacingBuilder.instance().spacing(5, 'EDGE_START').build(),
      });

      flexGroup.addChild(this._mainLeftDescription);

      this._descriptionTextLabel = new TextLabel({
        text: this._description,
        style: {
          fontSize: this._styleAdapter.style.descriptionTextFontSize,
          fontFamily: this._timeline?.style.textFontFamily,
          fontStyle: this._styleAdapter.style.descriptionTextFontStyle ?? this._timeline?.style.textFontStyle,
          fill: this._styleAdapter.style.descriptionTextFill,
          offsetY: this._styleAdapter.style.descriptionTextYOffset,
          align: 'right',
          verticalAlign: 'middle',
        },
      });

      let flexItem = new KonvaFlexItem(
        {
          width: '100%',
          height: '100%',
          flexGrow: 1,
        },
        new KonvaComponentFlexContentNode(this._descriptionTextLabel)
      );

      this._mainLeftDescription.addChild(flexItem);
    }

    flexGroup.addChild(this._mainLeftStartJustified).addChild(this._mainLeftEndJustified);

    return flexGroup;
  }

  protected createMainRightFlexGroup(): KonvaFlexGroup {
    return KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._rightBgRect,
      height: this._config.minimized ? 0 : this._styleAdapter.style.height,
      width: '100%',
      clip: true,
      margins: FlexSpacingBuilder.instance()
        .spacing(this.style.marginBottom ? this.style.marginBottom : 0, 'EDGE_BOTTOM')
        .build(),
      justifyContent: 'JUSTIFY_FLEX_START',
    });
  }

  onMeasurementsChange() {
    this.settleLayout();
  }

  protected onStyleChange() {
    if (this._descriptionTextLabel) {
      this._descriptionTextLabel.style = {
        fontFamily: this._timeline?.style.textFontFamily,
        fontStyle: this._styleAdapter.style.descriptionTextFontStyle ?? this._timeline?.style.textFontStyle,
      };
    }

    this._leftBgRect.setAttrs({
      fill: this._styleAdapter.style.leftBackgroundFill ? this._styleAdapter.style.leftBackgroundFill : this._styleAdapter.style.backgroundFill,
      opacity: this._styleAdapter.style.leftBackgroundOpacity ? this._styleAdapter.style.leftBackgroundOpacity : this._styleAdapter.style.backgroundOpacity,
    });

    this._rightBgRect.setAttrs({
      fill: this._styleAdapter.style.rightBackgroundFill ? this._styleAdapter.style.rightBackgroundFill : this._styleAdapter.style.backgroundFill,
      opacity: this._styleAdapter.style.rightBackgroundOpacity ? this._styleAdapter.style.leftBackgroundOpacity : this._styleAdapter.style.backgroundOpacity,
    });

    // removed from style updates to enable bulk minimize / maximize
    // this.updateLayoutDimensions({
    //   height: this.style.height,
    //   marginBottom: this.style.marginBottom ? this.style.marginBottom : 0
    // })
  }

  updateLayoutDimensions(refreshLayout: boolean = true) {
    [this.mainLeftFlexGroup, this.mainRightFlexGroup].forEach((p) => {
      let marginFlexSpacing = FlexSpacingBuilder.instance()
        .spacing(this.style.marginBottom ? this.style.marginBottom : 0, 'EDGE_BOTTOM')
        .build();

      p.setHeightAndMargins(this.style.height, marginFlexSpacing, false); // refreshLayout = false because we want refresh to occurr when both left and right panel layouts were recalculated
    });
    if (refreshLayout) {
      this._timeline?.settleLayout();
    }
  }

  clearContent() {}

  getTimecodedRect(): RectMeasurement {
    let layout = this.mainRightFlexGroup.getLayout();
    let timelineTimecodedDimension = this._timeline?.getTimecodedFloatingDimension();
    return {
      x: 0,
      y: layout.top,
      width: timelineTimecodedDimension ? timelineTimecodedDimension.width : 0,
      height: layout.height,
    };
  }

  getTimecodedPointerPosition(): Position | undefined {
    return this._timeline ? this._timeline.getTimecodedFloatingRelativePointerPosition() : void 0;
  }

  getTimecodedPointerPositionTime(): number {
    return this._timeline && this.getTimecodedPointerPosition() ? this._timeline.timelinePositionToTime(this.getTimecodedPointerPosition()!.x) : 0;
  }

  get id(): string {
    return this._id;
  }

  get mainLeftFlexGroup(): KonvaFlexGroup {
    return this._mainLeftFlexGroup;
  }

  get mainRightFlexGroup(): KonvaFlexGroup {
    return this._mainRightFlexGroup;
  }

  addTimelineNode(config: TimelineLaneComponentConfig): TimelineNode {
    let flexItem = new KonvaFlexItem(
      {
        width: config.width,
        height: config.height,
        margins: config.margin ? FlexSpacingBuilder.instance().topRightBottomLeft(config.margin).build() : void 0,
      },
      new KonvaComponentFlexContentNode(config.timelineNode)
    );

    if (config.justify === 'start') {
      this._mainLeftStartJustified.addChild(flexItem);
    } else {
      this._mainLeftEndJustified.addChild(flexItem);
    }

    return config.timelineNode;
  }

  isMinimized(): boolean {
    return this.getTimecodedRect().height === 0;
  }

  minimizeInternal(refreshLayout: boolean = true) {
    this.style = {
      height: 0,
      marginBottom: 0,
    } as Partial<S>;
    this.updateLayoutDimensions(refreshLayout);
  }

  maximizeInternal(refreshLayout: boolean = true) {
    // revert to inital style from config
    this.style = {
      height: this._config.style.height,
      marginBottom: this._config.style.marginBottom ? this._config.style.marginBottom : 0,
    } as Partial<S>;
    this.updateLayoutDimensions(refreshLayout);
  }

  minimize() {
    this.minimizeInternal();
  }

  maximize() {
    this.maximizeInternal();
  }

  minimizeEased(): Observable<void> {
    if (!this._timeline) {
      throw new Error('Timeline lane not added to timeline');
    }

    return passiveObservable((observer) => {
      let layout = this._mainLeftFlexGroup.getLayout();
      let marginBottom = this._styleAdapter.style.marginBottom ? this._styleAdapter.style.marginBottom : 0;
      animate({
        duration: isNullOrUndefined(this._config.layoutEasingDuration) ? TIMELINE_LANE_CONFIG_DEFAULT.layoutEasingDuration : this._config.layoutEasingDuration!,
        startValue: layout.height,
        endValue: 0,
        onUpdateHandler: (frame, value) => {
          let newHeight = Math.round(value);
          let newMargin = new Decimal(marginBottom).mul(newHeight).div(this._styleAdapter.style.height).toDecimalPlaces(0).toNumber();

          this.style = {
            height: newHeight,
            marginBottom: newMargin,
          } as Partial<S>;
        },
        onCompleteHandler: (frame, value) => {
          this.minimize();
          nextCompleteObserver(observer);
        },
      });
    });
  }

  maximizeEased(): Observable<void> {
    if (!this._timeline) {
      throw new Error('Timeline lane not added to timeline');
    }

    return passiveObservable((observer) => {
      let layout = this._mainLeftFlexGroup.getLayout();
      let marginBottom = this._styleAdapter.style.marginBottom ? this._styleAdapter.style.marginBottom : 0;
      animate({
        duration: isNullOrUndefined(this._config.layoutEasingDuration) ? TIMELINE_LANE_CONFIG_DEFAULT.layoutEasingDuration : this._config.layoutEasingDuration!,
        startValue: this.style.height,
        endValue: this._config.style.height, // revert to inital style from config
        onUpdateHandler: (frame, value) => {
          let newHeight = Math.round(value);
          let newMargin = new Decimal(marginBottom).mul(newHeight).div(this._styleAdapter.style.height).toDecimalPlaces(0).toNumber();

          this.style = {
            height: newHeight,
            marginBottom: newMargin,
          } as Partial<S>;
        },
        onCompleteHandler: (frame, value) => {
          this.maximize();
          nextCompleteObserver(observer);
        },
      });
    });
  }

  toggleMinimizeMaximize() {
    if (this.isMinimized()) {
      this.maximize();
    } else {
      this.minimize();
    }
  }

  toggleMinimizeMaximizeEased(): Observable<void> {
    if (this.isMinimized()) {
      return this.maximizeEased();
    } else {
      return this.minimizeEased();
    }
  }

  get style(): S {
    return this._styleAdapter.style;
  }

  set style(value: Partial<S>) {
    this._styleAdapter.style = value;
  }

  set description(value: string) {
    this._description = value;
    if (this._descriptionTextLabel) {
      this._descriptionTextLabel.text = this._description;
    }
  }

  destroy() {
    this.clearContent();

    destroyer(this.mainLeftFlexGroup, this.mainRightFlexGroup);

    nextCompleteSubject(this._destroyed$);

    nullifier(this._config, this._styleAdapter);
  }
}
