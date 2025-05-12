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
import {Dimension, HasRectMeasurement, OnMeasurementsChange, Position, RectMeasurement} from '../../common/measurement';
import {Comparable, ThumbnailEvent, ThumbnailVttCue} from '../../types';
import {Constants} from '../../constants';
import {Subject} from 'rxjs';
import {completeUnsubscribeSubjects} from '../../util/rxjs-util';
import {nullifier} from '../../util/destroy-util';
import {KonvaFactory} from '../../konva/konva-factory';

export interface ThumbnailStyle {
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  visible: boolean;
}

export interface ThumbnailConfig extends ComponentConfig<ThumbnailStyle> {
  listening: boolean;
}

const configDefault: ThumbnailConfig = {
  listening: false,
  style: {
    ...Constants.positionTopLeft,
    ...Constants.dimensionZero,
    stroke: 'rgba(255,73,145)',
    strokeWidth: 5,
    visible: false,
  },
};

export class Thumbnail extends BaseKonvaComponent<ThumbnailConfig, ThumbnailStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement, Comparable<Thumbnail> {
  public readonly onClick$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();
  public readonly onMouseOver$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();
  public readonly onMouseMove$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();
  public readonly onMouseOut$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();
  public readonly onMouseLeave$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();

  private _cue?: ThumbnailVttCue;

  private _group: Konva.Group;
  private _bgRect: Konva.Rect;
  private _image?: Konva.Image;

  constructor(config: Partial<ConfigWithOptionalStyle<ThumbnailConfig>>) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._group = new Konva.Group({
      x: this.style.x,
      y: this.style.y,
      width: this.style.width,
      height: this.style.height,
      visible: this.style.visible,
      listening: this.config.listening,
    });

    this._bgRect = KonvaFactory.createRect({
      x: 0,
      y: 0,
      width: this._group.width(),
      height: this._group.height(),
      strokeWidth: this.style.strokeWidth,
      stroke: this.style.stroke,
    });

    this._group.add(this._bgRect);

    this._group.on('click', (event) => {
      this.onClick$.next({
        thumbnail: this,
      });
    });

    this._group.on('mouseover', (event) => {
      this.onMouseOver$.next({
        thumbnail: this,
      });
    });

    this._group.on('mousemove', (event) => {
      this.onMouseMove$.next({
        thumbnail: this,
      });
    });

    this._group.on('mouseout', (event) => {
      this.onMouseOut$.next({
        thumbnail: this,
      });
    });

    this._group.on('mouseleave', (event) => {
      this.onMouseLeave$.next({
        thumbnail: this,
      });
    });

    this._group.on('touchstart', (event) => {
      this.onMouseOver$.next({
        thumbnail: this,
      });
    });

    this._group.on('touchend', (event) => {
      this.onClick$.next({
        thumbnail: this,
      });
      this.onMouseOut$.next({
        thumbnail: this,
      });
    });
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  override destroy() {
    nullifier(this._cue);

    for (let eventListenersKey in this._group.eventListeners) {
      this._group.removeEventListener(eventListenersKey);
    }

    completeUnsubscribeSubjects(this.onClick$, this.onMouseOver$, this.onMouseMove$, this.onMouseOut$, this.onMouseLeave$);

    super.destroy();
  }

  onMeasurementsChange() {
    this._bgRect.size(this._group.getSize());
  }

  setImage(image: Konva.Image) {
    if (this._image) {
      this._image.destroy();
    }

    this._image = image;

    this.style = {
      width: image.width(),
      height: image.height(),
    };

    this._group.setAttrs({
      ...this._image.getSize(),
    });

    this._bgRect.setAttrs({
      ...this._image.getSize(),
    });

    this._group.add(this._image);
  }

  setVisible(visible: boolean) {
    this.style = {
      visible: visible,
    };
    this._group.visible(visible);
  }

  setPosition(position: Position) {
    this.style = {
      ...position,
    };
    this._group.position(position);
  }

  setVisibleAndX(visible: boolean, x: number) {
    this.style = {
      visible: visible,
      x: x,
    };
    this._group.setAttrs({
      visible: visible,
      x: x,
    });
  }

  getPosition(): Position {
    return this._group.getPosition();
  }

  getDimension(): Dimension {
    return this._group.getSize();
  }

  setDimension(dimension: Dimension) {
    this.style = {
      ...dimension,
    };
    this._group.size(dimension);
    this.onMeasurementsChange();
  }

  getRect(): RectMeasurement {
    return {
      ...this.getPosition(),
      ...this.getDimension(),
    };
  }

  compareTo(o: Thumbnail): number {
    return this._cue && o && o.cue ? (this._cue.url === o.cue.url ? 0 : -1) : -1;
  }

  set cue(value: ThumbnailVttCue | undefined) {
    this._cue = value;
  }

  get cue(): ThumbnailVttCue | undefined {
    return this._cue;
  }

  get image(): Konva.Image | undefined {
    return this._image;
  }
}
