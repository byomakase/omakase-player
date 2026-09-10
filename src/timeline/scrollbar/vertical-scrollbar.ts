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
import type {HasRectMeasurement, OnMeasurementsChange, RectMeasurement, Verticals} from '../model';
import {BaseKonvaComponent2} from '../layout/konva-component';
import type {ConfigAndStyle} from '../timeline-api';
import {omitKeys} from '../../util/object-util';
import {KonvaFactory} from '../konva/konva-factory';
import {TIMELINE} from '../../constants';
import {type OmpProvider} from '../../omp-provider';
import {affectsStyledElement, type StyledElementWithId, Ui} from '../../ui';
import {animate} from '../animation-util';
import {CryptoUtil} from '../../util/crypto-util';
import type {TimelineSlotApi} from '../timeline-slot-api';

export interface ScrollableVertically {
  scrollVerticallyToPercent(percent: number): void;

  getVerticalScrollPercent(): number;

  getScrollHandleVerticals(scrollbarHeight: number): Verticals;
}

/**
 * Adapts any TimelineSlotApi (e.g. timeline.main) to ScrollableVertically, so a VerticalScrollbar
 * can be driven directly by a slot's existing scroll API without the slot itself needing to know
 * anything about scrollbar-widget-specific geometry.
 */
export class TimelineSlotVerticalScrollAdapter implements ScrollableVertically {
  constructor(private _slot: TimelineSlotApi) {}

  scrollVerticallyToPercent(percent: number): void {
    this._slot.scroll.scrollTo(percent);
  }

  getVerticalScrollPercent(): number {
    return this._slot.scroll.scrollPercent;
  }

  getScrollHandleVerticals(scrollbarHeight: number): Verticals {
    let viewportHeight = this._slot.getEffectiveHeight();
    let contentHeight = this._slot.getContentHeight();

    if (!scrollbarHeight || !viewportHeight || !contentHeight || contentHeight <= viewportHeight) {
      // Nothing to scroll — handle fills the whole track.
      return {
        height: scrollbarHeight,
        y: 0,
      };
    }

    let scrollHandleHeight = new Decimal(scrollbarHeight).mul(viewportHeight).div(contentHeight).round().toNumber();
    let maxHandleY = scrollbarHeight - scrollHandleHeight;
    let scrollHandleY = new Decimal(this._slot.scroll.scrollPercent).div(100).mul(maxHandleY).round().toNumber();

    return {
      height: scrollHandleHeight,
      y: scrollHandleY,
    };
  }
}

export interface VerticalScrollbarStyle {
  /** A width of 0 hides the scrollbar entirely — there's no separate visibility flag. */
  width: number;
  backgroundFill: string;
  backgroundFillOpacity: number;
  handleBarFill: string;
  handleBarOpacity: number;
  handleBarBorderRadius?: number | number[];
}

export interface VerticalScrollbarConfig {
  x: number;
  y: number;
  height: number;
  scrollStepNumberOfDivisions: number;
  scrollEasingDuration: number;
}

const configDefault: VerticalScrollbarConfig = {
  x: 0,
  y: 0,
  height: 0,
  scrollStepNumberOfDivisions: 10,
  scrollEasingDuration: 100,
};

export const VERTICAL_SCROLLBAR_STYLE_DEFAULT: VerticalScrollbarStyle = {
  width: 20,
  backgroundFill: '#000000',
  backgroundFillOpacity: 0.3,
  handleBarFill: '#01a6f0',
  handleBarOpacity: 1,
  handleBarBorderRadius: 0,
};

export enum VerticalScrollbarEventType {
  VERTICAL_SCROLLBAR_SCROLL = 'VERTICAL_SCROLLBAR_SCROLL',
}

export type VerticalScrollbarEventTypeDataMap = {
  [VerticalScrollbarEventType.VERTICAL_SCROLLBAR_SCROLL]: {
    scrollPercent: number;
  };
};

export type VerticalScrollbarEvent = {
  [K in VerticalScrollbarEventType]: {
    type: K;
    data: VerticalScrollbarEventTypeDataMap[K];
  };
}[keyof VerticalScrollbarEventTypeDataMap];

/**
 * Plain vertical scrollbar: a track + a single draggable thumb whose size is a fixed
 * viewport/content ratio (set only via updateScrollHandle), never user-resized. Unlike
 * ZoomScrollbar, there's no zoom concept here — a slot's viewport height doesn't change.
 */
export class VerticalScrollbar extends BaseKonvaComponent2<Konva.Group> implements OnMeasurementsChange, HasRectMeasurement {
  private readonly _onEvent$: Subject<VerticalScrollbarEvent> = new Subject<VerticalScrollbarEvent>();

  protected _ui: Ui;

  protected _config: VerticalScrollbarConfig;
  protected _providedStyle?: Partial<VerticalScrollbarStyle> | undefined;
  protected _styledElement: StyledElementWithId<VerticalScrollbarStyle>;
  protected _style: VerticalScrollbarStyle;
  protected _initialStyle?: VerticalScrollbarStyle;

  private _group: Konva.Group;
  private _bgRect: Konva.Rect;
  private _handleBar: Konva.Rect;

  /** Set by updateScrollHandle() — whether the driving slot's content currently overflows its viewport. */
  private _contentOverflows = false;

  /** Explicit user-controlled visibility override, independent of _contentOverflows. On by default. */
  private _userVisible = true;

  constructor(ompProvider: OmpProvider, configAndStyle?: ConfigAndStyle<VerticalScrollbarConfig, VerticalScrollbarStyle>) {
    super();

    this._ui = ompProvider.ui;

    this._config = {
      ...configDefault,
      ...omitKeys(configAndStyle, 'style'),
    };
    this._providedStyle = configAndStyle?.style;

    this._styledElement = {
      id: CryptoUtil.uuid(),
      classes: [this._ui.resolveStyleClass('VerticalScrollbar')],
    };
    if (this._providedStyle) {
      this.setStyle(this._providedStyle);
    }

    this._style = this._ui.resolveStyle<VerticalScrollbarStyle>(this._styledElement) as VerticalScrollbarStyle;
    this._initialStyle = {
      ...this._style,
    };

    this._ui.onEvent$
      .pipe(filter((event) => affectsStyledElement(event, this._styledElement!)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.handleStyleUpdate();
      });

    this._group = KonvaFactory.createGroup({
      x: this._config.x,
      y: this._config.y,
      width: this._style.width,
      height: this._config.height,
      // Corrected by the first updateScrollHandle() call once viewport/content are known.
      visible: false,
    });

    this._bgRect = KonvaFactory.createRect({
      ...TIMELINE.positionTopLeft,
      width: this._style.width,
      height: this._group.height(),
      fill: this._style.backgroundFill,
      opacity: this._style.backgroundFillOpacity,
    });

    this._handleBar = KonvaFactory.createRect({
      ...TIMELINE.positionTopLeft,
      width: this._style.width,
      height: this._group.height(),
      fill: this._style.handleBarFill,
      opacity: this._style.handleBarOpacity,
      cornerRadius: this._style.handleBarBorderRadius,
      draggable: true,
    });

    this._group.add(this._bgRect);
    this._group.add(this._handleBar);

    this._group.on('click', (event) => {
      let rpp = this._group.getRelativePointerPosition();
      if (rpp) {
        this.clickScrollTo(rpp.y).subscribe();
      }
    });

    this._handleBar.on('dragstart dragmove dragend', (event) => {
      let newPosition = this._handleBar.getPosition();
      let newY = this.getConstrainedHandleBarY(newPosition.y);
      this._handleBar.setAttrs({
        x: 0,
        y: newY,
      });

      let rpp = this._handleBar.getRelativePointerPosition();
      if (rpp) {
        if (rpp.y >= 0 && rpp.y <= this._handleBar.height()) {
          this._onEvent$.next({
            type: VerticalScrollbarEventType.VERTICAL_SCROLLBAR_SCROLL,
            data: {
              scrollPercent: this.getScrollHandlePercent(),
            },
          });
        }
      }
    });

    this._handleBar.on('dragstart dragmove mousedown', (event) => {
      WindowUtil.cursor('grab');
    });

    this._handleBar.on('dragend mouseup', (event) => {
      WindowUtil.cursor('default');
    });
  }

  get onEvent$(): Observable<VerticalScrollbarEvent> {
    return this._onEvent$.asObservable();
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this._bgRect.height(this._group.height());
  }

  /** Explicitly show/hide the scrollbar, independent of whether content currently overflows. */
  setVisible(visible: boolean) {
    this._userVisible = visible;
    this._applyVisibility();
  }

  private _applyVisibility() {
    this._group.visible(this._style.width > 0 && this._contentOverflows && this._userVisible);
  }

  protected handleStyleUpdate(): void {
    this._style = this._ui!.resolveStyle(this._styledElement) as VerticalScrollbarStyle;

    this._group.width(this._style.width);
    this._applyVisibility();

    this._bgRect.setAttrs({
      width: this._style.width,
      fill: this._style.backgroundFill,
      opacity: this._style.backgroundFillOpacity,
    });

    this._handleBar.setAttrs({
      width: this._style.width,
      fill: this._style.handleBarFill,
      opacity: this._style.handleBarOpacity,
      cornerRadius: this._style.handleBarBorderRadius ?? 0,
    });
  }

  private getScrollHandleMaxY() {
    return this._group.height() - this._handleBar.height();
  }

  private getConstrainedHandleBarY(wantedY: number): number {
    let newScrollHandleY = wantedY;
    if (newScrollHandleY < 0) {
      newScrollHandleY = 0;
    } else if (newScrollHandleY + this._handleBar.height() > this._group.height()) {
      newScrollHandleY = this.getScrollHandleMaxY();
    }
    return newScrollHandleY;
  }

  private clickScrollTo(y: number): Observable<void> {
    let scrollStep = this._group.height() / this._config.scrollStepNumberOfDivisions;
    if (y >= this._handleBar.y() && y <= this._handleBar.y() + this._handleBar.height()) {
      // clicked on scroll handle
      return of(void 0);
    } else {
      let isScrollHandleBelow = this._handleBar.y() > y;
      let oneStepMoveY = this._handleBar.y() + scrollStep * (isScrollHandleBelow ? -1 : 1);
      if (isScrollHandleBelow) {
        oneStepMoveY = oneStepMoveY < y ? y : oneStepMoveY;
      } else {
        oneStepMoveY = oneStepMoveY + this._handleBar.height() > y ? y - this._handleBar.height() : oneStepMoveY;
      }
      return this.scrollToEased(oneStepMoveY);
    }
  }

  private scrollTo(y: number) {
    this._handleBar.y(this.getConstrainedHandleBarY(y));
    this._onEvent$.next({
      type: VerticalScrollbarEventType.VERTICAL_SCROLLBAR_SCROLL,
      data: {
        scrollPercent: this.getScrollHandlePercent(),
      },
    });
  }

  private scrollToEased(y: number): Observable<void> {
    return new Observable((o$) => {
      let currentY = this._handleBar.y();
      let newY = this.getConstrainedHandleBarY(y);

      animate({
        duration: this._config.scrollEasingDuration,
        startValue: currentY,
        endValue: newY,
        onUpdateHandler: (frame, value) => {
          this.scrollTo(value);
        },
        onCompleteHandler: () => {
          o$.next();
          o$.complete();
        },
      });
    });
  }

  getScrollHandlePercent(): number {
    let scrollHandleY = this._handleBar.y();
    return scrollHandleY === 0
      ? 0
      : new Decimal(this._handleBar.y())
          .div(this._group.height() - this._handleBar.height())
          .mul(100)
          .toNumber();
  }

  updateScrollHandle(scrollable: ScrollableVertically) {
    let verticals = scrollable.getScrollHandleVerticals(this._group.height());

    // A handle as tall as the track means content fits — nothing to scroll, so hide the scrollbar.
    this._contentOverflows = verticals.height < this._group.height();
    this._applyVisibility();

    this._handleBar.setAttrs({
      ...verticals,
    });
  }

  getRect(): RectMeasurement {
    return {
      ...this._group.getPosition(),
      ...this._group.getSize(),
    };
  }

  setStyle(style: Partial<VerticalScrollbarStyle>) {
    this._ui.updateStyleRule({
      id: this._styledElement.id,
      style: {
        ...style,
      },
    });
  }
}
