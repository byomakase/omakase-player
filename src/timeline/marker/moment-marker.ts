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
import {BaseMarker, MarkerConfig} from './marker';
import {MomentMarkerChangeEvent, MomentObservation} from '../../types';
import {BaseMarkerHandle, MarkerHandleConfig} from './marker-handle';
import {MarkerLane} from './marker-lane';
import {Timeline} from '../timeline';
import {z} from 'zod';
import {MarkerUtil} from './marker-util';
import {MARKER_STYLE_DEFAULT, MarkerHandleStyle, MarkerStyle} from './marker-types';
import {Position} from '../../common/measurement';
import {ConfigWithOptionalStyle} from '../../layout';

// region marker handle
export interface MomentMarkerHandleStyle extends MarkerHandleStyle {}

export interface MomentMarkerHandleConfig extends MarkerHandleConfig<MomentMarkerHandleStyle> {}

export class MomentMarkerHandle extends BaseMarkerHandle<MomentMarkerHandleConfig, MomentMarkerHandleStyle> {
  constructor(config: MomentMarkerHandleConfig) {
    super(config);
  }

  protected createSymbol(): Konva.Shape {
    return MarkerUtil.createMomentSymbol({
      symbolSize: this.style.symbolSize,
      symbolType: this.style.symbolType,
      color: this.style.color,
    });
  }
}

// endregion

export interface MomentMarkerStyle extends MarkerStyle {}

export interface MomentMarkerConfig extends MarkerConfig<MomentObservation, MomentMarkerStyle> {}

const configDefault: Omit<MomentMarkerConfig, 'timeObservation'> = {
  editable: false,
  style: {
    ...MARKER_STYLE_DEFAULT,
  },
};

export class MomentMarker extends BaseMarker<MomentObservation, MomentMarkerConfig, MomentMarkerStyle, MomentMarkerChangeEvent> {
  private _markerHandle?: MomentMarkerHandle;
  private _maxOpacity?: number;

  constructor(config: ConfigWithOptionalStyle<MomentMarkerConfig>) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._timeObservation.time = z.coerce.number().min(0).parse(this._timeObservation.time);
    this._maxOpacity = this.style.lineOpacity;
  }

  override attachToTimeline(timeline: Timeline, markerLane: MarkerLane) {
    super.attachToTimeline(timeline, markerLane);

    this._styleAdapter.onChange$.subscribe((style) => {
      this.initMarkerHandle();
    });

    this.initMarkerHandle();
  }

  private initMarkerHandle() {
    if (this._markerHandle) {
      this._markerHandle.destroy();
      this._markerHandle = void 0;
    }

    this._markerHandle = this.createMarkerHandle();

    this._group.add(this._markerHandle.konvaNode);

    this.refreshTimelinePosition();
  }

  private createMarkerHandle() {
    let x = this._timeline!.timeToTimelinePosition(this.timeObservation.time);

    let markerHandle = new MomentMarkerHandle({
      x: x,
      editable: this.editable,
      verticalsProviderFn: () => {
        return this.getMarkerHandleVerticals();
      },
      dragPositionConstrainerFn: (newPosition: Position) => {
        return this.onDragMove(newPosition);
      },
      style: {
        color: this.style.color,
        symbolType: this.style.symbolType,
        symbolSize: this.style.symbolSize,
        lineStrokeWidth: this.style.lineStrokeWidth,
        lineOpacity: this.style.lineOpacity,
      },
    });

    markerHandle.onDragEnd = (markerHandleGroup) => {
      if (this.editable) {
        let newTime = this._timeline!.timelinePositionToTime(markerHandleGroup.x());
        this.timeObservation = {
          ...this.timeObservation,
          time: newTime,
        };
      }
    };

    return markerHandle;
  }

  protected onObservationChange() {
    this.refreshTimelinePosition();

    let event: MomentMarkerChangeEvent = {
      timeObservation: this.timeObservation,
    };

    this.onChange$.next(event);
  }

  refreshTimelinePosition() {
    this._markerHandle?.setPosition({
      ...this._markerHandle.getPosition(),
      x: this._timeline!.timeToTimelinePosition(this.timeObservation.time),
    });
  }

  override set editable(value: boolean) {
    super.editable = value;
    if (this._markerHandle) {
      this._markerHandle.editable = value;
    }
  }

  override get editable(): boolean {
    return super.editable;
  }

  get maxOpacity() {
    return this._maxOpacity;
  }
}
