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

import {BaseComponent, ComponentConfig, ComponentConfigStyleComposed, composeConfigAndDefault} from "../common/component";
import Konva from "konva";
import {Constants} from "../constants";
import {OnMeasurementsChange} from "../common/measurement";
import {Timeline} from "./timeline";
import {BufferedTimespan} from "../video/video-controller";
import {ShapeUtil} from "../util/shape-util";
import {takeUntil} from "rxjs";
import {VideoControllerApi} from "../video/video-controller-api";

export interface PlayheadStyle {
  visible: boolean;
  fill: string;
  lineWidth: number;
  symbolHeight: number;
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
    scrubberHeight: 15,
    backgroundFill: '#ffffff',
    backgroundOpacity: 0,

    playProgressFill: '#008cbc',
    playProgressOpacity: 0.5,

    bufferedFill: '#a2a2a2',
    bufferedOpacity: 1,
  }
}

export class Playhead extends BaseComponent<PlayheadConfig, PlayheadStyle, Konva.Group> implements OnMeasurementsChange {
  // region config

  // endregion

  protected timeline: Timeline;
  protected videoController: VideoControllerApi;

  // region konva
  protected group: Konva.Group;
  protected background: Konva.Rect;

  protected playProgressBackground: Konva.Rect;

  protected playheadGroup: Konva.Group;
  protected playheadLine: Konva.Line;
  protected playheadSymbol: Konva.Line;

  protected bufferedGroup: Konva.Group;

  // endregion

  constructor(config: Partial<ComponentConfigStyleComposed<PlayheadConfig>>, timeline: Timeline, videoController: VideoControllerApi) {
    super(composeConfigAndDefault(config, configDefault));

    this.timeline = timeline;
    this.videoController = videoController;
  }

  protected createCanvasNode(): Konva.Group {
    this.group = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      listening: false
    });

    this.background = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      height: this.style.scrubberHeight,
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
      listening: false
    });

    this.playProgressBackground = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      height: this.style.scrubberHeight,
      fill: this.style.playProgressFill,
      opacity: this.style.playProgressOpacity,
      listening: false
    })

    this.playheadGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      visible: this.style.visible,
      listening: false
    });

    this.playheadLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: this.style.fill,
      strokeWidth: this.style.lineWidth,
      listening: false
    })

    this.playheadSymbol = ShapeUtil.createTriangle({
      ...Constants.POSITION_TOP_LEFT,
      height: this.style.symbolHeight,
      color: this.style.fill
    });

    this.bufferedGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      listening: false
    });

    this.group.add(this.background);
    this.group.add(this.bufferedGroup);
    this.group.add(this.playProgressBackground);

    this.playheadGroup.add(this.playheadLine)
    this.playheadGroup.add(this.playheadSymbol)

    this.group.add(this.playheadGroup);


    return this.group;
  }

  protected afterCanvasNodeInit() {
    this.settleLayout();

    // react on timeline zoom
    this.timeline.onZoom$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.settleLayout();
    })

    this.videoController.onVideoLoading$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.group.visible(false);
    })

    this.videoController.onVideoLoaded$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.group.visible(true);
      this.doPlayProgress()
      this.doBufferingProgress()
    })

    this.videoController.onVideoTimeChange$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.doPlayProgress()
    })

    this.videoController.onSeeking$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.doPlayProgress()
      this.doBufferingProgress()
    })

    this.videoController.onBuffering$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.doBufferingProgress()
    })
  }

  onMeasurementsChange() {
    this.settleLayout();
  }

  getPlayheadPosition(): number {
    return this.playheadGroup.x();
  }

  protected settleLayout() {
    let timecodedGroupDimension = this.timeline.getTimecodedGroupDimension();

    [this.group, this.bufferedGroup, this.playheadGroup].forEach(node => {
      node.setAttrs({
        ...timecodedGroupDimension
      })
    });

    [this.background].forEach(node => {
      node.setAttrs({
        width: timecodedGroupDimension.width
      })
    })

    this.playheadLine.setAttrs({
      points: [0, 0, 0, timecodedGroupDimension.height]
    })

    this.doPlayProgress()
    this.doBufferingProgress()
  }

  private doPlayProgress() {
    let x = this.timeline.timeToTimelinePosition(this.videoController.getCurrentTime());

    this.playProgressBackground.width(x);
    this.playheadGroup.x(x);
  }

  private doBufferingProgress() {
    let bufferedTimespans = this.videoController.getBufferedTimespans()

    if (bufferedTimespans && bufferedTimespans.length > 0) {
      if (this.bufferedGroup.hasChildren()) {
        let numOfBuffers = bufferedTimespans.length;
        let previousNumOfBuffers = this.bufferedGroup.getChildren().length;

        if (numOfBuffers === previousNumOfBuffers) {
          // move and resize buffers
          this.bufferedGroup.getChildren().forEach((bufferedRect, i) => {
            let bufferedTimespan = bufferedTimespans[i];
            let startX = this.timeline.timeToTimelinePosition(bufferedTimespan.start);
            let endX = this.timeline.timeToTimelinePosition(bufferedTimespan.end);
            bufferedRect.setAttrs({
              x: startX,
              width: endX - startX
            })
          })
        } else {
          // remove old and recreate
          this.bufferedGroup.getChildren().forEach(child => child.destroy());
          this.createBuffers(bufferedTimespans);
        }
      } else {
        this.createBuffers(bufferedTimespans);
      }
    }
  }

  private createBuffers(bufferedTimespans: BufferedTimespan[]) {
    bufferedTimespans.forEach(bufferedTimespan => {
      let startX = this.timeline.timeToTimelinePosition(bufferedTimespan.start);
      let endX = this.timeline.timeToTimelinePosition(bufferedTimespan.end);

      let bufferedRect = new Konva.Rect({
        x: startX,
        y: 0,
        width: endX - startX,
        height: this.style.scrubberHeight,
        fill: this.style.bufferedFill,
        opacity: this.style.bufferedOpacity,
        listening: false
      })
      this.bufferedGroup.add(bufferedRect)
    })
  }

}
