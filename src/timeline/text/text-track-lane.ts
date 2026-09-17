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
import {type SpanTemporal, type TextCue, type TextTrack, TimedItemsTrackEventType, TrackEventType} from '../../media';
import type {PlayerApi} from '../../player';
import type {TimelineImpl} from '../timeline';
import {TIMELINE_LANE_CONFIG_DEFAULT, type TimelineLaneStyle} from '../timeline-lane';
import {BaseTrackLane, type TrackLaneConfig} from '../track-lane';
import {TextCueVisualization} from './text-cue-visualization';
import {combineLatest, filter, Observable, Subject, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import {WindowPlaybackMode} from '../../common/window-playback';
import {SessionEventType} from '../../session/session-event';
import type {SessionApi} from '../../session/session-api';
import {type ConfigAndStyle} from '../timeline-api';
import {omitKeys} from '../../util/object-util';
import {konvaUnlistener} from '../konva/konva-util';
import type {StyledElementWithId} from '../../ui';
import type {OmpProvider} from '../../omp-provider';

export interface TextTrackLaneStyle extends TimelineLaneStyle {
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
  protected _session?: SessionApi;
  /** A render asked for while the window was mid-move, to be run once it settles. */
  protected _renderPending = false;

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

  protected override handleStyleUpdate(): void {
    super.handleStyleUpdate();

    this._textCueVisualizations.forEach((visualization) => {
      visualization.style = {
        fill: this.style.textLaneItemFill,
        opacity: this.style.textLaneItemOpacity,
      };
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
    const cueHeight = this.getContentHeight('right');
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
        existing.konvaNode.setAttrs({x: xStart, width: xEnd - xStart, height: cueHeight});
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
