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

export interface TimelineLaneBorderStyle {
  width: Size;
  /** Defaults to `'solid'` when omitted. */
  style?: 'solid' | number[];
  color: Color;
}

export interface TimelineLaneBorderEdges {
  top?: TimelineLaneBorderStyle;
  bottom?: TimelineLaneBorderStyle;
}

export interface TimelineLaneStyle {
  height: number;
  marginTop: number;
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

  /** Shared top/bottom border for both panes; overridden per-pane by {@link leftBorder}/{@link rightBorder}. */
  border?: TimelineLaneBorderEdges | undefined;
  leftBorder?: TimelineLaneBorderEdges | undefined;
  rightBorder?: TimelineLaneBorderEdges | undefined;

  /**
   * Additional top/bottom padding applied to the lane's content area, on top of any implicit padding
   * reserved by {@link border}/{@link leftBorder}/{@link rightBorder} width. A single number applies to
   * both edges; a 2-element array is `[top, bottom]`.
   */
  padding?: number | number[];

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

function resolveBorderLineDash(style: TimelineLaneBorderStyle['style']): number[] {
  return !style || style === 'solid' ? [] : style;
}

function resolveLanePaddingEdges(padding: number | number[] | undefined): {top: number; bottom: number} {
  if (padding === undefined) {
    return {top: 0, bottom: 0};
  }
  if (typeof padding === 'number') {
    return {top: padding, bottom: padding};
  }
  let top = padding[0] ?? 0;
  return {top, bottom: padding.length >= 2 ? (padding[1] ?? 0) : top};
}

export abstract class BaseTimelineLane<C extends TimelineLaneConfig, S extends TimelineLaneStyle> implements TimelineLaneApi {
  protected _config: C;

  protected _id: string;
  protected _description?: string | undefined;

  protected _leftBgRect: Konva.Rect;
  protected _rightBgRect: Konva.Rect;

  protected _leftBorderTopLine: Konva.Line;
  protected _leftBorderBottomLine: Konva.Line;
  protected _rightBorderTopLine: Konva.Line;
  protected _rightBorderBottomLine: Konva.Line;

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

    this._leftBorderTopLine = KonvaFactory.createLine({listening: false});
    this._leftBorderBottomLine = KonvaFactory.createLine({listening: false});
    this._rightBorderTopLine = KonvaFactory.createLine({listening: false});
    this._rightBorderBottomLine = KonvaFactory.createLine({listening: false});
  }

  protected abstract createStyledElement(): StyledElementWithId<S>;

  protected abstract settleLayout(): void;

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
        fill: this._style.descriptionTextFill,
        fontSize: this._style.descriptionTextFontSize,
        offsetY: this._style.descriptionTextYOffset,
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

    let leftBorder = this._style.leftBorder ?? this._style.border;
    let rightBorder = this._style.rightBorder ?? this._style.border;

    this.applyBorderStyle(this._leftBorderTopLine, leftBorder?.top);
    this.applyBorderStyle(this._leftBorderBottomLine, leftBorder?.bottom);
    this.applyBorderStyle(this._rightBorderTopLine, rightBorder?.top);
    this.applyBorderStyle(this._rightBorderBottomLine, rightBorder?.bottom);

    this.repositionBorderLines(this._leftBgRect, this._leftBorderTopLine, this._leftBorderBottomLine);
    this.repositionBorderLines(this._rightBgRect, this._rightBorderTopLine, this._rightBorderBottomLine);

    this.updateLeftPaneContentPositions();
  }

  /**
   * `_mainLeftStartJustified`/`_mainLeftEndJustified`/`_mainLeftDescription` are `POSITION_TYPE_ABSOLUTE`
   * with `height: '100%'` — Yoga does not shrink a percentage-sized absolute child for its parent's
   * padding (only the implicit top offset respects it), so `height:'100%'` would overflow past a
   * configured bottom border/padding instead of centering within it. Setting explicit top/bottom
   * positions equal to the content insets makes Yoga derive the correct (shrunk) height instead.
   */
  protected updateLeftPaneContentPositions(): void {
    let positions = this.buildContentInsetSpacing('left');
    [this._mainLeftStartJustified, this._mainLeftEndJustified, this._mainLeftDescription].forEach((group) => group?.setPositions(positions));
  }

  /**
   * Konva strokes are centered on the path, so each line is inset by half its own
   * strokeWidth to stay fully inside the pane's box, flush with the edge — matching
   * how CSS border-top/border-bottom render, and avoiding a stroke half-clipped by
   * the right pane's clipFunc or bleeding outside the left pane's (unclipped) box.
   */
  protected repositionBorderLines(bgRect: Konva.Rect, topLine: Konva.Line, bottomLine: Konva.Line): void {
    let width = bgRect.width();
    let height = bgRect.height();
    let paneVisible = height > 0;

    let topStrokeWidth = topLine.strokeWidth() ?? 0;
    let topY = topStrokeWidth / 2;
    topLine.setAttrs({points: [0, topY, width, topY], visible: topLine.visible() && paneVisible});

    let bottomStrokeWidth = bottomLine.strokeWidth() ?? 0;
    let bottomY = Math.max(bottomStrokeWidth / 2, height - bottomStrokeWidth / 2);
    bottomLine.setAttrs({points: [0, bottomY, width, bottomY], visible: bottomLine.visible() && paneVisible});
  }

  protected applyBorderStyle(line: Konva.Line, border: TimelineLaneBorderStyle | undefined): void {
    line.setAttrs({
      stroke: border?.color ?? 'transparent',
      strokeWidth: border?.width ?? 0,
      dash: border ? resolveBorderLineDash(border.style) : [],
      visible: !!border,
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
        .spacing(this._style!.marginTop ? this._style!.marginTop : 0, 'EDGE_TOP')
        .spacing(this._style!.marginBottom ? this._style!.marginBottom : 0, 'EDGE_BOTTOM')
        .build(),
      justifyContent: 'JUSTIFY_FLEX_START',
    });

    // height:'100%' is intentionally omitted on these POSITION_TYPE_ABSOLUTE groups — Yoga does not
    // shrink a percentage-sized absolute child for its parent's padding, so height:'100%' would
    // overflow past a configured bottom border/padding. Explicit top/bottom positions (set below,
    // via updateLeftPaneContentPositions()) make Yoga derive the correct height instead.
    this._mainLeftStartJustified = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      clip: true,
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
      width: '100%',
      flexDirection: 'FLEX_DIRECTION_ROW_REVERSE',
      justifyContent: 'JUSTIFY_FLEX_START',
      alignItems: 'ALIGN_CENTER',
      positionType: 'POSITION_TYPE_ABSOLUTE',
      paddings: FlexSpacingBuilder.create().spacing(edgePadding, 'EDGE_START').build(),
    });

    flexGroup.addChild(this._mainLeftStartJustified).addChild(this._mainLeftEndJustified);
    this.updateLeftPaneContentPositions();

    flexGroup.contentNode.konvaNode.add(this._leftBorderTopLine, this._leftBorderBottomLine);
    this._leftBgRect.on('widthChange.timelineLaneBorder heightChange.timelineLaneBorder', () =>
      this.repositionBorderLines(this._leftBgRect, this._leftBorderTopLine, this._leftBorderBottomLine)
    );
    this.repositionBorderLines(this._leftBgRect, this._leftBorderTopLine, this._leftBorderBottomLine);

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
        width: '100%',
        flexDirection: 'FLEX_DIRECTION_ROW_REVERSE',
        justifyContent: 'JUSTIFY_FLEX_START',
        alignItems: 'ALIGN_CENTER',
        positionType: 'POSITION_TYPE_ABSOLUTE',
        paddings: FlexSpacingBuilder.create().spacing(edgePadding, 'EDGE_START').spacing(edgePadding, 'EDGE_END').build(),
      });

      this.mainLeftFlexGroup.addChild(this._mainLeftDescription);
      this.updateLeftPaneContentPositions();

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
    const flexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._rightBgRect,
      height: this._config.minimized ? 0 : this._style!.height,
      width: '100%',
      clip: true,
      margins: FlexSpacingBuilder.create()
        .spacing(this._style!.marginTop ? this._style!.marginTop : 0, 'EDGE_TOP')
        .spacing(this._style!.marginBottom ? this._style!.marginBottom : 0, 'EDGE_BOTTOM')
        .build(),
      justifyContent: 'JUSTIFY_FLEX_START',
    });

    flexGroup.contentNode.konvaNode.add(this._rightBorderTopLine, this._rightBorderBottomLine);
    this._rightBgRect.on('widthChange.timelineLaneBorder heightChange.timelineLaneBorder', () =>
      this.repositionBorderLines(this._rightBgRect, this._rightBorderTopLine, this._rightBorderBottomLine)
    );
    this.repositionBorderLines(this._rightBgRect, this._rightBorderTopLine, this._rightBorderBottomLine);

    return flexGroup;
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
        .spacing(this.style.marginTop ? this.style.marginTop : 0, 'EDGE_TOP')
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
    let insets = this.getContentInsets('right');
    let timelineTimecodedDimension = this._timeline?.getTimecodedFloatingDimension();
    return {
      x: 0,
      y: layout.top + insets.top,
      width: timelineTimecodedDimension ? timelineTimecodedDimension.width : 0,
      height: Math.max(0, layout.height - insets.top - insets.bottom),
    };
  }

  /**
   * Top/bottom space reserved on the given pane's content area: implicit padding from that pane's
   * resolved border width, plus {@link TimelineLaneStyle.padding}.
   */
  getContentInsets(pane: 'left' | 'right' = 'right'): {top: number; bottom: number} {
    let border = (pane === 'left' ? this._style!.leftBorder : this._style!.rightBorder) ?? this._style!.border;
    let paddingEdges = resolveLanePaddingEdges(this._style!.padding);
    return {
      top: (border?.top?.width ?? 0) + paddingEdges.top,
      bottom: (border?.bottom?.width ?? 0) + paddingEdges.bottom,
    };
  }

  getContentHeight(pane: 'left' | 'right' = 'right'): number {
    let insets = this.getContentInsets(pane);
    return Math.max(0, this._style!.height - insets.top - insets.bottom);
  }

  protected buildContentInsetSpacing(pane: 'left' | 'right') {
    let insets = this.getContentInsets(pane);
    return FlexSpacingBuilder.create().spacing(insets.top, 'EDGE_TOP').spacing(insets.bottom, 'EDGE_BOTTOM').build();
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
    this.applyStyle({
      height: 0,
      marginTop: 0,
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
      this.applyStyle({
        height: this._initialStyle.height,
        marginTop: this._initialStyle.marginTop ? this._initialStyle.marginTop : 0,
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
        this._minimizeEased(args)
          .pipe(take(1))
          .subscribe({
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
        this._maximizeEased(args)
          .pipe(take(1))
          .subscribe({
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
      let marginTop = this.style.marginTop ? this.style.marginTop : 0;
      let marginBottom = this.style.marginBottom ? this.style.marginBottom : 0;
      animate({
        duration: args.duration ? args.duration : TIMELINE.easingDuration,
        startValue: layout.height,
        endValue: 0,
        onUpdateHandler: (frame, value) => {
          let newHeight = Math.round(value);
          let newMarginTop = new Decimal(marginTop).mul(newHeight).div(this.style.height).toDecimalPlaces(0).toNumber();
          let newMargin = new Decimal(marginBottom).mul(newHeight).div(this.style.height).toDecimalPlaces(0).toNumber();

          this.applyStyle({
            height: newHeight,
            marginTop: newMarginTop,
            marginBottom: newMargin,
          } as Partial<S>);
          this.updateLayoutDimensions();
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
        let marginTop = this.style.marginTop ? this.style.marginTop : 0;
        let marginBottom = this.style.marginBottom ? this.style.marginBottom : 0;
        animate({
          duration: args.duration ? args.duration : TIMELINE.easingDuration,
          startValue: this.style.height,
          endValue: this._initialStyle.height, // revert to inital style from config
          onUpdateHandler: (frame, value) => {
            let newHeight = Math.round(value);
            let newMarginTop = new Decimal(marginTop).mul(newHeight).div(this.style.height).toDecimalPlaces(0).toNumber();
            let newMargin = new Decimal(marginBottom).mul(newHeight).div(this.style.height).toDecimalPlaces(0).toNumber();

            this.applyStyle({
              height: newHeight,
              marginTop: newMarginTop,
              marginBottom: newMargin,
            } as Partial<S>);
            this.updateLayoutDimensions();
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

  /**
   * Updates the style rule and re-applies paint (fills, fonts, etc.) without touching layout.
   * Internal callers that manage their own layout settling (minimize/maximize) use this
   * directly; {@link setStyle} builds on it and also resizes the lane.
   */
  protected applyStyle(style: Partial<S>): void {
    this.checkIsPrepared();
    this._ui!.updateStyleRule({
      id: this._styledElement!.id,
      style: {
        ...style,
      },
    });
    this.handleStyleUpdate();
  }

  setStyle(style: Partial<S>) {
    this.applyStyle(style);
    this.updateLayoutDimensions(true);
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
    // @ts-ignore
    this._mainLeftFlexGroup = void 0;

    this._mainRightFlexGroup?.destroy();
    // @ts-ignore
    this._mainRightFlexGroup = void 0;

    this._mainLeftDescription?.destroy();
    // @ts-ignore
    this._mainLeftDescription = void 0;

    this._mainLeftStartJustified?.destroy()
    // @ts-ignore
    this._mainLeftStartJustified = void 0;

    this._mainLeftEndJustified?.destroy();
    // @ts-ignore
    this._mainLeftEndJustified = void 0;

    this._uiBreaker.destroy();
    this._destroyBreaker.destroy();

    nullifier(this._config);
  }
}
