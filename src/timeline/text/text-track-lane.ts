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
import {type SpanTemporal, type TextCue, type TextCueState, type TextTrack, TimedItemsTrackEventType, TimedItemTemporalType, TimedItemTemporalUtil, TrackEventType} from '../../media';
import type {PlayerApi} from '../../player';
import type {TimelineImpl} from '../timeline';
import {TIMELINE_LANE_CONFIG_DEFAULT, type TimelineLaneStyle} from '../timeline-lane';
import {BaseTrackLane, type TrackLaneConfig} from '../track-lane';
import {TextCueVisualization, type TextCueVisualizationStyle} from './text-cue-visualization';
import {combineLatest, filter, Observable, Subject, takeUntil} from 'rxjs';
import {WindowPlaybackMode} from '../../common';
import type {SessionApi} from '../../session';
import {SessionEventType} from '../../session';
import {type ConfigAndStyle} from '../timeline-api';
import {omitKeys, removeEmptyValues} from '../../util/object-util';
import {konvaUnlistener} from '../konva/konva-util';
import {type StyledElementWithId, type UiElementProps, UiEventType} from '../../ui';
import type {OmpProvider} from '../../omp-provider';
import type {Position} from '../model';
import {freeObserver} from '../../util/rxjs-util';
import {isNullOrUndefined} from '../../util/util-functions';

export interface TextTrackLaneStyle extends TimelineLaneStyle {
  itemOpacity: number;
  itemFill: string;
  itemBorderSize: number;
  itemBorderColor: string;
  itemBorderRadius: number;

  itemContentPadding: number;
  /** Minimal required cue width for text/timestamps rendering. */
  itemMinWidthToShowContent: number;

  itemTextFontSize: number;
  itemTextFontFamily: string;
  itemTextFill: string;
  /** Minimal required cue content height for text rendering. */
  itemMinHeightToShowText: number;

  itemTimestampsFontSize: number;
  itemTimestampsFontFamily: string;
  itemTimestampsFill: string;
  /** Minimal required cue content height for timestamps rendering if {@link showCueText} is enabled.
   * If {@link showCueText} is disabled, minimal height becomes {@link itemMinHeightToShowText}
   */
  itemMinHeightToShowTimestamps: number;
}

export interface TextTrackLaneElementProps extends UiElementProps {
  inForeground?: boolean | undefined;
}

export interface TextTrackLaneConfig extends TrackLaneConfig {
  showCueText: boolean;
  showCueTimestamps: boolean;
}

const configDefault: TextTrackLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  showCueText: false,
  showCueTimestamps: false,
};

export enum TextTrackLaneEventType {
  TIMELINE_TEXT_TRACK_LANE_ITEM_CLICK = 'TIMELINE_TEXT_TRACK_LANE_ITEM_CLICK',
  TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_ENTER = 'TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_ENTER',
  TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_LEAVE = 'TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_LEAVE',

  TIMELINE_TEXT_TRACK_LANE_ITEM_IN_FOREGROUND_CHANGE = 'TIMELINE_TEXT_TRACK_LANE_ITEM_IN_FOREGROUND_CHANGE',
}

export interface TextTrackLaneEventData {
  cues: TextCueState[];
  cuesInForeground: TextCueState[];
}

export type TextTrackLaneEventTypeDataMap = {
  [TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_CLICK]: TextTrackLaneEventData;
  [TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_ENTER]: TextTrackLaneEventData;
  [TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_LEAVE]: TextTrackLaneEventData;

  [TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_IN_FOREGROUND_CHANGE]: {
    cuesInForeground: TextCueState[];
  };
};

export type TextTrackLaneEvent = {
  [K in TextTrackLaneEventType]: {
    type: K;
    data: TextTrackLaneEventTypeDataMap[K];
  };
}[keyof TextTrackLaneEventTypeDataMap];

export class TextTrackLane extends BaseTrackLane<TextTrackLaneConfig, TextTrackLaneStyle, TextTrack> {
  private readonly _onEvent$: Subject<TextTrackLaneEvent> = new Subject<TextTrackLaneEvent>();

  protected _textMarkingsGroup?: Konva.Group;
  protected _textCueVisualizations: Map<number, TextCueVisualization> = new Map();
  protected _squashedCueGroups: TextCue[][] = [];
  protected _cueSquashThreshold: number = 0.5;
  protected _session?: SessionApi;
  /** A render asked for while the window was mid-move, to be run once it settles. */
  protected _renderPending = false;

  private _squashedCueClick$: Subject<Position> = new Subject();

  constructor(configAndStyle?: ConfigAndStyle<TextTrackLaneConfig, TextTrackLaneStyle>) {
    super(
      {
        ...configDefault,
        ...omitKeys(configAndStyle, 'style'),
      },
      configAndStyle?.style
    );

    combineLatest([this._prepared, this._trackSet])
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(([prepared, trackSet]) => {
        this._canRender = prepared && trackSet;

        if (prepared && trackSet) {
          this.trySetOnTrackDeleted();
          this.tryUpdateDescription();
        }

        if (this._canRender) {
          this.render();
        }
      });

    this._squashedCueClick$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((position) => {
      this.handleSquashedCueClick(position);
    });
  }

  override setTrack(track: TextTrack) {
    super.setTrack(track);

    if (this._track) {
      this._track.onEvent$.pipe(takeUntil(this._trackUpdateBreaker.observer)).subscribe((event) => {
        switch (event.type) {
          case TrackEventType.TRACK_UPDATED:
            this.handleTrackUpdated();
            break;
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED:
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED:
            this.handleTrackUpdated();
            break;
        }
      });
    } else {
      this.clearContent();
    }
  }

  protected override handleStyleUpdate(): void {
    super.handleStyleUpdate();

    this._textCueVisualizations.forEach((visualization) => {
      visualization.style = removeEmptyValues<Partial<TextCueVisualizationStyle>>({
        fill: this.style.itemFill,
        opacity: this.style.itemOpacity,
        borderSize: this.style.itemBorderSize,
        borderColor: this.style.itemBorderColor,
        borderRadius: this.style.itemBorderRadius,
        contentPadding: this.style.itemContentPadding,
        minWidthToShowContent: this.style.itemMinWidthToShowContent,
        textFontSize: this.style.itemTextFontSize,
        textFontFamily: this.style.itemTextFontFamily,
        textFill: this.style.itemTextFill,
        minHeightToShowText: this.style.itemMinHeightToShowText,
        timestampsFontSize: this.style.itemTimestampsFontSize,
        timestampsFontFamily: this.style.itemTimestampsFontFamily,
        timestampsFill: this.style.itemTimestampsFill,
        minHeightToShowTimestamps: this.style.itemMinHeightToShowTimestamps,
      });
    });
  }

  protected createStyledElement(): StyledElementWithId<TextTrackLaneStyle> {
    return {
      id: this._id,
      classes: [this._ui!.resolveStyleClass('TimelineLane'), this._ui!.resolveStyleClass('TextTrackLane')],
    };
  }

  override prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider): void {
    super.prepareForTimeline(timeline, player, ompProvider);

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = new Konva.Group({
      ...timecodedRect,
    });
    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 1);

    // _timecodedGroup is already built from getTimecodedRect(), which itself is the border/padding
    // inset content rect — so this child group must start at local y=0, not insets.top again, or
    // cues would be pushed further down than the border/padding call for.
    this._textMarkingsGroup = new Konva.Group({
      x: 0,
      y: 0,
      width: this._timecodedGroup.width(),
      height: this.getContentHeight('right'),
    });

    this._timecodedGroup.add(this._textMarkingsGroup);

    this._session = ompProvider.sessionStore;

    ompProvider.sessionStore.onEvent$
      .pipe(
        filter((event) => event.type === SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((event) => {
        if (this.isWindowPlaybackSettled(event.data.windowPlayback.mode) && this._renderPending) {
          this.render();
        }
      });

    this._ui!.onEvent$.pipe(filter((event) => event.type === UiEventType.UI_ELEMENT_UPDATED))
      .pipe(filter((event) => !!this.getCueVisualization(event.data.element.id)))
      .pipe(takeUntil(this._uiBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        const element = this._ui!.getElement<TextTrackLaneElementProps>(event.data.element.id);
        if (element) {
          this.handleForegroundUpdate(element.id, !!element.props?.inForeground);
        }
      });

    this._prepared.next(true);
  }

  private handleTrackUpdated() {
    this.render();
  }

  render(): void {
    if (!this.isWindowPlaybackSettled()) {
      this._renderPending = true;
      return;
    }
    this._renderPending = false;

    this._squashedCueGroups = this.squashCues(this._track?.timedItemsSorted ?? []);
    this.adjustCueVisualizations();
  }

  private isWindowPlaybackSettled(mode: WindowPlaybackMode | undefined = this._session?.state.windowPlayback.mode): boolean {
    return mode === void 0 || mode === WindowPlaybackMode.ATTACHED || mode === WindowPlaybackMode.DETACHED;
  }

  clearContent(): void {
    super.clearContent();
    this._textCueVisualizations.forEach((v) => {
      konvaUnlistener(v.konvaNode);
      v.destroy();
    });
    this._textMarkingsGroup?.destroyChildren();
    this._textCueVisualizations.clear();
    this._squashedCueGroups = [];
  }

  protected override handleTimelineScroll(): void {
    super.handleTimelineScroll();
    this.render();
  }

  protected override createLoadingGroupContent(width: number, height: number): Konva.Animation {
    const fill = this.style.loadingAnimationFill ?? '#ffffff';
    const period = this.style.loadingAnimationSpeed ?? 800;
    // _loadingGroup itself is already positioned at getTimecodedRect().y, the border/padding inset
    // content top — so content drawn inside it starts at local y=0, not insets.top again.
    const insets = this.getContentInsets('right');
    const contentY = 0;
    const contentHeight = height - insets.top - insets.bottom;
    const lineCount = Math.ceil(width / 4);

    const positions = Array.from({length: lineCount}, (_, i) => ({
      x: (i / lineCount) * width + Math.random() * 2,
      w: 1 + Math.floor(Math.random() * 10),
      visible: Math.random() < 0.5,
      nextChangeTime: Math.random() * period,
    }));

    const shape = new Konva.Shape({
      width,
      height,
      fill,
      listening: false,
      sceneFunc(ctx, shape) {
        ctx.beginPath();
        for (const p of positions) {
          if (p.visible) {
            ctx.rect(p.x, contentY, p.w, contentHeight);
          }
        }
        ctx.fillStrokeShape(shape);
      },
    });

    this._loadingGroup!.add(shape);

    const anim = new Konva.Animation((frame) => {
      const t = frame!.time;
      for (const pos of positions) {
        if (t >= pos.nextChangeTime) {
          pos.visible = !pos.visible;
          pos.nextChangeTime = t + period * 0.25 + Math.random() * (period * 0.75);
        }
      }
    });

    anim.start();
    return anim;
  }

  protected hasVisualElements(): boolean {
    return this._textCueVisualizations.size > 0;
  }

  settleLayout(): void {
    super.settleLayout();
    let timelineTimecodedDimension = this._timeline!.getTimecodedFloatingDimensionForLane(this.id);
    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup!.setAttrs({
      x: timecodedRect.x,
      y: timecodedRect.y,
    });

    [this._timecodedGroup, this._textMarkingsGroup].forEach((node) => {
      node!.width(timecodedRect.width);
    });
    this._textMarkingsGroup!.height(this.getContentHeight('right'));

    // clipY/clipHeight used to be computed via a (timecodedRect.height / this.style.height) ratio,
    // which canceled out to exactly 1 pre-border/padding (timecodedRect.height always equaled the
    // raw lane height then) — i.e. clipY was always 0 and clipHeight always simplified to
    // timelineTimecodedDimension.height. Now that border/padding insets make timecodedRect.height
    // smaller than the raw height, that ratio is no longer 1 and would clip away the top of the
    // content by the inset amount. Use the values the formula always actually produced.
    let clipX = -this._timeline!.style.rightPaneClipPadding;
    let clipY = 0;
    let clipWidth = timecodedRect.width + this._timeline!.style.rightPaneClipPadding * 2;
    let clipHeight = timelineTimecodedDimension.height;

    this._timecodedGroup!.clipFunc((ctx) => {
      ctx.rect(clipX, clipY, clipWidth, clipHeight);
    });

    this.render();
  }

  protected handleForegroundUpdate(cueId: TextCue['id'], inForeground: boolean): void {
    this.checkIsPrepared();

    const cueTextVisualization = this.getCueVisualization(cueId);
    const itemsInForeground = this.getItemsInForeground();

    if (!cueTextVisualization) {
      return;
    }

    const removeCueForeground = (itemId: string) => {
      this._ui!.updateElement<TextTrackLaneElementProps>({
        id: itemId,
        props: {
          inForeground: void 0,
        },
      });
    };

    if (!inForeground) {
      cueTextVisualization.konvaNode.moveToBottom();

      this._onEvent$.next({
        type: TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_IN_FOREGROUND_CHANGE,
        data: {
          cuesInForeground: this.getItemsInForeground().map((cv) => cv.state),
        },
      });
    } else {
      this._textMarkingsGroup?.moveToTop();
      cueTextVisualization.konvaNode.moveToTop();

      this._onEvent$.next({
        type: TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_IN_FOREGROUND_CHANGE,
        data: {
          cuesInForeground: this.getItemsInForeground().map((cv) => cv.state),
        },
      });

      let foregroundGroupTemporal = this.getGroupTemporal(cueTextVisualization.cues);
      let foregroundItemStartTime = parseFloat(foregroundGroupTemporal.start);
      let foregroundItemEndTime = parseFloat(foregroundGroupTemporal.end);

      itemsInForeground
        .filter((p) => !cueTextVisualization.cues.includes(p))
        .forEach((cue) => {
          if (!isNullOrUndefined(foregroundItemStartTime) && !isNullOrUndefined(foregroundItemEndTime)) {
            if (TimedItemTemporalUtil.touchesTimeRange(cue.temporal, foregroundItemStartTime, foregroundItemEndTime)) {
              removeCueForeground(cue.id);
            }
          } else {
            let startTime = TimedItemTemporalUtil.extractStartTime(cue.temporal);
            let endTime = TimedItemTemporalUtil.extractEndTime(cue.temporal);

            if (isNullOrUndefined(startTime) && !isNullOrUndefined(endTime) && TimedItemTemporalUtil.touchesTimeRange(foregroundGroupTemporal, startTime!, endTime!)) {
              removeCueForeground(cue.id);
            }
          }
        });
    }
  }

  moveToForeground(itemIndex: number): void {
    const cueTextVisualization = this._textCueVisualizations.get(itemIndex);
    if (!cueTextVisualization || cueTextVisualization.cues.find((cue) => this.getItemsInForeground().includes(cue))) {
      return;
    }

    cueTextVisualization.cues.forEach((cue) => {
      this._ui!.updateElement<TextTrackLaneElementProps>({
        id: cue.id,
        props: {
          inForeground: true,
        },
      });
    });
  }

  private getItemsInForeground(): TextCue[] {
    if (!this._ui) {
      return [];
    }
    return Array.from(this._textCueVisualizations.values()).flatMap((cv) => cv.cues.filter((cue) => !!this._ui?.getElement<TextTrackLaneElementProps>(cue.id)?.props?.inForeground));
  }

  private squashCues(cues: TextCue[]): TextCue[][] {
    if (!cues.length) {
      return [];
    }

    const duration = this._player!.getDuration();
    const timecodedWidth = this.getTimecodedRect().width;
    const singlePixelDuration = duration / timecodedWidth;
    const threshold = singlePixelDuration * this._cueSquashThreshold;

    const squashedGroups: TextCue[][] = [];
    let currentGroup: TextCue[] = [cues[0]!];
    let lastCue: TextCue = cues[0]!;
    let lastEnd = TimedItemTemporalUtil.extractEndTime(cues[0]!.temporal) ?? this._player!.getDuration();

    for (let i = 1; i < cues.length; i++) {
      const cue = cues[i]!;
      const start = TimedItemTemporalUtil.extractStartTime(cue.temporal) ?? 0;

      if (this.isCueContentVisible(lastCue)) {
        squashedGroups.push(currentGroup);
        currentGroup = [];
      } else if (start - lastEnd >= threshold) {
        const firstStart = TimedItemTemporalUtil.extractStartTime(currentGroup[0]!.temporal) ?? 0;
        if (lastEnd - firstStart >= threshold) {
          squashedGroups.push(currentGroup);
        }
        currentGroup = [];
      }
      currentGroup.push(cue);
      lastCue = cue;
      lastEnd = TimedItemTemporalUtil.extractEndTime(cue.temporal) ?? this._player!.getDuration();
    }

    if (currentGroup.length > 0) {
      const firstStart = TimedItemTemporalUtil.extractStartTime(currentGroup[0]!.temporal) ?? 0;
      if (this.isCueContentVisible(currentGroup[0]!) || lastEnd - firstStart >= threshold) {
        squashedGroups.push(currentGroup);
      }
    }

    return squashedGroups;
  }

  private adjustCueVisualizations(): void {
    const visibleRange = this._timeline!.getVisibleTimeRange();
    const cueHeight = this.getContentHeight('right');
    const newIndices = new Set<number>();

    this._squashedCueGroups.forEach((group, index) => {
      const groupTemporal = this.getGroupTemporal(group);
      const start = parseFloat(groupTemporal.start);
      const end = parseFloat(groupTemporal.end);
      const visible = !(end < visibleRange.start || start > visibleRange.end);

      const existing = this._textCueVisualizations.get(index);

      if (!visible) {
        if (existing) {
          konvaUnlistener(existing.konvaNode);
          existing.destroy();
          this._textCueVisualizations.delete(index);
        }
        return;
      }

      newIndices.add(index);
      const xStart = this._timeline!.timeToTimelinePosition(start);
      const xEnd = this._timeline!.timeToTimelinePosition(end);

      if (existing) {
        existing.cues = group;
        existing.konvaNode.setAttrs({x: xStart, width: xEnd - xStart, height: cueHeight});
        existing.onMeasurementsChange();
      } else {
        const cueVisualization = new TextCueVisualization(
          {
            showText: this._config.showCueText,
            showTimestamps: this._config.showCueTimestamps,
            style: removeEmptyValues<Partial<TextCueVisualizationStyle>>({
              x: xStart,
              width: xEnd - xStart,
              height: cueHeight,
              fill: this.style.itemFill,
              opacity: this.style.itemOpacity,
              borderSize: this.style.itemBorderSize,
              borderColor: this.style.itemBorderColor,
              borderRadius: this.style.itemBorderRadius,
              contentPadding: this.style.itemContentPadding,
              minWidthToShowContent: this.style.itemMinWidthToShowContent,
              textFontSize: this.style.itemTextFontSize,
              textFontFamily: this.style.itemTextFontFamily,
              textFill: this.style.itemTextFill,
              minHeightToShowText: this.style.itemMinHeightToShowText,
              timestampsFontSize: this.style.itemTimestampsFontSize,
              timestampsFontFamily: this.style.itemTimestampsFontFamily,
              timestampsFill: this.style.itemTimestampsFill,
              minHeightToShowTimestamps: this.style.itemMinHeightToShowTimestamps,
            }),
          },
          this._player
        );
        cueVisualization.cues = group;
        this._textCueVisualizations.set(index, cueVisualization);
        this._textMarkingsGroup!.add(cueVisualization.konvaNode);
        this.attachCueListeners(cueVisualization);

        const itemsInForeground = this.getItemsInForeground();
        if (!group.find((cue) => itemsInForeground.includes(cue))) {
          cueVisualization.konvaNode.moveToBottom();
        }
      }
    });

    // Remove stale visualizations whose squash group no longer exists
    for (const [index, visualization] of this._textCueVisualizations) {
      if (!newIndices.has(index)) {
        konvaUnlistener(visualization.konvaNode);
        visualization.destroy();
        this._textCueVisualizations.delete(index);
      }
    }
  }

  private getGroupTemporal(group: TextCue[]): SpanTemporal {
    const start = group.reduce((min, curr) => {
      let startTime = TimedItemTemporalUtil.extractStartTime(curr.temporal) ?? 0;
      return startTime < min ? startTime : min;
    }, Infinity);
    const end = group.reduce((max, curr) => {
      let endTime = TimedItemTemporalUtil.extractEndTime(curr.temporal) ?? this._player!.getDuration();
      return endTime > max ? endTime : max;
    }, -Infinity);

    return {
      type: TimedItemTemporalType.SPAN,
      start: `${start}`,
      end: `${end}`,
    };
  }

  private attachCueListeners(cueVisualization: TextCueVisualization): void {
    const node = cueVisualization.konvaNode;
    const emitEvent = (type: TextTrackLaneEventType) => {
      this._onEvent$.next({
        type,
        data: {
          cues: cueVisualization.cues,
          cuesInForeground: this.getItemsInForeground().map((cue) => cue.state),
        },
      } as TextTrackLaneEvent);
    };

    let isMouseOver = false;

    node.on('mouseover mouseenter touchstart', (event) => {
      if (!isMouseOver) {
        isMouseOver = true;
        emitEvent(TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_ENTER);
      }
    });

    node.on('mouseout mouseleave touchend', (event) => {
      if (isMouseOver) {
        isMouseOver = false;
        emitEvent(TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_LEAVE);
      }
    });

    node.on('click touchend', () => {
      emitEvent(TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_CLICK);
      let position = this._timeline!.getTimecodedFloatingRelativePointerPosition();
      if (position) {
        this._squashedCueClick$.next(position);
      }
    });
  }

  private isCueContentVisible(cue: TextCue): boolean {
    if (!this._config.showCueText && !this._config.showCueTimestamps) {
      return false;
    }

    const start = TimedItemTemporalUtil.extractStartTime(cue.temporal) ?? 0;
    const end = TimedItemTemporalUtil.extractEndTime(cue.temporal) ?? this._player!.getDuration();

    const xStart = this._timeline!.timeToTimelinePosition(start);
    const xEnd = this._timeline!.timeToTimelinePosition(end);

    const contentWidth = xEnd - xStart;
    const contentHeight = this.getContentHeight('right') - 2 * this.style.itemContentPadding - this.style.itemBorderSize;

    return (
      contentWidth >= this.style.itemMinWidthToShowContent &&
      (this._config.showCueText ? contentHeight >= this.style.itemMinHeightToShowText : contentHeight >= this.style.itemMinHeightToShowTimestamps)
    );
  }

  private handleSquashedCueClick(position: Position): void {
    let seconds = this._timeline!.timelinePositionToTime(position.x);

    let cueVisualizationsMap = Array.from(this._textCueVisualizations.entries())
      .filter(([_, cueVisualization]) => {
        const cues = cueVisualization.cues;
        if (!cues.length) {
          return false;
        }

        const groupTemporal = this.getGroupTemporal(cues);
        const start = parseFloat(groupTemporal.start);
        const end = parseFloat(groupTemporal.end);

        return start <= seconds && end >= seconds;
      })
      .map(([index, v]) => ({
        index,
        v,
      }));

    if (!cueVisualizationsMap.length) {
      return;
    }

    const index = cueVisualizationsMap.findIndex((p) => !!p.v.cues.find((cue) => this.getItemsInForeground().includes(cue)));
    if (index !== -1) {
      this.moveToForeground(index + 1 >= cueVisualizationsMap.length ? cueVisualizationsMap.at(0)!.index : cueVisualizationsMap.at(index + 1)!.index);
    } else {
      this.moveToForeground(cueVisualizationsMap.at(0)!.index);
    }
  }

  private getCueVisualization(id: TextCue['id']): TextCueVisualization | undefined {
    return [...this._textCueVisualizations.values()].find((p) => p.cues.map((cue) => cue.id).includes(id));
  }

  get onEvent$(): Observable<TextTrackLaneEvent> {
    return this._onEvent$.asObservable();
  }

  destroy() {
    super.destroy();

    freeObserver(this._onEvent$);
  }
}
