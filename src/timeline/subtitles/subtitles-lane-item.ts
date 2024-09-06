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
import {Comparable, OmakaseTextTrackCue, WithOptionalPartial} from '../../types';
import {nullifier} from '../../util/destroy-util';
import {KonvaFactory} from '../../factory/konva-factory';

export interface SubtitlesLaneItemStyle {
  height: number;
  fill: string;
  opacity: number;
  visible: boolean;
}

export interface SubtitlesLaneItemConfig extends ComponentConfig<SubtitlesLaneItemStyle> {
  cue: OmakaseTextTrackCue;
  x: number;
  width: number;
  listening?: boolean;
}

const configDefault: Omit<SubtitlesLaneItemConfig, 'cue' | 'x' | 'width'> = {
  listening: false,
  style: {
    height: 20,
    fill: 'rgba(255,73,145)',
    opacity: 1,
    visible: true,
  }
}

export class SubtitlesLaneItem extends BaseKonvaComponent<SubtitlesLaneItemConfig, SubtitlesLaneItemStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement, Comparable<SubtitlesLaneItem> {
  private _group: Konva.Group;
  private _bgRect: Konva.Rect;
  private _cue: OmakaseTextTrackCue;

  constructor(config: ConfigWithOptionalStyle<SubtitlesLaneItemConfig>,) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._cue = this.config.cue;

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

  getCue(): OmakaseTextTrackCue {
    return this._cue;
  }

  setCue(textTrackCue: OmakaseTextTrackCue) {
    this._cue = textTrackCue;
  }

  compareTo(o: SubtitlesLaneItem): number {
    return this._cue && o ? (
      this.getCue().id === o.getCue().id
      && this.getCue().startTime === o.getCue().startTime
      && this.getCue().endTime === o.getCue().endTime
    ) ? 0 : -1 : -1;
  }

  override destroy() {
    super.destroy();
    nullifier(
      this._cue
    );
  }
}
