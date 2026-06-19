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
import Decimal from 'decimal.js';
import {type SpanTemporal, type TextCue, type TextTrack, TimedItemsTrackEventType, TrackEventType} from '../../media';
import type {PlayerApi} from '../../player';
import type {TimelineImpl} from '../timeline';
import {TIMELINE_LANE_CONFIG_DEFAULT, type TimelineLaneStyle} from '../timeline-lane';
import {BaseTrackLane, type TrackLaneConfig} from '../track-lane';
import {TextCueVisualization} from './text-cue-visualization';
import {combineLatest, Observable, Subject, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import {type ConfigAndStyle} from '../timeline-api';
import {omitKeys} from '../../util/object-util';
import {konvaUnlistener} from '../konva/konva-util';
import type {StyledElementWithId} from '../../ui';
import type {OmpProvider} from '../../omp-provider';

export interface TextTrackLaneStyle extends TimelineLaneStyle {
  paddingTop: number;
  paddingBottom: number;
  textLaneItemOpacity: number;
  textLaneItemFill: string;
}

export interface TextTrackLaneConfig extends TrackLaneConfig {}

const configDefault: TextTrackLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
};

export enum TextTrackLaneEventType {
  TIMELINE_TEXT_TRACK_LANE_ITEM_CLICK = 'TIMELINE_TEXT_TRACK_LANE_ITEM_CLICK',
  TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_ENTER = 'TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_ENTER',
  TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_LEAVE = 'TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_LEAVE',
}

export interface TextTrackLaneEventData {
  cues: TextCue[];
}

export type TextTrackLaneEventTypeDataMap = {
  [TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_CLICK]: TextTrackLaneEventData;
  [TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_ENTER]: TextTrackLaneEventData;
  [TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_MOUSE_LEAVE]: TextTrackLaneEventData;
};

export type TextTrackLaneEvent = {
  [K in TextTrackLaneEventType]: {
    type: K;
    data: TextTrackLaneEventTypeDataMap[K];
  };
}[keyof TextTrackLaneEventTypeDataMap];

export class TextTrackLane extends BaseTrackLane<TextTrackLaneConfig, TextTrackLaneStyle, TextTrack> {
  private readonly _onEvent$: Subject<TextTrackLaneEvent> = new Subject<TextTrackLaneEvent>();
  protected _eventsBreaker = new ObserverBreaker();
  protected _textMarkingsGroup?: Konva.Group;
  protected _textCueVisualizations: Map<number, TextCueVisualization> = new Map();
  protected _squashedCueGroups: TextCue[][] = [];
  protected _cueSquashThreshold: number = 0.5;

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

  protected createStyledElement(): StyledElementWithId<TextTrackLaneStyle> {
    return {
      id: this._id,
      classes: [this._ui!.resolveStyleClass('TextTrackLane')],
    };
  }

  /**
   * @internal
   * @param timeline
   * @param player
   * @param ompProvider
   */
  prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider): void {
    super.prepareForTimeline(timeline, player, ompProvider);

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = new Konva.Group({
      ...timecodedRect,
    });
    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 1);

    this._textMarkingsGroup = new Konva.Group({
      x: 0,
      y: this._style!.paddingTop,
      width: this._timecodedGroup.width(),
      height: this._style!.height,
    });

    this._timecodedGroup.add(this._textMarkingsGroup);

    this._prepared.next(true);
  }

  private handleTrackUpdated() {
    this.render();
  }

  render(): void {
    this._squashedCueGroups = this.squashCues(this._track?.timedItemsSorted ?? []);
    this.adjustCueVisualizations();
  }

  clearContent(): void {
    super.clearContent();
    this._eventsBreaker.break();
    this._textCueVisualizations.forEach((v) => konvaUnlistener(v.konvaNode));
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
    const paddingTop = this.style.paddingTop;
    const paddingBottom = this.style.paddingBottom;
    const contentY = paddingTop;
    const contentHeight = height - paddingTop - paddingBottom;
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
    let timelineTimecodedDimension = this._timeline!.getTimecodedFloatingDimension();
    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup!.setAttrs({
      x: timecodedRect.x,
      y: timecodedRect.y,
    });

    [this._timecodedGroup, this._textMarkingsGroup].forEach((node) => {
      node!.width(timecodedRect.width);
    });

    let clipFactorHeightDecimal = new Decimal(timelineTimecodedDimension.height).div(this.style.height);
    let clipFactorYDecimal = new Decimal(timecodedRect.height).div(this.style.height);

    let clipX = -this._timeline!.style.rightPaneClipPadding;
    let clipY = timecodedRect.y - timecodedRect.y * clipFactorYDecimal.toNumber();
    let clipWidth = timecodedRect.width + this._timeline!.style.rightPaneClipPadding * 2;
    let clipHeight = clipFactorHeightDecimal.mul(timecodedRect.height).toNumber();

    this._timecodedGroup!.clipFunc((ctx) => {
      ctx.rect(clipX, clipY, clipWidth, clipHeight);
    });

    this.render();
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
    let lastEnd = parseFloat((cues[0]!.temporal as SpanTemporal).end);

    for (let i = 1; i < cues.length; i++) {
      const cue = cues[i]!;
      const start = parseFloat((cue.temporal as SpanTemporal).start);

      if (start - lastEnd >= threshold) {
        const firstStart = parseFloat((currentGroup[0]!.temporal as SpanTemporal).start);
        if (lastEnd - firstStart >= threshold) {
          squashedGroups.push(currentGroup);
        }
        currentGroup = [];
      }
      currentGroup.push(cue);
      lastEnd = parseFloat((cue.temporal as SpanTemporal).end);
    }

    if (currentGroup.length > 0) {
      const firstStart = parseFloat((currentGroup[0]!.temporal as SpanTemporal).start);
      if (lastEnd - firstStart >= threshold) {
        squashedGroups.push(currentGroup);
      }
    }

    return squashedGroups;
  }

  private adjustCueVisualizations(): void {
    const visibleRange = this._timeline!.getVisibleTimeRange();
    const cueHeight = this.style.height - this.style.paddingTop - this.style.paddingBottom;
    const newIndices = new Set<number>();

    this._squashedCueGroups.forEach((group, index) => {
      const start = parseFloat((group[0]!.temporal as SpanTemporal).start);
      const end = parseFloat((group[group.length - 1]!.temporal as SpanTemporal).end);
      const visible = !(end < visibleRange.start || start > visibleRange.end);

      const existing = this._textCueVisualizations.get(index);

      if (!visible) {
        if (existing) {
          konvaUnlistener(existing.konvaNode);
          existing.konvaNode.destroy();
          this._textCueVisualizations.delete(index);
        }
        return;
      }

      newIndices.add(index);
      const xStart = this._timeline!.timeToTimelinePosition(start);
      const xEnd = this._timeline!.timeToTimelinePosition(end);

      if (existing) {
        existing.cues = group;
        existing.konvaNode.setAttrs({x: xStart, width: xEnd - xStart});
        existing.onMeasurementsChange();
      } else {
        const cueVisualization = new TextCueVisualization({
          style: {
            x: xStart,
            width: xEnd - xStart,
            height: cueHeight,
            fill: this.style.textLaneItemFill,
            opacity: this.style.textLaneItemOpacity,
          },
        });
        cueVisualization.cues = group;
        this._textCueVisualizations.set(index, cueVisualization);
        this._textMarkingsGroup!.add(cueVisualization.konvaNode);
        this.attachCueListeners(cueVisualization);
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

  private attachCueListeners(cueVisualization: TextCueVisualization): void {
    const node = cueVisualization.konvaNode;
    const emitEvent = (type: TextTrackLaneEventType) => {
      this._onEvent$.next({type, data: {cues: cueVisualization.cues}} as TextTrackLaneEvent);
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

    node.on('click touchend', () => emitEvent(TextTrackLaneEventType.TIMELINE_TEXT_TRACK_LANE_ITEM_CLICK));
  }

  get onEvent$(): Observable<TextTrackLaneEvent> {
    return this._onEvent$.asObservable();
  }

  destroy() {
    super.destroy();
    this._eventsBreaker.destroy();
    this._onEvent$.complete();
  }
}
