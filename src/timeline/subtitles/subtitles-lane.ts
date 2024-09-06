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
import {filter, Subject, take, takeUntil} from 'rxjs';
import {Horizontals} from '../../common/measurement';
import {OmakaseTextTrackCue, SubtitlesVttCue} from '../../types';
import {SubtitlesLaneItem} from './subtitles-lane-item';
import {Timeline} from '../timeline';
import {AxiosRequestConfig} from 'axios';
import {destroyer} from '../../util/destroy-util';
import {KonvaFactory} from '../../factory/konva-factory';
import {VideoControllerApi} from '../../video/video-controller-api';
import {SubtitlesLaneApi} from '../../api';
import {SubtitlesVttFile} from '../../vtt';
import {VttAdapter, VttAdapterConfig} from '../../common/vtt-adapter';
import {VttTimelineLane} from '../vtt-timeline-lane';

export interface SubtitlesLaneConfig extends TimelineLaneConfig<SubtitlesLaneStyle>, VttAdapterConfig<SubtitlesVttFile> {
  axiosConfig?: AxiosRequestConfig;
}

export interface SubtitlesLaneStyle extends TimelineLaneStyle {
  paddingTop: number;
  paddingBottom: number;
  subtitlesLaneItemOpacity: number;
  subtitlesLaneItemFill: string;
}

const configDefault: SubtitlesLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
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

  protected _timecodedGroup?: Konva.Group;
  protected _timecodedEventCatcher?: Konva.Rect;
  protected _itemsGroup?: Konva.Group;

  constructor(config: TimelineLaneConfigDefaultsExcluded<SubtitlesLaneConfig>) {
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

    this._itemsGroup = new Konva.Group({
      y: this.style.paddingTop,
      width: this._timecodedGroup.width(),
      height: this._timecodedGroup.height() - (this.style.paddingTop + this.style.paddingBottom)
    });

    this._timecodedGroup.add(this._timecodedEventCatcher);
    this._timecodedGroup.add(this._itemsGroup);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 2);

    this._onSettleLayout$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this.settlePosition();
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

  private settlePosition() {
    if (!this._videoController!.isVideoLoaded() || !this.vttFile) {
      return;
    }

    if (this._itemsMap.size > 0) {
      this._itemsMap.forEach((subtitlesLaneItem) => {
        let cue = subtitlesLaneItem.getCue();
        let horizontals = this.resolveItemHorizontals(cue);
        subtitlesLaneItem.setHorizontals(horizontals);
      })
    }
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

    let cues = this.vttFile.cues;

    cues.forEach(cue => {
      let horizontals = this.resolveItemHorizontals(cue);

      let subtitlesLaneItem = new SubtitlesLaneItem({
        ...horizontals,
        cue: cue,
        style: {
          height: this._itemsGroup!.height(),
          fill: this.style.subtitlesLaneItemFill,
          opacity: this.style.subtitlesLaneItemOpacity
        }
      });
      this._itemsMap.set(cue.startTime, subtitlesLaneItem);
      this._itemsGroup!.add(subtitlesLaneItem.konvaNode);
    })

  }

  override destroy() {
    destroyer(
      ...this._itemsMap.values()
    )
    super.destroy();
  }
}
