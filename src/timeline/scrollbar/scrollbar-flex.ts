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

import {filter, takeUntil} from 'rxjs';
import type {Layout} from '../layout/flex-node';
import {type ScrollableHorizontally, Scrollbar, ScrollbarEventType} from './scrollbar';
import {KonvaComponentFlexContentNode2} from '../layout/konva-component-flex';
import {KonvaFlexItem} from '../layout/konva-flex';
import type {FlexGroupConfig} from '../layout/flex-group';
import {TimelineEventType} from '../timeline-api';
import type {TimelineImpl} from '../timeline';
import {ObserverBreaker} from '../../common/observer-breaker';

export class ScrollbarFlexContentNode extends KonvaComponentFlexContentNode2<Scrollbar> {
  private _scrollableHorizontally: ScrollableHorizontally;

  constructor(component: Scrollbar, scrollableHorizontally: ScrollableHorizontally) {
    super(component);
    this._scrollableHorizontally = scrollableHorizontally;
  }

  override updateLayout(layout: Layout) {
    super.updateLayout(layout);
    this.component.updateScrollHandle(this._scrollableHorizontally);
  }
}

export class ScrollbarFlexItem extends KonvaFlexItem<ScrollbarFlexContentNode> {
  constructor(config: FlexGroupConfig, scrollbar: Scrollbar, scrollableHorizontally: ScrollableHorizontally) {
    super(config, new ScrollbarFlexContentNode(scrollbar, scrollableHorizontally));
  }
}

export class TimelineScrollbar extends ScrollbarFlexItem {
  private _timeline: TimelineImpl;
  private _scrollbar: Scrollbar;

  private _timelineZoomInProgress = false;

  protected _destroyBreaker = new ObserverBreaker();

  constructor(config: FlexGroupConfig, scrollbar: Scrollbar, timeline: TimelineImpl) {
    super(config, scrollbar, timeline);

    this._timeline = timeline;
    this._scrollbar = scrollbar;

    this._timeline.onEvent$
      .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_SCROLL))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        if (!this._timelineZoomInProgress) {
          this._scrollbar.updateScrollHandle(this._timeline);
        }
      });

    this._scrollbar.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        switch (event.type) {
          case ScrollbarEventType.SCROLLBAR_SCROLL:
            this._timeline.scrollHorizontallyToPercent(this._scrollbar.getScrollHandlePercent());
            break;
          case ScrollbarEventType.SCROLLBAR_ZOOM:
            this._timelineZoomInProgress = true;
            this._timeline.zoomTo(event.data.zoomPercent, event.data.zoomFocus);
            this._timeline.scrollHorizontallyToPercent(this._scrollbar.getScrollHandlePercent());
            this._timelineZoomInProgress = false;
            break;
        }
      },
    });
  }

  override destroy() {
    super.destroy();
    this._destroyBreaker.destroy();
  }
}
