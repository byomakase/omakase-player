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

import {BaseComponent, ComponentConfig, ComponentConfigStyleComposed} from "../../common/component";
import Konva from "konva";
import {Dimension, HasRectMeasurement, HorizontalMeasurement, OnMeasurementsChange, Position, RectMeasurement} from "../../common/measurement";
import {Comparable, OmakaseTextTrackCue} from "../../types";
import {WithOptionalPartial} from "../../types/types";
import {SubtitlesLane} from "./subtitles-lane";
import {takeUntil} from "rxjs";

export interface SubtitlesLaneItemStyle {
  height: number;
  fill: string;
  opacity: number;
  visible: boolean;
}

export interface SubtitlesLaneItemConfig extends ComponentConfig<SubtitlesLaneItemStyle> {
  textTrackCue: OmakaseTextTrackCue;
  x: number;
  width: number;
  listening?: boolean;
}

const configDefault: Partial<SubtitlesLaneItemConfig> = {
  listening: true,
  style: {
    height: 20,
    fill: 'rgba(255,73,145)',
    opacity: 1,
    visible: true,
  }
}

export class SubtitlesLaneItem extends BaseComponent<SubtitlesLaneItemConfig, SubtitlesLaneItemStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement, Comparable<SubtitlesLaneItem> {
  private x: number;
  private width: number;
  private listening: boolean;

  // region konva
  private group: Konva.Group;
  private backgroundRect: Konva.Rect;
  // endregion

  private textTrackCue: OmakaseTextTrackCue;

  private subtitlesLane: SubtitlesLane;

  constructor(config: ComponentConfigStyleComposed<SubtitlesLaneItemConfig>, subtitlesLane: SubtitlesLane) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this.textTrackCue = this.config.textTrackCue;
    this.x = this.config.x;
    this.width = this.config.width;
    this.listening = this.config.listening;

    this.subtitlesLane = subtitlesLane;

    this.subtitlesLane.onSettleLayout$.pipe(takeUntil(this.onDestroy$)).subscribe(() => {
      let currentMeasurement = this.subtitlesLane.resolveItemHorizontalMeasurement(this.getTextTrackCue());
      this.setHorizontalMeasurement(currentMeasurement)
    })
  }

  protected createCanvasNode(): Konva.Group {
    this.group = new Konva.Group({
      x: this.x,
      y: 0,
      width: this.width,
      height: this.style.height,
      visible: this.style.visible,
      listening: this.listening
    });

    this.backgroundRect = new Konva.Rect({
      x: 0,
      y: 0,
      width: this.group.width(),
      height: this.group.height(),
      fill: this.style.fill,
      opacity: this.style.opacity,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      hitStrokeWidth: 0
    })

    this.group.add(this.backgroundRect)

    return this.group;
  }

  onMeasurementsChange() {
    this.backgroundRect.size(this.group.getSize());
  }

  setPosition(position: WithOptionalPartial<Position, 'y'>) {
    this.x = position.x;
    if (this.isInitialized()) {
      this.group.position({
        x: this.x,
        y: 0
      })
    }
  }

  getPosition(): Position {
    return this.group.getPosition();
  }

  getDimension(): Dimension {
    return this.group.getSize();
  }

  getRect(): RectMeasurement {
    return {
      ...this.getPosition(),
      ...this.getDimension()
    };
  }

  getHorizontalMeasurement(): HorizontalMeasurement {
    return {
      x: this.x,
      width: this.width
    }
  }

  setHorizontalMeasurement(horizontalMeasurement: HorizontalMeasurement) {
    this.x = horizontalMeasurement.x;
    this.width = horizontalMeasurement.width;

    if (this.isInitialized()) {
      this.group.setAttrs({
        x: this.x,
        width: this.width
      })
    }
    this.onMeasurementsChange();
  }

  setVisible(visible: boolean) {
    this.style = {
      visible: visible
    };
    if (this.isInitialized()) {
      this.group.visible(visible);
    }
  }

  getTextTrackCue(): OmakaseTextTrackCue {
    return this.textTrackCue;
  }

  setTextTrackCue(textTrackCue: OmakaseTextTrackCue) {
    this.textTrackCue = textTrackCue;
  }

  compareTo(o: SubtitlesLaneItem): number {
    return this.textTrackCue && o ? (
      this.getTextTrackCue().id === o.getTextTrackCue().id
      && this.getTextTrackCue().startTime === o.getTextTrackCue().startTime
      && this.getTextTrackCue().endTime === o.getTextTrackCue().endTime
    ) ? 0 : -1 : -1;
  }

  destroy() {
    this.textTrackCue = void 0;
    this.subtitlesLane = void 0;
    super.destroy();
  }
}
