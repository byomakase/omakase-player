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

import {concatMap, filter, Observable, Subject, takeUntil} from 'rxjs';
import {ClickEvent, MouseEnterEvent, MouseLeaveEvent} from '../types';
import {BaseKonvaComponent, ComponentConfig, ConfigWithOptionalStyle, KonvaComponent} from '../layout/konva-component';
import Konva from 'konva';
import {OnMeasurementsChange} from '../common';
import {konvaUnlistener} from '../util/konva-util';
import {WindowUtil} from '../util/window-util';
import {ImageUtil} from '../util/image-util';
import {KonvaFactory} from '../konva/konva-factory';
import {isNullOrUndefined} from '../util/object-util';
import {nextCompleteObserver, passiveObservable} from '../util/rxjs-util';

export interface TimelineNodeStyle {
  backgroundFill?: string;
  backgroundOpacity?: number;
  backgroundBorderRadius?: number | number[];
}

export interface TimelineNodeConfig<S extends TimelineNodeStyle> extends ComponentConfig<S> {
  /**
   * If set to true node listens to events
   */
  listening?: boolean;
}

/**
 * Custom component that can be added to Timeline
 */
export interface TimelineNode extends KonvaComponent<TimelineNodeConfig<TimelineNodeStyle>, TimelineNodeStyle, Konva.Group>, OnMeasurementsChange {
  /**
   * Fires on mouse click
   */
  onClick$: Observable<ClickEvent>;

  /**
   * Fires on mouse enter
   */
  onMouseEnter$: Observable<MouseEnterEvent>;

  /**
   * Fires on mouse leave
   */
  onMouseLeave$: Observable<MouseLeaveEvent>;
}

export abstract class BaseTimelineNode<C extends TimelineNodeConfig<S>, S extends TimelineNodeStyle> extends BaseKonvaComponent<C, S, Konva.Group> implements TimelineNode {
  public readonly onClick$: Subject<ClickEvent> = new Subject<ClickEvent>();
  public readonly onMouseEnter$: Subject<MouseEnterEvent> = new Subject<MouseEnterEvent>();
  public readonly onMouseLeave$: Subject<MouseLeaveEvent> = new Subject<MouseLeaveEvent>();

  protected _group: Konva.Group;
  protected _bgRect: Konva.Rect;

  protected constructor(config: C) {
    super({
      ...config,
    });

    this._group = KonvaFactory.createGroup();

    this._bgRect = KonvaFactory.createRect({
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
      cornerRadius: this.style.backgroundBorderRadius,
      listening: false,
    });

    this._group.add(this._bgRect);

    if (this.config.listening) {
      this._group.on('click', (event) => {
        this.onClick$.next({
          mouseEvent: event.evt,
          cancelableEvent: event,
        });
      });

      this._group.on('mouseenter', (event) => {
        this.onMouseEnter$.next({
          mouseEvent: event.evt,
          cancelableEvent: event,
        });
      });

      this._group.on('mouseleave', (event) => {
        this.onMouseLeave$.next({
          mouseEvent: event.evt,
          cancelableEvent: event,
        });
      });

      this._group.on('mouseover', (event) => {
        WindowUtil.cursor('pointer');
      });

      this._group.on('mouseleave', (event) => {
        WindowUtil.cursor('default');
      });
    }

    this._styleAdapter.onChange$
      .pipe(
        takeUntil(this._destroyed$),
        filter((p) => !!p)
      )
      .subscribe((styles) => {
        this.onStyleChange();
      });
  }

  onMeasurementsChange(): void {
    this._bgRect.size(this._group.getSize());
  }

  protected override provideKonvaNode(): Konva.Group {
    return this._group;
  }

  protected onStyleChange() {
    this._bgRect.setAttrs({
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
      cornerRadius: this.style.backgroundBorderRadius,
    });
  }

  override destroy() {
    super.destroy();

    konvaUnlistener(this._group);
  }
}

export interface TextLabelStyle extends TimelineNodeStyle {
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fill?: string;
  align?: 'left' | 'right' | 'center';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  wrap?: 'word' | 'char' | 'none';
  padding?: number;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  textAreaStretch?: boolean;
}

export interface TextLabelConfig extends TimelineNodeConfig<TextLabelStyle> {
  /**
   * Text to display
   */
  text?: string;
}

/**
 * Timeline text label. Can be added  to timeline lane. {@link TimelineLaneApi}
 */
export class TextLabel extends BaseTimelineNode<TextLabelConfig, TextLabelStyle> {
  private _konvaText: Konva.Text;

  constructor(config: ConfigWithOptionalStyle<TextLabelConfig>) {
    super({
      ...config,
      style: {
        ...{},
        ...config.style,
      },
    });

    this._konvaText = new Konva.Text({
      text: this.config.text,
      fontSize: this.style.fontSize,
      fontFamily: this.style.fontFamily,
      fontStyle: this.style.fontStyle,
      fill: this.style.fill,
      align: this.style.align,
      verticalAlign: this.style.verticalAlign,
      wrap: this.style.wrap,
      padding: this.style.padding,
      offsetX: this.style.offsetX,
      offsetY: this.style.offsetY,
      opacity: this.style.opacity,
    });

    this._group.add(this._konvaText);
  }

  override onMeasurementsChange() {
    super.onMeasurementsChange();

    if (isNullOrUndefined(this.style.textAreaStretch) || this.style.textAreaStretch === true) {
      this._konvaText.setAttrs({
        width: this._group.width(),
        height: this._group.height(),
      });
    } else {
      let x: number = 0;
      switch (this.style.align) {
        case 'center':
          x = this._group.width() / 2 - this._konvaText.width() / 2;
          break;
        case 'right':
          x = this._group.width() - this._konvaText.width();
          break;
      }

      let y: number = 0;
      switch (this.style.verticalAlign) {
        case 'middle':
          y = this._group.height() / 2 - this._konvaText.height() / 2;
          break;
        case 'bottom':
          y = this._group.height() - this._konvaText.height();
          break;
      }

      this._konvaText.setAttrs({
        x: x,
        y: y,
      });
    }
  }

  protected override onStyleChange() {
    super.onStyleChange();

    this._konvaText.setAttrs({
      fontSize: this.style.fontSize,
      fontFamily: this.style.fontFamily,
      fontStyle: this.style.fontStyle,
      fill: this.style.fill,
      align: this.style.align,
      verticalAlign: this.style.verticalAlign,
      wrap: this.style.wrap,
      padding: this.style.padding,
      offsetX: this.style.offsetX,
      offsetY: this.style.offsetY,
      opacity: this.style.opacity,
    });
  }

  /**
   * Sets new text to display
   * @param value
   */
  set text(value: string) {
    this._konvaText.text(value);
    this.onMeasurementsChange(); // needed if text width doesn't stretch to group
  }

  get text(): string {
    return this._konvaText.text();
  }
}

export interface ImageButtonStyle extends TimelineNodeStyle {}

export type ImageButtonImageConfig = {
  /**
   * Image source
   */
  src: string;

  /**
   * Image width
   */
  width?: number;

  /**
   * Image height
   */
  height?: number;
};

export interface ImageButtonConfig extends TimelineNodeConfig<ImageButtonStyle>, ImageButtonImageConfig {
  /**
   * Image source
   */
  src: string;

  /**
   * Image width
   */
  width?: number;

  /**
   * Image height
   */
  height?: number;
}

/**
 * Timeline image button. Can be added  to timeline lane. {@link TimelineLaneApi}
 */
export class ImageButton extends BaseTimelineNode<ImageButtonConfig, ImageButtonStyle> {
  protected _konvaImage?: Konva.Image;
  protected _loadImageQueue = new Subject<ImageButtonImageConfig>();
  protected _currentImageConfig?: ImageButtonImageConfig;

  constructor(config: ConfigWithOptionalStyle<ImageButtonConfig>) {
    super({
      ...config,
      style: {
        ...{},
        ...config.style,
      },
    });

    this._loadImageQueue
      .pipe(takeUntil(this._destroyed$))
      .pipe(concatMap((config) => this.loadImage(config)))
      .subscribe();

    this.setImage(this.config);
  }

  private loadImage(imageButtonImageConfig: ImageButtonImageConfig): Observable<ImageButtonImageConfig | undefined> {
    return passiveObservable<ImageButtonImageConfig | undefined>((observer) => {
      ImageUtil.createKonvaImage(imageButtonImageConfig.src).subscribe({
        next: (image) => {
          if (this._konvaImage) {
            this._konvaImage.destroy();
          }

          this._konvaImage = image;

          this._konvaImage.setAttrs({
            width: imageButtonImageConfig.width ? imageButtonImageConfig.width : image.getAttrs().image.naturalWidth,
            height: imageButtonImageConfig.height ? imageButtonImageConfig.height : image.getAttrs().image.naturalHeight,
          });

          this._group.add(this._konvaImage);
          this._currentImageConfig = imageButtonImageConfig;

          nextCompleteObserver(observer, {
            src: imageButtonImageConfig.src,
            width: this._konvaImage.width(),
            height: this._konvaImage.height(),
          });
        },
        error: (err) => {
          if (this._konvaImage) {
            this._konvaImage.destroy();
            this._currentImageConfig = undefined;
          }
          console.error(err);
          nextCompleteObserver(observer);
        },
      });
    });
  }

  /**
   * Sets new image to display
   * @param config
   */
  setImage(config: ImageButtonImageConfig) {
    this._loadImageQueue.next(config);
  }

  /**
   * Gets current image config
   * @returns ImageButtonImageConfig
   */
  getImage() {
    if (this._currentImageConfig) {
      return {...this._currentImageConfig};
    } else {
      return undefined;
    }
  }
}
