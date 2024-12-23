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

import {Verticals} from '../../common';

export type MarkerRender = 'lane' | 'spanning';
export type MarkerSymbolType = 'none' | 'square' | 'triangle' | 'circle';

export interface MarkerStyle {
  color: string;
  renderType: MarkerRender;
  symbolType: MarkerSymbolType;
  symbolSize: number;
  lineStrokeWidth: number;
  lineOpacity: number;
}

export interface MarkerHandleStyle {
  color: string;
  symbolType: MarkerSymbolType;
  symbolSize: number;
  lineStrokeWidth: number;
  lineOpacity: number;
}

export interface MarkerHandleVerticals {
  area: Verticals;
  handle: Verticals;
}

export const MARKER_STYLE_DEFAULT: MarkerStyle = {
  color: '#FF4991FF',
  renderType: 'lane',
  symbolType: 'square',
  symbolSize: 20,
  lineStrokeWidth: 1,
  lineOpacity: 0.7,
};
