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

import {TIMELINE_LANE_CONFIG_DEFAULT, type TimelineLaneStyle} from '../timeline-lane';
import {type ObservationState, type ObservationTrack} from '../../media';
import {type StyledElementWithId} from '../../ui';
import {debounceTime, merge, Subject, takeUntil} from 'rxjs';
import type {Position} from '../model';
import {type TimelineImpl} from '../timeline';
import type {PlayerApi} from '../../player';
import type {OmpProvider} from '../../omp-provider';
import {KonvaFactory} from '../konva/konva-factory';
import Konva from 'konva';
import {type ObservationTrackView} from './observation-track-view';
import {freeObserver} from '../../util/rxjs-util';
import Decimal from 'decimal.js';
import {BaseMultiTrackLane, type MultiTrackLaneTrackConfig, type TrackLaneConfig} from '../track-lane';
import type {DownsampleOptions} from '../../track';

export interface ObservationTrackLaneStyle extends TimelineLaneStyle {}

export interface ObservationTrackLaneConfig extends TrackLaneConfig {
  downsampleOptions?: DownsampleOptions;
}

export enum ObservationTrackLaneEventType {
  TIMELINE_OBSERVATION_TRACK_LANE_ITEM_CLICK = 'TIMELINE_OBSERVATION_TRACK_LANE_ITEM_CLICK',
}

export interface ObservationTrackLaneObservationEventData {
  item: ObservationState;
}

export type ObservationTrackLaneEventTypeDataMap = {
  [ObservationTrackLaneEventType.TIMELINE_OBSERVATION_TRACK_LANE_ITEM_CLICK]: ObservationTrackLaneObservationEventData;
};

export type ObservationTrackLaneEvent = {
  [K in ObservationTrackLaneEventType]: {
    type: K;
    data: ObservationTrackLaneEventTypeDataMap[K];
  };
}[keyof ObservationTrackLaneEventTypeDataMap];

/** Per-track configuration for lanes that render observation data (bar charts, line charts, etc.). */
export interface ObservationTrackLaneTrackConfig extends MultiTrackLaneTrackConfig {}

export abstract class BaseObservationTrackLane<C extends ObservationTrackLaneConfig, S extends ObservationTrackLaneStyle, TC extends ObservationTrackLaneTrackConfig> extends BaseMultiTrackLane<
  C,
  S,
  ObservationTrack,
  TC
> {
  private readonly _onEvent$: Subject<ObservationTrackLaneEvent> = new Subject<ObservationTrackLaneEvent>();

  protected readonly _trackViews: Map<ObservationTrack['id'], ObservationTrackView> = new Map<ObservationTrack['id'], ObservationTrackView>();

  protected _trackViewsGroup?: Konva.Group;
  protected _eventCatcher?: Konva.Rect;

  private _timecodedClick$: Subject<Position> = new Subject();
  private _timecodedMouseMove$: Subject<Position> = new Subject();

  protected _onTimelineZoom$ = new Subject<void>();
  protected _onTimelineScroll$ = new Subject<void>();
  protected _onSettleLayout$ = new Subject<void>();

  protected constructor(config: C, style?: Partial<S>) {
    super(config, style);

    merge(this._onTimelineZoom$, this._onTimelineScroll$, this._onSettleLayout$)
      .pipe(debounceTime(100))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.render();
      });

    this._timecodedMouseMove$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((position) => {
      this.handleTimecodeMouseMove(position);
    });

    this._timecodedClick$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((position) => {
      this.handleTimecodeClick(position);
    });
  }

  protected abstract renderTrack(track: ObservationTrack, config?: TC): ObservationTrackView;

  protected render() {
    if (this._canRender) {
      this.checkIsPrepared();

      let timeRange = this._timeline!.getVisibleTimeRange();

      this._tracks.forEach((track) => {
        let trackView = this._trackViews.get(track.id);
        let config = this._trackConfigs.get(track.id);

        if (!trackView) {
          let newTrackView = this.renderTrack(track, config);
          trackView = newTrackView;
          this._trackViews.set(track.id, trackView);
          this._trackViewsGroup?.add(newTrackView.konvaNode);
        }

        trackView.render(timeRange);
      });
    }
  }

  protected updatePositions() {
    let timeRange = this._timeline!.getVisibleTimeRange();
    this._trackViews.forEach((p) => p.updatePositions(timeRange));
  }

  protected handleTimelineZoom() {
    super.handleTimelineZoom();
    this._onTimelineZoom$.next();
  }

  protected handleTimelineScroll() {
    super.handleTimelineScroll();
    this._onTimelineScroll$.next();
    this.updatePositions();
  }

  private handleTimecodeMouseMove(position: Position) {
    if (!this._onEvent$.observed) {
      return;
    }

    let seconds = this._timeline!.timelinePositionToTime(position.x);

    // const timedItems = this._track?.findTimedItemsAtTime(seconds) ?? [];
  }

  private handleTimecodeClick(position: Position) {
    if (!this._onEvent$.observed) {
      return;
    }

    let seconds = this._timeline!.timelinePositionToTime(position.x);

    // let timedItems = this._track?.findTimedItemsAtTime(seconds);
    // if (!timedItems?.length) {
    //   return;
    // }
  }

  /**
   * @internal
   * @param timeline
   * @param player
   * @param ompProvider
   */
  override prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider) {
    super.prepareForTimeline(timeline, player, ompProvider);

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = new Konva.Group({
      ...timecodedRect,
    });

    this._eventCatcher = KonvaFactory.createEventCatcherRect({
      ...this._timecodedGroup.getSize(),
    });

    this._trackViewsGroup = new Konva.Group({
      x: 0,
      width: this._timecodedGroup.width(),
      height: this._style!.height,
    });

    this._timecodedGroup.add(this._eventCatcher);
    this._timecodedGroup.add(this._trackViewsGroup);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 1);

    this._prepared.next(true);
  }

  addTrack(track: ObservationTrack, config?: TC): void;
  addTrack(id: ObservationTrack['id'], config?: TC): void;
  addTrack(trackOrId: ObservationTrack | ObservationTrack['id'], config?: TC): void {
    const track: ObservationTrack = typeof trackOrId === 'string' ? (this._trackRepository!.getOrFail(trackOrId) as ObservationTrack) : trackOrId;
    super.addTrack(track, config);
    this.render();
  }

  protected createStyledElement(): StyledElementWithId<S> {
    return {
      id: this._id,
      classes: [this._ui!.resolveStyleClass('TimelineLane'), this._ui!.resolveStyleClass('ObservationTrackLane')],
    };
  }

  protected hasVisualElements(): boolean {
    return this._trackViews.size > 0;
  }

  protected settleLayout() {
    super.settleLayout();

    let timelineTimecodedDimension = this._timeline!.getTimecodedFloatingDimension();
    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup!.setAttrs({
      x: timecodedRect.x,
      y: timecodedRect.y,
    });

    [this._timecodedGroup, this._eventCatcher, this._trackViewsGroup].forEach((node) => {
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

    this._onSettleLayout$.next();
    this.updateLoadingVisibility();
  }

  protected onTrackRemoved(trackId: ObservationTrack['id']): void {
    const trackView = this._trackViews.get(trackId);
    if (trackView) {
      trackView.destroy();
      this._trackViews.delete(trackId);
    }
  }

  clearContent() {
    super.clearContent();

    this._trackViews.forEach((trackView) => {
      trackView.destroy();
    });
    this._trackViews.clear();
    this._trackViewsGroup?.destroyChildren();
  }

  destroy() {
    super.destroy();

    this.clearContent();

    this._trackViewsGroup?.destroy();
    this._eventCatcher?.destroy();

    this._onTimelineZoom$.complete();
    this._onTimelineScroll$.complete();
    freeObserver(this._onEvent$);
  }
}
