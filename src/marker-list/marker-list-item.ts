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

import {type MarkerState, type MarkerTrack, type MarkerType, TimedItemTemporalType, TimedItemTemporalUtil} from '../media';
import Decimal from 'decimal.js';
import {type StyledElement, type UiApi} from '../ui';
import type {MarkerOnMarkerListStyle} from './marker-list';

export class MarkerListItem {
  private readonly _markerId: string;
  private _label: string;
  private _thumbnailUrl?: string | undefined;
  private _start?: string | undefined;
  private _end?: string | undefined;
  private _data?: Record<string, any> | undefined;
  private _track: MarkerTrack;
  private _markerType: MarkerType;
  private _styledElement: StyledElement<MarkerOnMarkerListStyle>;
  private _ui: UiApi;

  constructor(marker: MarkerState, track: MarkerTrack, ui: UiApi) {
    this._markerId = marker.id;
    this._label = marker.label ?? '';
    this._markerType = marker.markerType;
    if (marker.temporal.type === TimedItemTemporalType.MOMENT) {
      this._start = marker.temporal.time;
    } else {
      this._start = TimedItemTemporalUtil.extractStartTime(marker.temporal)?.toString();
      this._end = TimedItemTemporalUtil.extractEndTime(marker.temporal)?.toString();
    }
    this._data = marker.data;
    this._track = track;
    this._ui = ui;
    this._styledElement = {
      id: marker.id,
      parent: {
        id: this._track!.id,
        classes: [this._ui.resolveStyleClass('MarkerOnMarkerList')],
        parent: {
          classes: [this._ui!.resolveStyleClass('MarkerTrack')],
          parent: {
            classes: [this._ui!.resolveStyleClass('Marker')],
          },
        },
      },
    };
  }

  get markerId(): string {
    return this._markerId;
  }

  get track(): MarkerTrack {
    return this._track;
  }

  get label(): string | undefined {
    return this._label;
  }

  set label(label: string | undefined) {
    this._label = label ?? '';
  }

  get data(): Record<string, any> | undefined {
    return this._data;
  }

  set data(data: Record<string, any> | undefined) {
    this._data = data;
  }

  get thumbnailUrl(): string | undefined {
    return this._thumbnailUrl;
  }

  set thumbnailUrl(thumbnail: string | undefined) {
    this._thumbnailUrl = thumbnail;
  }

  get start(): string | undefined {
    return this._start;
  }

  get numStart(): number | undefined {
    return this._start !== undefined ? Decimal(this._start).toNumber() : undefined;
  }

  set start(start: string | undefined) {
    this._start = start?.toString();
  }

  get end(): string | undefined {
    return this._end;
  }

  get numEnd(): number | undefined {
    return this._end !== undefined ? Decimal(this._end).toNumber() : undefined;
  }

  set end(end: number | undefined) {
    this._end = end?.toString();
  }

  get duration(): number | undefined {
    if (this.start !== undefined && this.end !== undefined) {
      return Math.max(new Decimal(this.end).sub(this.start).toNumber(), 0);
    } else {
      return undefined;
    }
  }

  get markerType(): MarkerType {
    return this._markerType;
  }

  get styledElement(): StyledElement {
    return this._styledElement;
  }

  get style(): MarkerOnMarkerListStyle {
    return this._ui.resolveStyle(this._styledElement) as MarkerOnMarkerListStyle;
  }

  get state(): MarkerState {
    return this.track.getTimedItem(this._markerId)!.state;
  }
}
