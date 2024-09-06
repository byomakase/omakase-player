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

import {BaseTimelineLane, TIMELINE_LANE_CONFIG_DEFAULT, timelineLaneComposeConfig, TimelineLaneConfig, TimelineLaneConfigDefaultsExcluded, TimelineLaneStyle} from '../timeline-lane';
import {KonvaFlexGroup, KonvaFlexItem} from '../../layout/konva-flex';
import {Timeline} from '../timeline';
import {Scrollbar} from './scrollbar';
import {filter, takeUntil} from 'rxjs';
import {KonvaFactory} from '../../factory/konva-factory';
import Konva from 'konva';
import {FlexSpacingBuilder} from '../../layout/flex-node';
import {KonvaComponentFlexContentNode} from '../../layout/konva-component-flex';
import {VideoControllerApi} from '../../video/video-controller-api';

export interface ScrollbarLaneConfig extends TimelineLaneConfig<ScrollbarLaneStyle> {

}

export interface ScrollbarLaneStyle extends TimelineLaneStyle {
  scrollbarWidth?: number;
  scrollbarHeight?: number;
  scrollbarBackgroundFill?: string;
  scrollbarBackgroundFillOpacity?: number;
  scrollbarHandleBarFill?: string;
  scrollbarHandleBarOpacity?: number;
  scrollbarHandleOpacity?: number;
}

const configDefault: ScrollbarLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    height: 40,
    scrollbarHeight: 15,
    scrollbarBackgroundFill: '#000000',
    scrollbarBackgroundFillOpacity: 0.3,
    scrollbarHandleBarFill: '#01a6f0',
    scrollbarHandleBarOpacity: 1,
    scrollbarHandleOpacity: 1,
  }
}

export class ScrollbarLane extends BaseTimelineLane<ScrollbarLaneConfig, ScrollbarLaneStyle> {
  protected _contentGroup?: Konva.Group;
  protected _contentFlexGroup?: KonvaFlexGroup;
  protected _scrollbar?: Scrollbar;

  private _timelineZoomInProgress = false;

  constructor(config: TimelineLaneConfigDefaultsExcluded<ScrollbarLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));

    this._contentGroup = KonvaFactory.createGroup();
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    let timecodedContainerDimension = this._timeline!.getTimecodedContainerDimension();

    this._contentFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      width: timecodedContainerDimension.width,
      height: timecodedContainerDimension.height,
      flexDirection: 'FLEX_DIRECTION_ROW_REVERSE',
      alignItems: 'ALIGN_CENTER',
    })

    this._timeline!.addToTimecodedStaticContent(this._contentFlexGroup.contentNode.konvaNode);

    this._scrollbar = new Scrollbar({
      style: {
        height: this.style.scrollbarHeight,
        backgroundFill: this.style.scrollbarBackgroundFill,
        backgroundFillOpacity: this.style.scrollbarBackgroundFillOpacity,
        handleBarFill: this.style.scrollbarHandleBarFill,
        handleBarOpacity: this.style.scrollbarHandleBarOpacity,
        handleOpacity: this.style.scrollbarHandleOpacity,
      }
    });

    let scrollbarFlexItem = new KonvaFlexItem({
      ...(this.style.scrollbarWidth ? {
        width: this.style.scrollbarWidth
      } : {
        flexGrow: 1
      }),
      height: this.style.scrollbarHeight,
    }, new KonvaComponentFlexContentNode(this._scrollbar))

    this._contentFlexGroup
      .addChild(scrollbarFlexItem);

    this._videoController!.onVideoLoaded$.pipe(filter(p => !!p), takeUntil(this._destroyed$)).subscribe((event) => {
      this._scrollbar!.updateScrollHandle(this._timeline!);
    })

    this._timeline!.onScroll$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        if (!this._timelineZoomInProgress) {
          this._scrollbar!.updateScrollHandle(this._timeline!);
        }
      }
    })

    this._scrollbar.onScroll$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        this._timeline!.scrollHorizontallyToPercent(this._scrollbar!.getScrollHandlePercent());
      }
    })

    this._scrollbar.onZoom$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        this._timelineZoomInProgress = true;
        this._timeline!.zoomTo(event.zoomPercent, event.zoomFocus);
        this._timeline!.scrollHorizontallyToPercent(this._scrollbar!.getScrollHandlePercent());
        this._timelineZoomInProgress = false;
      }
    })
  }

  protected settleLayout() {
    let timecodedContainerDimension = this._timeline!.getTimecodedContainerDimension();
    let timecodedRect = this.getTimecodedRect();

    this._contentFlexGroup!.setDimensionAndPositions(
      timecodedContainerDimension.width,
      timecodedRect.height,
      FlexSpacingBuilder.instance().topRightBottomLeft([timecodedRect.y, 0, 0, 0]).build()
    )
    if (!this._timelineZoomInProgress) {
      this._scrollbar!.updateScrollHandle(this._timeline!);
    }
  }

  override destroy() {
    super.destroy();

    this._contentFlexGroup?.destroy();
  }
}
