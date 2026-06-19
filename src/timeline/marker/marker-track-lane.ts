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
import {
  MarkerTrack,
  MarkerType,
  TimedItemsTrackEventType,
  TimedItemTemporalUtil,
  TrackEventType,
} from '../../media';
import type {Marker, MarkerState, TimedItem, TimedItemState} from '../../media';
import {debounceTime, filter, Observable, Subject, takeUntil} from 'rxjs';
import {freeObserver} from '../../util/rxjs-util';
import type {TimelineImpl} from '../timeline';
import type {PlayerApi} from '../../player';
import {KonvaFactory} from '../konva/konva-factory';
import Decimal from 'decimal.js';
import Konva from 'konva';
import {MarkerViewComponent, MarkerViewComponentEventType} from './marker-view';
import type {Cursor, MarkerTrackStyle, Size, StyledElement, StyledElementWithId} from '../../ui';
import {TimelineEventType} from '../timeline-api';
import type {ConfigAndStyle} from '../timeline-api';
import {omitKeys} from '../../util/object-util';
import type {OmpProvider} from '../../omp-provider';
import {MeasurementUtil} from '../measurement-util';
import type {Position} from '../model';
import {BaseMultiTrackLane} from '../track-lane';
import type {MultiTrackLaneConfig, MultiTrackLaneTrackConfig} from '../track-lane';

export interface MarkerTrackLaneStyle extends TimelineLaneStyle, MarkerOnMarkerTrackLaneStyle {}

export interface MarkerOnMarkerTrackLaneStyle extends MarkerTrackStyle {
  markerSymbol: 'none' | 'circle' | 'square' | 'triangle';
  markerRenderType: 'default' | 'spanning-over-all-lanes';
  markerSymbolSize: Size;
  markerLineStrokeWidth: Size;
  markerLineOpacity: Size;
  markerAreaOpacity: Size;
  markerHandleAreaOpacity: Size;
  markerHandleMouseOverScale: Size;
  markerHandleMouseOverCursor: Cursor | undefined;
  markerHandleMouseLeaveCursor: Cursor | undefined;
}

export enum MarkerTrackLaneEventType {
  TIMELINE_MARKER_TRACK_LANE_ITEM_CLICK = 'TIMELINE_MARKER_TRACK_LANE_ITEM_CLICK',
  TIMELINE_MARKER_TRACK_LANE_ITEM_MOUSE_ENTER = 'TIMELINE_MARKER_TRACK_LANE_ITEM_MOUSE_ENTER',
  TIMELINE_MARKER_TRACK_LANE_ITEM_MOUSE_LEAVE = 'TIMELINE_MARKER_TRACK_LANE_ITEM_MOUSE_LEAVE',

  TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_CLICK = 'TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_CLICK',
  TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_MOUSE_ENTER = 'TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_MOUSE_ENTER',
  TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_MOUSE_LEAVE = 'TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_MOUSE_LEAVE',

  TIMELINE_MARKER_TRACK_LANE_ITEM_IN_FOREGROUND_CHANGE = 'TIMELINE_MARKER_TRACK_LANE_ITEM_IN_FOREGROUND_CHANGE',
}

export interface MarkerTrackLaneEventData {
  item: MarkerState;
}

export interface MarkerTrackLaneMarkerEventData {
  item: MarkerState;
  itemInForeground: MarkerState | undefined;
}

export type MarkerTrackLaneEventTypeDataMap = {
  [MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_CLICK]: MarkerTrackLaneMarkerEventData;
  [MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_MOUSE_ENTER]: MarkerTrackLaneMarkerEventData;
  [MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_MOUSE_LEAVE]: MarkerTrackLaneMarkerEventData;

  [MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_CLICK]: MarkerTrackLaneEventData;
  [MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_MOUSE_ENTER]: MarkerTrackLaneEventData;
  [MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_MOUSE_LEAVE]: MarkerTrackLaneEventData;

  [MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_IN_FOREGROUND_CHANGE]: {
    itemInForeground: MarkerState | undefined;
  };
};

export type MarkerTrackLaneEvent = {
  [K in MarkerTrackLaneEventType]: {
    type: K;
    data: MarkerTrackLaneEventTypeDataMap[K];
  };
}[keyof MarkerTrackLaneEventTypeDataMap];

export interface MarkerTrackLaneConfig extends MultiTrackLaneConfig {

}

export interface MarkerTrackLaneTrackConfig extends MultiTrackLaneTrackConfig {
  style?: Partial<MarkerOnMarkerTrackLaneStyle> | undefined;
}

const configDefault: MarkerTrackLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
};

export class MarkerTrackLane extends BaseMultiTrackLane<MarkerTrackLaneConfig, MarkerTrackLaneStyle, MarkerTrack, MarkerTrackLaneTrackConfig> {
  private readonly _onEvent$: Subject<MarkerTrackLaneEvent> = new Subject<MarkerTrackLaneEvent>();

  protected readonly _visibleTimedItems: Set<Marker['id']> = new Set<Marker['id']>();
  protected readonly _markerViewComponents: Map<Marker['id'], MarkerViewComponent> = new Map<Marker['id'], MarkerViewComponent>();
  protected readonly _markerToTrack: Map<Marker['id'], MarkerTrack> = new Map<Marker['id'], MarkerTrack>();

  private _itemInForeground: Marker | undefined;

  protected _timecodedSpanningGroup?: Konva.Group;
  protected _markerViewComponentsGroup?: Konva.Group;
  protected _eventCatcher?: Konva.Rect;

  private _timecodedClick$: Subject<Position> = new Subject();
  private _timecodedMouseMove$: Subject<Position> = new Subject();

  protected _hoveredTimedItems = new Set<Marker>();

  protected _handleTimelineZoom$ = new Subject<void>();
  protected _handleTimelineScroll$ = new Subject<void>();

  constructor(configAndStyle?: ConfigAndStyle<MarkerTrackLaneConfig, MarkerTrackLaneStyle>) {
    super(
      {
        ...configDefault,
        ...omitKeys(configAndStyle, 'style'),
      },
      configAndStyle?.style
    );

    this._handleTimelineZoom$
      .pipe(debounceTime(100))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.createMarkerViewComponents();
      });

    this._handleTimelineScroll$
      .pipe(debounceTime(100))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.createMarkerViewComponents();
      });

    this._timecodedMouseMove$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((position) => {
        this.handleTimecodeMouseMove(position);
      });

    this._timecodedClick$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((position) => {
        this.handleTimecodeClick(position);
      });
  }

  get onEvent$(): Observable<MarkerTrackLaneEvent> {
    return this._onEvent$.asObservable();
  }

  protected createStyledElement(): StyledElementWithId<MarkerTrackLaneStyle> {
    return {
      id: this._id,
      classes: [this._ui!.resolveStyleClass('TimelineLane'), this._ui!.resolveStyleClass('MarkerTrackLane')],
    };
  }

  override addTrack(track: MarkerTrack, config?: MarkerTrackLaneTrackConfig): void;
  override addTrack(id: MarkerTrack['id'], config?: MarkerTrackLaneTrackConfig): void;
  override addTrack(trackOrId: MarkerTrack | MarkerTrack['id'], config?: MarkerTrackLaneTrackConfig): void {
    const track: MarkerTrack = typeof trackOrId === 'string' ? (this._trackRepository!.getOrFail(trackOrId) as MarkerTrack) : trackOrId;
    super.addTrack(track, config);

    const trackBreaker = this._trackBreakers.get(track.id)!;

    track.onEvent$
      .pipe(takeUntil(trackBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        switch (event.type) {
          case TrackEventType.TRACK_UPDATED:
            this.createMarkerViewComponents();
            break;
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED:
            this.handleTimedItemsDeleted(event.data.updatedTimedItems);
            break;
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED:
            this.handleTimedItemsUpdated(event.data.updatedTimedItems);
            break;
        }
      });

    if (this._canRender) {
      this.render();
    }
  }

  protected render(): void {
    this.clearContent();

    if (this._canRender) {
      this.createMarkerViewComponents();
    }
  }

  protected updatePositions(): void {
    this.refreshMarkerViewComponentsPosition();
  }

  protected onTrackRemoved(trackId: MarkerTrack['id']): void {
    this.clearContent();
    if (this._canRender) {
      this.createMarkerViewComponents();
    }
  }

  protected handleTimelineZoom() {
    super.handleTimelineZoom();
    this._handleTimelineZoom$.next();
  }

  protected handleTimelineScroll() {
    super.handleTimelineScroll();
    this.createMarkerViewComponents();
    this._handleTimelineScroll$.next();
  }

  clearContent() {
    super.clearContent();
    this._markerViewComponents.forEach((markerViewComponent) => markerViewComponent.destroy());
    this._markerViewComponents.clear();
    this._markerToTrack.clear();
    this._markerViewComponentsGroup?.destroyChildren();
  }

  setMarkerViewStyle(style: Partial<MarkerOnMarkerTrackLaneStyle>, ids?: TimedItem['id'][]) {
    this.checkIsPrepared();

    if (ids && ids.length > 0) {
      ids.forEach((id) => {
        this._markerViewComponents.get(id)?.setStyle(style);
      });
    } else {
      this.setStyle(style);
    }
  }

  moveToForeground(id?: Marker['id']) {
    const track = id ? this._markerToTrack.get(id) : undefined;
    const timedItem = id && track ? track.getTimedItem(id) : undefined;

    if (timedItem && this._itemInForeground === timedItem) {
      return;
    }

    this._itemInForeground = timedItem;

    if (this._itemInForeground) {
      let markerViewComponent = this._markerViewComponents.get(this._itemInForeground.id);
      this._timecodedSpanningGroup?.moveToTop();
      markerViewComponent?.konvaNode.moveToTop();
    }

    this._onEvent$.next({
      type: MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_IN_FOREGROUND_CHANGE,
      data: {
        itemInForeground: timedItem?.state,
      },
    });
  }

  private createMarkerViewComponents() {
    if (!this._canRender) {
      return;
    }

    this.checkIsPrepared();
    this.updateVisibleTimedItems();

    let createMarkerView = (marker: Marker, track: MarkerTrack) => {

      const trackConfig = this._trackConfigs.get(track.id);

      let markerViewComponent = new MarkerViewComponent({
        editable: !track.areTimedItemsLocked,
        markerState: marker.state,
        markerTrackId: track.id,
        markerTrackLane: this,
        timeline: this._timeline!,
        ui: this._ui!,
        updateHook: (attrs) => {
          track.updateTimedItem(marker.id, attrs);
          let updatedTimedItem = track.getTimedItem(marker.id)!;
          markerViewComponent.update(updatedTimedItem.state);
        },
      });

      this._markerViewComponents.set(marker.id, markerViewComponent);
      this._markerToTrack.set(marker.id, track);
      this._markerViewComponentsGroup?.add(markerViewComponent.konvaNode);

      markerViewComponent.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
        switch (event.type) {
          case MarkerViewComponentEventType.HANDLE_CLICK:
            this.moveToForeground(marker.id);
            this._onEvent$.next({
              type: MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_CLICK,
              data: {
                item: marker.state,
              },
            });

            this._timecodedClick$.next(this._timeline!.getTimecodedFloatingRelativePointerPosition()!);

            if (event.data.item.markerType === MarkerType.MOMENT_MARKER) {
              this._onEvent$.next({
                type: MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_CLICK,
                data: {
                  item: event.data.item,
                  itemInForeground: this._itemInForeground,
                },
              });
            }
            break;
          case MarkerViewComponentEventType.HANDLE_MOUSE_ENTER:
            this.moveToForeground(marker.id);
            this._onEvent$.next({
              type: MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_MOUSE_ENTER,
              data: {
                item: marker.state,
              },
            });
            if (marker.markerType === MarkerType.MOMENT_MARKER) {
              this.appendHoveredItems([marker]);
            }
            break;
          case MarkerViewComponentEventType.HANDLE_MOUSE_LEAVE:
            this._onEvent$.next({
              type: MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_MOUSE_LEAVE,
              data: {
                item: marker.state,
              },
            });
            break;
          case MarkerViewComponentEventType.HANDLE_MOUSE_MOVE:
            if (event.data.item.markerType === MarkerType.SPANNING_MARKER) {
              this._timecodedMouseMove$.next(this._timeline!.getTimecodedFloatingRelativePointerPosition()!);
            }
            break;
          case MarkerViewComponentEventType.HANDLE_DRAG_START:
            this._markerViewComponents.forEach((mvc, id) => {
              if (id !== marker.id) {
                mvc.konvaNode.listening(false);
              }
            });
            break;
          case MarkerViewComponentEventType.HANDLE_DRAG_END:
            this._markerViewComponents.forEach((mvc) => {
              mvc.konvaNode.listening(true);
            });
            break;
        }
      });
    };

    let deleteMarkerView = (timedItem: Marker) => {
      let markerViewComponent = this._markerViewComponents.get(timedItem.id);
      if (markerViewComponent) {
        markerViewComponent.destroy();
        this._markerViewComponents.delete(timedItem.id);
        this._markerToTrack.delete(timedItem.id);
      }
    };

    let recreateMarkerView = (timedItem: Marker, track: MarkerTrack) => {
      deleteMarkerView(timedItem);
      createMarkerView(timedItem, track);
    };

    let shouldRecreateMarkerView = (markerViewComponent: MarkerViewComponent, track: MarkerTrack) => {
      return !track.areTimedItemsLocked !== markerViewComponent.editable;
    };

    this._tracks.forEach((track) => {
      const trackConfig = this._trackConfigs.get(track.id);
      if (trackConfig?.style) {
        this._ui!.updateStyleRule({
          id: MarkerTrackLane.formatTrackOnLaneStyleId(this, track.id),
          style: trackConfig.style,
        });
      }

      track.timedItemsSorted.forEach((timedItem) => {
        const visible = this._visibleTimedItems.has(timedItem.id);
        if (visible) {
          let markerViewComponent = this._markerViewComponents.get(timedItem.id);
          if (markerViewComponent) {
            if (shouldRecreateMarkerView(markerViewComponent, track)) {
              recreateMarkerView(timedItem, track);
            } else {
              markerViewComponent.refreshTimelinePosition();
            }
          } else {
            createMarkerView(timedItem, track);
          }
        } else {
          deleteMarkerView(timedItem);
        }
      });
    });
  }

  static formatTrackOnLaneStyleId(markerTrackLane: MarkerTrackLane, trackId: MarkerTrack['id']): string {
    return `${markerTrackLane.id}.${trackId}`;
  }

  private updateVisibleTimedItems() {
    this._visibleTimedItems.clear();
    let timelineVisibleRange = this._timeline!.getVisibleTimeRange();
    this._tracks.forEach((track) => {
      track.timedItemsSorted.forEach((timedItem) => {
        if (TimedItemTemporalUtil.touchesTimeRange(timedItem.temporal, timelineVisibleRange.start, timelineVisibleRange.end)) {
          this._visibleTimedItems.add(timedItem.id);
        }
      });
    });
  }

  private refreshMarkerViewComponentsPosition() {
    this._markerViewComponents.forEach((markerViewComponent) => markerViewComponent.refreshTimelinePosition());
  }

  /**
   * @internal
   * @param timeline
   * @param player
   * @param ompProvider
   */
  prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider) {
    super.prepareForTimeline(timeline, player, ompProvider);

    let timecodedDimension = this._timeline!.getTimecodedFloatingDimension();
    let timecodedRect = this.getTimecodedRect();

    this._timecodedSpanningGroup = KonvaFactory.createGroup({
      ...timecodedDimension,
    });
    this._markerViewComponentsGroup = KonvaFactory.createGroup({
      ...timecodedDimension,
    });

    this._eventCatcher = KonvaFactory.createRect({
      width: timecodedRect.width,
      height: timecodedRect.height,
      opacity: 0,
      listening: true,
      y: timecodedRect.y,
    });

    this._timecodedSpanningGroup.add(this._markerViewComponentsGroup);

    this._timeline!.addToTimecodedFloatingContent(this._eventCatcher, 1);
    this._timeline!.addToSurfaceLayerTimecodedFloatingContent(this._timecodedSpanningGroup);

    this._timeline!.onEvent$
      .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_TIMECODE_MOUSE_MOVE))
      .pipe(filter(() => this._hoveredTimedItems.size > 0))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        let rect = this.getTimecodedRect();
        let isInRect = MeasurementUtil.isPositionInRect(event.data.pointerPosition, rect);
        if (!isInRect) {
          this.setHoveredItems([]);
        }
      });

    this._eventCatcher.on('mousemove', () => {
      this._timecodedMouseMove$.next(this._timeline!.getTimecodedFloatingRelativePointerPosition()!);
    });

    this._eventCatcher.on('mouseleave mouseout', () => {
      if (this._hoveredTimedItems.size > 0) {
        let rpp = this._timeline!.getTimecodedFloatingRelativePointerPosition()!;
        let rect = this.getTimecodedRect();
        let isInRect = MeasurementUtil.isPositionInRect(rpp, rect);
        if (!isInRect) {
          this.setHoveredItems([]);
        }
      }
    });

    this._eventCatcher.on('click touchend', () => {
      this._timecodedClick$.next(this._timeline!.getTimecodedFloatingRelativePointerPosition()!);
    });

    this._prepared.next(true);
  }

  private handleTimecodeMouseMove(position: Position) {
    if (!this._onEvent$.observed) {
      return;
    }

    let seconds = this._timeline!.timelinePositionToTime(position.x);

    const timedItems = this._tracks.flatMap((t) => t.findTimedItemsAtTime(seconds));

    const hoveredItems = timedItems
      .map((timedItem) => ({
        timedItem,
        markerViewComponent: this._markerViewComponents.get(timedItem.id),
      }))
      .filter((pair) => pair.markerViewComponent)
      .map((pair) => pair.timedItem);

    this.setHoveredItems(hoveredItems);
  }

  private setHoveredItems(hoveredItems: Marker[]) {
    this.appendHoveredItems(hoveredItems);

    this._hoveredTimedItems.forEach((timedItem) => {
      if (!hoveredItems.includes(timedItem)) {
        this._hoveredTimedItems.delete(timedItem);
        this._onEvent$.next({
          type: MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_MOUSE_LEAVE,
          data: {
            item: timedItem.state,
            itemInForeground: this._itemInForeground?.state,
          },
        });
      }
    });
  }

  private appendHoveredItems(hoveredItems: Marker[]) {
    hoveredItems.forEach((timedItem) => {
      if (!this._hoveredTimedItems.has(timedItem)) {
        this._hoveredTimedItems.add(timedItem);
        this._onEvent$.next({
          type: MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_MOUSE_ENTER,
          data: {
            item: timedItem.state,
            itemInForeground: this._itemInForeground?.state,
          },
        });
      }
    });
  }

  private handleTimecodeClick(position: Position) {
    if (!this._onEvent$.observed) {
      return;
    }

    let seconds = this._timeline!.timelinePositionToTime(position.x);

    let timedItems = this._tracks.flatMap((t) => t.findTimedItemsAtTime(seconds));
    if (!timedItems.length) {
      return;
    }

    timedItems.forEach((timedItem) => {
      this._onEvent$.next({
        type: MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_CLICK,
        data: {
          item: timedItem.state,
          itemInForeground: this._itemInForeground,
        },
      });
    });
  }

  private handleTimedItemsUpdated(timedItemStates: TimedItemState[]) {
    timedItemStates.forEach((timedItemState) => {
      let markerViewComponent = this._markerViewComponents.get(timedItemState.id);
      if (markerViewComponent) {
        markerViewComponent.update(timedItemState as MarkerState);
      } else {
        throw new Error('markerViewComponent not found');
      }
    });
  }

  private handleTimedItemsDeleted(timedItemStates: TimedItemState[]) {
    timedItemStates.forEach((timedItemState) => {
      let markerViewComponent = this._markerViewComponents.get(timedItemState.id);
      if (markerViewComponent) {
        markerViewComponent.destroy();
        this._markerViewComponents.delete(timedItemState.id);
        this._markerToTrack.delete(timedItemState.id);
      }
    });
  }

  protected hasVisualElements(): boolean {
    return this._markerViewComponents.size > 0;
  }

  protected settleLayout() {
    super.settleLayout();

    let timecodedDimension = this._timeline!.getTimecodedFloatingDimension();
    let timecodedRect = this.getTimecodedRect();

    this._eventCatcher!.y(timecodedRect.y);

    [this._timecodedSpanningGroup!, this._markerViewComponentsGroup!, this._eventCatcher!].forEach((node) => {
      node.width(timecodedDimension.width);
    });

    let clipFactorHeightDecimal = new Decimal(timecodedDimension.height).div(this.style.height);
    let clipFactorYDecimal = new Decimal(timecodedRect.height).div(this.style.height);

    let clipX = -this._timeline!.style.rightPaneClipPadding;
    let clipY = timecodedRect.y - timecodedRect.y * clipFactorYDecimal.toNumber();
    let clipWidth = timecodedRect.width + this._timeline!.style.rightPaneClipPadding * 2;
    let clipHeight = clipFactorHeightDecimal.mul(timecodedRect.height).toNumber();

    this._timecodedSpanningGroup!.clipFunc((ctx) => {
      ctx.rect(clipX, clipY, clipWidth, clipHeight);
    });

    this.refreshMarkerViewComponentsPosition();
  }

  destroy() {
    super.destroy();

    this._timecodedSpanningGroup?.destroy();
    this._eventCatcher?.destroy();

    this._handleTimelineZoom$.complete();
    this._handleTimelineScroll$.complete();
    freeObserver(this._onEvent$);
  }
}
