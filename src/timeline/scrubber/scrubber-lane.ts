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

import Konva from 'konva';
import {RectMeasurement} from '../../common/measurement';
import {Constants} from '../../constants';
import Decimal from 'decimal.js';
import {BaseTimelineLane, TIMELINE_LANE_CONFIG_DEFAULT, timelineLaneComposeConfig, TimelineLaneConfig, TimelineLaneConfigDefaultsExcluded, TimelineLaneStyle} from '../timeline-lane';
import {filter, Subject, takeUntil} from 'rxjs';
import {ClickEvent, MouseEnterEvent, MouseLeaveEvent, MouseMoveEvent, MouseOutEvent, MouseOverEvent} from '../../types';
import {completeUnsubscribeSubjects} from '../../util/observable-util';
import {Timeline} from '../timeline';
import {destroyer, nullifier} from '../../util/destroy-util';
import {KonvaFactory} from '../../factory/konva-factory';
import {VideoControllerApi} from '../../video/video-controller-api';
import {ScrubberLaneApi} from '../../api';
import {konvaUnlistener} from '../../util/konva-util';

export interface ScrubberLaneConfig extends TimelineLaneConfig<ScrubberLaneStyle> {

}

export interface ScrubberLaneStyle extends TimelineLaneStyle {
  tickDivisor: number;
  tickDivisionMinWidth: number;
  tickFill: string;
  tickHeight: number;
  divisionTickHeight: number;
  timecodeShowFirst: boolean;
  timecodeFontSize: number;
  timecodeFill: string;
}

const configDefault: ScrubberLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    height: 60,
    tickDivisor: 5,
    tickDivisionMinWidth: 18,
    tickFill: '#0d0f05',
    tickHeight: 12,
    divisionTickHeight: 12 * Constants.GOLDEN_RATIO,
    timecodeShowFirst: true,
    timecodeFontSize: 11,
    timecodeFill: '#0d0f05',
  }
}

export class ScrubberLane extends BaseTimelineLane<ScrubberLaneConfig, ScrubberLaneStyle> implements ScrubberLaneApi {
  public readonly onClick$: Subject<ClickEvent> = new Subject<ClickEvent>();
  public readonly onMouseEnter$: Subject<MouseEnterEvent> = new Subject<MouseEnterEvent>();
  public readonly onMouseOver$: Subject<MouseOverEvent> = new Subject<MouseOverEvent>();
  public readonly onMouseMove$: Subject<MouseMoveEvent> = new Subject<MouseMoveEvent>();
  public readonly onMouseOut$: Subject<MouseOutEvent> = new Subject<MouseOutEvent>();
  public readonly onMouseLeave$: Subject<MouseLeaveEvent> = new Subject<MouseLeaveEvent>();

  private _tickDivisionWidth?: number;
  private _tickTotalDivisions?: number;

  private _timecodedGroup?: Konva.Group;
  private _timecodedEventCatcher?: Konva.Rect;
  private _ticksGroup?: Konva.Group;

  constructor(config: TimelineLaneConfigDefaultsExcluded<ScrubberLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = KonvaFactory.createGroup({
      ...timecodedRect
    });

    this._timecodedEventCatcher = KonvaFactory.createEventCatcherRect({
      ...this._timecodedGroup.getSize()
    });

    this._ticksGroup = KonvaFactory.createGroup({
      width: this._timecodedGroup.width(),
      height: this._config.style.height
    });

    this._timecodedGroup.add(this._timecodedEventCatcher);
    this._timecodedGroup.add(this._ticksGroup);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup);

    this._timecodedGroup.on('mousemove', (event) => {
      this.onMouseMove$.next({
        mouseEvent: event.evt,
        cancelableEvent: event
      })
    })

    this._timecodedGroup.on('mouseenter', (event) => {
      this.onMouseEnter$.next({
        mouseEvent: event.evt,
        cancelableEvent: event
      })
    })

    this._timecodedGroup.on('mouseout', (event) => {
      this.onMouseOut$.next({
        mouseEvent: event.evt,
        cancelableEvent: event
      })
    })

    this._timecodedGroup.on('mouseleave', (event) => {
      this.onMouseLeave$.next({
        mouseEvent: event.evt,
        cancelableEvent: event
      })
    })

    this._timecodedGroup.on('click', (event) => {
      this.onClick$.next({
        mouseEvent: event.evt,
        cancelableEvent: event
      })
    })

    this._videoController!.onVideoLoading$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.clearContent();
    })

    this._videoController!.onVideoLoaded$.pipe(filter(p => !!p), takeUntil(this._destroyed$)).subscribe((event) => {
      this.settleLayout();
    })
  }

  protected settleLayout() {
    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup!.setAttrs({
      x: timecodedRect.x,
      y: timecodedRect.y
    });

    [this._timecodedGroup, this._timecodedEventCatcher, this._ticksGroup].forEach(node => {
      node!.width(timecodedRect.width)
    })

    this.refreshTimeDivisions();
  }

  override onStyleChange() {
    super.onStyleChange();
    this.refreshTimeDivisions(true)
  }

  override destroy() {
    konvaUnlistener(this._timecodedGroup)

    destroyer(
      this._timecodedGroup
    )

    nullifier(
      this._videoController
    )

    completeUnsubscribeSubjects(
      this.onClick$,
      this.onMouseOver$,
      this.onMouseMove$,
      this.onMouseOut$,
      this.onMouseLeave$
    )

    super.destroy();
  }

  override clearContent() {
    this._ticksGroup?.destroyChildren();
  }

  refreshTimeDivisions(forceCreate = false) {
    if (!this._videoController?.isVideoLoaded() || !(this._timeline && this._timeline.onReady$.value)) {
      return;
    }

    let tickDivisor = this.style.tickDivisor;
    let tickMinDivisionWidth = this.style.tickDivisionMinWidth;
    let timelineWidth = this._timeline.getTimecodedFloatingRect().width;

    let newDivisionWidth = this.resolveTimeDivisionWidth(timelineWidth, tickMinDivisionWidth, tickDivisor, tickDivisor);
    let newTotalDivisions = new Decimal(timelineWidth).div(newDivisionWidth).round().toNumber();

    let strategy: 'create' | 'move' = forceCreate || (this._ticksGroup!.getChildren().length < 1) || !this._tickTotalDivisions || (this._tickTotalDivisions !== newTotalDivisions) ? 'create' : 'move';

    if (strategy === 'create') {
      this.clearContent();
    }

    this._tickDivisionWidth = newDivisionWidth;
    this._tickTotalDivisions = newTotalDivisions;

    let tickGroupY = 0;
    let firstTextLeftPadding = 2;
    let lastTextRightPadding = 2;
    let textBottomPadding = 5;

    for (let i = 0; i < (this._tickTotalDivisions + 1); i++) {
      let isFirstTick = i === 0;
      let isLastTick = i === this._tickTotalDivisions;
      let isDivisionTick = i % tickDivisor === 0;
      let tickGroupX = i * this._tickDivisionWidth;
      let lineHeight = isDivisionTick ? this.style.divisionTickHeight : this.style.tickHeight;
      let lineY = this._ticksGroup!.height() - lineHeight
      let textBottomY = this._ticksGroup!.height() - this.style.divisionTickHeight - textBottomPadding;

      if (strategy === 'move') {
        let tickGroup = this._ticksGroup!.getChildren()[i];
        tickGroup.x(tickGroupX);
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
          fontFamily: this._timeline.style.textFontFamily,
          fill: this.style.timecodeFill,
          text: `${this._timeline.timelinePositionToTimecode(tickGroupX)}`,
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
          tickGroup.add(text);
        }

        this._ticksGroup!.add(tickGroup)
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
