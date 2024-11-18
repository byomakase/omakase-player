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

import {KonvaComponentFlexContentNode} from '../../layout/konva-component-flex';
import {ScrollableHorizontally, Scrollbar} from './scrollbar';
import {Layout} from '../../layout/flex-node';
import {KonvaFlexItem} from '../../layout/konva-flex';
import {FlexGroupConfig} from '../../layout/flex-group';
import {Timeline} from '../timeline';
import {Subject, takeUntil} from 'rxjs';
import {nextCompleteSubject} from '../../util/rxjs-util';

export class ScrollbarFlexContentNode extends KonvaComponentFlexContentNode<Scrollbar> {
  private _scrollableHorizontally: ScrollableHorizontally;

  constructor(component: Scrollbar, scrollableHorizontally: ScrollableHorizontally) {
    super(component);
    this._scrollableHorizontally = scrollableHorizontally;
  }

  override updateLayout(layout: Layout) {
    super.updateLayout(layout);
    this.component.updateScrollHandle(this._scrollableHorizontally)
  }
}

export class ScrollbarFlexItem extends KonvaFlexItem<ScrollbarFlexContentNode> {
  constructor(config: FlexGroupConfig, scrollbar: Scrollbar, scrollableHorizontally: ScrollableHorizontally) {
    super(config, new ScrollbarFlexContentNode(scrollbar, scrollableHorizontally));
  }
}

export class TimelineScrollbar extends ScrollbarFlexItem {
  private _timeline: Timeline;
  private _scrollbar: Scrollbar;

  private _timelineZoomInProgress = false;

  private _destroyed$ = new Subject<void>();

  constructor(config: FlexGroupConfig, scrollbar: Scrollbar, timeline: Timeline) {
    super(config, scrollbar, timeline);

    this._timeline = timeline;
    this._scrollbar = scrollbar;

    this._timeline.onScroll$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        if (!this._timelineZoomInProgress) {
          this._scrollbar.updateScrollHandle(this._timeline);
        }
      }
    })

    this._scrollbar.onScroll$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        this._timeline.scrollHorizontallyToPercent(this._scrollbar.getScrollHandlePercent());
      }
    })

    this._scrollbar.onZoom$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        this._timelineZoomInProgress = true;
        this._timeline.zoomTo(event.zoomPercent, event.zoomFocus);
        this._timeline.scrollHorizontallyToPercent(this._scrollbar.getScrollHandlePercent());
        this._timelineZoomInProgress = false;
      }
    })
  }

  override destroy() {
    super.destroy();
    nextCompleteSubject(this._destroyed$);
  }
}
