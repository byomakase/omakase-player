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
import Decimal from 'decimal.js';
import {HasRectMeasurement, Horizontals, OnMeasurementsChange, RectMeasurement} from '../../common/measurement';
import {animate} from '../../util/animation-util';
import {ScrollbarScrollEvent, ScrollbarZoomEvent} from '../../types';
import {positionTopLeft} from '../../constants';
import {WindowUtil} from '../../util/window-util';
import {filter, Observable, of, Subject, takeUntil} from 'rxjs';
import {KonvaFactory} from '../../konva/konva-factory';

export interface ScrollableHorizontally {
  scrollHorizontallyToPercent(percent: number): void;

  getHorizontalScrollPercent(): number;

  getScrollHandleHorizontals(scrollbarWidth: number): Horizontals;
}

export interface ScrollbarStyle {
  height: number;
  backgroundFill: string;
  backgroundFillOpacity: number;
  handleBarFill: string;
  handleBarOpacity: number;
  handleOpacity: number;
}

export interface ScrollbarConfig extends ComponentConfig<ScrollbarStyle> {
  x: number;
  y: number;
  width: number;
  zoomMax: number;
  scrollStepNumberOfDivisions: number;
  scrollEasingDuration: number;
}

const configDefault: ScrollbarConfig = {
  x: 0,
  y: 0,
  width: 0,
  zoomMax: 2000,
  scrollStepNumberOfDivisions: 10,
  scrollEasingDuration: 100,
  style: {
    height: 20,
    backgroundFill: '#000000',
    backgroundFillOpacity: 0.3,
    handleBarFill: '#01a6f0',
    handleBarOpacity: 1,
    handleOpacity: 1,
  },
};

export class Scrollbar extends BaseKonvaComponent<ScrollbarConfig, ScrollbarStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement {
  public readonly onScroll$: Subject<ScrollbarScrollEvent> = new Subject<ScrollbarScrollEvent>();
  public readonly onZoom$: Subject<ScrollbarZoomEvent> = new Subject<ScrollbarZoomEvent>();

  private _group: Konva.Group;
  private _handleGroup: Konva.Group;
  private _bgRect: Konva.Rect;
  private _handleBar: Konva.Rect;
  private _leftZoomHandle: Konva.Circle;
  private _rightZoomHandle: Konva.Circle;
  private _minHandleBarWidth: number;

  constructor(config: Partial<ConfigWithOptionalStyle<ScrollbarConfig>>) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._group = KonvaFactory.createGroup({
      x: this.config.x,
      y: this.config.y,
      width: this.config.width,
      height: this.style.height,
    });

    this._bgRect = KonvaFactory.createRect({
      ...positionTopLeft,
      width: this._group.width(),
      height: this.style.height,
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundFillOpacity,
    });

    this._handleGroup = KonvaFactory.createGroup({
      ...positionTopLeft,
      width: this._group.width(),
      height: this.style.height,
    });

    this._handleBar = KonvaFactory.createRect({
      ...positionTopLeft,
      width: this._handleGroup.width(),
      height: this.style.height,
      fill: this.style.handleBarFill,
      opacity: this.style.handleBarOpacity,
      draggable: true,
    });

    this._leftZoomHandle = new Konva.Circle({
      ...positionTopLeft,
      fill: this.style.handleBarFill,
      radius: this.style.height / 2,
      y: this.style.height / 2,
      opacity: this.style.handleOpacity,
      draggable: true,
    });

    this._rightZoomHandle = new Konva.Circle({
      ...positionTopLeft,
      fill: this.style.handleBarFill,
      radius: this.style.height / 2,
      y: this.style.height / 2,
      opacity: this.style.handleOpacity,
      draggable: true,
    });

    this._handleGroup.add(this._bgRect);
    this._handleGroup.add(this._handleBar);

    this._group.add(this._bgRect);
    this._group.add(this._handleGroup);

    this._handleGroup.add(this._leftZoomHandle);
    this._handleGroup.add(this._rightZoomHandle);

    this._styleAdapter.onChange$
      .pipe(
        takeUntil(this._destroyed$),
        filter((p) => !!p)
      )
      .subscribe((style) => {
        this.onStyleChange();
      });

    this._group.on('click', (event) => {
      this.clickScrollTo(this._group.getRelativePointerPosition().x).subscribe();
    });

    this._handleBar.on('dragstart dragmove dragend', (event) => {
      let newPosition = this._handleBar.getPosition();
      let newX = this.getConstrainedHandleBarX(newPosition.x);
      this._handleBar.setAttrs({
        x: newX,
        y: 0,
      });
      this.syncLeftRightHandles();

      if (this._handleBar.getRelativePointerPosition().x >= 0 && this._handleBar.getRelativePointerPosition().x <= this._handleBar.width()) {
        this.onScroll$.next({
          scrollPercent: this.getScrollHandlePercent(),
        });
      }
    });

    let zoomInConfig = {
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 0.1,
    };

    let zoomOutConfig = {
      scaleX: 1,
      scaleY: 1,
      duration: 0.1,
    };

    this._leftZoomHandle.on('mouseover', (event) => {
      this._leftZoomHandle.to({
        ...zoomInConfig,
      });
      WindowUtil.cursor('ew-resize');
    });

    this._leftZoomHandle.on('mouseout', (event) => {
      this._leftZoomHandle.to({
        ...zoomOutConfig,
      });
      WindowUtil.cursor('default');
    });

    this._rightZoomHandle.on('mouseover', (event) => {
      this._rightZoomHandle.to({
        ...zoomInConfig,
      });
      WindowUtil.cursor('ew-resize');
    });

    this._rightZoomHandle.on('mouseout', (event) => {
      this._rightZoomHandle.to({
        ...zoomOutConfig,
      });
      WindowUtil.cursor('default');
    });

    let constrainLeftHandleX = (wantedX: number): number => {
      let newX = wantedX;
      if (newX < 0) {
        newX = 0;
      } else if (this._rightZoomHandle.x() - wantedX <= this._minHandleBarWidth) {
        newX = this._rightZoomHandle.x() - this._minHandleBarWidth;
      }
      return newX;
    };

    this._leftZoomHandle.on('dragstart dragmove dragend', (event) => {
      let newPosition = this._leftZoomHandle.getPosition();
      let newX = constrainLeftHandleX(newPosition.x);
      this._leftZoomHandle.setAttrs({
        x: newX,
        y: this.style.height / 2,
      });
      this._handleBar.setAttrs({
        x: newX,
        width: this._rightZoomHandle.x() - newX,
      });

      this.onZoom$.next({
        zoomPercent: this.getZoomPercent(),
        zoomFocus: Math.round(new Decimal(this._rightZoomHandle.x()).mul(100).div(this._group.width()).toNumber()),
      });
    });

    let constrainRightHandleX = (wantedX: number): number => {
      let newX = wantedX;
      let scrollbarWidth = this._group.width();
      if (newX > scrollbarWidth) {
        newX = scrollbarWidth;
      } else if (wantedX - this._leftZoomHandle.x() <= this._minHandleBarWidth) {
        newX = this._leftZoomHandle.x() + this._minHandleBarWidth;
      }
      return newX;
    };

    this._rightZoomHandle.on('dragstart dragmove dragend', (event) => {
      let newPosition = this._rightZoomHandle.getPosition();
      let newX = constrainRightHandleX(newPosition.x);
      this._rightZoomHandle.setAttrs({
        x: newX,
        y: this.style.height / 2,
      });
      this._handleBar.setAttrs({
        width: newX - this._leftZoomHandle.x(),
      });
      this.onZoom$.next({
        zoomPercent: this.getZoomPercent(),
        zoomFocus: Math.round(new Decimal(this._leftZoomHandle.x()).mul(100).div(this._group.width()).toNumber()),
      });
    });

    this._handleBar.on('dragstart dragmove mousedown', (event) => {
      WindowUtil.cursor('grab');
    });

    this._handleBar.on('dragend mouseup', (event) => {
      WindowUtil.cursor('default');
    });

    this._minHandleBarWidth = this.calculateHandleBarWidthFromZoomRatioPercent();
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this._bgRect.width(this._group.width());
    this._handleGroup.width(this._group.width());
    this._minHandleBarWidth = this.calculateHandleBarWidthFromZoomRatioPercent();
  }

  onStyleChange() {
    this._group.setAttrs({
      height: this.style.height,
    });

    this._bgRect.setAttrs({
      height: this.style.height,
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundFillOpacity,
    });

    this._handleGroup.setAttrs({
      height: this.style.height,
    });

    this._handleBar.setAttrs({
      height: this.style.height,
      fill: this.style.handleBarFill,
      opacity: this.style.handleBarOpacity,
    });

    this._leftZoomHandle.setAttrs({
      fill: this.style.handleBarFill,
      radius: this.style.height / 2,
      y: this.style.height / 2,
      opacity: this.style.handleOpacity,
    });

    this._rightZoomHandle.setAttrs({
      fill: this.style.handleBarFill,
      radius: this.style.height / 2,
      y: this.style.height / 2,
      opacity: this.style.handleOpacity,
    });
  }

  private getScrollHandleMaxX() {
    return this._group.width() - this._handleBar.width();
  }

  private getConstrainedHandleBarX(wantedX: number): number {
    let newScrollHandleX = wantedX;
    if (newScrollHandleX < 0) {
      newScrollHandleX = 0;
    } else if (newScrollHandleX + this._handleBar.width() > this._group.width()) {
      newScrollHandleX = this.getScrollHandleMaxX();
    }
    return newScrollHandleX;
  }

  private clickScrollTo(x: number): Observable<void> {
    let scrollStep = this._group.width() / this.config.scrollStepNumberOfDivisions;
    if (x >= this._handleBar.x() && x <= this._handleBar.x() + this._handleBar.width()) {
      // clicked on scroll handle
      return of(void 0);
    } else {
      let isScrollHandleToRight = this._handleBar.x() > x;
      let oneStepMoveX = this._handleBar.x() + scrollStep * (isScrollHandleToRight ? -1 : 1);
      if (isScrollHandleToRight) {
        oneStepMoveX = oneStepMoveX < x ? x : oneStepMoveX;
      } else {
        oneStepMoveX = oneStepMoveX + this._handleBar.width() > x ? x - this._handleBar.width() : oneStepMoveX;
      }
      return this.scrollToEased(oneStepMoveX);
    }
  }

  private scrollTo(x: number) {
    this._handleBar.x(this.getConstrainedHandleBarX(x));
    this.syncLeftRightHandles();
    this.onScroll$.next({
      scrollPercent: this.getScrollHandlePercent(),
    });
  }

  private scrollToEased(x: number): Observable<void> {
    return new Observable((o$) => {
      let currentX = this._handleBar.x();
      let newX = this.getConstrainedHandleBarX(x);

      animate({
        duration: this.config.scrollEasingDuration,
        startValue: currentX,
        endValue: newX,
        onUpdateHandler: (frame, value) => {
          this.scrollTo(value);
        },
        onCompleteHandler: (frame, value) => {
          o$.next();
          o$.complete();
        },
      });
    });
  }

  private calculateHandleBarWidthFromZoomRatioPercent(): number {
    return this._group.width() > 0 ? new Decimal(this._group.width()).mul(100).div(this.config.zoomMax).toNumber() : 0;
  }

  getZoomPercent(): number {
    return this._group.width() === this._handleBar.width() ? 100 : new Decimal(this._group.width()).mul(100).div(this._handleBar.width()).toNumber();
  }

  getScrollHandlePercent(): number {
    let scrollHandleX = this._handleBar.x();
    return scrollHandleX === 0
      ? 0
      : new Decimal(this._handleBar.x())
          .div(this._group.width() - this._handleBar.width())
          .mul(100)
          .toNumber();
  }

  updateScrollHandle(scrollable: ScrollableHorizontally) {
    let horizontals = scrollable.getScrollHandleHorizontals(this._group.width());

    this._handleBar.setAttrs({
      ...horizontals,
    });

    this.syncLeftRightHandles();
  }

  private syncLeftRightHandles() {
    this._leftZoomHandle.x(this._handleBar.x());
    this._rightZoomHandle.x(this._handleBar.x() + this._handleBar.width());
  }

  getRect(): RectMeasurement {
    return {
      ...this._group.getPosition(),
      ...this._group.getSize(),
    };
  }
}
