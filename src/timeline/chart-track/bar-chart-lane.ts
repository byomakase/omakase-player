/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import {BaseTimelineLane, TimelaneLaneConfig, TIMELINE_LANE_STYLE_DEFAULT, TimelineLaneStyle} from '../timeline-lane';
import Konva from 'konva';
import {ShapeUtil} from '../../util/shape-util';
import {Constants} from '../../constants';
import {debounceTime, distinctUntilChanged, Subject, takeUntil} from 'rxjs';
import {ComponentConfigStyleComposed} from '../../common/component';
import {BarChartLaneItem} from './bar-chart-lane-item';
import Decimal from 'decimal.js';
import {nextCompleteVoidSubject} from '../../util/observable-util';
import {BarChart, BarChartCue, WithOptionalPartial} from '../../types';
import {BarChartFile} from '../../chart/chart-file';
import {ArrayUtil} from '../../util/array-util';

export interface BarChartLaneStyle extends TimelineLaneStyle {
  paddingTop: number;
  paddingBottom: number;

  interpolationWidth: number;
  itemFillLinearGradientColorStops: (number | string)[];
  itemPadding: number;
  itemCornerRadius: number;

  // interpolateEmpty: boolean;
}

const styleDefault: BarChartLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  height: 40,
  paddingTop: 0,
  paddingBottom: 0,

  interpolationWidth: 10,
  itemFillLinearGradientColorStops: Constants.FILL_LINEAR_GRADIENT_AUDIO_PEAK,
  itemPadding: 2,
  itemCornerRadius: 2,

  // interpolateEmpty: false
}

export interface BarChartLaneConfig extends TimelaneLaneConfig<BarChartLaneStyle> {
  chart: BarChart;
  valueMax: number;
  valueInterpolationStrategy: 'average' | 'max'
}

export class BarChartLane extends BaseTimelineLane<BarChartLaneConfig, BarChartLaneStyle> {
  // region config
  private _chart: BarChart;
  private _valueMax: number;
  private _valueInterpolationStrategy: 'average' | 'max';
  // endregion

  // region components
  protected readonly chartLaneItemsMap: Map<number, BarChartLaneItem> = new Map<number, BarChartLaneItem>();
  // endregion

  // region konva
  protected timecodedGroup: Konva.Group;
  protected timecodedEventCatcher: Konva.Rect;
  protected chartLaneItemsGroup: Konva.Group;
  // endregion

  private chartFile: BarChartFile;

  private numOfInterpolations: number;

  readonly onSettleLayout$: Subject<void> = new Subject<void>();

  constructor(config: ComponentConfigStyleComposed<BarChartLaneConfig>) {
    super({
      ...config,
      style: {
        ...styleDefault,
        ...config.style
      }
    });

    this._chart = this.config.chart;
    this._valueMax = this.config.valueMax;
    this._valueInterpolationStrategy = this.config.valueInterpolationStrategy;
  }

  protected createCanvasNode(): Konva.Group {
    super.createCanvasNode();

    this.timecodedGroup = new Konva.Group({
      ...this.timelinePosition,
      width: this.timeline.getTimecodedGroupDimension().width,
      height: this.bodyGroup.height()
    });

    this.timecodedEventCatcher = ShapeUtil.createEventCatcher({
      width: this.timecodedGroup.width(),
      height: this.timecodedGroup.height()
    });

    this.chartLaneItemsGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      y: this.style.paddingTop,
      width: this.timecodedGroup.width(),
      height: this.timecodedGroup.height() - (this.style.paddingTop + this.style.paddingBottom)
    });

    this.timecodedGroup.add(this.timecodedEventCatcher);
    this.timecodedGroup.add(this.chartLaneItemsGroup);

    this.timeline.addToTimecodedChartGroup(this.timecodedGroup);

    return this.bodyGroup;
  }

  protected settleLayout() {
    super.settleLayout();

    this.timecodedGroup.setAttrs({
      ...this.timelinePosition,
    })

    let horizontalMeasurement = this.timeline.getTimecodedGroupHorizontalMeasurement();
    [this.timecodedGroup, this.timecodedEventCatcher, this.chartLaneItemsGroup].forEach(node => {
      node.width(horizontalMeasurement.width)
    })

    this.onSettleLayout$.next();
  }

  protected afterCanvasNodeInit() {
    super.afterCanvasNodeInit();

    this.createChartFile();

    this.onSettleLayout$.pipe(takeUntil(this.onDestroy$)).subscribe(() => {
      this.settlePosition();
    })

    this.onSettleLayout$.pipe(takeUntil(this.onDestroy$), debounceTime(100)).subscribe(scroll => {
      this.settleAll();
    })

    this.timeline.onScroll$.pipe(takeUntil(this.onDestroy$), debounceTime(100), distinctUntilChanged()).subscribe(scroll => {
      this.settleAll();
    })
  }

  clearContent() {
    this.chartFile = void 0;
    this.clearItems();
  }

  private clearItems() {
    this.chartLaneItemsMap.forEach(p => p.destroy())
    this.chartLaneItemsMap.clear()
    this.chartLaneItemsGroup.destroyChildren();
  }

  private getVisibleCuesForInterpolation(): BarChartCue[] {
    let visibleTimeRange = this.timeline.getVisibleTimeRange();
    let cues = this.chartFile.findCues(visibleTimeRange.start, visibleTimeRange.end);
    return cues;
  }

  private createEntities() {
    if (!this.isFileLoaded()) {
      return;
    }

    this.clearItems();

    let timecodedContainerWidth = this.timeline.getTimecodedContainerDimension().width;

    this.numOfInterpolations = new Decimal(timecodedContainerWidth)
      .div(this.style.interpolationWidth)
      .floor().toNumber()

    let cuesInterpolations = this.resolveCuesInterpolations();

    for (let i = 0; i < this.numOfInterpolations; i++) {
      let cue = cuesInterpolations.get(i);

      let itemPosition = this.resolveInterpolatedItemPosition(i);

      let laneItem = new BarChartLaneItem({
        x: itemPosition,
        width: this.style.interpolationWidth,
        chartCue: cue,
        valueMax: this._valueMax,
        style: {
          height: this.chartLaneItemsGroup.height(),

          fillLinearGradientColorStops: this.style.itemFillLinearGradientColorStops,
          paddingX: this.style.itemPadding,
          cornerRadius: this.style.itemCornerRadius,

          visible: true,
        }
      });

      this.chartLaneItemsMap.set(i, laneItem);
      this.chartLaneItemsGroup.add(laneItem.initCanvasNode());
    }
  }

  private resolveCuesInterpolations(): Map<number, BarChartCue> {
    let visibleCues = this.getVisibleCuesForInterpolation();

    let cuesInterpolations: Map<number, BarChartCue> = new Map<number, BarChartCue>();
    // let emptyInterpolations: number[] = [];

    for (let i = 0; i < this.numOfInterpolations; i++) {
      let isLast = i === (this.numOfInterpolations - 1);

      let interpolationTimes = this.resolveInterpolationTimes(i);

      let interpolationStartTime = interpolationTimes.start;
      let interpolationEndTime = interpolationTimes.end;

      interpolationStartTime = new Decimal(interpolationStartTime).toDecimalPlaces(1).toNumber();
      interpolationEndTime = new Decimal(interpolationEndTime).toDecimalPlaces(1).toNumber();

      let cuesForInterpolation = visibleCues.filter(cue => {
        let inside = cue.startTime >= interpolationStartTime && (isLast ? cue.endTime <= interpolationEndTime : cue.endTime < interpolationEndTime)
        let leftIntersection = cue.startTime < interpolationStartTime && (cue.endTime >= interpolationStartTime && (isLast ? cue.endTime <= interpolationEndTime : cue.endTime < interpolationEndTime))
        let rightIntersection = (cue.startTime > interpolationStartTime && (isLast ? cue.startTime <= interpolationEndTime : cue.startTime < interpolationEndTime)) && (cue.endTime > interpolationEndTime)
        let completeIntersection = cue.startTime < interpolationStartTime && cue.endTime > interpolationEndTime;
        return inside || leftIntersection || rightIntersection || completeIntersection;
      });

      let cue: BarChartCue;

      let cuePartial: WithOptionalPartial<BarChartCue, 'value'> = {
        id: `${i}`,
        startTime: interpolationStartTime,
        endTime: interpolationEndTime
      }

      if (cuesForInterpolation.length > 0) {
        cue = {
          ...cuePartial,
          value: this.resolveInterpolationValue(cuesForInterpolation),
        }
      } else {
        // emptyInterpolations.push(i);
        cue = {
          ...cuePartial,
          value: 0,
        }
      }

      cuesInterpolations.set(i, cue);
    }

    // if (this.style.interpolateEmpty) {
    //   let interpolationIndicesGroups = ArrayUtil.groupConsecutiveNumbers(emptyInterpolations);
    //   interpolationIndicesGroups.forEach(interpolationIndicesGroup => {
    //     this.interpolateEmpty(cuesInterpolations, interpolationIndicesGroup)
    //   })
    // }

    return cuesInterpolations
  }

  // private interpolateEmpty(cuesInterpolations: Map<number, BarChartCue>, interpolationIndices: number[]) {
  //   let groupLeftIndex = interpolationIndices[0];
  //   let groupRightIndex = interpolationIndices[interpolationIndices.length - 1];
  //
  //   let cueLeftIndex;
  //   let cueRightIndex;
  //
  //   let leftCue: BarChartCue;
  //   let rightCue: BarChartCue;
  //
  //   if (groupLeftIndex === 0) {
  //     cueLeftIndex = groupRightIndex + 1;
  //     cueRightIndex = groupRightIndex + 1;
  //   } else if (groupRightIndex === (cuesInterpolations.size - 1)) {
  //     cueLeftIndex = groupLeftIndex - 1;
  //     cueRightIndex = groupLeftIndex - 1;
  //   } else {
  //     cueLeftIndex = groupLeftIndex - 1;
  //     cueRightIndex = groupRightIndex + 1;
  //   }
  //
  //   leftCue = cuesInterpolations.get(cueLeftIndex);
  //   rightCue = cuesInterpolations.get(cueRightIndex);
  //
  //   let linearIncrement = new Decimal(leftCue.value - rightCue.value).div(interpolationIndices.length + 1).toNumber();
  //
  //   for (let i = 0; i < interpolationIndices.length; i++) {
  //     let cueIndex = interpolationIndices[i];
  //     let cue = cuesInterpolations.get(cueIndex);
  //     cue.value = leftCue.value - linearIncrement * (i + 1);
  //   }
  // }

  private resolveInterpolationValue(cues: BarChartCue[]): number {
    if (cues.length === 1) {
      return cues[0].value;
    } else {
      if (this._valueInterpolationStrategy === 'max') {
        return Math.max(...cues.map(p => p.value))
      } else { // average
        let sum = cues.map(p => p.value).reduce((acc, num) => acc + num, 0)
        return new Decimal(sum).div(cues.length).toDecimalPlaces(3).toNumber();
      }
    }
  }

  private resolveInterpolationTimes(i: number) {
    let interpolationStartX = new Decimal(i).mul(this.style.interpolationWidth).toNumber();
    let interpolationEndX = new Decimal(interpolationStartX).plus(this.style.interpolationWidth).toNumber();

    let interpolationStartTime = this.timeline.timelinePositionToTimeRelativeToTimecoded(new Decimal(interpolationStartX).toDecimalPlaces(3).toNumber());
    let interpolationEndTime = this.timeline.timelinePositionToTimeRelativeToTimecoded(new Decimal(interpolationEndX).toDecimalPlaces(3).toNumber());

    return {
      start: interpolationStartTime,
      end: interpolationEndTime
    }
  }

  private settleAll() {
    this.createEntities();
  }

  private resolveInterpolatedItemPosition(itemIndex: number) {
    return Math.abs(this.timeline.getTimecodedGroupHorizontalMeasurement().x) + itemIndex * this.style.interpolationWidth;
  }

  private settlePosition() {
    if (!this.isFileLoaded() || this.chartLaneItemsMap.size < 1) {
      return;
    }

    for (let i = 0; i < this.numOfInterpolations; i++) {
      let laneItem = this.chartLaneItemsMap.get(i);
      let x = this.timeline.timeToTimelinePosition(laneItem.getChartCue().startTime);
      laneItem.setPosition({x})
    }
  }

  private createChartFile() {
    this.chartFile = new BarChartFile(this.chart);
    this.createEntities();
  }

  private isFileLoaded(): boolean {
    return !!this.chartFile;
  }


  get chart(): BarChart {
    return this._chart;
  }

  destroy() {
    this.chartLaneItemsMap.forEach(laneItem => {
      laneItem.destroy();
    })

    this.chartFile = void 0;

    nextCompleteVoidSubject(this.onSettleLayout$);

    super.destroy();
  }
}
