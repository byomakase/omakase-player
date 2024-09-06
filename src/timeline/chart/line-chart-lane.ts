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

import {TIMELINE_LANE_CONFIG_DEFAULT, timelineLaneComposeConfig, TimelineLaneConfig, TimelineLaneConfigDefaultsExcluded, TimelineLaneStyle} from '../timeline-lane';
import Konva from 'konva';
import {debounceTime, distinctUntilChanged, filter, Subject, take, takeUntil} from 'rxjs';
import {LineChartLaneItem} from './line-chart-lane-item';
import {Timeline} from '../timeline';
import {destroyer} from '../../util/destroy-util';
import {AxiosRequestConfig} from 'axios';
import {LineChartVttFile} from '../../vtt';
import Decimal from 'decimal.js';
import {LineChartVttCue} from '../../types';
import {KonvaFactory} from '../../factory/konva-factory';
import {isNullOrUndefined} from '../../util/object-util';
import {VideoControllerApi} from '../../video/video-controller-api';
import {LineChartLaneApi} from '../../api';
import {VttAdapter, VttAdapterConfig} from '../../common/vtt-adapter';
import {VttTimelineLane} from '../vtt-timeline-lane';

export interface LineChartLaneConfig extends TimelineLaneConfig<LineChartLaneStyle>, VttAdapterConfig<LineChartVttFile> {
  axiosConfig?: AxiosRequestConfig;

  yMin?: number;
  yMax?: number;
}

export interface LineChartLaneStyle extends TimelineLaneStyle {
  paddingTop: number;
  paddingBottom: number;
  fill: string;
  pointFill: string;
  pointWidth: number;
  lineStrokeWidth: number;
}

const configDefault: LineChartLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,
    fill: 'yellow',
    pointFill: 'yellow',
    pointWidth: 0,
    lineStrokeWidth: 1
  }
}

export class LineChartLane extends VttTimelineLane<LineChartLaneConfig, LineChartLaneStyle, LineChartVttCue, LineChartVttFile> implements LineChartLaneApi {
  protected readonly _vttAdapter: VttAdapter<LineChartVttFile> = new VttAdapter(LineChartVttFile);

  protected readonly _onSettleLayout$: Subject<void> = new Subject<void>();
  protected readonly _itemsMap: Map<number, LineChartLaneItem> = new Map<number, LineChartLaneItem>();

  protected _timecodedGroup?: Konva.Group;
  protected _timecodedEventCatcher?: Konva.Rect;

  protected _group?: Konva.Group;
  protected _itemsGroup?: Konva.Group;
  protected _lineGroup?: Konva.Group;
  protected _line?: Konva.Line;
  protected _linePoints?: number[];

  constructor(config: TimelineLaneConfigDefaultsExcluded<LineChartLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));
    this._vttAdapter.initFromConfig(this._config);
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = new Konva.Group({
      ...timecodedRect
    });

    this._timecodedEventCatcher = KonvaFactory.createEventCatcherRect({
      ...this._timecodedGroup.getSize()
    });

    this._group = new Konva.Group({
      y: this.style.paddingTop,
      width: this._timecodedGroup.width(),
      height: this._timecodedGroup.height() - (this.style.paddingTop + this.style.paddingBottom)
    });

    this._itemsGroup = new Konva.Group({
      width: this._group.width(),
      height: this._group.height()
    });

    this._lineGroup = new Konva.Group({
      width: this._group.width(),
      height: this._group.height()
    });

    this._line = new Konva.Line({
      stroke: this.style.fill,
      strokeWidth: this.style.lineStrokeWidth,
      tension: 0,
    });


    this._lineGroup.add(this._line);

    this._group.add(this._lineGroup);
    this._group.add(this._itemsGroup);

    this._timecodedGroup.add(this._timecodedEventCatcher);
    this._timecodedGroup.add(this._group);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 4);

    this._onSettleLayout$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this.settlePosition();
    })

    this._onSettleLayout$.pipe(debounceTime(100), takeUntil(this._destroyed$)).subscribe(scroll => {
      this.settleAll();
    })

    this._timeline!.onScroll$.pipe(debounceTime(100), distinctUntilChanged(), takeUntil(this._destroyed$)).subscribe(scroll => {
      this.settleAll();
    })

    this._vttAdapter.vttFileLoaded$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: () => {
        this._videoController!.onVideoLoaded$.pipe(filter(p => !!p), take(1), takeUntil(this._destroyed$)).subscribe({
          next: (event) => {
            this.createEntities();
          }
        })
      }
    });

    this._videoController!.onVideoLoading$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.clearContent();
    })

    if (this.vttUrl) {
      this.loadVtt(this.vttUrl, this._config.axiosConfig).subscribe();
    }
  }

  protected settleLayout() {
    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup!.setAttrs({
      x: timecodedRect.x,
      y: timecodedRect.y
    });

    this._timecodedGroup!.clipFunc((ctx) => {
      ctx.rect(0, 0, timecodedRect.width, timecodedRect.height)
    });

    [this._timecodedGroup, this._timecodedEventCatcher, this._group, this._itemsGroup, this._lineGroup].forEach(node => {
      node!.width(timecodedRect.width)
    })

    this._onSettleLayout$.next();
  }

  override clearContent() {
    this.clearItems();
  }

  private clearItems() {
    this._itemsMap.forEach(p => p.destroy())
    this._itemsMap.clear()
    this._itemsGroup?.destroyChildren();
    this._line?.points([]);
    this._linePoints = void 0;
  }

  private settleAll() {
    if (!this._videoController!.isVideoLoaded() || !this.vttFile) {
      return;
    }

    this.createEntities();
  }

  private settlePosition() {
    if (!this._videoController!.isVideoLoaded() || !this.vttFile) {
      return;
    }

    if (this._itemsMap.size > 0) {
      for (const [index, item] of this._itemsMap) {
        let x = this._timeline!.timeToTimelinePosition(item.cue.startTime);
        item.pointPosition = {x};
        if (this._linePoints) {
          this._linePoints[index * 2] = x
        }
      }
    }
  }

  private createEntities() {
    if (!this.vttFile) {
      throw new Error('VTT file not loaded')
    }

    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?')
    }

    this.clearItems();

    let visibleTimeRange = this._timeline!.getVisibleTimeRange();
    let visibleCues = this.vttFile.cues; // TODO all for now

    let itemHeight = this._itemsGroup!.height();
    let minMax = this.findMinMax(this.vttFile.cues);

    let pointYMin = isNullOrUndefined(this._config.yMin) ? minMax.min.value : this._config.yMin!;
    let pointYMax = isNullOrUndefined(this._config.yMax) ? minMax.max.value : this._config.yMax!;
    let pointYScale = pointYMax - pointYMin;

    this._linePoints = [];
    this.vttFile.cues.forEach((cue, index) => {
      let pointX = this._timeline!.timeToTimelinePosition(cue.startTime);
      let pointY = itemHeight - new Decimal(cue.value - pointYMin).mul(itemHeight).div(pointYScale).toNumber();

      this._linePoints = this._linePoints!.concat(pointX, pointY);

      let item = new LineChartLaneItem({
        cue: cue,
        style: {
          height: itemHeight,
          pointFill: this.style.pointFill,
          pointWidth: this.style.pointWidth
        },
        pointPosition: {
          x: pointX,
          y: pointY
        }
      })

      this._itemsMap.set(index, item);
      this._itemsGroup!.add(item.konvaNode);
    });

    this._line?.points(this._linePoints);
  }

  private findMinMax(cues: LineChartVttCue[]): { min: LineChartVttCue, max: LineChartVttCue } {
    let min = cues[0];
    let max = cues[0];

    for (let i = 1; i < cues.length; i++) {
      if (cues[i].value < min.value) {
        min = cues[i];
      }
      if (cues[i].value > max.value) {
        max = cues[i];
      }
    }

    return {min, max};
  }


  override destroy() {
    destroyer(
      ...this._itemsMap.values()
    )

    super.destroy();
  }
}
