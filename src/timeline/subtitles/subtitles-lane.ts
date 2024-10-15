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

import { TIMELINE_LANE_CONFIG_DEFAULT, timelineLaneComposeConfig, TimelineLaneConfigDefaultsExcluded, TimelineLaneStyle, VTT_DOWNSAMPLE_CONFIG_DEFAULT } from '../timeline-lane';
import Konva from 'konva';
import { combineLatest, debounceTime, filter, Subject, take, takeUntil } from 'rxjs';
import { Horizontals } from '../../common/measurement';
import { OmakaseTextTrackCue, SubtitlesVttCue } from '../../types';
import { SubtitlesLaneItem } from './subtitles-lane-item';
import { Timeline } from '../timeline';
import { AxiosRequestConfig } from 'axios';
import { destroyer } from '../../util/destroy-util';
import { KonvaFactory } from '../../factory/konva-factory';
import { VideoControllerApi } from '../../video/video-controller-api';
import { SubtitlesLaneApi } from '../../api';
import { SubtitlesVttFile } from '../../vtt';
import { VttAdapter, VttAdapterConfig } from '../../common/vtt-adapter';
import { VttTimelineLane, VttTimelineLaneConfig } from '../vtt-timeline-lane';
import { UuidUtil } from '../../util/uuid-util';

export interface SubtitlesLaneConfig extends VttTimelineLaneConfig<SubtitlesLaneStyle>, VttAdapterConfig<SubtitlesVttFile> {
  axiosConfig?: AxiosRequestConfig;
  itemProcessFn?: (item: SubtitlesLaneItem, index: number) => void;
}

export interface SubtitlesLaneStyle extends TimelineLaneStyle {
  paddingTop: number;
  paddingBottom: number;
  subtitlesLaneItemOpacity: number;
  subtitlesLaneItemFill: string;
}

const configDefault: SubtitlesLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  ...VTT_DOWNSAMPLE_CONFIG_DEFAULT,
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,
    subtitlesLaneItemOpacity: 0.9,
    subtitlesLaneItemFill: 'rgba(255,73,145)'
  }
}

export class SubtitlesLane extends VttTimelineLane<SubtitlesLaneConfig, SubtitlesLaneStyle, SubtitlesVttCue, SubtitlesVttFile> implements SubtitlesLaneApi {
  protected readonly _vttAdapter: VttAdapter<SubtitlesVttFile> = new VttAdapter(SubtitlesVttFile);

  protected readonly _itemsMap: Map<number, SubtitlesLaneItem> = new Map<number, SubtitlesLaneItem>();
  protected readonly _onSettleLayout$: Subject<void> = new Subject<void>();

  protected _itemProcessFn?: (item: SubtitlesLaneItem, index: number) => void;

  protected _timecodedGroup?: Konva.Group;
  protected _timecodedEventCatcher?: Konva.Rect;
  protected _itemsGroup?: Konva.Group;

  protected _cueThresholdCoefficient: number = 0.5;

  constructor(config: TimelineLaneConfigDefaultsExcluded<SubtitlesLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));

    this._vttAdapter.initFromConfig(this._config);

    this._itemProcessFn = this._config.itemProcessFn;
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

    this._itemsGroup = new Konva.Group({
      y: this._config.style.paddingTop,
      width: this._timecodedGroup.width(),
      height: this._config.style.height - (this._config.style.paddingTop + this._config.style.paddingBottom)
    });

    this._timecodedGroup.add(this._timecodedEventCatcher);
    this._timecodedGroup.add(this._itemsGroup);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 2);

    this._onSettleLayout$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this.settlePosition();
    })

    combineLatest([this._onSettleLayout$]).pipe(debounceTime(100)).pipe(takeUntil(this._destroyed$))
      .subscribe(() => {
        this.settleAll();
      });

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
      this.loadVtt(this.vttUrl, this.getVttLoadOptions(this._config.axiosConfig)).subscribe();
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
    this._itemsGroup?.destroyChildren();
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

      let visibleTimeRange = this._timeline!.getVisibleTimeRange();
      this._itemsMap.forEach((subtitlesLaneItem) => {
        let firstCue = subtitlesLaneItem.getFirstCue();
        let lastCue = subtitlesLaneItem.getLastCue();

        if ((lastCue.endTime >= visibleTimeRange.start && firstCue.startTime <= visibleTimeRange.end)) {
          let squashedCue: OmakaseTextTrackCue = {
            id: "",
            startTime: firstCue.startTime,
            endTime: lastCue.endTime
          }
          let horizontals = this.resolveItemHorizontals(squashedCue);
          subtitlesLaneItem.setHorizontals(horizontals)
        } else {
          subtitlesLaneItem.destroy()
        }
      })
    }
  }

  private squashCues(cues: Array<OmakaseTextTrackCue>) {
    let pixelDuration = this.calculatePixelDuration(cues);
    let squashedCues: Array<Array<OmakaseTextTrackCue>> = [];

    let lastCue: OmakaseTextTrackCue = cues[0];
    let squashed: Array<OmakaseTextTrackCue> = [];
    cues.forEach((cue) => {
      if (cue.startTime - lastCue.endTime >= pixelDuration * this._cueThresholdCoefficient) {
        if (lastCue.endTime - squashed[0].startTime >= pixelDuration * this._cueThresholdCoefficient) {
          squashedCues.push(squashed);
          squashed = [];
        }
      }
      squashed.push(cue);
      lastCue = cue;
    })

    if (lastCue?.endTime - squashed[0].startTime >= pixelDuration * this._cueThresholdCoefficient) {
      squashedCues.push(squashed);
    }

    return squashedCues;
  }

  private calculatePixelDuration(cues: Array<OmakaseTextTrackCue>): number {
    let duration = 0;
    for (let i = 0; i < cues.length; i++) {
      let horizontals = this.resolveItemHorizontals(cues[i]);
      duration += (cues[i].endTime - cues[i].startTime) / horizontals.width;
    }

    return duration / cues.length;
  }

  resolveItemHorizontals(textTrackCue: OmakaseTextTrackCue): Horizontals {
    let startTimeX = this._timeline!.constrainTimelinePosition(this._timeline!.timeToTimelinePosition(textTrackCue.startTime));
    let endTimeX = this._timeline!.constrainTimelinePosition(this._timeline!.timeToTimelinePosition(textTrackCue.endTime));
    return {
      x: startTimeX,
      width: endTimeX - startTimeX
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

    let squashedCues = this.squashCues(this.vttFile.cues);

    squashedCues.forEach((cues, index) => {
      let squashedCue: OmakaseTextTrackCue = {
        id: "",
        startTime: cues[0].startTime,
        endTime: cues[cues.length - 1].endTime
      }
      let horizontals = this.resolveItemHorizontals(squashedCue);

      let subtitlesLaneItem = new SubtitlesLaneItem({
        ...horizontals,
        lane: this,
        cues: cues,
        style: {
          height: this._itemsGroup!.height(),
          fill: this.style.subtitlesLaneItemFill,
          opacity: this.style.subtitlesLaneItemOpacity
        },
        listening: true
      });
      this._itemsMap.set(cues[0].startTime, subtitlesLaneItem);
      this._itemsGroup!.add(subtitlesLaneItem.konvaNode);

      if (this._itemProcessFn) {
        this._itemProcessFn(subtitlesLaneItem, index)
      }
    })
  }

  public getTimeline() {
    if (!this._timeline) {
      throw new Error("Timeline is not loaded!");
    }

    return this._timeline;
  }

  override destroy() {
    destroyer(
      ...this._itemsMap.values()
    )
    super.destroy();
  }
}
