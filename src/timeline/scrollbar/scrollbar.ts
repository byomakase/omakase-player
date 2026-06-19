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
import Decimal from 'decimal.js';
import {WindowUtil} from '../../util/window-util';
import {filter, Observable, of, Subject, takeUntil} from 'rxjs';
import type {HasRectMeasurement, Horizontals, OnMeasurementsChange, RectMeasurement} from '../model';
import {BaseKonvaComponent2} from '../layout/konva-component';
import type {ConfigAndStyle} from '../timeline-api';
import {omitKeys} from '../../util/object-util';
import {KonvaFactory} from '../konva/konva-factory';
import {TIMELINE} from '../../constants';
import  {type OmpProvider} from '../../omp-provider';
import {affectsStyledElement, type StyledElementWithId, Ui} from '../../ui';
import {animate} from '../animation-util';
import {CryptoUtil} from '../../util/crypto-util';

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

export interface ScrollbarConfig {
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
};

export const SCROLLBAR_STYLE_DEFAULT: ScrollbarStyle = {
  height: 20,
  backgroundFill: '#000000',
  backgroundFillOpacity: 0.3,
  handleBarFill: '#01a6f0',
  handleBarOpacity: 1,
  handleOpacity: 1,
};

export enum ScrollbarEventType {
  SCROLLBAR_SCROLL = 'SCROLLBAR_SCROLL',
  SCROLLBAR_ZOOM = 'SCROLLBAR_ZOOM',
}

export type ScrollbarEventTypeDataMap = {
  [ScrollbarEventType.SCROLLBAR_SCROLL]: {
    scrollPercent: number;
  };
  [ScrollbarEventType.SCROLLBAR_ZOOM]: {
    zoomPercent: number;
    zoomFocus: number;
  };
};

export type ScrollbarEvent = {
  [K in ScrollbarEventType]: {
    type: K;
    data: ScrollbarEventTypeDataMap[K];
  };
}[keyof ScrollbarEventTypeDataMap];

export class Scrollbar extends BaseKonvaComponent2<Konva.Group> implements OnMeasurementsChange, HasRectMeasurement {
  private readonly _onEvent$: Subject<ScrollbarEvent> = new Subject<ScrollbarEvent>();

  protected _ui: Ui;

  protected _config: ScrollbarConfig;
  protected _providedStyle?: Partial<ScrollbarStyle> | undefined;
  protected _styledElement: StyledElementWithId<ScrollbarStyle>;
  protected _style: ScrollbarStyle;
  protected _initialStyle?: ScrollbarStyle;

  private _group: Konva.Group;
  private _handleGroup: Konva.Group;
  private _bgRect: Konva.Rect;
  private _handleBar: Konva.Rect;
  private _leftZoomHandle: Konva.Circle;
  private _rightZoomHandle: Konva.Circle;
  private _minHandleBarWidth: number;

  constructor(ompProvider: OmpProvider, configAndStyle?: ConfigAndStyle<ScrollbarConfig, ScrollbarStyle>) {
    super();

    this._ui = ompProvider.ui;

    this._config = {
      ...configDefault,
      ...omitKeys(configAndStyle, 'style'),
    };
    this._providedStyle = configAndStyle?.style;

    this._styledElement = {
      id: CryptoUtil.uuid(),
      classes: [this._ui.resolveStyleClass('Scrollbar')],
    };
    if (this._providedStyle) {
      this.updateStyle(this._providedStyle)
    }

    this._style = this._ui.resolveStyle<ScrollbarStyle>(this._styledElement) as ScrollbarStyle;
    this._initialStyle = {
      ...this._style,
    };

    this._ui.onEvent$
      .pipe(filter((event) => affectsStyledElement(event, this._styledElement!)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.handleStyleUpdate();
      });

    this._group = KonvaFactory.createGroup({
      x: this._config.x,
      y: this._config.y,
      width: this._config.width,
      height: this._style.height,
    });

    this._bgRect = KonvaFactory.createRect({
      ...TIMELINE.positionTopLeft,
      width: this._group.width(),
      height: this._style.height,
      fill: this._style.backgroundFill,
      opacity: this._style.backgroundFillOpacity,
    });

    this._handleGroup = KonvaFactory.createGroup({
      ...TIMELINE.positionTopLeft,
      width: this._group.width(),
      height: this._style.height,
    });

    this._handleBar = KonvaFactory.createRect({
      ...TIMELINE.positionTopLeft,
      width: this._handleGroup.width(),
      height: this._style.height,
      fill: this._style.handleBarFill,
      opacity: this._style.handleBarOpacity,
      draggable: true,
    });

    this._leftZoomHandle = KonvaFactory.createCircle({
      ...TIMELINE.positionTopLeft,
      fill: this._style.handleBarFill,
      radius: this._style.height / 2,
      y: this._style.height / 2,
      opacity: this._style.handleOpacity,
      draggable: true,
    });

    this._rightZoomHandle = KonvaFactory.createCircle({
      ...TIMELINE.positionTopLeft,
      fill: this._style.handleBarFill,
      radius: this._style.height / 2,
      y: this._style.height / 2,
      opacity: this._style.handleOpacity,
      draggable: true,
    });

    this._handleGroup.add(this._bgRect);
    this._handleGroup.add(this._handleBar);

    this._group.add(this._bgRect);
    this._group.add(this._handleGroup);

    this._handleGroup.add(this._leftZoomHandle);
    this._handleGroup.add(this._rightZoomHandle);

    this._group.on('click', (event) => {
      let rpp = this._group.getRelativePointerPosition();
      if (rpp) {
        this.clickScrollTo(rpp.x).subscribe();
      }
    });

    this._handleBar.on('dragstart dragmove dragend', (event) => {
      let newPosition = this._handleBar.getPosition();
      let newX = this.getConstrainedHandleBarX(newPosition.x);
      this._handleBar.setAttrs({
        x: newX,
        y: 0,
      });
      this.syncLeftRightHandles();

      let rpp = this._handleBar.getRelativePointerPosition();
      if (rpp) {
        if (rpp.x >= 0 && rpp.x <= this._handleBar.width()) {
          this._onEvent$.next({
            type: ScrollbarEventType.SCROLLBAR_SCROLL,
            data: {
              scrollPercent: this.getScrollHandlePercent(),
            },
          });
        }
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
        y: this._style.height / 2,
      });
      this._handleBar.setAttrs({
        x: newX,
        width: this._rightZoomHandle.x() - newX,
      });

      this._onEvent$.next({
        type: ScrollbarEventType.SCROLLBAR_ZOOM,
        data: {
          zoomPercent: this.getZoomPercent(),
          zoomFocus: Math.round(new Decimal(this._rightZoomHandle.x()).mul(100).div(this._group.width()).toNumber()),
        },
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
        y: this._style.height / 2,
      });
      this._handleBar.setAttrs({
        width: newX - this._leftZoomHandle.x(),
      });

      this._onEvent$.next({
        type: ScrollbarEventType.SCROLLBAR_ZOOM,
        data: {
          zoomPercent: this.getZoomPercent(),
          zoomFocus: Math.round(new Decimal(this._leftZoomHandle.x()).mul(100).div(this._group.width()).toNumber()),
        },
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

  get onEvent$(): Observable<ScrollbarEvent> {
    return this._onEvent$.asObservable();
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this._bgRect.width(this._group.width());
    this._handleGroup.width(this._group.width());
    this._minHandleBarWidth = this.calculateHandleBarWidthFromZoomRatioPercent();
  }

  protected handleStyleUpdate(): void {
    this._style = this._ui!.resolveStyle(this._styledElement) as ScrollbarStyle;

    this._bgRect.setAttrs({
      height: this._style.height,
      fill: this._style.backgroundFill,
      opacity: this._style.backgroundFillOpacity,
    });

    this._handleGroup.setAttrs({
      height: this._style.height,
    });

    this._handleBar.setAttrs({
      height: this._style.height,
      fill: this._style.handleBarFill,
      opacity: this._style.handleBarOpacity,
    });

    this._leftZoomHandle.setAttrs({
      fill: this._style.handleBarFill,
      radius: this._style.height / 2,
      y: this._style.height / 2,
      opacity: this._style.handleOpacity,
    });

    this._rightZoomHandle.setAttrs({
      fill: this._style.handleBarFill,
      radius: this._style.height / 2,
      y: this._style.height / 2,
      opacity: this._style.handleOpacity,
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
    let scrollStep = this._group.width() / this._config.scrollStepNumberOfDivisions;
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
    this._onEvent$.next({
      type: ScrollbarEventType.SCROLLBAR_SCROLL,
      data: {
        scrollPercent: this.getScrollHandlePercent(),
      },
    });
  }

  private scrollToEased(x: number): Observable<void> {
    return new Observable((o$) => {
      let currentX = this._handleBar.x();
      let newX = this.getConstrainedHandleBarX(x);

      animate({
        duration: this._config.scrollEasingDuration,
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
    return this._group.width() > 0 ? new Decimal(this._group.width()).mul(100).div(this._config.zoomMax).toNumber() : 0;
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

  updateStyle(style: Partial<ScrollbarStyle>) {
    this._ui.updateStyleRule({
      id: this._styledElement.id,
      style: {
        ...style,
      },
    });
  }
}
