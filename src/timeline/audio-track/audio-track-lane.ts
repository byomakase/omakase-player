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
import {combineLatest, debounceTime, filter, Subject, takeUntil, zip} from 'rxjs';
import {AudioVttCue} from '../../types';
import {AudioTrackLaneItem} from './audio-track-lane-item';
import Decimal from 'decimal.js';
import {ColorUtil} from '../../util/color-util';
import {Timeline} from '../timeline';
import {destroyer} from '../../util/destroy-util';
import {AxiosRequestConfig} from 'axios';
import {KonvaFactory} from '../../factory/konva-factory';
import {VideoControllerApi} from '../../video';
import {AudioTrackLaneApi} from '../../api';
import {AudioVttFile} from '../../vtt';
import {VttAdapter, VttAdapterConfig} from '../../common/vtt-adapter';
import {VttTimelineLane, VttTimelineLaneConfig} from '../vtt-timeline-lane';

export interface AudioTrackLaneConfig extends VttTimelineLaneConfig<AudioTrackLaneStyle>, VttAdapterConfig<AudioVttFile> {
  axiosConfig?: AxiosRequestConfig;
}

export interface AudioTrackLaneStyle extends TimelineLaneStyle {
  paddingTop: number;
  paddingBottom: number;

  itemWidth: number;
  itemMinPadding: number;
  itemCornerRadius: number;
  maxSampleFillLinearGradientColorStops: (number | string)[];
  minSampleFillLinearGradientColorStops: (number | string)[];
}

const configDefault: AudioTrackLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  ...VTT_DOWNSAMPLE_CONFIG_DEFAULT,
  downsampleStrategy: 'max',
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,
    itemWidth: 5,
    itemMinPadding: 2,
    itemCornerRadius: 5,
    maxSampleFillLinearGradientColorStops: Constants.FILL_LINEAR_GRADIENT_AUDIO_PEAK,
    minSampleFillLinearGradientColorStops: ColorUtil.inverseFillGradient(Constants.FILL_LINEAR_GRADIENT_AUDIO_PEAK),
  }
}

export class AudioTrackLane extends VttTimelineLane<AudioTrackLaneConfig, AudioTrackLaneStyle, AudioVttCue, AudioVttFile> implements AudioTrackLaneApi {
  protected readonly _vttAdapter: VttAdapter<AudioVttFile> = new VttAdapter(AudioVttFile);

  protected readonly _onSettleLayout$: Subject<void> = new Subject<void>();
  protected readonly _itemsMap: Map<number, AudioTrackLaneItem> = new Map<number, AudioTrackLaneItem>();

  protected _timecodedGroup?: Konva.Group;
  protected _timecodedEventCatcher?: Konva.Rect;
  protected _itemsGroup?: Konva.Group;

  constructor(config: TimelineLaneConfigDefaultsExcluded<AudioTrackLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));

    this._vttAdapter.initFromConfig(this._config);
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = KonvaFactory.createGroup({
      ...timecodedRect
    });

    this._timecodedEventCatcher = KonvaFactory.createEventCatcherRect({
      ...this._timecodedGroup.getSize()
    });

    this._itemsGroup = KonvaFactory.createGroup({
      y: this._config.style.paddingTop,
      width: this._timecodedGroup.width(),
      height: this._config.style.height - (this._config.style.paddingTop + this._config.style.paddingBottom)
    });

    this._timecodedGroup.add(this._timecodedEventCatcher);
    this._timecodedGroup.add(this._itemsGroup);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 3);

    this._onSettleLayout$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: () => {
        this.settlePosition();
      }
    })

    combineLatest([this._onSettleLayout$, this._timeline!.onScroll$]).pipe(debounceTime(100)).pipe(takeUntil(this._destroyed$))
      .subscribe(() => {
        this.settleAll();
      });


    zip([this._videoController!.onVideoLoaded$.pipe(filter(p => !!p && !(p.isAttaching || p.isDetaching))), this._vttAdapter.vttFileLoaded$])
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: () => {
          this.createEntities()
        }
      })

    this._videoController!.onVideoLoading$.pipe(filter(p => !(p.isAttaching || p.isDetaching)), takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        this.clearContent();
      }
    })

    if (this.vttUrl) {
      this.loadVtt(this.vttUrl, this.getVttLoadOptions(this._config.axiosConfig));
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

    [this._timecodedGroup, this._timecodedEventCatcher, this._itemsGroup].forEach(node => {
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
    this._itemsGroup!.destroyChildren();
  }

  private getVisibleCuesForInterpolation(): AudioVttCue[] {
    let visibleTimeRange = this._timeline!.getVisibleTimeRange();
    let cues = this.vttFile!.findCues(visibleTimeRange.start, visibleTimeRange.end);
    return cues;
  }

  private createEntities() {
    if (!this.vttFile) {
      throw new Error('VTT file not loaded')
    }

    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?')
    }

    this.clearItems();

    let timecodedContainerWidth = this._timeline.getTimecodedContainerDimension().width;

    let numOfInterpolations = new Decimal(timecodedContainerWidth + this.style.itemMinPadding)
      .div(this.style.itemWidth + this.style.itemMinPadding)
      .floor().toNumber()

    let itemPadding = new Decimal(timecodedContainerWidth - numOfInterpolations * this.style.itemWidth)
      .div(numOfInterpolations - 1)
      .toNumber();

    let cuesInterpolations = this.resolveCuesInterpolations(numOfInterpolations, itemPadding);

    for (let i = 0; i < numOfInterpolations; i++) {
      let cue = cuesInterpolations.get(i);
      if (cue) {
        let itemPosition = this.resolveInterpolatedItemPosition(i, itemPadding);

        let audioTrackLaneItem = new AudioTrackLaneItem({
          x: itemPosition,
          width: this.style.itemWidth,
          audioVttCue: cue,
          style: {
            cornerRadius: this.style.itemCornerRadius,
            height: this._itemsGroup!.height(),
            visible: true,
            maxSampleFillLinearGradientColorStops: this.style.maxSampleFillLinearGradientColorStops,
            minSampleFillLinearGradientColorStops: this.style.minSampleFillLinearGradientColorStops,
          }
        });

        this._itemsMap.set(i, audioTrackLaneItem);
        this._itemsGroup!.add(audioTrackLaneItem.konvaNode);
      }
    }
  }

  private resolveCuesInterpolations(numOfInterpolations: number, paddingWidth: number): Map<number, AudioVttCue> {
    let visibleCues = this.getVisibleCuesForInterpolation();

    let barWidth = this.style.itemWidth;

    let cuesInterpolations: Map<number, AudioVttCue> = new Map<number, AudioVttCue>();

    for (let i = 0; i < numOfInterpolations; i++) {
      let isFirst = i === 0;
      let isLast = i === (numOfInterpolations - 1);
      let interpolationStartX: number;
      let interpolationEndX: number;

      if (isFirst) {
        // first interpolation
        interpolationStartX = 0;
        interpolationEndX = new Decimal(barWidth).plus(new Decimal(paddingWidth).div(2)).toNumber();

      } else if (isLast) {
        // last interpolation
        interpolationStartX = (new Decimal(i).mul(barWidth + paddingWidth).minus(new Decimal(paddingWidth).div(2))).toNumber();
        interpolationEndX = this._timeline!.getTimecodedContainerDimension().width;
      } else {
        // every interpolation in between first and last
        interpolationStartX = (new Decimal(i).mul(barWidth + paddingWidth).minus(new Decimal(paddingWidth).div(2))).toNumber();
        interpolationEndX = new Decimal(interpolationStartX).plus(barWidth).plus(paddingWidth).toNumber();
      }

      let interpolationStartTime = this._timeline!.timelineContainerPositionToTime(interpolationStartX);
      let interpolationEndTime = this._timeline!.timelineContainerPositionToTime(interpolationEndX);

      let cuesForInterpolation = visibleCues.filter(cue => {
        let inside = (cue.startTime >= interpolationStartTime) && (isLast ? cue.endTime <= interpolationEndTime : cue.endTime < interpolationEndTime)
        let leftIntersection = (cue.startTime < interpolationStartTime) && (cue.endTime >= interpolationStartTime && (isLast ? cue.endTime <= interpolationEndTime : cue.endTime < interpolationEndTime))
        let rightIntersection = ((cue.startTime >= interpolationStartTime) && (isLast ? cue.startTime <= interpolationEndTime : cue.startTime < interpolationEndTime)) && (cue.endTime > interpolationEndTime)
        let completeIntersection = (cue.startTime < interpolationStartTime) && (cue.endTime > interpolationEndTime);
        return inside || leftIntersection || rightIntersection || completeIntersection;
      });

      let cue: AudioVttCue = {
        index: i,
        id: `${i}`,
        text: '',
        minSample: 0,
        maxSample: 0,
        startTime: interpolationStartTime,
        endTime: interpolationEndTime
      }

      if (cuesForInterpolation.length > 0) {
        let minSampleSum = 0, maxSampleSum = 0;
        cuesForInterpolation.forEach(cue => {
          minSampleSum += cue.minSample;
          maxSampleSum += cue.maxSample;
        })

        cue = {
          ...cue,
          minSample: new Decimal(minSampleSum).div(cuesForInterpolation.length).toDecimalPlaces(3).toNumber(),
          maxSample: new Decimal(maxSampleSum).div(cuesForInterpolation.length).toDecimalPlaces(3).toNumber(),
        }
      }

      cuesInterpolations.set(i, cue);
    }

    return cuesInterpolations
  }

  private settleAll() {
    if (!this._videoController!.isVideoLoaded() || !this.vttFile) {
      return;
    }

    this.createEntities();
  }

  private resolveInterpolatedItemPosition(itemIndex: number, itemPadding: number) {
    return Math.abs(this._timeline!.getTimecodedFloatingHorizontals().x) + itemIndex * this.style.itemWidth + itemIndex * itemPadding;
  }

  private settlePosition() {
    if (!this._videoController!.isVideoLoaded() || !this.vttFile) {
      return;
    }

    if (this._itemsMap.size > 0) {
      let visibleTimeRange = this._timeline!.getVisibleTimeRange();
      for (let item of this._itemsMap.values()) {
        let cue = item.getAudioVttCue();
        if ((cue.startTime >= visibleTimeRange.start && cue.startTime <= visibleTimeRange.end) || (cue.endTime >= visibleTimeRange.start && cue.endTime <= visibleTimeRange.end)) {
          let x = this._timeline!.timeToTimelinePosition(cue.startTime);
          item.setPosition({x})
        } else {
          item.destroy()
        }
      }
    }
  }

  override destroy() {
    destroyer(
      ...this._itemsMap.values()
    )
    super.destroy();
  }
}
