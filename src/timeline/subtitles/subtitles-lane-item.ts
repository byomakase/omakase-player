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
import {Comparable, OmakaseTextTrackCue, SubtitlesChartEvent} from '../../types';
import {nullifier} from '../../util/destroy-util';
import {KonvaFactory} from '../../konva/konva-factory';
import {Subject} from 'rxjs/internal/Subject';
import {SubtitlesLane} from './subtitles-lane';

export interface SubtitlesLaneItemStyle {
  height: number;
  fill: string;
  opacity: number;
  visible: boolean;
}

export interface SubtitlesLaneItemConfig extends ComponentConfig<SubtitlesLaneItemStyle> {
  subtitlesLane: SubtitlesLane;
  cues: OmakaseTextTrackCue[];
  x: number;
  width: number;
  listening?: boolean;
}

const configDefault: Omit<SubtitlesLaneItemConfig, 'subtitlesLane' | 'cues' | 'x' | 'width'> = {
  listening: false,
  style: {
    height: 20,
    fill: 'rgba(255,73,145)',
    opacity: 1,
    visible: true,
  },
};

export class SubtitlesLaneItem
  extends BaseKonvaComponent<SubtitlesLaneItemConfig, SubtitlesLaneItemStyle, Konva.Group>
  implements OnMeasurementsChange, HasRectMeasurement, Comparable<SubtitlesLaneItem>
{
  public readonly onClick$: Subject<SubtitlesChartEvent> = new Subject<SubtitlesChartEvent>();

  private _group: Konva.Group;
  private _bgRect: Konva.Rect;
  private _cues: OmakaseTextTrackCue[];

  private _subtitlesLane: SubtitlesLane;

  constructor(config: ConfigWithOptionalStyle<SubtitlesLaneItemConfig>) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._subtitlesLane = this.config.subtitlesLane;

    this._cues = this.config.cues;

    this._group = new Konva.Group({
      x: this.config.x,
      y: 0,
      width: this.config.width,
      height: this.style.height,
      visible: this.style.visible,
      listening: this.config.listening,
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
      hitStrokeWidth: 0,
    });

    this._group.add(this._bgRect);

    this._group.on('click', (event) => {
      let cue = this.findCueOnTime(this._subtitlesLane.getTimecodedPointerPositionTime());
      if (cue) {
        this.onClick$.next({
          cue: cue,
        });
      }
    });
  }

  protected findCueOnTime(timelinePositionTime: number): OmakaseTextTrackCue | undefined {
    return this._cues.find((cue) => timelinePositionTime >= cue.startTime && timelinePositionTime <= cue.endTime);
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
      ...this.getDimension(),
    };
  }

  getHorizontals(): Horizontals {
    return {
      x: this._group.x(),
      width: this._group.width(),
    };
  }

  setHorizontals(horizontals: Horizontals) {
    this._group.setAttrs({
      x: horizontals.x,
      width: horizontals.width,
    });
    this.onMeasurementsChange();
  }

  getCues(): OmakaseTextTrackCue[] {
    return this._cues;
  }

  setVisible(visible: boolean) {
    this.style = {
      visible: visible,
    };
    this._group.visible(visible);
  }

  compareTo(o: SubtitlesLaneItem): number {
    return this._cues && o ? (JSON.stringify(this.getCues()) === JSON.stringify(o.getCues()) ? 0 : -1) : -1;
  }

  override destroy() {
    super.destroy();
    nullifier(this._cues);
  }
}
