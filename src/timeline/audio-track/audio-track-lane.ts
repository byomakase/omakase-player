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

import {BaseTimelineLane, TimelaneLaneConfig, TIMELINE_LANE_STYLE_DEFAULT, TimelineLaneStyle} from "../timeline-lane";
import Konva from "konva";
import {ShapeUtil} from "../../util/shape-util";
import {Constants} from "../../constants";
import {catchError, combineLatest, debounceTime, map, Observable, of, Subject, take, takeUntil} from "rxjs";
import {AudioVttCue} from "../../types";
import {AudioVttFile} from "../../track/audio-vtt-file";
import {ComponentConfigStyleComposed} from "../../common/component";
import {AudioTrackLaneItem} from "./audio-track-lane-item";
import Decimal from "decimal.js";
import {nextCompleteVoidSubject} from "../../util/observable-util";

export interface AudioTrackLaneStyle extends TimelineLaneStyle {
  paddingTop: number;
  paddingBottom: number;

  itemWidth: number;
  itemMinPadding: number;
  itemCornerRadius: number;
  maxSampleFillLinearGradientColorStops: (number | string)[];
  minSampleFillLinearGradientColorStops: (number | string)[];
}

const styleDefault: AudioTrackLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  height: 40,
  paddingTop: 0,
  paddingBottom: 0,

  itemWidth: 5,
  itemMinPadding: 2,
  itemCornerRadius: 5,
  maxSampleFillLinearGradientColorStops: [0, 'red', 0.2, 'yellow', 1, 'green'],
  minSampleFillLinearGradientColorStops: [0, 'green', 0.8, 'yellow', 1, 'red'],

}

export interface AudioTrackLaneConfig extends TimelaneLaneConfig<AudioTrackLaneStyle> {
  audioVttFileUrl: string;
}

export class AudioTrackLane extends BaseTimelineLane<AudioTrackLaneConfig, AudioTrackLaneStyle> {
  // region config
  private _audioVttFileUrl: string;
  // endregion

  // region components
  protected readonly audioTrackLaneItemsMap: Map<number, AudioTrackLaneItem> = new Map<number, AudioTrackLaneItem>();
  // endregion

  // region konva
  protected timecodedGroup: Konva.Group;
  protected timecodedEventCatcher: Konva.Rect;
  protected audioTrackLaneItemsGroup: Konva.Group;
  // endregion

  private audioVttFile: AudioVttFile;

  private numOfInterpolations: number;
  private itemPadding: number;

  readonly onSettleLayout$: Subject<void> = new Subject<void>();

  constructor(config: ComponentConfigStyleComposed<AudioTrackLaneConfig>) {
    super({
      ...config,
      style: {
        ...styleDefault,
        ...config.style
      }
    });

    this._audioVttFileUrl = this.config.audioVttFileUrl;
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

    this.audioTrackLaneItemsGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      y: this.style.paddingTop,
      width: this.timecodedGroup.width(),
      height: this.timecodedGroup.height() - (this.style.paddingTop + this.style.paddingBottom)
    });

    this.timecodedGroup.add(this.timecodedEventCatcher);
    this.timecodedGroup.add(this.audioTrackLaneItemsGroup);

    this.timeline.addToTimecodedAudioGroup(this.timecodedGroup);

    return this.bodyGroup;
  }

  protected settleLayout() {
    super.settleLayout();

    this.timecodedGroup.setAttrs({
      ...this.timelinePosition,
    })

    let horizontalMeasurement = this.timeline.getTimecodedGroupHorizontalMeasurement();
    [this.timecodedGroup, this.timecodedEventCatcher, this.audioTrackLaneItemsGroup].forEach(node => {
      node.width(horizontalMeasurement.width)
    })

    this.onSettleLayout$.next();
  }

  protected afterCanvasNodeInit() {
    super.afterCanvasNodeInit();

    this.fetchAndCreateAudioTrack();

    this.onSettleLayout$.pipe(takeUntil(this.onDestroy$)).subscribe(() => {
      this.settlePosition();
    })

    combineLatest([
      this.onSettleLayout$,
      this.timeline.onScroll$
    ]).pipe(takeUntil(this.onDestroy$), debounceTime(100)).subscribe(() => {
      this.settleAll();
    });
  }

  clearContent() {
    this.audioVttFile = void 0;
    this.clearItems();
  }

  private clearItems() {
    this.audioTrackLaneItemsMap.forEach(p => p.destroy())
    this.audioTrackLaneItemsMap.clear()
    this.audioTrackLaneItemsGroup.destroyChildren();
  }

  private getVisibleCues(): AudioVttCue[] {
    let timeRange = this.timeline.getVisibleTimeRange();
    let cues = this.audioVttFile.findCues(timeRange.start, timeRange.end);
    return cues;
  }

  private createEntities() {
    if (!this.isVttLoaded()) {
      return;
    }

    this.clearItems();

    let cues = this.getVisibleCues();

    let timecodedContainerWidth = this.timeline.getTimecodedContainerDimension().width;

    this.numOfInterpolations = new Decimal(timecodedContainerWidth + this.style.itemMinPadding)
      .div(this.style.itemWidth + this.style.itemMinPadding)
      .floor().toNumber()

    this.itemPadding = new Decimal(timecodedContainerWidth - this.numOfInterpolations * this.style.itemWidth)
      .div(this.numOfInterpolations - 1)
      .toNumber();

    let numOfCuesPerInterpolation = this.resolveNumOfCuesPerInterpolation(cues.length);

    let cuesInterpolations = this.resolveCuesInterpolations(cues, numOfCuesPerInterpolation)
    for (let i = 0; i < this.numOfInterpolations; i++) {
      let cue = cuesInterpolations.get(i);

      let itemPosition = this.resolveInterpolatedItemPosition(i);

      let audioTrackLaneItem = new AudioTrackLaneItem({
        x: itemPosition,
        width: this.style.itemWidth,
        audioVttCue: cue,
        style: {
          cornerRadius: this.style.itemCornerRadius,
          height: this.audioTrackLaneItemsGroup.height(),
          visible: true,
          maxSampleFillLinearGradientColorStops: this.style.maxSampleFillLinearGradientColorStops,
          minSampleFillLinearGradientColorStops: this.style.minSampleFillLinearGradientColorStops,
        }
      });

      this.audioTrackLaneItemsMap.set(i, audioTrackLaneItem);
      this.audioTrackLaneItemsGroup.add(audioTrackLaneItem.initCanvasNode());
    }
  }

  private resolveNumOfCuesPerInterpolation(cuesLength: number): number {
    return new Decimal(cuesLength).div(this.numOfInterpolations).floor().toNumber();
  }

  private resolveCuesInterpolations(cues: AudioVttCue[], numOfCuesPerInterpolation: number): Map<number, AudioVttCue> {
    let interpolatedCuesSurplus = cues.length - numOfCuesPerInterpolation * this.numOfInterpolations;
    let cuesInterpolations: Map<number, AudioVttCue> = new Map<number, AudioVttCue>();

    let sliceEndIndex = 0;
    for (let i = 0; i < this.numOfInterpolations; i++) {
      let interpolationLength = numOfCuesPerInterpolation + (i < interpolatedCuesSurplus ? 1 : 0)
      let sliceStartIndex = sliceEndIndex;
      sliceEndIndex = sliceStartIndex + interpolationLength;

      let cuesForInterpolation = cues.slice(sliceStartIndex, sliceEndIndex);
      let firstCue = cues[sliceStartIndex];
      let lastCue = cues[sliceEndIndex - 1];

      let minSampleSum = 0, maxSampleSum = 0;
      cuesForInterpolation.forEach(cue => {
        minSampleSum += cue.minSample;
        maxSampleSum += cue.maxSample;
      })

      let cue: AudioVttCue = {
        id: `${i}`,
        text: '',
        minSample: new Decimal(minSampleSum).div(interpolationLength).toDecimalPlaces(3).toNumber(),
        maxSample: new Decimal(maxSampleSum).div(interpolationLength).toDecimalPlaces(3).toNumber(),
        startTime: firstCue.startTime,
        endTime: lastCue.endTime
      }

      cuesInterpolations.set(i, cue);
    }
    return cuesInterpolations
  }

  private settleAll() {
    if (!this.isVttLoaded() || this.audioTrackLaneItemsMap.size < 1) {
      return;
    }

    let cues = this.getVisibleCues();
    let numOfCuesPerInterpolation = this.resolveNumOfCuesPerInterpolation(cues.length);
    let cuesInterpolations = this.resolveCuesInterpolations(cues, numOfCuesPerInterpolation)

    for (let i = 0; i < this.numOfInterpolations; i++) {
      let cue = cuesInterpolations.get(i);
      let audioTrackLaneItem = this.audioTrackLaneItemsMap.get(i);
      audioTrackLaneItem.setAudioVttCue(cue);
      audioTrackLaneItem.setPosition({
        x: this.resolveInterpolatedItemPosition(i)
      })
    }
  }

  private resolveInterpolatedItemPosition(itemIndex: number) {
    return Math.abs(this.timeline.getTimecodedGroupHorizontalMeasurement().x) + itemIndex * this.style.itemWidth + itemIndex * this.itemPadding;
  }

  private settlePosition() {
    if (!this.isVttLoaded() || this.audioTrackLaneItemsMap.size < 1) {
      return;
    }

    for (let i = 0; i < this.numOfInterpolations; i++) {
      let audioTrackLaneItem = this.audioTrackLaneItemsMap.get(i);
      let x = this.timeline.timeToTimelinePosition(audioTrackLaneItem.getAudioVttCue().startTime);
      audioTrackLaneItem.setPosition({x})
    }
  }

  private fetchAndCreateAudioTrack() {
    this.fetchAudioTrackVttFile(this._audioVttFileUrl).pipe(take(1)).subscribe((audioVttFile) => {
      this.audioVttFile = audioVttFile;
      this.createEntities();
    })
  }

  private fetchAudioTrackVttFile(url: string): Observable<AudioVttFile> {
    if (url) {
      return AudioVttFile.create(url).pipe(map(audioTrackVttFile => {
        return audioTrackVttFile;
      }), catchError((err, caught) => {
        return of(void 0);
      }))
    } else {
      return of(void 0);
    }
  }

  private isVttLoaded(): boolean {
    return !!this.audioVttFile;
  }

  get audioVttFileUrl(): string {
    return this._audioVttFileUrl;
  }

  set audioVttFileUrl(value: string) {
    this._audioVttFileUrl = value;
    this.clearContent();
    this.fetchAndCreateAudioTrack();
  }

  destroy() {
    this.audioTrackLaneItemsMap.forEach(audioTrackLineItem => {
      audioTrackLineItem.destroy();
    })

    this.audioVttFile = void 0;

    nextCompleteVoidSubject(this.onSettleLayout$);

    super.destroy();
  }
}
