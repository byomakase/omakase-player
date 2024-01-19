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

import Konva from 'konva';
import {RectMeasurement} from '../common/measurement';
import {Constants} from '../constants';
import Decimal from 'decimal.js';
import {BaseTimelineLane, TimelaneLaneConfig, TIMELINE_LANE_STYLE_DEFAULT, TimelineLaneStyle} from './timeline-lane';
import {ShapeUtil} from '../util/shape-util';
import {Subject, takeUntil} from 'rxjs';
import {ClickEvent, MouseEnterEvent, MouseLeaveEvent, MouseMoveEvent, MouseOutEvent, MouseOverEvent} from '../types';
import {TimecodeDisplay} from './timecode-display';
import {ComponentConfigStyleComposed} from '../common/component';
import {completeSubjects, unsubscribeSubjects} from '../util/observable-util';
import {VideoControllerApi} from '../video/video-controller-api';

export interface ScrubberLaneStyle extends TimelineLaneStyle {
  tickDivisor: number;
  tickDivisionMinWidth: number;
  tickFill: string;
  tickHeight: number;
  divisionTickFill: string;
  divisionTickHeight: number;
  timecodeShowFirst: boolean;
  timecodeFontSize: number;
  timecodeFill: string;
}

const styleDefault: ScrubberLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  height: 60,
  tickDivisor: 5,
  tickDivisionMinWidth: 18,
  tickFill: '#0d0f05',
  tickHeight: 12,
  divisionTickFill: '#000000',
  divisionTickHeight: 12 * Constants.GOLDEN_RATIO,
  timecodeShowFirst: true,
  timecodeFontSize: 11,
  timecodeFill: '#0d0f05',
}

export interface ScrubberLaneConfig extends TimelaneLaneConfig<ScrubberLaneStyle> {

}

export class ScrubberLane extends BaseTimelineLane<ScrubberLaneConfig, ScrubberLaneStyle> {
  protected tickDivisionWidth: number;
  protected tickTotalDivisions: number;

  protected timecodeDisplay: TimecodeDisplay;

  // region konva
  protected timecodedGroup: Konva.Group;
  protected timecodedEventCatcher: Konva.Rect;
  protected ticksGroup: Konva.Group;
  // endregion

  protected videoController: VideoControllerApi;

  public readonly onClick$: Subject<ClickEvent> = new Subject<ClickEvent>();
  public readonly onMouseEnter$: Subject<MouseEnterEvent> = new Subject<MouseEnterEvent>();
  public readonly onMouseOver$: Subject<MouseOverEvent> = new Subject<MouseOverEvent>();
  public readonly onMouseMove$: Subject<MouseMoveEvent> = new Subject<MouseMoveEvent>();
  public readonly onMouseOut$: Subject<MouseOutEvent> = new Subject<MouseOutEvent>();
  public readonly onMouseLeave$: Subject<MouseLeaveEvent> = new Subject<MouseLeaveEvent>();

  constructor(config: ComponentConfigStyleComposed<ScrubberLaneConfig>, videoController: VideoControllerApi) {
    super({
      ...config,
      style: {
        ...styleDefault,
        ...config.style
      }
    });

    this.videoController = videoController;
  }

  protected createCanvasNode(): Konva.Group {
    super.createCanvasNode();

    this.timecodedGroup = new Konva.Group({
      ...this.timelinePosition,
      width: this.timeline.getTimecodedGroupDimension().width,
      height: this.bodyGroup.height()
    });

    this.timecodedEventCatcher = ShapeUtil.createEventCatcher({
      width: this.timecodedGroup.width(),
      height: this.timecodedGroup.height()
    });

    this.ticksGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      width: this.timecodedGroup.width(),
      height: this.timecodedGroup.height()
    });

    this.timecodedGroup.add(this.timecodedEventCatcher);
    this.timecodedGroup.add(this.ticksGroup);

    this.timeline.addToTimecodedBaseGroup(this.timecodedGroup);

    this.timecodeDisplay = new TimecodeDisplay({
      style: {
        x: 10,
        y: 0,
        width: this.leftGroup.width(),
        height: this.getRect().height,
        textFontSize: this.style.descriptionTextFontSize,
        textFill: this.style.descriptionTextFill
      }
    }, this.videoController);
    this.leftGroup.add(this.timecodeDisplay.initCanvasNode());

    return this.bodyGroup;
  }

  protected settleLayout() {
    super.settleLayout();

    let horizontalMeasurement = this.timeline.getTimecodedGroupHorizontalMeasurement();
    [this.timecodedGroup, this.timecodedEventCatcher, this.ticksGroup].forEach(node => {
      node.width(horizontalMeasurement.width)
    })

    this.refreshTimeDivisions();
  }

  protected afterCanvasNodeInit() {
    super.afterCanvasNodeInit();

    this.timecodedEventCatcher.on('mousemove', (event) => {
      this.onMouseMove$.next({
        evt: event.evt,
        position: this.timecodedGroup.getRelativePointerPosition()
      })
    })

    this.timecodedEventCatcher.on('mouseenter', (event) => {
      this.onMouseEnter$.next({
        evt: event.evt,
        position: this.timecodedGroup.getRelativePointerPosition()
      })
    })

    this.timecodedEventCatcher.on('mouseout', (event) => {
      this.onMouseOut$.next({
        evt: event.evt,
        position: this.timecodedGroup.getRelativePointerPosition()
      })
    })

    this.timecodedEventCatcher.on('mouseleave', (event) => {
      this.onMouseLeave$.next({
        evt: event.evt,
        position: this.timecodedGroup.getRelativePointerPosition()
      })
    })

    this.timecodedEventCatcher.on('click', (event) => {
      this.onClick$.next({
        evt: event.evt,
        position: this.timecodedGroup.getRelativePointerPosition()
      })
    })

        this.timecodedEventCatcher.on('touchend', (event) => {

            this.onClick$.next({
                evt: new MouseEvent("click"),
                position: this.timecodedGroup.getRelativePointerPosition()
            })
        })

    this.videoController.onVideoLoading$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.clearContent();
    })

    this.videoController.onVideoLoaded$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.settleLayout()
    })

  }

  onStyleChange() {
    super.onStyleChange();

    this.timecodeDisplay.style = {
      ...this.timecodeDisplay.style,
      textFontSize: this.style.descriptionTextFontSize,
      textFill: this.style.descriptionTextFill
    }

    this.refreshTimeDivisions(true)
  }

  destroy() {
    this.timecodedGroup.destroy();

    this.videoController = null;

    let subjects = [this.onClick$, this.onMouseOver$, this.onMouseMove$, this.onMouseOut$, this.onMouseLeave$];
    completeSubjects(...subjects)
    unsubscribeSubjects(...subjects);

    super.destroy();
  }

  clearContent() {
    this.ticksGroup.destroyChildren();
  }

  refreshTimeDivisions(forceCreate = false) {
    if (!this.isTimelineReady()) {
      return;
    }

    let tickDivisor = this.style.tickDivisor;
    let tickMinDivisionWidth = this.style.tickDivisionMinWidth;
    let timelineWidth = this.timeline.getTimecodedGroupRect().width;

    let newDivisionWidth = this.resolveTimeDivisionWidth(timelineWidth, tickMinDivisionWidth, tickDivisor, tickDivisor);
    let newTotalDivisions = new Decimal(timelineWidth).div(newDivisionWidth).round().toNumber();

    let moveTicksInsteadOfCreate = !forceCreate && this.tickTotalDivisions === newTotalDivisions && !(this.ticksGroup.getChildren().length < 1);
    if (!moveTicksInsteadOfCreate) {
      this.clearContent();
    }

    this.tickDivisionWidth = newDivisionWidth;
    this.tickTotalDivisions = newTotalDivisions;

    let tickGroupY = 0;
    let firstTextLeftPadding = 2;
    let lastTextRightPadding = 2;
    let textBottomPadding = 5;

    let lastGroupRect: RectMeasurement;

    for (let i = 0; i < (this.tickTotalDivisions + 1); i++) {
      let isFirstTick = i === 0;
      let isLastTick = i === this.tickTotalDivisions;
      let isDivisionTick = i % tickDivisor === 0;
      let tickGroupX = i * this.tickDivisionWidth;
      let lineHeight = isDivisionTick ? this.style.divisionTickHeight : this.style.tickHeight;
      let lineY = this.ticksGroup.height() - lineHeight
      let textBottomY = this.ticksGroup.height() - this.style.divisionTickHeight - textBottomPadding;

      if (moveTicksInsteadOfCreate) {
        let tickGroup = this.ticksGroup.getChildren()[i];
        tickGroup.x(tickGroupX);

        // if (tickGroup.fin)
      } else {
        let tickGroup = new Konva.Group({
          x: tickGroupX,
          y: tickGroupY
        });

        let lineX = 0;
        let line = new Konva.Line({
          points: [
            lineX, lineY,
            lineX, lineY + lineHeight
          ],
          stroke: this.style.tickFill,
          strokeWidth: 1,
          listening: false
        });

        tickGroup.add(line);

        let text = new Konva.Text({
          fontSize: this.style.timecodeFontSize,
          fontFamily: this.stylesProvider.styles.omakasePlayerStyle.fontFamily,
          fill: this.style.timecodeFill,
          text: `${this.timeline.timelinePositionToTimeFormatted(tickGroupX)}`,
          listening: false
        })

        let textRect: RectMeasurement = text.getSelfRect();
        let x = isFirstTick ? lineX + firstTextLeftPadding : isLastTick ? lineX - textRect.width - lastTextRightPadding : lineX - textRect.width / 2;
        let y = textBottomY - textRect.height;
        text.setAttrs({
          x: x,
          y: y
        })

        let showTimecode = isDivisionTick;
        showTimecode = isFirstTick ? this.style.timecodeShowFirst : showTimecode;

        if (showTimecode) {
          tickGroup.add(text)
          lastGroupRect = {
            x: tickGroup.x() + (text.x() > 0 ? 0 : text.x()),
            y: tickGroup.y(),
            width: text.width(),
            height: 0
          }
        }

        this.ticksGroup.add(tickGroup)
      }
    }
  }

  private resolveTimeDivisionWidth(width: number, minDivisionWidth: number, initialDivisor: number, divisor: number): number {
    let currentDivisionWidth = new Decimal(width).div(divisor).floor();
    if (currentDivisionWidth.greaterThan(minDivisionWidth)) {
      return this.resolveTimeDivisionWidth(width, minDivisionWidth, initialDivisor, divisor * initialDivisor);
    } else {
      return new Decimal(width).div(divisor / initialDivisor).toNumber();
    }
  }
}
