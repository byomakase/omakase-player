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

import {BaseKonvaComponent, ComponentConfig, ConfigWithOptionalStyle} from '../layout/konva-component';
import Konva from 'konva';
import {Constants} from '../constants';
import {OnMeasurementsChange} from '../common/measurement';
import {Timeline} from './timeline';
import {BufferedTimespan} from '../video/video-controller';
import {filter, takeUntil} from 'rxjs';
import {VideoControllerApi} from '../video/video-controller-api';

export interface PlayheadStyle {
  visible: boolean;
  fill: string;
  lineWidth: number;

  symbolHeight: number;
  symbolYOffset: number;

  scrubberHeight: number;
  backgroundFill: string;
  backgroundOpacity: number;
  playProgressFill: string;
  playProgressOpacity: number;
  bufferedFill: string;
  bufferedOpacity: number;
}

export interface PlayheadConfig extends ComponentConfig<PlayheadStyle> {

}

const configDefault: PlayheadConfig = {
  style: {
    visible: true,
    fill: '#f43530',
    lineWidth: 2,

    symbolHeight: 15,
    symbolYOffset: 0,

    scrubberHeight: 15,
    backgroundFill: '#ffffff',
    backgroundOpacity: 0,

    playProgressFill: '#008cbc',
    playProgressOpacity: 0.5,

    bufferedFill: '#a2a2a2',
    bufferedOpacity: 1,
  }
}

export class Playhead extends BaseKonvaComponent<PlayheadConfig, PlayheadStyle, Konva.Group> implements OnMeasurementsChange {
  private _timeline: Timeline;
  private _videoController: VideoControllerApi;

  private _group: Konva.Group;
  private _bgRect: Konva.Rect;
  private _playProgressBgRect: Konva.Rect;

  private _playheadGroup: Konva.Group;
  private _playheadLine: Konva.Line;
  private _playheadSymbol: Konva.Line;

  private _bufferedGroup: Konva.Group;

  constructor(config: Partial<ConfigWithOptionalStyle<PlayheadConfig>>, timeline: Timeline, videoController: VideoControllerApi) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._timeline = timeline;
    this._videoController = videoController;

    this._group = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      listening: false
    });

    this._bgRect = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      height: this.style.scrubberHeight,
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
      listening: false
    });

    this._playProgressBgRect = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      height: this.style.scrubberHeight,
      fill: this.style.playProgressFill,
      opacity: this.style.playProgressOpacity,
      listening: false
    })

    this._playheadGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      visible: this.style.visible,
      listening: false
    });

    this._playheadLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: this.style.fill,
      strokeWidth: this.style.lineWidth,
      listening: false
    })

    this._playheadSymbol = this.createSymbol({
      height: this.style.symbolHeight,
      offsetY: this.style.symbolYOffset,
      color: this.style.fill,
    });

    this._bufferedGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      listening: false
    });

    this._group.add(this._bgRect);
    this._group.add(this._bufferedGroup);
    this._group.add(this._playProgressBgRect);

    this._playheadGroup.add(this._playheadLine)
    this._playheadGroup.add(this._playheadSymbol)

    this._group.add(this._playheadGroup);

    // react on timeline zoom
    this._timeline.onZoom$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.settleLayout();
    })

    this._videoController.onVideoLoading$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this._group.visible(false);
    })

    this._videoController.onVideoLoaded$.pipe(takeUntil(this._destroyed$)).pipe(filter(p => !!p)).subscribe((event) => {
      this._group.visible(true);
      this.doPlayProgress()
      this.doBufferingProgress()
    })

    this._videoController.onVideoTimeChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.doPlayProgress()
    })

    this._videoController.onSeeking$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.doPlayProgress()
      this.doBufferingProgress()
    })

    this._videoController.onBuffering$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.doBufferingProgress()
    })
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this.settleLayout();
  }

  getPlayheadPosition(): number {
    return this._playheadGroup.x();
  }

  protected settleLayout() {
    let timecodedGroupDimension = this._timeline.getTimecodedFloatingDimension();

    [this._group, this._bufferedGroup, this._playheadGroup].forEach(node => {
      node.setAttrs({
        ...timecodedGroupDimension
      })
    });

    [this._bgRect].forEach(node => {
      node.setAttrs({
        width: timecodedGroupDimension.width
      })
    })

    this._playheadLine.setAttrs({
      points: [0, 0, 0, timecodedGroupDimension.height]
    })

    this.doPlayProgress()
    this.doBufferingProgress()
  }

  private doPlayProgress() {
    if (!this._videoController.isVideoLoaded()) {
      return;
    }

    let x = this._timeline.timeToTimelinePosition(this._videoController.getCurrentTime());
    this._playProgressBgRect.width(x);
    this._playheadGroup.x(x);
  }

  private doBufferingProgress() {
    if (!this._videoController.isVideoLoaded()) {
      return;
    }

    let bufferedTimespans = this._videoController.getBufferedTimespans()

    if (bufferedTimespans && bufferedTimespans.length > 0) {
      if (this._bufferedGroup.hasChildren()) {
        let numOfBuffers = bufferedTimespans.length;
        let previousNumOfBuffers = this._bufferedGroup.getChildren().length;

        if (numOfBuffers === previousNumOfBuffers) {
          // move and resize buffers
          this._bufferedGroup.getChildren().forEach((bufferedRect, i) => {
            let bufferedTimespan = bufferedTimespans[i];
            let startX = this._timeline.timeToTimelinePosition(bufferedTimespan.start);
            let endX = this._timeline.timeToTimelinePosition(bufferedTimespan.end);
            bufferedRect.setAttrs({
              x: startX,
              width: endX - startX
            })
          })
        } else {
          // remove old and recreate
          this._bufferedGroup.getChildren().forEach(child => child.destroy());
          this.createBuffers(bufferedTimespans);
        }
      } else {
        this.createBuffers(bufferedTimespans);
      }
    }
  }

  private createBuffers(bufferedTimespans: BufferedTimespan[]) {
    bufferedTimespans.forEach(bufferedTimespan => {
      let startX = this._timeline.timeToTimelinePosition(bufferedTimespan.start);
      let endX = this._timeline.timeToTimelinePosition(bufferedTimespan.end);

      let bufferedRect = new Konva.Rect({
        x: startX,
        y: 0,
        width: endX - startX,
        height: this.style.scrubberHeight,
        fill: this.style.bufferedFill,
        opacity: this.style.bufferedOpacity,
        listening: false
      })
      this._bufferedGroup.add(bufferedRect)
    })
  }

  private createSymbol(config: {
    height: number,
    color: string,
    offsetY: number
  }): Konva.Line {
    let sideLength = 2 * config.height / Math.sqrt(3);
    let bottom = {x: 0, y: config.height - config.height / 2};
    let right = { x: sideLength / 2, y: 0 - config.height / 2};
    let left = { x: -sideLength / 2, y: 0 - config.height / 2};

    return new Konva.Line({
      points: [
        bottom.x, bottom.y,
        right.x, left.y,
        left.x, left.y,
      ],
      fill: config.color,
      closed: true,
      listening: false,
      offsetY: config.offsetY
    })
  }

}
