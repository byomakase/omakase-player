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
import {BehaviorSubject, filter, Observable, ReplaySubject, take, takeUntil} from 'rxjs';
import {nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {StringUtil} from '../util/string-util';
import Decimal from 'decimal.js';
import {CryptoUtil} from '../util/crypto-util';
import {TextLabel, type TimelineNode} from './timeline-component';
import type {TimelineLaneApi, TimelineLaneMinimizeMaximizeArgs, TimelineLaneUpdateableAttrs} from './timeline-lane-api';
import {KonvaFlexGroup, KonvaFlexItem} from './layout/konva-flex';
import type {TimelineImpl} from './timeline';
import type {PlayerApi} from '../player';
import {z} from 'zod';
import {KonvaFactory} from './konva/konva-factory';
import {ObserverBreaker} from '../common/observer-breaker';
import {TimelineEventType} from './timeline-api';
import {FlexSpacingBuilder} from './layout/flex-node';
import {KonvaComponentFlexContentNode} from './layout/konva-component-flex';
import type {RectMeasurement} from './model';
import {animate} from './animation-util';
import {nullifier, objectHasOwnProperty} from '../util/util-functions';
import {affectsStyledElement, type Color, type Size, type StyledElementWithId, Ui} from '../ui';
import type {OmpProvider} from '../omp-provider';
import {TIMELINE} from '../constants';

export interface TimelineLaneStyle {
  height: number;
  marginBottom: number;
  backgroundFill: Color;
  backgroundOpacity: Size;
  descriptionTextFill: Color;
  descriptionTextFontSize: Size;

  descriptionTextFontStyle?: string;
  descriptionTextYOffset?: Size;

  leftBackgroundFill?: Color | undefined;
  leftBackgroundOpacity?: Size | undefined;
  rightBackgroundFill?: Color | undefined;
  rightBackgroundOpacity?: Size | undefined;

  loadingAnimationFill?: Color | undefined;
  loadingAnimationSpeed?: Size | undefined;
  loadingAnimationType?: 'pulse' | 'gradient' | undefined;
}

/**
 * Base configuration for classes that extend {@link BaseTimelineLane}
 */
export interface TimelineLaneConfig {
  minimized: boolean;

  description?: string | undefined;

  /** Show a loading animation while the lane's track(s) are loading. Defaults to `false`. */
  loadingAnimation?: boolean | undefined;
}

export const TIMELINE_LANE_CONFIG_DEFAULT: TimelineLaneConfig = {
  minimized: false,
  loadingAnimation: false,
};

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

const edgePadding = 5;

export abstract class BaseTimelineLane<C extends TimelineLaneConfig, S extends TimelineLaneStyle> implements TimelineLaneApi {
  protected _config: C;

  protected _id: string;
  protected _description?: string | undefined;

  protected _leftBgRect: Konva.Rect;
  protected _rightBgRect: Konva.Rect;

  protected _timecodedGroup?: Konva.Group;
  protected _loadingGroup?: Konva.Group;
  protected _loadingAnimation?: Konva.Animation;

  protected _mainLeftFlexGroup?: KonvaFlexGroup;
  protected _mainRightFlexGroup?: KonvaFlexGroup;
  protected _mainLeftDescription?: KonvaFlexGroup;
  protected _mainLeftStartJustified?: KonvaFlexGroup;
  protected _mainLeftEndJustified?: KonvaFlexGroup;
  protected _descriptionTextLabel?: TextLabel;

  protected _styledElement?: StyledElementWithId<S>;
  protected _providedStyle?: Partial<S> | undefined;
  protected _style?: S;
  protected _initialStyle?: S;

  protected _timeline?: TimelineImpl;
  protected _player?: PlayerApi;
  protected _ui?: Ui;

  protected _prepared = new BehaviorSubject(false);

  protected _uiBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(config: C, providedStyle?: Partial<S>) {
    this._config = config;

    this._id = CryptoUtil.uuid();
    this._providedStyle = providedStyle;

    this._leftBgRect = KonvaFactory.createRect();
    this._rightBgRect = KonvaFactory.createRect();
  }

  protected abstract createStyledElement(): StyledElementWithId<S>;

  protected abstract settleLayout(): void;

  /**
   * @internal
   * @param timeline
   * @param player
   * @param ompProvider
   */
  prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider) {
    this._timeline = timeline;
    this._player = player;
    this._ui = ompProvider.ui;

    this._styledElement = this.createStyledElement();

    if (this._providedStyle) {
      this._ui.updateStyleRule({
        id: this._styledElement.id,
        style: {
          ...this._providedStyle,
        },
      });
    }

    this._style = this._ui.resolveStyle(this._styledElement) as S;
    this._initialStyle = {
      ...this._style,
    };

    this._mainLeftFlexGroup = this.createMainLeftFlexGroup();
    this._mainRightFlexGroup = this.createMainRightFlexGroup();

    this._ui.onEvent$
      .pipe(filter((event) => affectsStyledElement(event, this._styledElement!)))
      .pipe(takeUntil(this._uiBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.handleStyleUpdate();
      });

    this._timeline.onEvent$
      .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_ZOOM || p.type === TimelineEventType.TIMELINE_SCROLL || p.type === TimelineEventType.TIMELINE_STYLE_CHANGE))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        switch (event.type) {
          case TimelineEventType.TIMELINE_ZOOM:
            this.handleTimelineZoom();
            break;
          case TimelineEventType.TIMELINE_SCROLL:
            this.handleTimelineScroll();
            break;
          case TimelineEventType.TIMELINE_STYLE_CHANGE:
            this.handleStyleUpdate();
            break;
        }
      });

    this._prepared
      .pipe(filter((p) => p))
      .pipe(take(1))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        if (this._config.description) {
          this.updateAttrs({
            description: this._config.description,
          });
        }
        this.handleStyleUpdate();
      });
  }

  protected handleStyleUpdate(): void {
    this.checkIsPrepared();

    this._style = this._ui!.resolveStyle(this._styledElement!) as S;

    if (this._descriptionTextLabel) {
      this._descriptionTextLabel.style = {
        fontFamily: this._timeline?.style.textFontFamily,
        fontStyle: this._style.descriptionTextFontStyle ?? this._timeline?.style.textFontStyle,
      };
    }

    let leftBgFill = this._style.leftBackgroundFill ? this._style.leftBackgroundFill : this._style.backgroundFill;
    let leftBgOpacity = this._style.leftBackgroundOpacity ? this._style.leftBackgroundOpacity : this._style.backgroundOpacity;

    this._leftBgRect.setAttrs({
      fill: leftBgFill,
      opacity: leftBgOpacity,
    });

    let rightBgFill = this._style.rightBackgroundFill ? this._style.rightBackgroundFill : this._style.backgroundFill;
    let rightBgOpacity = this._style.rightBackgroundOpacity ? this._style.rightBackgroundOpacity : this._style.backgroundOpacity;

    this._rightBgRect.setAttrs({
      fill: rightBgFill,
      opacity: rightBgOpacity,
    });
  }

  protected handleTimelineZoom(): void {
    this.settleLayout();
  }

  protected handleTimelineScroll(): void {}

  protected createMainLeftFlexGroup(): KonvaFlexGroup {
    let flexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._leftBgRect,
      height: this._config.minimized ? 0 : this._style!.height,
      width: '100%',
      margins: FlexSpacingBuilder.create()
        .spacing(this._style!.marginBottom ? this._style!.marginBottom : 0, 'EDGE_BOTTOM')
        .build(),
      justifyContent: 'JUSTIFY_FLEX_START',
    });

    this._mainLeftStartJustified = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      clip: true,
      height: '100%',
      width: '100%',
      justifyContent: 'JUSTIFY_FLEX_START',
      alignItems: 'ALIGN_CENTER',
      positionType: 'POSITION_TYPE_ABSOLUTE',
      paddings: FlexSpacingBuilder.create().spacing(edgePadding, 'EDGE_START').build(),
    });

    this._mainLeftEndJustified = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      // konvaBgNode: KonvaFactory.createRect({
      //   fill: 'blue',
      //   opacity: 0,
      // }),
      clip: true,
      height: '100%',
      width: '100%',
      flexDirection: 'FLEX_DIRECTION_ROW_REVERSE',
      justifyContent: 'JUSTIFY_FLEX_START',
      alignItems: 'ALIGN_CENTER',
      positionType: 'POSITION_TYPE_ABSOLUTE',
      paddings: FlexSpacingBuilder.create().spacing(edgePadding, 'EDGE_START').build(),
    });

    flexGroup.addChild(this._mainLeftStartJustified).addChild(this._mainLeftEndJustified);

    return flexGroup;
  }

  protected createDescriptionTextLabel() {
    this.checkIsPrepared();

    if (!this._mainLeftDescription) {
      this._mainLeftDescription = KonvaFlexGroup.of({
        konvaNode: KonvaFactory.createGroup({listening: false}),
        // konvaBgNode: KonvaFactory.createRect({
        //   fill: 'blue',
        //   opacity: 0,
        // }),
        clip: true,
        height: '100%',
        width: '100%',
        flexDirection: 'FLEX_DIRECTION_ROW_REVERSE',
        justifyContent: 'JUSTIFY_FLEX_START',
        alignItems: 'ALIGN_CENTER',
        positionType: 'POSITION_TYPE_ABSOLUTE',
        paddings: FlexSpacingBuilder.create().spacing(edgePadding, 'EDGE_START').spacing(edgePadding, 'EDGE_END').build(),
      });

      this.mainLeftFlexGroup.addChild(this._mainLeftDescription);

      this._descriptionTextLabel = new TextLabel({
        text: this._description,
        style: {
          fontSize: this._style!.descriptionTextFontSize,
          fontFamily: this._timeline!.style.textFontFamily,
          fontStyle: this._style!.descriptionTextFontStyle ?? this._timeline?.style.textFontStyle,
          fill: this._style!.descriptionTextFill,
          offsetY: this._style!.descriptionTextYOffset,
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
  }

  protected createMainRightFlexGroup(): KonvaFlexGroup {
    return KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._rightBgRect,
      height: this._config.minimized ? 0 : this._style!.height,
      width: '100%',
      clip: true,
      margins: FlexSpacingBuilder.create()
        .spacing(this._style!.marginBottom ? this._style!.marginBottom : 0, 'EDGE_BOTTOM')
        .build(),
      justifyContent: 'JUSTIFY_FLEX_START',
    });
  }

  onMeasurementsChange() {
    this.settleLayout();
  }

  /**
   * @internal
   * @param refreshLayout
   */
  updateLayoutDimensions(refreshLayout: boolean = true) {
    [this.mainLeftFlexGroup, this.mainRightFlexGroup].forEach((p) => {
      let marginFlexSpacing = FlexSpacingBuilder.create()
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

  get id(): string {
    return this._id;
  }

  get mainLeftFlexGroup(): KonvaFlexGroup {
    return this._mainLeftFlexGroup!;
  }

  get mainRightFlexGroup(): KonvaFlexGroup {
    return this._mainRightFlexGroup!;
  }

  addTimelineNode(config: TimelineLaneComponentConfig): TimelineNode {
    this.checkIsPrepared();

    let flexItem = new KonvaFlexItem(
      {
        width: config.width,
        height: config.height,
        margins: config.margin ? FlexSpacingBuilder.create().topRightBottomLeft(config.margin).build() : void 0,
      },
      new KonvaComponentFlexContentNode(config.timelineNode)
    );

    if (config.justify === 'start') {
      this._mainLeftStartJustified!.addChild(flexItem);
    } else {
      this._mainLeftEndJustified!.addChild(flexItem);
    }

    return config.timelineNode;
  }

  isMinimized(): boolean {
    return this.getTimecodedRect().height === 0;
  }

  /**
   * @internal
   */
  _minimize(refreshLayout: boolean = true) {
    this.setStyle({
      height: 0,
      marginBottom: 0,
    } as Partial<S>);
    this.updateLayoutDimensions(refreshLayout);
  }

  /**
   * @internal
   */
  _maximize(refreshLayout: boolean = true) {
    this.checkIsPrepared();

    if (this._initialStyle) {
      this.setStyle({
        height: this._initialStyle.height,
        marginBottom: this._initialStyle.marginBottom ? this._initialStyle.marginBottom : 0,
      } as Partial<S>);
      this.updateLayoutDimensions(refreshLayout);
    }
  }

  minimize(args?: TimelineLaneMinimizeMaximizeArgs) {
    if (args) {
      const subject = new ReplaySubject<void>(1);
      args.complete = subject.asObservable();
      if (args.easing) {
        this._minimizeEased(args).pipe(take(1)).subscribe({
          complete: () => nextCompleteObserver(subject),
        });
      } else {
        this._minimize();
        nextCompleteObserver(subject);
      }
    } else {
      this._minimize();
    }
  }

  maximize(args?: TimelineLaneMinimizeMaximizeArgs) {
    if (args) {
      const subject = new ReplaySubject<void>(1);
      args.complete = subject.asObservable();
      if (args.easing) {
        this._maximizeEased(args).pipe(take(1)).subscribe({
          complete: () => nextCompleteObserver(subject),
        });
      } else {
        this._maximize();
        nextCompleteObserver(subject);
      }
    } else {
      this._maximize();
    }
  }

  protected checkIsPrepared() {
    if (!this._prepared.value) {
      throw new Error('Timeline lane not added to timeline. Add timeline lane to timeline first');
    }
  }

  private _minimizeEased(args: TimelineLaneMinimizeMaximizeArgs): Observable<void> {
    this.checkIsPrepared();

    return passiveObservable((observer) => {
      let layout = this.mainLeftFlexGroup.getLayout();
      let marginBottom = this.style.marginBottom ? this.style.marginBottom : 0;
      animate({
        duration: args.duration ? args.duration : TIMELINE.easingDuration,
        startValue: layout.height,
        endValue: 0,
        onUpdateHandler: (frame, value) => {
          let newHeight = Math.round(value);
          let newMargin = new Decimal(marginBottom).mul(newHeight).div(this.style.height).toDecimalPlaces(0).toNumber();

          this.setStyle({
            height: newHeight,
            marginBottom: newMargin,
          } as Partial<S>);
        },
        onCompleteHandler: (frame, value) => {
          this.minimize();
          nextCompleteObserver(observer);
        },
      });
    });
  }

  private _maximizeEased(args: TimelineLaneMinimizeMaximizeArgs): Observable<void> {
    this.checkIsPrepared();

    return passiveObservable((observer) => {
      if (this._initialStyle) {
        let marginBottom = this.style.marginBottom ? this.style.marginBottom : 0;
        animate({
          duration: args.duration ? args.duration : TIMELINE.easingDuration,
          startValue: this.style.height,
          endValue: this._initialStyle.height, // revert to inital style from config
          onUpdateHandler: (frame, value) => {
            let newHeight = Math.round(value);
            let newMargin = new Decimal(marginBottom).mul(newHeight).div(this.style.height).toDecimalPlaces(0).toNumber();

            this.setStyle({
              height: newHeight,
              marginBottom: newMargin,
            } as Partial<S>);
          },
          onCompleteHandler: (frame, value) => {
            this.maximize();
            nextCompleteObserver(observer);
          },
        });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  toggleMinimizeMaximize(args?: TimelineLaneMinimizeMaximizeArgs) {
    if (this.isMinimized()) {
      this.maximize(args);
    } else {
      this.minimize(args);
    }
  }

  get style(): S {
    this.checkIsPrepared();
    return this._style!;
  }

  setStyle(style: Partial<S>) {
    this.checkIsPrepared();
    this._ui!.updateStyleRule({
      id: this._styledElement!.id,
      style: {
        ...style,
      },
    });
    this.handleStyleUpdate();
  }

  updateAttrs(attrs: TimelineLaneUpdateableAttrs): void {
    if (objectHasOwnProperty(attrs, 'description')) {
      this._description = z.coerce.string().max(TIMELINE.descriptionMaxLength).parse(`${attrs.description}`);
      this.updateDescriptionTextLabel(this._description);
    }
  }

  protected updateDescriptionTextLabel(description: string | undefined) {
    this.createDescriptionTextLabel();
    if (this._descriptionTextLabel) {
      this._descriptionTextLabel.text = `${StringUtil.isEmpty(description) ? '' : description}`;
    }
  }

  destroy() {
    this.clearContent();

    this._timecodedGroup?.destroy();
    this._loadingAnimation?.stop();
    this._loadingGroup?.destroy();

    this._mainLeftFlexGroup?.destroy();
    this._mainRightFlexGroup?.destroy();

    this._uiBreaker.destroy();
    this._destroyBreaker.destroy();

    nullifier(this._config);
  }
}
