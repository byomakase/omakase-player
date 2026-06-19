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

import {type MarkerState, MarkerTrack, MarkerType, type MarkerUpdateableAttrs, TimedItemTemporalType, TimedItemTemporalUtil} from '../../media';
import {BaseKonvaComponent2} from '../layout/konva-component';
import Konva from 'konva';
import type {ClickEvent, MouseMoveEvent, Position, Verticals} from '../model';
import {WindowUtil} from '../../util/window-util';
import Decimal from 'decimal.js';
import {ColorUtil} from '../../util/color-util';
import {KonvaFactory} from '../konva/konva-factory';
import {TimelineImpl} from '../timeline';
import {type MarkerOnMarkerTrackLaneStyle, MarkerTrackLane} from './marker-track-lane';
import type {KonvaEventObject} from 'konva/lib/Node';
import {affectsStyledElement, type StyledElement, Ui} from '../../ui';
import {filter, Observable, Subject, takeUntil} from 'rxjs';
import {freeObserver} from '../../util/rxjs-util';
import {ObserverBreaker} from '../../common/observer-breaker';

export enum MarkerViewComponentEventType {
  HANDLE_CLICK = 'HANDLE_CLICK',
  HANDLE_MOUSE_MOVE = 'HANDLE_MOUSE_MOVE',
  HANDLE_MOUSE_ENTER = 'HANDLE_MOUSE_ENTER',
  HANDLE_MOUSE_LEAVE = 'HANDLE_MOUSE_LEAVE',
  HANDLE_DRAG_START = 'HANDLE_DRAG_START',
  HANDLE_DRAG_END = 'HANDLE_DRAG_END',
}

export interface MarkerViewComponentEventData {
  item: MarkerState;
  pointerPosition: Position;
}

export interface MarkerViewComponentDragEventData {
  item: MarkerState;
}

export type MarkerViewComponentEventTypeDataMap = {
  [MarkerViewComponentEventType.HANDLE_CLICK]: MarkerViewComponentEventData;
  [MarkerViewComponentEventType.HANDLE_MOUSE_MOVE]: MarkerViewComponentEventData;
  [MarkerViewComponentEventType.HANDLE_MOUSE_ENTER]: MarkerViewComponentEventData;
  [MarkerViewComponentEventType.HANDLE_MOUSE_LEAVE]: MarkerViewComponentEventData;
  [MarkerViewComponentEventType.HANDLE_DRAG_START]: MarkerViewComponentDragEventData;
  [MarkerViewComponentEventType.HANDLE_DRAG_END]: MarkerViewComponentDragEventData;
};

export type MarkerViewComponentEvent = {
  [K in MarkerViewComponentEventType]: {
    type: K;
    data: MarkerViewComponentEventTypeDataMap[K];
  };
}[keyof MarkerViewComponentEventTypeDataMap];

export class MarkerViewComponent extends BaseKonvaComponent2<Konva.Group> {
  private readonly _onEvent$: Subject<MarkerViewComponentEvent> = new Subject<MarkerViewComponentEvent>();

  protected _ui: Ui;

  protected _editable: boolean;

  protected _styledElement: StyledElement<MarkerOnMarkerTrackLaneStyle>;
  protected _style!: MarkerOnMarkerTrackLaneStyle;

  protected _markerState: MarkerState;
  protected _timeline: TimelineImpl;
  protected _markerTrackLane: MarkerTrackLane;
  protected _updateHook: (attrs: MarkerUpdateableAttrs) => void;

  protected _innerComponent?: BaseMarkerViewInnerComponent;

  protected _group: Konva.Group;
  protected _innerGroup: Konva.Group;

  protected _renderBreaker = new ObserverBreaker();

  constructor(args: {
    editable: boolean;
    markerState: MarkerState;
    markerTrackId: MarkerTrack['id'];
    timeline: TimelineImpl;
    ui: Ui;
    markerTrackLane: MarkerTrackLane;
    updateHook: (attrs: MarkerUpdateableAttrs) => void;
  }) {
    super();
    this._editable = args.editable;

    this._markerState = args.markerState;
    this._timeline = args.timeline;
    this._markerTrackLane = args.markerTrackLane;
    this._updateHook = args.updateHook;
    this._ui = args.ui;

    this._styledElement = {
      id: `${this._markerTrackLane.id}.${this._markerState.id}`,
      parent: {
        id: this._markerState.id,
        parent: {
          id: MarkerTrackLane.formatTrackOnLaneStyleId(this._markerTrackLane, args.markerTrackId),
          parent: {
            id: args.markerTrackId,
            parent: {
              classes: [this._ui!.resolveStyleClass('MarkerOnMarkerTrackLane')],
              parent: {
                classes: [this._ui!.resolveStyleClass('MarkerTrackOnMarkerTrackLane')],
                parent: {
                  classes: [this._ui!.resolveStyleClass('MarkerTrack')],
                  parent: {
                    classes: [this._ui!.resolveStyleClass('Marker')],
                  },
                },
              },
            },
          },
        },
      },
    };

    this._style = this._ui.resolveStyle(this._styledElement) as MarkerOnMarkerTrackLaneStyle;

    this._group = KonvaFactory.createGroup();
    this._innerGroup = KonvaFactory.createGroup();

    this._group.add(this._innerGroup);

    this._ui.onEvent$
      .pipe(filter((event) => affectsStyledElement(event, this._styledElement)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.styleChanged();
      });

    let targetTouches = (event: KonvaEventObject<MouseEvent, Konva.Group>): boolean => {
      return event.target === this._innerGroup || this._innerGroup.isAncestorOf(event.target);
    };

    let isMouseOver = false;
    let handleMouseOver = (pointerPosition: Position) => {
      isMouseOver = true;
      this._onEvent$.next({
        type: MarkerViewComponentEventType.HANDLE_MOUSE_ENTER,
        data: {
          item: this._markerState,
          pointerPosition: pointerPosition,
        },
      });
    };
    let handleMouseOut = (pointerPosition: Position) => {
      isMouseOver = false;
      this._onEvent$.next({
        type: MarkerViewComponentEventType.HANDLE_MOUSE_LEAVE,
        data: {
          item: this._markerState,
          pointerPosition: pointerPosition,
        },
      });
    };

    this._group.on('mouseover mouseenter touchstart', (event) => {
      if (targetTouches(event)) {
        if (!isMouseOver) {
          let rpp = this.getRelativePointerPosition();
          if (rpp) {
            handleMouseOver(rpp);
          }
        }
      } else {
        if (isMouseOver) {
          let rpp = this.getRelativePointerPosition();
          if (rpp) {
            handleMouseOut(rpp);
          }
        }
      }
    });

    this._group.on('mouseleave mouseout touchend', (event) => {
      if (isMouseOver) {
        let rpp = this.getRelativePointerPosition();
        if (rpp) {
          handleMouseOut(rpp);
        }
      }
    });

    this._group.on('mousemove', (event) => {
      let rpp = this.getRelativePointerPosition();
      if (rpp) {
        this._onEvent$.next({
          type: MarkerViewComponentEventType.HANDLE_MOUSE_MOVE,
          data: {
            item: this._markerState,
            pointerPosition: rpp,
          },
        });
      }
    });

    this.update(this._markerState);
  }

  get onEvent$(): Observable<MarkerViewComponentEvent> {
    return this._onEvent$.asObservable();
  }

  get style(): MarkerOnMarkerTrackLaneStyle {
    return this._style;
  }

  private getRelativePointerPosition() {
    return this.konvaNode.getRelativePointerPosition();
  }

  setStyle(style: Partial<MarkerOnMarkerTrackLaneStyle>) {
    this._ui.updateStyleRule({
      id: this._styledElement.id!,
      style: {
        ...(style ? style : {}),
      },
    });
  }

  update(markerState: MarkerState) {
    this._markerState = markerState;
    this.render();
  }

  refreshTimelinePosition() {
    this._innerComponent?.refreshTimelinePosition();
  }

  get editable(): boolean {
    return this._editable;
  }

  protected styleChanged() {
    this.render();
  }

  protected render() {
    this._renderBreaker.break();

    this._style = this._ui.resolveStyle(this._styledElement) as MarkerOnMarkerTrackLaneStyle;

    this._innerGroup.destroyChildren();

    let args: BaseMarkerViewInnerComponentArgs = {
      editable: this._editable,
      style: this._style,
      markerState: this._markerState,
      timeline: this._timeline,
      markerTrackLane: this._markerTrackLane,
      updateHook: this._updateHook,
    };

    let createMomentMarker = () => {
      return new MarkerViewMoment(args);
    };

    let createPeriodMarker = () => {
      return new MarkerViewPeriod(args);
    };

    switch (this._markerState.markerType) {
      case MarkerType.MOMENT_MARKER:
        this._innerComponent = createMomentMarker();
        break;
      case MarkerType.SPANNING_MARKER:
        if (this._style.momentToSpanningThreshold !== void 0) {
          let duration = TimedItemTemporalUtil.extractDuration(this._markerState.temporal);
          if (duration !== void 0 && duration < this._style.momentToSpanningThreshold) {
            this._innerComponent = createMomentMarker();
          } else {
            this._innerComponent = createPeriodMarker();
          }
        } else {
          this._innerComponent = createPeriodMarker();
        }
        break;
      default:
        throw new Error(`Unsupported marker type: ${this._markerState.markerType}`);
    }

    this._innerComponent.onHandleClick$.pipe(takeUntil(this._renderBreaker.observer)).subscribe((event) => {
      let rpp = this.getRelativePointerPosition();
      if (rpp) {
        this._onEvent$.next({
          type: MarkerViewComponentEventType.HANDLE_CLICK,
          data: {
            item: this._markerState,
            pointerPosition: rpp,
          },
        });
      }
    });
    this._innerComponent.onHandleMouseMove$.pipe(takeUntil(this._renderBreaker.observer)).subscribe((event) => {
      let rpp = this.getRelativePointerPosition();
      if (rpp) {
        this._onEvent$.next({
          type: MarkerViewComponentEventType.HANDLE_MOUSE_MOVE,
          data: {
            item: this._markerState,
            pointerPosition: rpp,
          },
        });
      }
    });

    this._innerComponent.onHandleDragStart$.pipe(takeUntil(this._renderBreaker.observer)).subscribe(() => {
      this._onEvent$.next({
        type: MarkerViewComponentEventType.HANDLE_DRAG_START,
        data: {item: this._markerState},
      });
    });

    this._innerComponent.onHandleDragEnd$.pipe(takeUntil(this._renderBreaker.observer)).subscribe(() => {
      this._onEvent$.next({
        type: MarkerViewComponentEventType.HANDLE_DRAG_END,
        data: {item: this._markerState},
      });
    });

    this._innerGroup.add(this._innerComponent.konvaNode);
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  destroy() {
    super.destroy();
    this._renderBreaker.destroy();
    freeObserver(this._onEvent$);
  }
}

interface BaseMarkerViewInnerComponentArgs {
  editable: boolean;
  style: MarkerOnMarkerTrackLaneStyle;
  markerState: MarkerState;
  timeline: TimelineImpl;
  markerTrackLane: MarkerTrackLane;
  updateHook: (attrs: MarkerUpdateableAttrs) => void;
}

abstract class BaseMarkerViewInnerComponent extends BaseKonvaComponent2<Konva.Group> {
  protected _onHandleClick$: Subject<ClickEvent> = new Subject<ClickEvent>();
  protected _onHandleMouseMove$: Subject<MouseMoveEvent> = new Subject<MouseMoveEvent>();
  protected _onHandleDragStart$: Subject<void> = new Subject<void>();
  protected _onHandleDragEnd$: Subject<void> = new Subject<void>();

  protected _editable: boolean;
  protected _style: MarkerOnMarkerTrackLaneStyle;

  protected _markerState: MarkerState;
  protected _timeline: TimelineImpl;
  protected _markerTrackLane: MarkerTrackLane;
  protected _updateHook: (attrs: MarkerUpdateableAttrs) => void;

  protected _group: Konva.Group;

  protected _renderBreaker = new ObserverBreaker();

  protected constructor(args: BaseMarkerViewInnerComponentArgs) {
    super();
    this._editable = args.editable;
    this._style = args.style;
    this._markerState = args.markerState;
    this._timeline = args.timeline;
    this._markerTrackLane = args.markerTrackLane;
    this._updateHook = args.updateHook;
    this._group = new Konva.Group();
  }

  protected abstract render(): void;

  abstract refreshTimelinePosition(): void;

  get onHandleClick$(): Observable<ClickEvent> {
    return this._onHandleClick$.asObservable();
  }

  get onHandleMouseMove$(): Observable<MouseMoveEvent> {
    return this._onHandleMouseMove$.asObservable();
  }

  get onHandleDragStart$(): Observable<void> {
    return this._onHandleDragStart$.asObservable();
  }

  get onHandleDragEnd$(): Observable<void> {
    return this._onHandleDragEnd$.asObservable();
  }

  update(markerState: MarkerState) {
    this._markerState = markerState;
    this.render();
  }

  protected getVerticals(): MarkerViewHandleVerticals {
    if (!this._timeline) {
      throw new Error(`Marker not attached to timeline`);
    }

    let timelineTimecodedRect = this._timeline.getTimecodedFloatingDimension();
    let timecodedRect = this._markerTrackLane.getTimecodedRect();

    switch (this._style.markerRenderType) {
      case 'default':
        return {
          area: {
            y: timecodedRect.y,
            height: timecodedRect.height,
          },
          handle: {
            y: timecodedRect.height / 2,
            height: 0,
          },
        };
      case 'spanning-over-all-lanes':
        return {
          area: {
            y: 0,
            height: timelineTimecodedRect.height,
          },
          handle: {
            y: timecodedRect.y + timecodedRect.height / 2,
            height: 0,
          },
        };
      default:
        throw new Error(`Unsupported timeline render type: ${this._style.markerRenderType}`);
    }
  }

  protected onDragMove(newPosition: Position): Position {
    let newX = this._timeline.constrainTimelinePosition(newPosition.x);
    return {
      x: newX,
      y: this.getVerticals().area.y, // restrict vertical movement
    };
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }
}

class MarkerViewMoment extends BaseMarkerViewInnerComponent {
  protected _handle?: MarkerViewHandleComponent | undefined;

  constructor(args: BaseMarkerViewInnerComponentArgs) {
    super(args);

    this.update(args.markerState);
  }

  refreshTimelinePosition(): void {
    this._handle?.setPosition({
      ...this._handle?.getPosition(),
      x: this._timeline.timeToTimelinePosition(TimedItemTemporalUtil.extractStartTime(this._markerState.temporal)!),
    });
  }

  protected render(): void {
    this._renderBreaker.break();

    this._group.destroyChildren();

    this.renderHandle();

    this._handle?.konvaNode.moveToTop();

    this.refreshTimelinePosition();
  }

  protected renderHandle() {
    let startX = this._timeline!.timeToTimelinePosition(TimedItemTemporalUtil.extractStartTime(this._markerState.temporal)!);

    this._handle = new MarkerViewHandleComponent(
      {
        x: startX,
        editable: this._editable,
        verticalsProviderFn: () => {
          return this.getVerticals();
        },
        dragPositionConstrainerFn: (newPosition: Position) => {
          return this.onDragMove(newPosition);
        },
        handleType: MarkerViewHandleType.CENTER,
      },
      this._style
    );

    this._handle.onClick$.pipe(takeUntil(this._renderBreaker.observer)).subscribe((event) => {
      this._onHandleClick$.next(event);
    });

    this._handle.onDragStart = () => {
      this._onHandleDragStart$.next();
    };

    this._handle.onDragEnd = (markerHandleGroup) => {
      this._onHandleDragEnd$.next();
      if (this._editable) {
        let newTime = this._timeline!.timelinePositionToTime(markerHandleGroup.x());

        if (this._markerState.temporal.type === TimedItemTemporalType.MOMENT) {
          this._updateHook({
            temporal: {
              type: TimedItemTemporalType.MOMENT,
              time: `${newTime}`,
            },
          });
        } else if (this._markerState.temporal.type === TimedItemTemporalType.SPAN) {
          // in case we have spanning threshold
          let duration = TimedItemTemporalUtil.extractDuration(this._markerState.temporal)!;
          this._updateHook({
            temporal: {
              type: TimedItemTemporalType.SPAN,
              start: `${newTime}`,
              end: `${newTime + duration}`,
            },
          });
        }
      }
    };

    this._group.add(this._handle.konvaNode);
  }
}

class MarkerViewPeriod extends BaseMarkerViewInnerComponent {
  protected _startHandle?: MarkerViewHandleComponent | undefined;
  protected _endHandle?: MarkerViewHandleComponent | undefined;

  protected _spanShift:
    | {
        duration: number;
        startHandleInitialPosition: Position;
        endHandleInitialPosition: Position;
      }
    | undefined = void 0;

  protected _selectedAreaRect?: Konva.Rect | undefined;
  protected _markerStriptRect?: Konva.Rect | undefined;

  constructor(args: BaseMarkerViewInnerComponentArgs) {
    super(args);

    this.update(args.markerState);
  }

  protected render() {
    this._group.destroyChildren();

    this.renderStartHandle();
    this.renderEndHandle();

    this.renderSelectedArea();

    this._startHandle?.konvaNode.moveToTop();
    this._endHandle?.konvaNode.moveToTop();

    this.refreshTimelinePosition();
  }

  refreshTimelinePosition() {
    this._startHandle?.setPosition({
      ...this._startHandle?.getPosition(),
      x: this._timeline.timeToTimelinePosition(TimedItemTemporalUtil.extractStartTime(this._markerState.temporal)!),
    });

    this._endHandle?.setPosition({
      ...this._endHandle?.getPosition(),
      x: this._timeline.timeToTimelinePosition(TimedItemTemporalUtil.extractEndTime(this._markerState.temporal)!),
    });

    this._selectedAreaRect?.setAttrs({
      ...this.getVerticals().area,
    });

    this._markerStriptRect?.setAttrs({
      ...this.getHandleAreaVerticals(),
    });

    this.settleAreaHorizontals();
  }

  protected getHandleAreaVerticals(): Verticals {
    let verticals = this.getVerticals();
    let symbolVerticals = MarkerViewHandleSymbolUtil.resolveSymbolVerticals(this._style);
    return {
      y: verticals.area.y + verticals.handle.y + symbolVerticals.y,
      height: symbolVerticals.height,
    };
  }

  protected renderStartHandle() {
    this._startHandle?.destroy();
    this._startHandle = void 0;
    let startTime = TimedItemTemporalUtil.extractStartTime(this._markerState.temporal);

    if (startTime !== void 0) {
      let startX = this._timeline.timeToTimelinePosition(startTime);
      this._startHandle = new MarkerViewHandleComponent(
        {
          x: startX,
          editable: this._editable,
          verticalsProviderFn: () => {
            return this.getVerticals();
          },
          dragPositionConstrainerFn: (newPosition: Position) => {
            return this.onDragMove(newPosition);
          },
          handleType: MarkerViewHandleType.START,
        },
        this._style
      );

      this._startHandle.onClick$.pipe(takeUntil(this._renderBreaker.observer)).subscribe((event) => {
        this._onHandleClick$.next(event);
      });

      this._startHandle.onMouseMove$.pipe(takeUntil(this._renderBreaker.observer)).subscribe((event) => {
        this._onHandleMouseMove$.next(event);
      });

      this._startHandle.onDragStart = (handleGroup, event) => {
        this._onHandleDragStart$.next();
        if (this._editable) {
          if (event.evt.shiftKey && this._markerState.temporal.type === TimedItemTemporalType.SPAN) {
            this._spanShift = {
              duration: TimedItemTemporalUtil.extractDuration(this._markerState.temporal)!,
              startHandleInitialPosition: this._startHandle!.getPosition(),
              endHandleInitialPosition: this._endHandle!.getPosition(),
            };
          } else {
            this._spanShift = void 0;
          }
        }
      };

      this._startHandle.onDragMove = (handleGroup, event) => {
        if (this._editable) {
          if (this._endHandle) {
            if (this._spanShift) {
              let newTime = this._timeline!.timelinePositionToTime(handleGroup.x());
              let otherTime = newTime + this._spanShift.duration;
              let otherHandleX = this._timeline.timeToTimelinePosition(otherTime);
              this._endHandle.setPosition({
                ...this._endHandle.getPosition(),
                x: otherHandleX,
              });
            } else {
              if (handleGroup.x() >= this._endHandle.getPosition().x) {
                handleGroup.x(this._endHandle.getPosition().x);
              }
            }
          }

          this.settleAreaHorizontals();
          this._markerStriptRect?.opacity(1);
        }
      };

      this._startHandle.onDragEnd = (handleGroup) => {
        this._onHandleDragEnd$.next();
        if (this._editable) {
          let newStartTime = this._timeline!.timelinePositionToTime(handleGroup.x());
          if (this._markerState.temporal.type === TimedItemTemporalType.SPAN || this._markerState.temporal.type === TimedItemTemporalType.SPAN_START) {
            if (this._spanShift) {
              let newEndTime = this._timeline!.timelinePositionToTime(this._endHandle!.getPosition().x);
              this._updateHook({
                temporal: {
                  type: TimedItemTemporalType.SPAN,
                  start: `${newStartTime}`,
                  end: `${newEndTime}`,
                },
              });
            } else {
              this._updateHook({
                temporal: {
                  ...this._markerState.temporal,
                  start: `${newStartTime}`,
                },
              });
            }
          }
          this._markerStriptRect?.opacity(this._style.markerHandleAreaOpacity);
        }
      };

      this._group.add(this._startHandle.konvaNode);
    }
  }

  protected renderEndHandle() {
    this._endHandle?.destroy();
    this._endHandle = void 0;
    let endTime = TimedItemTemporalUtil.extractEndTime(this._markerState.temporal);
    if (endTime !== void 0) {
      let endX = this._timeline.timeToTimelinePosition(endTime);
      this._endHandle = new MarkerViewHandleComponent(
        {
          x: endX,
          editable: this._editable,
          verticalsProviderFn: () => {
            return this.getVerticals();
          },
          dragPositionConstrainerFn: (newPosition: Position) => {
            return this.onDragMove(newPosition);
          },
          handleType: MarkerViewHandleType.END,
        },
        this._style
      );

      this._endHandle.onClick$.pipe(takeUntil(this._renderBreaker.observer)).subscribe((event) => {
        this._onHandleClick$.next(event);
      });

      this._endHandle.onMouseMove$.pipe(takeUntil(this._renderBreaker.observer)).subscribe((event) => {
        this._onHandleMouseMove$.next(event);
      });

      this._endHandle.onDragStart = (handleGroup, event) => {
        this._onHandleDragStart$.next();
        if (this._editable) {
          if (event.evt.shiftKey && this._markerState.temporal.type === TimedItemTemporalType.SPAN) {
            this._spanShift = {
              duration: TimedItemTemporalUtil.extractDuration(this._markerState.temporal)!,
              startHandleInitialPosition: this._startHandle!.getPosition(),
              endHandleInitialPosition: this._endHandle!.getPosition(),
            };
          } else {
            this._spanShift = void 0;
          }
        }
      };

      this._endHandle.onDragMove = (handleGroup, event) => {
        if (this._editable) {
          if (this._startHandle) {
            if (this._spanShift) {
              let newTime = this._timeline!.timelinePositionToTime(handleGroup.x());
              let otherTime = newTime - this._spanShift.duration;
              let otherHandleX = this._timeline.timeToTimelinePosition(otherTime);
              this._startHandle.setPosition({
                ...this._startHandle.getPosition(),
                x: otherHandleX,
              });
            }
            if (handleGroup.x() < this._startHandle.getPosition().x) {
              handleGroup.x(this._startHandle.getPosition().x);
            }
          }
          this.settleAreaHorizontals();
          if (this._markerStriptRect) {
            this._markerStriptRect.opacity(1);
          }
        }
      };

      this._endHandle.onDragEnd = (markerHandleGroup) => {
        this._onHandleDragEnd$.next();
        if (this._editable) {
          let newEndTime = this._timeline!.timelinePositionToTime(markerHandleGroup.x());
          if (this._markerState.temporal.type === TimedItemTemporalType.SPAN || this._markerState.temporal.type === TimedItemTemporalType.SPAN_END) {
            if (this._spanShift) {
              let newStartTime = this._timeline!.timelinePositionToTime(this._startHandle!.getPosition().x);
              this._updateHook({
                temporal: {
                  type: TimedItemTemporalType.SPAN,
                  start: `${newStartTime}`,
                  end: `${newEndTime}`,
                },
              });
            } else {
              this._updateHook({
                temporal: {
                  ...this._markerState.temporal,
                  end: `${newEndTime}`,
                },
              });
            }
          }
          this._markerStriptRect?.opacity(this._style.markerHandleAreaOpacity);
        }
      };
      this._group.add(this._endHandle.konvaNode);
    }
  }

  protected renderSelectedArea() {
    this._selectedAreaRect?.destroy();
    this._markerStriptRect?.destroy();

    this._selectedAreaRect = void 0;
    this._markerStriptRect = void 0;

    this._selectedAreaRect = KonvaFactory.createRect({
      // listening: true,
      listening: false,
      fill: this._style.markerColor,
      opacity: this._style.markerAreaOpacity,
    });

    this._markerStriptRect = KonvaFactory.createRect({
      listening: false,
      // listening: true,
      fill: this._style.markerColor,
      opacity: this._style.markerHandleAreaOpacity,
    });

    this._group.add(this._selectedAreaRect);
    this._group.add(this._markerStriptRect);
  }

  protected settleAreaHorizontals() {
    if (this._startHandle && this._endHandle) {
      this._selectedAreaRect?.setAttrs({
        x: this._startHandle.getPosition().x,
        width: this._endHandle.getPosition().x - this._startHandle.getPosition().x,
      });

      this._markerStriptRect?.setAttrs({
        x: this._startHandle.getPosition().x,
        width: this._endHandle.getPosition().x - this._startHandle.getPosition().x,
      });
    }
  }
}

interface MarkerViewHandleVerticals {
  area: Verticals;
  handle: Verticals;
}

enum MarkerViewHandleType {
  START = 'START',
  END = 'END',
  CENTER = 'CENTER',
}

export class MarkerViewHandleSymbolUtil {
  static create(symbol: MarkerOnMarkerTrackLaneStyle['markerSymbol'], handleType: MarkerViewHandleType, symbolSize: number, color: string): Konva.Shape {
    const halfSymbolSize = new Decimal(symbolSize / 2).toDecimalPlaces(2).toNumber();

    switch (symbol) {
      case 'none':
        if (handleType === MarkerViewHandleType.CENTER) {
          return new Konva.Line({
            points: [0, 0, 0, symbolSize],
            stroke: color,
            strokeWidth: 1,
            closed: false,
            offsetY: halfSymbolSize,
          });
        } else {
          const borderWidth = 1;
          const colorDiffPercent = 30;
          const borderColor = ColorUtil.lightenColor(color, colorDiffPercent * (ColorUtil.isLightColor(color) ? -1 : 1));

          return new Konva.Rect({
            width: borderWidth,
            height: symbolSize,
            fill: borderColor,
            opacity: 1,
            offsetY: halfSymbolSize,
            offsetX: handleType === MarkerViewHandleType.START ? 0 : borderWidth,
          });
        }
      case 'triangle':
        if (handleType === MarkerViewHandleType.CENTER) {
          return new Konva.Line({
            points: [-halfSymbolSize, 0, halfSymbolSize, 0, 0, symbolSize],
            fill: color,
            closed: true,
            offsetY: halfSymbolSize,
          });
        } else {
          return new Konva.Line({
            points: handleType === MarkerViewHandleType.START ? [-halfSymbolSize, 0, 0, 0, 0, symbolSize] : [0, 0, halfSymbolSize, 0, 0, symbolSize],
            fill: color,
            closed: true,
            offsetY: halfSymbolSize,
          });
        }
      case 'circle':
        if (handleType === MarkerViewHandleType.CENTER) {
          return new Konva.Circle({
            fill: color,
            radius: halfSymbolSize,
          });
        } else {
          return new Konva.Arc({
            fill: color,
            innerRadius: 0,
            outerRadius: halfSymbolSize,
            angle: 180,
            rotation: handleType === MarkerViewHandleType.START ? 90 : -90,
          });
        }
      case 'square': {
        const side = new Decimal(symbolSize).div(Decimal.sqrt(2)).toDecimalPlaces(2).toNumber();
        const halfSide = new Decimal(side / 2).toDecimalPlaces(2).toNumber();
        if (handleType === MarkerViewHandleType.CENTER) {
          return KonvaFactory.createRect({
            fill: color,
            width: side,
            height: side,
            rotation: 45,
            offsetX: halfSide,
            offsetY: halfSide,
          });
        } else {
          return new Konva.Line({
            points: [0, 0, side, 0, side, side],
            fill: color,
            closed: true,
            rotation: handleType === MarkerViewHandleType.START ? 225 : 45,
            offsetX: halfSide,
            offsetY: halfSide,
          });
        }
      }
      default:
        throw new Error(`Unsupported symbol type: ${symbol}`);
    }
  }

  static resolveSymbolVerticals(style: MarkerOnMarkerTrackLaneStyle): Verticals {
    let symbol = style.markerSymbol;
    let symbolSize = style.markerSymbolSize;

    const halfSymbolSize = symbolSize / 2;
    switch (symbol) {
      case 'none':
      case 'triangle':
      case 'circle':
        return {y: -halfSymbolSize, height: symbolSize};
      case 'square': {
        const side = new Decimal(symbolSize).div(Decimal.sqrt(2)).toDecimalPlaces(2).toNumber();
        const halfSide = side / 2;
        return {y: -halfSide, height: side};
      }
      default:
        throw new Error(`Unsupported symbol: ${symbol}`);
    }
  }
}

interface MarkerViewHandleConfig {
  x: number;
  editable: boolean;
  verticalsProviderFn: () => MarkerViewHandleVerticals;
  dragPositionConstrainerFn: (newPosition: Position) => Position;
  handleType: MarkerViewHandleType;
}

class MarkerViewHandleComponent extends BaseKonvaComponent2<Konva.Group> {
  protected _config: MarkerViewHandleConfig;
  protected _style: MarkerOnMarkerTrackLaneStyle;

  protected _onClick$: Subject<ClickEvent> = new Subject();
  protected _onMouseMove$: Subject<MouseMoveEvent> = new Subject();

  private _group: Konva.Group;
  private _symbol: Konva.Shape;
  private _line: Konva.Line;
  private _handleSymbolGroup: Konva.Group;

  private _editable: boolean;
  private _verticalsProviderFn: () => MarkerViewHandleVerticals;
  private _dragPositionConstrainerFn: (newPosition: Position) => Position;

  onDragStart: (handleGroup: Konva.Group, event: KonvaEventObject<any, Konva.Group>) => void = (handleGroup, event) => {};
  onDragMove: (handleGroup: Konva.Group, event: KonvaEventObject<any, Konva.Group>) => void = (handleGroup, event) => {};
  onDragEnd: (handleGroup: Konva.Group, event: KonvaEventObject<any, Konva.Group>) => void = (handleGroup, event) => {};

  constructor(config: MarkerViewHandleConfig, style: MarkerOnMarkerTrackLaneStyle) {
    super();

    this._config = config;
    this._style = style;

    this._editable = this._config.editable;
    this._verticalsProviderFn = this._config.verticalsProviderFn;
    this._dragPositionConstrainerFn = this._config.dragPositionConstrainerFn;

    this._group = new Konva.Group({
      x: this._config.x,
      draggable: this._editable,
    });

    this._line = new Konva.Line({
      stroke: this._style.markerColor,
      strokeWidth: this._style.markerLineStrokeWidth,
      opacity: this._style.markerLineOpacity,
      points: [0, 0, 0, 0],
      listening: false,
    });

    this._handleSymbolGroup = new Konva.Group({
      x: 0,
    });

    this._symbol = this.createSymbol();
    this._handleSymbolGroup.add(this._symbol);

    this._handleSymbolGroup.on('mousemove', (event) => {
      this._onMouseMove$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
      });
    });

    this._handleSymbolGroup.on('mouseover', (event) => {
      if (this._editable) {
        this._handleSymbolGroup.to({
          scaleX: this._style.markerHandleMouseOverScale,
          scaleY: this._style.markerHandleMouseOverScale,
          duration: 0.1,
        });
        if (this._style.markerHandleMouseOverCursor) {
          WindowUtil.cursor(this._style.markerHandleMouseOverCursor);
        }
      }
    });

    this._handleSymbolGroup.on('mouseleave', () => {
      if (this._editable) {
        this._handleSymbolGroup.to({
          scaleX: 1,
          scaleY: 1,
          duration: 0.1,
        });
        if (this._style.markerHandleMouseLeaveCursor) {
          WindowUtil.cursor(this._style.markerHandleMouseLeaveCursor);
        }
      }
    });

    this._handleSymbolGroup.on('click touchend', (event) => {
      this._onClick$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
      });
    });

    this._group.add(this._line);
    this._group.add(this._handleSymbolGroup);

    this._group.on('dragstart', (event) => {
      event.cancelBubble = true;
      if (!this._editable) {
        event.target.stopDrag();
      } else {
        this.onDragStart(this._group, event);
        WindowUtil.cursor('grabbing');
      }
    });

    this._group.on('dragmove', (event) => {
      event.cancelBubble = true;
      this._group.setAttrs(this._dragPositionConstrainerFn(this._group.getPosition()));
      this.onDragMove(this._group, event);
    });

    this._group.on('dragend', (event) => {
      event.cancelBubble = true;
      this._group.setAttrs(this._dragPositionConstrainerFn(this._group.getPosition()));
      this.onDragEnd(this._group, event);
      this._handleSymbolGroup.scaleX(1);
      this._handleSymbolGroup.scaleY(1);
      WindowUtil.cursor('default');
    });
  }

  get onClick$(): Observable<ClickEvent> {
    return this._onClick$.asObservable();
  }

  get onMouseMove$(): Observable<MouseMoveEvent> {
    return this._onMouseMove$.asObservable();
  }

  protected createSymbol(): Konva.Shape {
    const halfSymbolSize = new Decimal(this._style.markerSymbolSize / 2).toDecimalPlaces(2).toNumber();
    const style = this._style;
    switch (style.markerSymbol) {
      case 'none':
        if (this._config.handleType === MarkerViewHandleType.CENTER) {
          return new Konva.Line({
            points: [0, 0, 0, style.markerSymbolSize],
            stroke: style.markerColor,
            strokeWidth: 1,
            closed: false,
            offsetY: halfSymbolSize,
          });
        } else {
          const borderWidth = 1;
          const colorDiffPercent = 30;
          const borderColor = ColorUtil.lightenColor(style.markerColor, colorDiffPercent * (ColorUtil.isLightColor(style.markerColor) ? -1 : 1));

          return new Konva.Rect({
            width: borderWidth,
            height: style.markerSymbolSize,
            fill: borderColor,
            opacity: 1,
            offsetY: halfSymbolSize,
            offsetX: this._config.handleType === MarkerViewHandleType.START ? 0 : borderWidth,
          });
        }
      case 'triangle':
        if (this._config.handleType === MarkerViewHandleType.CENTER) {
          return new Konva.Line({
            points: [-halfSymbolSize, 0, halfSymbolSize, 0, 0, style.markerSymbolSize],
            fill: style.markerColor,
            closed: true,
            offsetY: halfSymbolSize,
          });
        } else {
          return new Konva.Line({
            points: this._config.handleType === MarkerViewHandleType.START ? [-halfSymbolSize, 0, 0, 0, 0, style.markerSymbolSize] : [0, 0, halfSymbolSize, 0, 0, style.markerSymbolSize],
            fill: style.markerColor,
            closed: true,
            offsetY: halfSymbolSize,
          });
        }
      case 'circle':
        if (this._config.handleType === MarkerViewHandleType.CENTER) {
          return new Konva.Circle({
            fill: style.markerColor,
            radius: halfSymbolSize,
          });
        } else {
          return new Konva.Arc({
            fill: style.markerColor,
            innerRadius: 0,
            outerRadius: halfSymbolSize,
            angle: 180,
            rotation: this._config.handleType === MarkerViewHandleType.START ? 90 : -90,
          });
        }
      case 'square': {
        const side = new Decimal(style.markerSymbolSize).div(Decimal.sqrt(2)).toDecimalPlaces(2).toNumber();
        const halfSide = new Decimal(side / 2).toDecimalPlaces(2).toNumber();
        if (this._config.handleType === MarkerViewHandleType.CENTER) {
          return KonvaFactory.createRect({
            fill: style.markerColor,
            width: side,
            height: side,
            rotation: 45,
            offsetX: halfSide,
            offsetY: halfSide,
          });
        } else {
          return new Konva.Line({
            points: [0, 0, side, 0, side, side],
            fill: style.markerColor,
            closed: true,
            rotation: this._config.handleType === MarkerViewHandleType.START ? 225 : 45,
            offsetX: halfSide,
            offsetY: halfSide,
          });
        }
      }
      default:
        throw new Error(`Unsupported symbol: ${style.markerSymbol}`);
    }
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  /**
   * Caution: returns group that is draggable
   */
  getPosition(): Position {
    return this._group.getPosition();
  }

  setPosition(position: Position) {
    this._group.setAttrs({
      ...position,
    });

    let verticals = this._verticalsProviderFn();

    this._group.setAttrs({
      y: verticals.area.y,
    });

    this._line.setAttrs({
      points: [0, 0, 0, verticals.area.height],
    });

    this._handleSymbolGroup.setAttrs({
      y: verticals.handle.y,
    });
  }

  get handleSymbolGroup(): Konva.Group {
    return this._handleSymbolGroup;
  }

  destroy() {
    super.destroy();

    freeObserver(this._onClick$);
    freeObserver(this._onMouseMove$);
  }
}
