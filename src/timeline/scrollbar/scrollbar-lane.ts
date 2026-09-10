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

import {BaseTimelineLane, TIMELINE_LANE_CONFIG_DEFAULT, type TimelineLaneConfig, type TimelineLaneStyle} from '../timeline-lane';
import {KonvaFlexGroup, KonvaFlexItem} from '../layout/konva-flex';
import {ZoomScrollbar, ZoomScrollbarEventType, type ZoomScrollbarStyle} from './zoom-scrollbar';
import Konva from 'konva';
import {type ConfigAndStyle, TimelineEventType} from '../timeline-api';
import {omitKeys, removeEmptyValues} from '../../util/object-util';
import {KonvaFactory} from '../konva/konva-factory';
import {type TimelineImpl} from '../timeline';
import {type PlayerApi, PlayerEventType} from '../../player';
import {type OmpProvider} from '../../omp-provider';
import {KonvaComponentFlexContentNode2} from '../layout/konva-component-flex';
import {type FlexJustifyContent, FlexSpacingBuilder} from '../layout/flex-node';
import {filter, takeUntil} from 'rxjs';
import type {Color, StyledElementWithId} from '../../ui';
import {TIMELINE_LANE_STYLE_DEFAULT} from '../timeline-style';
import {isNullOrUndefined} from '../../util/util-functions';

export interface ScrollbarLaneStyle extends TimelineLaneStyle {
  paddingTop?: number;
  paddingBottom?: number;
  scrollbarWidth: number | string;
  scrollbarHeight: number | undefined;
  scrollbarBackgroundFill: Color;
  scrollbarBackgroundFillOpacity: number;
  scrollbarHandleBarFill: Color;
  scrollbarHandleBarOpacity: number;
  scrollbarHandleOpacity: number;
  scrollbarJustify: 'start' | 'center' | 'end';
}

export interface ScrollbarLaneConfig extends TimelineLaneConfig {}

const configDefault: ScrollbarLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
};

export const TIMELINE_SCROLLBAR_LANE_STYLE_DEFAULT: ScrollbarLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  height: 40,
  paddingTop: 0,
  paddingBottom: 0,
  scrollbarHeight: void 0,
  scrollbarWidth: '100%',
  scrollbarBackgroundFill: '#000000',
  scrollbarBackgroundFillOpacity: 0.3,
  scrollbarHandleBarFill: '#f700ff',
  scrollbarHandleBarOpacity: 1,
  scrollbarHandleOpacity: 1,
  scrollbarJustify: 'center',
};

export class ScrollbarLane extends BaseTimelineLane<ScrollbarLaneConfig, ScrollbarLaneStyle> {
  protected _contentGroup?: Konva.Group;
  protected _contentFlexGroup?: KonvaFlexGroup;
  protected _scrollbarFlexItem?: KonvaFlexItem<KonvaComponentFlexContentNode2<ZoomScrollbar>>;

  protected _scrollbar?: ZoomScrollbar;

  private _timelineZoomInProgress = false;

  constructor(configAndStyle?: ConfigAndStyle<ScrollbarLaneConfig, ScrollbarLaneStyle>) {
    super(
      {
        ...configDefault,
        ...omitKeys(configAndStyle, 'style'),
      },
      configAndStyle?.style
    );

    this._contentGroup = KonvaFactory.createGroup();
  }

  protected createStyledElement(): StyledElementWithId<ScrollbarLaneStyle> {
    return {
      id: this._id,
      classes: [this._ui!.resolveStyleClass('TimelineLane'), this._ui!.resolveStyleClass('ScrollbarLane')],
    };
  }

  override prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider) {
    super.prepareForTimeline(timeline, player, ompProvider);

    let timecodedContainerDimension = this._timeline!.getTimecodedContainerDimension();

    let resolveJustify = (): FlexJustifyContent => {
      if (this._style?.scrollbarJustify === 'start') {
        return 'JUSTIFY_FLEX_START';
      } else if (this._style?.scrollbarJustify === 'end') {
        return 'JUSTIFY_FLEX_END';
      } else {
        return 'JUSTIFY_CENTER';
      }
    };

    this._contentFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      // konvaBgNode: KonvaFactory.createRect({
      //   fill: 'red',
      // }),
      width: timecodedContainerDimension.width,
      height: this._config.minimized ? 0 : this._style?.height,
      flexDirection: 'FLEX_DIRECTION_ROW',
      alignItems: 'ALIGN_CENTER', // items are aligned at the center of the cross axis
      justifyContent: resolveJustify(),
    });

    this._timeline!.addToTimecodedStaticContent(this._contentFlexGroup.contentNode.konvaNode);

    this._scrollbar = new ZoomScrollbar(ompProvider, {
      style: removeEmptyValues({
        height: this.resolveScrollbarHeight(),
        backgroundFill: this._style?.scrollbarBackgroundFill,
        backgroundFillOpacity: this._style?.scrollbarBackgroundFillOpacity,
        handleBarFill: this._style?.scrollbarHandleBarFill,
        handleBarOpacity: this._style?.scrollbarHandleBarOpacity,
        handleOpacity: this._style?.scrollbarHandleOpacity,
      }) as Partial<ScrollbarLaneStyle>,
    });

    this._scrollbarFlexItem = new KonvaFlexItem(
      {
        ...(this._style?.scrollbarWidth
          ? {
              width: this._style.scrollbarWidth,
            }
          : {
              flexGrow: 1,
            }),
        height: this._style?.scrollbarHeight,
      },
      new KonvaComponentFlexContentNode2(this._scrollbar)
    );

    // clipping when minimized
    this._contentFlexGroup.contentNode.konvaNode.clipFunc((ctx) => {
      if (!this._contentFlexGroup) {
        // lane may already be destroyed by the time Konva's deferred batchDraw invokes this callback
        return;
      }
      let padding = this._timeline!.style.rightPaneClipPadding;
      let layout = this._contentFlexGroup.getLayout();
      ctx.rect(-padding, 0, layout.width + 2 * padding, layout.height);
    });

    this._contentFlexGroup.addChild(this._scrollbarFlexItem);

    player.onEvent$
      .pipe(filter((p) => p.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED || p.type === PlayerEventType.PLAYER_MAIN_MEDIA_UPDATED))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this._scrollbar!.updateScrollHandle(this._timeline!);
      });

    this._timeline!.onEvent$.pipe(filter((p) => p.type === TimelineEventType.TIMELINE_SCROLL))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        if (!this._timelineZoomInProgress) {
          this._scrollbar!.updateScrollHandle(this._timeline!);
        }
      });

    this._scrollbar.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      switch (event.type) {
        case ZoomScrollbarEventType.SCROLLBAR_SCROLL:
          this._timeline!.scrollHorizontallyToPercent(this._scrollbar!.getScrollHandlePercent());
          break;
        case ZoomScrollbarEventType.SCROLLBAR_ZOOM:
          this._timelineZoomInProgress = true;
          this._timeline!.zoomTo(event.data.zoomPercent, event.data.zoomFocus);
          this._timeline!.scrollHorizontallyToPercent(this._scrollbar!.getScrollHandlePercent());
          this._timelineZoomInProgress = false;
          break;
      }
    });

    this._prepared.next(true);
  }

  protected handleStyleUpdate() {
    super.handleStyleUpdate();

    if (this._style?.scrollbarWidth) {
      this._scrollbarFlexItem?.setWidth(this._style?.scrollbarWidth)
    }

    if (this._style?.scrollbarHeight) {
      this._scrollbarFlexItem?.setHeight(this._style?.scrollbarHeight)
    }

    this._scrollbar?.setStyle(removeEmptyValues({
      height: this.resolveScrollbarHeight(),
      backgroundFill: this._style?.scrollbarBackgroundFill,
      backgroundFillOpacity: this._style?.scrollbarBackgroundFillOpacity,
      handleBarFill: this._style?.scrollbarHandleBarFill,
      handleBarOpacity: this._style?.scrollbarHandleBarOpacity,
      handleOpacity: this._style?.scrollbarHandleOpacity,
    } as Partial<ZoomScrollbarStyle>))

    this._scrollbar?.updateScrollHandle(this._timeline!)
  }

  private resolveScrollbarHeight() {
    let timecodedRect = this.getTimecodedRect();
    const paddingTop = this._style?.paddingTop ?? 0;
    const paddingBottom = this._style?.paddingBottom ?? 0;
    return isNullOrUndefined(this._style?.scrollbarHeight) ? Math.max(0, timecodedRect.height - paddingTop - paddingBottom) : this._style?.scrollbarHeight;
  }

  protected settleLayout() {
    let timecodedContainerDimension = this._timeline!.getTimecodedContainerDimension();
    let timecodedRect = this.getTimecodedRect();
    const paddingTop = this._style?.paddingTop ?? 0;
    const paddingBottom = this._style?.paddingBottom ?? 0;

    this._contentFlexGroup!.setDimensionAndPositions(
      timecodedContainerDimension.width,
      Math.max(0, timecodedRect.height - paddingTop - paddingBottom),
      FlexSpacingBuilder.create().topRightBottomLeft([timecodedRect.y + paddingTop, 0, 0, 0]).build()
    );
    if (!this._timelineZoomInProgress) {
      this._scrollbar!.updateScrollHandle(this._timeline!);
    }
  }

  get scrollbar(): ZoomScrollbar | undefined {
    return this._scrollbar;
  }

  override destroy() {
    super.destroy();

    this._contentFlexGroup?.destroy();
    // @ts-ignore
    this._contentFlexGroup = void 0;

    this._scrollbarFlexItem?.destroy();
    // @ts-ignore
    this._scrollbarFlexItem = void 0;
  }
}
