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

import type {Color} from './ui-style';
import type {ResourceEntity} from '../entity';
import {type TimedItemTemporal, TimedItemTemporalType, TimedItemTemporalUtil} from '../media/timed-items-track';
import Decimal from 'decimal.js';

export interface MarkerStyle {
  markerColor: Color;
  /** Uses resource (e.g. svg markup {@link DefaultSvgResource}) for marker presentation instead of shapes {@link markerSymbol}. */
  customMarkerSymbolResource?: ResourceEntity['id'] | undefined;
}

export interface MarkerTrackStyle extends MarkerStyle {
  /**
   * Threshold in seconds for considering a marker to render as a MOMENT_MARKER instead of SPANNING_MARKER.
   */
  momentToSpanningThreshold?: number | undefined;
}

export const MARKER_STYLE_DEFAULT: MarkerStyle = {
  markerColor: 'teal',
};

export const MARKER_TRACK_STYLE_DEFAULT: MarkerTrackStyle = {
  ...MARKER_STYLE_DEFAULT,
};

export function isPresentedAsMomentMarker(temporal: TimedItemTemporal, style: Partial<MarkerTrackStyle>): boolean {
  if (temporal.type === TimedItemTemporalType.MOMENT) {
    return true;
  }
  if (temporal.type !== TimedItemTemporalType.SPAN || !style.momentToSpanningThreshold) {
    return false;
  }
  const duration = TimedItemTemporalUtil.extractDuration(temporal);
  return duration !== undefined && new Decimal(style.momentToSpanningThreshold).greaterThan(duration);
}
