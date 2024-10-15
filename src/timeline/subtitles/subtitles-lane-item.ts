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

import {BaseKonvaComponent, ComponentConfig, ConfigWithOptionalStyle} from '../../layout/konva-component';
import Konva from 'konva';
import {Dimension, HasRectMeasurement, Horizontals, OnMeasurementsChange, Position, RectMeasurement} from '../../common/measurement';
import {Comparable, OmakaseTextTrackCue, SubtitlesChartEvent, WithOptionalPartial} from '../../types';
import {nullifier} from '../../util/destroy-util';
import {KonvaFactory} from '../../factory/konva-factory';
import { Subject } from 'rxjs/internal/Subject';
import { SubtitlesLane } from './subtitles-lane';

export interface SubtitlesLaneItemStyle {
  height: number;
  fill: string;
  opacity: number;
  visible: boolean;
}

export interface SubtitlesLaneItemConfig extends ComponentConfig<SubtitlesLaneItemStyle> {
  lane: SubtitlesLane;
  cues: Array<OmakaseTextTrackCue>;
  x: number;
  width: number;
  listening?: boolean;
}

const configDefault: Omit<SubtitlesLaneItemConfig, 'lane' | 'cues' | 'x' | 'width'> = {
  listening: false,
  style: {
    height: 20,
    fill: 'rgba(255,73,145)',
    opacity: 1,
    visible: true,
  }
}

export class SubtitlesLaneItem extends BaseKonvaComponent<SubtitlesLaneItemConfig, SubtitlesLaneItemStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement, Comparable<SubtitlesLaneItem> {
  public readonly onClick$: Subject<SubtitlesChartEvent> = new Subject<SubtitlesChartEvent>();

  private _group: Konva.Group;
  private _bgRect: Konva.Rect;
  private _cues: Array<OmakaseTextTrackCue>;

  private _lane: SubtitlesLane;

  constructor(config: ConfigWithOptionalStyle<SubtitlesLaneItemConfig>,) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._lane = this.config.lane;

    this._cues = this.config.cues;

    this._group = new Konva.Group({
      x: this.config.x,
      y: 0,
      width: this.config.width,
      height: this.style.height,
      visible: this.style.visible,
      listening: this.config.listening
    });

    this._bgRect = KonvaFactory.createRect({
      x: 0,
      y: 0,
      width: this._group.width(),
      height: this._group.height(),
      fill: this.style.fill,
      opacity: this.style.opacity,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      hitStrokeWidth: 0
    })

    this._group.add(this._bgRect)

    this._group.on('click', (event) => {
      let cue = this.findCue();
      if (cue) {
        this.onClick$.next({
          cue: cue
        });
      } 
    });
  }

  protected findCue(): OmakaseTextTrackCue | undefined {
    if (!this._lane) {
      throw new Error("Lane does not exist!");
    }

    let timelinePositionX = this._lane.getTimeline().getTimecodedFloatingRelativePointerPosition().x;
    let timelinePositionTime = this._lane.getTimeline().timelinePositionToTime(timelinePositionX);
    
    let subCue = this._cues.find(cue => timelinePositionTime >= cue.startTime && timelinePositionTime <= cue.endTime);

    return subCue;
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this._bgRect.size(this._group.getSize());
  }

  getPosition(): Position {
    return this._group.getPosition();
  }

  getDimension(): Dimension {
    return this._group.getSize();
  }

  getRect(): RectMeasurement {
    return {
      ...this.getPosition(),
      ...this.getDimension()
    };
  }

  getHorizontals(): Horizontals {
    return {
      x: this._group.x(),
      width: this._group.width()
    }
  }

  setHorizontals(horizontals: Horizontals) {
    this._group.setAttrs({
      x: horizontals.x,
      width: horizontals.width
    })
    this.onMeasurementsChange();
  }

  setVisible(visible: boolean) {
    this.style = {
      visible: visible
    };
    this._group.visible(visible);
  }

  getCues(): Array<OmakaseTextTrackCue> {
    return this._cues;
  }

  setCues(textTrackCues: Array<OmakaseTextTrackCue>) {
    this._cues = textTrackCues;
  }

  getFirstCue(): OmakaseTextTrackCue {
    return this.getCues()[0];
  }

  getLastCue(): OmakaseTextTrackCue {
    return this.getCues()[this.getCues().length - 1];
  }

  compareTo(o: SubtitlesLaneItem): number {
    return this._cues && o ? (
      this.getFirstCue().id === o.getFirstCue().id
      && this.getFirstCue().startTime === o.getFirstCue().startTime
      && this.getLastCue().endTime === o.getLastCue().endTime
    ) ? 0 : -1 : -1;
  }

  override destroy() {
    super.destroy();
    nullifier(
      this._cues
    );
  }
}
