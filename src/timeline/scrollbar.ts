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

import {BaseComponent, ComponentConfig, ComponentConfigStyleComposed, composeConfigAndDefault} from "../common/component";
import Konva from "konva";
import Decimal from "decimal.js";
import {HasRectMeasurement, HorizontalMeasurement, OnMeasurementsChange, Position, RectMeasurement} from "../common/measurement";
import {animate} from "../util/animation-util";
import {ScrollbarScrollEvent, ScrollbarZoomEvent} from "../types";
import {Constants} from "../constants";
import {WindowUtil} from "../util/window-util";
import {filter, Subject, takeUntil} from "rxjs";

export interface ScrollableHorizontally {
  setHorizontalScrollPercent(percent: number): void;

  getHorizontalScrollPercent(): number;

  getScrollHandleHorizontalMeasurement(scrollbarWidth: number): HorizontalMeasurement;
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
}

const configDefault: ScrollbarConfig = {
  ...Constants.POSITION_TOP_LEFT,
  width: 0,
  zoomMax: 1500,
  scrollStepNumberOfDivisions: 10,
  style: {
    height: 20,
    backgroundFill: '#000000',
    backgroundFillOpacity: 0.3,
    handleBarFill: '#01a6f0',
    handleBarOpacity: 1,
    handleOpacity: 1
  }
}

export class Scrollbar extends BaseComponent<ScrollbarConfig, ScrollbarStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement {
  protected x: number;
  protected y: number;
  protected width: number;
  protected scrollStepNumberOfDivisions: number;
  protected zoomMax: number;

  protected minHandleBarWidth;

  // region konva
  private group: Konva.Group;
  private handleGroup: Konva.Group;
  private background: Konva.Rect;
  private handleBar: Konva.Rect;
  private leftZoomHandle: Konva.Circle;
  private rightZoomHandle: Konva.Circle;
  // endregion

  public readonly onScroll$: Subject<ScrollbarScrollEvent> = new Subject<ScrollbarScrollEvent>();
  public readonly onZoom$: Subject<ScrollbarZoomEvent> = new Subject<ScrollbarZoomEvent>();

  constructor(config: Partial<ComponentConfigStyleComposed<ScrollbarConfig>>) {
    super(composeConfigAndDefault(config, configDefault));

    this.x = this.config.x;
    this.y = this.config.y;
    this.width = this.config.width;
    this.zoomMax = this.config.zoomMax;
    this.scrollStepNumberOfDivisions = this.config.scrollStepNumberOfDivisions;
  }

  protected createCanvasNode(): Konva.Group {
    this.group = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.style.height
    })

    this.background = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      width: this.group.width(),
      height: this.style.height,
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundFillOpacity
    });

    this.handleGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      width: this.group.width(),
      height: this.style.height,
    });

    this.handleBar = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      width: this.handleGroup.width(),
      height: this.style.height,
      fill: this.style.handleBarFill,
      opacity: this.style.handleBarOpacity,
      draggable: true
    });


    this.leftZoomHandle = new Konva.Circle({
      ...Constants.POSITION_TOP_LEFT,
      fill: this.style.handleBarFill,
      radius: this.style.height / 2,
      y: this.style.height / 2,
      opacity: this.style.handleOpacity,
      draggable: true
    });

    this.rightZoomHandle = new Konva.Circle({
      ...Constants.POSITION_TOP_LEFT,
      fill: this.style.handleBarFill,
      radius: this.style.height / 2,
      y: this.style.height / 2,
      opacity: this.style.handleOpacity,
      draggable: true
    });

    this.handleGroup.add(this.background);
    this.handleGroup.add(this.handleBar);

    this.group.add(this.background);
    this.group.add(this.handleGroup);

    this.handleGroup.add(this.leftZoomHandle)
    this.handleGroup.add(this.rightZoomHandle)

    return this.group;
  }

  protected afterCanvasNodeInit() {
    this.styleAdapter.onChange$.pipe(takeUntil(this.onDestroy$), filter(p => !!p)).subscribe((style) => {
      this.onStyleChange();
    })

    this.group.on('click', (event) => {
      this.clickScrollTo(this.group.getRelativePointerPosition().x);
    })

        this.group.on('touchend', (event) => {
            this.clickScrollTo(this.group.getRelativePointerPosition().x);
        })

        this.handleBar.on('touchmove', (event) => {
            let newPosition = this.handleBar.getPosition();
            let newX = this.getConstrainedHandleBarX(newPosition.x);
            this.handleBar.setAttrs({
                x: newX,
                y: 0
            })
            this.syncLeftRightHandles();

      if (this.handleBar.getRelativePointerPosition().x >= 0 && this.handleBar.getRelativePointerPosition().x <= this.handleBar.width()) {
        this.onScroll$.next({
          scrollPercent: this.getScrollHandlePercent()
        })
      }
    })

    this.handleBar.on('dragstart dragmove dragend', (event) => {
      let newPosition = this.handleBar.getPosition();
      let newX = this.getConstrainedHandleBarX(newPosition.x);
      this.handleBar.setAttrs({
        x: newX,
        y: 0
      })
      this.syncLeftRightHandles();

            if (this.handleBar.getRelativePointerPosition().x >= 0 && this.handleBar.getRelativePointerPosition().x <= this.handleBar.width()) {
                this.onScroll$.next({
                    scrollPercent: this.getScrollHandlePercent()
                })
            }
        })

    let zoomInConfig = {
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 0.1
    }

    let zoomOutConfig = {
      scaleX: 1,
      scaleY: 1,
      duration: 0.1
    }

    this.leftZoomHandle.on('mouseover', (event) => {
      this.leftZoomHandle.to({
        ...zoomInConfig
      })
      WindowUtil.cursor("ew-resize")
    })

    this.leftZoomHandle.on('mouseout', (event) => {
      this.leftZoomHandle.to({
        ...zoomOutConfig
      })
      WindowUtil.cursor("default")
    })

    this.rightZoomHandle.on('mouseover', (event) => {
      this.rightZoomHandle.to({
        ...zoomInConfig
      })
      WindowUtil.cursor("ew-resize")
    })

    this.rightZoomHandle.on('mouseout', (event) => {
      this.rightZoomHandle.to({
        ...zoomOutConfig
      })
      WindowUtil.cursor("default")
    })

    let constrainLeftHandleX = (wantedX: number): number => {
      let newX = wantedX;
      if (newX < 0) {
        newX = 0;
      } else if ((this.rightZoomHandle.x() - wantedX) <= this.minHandleBarWidth) {
        newX = this.rightZoomHandle.x() - this.minHandleBarWidth;
      }
      return newX;
    }

    this.leftZoomHandle.on('dragstart dragmove dragend', (event) => {
      let newPosition = this.leftZoomHandle.getPosition();
      let newX = constrainLeftHandleX(newPosition.x);
      this.leftZoomHandle.setAttrs({
        x: newX,
        y: this.style.height / 2
      })
      this.handleBar.setAttrs({
        x: newX,
        width: this.rightZoomHandle.x() - newX
      });
      this.onZoom$.next({
        zoomPercent: this.getZoomPercent()
      })
    })

    let constrainRightHandleX = (wantedX: number): number => {
      let newX = wantedX;
      let scrollbarWidth = this.group.width();
      if (newX > scrollbarWidth) {
        newX = scrollbarWidth;
      } else if ((wantedX - this.leftZoomHandle.x()) <= this.minHandleBarWidth) {
        newX = this.leftZoomHandle.x() + this.minHandleBarWidth;
      }
      return newX;
    }

    this.rightZoomHandle.on('dragstart dragmove dragend', (event) => {
      let newPosition = this.rightZoomHandle.getPosition();
      let newX = constrainRightHandleX(newPosition.x);
      this.rightZoomHandle.setAttrs({
        x: newX,
        y: this.style.height / 2
      })
      this.handleBar.setAttrs({
        width: newX - this.leftZoomHandle.x()
      });
      this.onZoom$.next({
        zoomPercent: this.getZoomPercent()
      })
    })
  }

  onMeasurementsChange() {
    this.group.width(this.width);
    this.background.width(this.group.width());
    this.handleGroup.width(this.group.width());
    this.minHandleBarWidth = this.calculateHandleBarWidthFromZoomRatioPercent(this.zoomMax);
  }

  onStyleChange() {
    this.group.setAttrs({
      height: this.style.height
    })

    this.background.setAttrs({
      height: this.style.height,
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundFillOpacity
    })

    this.handleGroup.setAttrs({
      height: this.style.height,
    })

    this.handleBar.setAttrs({
      height: this.style.height,
      fill: this.style.handleBarFill,
      opacity: this.style.handleBarOpacity,
    })

    this.leftZoomHandle.setAttrs({
      fill: this.style.handleBarFill,
      radius: this.style.height / 2,
      y: this.style.height / 2,
      opacity: this.style.handleOpacity,
    })

    this.rightZoomHandle.setAttrs({
      fill: this.style.handleBarFill,
      radius: this.style.height / 2,
      y: this.style.height / 2,
      opacity: this.style.handleOpacity,
    })
  }

  private getScrollHandleMaxX() {
    return this.group.width() - this.handleBar.width();
  }

  private getConstrainedHandleBarX(wantedX: number): number {
    let newScrollHandleX = wantedX;
    if (newScrollHandleX < 0) {
      newScrollHandleX = 0;
    } else if ((newScrollHandleX + this.handleBar.width()) > this.group.width()) {
      newScrollHandleX = this.getScrollHandleMaxX();
    }
    return newScrollHandleX;
  }

  private clickScrollTo(x: number) {
    let scrollStep = this.group.width() / this.scrollStepNumberOfDivisions;
    if (x >= this.handleBar.x() && x <= (this.handleBar.x() + this.handleBar.width())) {
      // clicked on scroll handle
    } else {
      let isScrollHandleToRight = this.handleBar.x() > x;
      let oneStepMoveX = this.handleBar.x() + scrollStep * (isScrollHandleToRight ? -1 : 1);
      if (isScrollHandleToRight) {
        oneStepMoveX = oneStepMoveX < x ? x : oneStepMoveX;
      } else {
        oneStepMoveX = (oneStepMoveX + this.handleBar.width()) > x ? x - this.handleBar.width() : oneStepMoveX;
      }
      this.scrollToEased(oneStepMoveX);
    }
  }

  private scrollTo(x: number) {
    this.handleBar.x(this.getConstrainedHandleBarX(x));
    this.syncLeftRightHandles();
    this.onScroll$.next({
      scrollPercent: this.getScrollHandlePercent()
    })
  }

  private scrollToEased(x: number) {
    let currentX = this.handleBar.x();
    let newX = this.getConstrainedHandleBarX(x);

    animate({
      layer: this.handleGroup.getLayer(),
      duration: Constants.TIMELINE_SCROLL_EASED_DURATION_MS,
      from: currentX,
      to: newX,
      onUpdateHandler: (frame, value) => {
        this.scrollTo(value);
      }
    })
  }

  private calculateHandleBarWidthFromZoomRatioPercent(zoomRatioPercent): number {
    return new Decimal(this.group.width()).mul(100).div(zoomRatioPercent).toNumber();
  }

  getZoomPercent(): number {
    return this.group.width() === this.handleBar.width() ? 100 : (new Decimal(this.group.width()).mul(100).div(this.handleBar.width()).toNumber())
  }

  getScrollHandlePercent(): number {
    let scrollHandleX = this.handleBar.x();
    return scrollHandleX === 0 ? 0 : new Decimal(this.handleBar.x()).div(this.group.width() - this.handleBar.width()).mul(100).toNumber();
  }

  updateScrollHandle(scrollable: ScrollableHorizontally) {
    let horizontalMeasurement = scrollable.getScrollHandleHorizontalMeasurement(this.group.width());
    this.handleBar.setAttrs({
      ...horizontalMeasurement
    });
    this.syncLeftRightHandles()
  }

  private syncLeftRightHandles() {
    this.leftZoomHandle.x(this.handleBar.x());
    this.rightZoomHandle.x(this.handleBar.x() + this.handleBar.width());
  }

  setWidth(value: number) {
    this.width = value;
    this.onMeasurementsChange();
  }

  setPosition(position: Position) {
    this.x = position.x;
    this.y = position.y;
    this.group.setAttrs({
      ...position
    });
  }

  getPosition(): Position {
    return this.group.getPosition();
  }

  getRect(): RectMeasurement {
    return {
      ...this.group.getPosition(),
      ...this.group.getSize()
    }
  }
}
