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

import {TIMELINE_LANE_CONFIG_DEFAULT, timelineLaneComposeConfig, TimelineLaneConfigDefaultsExcluded, TimelineLaneStyle, VTT_DOWNSAMPLE_CONFIG_DEFAULT} from '../timeline-lane';
import Konva from 'konva';
import {Constants} from '../../constants';
import {debounceTime, distinctUntilChanged, filter, Subject, takeUntil, zip} from 'rxjs';
import {OgChartLaneItem} from './og-chart-lane-item';
import Decimal from 'decimal.js';
import {OgChartCue, OgChartVttCue, WithOptionalPartial} from '../../types';
import {Timeline} from '../timeline';
import {destroyer} from '../../util/destroy-util';
import {KonvaFactory} from '../../konva/konva-factory';
import {VideoControllerApi} from '../../video';
import {AxiosRequestConfig} from 'axios';
import {OgChartVttFile} from '../../vtt';
import {isNullOrUndefined} from '../../util/object-util';
import {OgChartLaneApi} from '../../api';
import {VttAdapter, VttAdapterConfig} from '../../common/vtt-adapter';
import {VttTimelineLane, VttTimelineLaneConfig} from '../vtt-timeline-lane';

export interface OgChartLaneConfig extends VttTimelineLaneConfig<OgChartLaneStyle>, VttAdapterConfig<OgChartVttFile> {
  axiosConfig?: AxiosRequestConfig;

  valueMin?: number;
  valueMax?: number;
  valueTransformFn?: (value: number) => number;
  itemProcessFn?: (item: OgChartLaneItem, index: number) => void;

  valueInterpolationStrategy?: 'average' | 'max';
}

export interface OgChartLaneStyle extends TimelineLaneStyle {
  paddingTop: number;
  paddingBottom: number;

  interpolationWidth: number;
  itemFillLinearGradientColorStops: (number | string)[];
  itemPadding: number;
  itemScaleRatio: number;
}

const configDefault: OgChartLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  ...VTT_DOWNSAMPLE_CONFIG_DEFAULT,
  downsampleStrategy: 'avg',
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,

    interpolationWidth: 10,
    itemFillLinearGradientColorStops: Constants.fillLinearGradientAudioPeak,
    itemPadding: 1,
    itemScaleRatio: 1,
  },
};

export class OgChartLane extends VttTimelineLane<OgChartLaneConfig, OgChartLaneStyle, OgChartVttCue, OgChartVttFile> implements OgChartLaneApi {
  protected readonly _vttAdapter: VttAdapter<OgChartVttFile> = new VttAdapter(OgChartVttFile);

  protected readonly _itemsMap: Map<number, OgChartLaneItem> = new Map<number, OgChartLaneItem>();

  protected _valueTransformFn: (value: number) => number;
  protected _itemProcessFn?: (item: OgChartLaneItem, index: number) => void;

  protected _numOfInterpolations?: number;

  protected _timecodedEventCatcher?: Konva.Rect;
  protected _itemsGroup?: Konva.Group;

  constructor(config: TimelineLaneConfigDefaultsExcluded<OgChartLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));

    this._vttAdapter.initFromConfig(this._config);
    this._valueTransformFn = this._config.valueTransformFn
      ? this._config.valueTransformFn
      : (value: number) => {
          return value;
        };
    this._itemProcessFn = this._config.itemProcessFn;
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = new Konva.Group({
      ...timecodedRect,
    });

    this._timecodedEventCatcher = KonvaFactory.createEventCatcherRect({
      ...this._timecodedGroup.getSize(),
    });

    this._itemsGroup = new Konva.Group({
      y: this._config.style.paddingTop,
      width: this._timecodedGroup.width(),
      height: this._config.style.height - (this._config.style.paddingTop + this._config.style.paddingBottom),
    });

    this._timecodedGroup.add(this._timecodedEventCatcher);
    this._timecodedGroup.add(this._itemsGroup);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 4);

    this._onSettleLayout$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this.settlePosition();
    });

    this._onSettleLayout$.pipe(debounceTime(100), takeUntil(this._destroyed$)).subscribe((scroll) => {
      this.settleAll();
    });

    this._timeline!.onScroll$.pipe(debounceTime(100), distinctUntilChanged(), takeUntil(this._destroyed$)).subscribe((scroll) => {
      this.settleAll();
    });

    zip([this._videoController!.onVideoLoaded$.pipe(filter((p) => !!p && !(p.isAttaching || p.isDetaching))), this._vttAdapter.vttFileLoaded$])
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: () => {
          this.createEntities();
        },
      });

    this._videoController!.onVideoLoading$.pipe(
      filter((p) => !(p.isAttaching || p.isDetaching)),
      takeUntil(this._destroyed$)
    ).subscribe({
      next: (event) => {
        this.clearContent();
      },
    });

    if (this.vttUrl) {
      this.loadVtt(this.vttUrl, this.getVttLoadOptions(this._config.axiosConfig));
    }
  }

  protected override createLoadingGroupObjects(): Array<Konva.Shape | Konva.Group> {
    const rects: Konva.Group[] = [];
    const range = this._timeline!.getVisiblePositionRange();
    for (let x = range.start; x <= range.end; x += 7) {
      const column = new Konva.Group();
      for (let y = this._loadingGroup!.height() / 2 - 13; y <= this._loadingGroup!.height() / 2 + 13; y += 7) {
        const rect = KonvaFactory.createRect({
          x,
          y,
          width: 5,
          height: 5,
          fill: this.resolveLoadingAnimationColor(),
          opacity: column.getChildren().length === 3 || rects.length % 7 === 3 ? 1 : 0,
        });
        this._loadingGroup!.add(rect);
        column.add(rect);
      }
      rects.push(column);
    }
    return rects;
  }

  protected override createLoadingAnimation(): Konva.Animation {
    return new Konva.Animation((frame) => {
      const frameTime = Math.round((frame?.time ?? 0) / 300);
      const frameNumber = frameTime % 6;
      this._loadingGroup!.getChildren().forEach((column, columnIndex) => {
        (column as Konva.Group).getChildren().forEach((rect, rowIndex) => {
          const showRect = ((frame: number, column: number, row: number) => {
            if (row === 3) return true;
            else if (frame === 0) return column == 3;
            else if (frame === 1) return column > 1 && column < 5 && (row === 2 || (row === 1 && column === 3));
            else if (frame === 2) return (row === 1 && (column === 2 || column === 4)) || (row === 2 && column !== 0 && column !== 6);
            else if (frame === 3) return column !== 3 && ((row === 0 && (column === 2 || column === 4)) || (row === 1 && column !== 0 && column !== 6) || row === 2);
            else if (frame === 4) return row === 2 || (row === 1 && column !== 3) || column === 1 || column === 5;
            else if (frame === 5) return row === 2 || column === 0 || column === 6 || (row === 1 && (column === 1 || column === 5));
            return false;
          })(frameNumber, columnIndex % 7, rowIndex);
          rect.opacity(showRect ? 1 : 0);
        });
      });
    });
  }

  private createEntities() {
    if (!this.vttFile) {
      throw new Error('VTT file not loaded');
    }

    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?');
    }

    this.clearItems();

    if (this.vttFile.cues.length < 1) {
      return;
    }

    let visibleTimeRange = this._timeline!.getVisibleTimeRange();
    let cues = this.vttFile.findCues(visibleTimeRange.start, visibleTimeRange.end);

    let minMax = this.findMinMax(cues);

    let valueMin = isNullOrUndefined(this._config.valueMin) ? minMax.min.value : this._config.valueMin!;
    let valueMax = isNullOrUndefined(this._config.valueMax) ? minMax.max.value : this._config.valueMax!;
    let valueScale = valueMax - valueMin;

    let timecodedContainerWidth = this._timeline.getTimecodedContainerDimension().width;

    this._numOfInterpolations = new Decimal(timecodedContainerWidth).div(this.style.interpolationWidth).round().toNumber();

    let cuesInterpolations = this.resolveCuesInterpolations(this.vttFile, this._numOfInterpolations);

    for (let i = 0; i < this._numOfInterpolations; i++) {
      let cue = cuesInterpolations.get(i);
      if (cue) {
        let itemPosition = this.resolveInterpolatedItemPosition(i);

        let value = this._valueTransformFn(cue.value);
        value = value < 0 ? 0 : value > valueScale ? valueScale : value;

        let laneItem = new OgChartLaneItem({
          x: itemPosition,
          width: this.style.interpolationWidth,
          cue: cue,

          value: value,
          valueScale: valueScale,
          listening: true,

          style: {
            height: this._itemsGroup!.height(),
            fillLinearGradientColorStops: this.style.itemFillLinearGradientColorStops,
            paddingX: this.style.itemPadding,
            paddingY: this.style.itemPadding,
            scaleRatio: this.style.itemScaleRatio,
            visible: true,
          },
        });

        this._itemsMap.set(i, laneItem);
        this._itemsGroup!.add(laneItem.konvaNode);

        if (this._itemProcessFn) {
          this._itemProcessFn(laneItem, i);
        }
      }
    }
  }

  private findMinMax(cues: OgChartVttCue[]): {min: OgChartVttCue; max: OgChartVttCue} {
    let min = cues[0];
    let max = cues[0];

    for (let i = 1; i < cues.length; i++) {
      if (this._valueTransformFn(cues[i].value) < this._valueTransformFn(min.value)) {
        min = cues[i];
      }
      if (this._valueTransformFn(cues[i].value) > this._valueTransformFn(max.value)) {
        max = cues[i];
      }
    }

    return {min, max};
  }

  private resolveCuesInterpolations(vttFile: OgChartVttFile, numOfInterpolations: number): Map<number, OgChartCue> {
    let visibleTimeRange = this._timeline!.getVisibleTimeRange();
    let visibleCues = vttFile.findCues(visibleTimeRange.start, visibleTimeRange.end);

    let cuesInterpolations: Map<number, OgChartCue> = new Map<number, OgChartCue>();

    for (let i = 0; i < numOfInterpolations; i++) {
      let isLast = i === numOfInterpolations - 1;

      let interpolationTimes = this.resolveInterpolationTimes(i);

      let interpolationStartTime = interpolationTimes.start;
      let interpolationEndTime = interpolationTimes.end;

      interpolationStartTime = new Decimal(interpolationStartTime).toDecimalPlaces(1).toNumber();
      interpolationEndTime = new Decimal(interpolationEndTime).toDecimalPlaces(1).toNumber();

      let cuesForInterpolation = visibleCues.filter((cue) => {
        let inside = cue.startTime >= interpolationStartTime && (isLast ? cue.endTime <= interpolationEndTime : cue.endTime < interpolationEndTime);
        let leftIntersection = cue.startTime < interpolationStartTime && cue.endTime >= interpolationStartTime && (isLast ? cue.endTime <= interpolationEndTime : cue.endTime < interpolationEndTime);
        let rightIntersection =
          cue.startTime >= interpolationStartTime && (isLast ? cue.startTime <= interpolationEndTime : cue.startTime < interpolationEndTime) && cue.endTime > interpolationEndTime;
        let completeIntersection = cue.startTime < interpolationStartTime && cue.endTime > interpolationEndTime;
        return inside || leftIntersection || rightIntersection || completeIntersection;
      });

      let cue: OgChartCue;

      let cuePartial: WithOptionalPartial<OgChartCue, 'value'> = {
        id: `${i}`,
        startTime: interpolationStartTime,
        endTime: interpolationEndTime,
      };

      if (cuesForInterpolation.length > 0) {
        cue = {
          ...cuePartial,
          value: this.resolveInterpolationValue(cuesForInterpolation),
        };

        cuesInterpolations.set(i, cue);
      }
    }

    return cuesInterpolations;
  }

  private resolveInterpolationValue(cues: OgChartCue[]): number {
    if (cues.length === 1) {
      return cues[0].value;
    } else {
      if (this._config.valueInterpolationStrategy === 'max') {
        return Math.max(...cues.map((p) => p.value));
      } else {
        // average
        let sum = cues.map((p) => p.value).reduce((acc, num) => acc + num, 0);
        return new Decimal(sum).div(cues.length).toDecimalPlaces(3).toNumber();
      }
    }
  }

  private resolveInterpolationTimes(i: number) {
    let interpolationStartX = new Decimal(i).mul(this.style.interpolationWidth).toNumber();
    let interpolationEndX = new Decimal(interpolationStartX).plus(this.style.interpolationWidth).toNumber();

    let interpolationStartTime = this._timeline!.timelineContainerPositionToTime(new Decimal(interpolationStartX).toDecimalPlaces(3).toNumber());
    let interpolationEndTime = this._timeline!.timelineContainerPositionToTime(new Decimal(interpolationEndX).toDecimalPlaces(3).toNumber());

    return {
      start: interpolationStartTime,
      end: interpolationEndTime,
    };
  }

  protected settleLayout() {
    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup!.setAttrs({
      x: timecodedRect.x,
      y: timecodedRect.y,
    });

    this._timecodedGroup!.clipFunc((ctx) => {
      ctx.rect(0, 0, timecodedRect.width, timecodedRect.height);
    });

    [this._timecodedGroup, this._timecodedEventCatcher, this._itemsGroup].forEach((node) => {
      node!.width(timecodedRect.width);
    });

    this._onSettleLayout$.next();
  }

  override clearContent() {
    this.clearItems();
  }

  private clearItems() {
    this._itemsMap.forEach((p) => p.destroy());
    this._itemsMap.clear();
    this._itemsGroup?.destroyChildren();
  }

  private settleAll() {
    if (!this._videoController!.isVideoLoaded() || !this.vttFile) {
      return;
    }

    this.createEntities();
  }

  private resolveInterpolatedItemPosition(itemIndex: number) {
    return Math.abs(this._timeline!.getTimecodedFloatingHorizontals().x) + itemIndex * this.style.interpolationWidth;
  }

  private settlePosition() {
    if (!this._videoController!.isVideoLoaded() || !this.vttFile) {
      return;
    }

    if (this._itemsMap.size > 0) {
      for (const [index, item] of this._itemsMap) {
        let x = this._timeline!.timeToTimelinePosition(item.cue.startTime);
        item.barPosition = {x};
      }
    }
  }

  override destroy() {
    destroyer(...this._itemsMap.values());
    super.destroy();
  }
}
