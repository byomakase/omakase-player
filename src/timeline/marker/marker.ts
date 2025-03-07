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

import {Position} from '../../common';
import {BaseKonvaComponent, ComponentConfig, KonvaComponent} from '../../layout/konva-component';
import Konva from 'konva';
import {MarkerLane} from './marker-lane';
import {MarkerChangeEvent, MarkerEvent, TimeObservation} from '../../types';
import {Observable, Subject} from 'rxjs';
import {Timeline} from '../timeline';
import {Validators} from '../../validators';
import {completeUnsubscribeSubjects} from '../../util/rxjs-util';
import {StringUtil} from '../../util/string-util';
import {konvaUnlistener} from '../../util/konva-util';
import {MarkerHandleVerticals, MarkerStyle} from './marker-types';
import {MarkerApi} from '../../api';
import {CryptoUtil} from '../../util/crypto-util';

export interface MarkerConfig<T extends TimeObservation, S extends MarkerStyle> extends ComponentConfig<S> {
  timeObservation: T;

  id?: string;
  text?: string;
  editable?: boolean;
}

export interface Marker extends MarkerApi, KonvaComponent<MarkerConfig<any, any>, MarkerStyle, Konva.Group> {
  onClick$: Observable<MarkerEvent>;
  onMouseEnter$: Observable<MarkerEvent>;
  onMouseLeave$: Observable<MarkerEvent>;
  onMouseOver$: Observable<MarkerEvent>;
  onMouseOut$: Observable<MarkerEvent>;

  refreshTimelinePosition(): void;

  get timeObservation(): TimeObservation;

  set timeObservation(timeObservation: TimeObservation);

  get editable(): boolean;

  set editable(editable: boolean);

  get text(): string | undefined;

  get style(): MarkerStyle;

  set style(s: MarkerStyle);
}

export abstract class BaseMarker<T extends TimeObservation, C extends MarkerConfig<T, S>, S extends MarkerStyle, E extends MarkerChangeEvent>
  extends BaseKonvaComponent<C, S, Konva.Group>
  implements Marker
{
  public readonly onClick$: Subject<MarkerEvent> = new Subject<MarkerEvent>();
  public readonly onMouseEnter$: Subject<MarkerEvent> = new Subject<MarkerEvent>();
  public readonly onMouseLeave$: Subject<MarkerEvent> = new Subject<MarkerEvent>();
  public readonly onMouseOver$: Subject<MarkerEvent> = new Subject<MarkerEvent>();
  public readonly onMouseOut$: Subject<MarkerEvent> = new Subject<MarkerEvent>();
  public readonly onDestroy$: Subject<MarkerEvent> = new Subject<MarkerEvent>();

  public readonly onChange$: Subject<E> = new Subject<E>();

  protected _group: Konva.Group;
  protected _timeline?: Timeline;
  protected _markerLane?: MarkerLane;

  protected _id: string;
  protected _timeObservation: T;
  protected _editable: boolean;
  private _text?: string;
  protected _data?: Record<string, any>;

  protected constructor(config: C) {
    super(config);

    this._id = StringUtil.isNullUndefinedOrWhitespace(this.config.id) ? CryptoUtil.uuid() : Validators.id()(this.config.id!);

    this._timeObservation = this.config.timeObservation;
    this._editable = this.config.editable ? Validators.boolean()(this.config.editable!) : false;
    this._text = this.config.text;

    this._group = new Konva.Group({
      name: 'BaseMarkerGroup',
    });

    this._group.on('click', (event) => {
      this.onClick$.next({});
    });

    this._group.on('mouseenter', (event) => {
      this.onMouseEnter$.next({});
    });

    this._group.on('mouseleave', (event) => {
      this.onMouseLeave$.next({});
    });

    this._group.on('mouseover', (event) => {
      this.onMouseOver$.next({});
    });

    this._group.on('mouseout', (event) => {
      this.onMouseOut$.next({});
    });
  }

  protected provideKonvaNode(): Konva.Group {
    if (!this._timeline) {
      throw new Error(`Marker not attached to timeline`);
    }

    return this._group;
  }

  protected abstract onObservationChange(): void;

  abstract refreshTimelinePosition(): void;

  override destroy() {
    super.destroy();

    this.onDestroy$.next({});

    konvaUnlistener(this._group);

    completeUnsubscribeSubjects(this.onChange$, this.onClick$, this.onMouseEnter$, this.onMouseLeave$, this.onMouseOver$, this.onMouseOut$);
  }

  attachToTimeline(timeline: Timeline, markerLane: MarkerLane) {
    this._timeline = timeline;
    this._markerLane = markerLane;
  }

  protected getMarkerHandleVerticals(): MarkerHandleVerticals {
    if (!this._timeline) {
      throw new Error(`Marker not attached to timeline`);
    }

    let timelineTimecodedRect = this._timeline!.getTimecodedFloatingDimension();
    let timecodedRect = this._markerLane!.getTimecodedRect();

    switch (this.style.renderType) {
      case 'spanning':
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
      case 'lane':
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
      default:
        throw new Error('Marker renderType incorrect');
    }
  }

  protected onDragMove(newPosition: Position): Position {
    if (!this._timeline) {
      throw new Error(`Marker not attached to timeline`);
    }

    let newX = this._timeline.constrainTimelinePosition(newPosition.x);
    return {
      x: newX,
      y: this.getMarkerHandleVerticals().area.y, // restrict vertical movement
    };
  }

  get timeObservation(): T {
    return this._timeObservation;
  }

  set timeObservation(value: T) {
    if (this.editable) {
      this._timeObservation = value;
      this.onObservationChange();
    }
  }

  get editable(): boolean {
    return this._editable;
  }

  set editable(value: boolean) {
    this._editable = value;
  }

  get id(): string {
    return this._id;
  }

  get text(): string | undefined {
    return this._text;
  }

  get name(): string | undefined {
    return this._text;
  }

  set name(name: string | undefined) {
    this._text = name;
  }

  get data(): Record<string, any> | undefined {
    return this._data;
  }

  set data(data: Record<string, any> | undefined) {
    this._data = data;
  }
}
