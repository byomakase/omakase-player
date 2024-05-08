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
import Konva from 'konva';
import {catchError, filter, map, Observable, of, Subject, take, takeUntil} from 'rxjs';
import {SubtitlesVttFile} from '../../track';
import {Horizontals} from '../../common/measurement';
import {OmakaseTextTrackCue} from '../../types';
import {SubtitlesLaneItem} from './subtitles-lane-item';
import {Timeline} from '../timeline';
import {AxiosRequestConfig} from 'axios';
import {nullifier} from '../../util/destroy-util';
import {KonvaFactory} from '../../factory/konva-factory';
import {VideoControllerApi} from '../../video/video-controller-api';
import {SubtitlesLaneApi} from '../../api/subtitles-lane-api';

export interface SubtitlesLaneConfig extends TimelineLaneConfig<SubtitlesLaneStyle> {
  vttUrl?: string;
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

export class SubtitlesLane extends BaseTimelineLane<SubtitlesLaneConfig, SubtitlesLaneStyle> implements SubtitlesLaneApi {
  private readonly _itemsMap: Map<number, SubtitlesLaneItem> = new Map<number, SubtitlesLaneItem>();

  protected readonly _onSettleLayout$: Subject<void> = new Subject<void>();

  protected _vttUrl?: string;
  protected _vttFile?: SubtitlesVttFile;

  protected _timecodedGroup?: Konva.Group;
  protected _timecodedEventCatcher?: Konva.Rect;
  protected _itemsGroup?: Konva.Group;

  constructor(config: TimelineLaneConfigDefaultsExcluded<SubtitlesLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));

    this._vttUrl = this._config.vttUrl;
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

    if (this._vttUrl) {
      this.loadVtt(this._vttUrl, this._config.axiosConfig).subscribe();
    }

    this._videoController!.onVideoLoaded$.pipe(filter(p => !!p), takeUntil(this._destroyed$)).subscribe((event) => {
      this.clearContent();
    })
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
    nullifier(
      this._vttUrl,
      this._vttFile
    )
    this.clearItems();
  }

  private clearItems() {
    this._itemsMap.forEach(p => p.destroy())
    this._itemsMap.clear()
    this._itemsGroup?.destroyChildren();
  }

  private settlePosition() {
    if (!(this._timeline && this._timeline.isTimelineReady())) {
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


  loadVtt(vttUrl: string, axiosConfig?: AxiosRequestConfig): Observable<SubtitlesVttFile | undefined> {
    this._vttUrl = vttUrl;
    return this.fetchVttFile(this._vttUrl, axiosConfig).pipe(take(1))
  }

  private fetchVttFile(vttUrl: string, axiosConfig?: AxiosRequestConfig): Observable<SubtitlesVttFile | undefined> {
    return SubtitlesVttFile.create(vttUrl, axiosConfig).pipe(map(vttFile => {
      this._vttFile = vttFile;
      this.createFromVttFile(this._vttFile);
      return vttFile;
    }), catchError((err, caught) => {
      return of(void 0);
    }))
  }

  private createFromVttFile(vttFile: SubtitlesVttFile) {
    this.clearItems();

    if (!this._timeline) {
      throw new Error('SubtitlesLane not initalized. Maybe you forgot to add SubtitlesLane to Timeline?')
    }

    if (vttFile) {

      let cues = vttFile.cues;

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

    } else {
      console.error(`Could not create entities, VTT file not loaded yet`)
    }
  }
}
