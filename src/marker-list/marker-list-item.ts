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

import {MarkerApi, MarkerStyle, MarkerTimeObservation} from '../api';
import {MarkerAwareApi} from '../api/marker-aware-api';
import {MomentObservation, PeriodObservation} from '../types';
import {CryptoUtil} from '../util/crypto-util';
import Decimal from 'decimal.js';

export class MarkerListItem implements MarkerApi {
  readonly id: string;
  private _source: MarkerAwareApi;
  private _name?: string;
  private _thumbnail?: string;
  private _timeObservation: PeriodObservation | MomentObservation;
  private _data?: Record<string, any>;
  private _style: MarkerStyle;
  private _editable: boolean;

  constructor(initData: Partial<MarkerApi> = {}, source: MarkerAwareApi) {
    this.id = initData.id ?? CryptoUtil.uuid();
    this._style = initData.style ?? {color: '#000'};
    this._name = initData.name;
    this._timeObservation = initData.timeObservation ?? {};
    this._data = initData.data;
    this._source = source;
    this._editable = initData.editable ?? true;
  }

  get name(): string | undefined {
    return this._name;
  }

  set name(name: string | undefined) {
    this._name = name;
  }

  get style(): MarkerStyle {
    return this._style;
  }

  set style(style: MarkerStyle) {
    this._style = style;
  }

  get timeObservation(): MarkerTimeObservation {
    return this._timeObservation;
  }

  set timeObservation(timeObservation: MarkerTimeObservation) {
    this._timeObservation = timeObservation;
  }

  get data(): Record<string, any> | undefined {
    return this._data;
  }

  set data(data: Record<string, any> | undefined) {
    this._data = data;
  }

  get source(): MarkerAwareApi {
    return this._source;
  }

  get thumbnail(): string | undefined {
    return this._thumbnail;
  }

  set thumbnail(thumbnail: string | undefined) {
    this._thumbnail = thumbnail;
  }

  get start(): number | undefined {
    return (this.timeObservation as PeriodObservation).start ?? (this.timeObservation as MomentObservation).time;
  }

  get end(): number | undefined {
    return (this.timeObservation as PeriodObservation).end ?? undefined;
  }

  get duration(): number | undefined {
    if (this.start !== undefined && this.end !== undefined) {
      return Math.max(new Decimal(this.end).sub(this.start).toNumber(), 0);
    } else {
      return undefined;
    }
  }

  get editable(): boolean {
    return this._editable;
  }

  set editable(editable: boolean) {
    this.editable = editable;
  }
}
