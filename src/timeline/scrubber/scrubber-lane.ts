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
import {filter, Observable, Subject, takeUntil} from 'rxjs';
import type {ClickEvent, MouseEnterEvent, MouseLeaveEvent, MouseMoveEvent, MouseOutEvent, MouseOverEvent, RectMeasurement} from '../model';
import {type PlayerApi, PlayerEventType} from '../../player';
import type {TimelineImpl} from '../timeline';
import {KonvaFactory} from '../konva/konva-factory';
import {BaseTimelineLane, TIMELINE_LANE_CONFIG_DEFAULT, type TimelineLaneConfig, type TimelineLaneStyle} from '../timeline-lane';
import {konvaUnlistener} from '../konva/konva-util';
import {nullifier} from '../../util/util-functions';
import {freeObserver} from '../../util/rxjs-util';
import {type ConfigAndStyle} from '../timeline-api';
import {omitKeys} from '../../util/object-util';
import type {TimelineLaneApi} from '../timeline-lane-api';
import type {StyledElementWithId} from '../../ui';
import type {OmpProvider} from '../../omp-provider';

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

export interface ScrubberLaneConfig extends TimelineLaneConfig {}

const configDefault: ScrubberLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
};

// export enum ScrubberTrackLaneEventType {
//   TIMELINE_SCRUBBER_TRACK_LANE__CLICK = 'TIMELINE_SCRUBBER_TRACK_LANE__CLICK',
//   TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_ENTER = 'TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_ENTER',
//   TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_OVER = 'TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_OVER',
//   TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_MOVE = 'TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_MOVE',
//   TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_OUT = 'TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_OUT',
//   TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_LEAVE = 'TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_LEAVE',
// }
//
// export interface ScrubberTrackLaneEventData {
//
// }
//
// export type ScrubberTrackLaneEventTypeDataMap = {
//   [ScrubberTrackLaneEventType.TIMELINE_SCRUBBER_TRACK_LANE__CLICK]: ScrubberTrackLaneEventData;
//   [ScrubberTrackLaneEventType.TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_ENTER]: ScrubberTrackLaneEventData;
//   [ScrubberTrackLaneEventType.TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_OVER]: ScrubberTrackLaneEventData;
//   [ScrubberTrackLaneEventType.TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_MOVE]: ScrubberTrackLaneEventData;
//   [ScrubberTrackLaneEventType.TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_OUT]: ScrubberTrackLaneEventData;
//   [ScrubberTrackLaneEventType.TIMELINE_SCRUBBER_TRACK_LANE_MOUSE_LEAVE]: ScrubberTrackLaneEventData;
// };
//
// export type ScrubberTrackLaneEvent = {
//   [K in ScrubberTrackLaneEventType]: {
//     type: K;
//     data: ScrubberTrackLaneEventTypeDataMap[K];
//   };
// }[keyof ScrubberTrackLaneEventTypeDataMap];

export interface ScrubberLaneApi extends TimelineLaneApi<ScrubberLaneStyle> {
  /**
   * Fires on click
   * @readonly
   */
  onClick$: Observable<ClickEvent>;

  /**
   * Fires on mouse enter
   * @readonly
   */
  onMouseEnter$: Observable<MouseEnterEvent>;

  /**
   * Fires on mouse over
   * @readonly
   */
  onMouseOver$: Observable<MouseOverEvent>;

  /**
   * Fires on mouse move
   * @readonly
   */
  onMouseMove$: Observable<MouseMoveEvent>;

  /**
   * Fires on mouse out
   * @readonly
   */
  onMouseOut$: Observable<MouseOutEvent>;

  /**
   * Fires on mouse leave
   * @readonly
   */
  onMouseLeave$: Observable<MouseLeaveEvent>;
}

export class ScrubberLane extends BaseTimelineLane<ScrubberLaneConfig, ScrubberLaneStyle> implements ScrubberLaneApi {
  // private readonly _onEvent$: Subject<ScrubberTrackLaneEvent> = new Subject<ScrubberTrackLaneEvent>();

  public readonly onClick$: Subject<ClickEvent> = new Subject<ClickEvent>();
  public readonly onMouseEnter$: Subject<MouseEnterEvent> = new Subject<MouseEnterEvent>();
  public readonly onMouseOver$: Subject<MouseOverEvent> = new Subject<MouseOverEvent>();
  public readonly onMouseMove$: Subject<MouseMoveEvent> = new Subject<MouseMoveEvent>();
  public readonly onMouseOut$: Subject<MouseOutEvent> = new Subject<MouseOutEvent>();
  public readonly onMouseLeave$: Subject<MouseLeaveEvent> = new Subject<MouseLeaveEvent>();

  private _tickDivisionWidth?: number;
  private _tickTotalDivisions?: number;

  private _timecodedEventCatcher?: Konva.Rect;
  private _ticksGroup?: Konva.Group;

  constructor(configAndStyle?: ConfigAndStyle<ScrubberLaneConfig, ScrubberLaneStyle>) {
    super({
      ...configDefault,
      ...omitKeys(configAndStyle, 'style'),
    });
  }

  protected createStyledElement(): StyledElementWithId<ScrubberLaneStyle> {
    return {
      id: this._id,
      classes: [this._ui!.resolveStyleClass('ScrubberLane')],
    };
  }

  /**
   * @internal
   * @param timeline
   * @param player
   * @param ompProvider
   */
  override prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider) {
    super.prepareForTimeline(timeline, player, ompProvider);

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = KonvaFactory.createGroup({
      ...timecodedRect,
    });

    this._timecodedEventCatcher = KonvaFactory.createEventCatcherRect({
      ...this._timecodedGroup.getSize(),
    });

    this._ticksGroup = KonvaFactory.createGroup({
      width: this._timecodedGroup.width(),
      height: this._style!.height,
    });

    this._timecodedGroup.add(this._timecodedEventCatcher);
    this._timecodedGroup.add(this._ticksGroup);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup);

    this._timecodedGroup.on('mousemove', (event) => {
      this.onMouseMove$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
      });
    });

    this._timecodedGroup.on('mouseenter', (event) => {
      this.onMouseEnter$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
      });
    });

    this._timecodedGroup.on('mouseout', (event) => {
      this.onMouseOut$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
      });
    });

    this._timecodedGroup.on('mouseleave', (event) => {
      this.onMouseLeave$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
      });
    });

    this._timecodedGroup.on('click', (event) => {
      this.onClick$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
      });
    });

    this._player!.onEvent$.pipe(
      filter(
        (p) =>
          p.type === PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING ||
          p.type === PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED ||
          p.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADING ||
          p.type === PlayerEventType.PLAYER_SESSION_RESTORED ||
          p.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED
      )
    )
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        switch (event.type) {
          case PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING:
          case PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED:
          case PlayerEventType.PLAYER_MAIN_MEDIA_LOADING:
            this.clearContent();
            break;
          case PlayerEventType.PLAYER_SESSION_RESTORED:
          case PlayerEventType.PLAYER_MAIN_MEDIA_LOADED:
            this.settleLayout();
            break;
        }
      });

    this._prepared.next(true);
  }

  protected settleLayout() {
    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup!.setAttrs({
      x: timecodedRect.x,
      y: timecodedRect.y,
    });

    [this._timecodedGroup, this._timecodedEventCatcher, this._ticksGroup].forEach((node) => {
      node!.width(timecodedRect.width);
    });

    this.refreshTimeDivisions();
  }

  protected handleStyleUpdate() {
    super.handleStyleUpdate();

    this.refreshTimeDivisions(true);
  }

  override destroy() {
    konvaUnlistener(this._timecodedGroup);

    nullifier(this._player);

    freeObserver(this.onClick$);
    freeObserver(this.onMouseEnter$);
    freeObserver(this.onMouseOver$);
    freeObserver(this.onMouseMove$);
    freeObserver(this.onMouseOut$);
    freeObserver(this.onMouseLeave$);

    super.destroy();
  }

  override clearContent() {
    this._ticksGroup?.destroyChildren();
  }

  refreshTimeDivisions(forceCreate = false) {
    if (!this._timeline) {
      return;
    }

    let tickDivisor = this._style!.tickDivisor;
    let tickMinDivisionWidth = this._style!.tickDivisionMinWidth;
    let timelineWidth = this._timeline.getTimecodedFloatingRect().width;

    let newDivisionWidth = this.resolveTimeDivisionWidth(timelineWidth, tickMinDivisionWidth, tickDivisor, tickDivisor);
    let newTotalDivisions = new Decimal(timelineWidth).div(newDivisionWidth).round().toNumber();

    let strategy: 'create' | 'move' = forceCreate || this._ticksGroup!.getChildren().length < 1 || !this._tickTotalDivisions || this._tickTotalDivisions !== newTotalDivisions ? 'create' : 'move';

    if (strategy === 'create') {
      this.clearContent();
    }

    this._tickDivisionWidth = newDivisionWidth;
    this._tickTotalDivisions = newTotalDivisions;

    let tickGroupY = 0;
    let firstTextLeftPadding = 2;
    let lastTextRightPadding = 2;
    let textBottomPadding = 5;

    for (let i = 0; i < this._tickTotalDivisions + 1; i++) {
      let isFirstTick = i === 0;
      let isLastTick = i === this._tickTotalDivisions;
      let isDivisionTick = i % tickDivisor === 0;
      let tickGroupX = i * this._tickDivisionWidth;
      let lineHeight = isDivisionTick ? this._style!.divisionTickHeight : this._style!.tickHeight;
      let lineY = this._ticksGroup!.height() - lineHeight;
      let textBottomY = this._ticksGroup!.height() - this._style!.divisionTickHeight - textBottomPadding;

      if (strategy === 'move') {
        let tickGroup = this._ticksGroup!.getChildren()[i];
        if (tickGroup) {
          tickGroup.x(tickGroupX);
        }
      } else {
        let tickGroup = new Konva.Group({
          x: tickGroupX,
          y: tickGroupY,
        });

        let lineX = 0;
        let line = new Konva.Line({
          points: [lineX, lineY, lineX, lineY + lineHeight],
          stroke: this._style!.tickFill,
          strokeWidth: 1,
          listening: false,
        });

        tickGroup.add(line);

        let text = new Konva.Text({
          fontSize: this._style!.timecodeFontSize,
          fontFamily: this._timeline.style.textFontFamily,
          fill: this._style!.timecodeFill,
          text: `${this._timeline.timelinePositionToTimecode(tickGroupX)}`,
          listening: false,
        });

        let textRect: RectMeasurement = text.getSelfRect();
        let x = isFirstTick ? lineX + firstTextLeftPadding : isLastTick ? lineX - textRect.width - lastTextRightPadding : lineX - textRect.width / 2;
        let y = textBottomY - textRect.height;
        text.setAttrs({
          x: x,
          y: y,
        });

        let showTimecode = isDivisionTick;
        showTimecode = isFirstTick ? this._style!.timecodeShowFirst : showTimecode;

        if (showTimecode) {
          tickGroup.add(text);
        }

        this._ticksGroup!.add(tickGroup);
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
