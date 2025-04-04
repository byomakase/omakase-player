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

import {MomentObservation, PeriodObservation} from '../types';

export type MarkerTimeObservation = PeriodObservation | MomentObservation;

export interface MarkerStyle {
  color: string;
}

export interface MarkerApi {
  get id(): string;

  get name(): string | undefined;

  set name(name: string | undefined);

  get timeObservation(): MarkerTimeObservation;

  set timeObservation(t: MarkerTimeObservation);

  get data(): Record<string, any> | undefined;

  set data(data: Record<string, any> | undefined);

  get style(): MarkerStyle;

  set style(style: Partial<MarkerStyle>);

  get editable(): boolean;

  set editable(editable: boolean);
}
