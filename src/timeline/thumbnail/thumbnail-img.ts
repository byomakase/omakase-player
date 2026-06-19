/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
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

import Konva from 'konva';
import {BaseKonvaComponent, type ComponentConfig, type ConfigWithOptionalStyle} from '../layout/konva-component';
import {TIMELINE} from '../../constants';
import type {Dimension, HasRectMeasurement, OnMeasurementsChange, Position, RectMeasurement} from '../model';
import type {Comparable} from '../../common/capabilities';
import {KonvaFactory} from '../konva/konva-factory';
import {Observable, Subject, takeUntil} from 'rxjs';
import {freeObserver, nextCompleteObserver} from '../../util/rxjs-util';
import type {Thumbnail, ThumbnailState} from '../../media';
import {ObserverBreaker} from '../../common/observer-breaker';

export interface ThumbnailImgStyle {
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  visible: boolean;
}

export interface ThumbnailImgConfig extends ComponentConfig<ThumbnailImgStyle> {
  listening: boolean;
}

export interface ThumbnailImgState {}

const configDefault: ThumbnailImgConfig = {
  listening: false,
  style: {
    ...TIMELINE.positionTopLeft,
    ...TIMELINE.dimensionZero,
    stroke: 'rgba(255,73,145)',
    strokeWidth: 5,
    visible: false,
  },
};

export enum ThumbnailImgEventType {
  TIMELINE_THUMBNAIL_IMAGE_LOADING = 'TIMELINE_THUMBNAIL_IMAGE_LOADING',
  TIMELINE_THUMBNAIL_IMAGE_LOADED = 'TIMELINE_THUMBNAIL_IMAGE_LOADED',
  TIMELINE_THUMBNAIL_CLICK = 'TIMELINE_THUMBNAIL_CLICK',
  TIMELINE_THUMBNAIL_MOUSE_ENTER = 'TIMELINE_THUMBNAIL_MOUSE_ENTER',
  TIMELINE_THUMBNAIL_MOUSE_LEAVE = 'TIMELINE_THUMBNAIL_MOUSE_LEAVE',
  TIMELINE_THUMBNAIL_MOUSE_MOVE = 'TIMELINE_THUMBNAIL_MOUSE_MOVE',
}

export interface ThumbnailImgEventData {
  state: ThumbnailImgState;
}

export type ThumbnailImgEventTypeDataMap = {
  [ThumbnailImgEventType.TIMELINE_THUMBNAIL_IMAGE_LOADING]: ThumbnailImgEventData;
  [ThumbnailImgEventType.TIMELINE_THUMBNAIL_IMAGE_LOADED]: ThumbnailImgEventData;
  [ThumbnailImgEventType.TIMELINE_THUMBNAIL_CLICK]: ThumbnailImgEventData;
  [ThumbnailImgEventType.TIMELINE_THUMBNAIL_MOUSE_ENTER]: ThumbnailImgEventData;
  [ThumbnailImgEventType.TIMELINE_THUMBNAIL_MOUSE_LEAVE]: ThumbnailImgEventData;
  [ThumbnailImgEventType.TIMELINE_THUMBNAIL_MOUSE_MOVE]: ThumbnailImgEventData;
};

export type ThumbnailImgEvent = {
  [K in ThumbnailImgEventType]: {
    type: K;
    data: ThumbnailImgEventTypeDataMap[K];
  };
}[keyof ThumbnailImgEventTypeDataMap];

export class ThumbnailImg extends BaseKonvaComponent<ThumbnailImgConfig, ThumbnailImgStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement, Comparable<ThumbnailImg> {
  private readonly _onEvent$: Subject<ThumbnailImgEvent> = new Subject<ThumbnailImgEvent>();

  private _group: Konva.Group;
  private _bgRect: Konva.Rect;
  private _image?: Konva.Image;

  protected _imageLoadBreaker = new ObserverBreaker();

  constructor(config: Partial<ConfigWithOptionalStyle<ThumbnailImgConfig>>) {
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

    let isMouseOver = false;

    let doMouseEnter = () => {
      isMouseOver = true;
      this._onEvent$.next({
        type: ThumbnailImgEventType.TIMELINE_THUMBNAIL_MOUSE_ENTER,
        data: {
          state: this.state,
        },
      });
    }

    let doMouseLeave = () => {
      isMouseOver = false;
      this._onEvent$.next({
        type: ThumbnailImgEventType.TIMELINE_THUMBNAIL_MOUSE_LEAVE,
        data: {
          state: this.state,
        },
      });
    }

    this._group.on('mouseover mouseenter touchstart', (event) => {
      if (!isMouseOver) {
        doMouseEnter();
      }
    });

    this._group.on('mouseout mouseleave touchend', (event) => {
      if (isMouseOver) {
        doMouseLeave();
      }
    });

    this._group.on('mousemove', (event) => {
      this._onEvent$.next({
        type: ThumbnailImgEventType.TIMELINE_THUMBNAIL_MOUSE_MOVE,
        data: {
          state: this.state,
        },
      });

      if (!isMouseOver) {
        doMouseEnter();
      }
    });

    this._group.on('click touchend', (event) => {
      this._onEvent$.next({
        type: ThumbnailImgEventType.TIMELINE_THUMBNAIL_CLICK,
        data: {
          state: this.state,
        },
      });
    });
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this._bgRect.size(this._group.getSize());
  }

  loadImage(image: Konva.Image | Observable<Konva.Image>): Observable<Konva.Image> {
    return new Observable<Konva.Image>((subscriber) => {
      this._imageLoadBreaker.break();

      this._onEvent$.next({
        type: ThumbnailImgEventType.TIMELINE_THUMBNAIL_IMAGE_LOADING,
        data: {
          state: this.state,
        },
      });

      this._image?.destroy();

      let onImageLoaded = (image: Konva.Image) => {
        this._image = image;

        let dimension: Dimension = this._image.getSize();

        this.style = {
          ...dimension,
        };

        this._group.setAttrs({
          ...dimension,
        });

        this._bgRect.setAttrs({
          ...this._image.getSize(),
        });

        this._group.add(this._image);

        this.onMeasurementsChange();

        this._onEvent$.next({
          type: ThumbnailImgEventType.TIMELINE_THUMBNAIL_IMAGE_LOADED,
          data: {
            state: this.state,
          },
        });

        nextCompleteObserver(subscriber, this._image);
      };

      if (image instanceof Observable) {
        image.pipe(takeUntil(this._imageLoadBreaker.observer)).subscribe((image) => {
          onImageLoaded(image);
        });
      } else {
        onImageLoaded(image);
      }
    });
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

  getRect(): RectMeasurement {
    return {
      ...this.getPosition(),
      ...this.getDimension(),
    };
  }

  compareTo(o: ThumbnailImg): number {
    return this.image && o && o.image ? (JSON.stringify(this.image.getAttrs()) === JSON.stringify(o.image.getAttrs()) ? 0 : -1) : -1;
  }

  get image(): Konva.Image | undefined {
    return this._image;
  }

  get onEvent$(): Observable<ThumbnailImgEvent> {
    return this._onEvent$.asObservable();
  }

  get state(): ThumbnailImgState {
    return {};
  }

  override destroy() {
    for (let eventListenersKey in this._group.eventListeners) {
      this._group.removeEventListener(eventListenersKey);
    }

    freeObserver(this._onEvent$);

    this._imageLoadBreaker.destroy();

    super.destroy();
  }
}

export interface ThumbnailTrackImgState {
  thumbnail: ThumbnailState;
}

export class ThumbnailTrackImg extends ThumbnailImg {
  private _thumbnail: Thumbnail;

  constructor(config: Partial<ConfigWithOptionalStyle<ThumbnailImgConfig>>, thumbnail: Thumbnail) {
    super(config);
    this._thumbnail = thumbnail;
  }

  get state(): ThumbnailTrackImgState {
    return {
      ...super.state,
      thumbnail: this._thumbnail.state,
    };
  }

  get thumbnail(): Thumbnail {
    return this._thumbnail;
  }

  compareTo(o: ThumbnailTrackImg): number {
    return super.compareTo(o) === 0 ? (this.thumbnail && o && o.thumbnail ? (this.thumbnail.id === o.thumbnail.id ? 0 : -1) : -1) : -1;
  }

  override destroy() {
    super.destroy();
  }
}
