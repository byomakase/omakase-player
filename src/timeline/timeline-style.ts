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

import type {TimelineLaneStyle} from './timeline-lane';
import type {TimelineStyle} from './timeline-api';
import type {ScrubberLaneStyle} from './scrubber';
import type {ThumbnailTrackLaneStyle} from './thumbnail';
import type {MarkerOnMarkerTrackLaneStyle, MarkerTrackLaneStyle} from './marker';
import type {LabelLaneStyle} from './label';
import {TIMELINE} from '../constants';
import {MARKER_TRACK_STYLE_DEFAULT} from '../ui/marker-style'; // keep direct import to prevent circular dependencies
import type {ObservationTrackLaneStyle} from './observation';
import type {TextTrackLaneStyle} from './text';

export const TIMELINE_LANE_STYLE_DEFAULT: TimelineLaneStyle = {
  height: 80,
  marginBottom: 0,
  backgroundFill: '#ffffff',
  backgroundOpacity: 1,
  descriptionTextFill: '#1c1c1c',
  descriptionTextFontSize: 15,
  loadingAnimationFill: '#eaeaea',
  loadingAnimationSpeed: 3000,
};

export const TIMELINE_STYLE_DEFAULT: TimelineStyle = {
  stageMinWidth: 700,
  stageMinHeight: 100,

  textFontFamily: 'Arial',
  textFontStyle: 'normal',

  backgroundFill: '#f5f5f5',
  backgroundOpacity: 1,

  headerHeight: 0,
  headerMarginBottom: 10,
  // headerMarginBottom: 0,
  headerBackgroundFill: '#f5f5f5',
  headerBackgroundOpacity: 1,

  footerHeight: 50,
  footerMarginTop: 10,
  // footerMarginTop: 0,
  footerBackgroundFill: '#f5f5f5',
  footerBackgroundOpacity: 1,

  // scrollbarHeight: 15,
  // scrollbarWidth: 500,
  // scrollbarBackgroundFill: '#000000',
  // scrollbarBackgroundFillOpacity: 0.3,
  // scrollbarHandleBarFill: '#01a6f0',
  // scrollbarHandleBarOpacity: 1,
  // scrollbarHandleOpacity: 1,

  thumbnailHoverWidth: 200,
  thumbnailHoverStroke: 'rgba(255,73,145,0.9)',
  thumbnailHoverStrokeWidth: 5,
  thumbnailHoverYOffset: 0,

  leftPaneWidth: 200,
  rightPaneMarginLeft: 30,
  rightPaneMarginRight: 30,
  rightPaneClipPadding: 20,

  playheadVisible: true,
  playheadFill: '#f43530',
  scrubberSnappedFill: '#ffd500',
  playheadLineWidth: 2,
  playheadSymbolHeight: 15,
  playheadScrubberHeight: 15,
  playheadTextFill: '#ffffff',
  playheadTextYOffset: 0,
  playheadTextFontSize: 12,

  playheadBackgroundFill: '#ffffff',
  playheadBackgroundOpacity: 0,

  playheadPlayProgressFill: '#008cbc',
  playheadPlayProgressOpacity: 0.5,

  playheadBufferedFill: '#a2a2a2',
  playheadBufferedOpacity: 1,

  scrubberVisible: false,
  scrubberFill: '#737373',

  scrubberNorthLineWidth: 2,
  scrubberNorthLineOpacity: 1,
  scrubberSouthLineWidth: 2,
  scrubberSouthLineOpacity: 1,

  scrubberSymbolHeight: 15,
  scrubberTextFill: '#ffffff',
  scrubberTextYOffset: 0,
  scrubberTextFontSize: 12,

  scrubberHeight: 60,
  scrubberMarginBottom: 15,

  loadingAnimationTheme: 'light',
};

export const SCRUBBER_LANE_STYLE_DEFAULT: ScrubberLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  height: 60,
  tickDivisor: 5,
  tickDivisionMinWidth: 18,
  tickFill: '#0d0f05',
  tickHeight: 12,
  divisionTickHeight: 12 * TIMELINE.goldenRatio,
  timecodeShowFirst: true,
  timecodeFontSize: 11,
  timecodeFill: '#0d0f05',
};

export const MARKER_ON_MARKER_TRACK_LANE_STYLE_DEFAULT: MarkerOnMarkerTrackLaneStyle = {
  ...MARKER_TRACK_STYLE_DEFAULT,
  markerSymbol: 'square',
  markerRenderType: 'default',
  markerSymbolSize: 20,
  markerLineStrokeWidth: 1,
  markerLineOpacity: 0.7,
  markerAreaOpacity: 0.2,
  markerHandleAreaOpacity: 0.5,
  markerHandleMouseOverScale: 1.5,
  markerHandleMouseOverCursor: 'grab',
  markerHandleMouseLeaveCursor: 'default',
};

export const MARKER_TRACK_LANE_STYLE_DEFAULT: MarkerTrackLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  ...MARKER_ON_MARKER_TRACK_LANE_STYLE_DEFAULT,
  height: 190,
};

export const THUMBNAIL_TRACK_LANE_STYLE_DEFAULT: ThumbnailTrackLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  thumbnailHeight: 40,
  thumbnailStroke: 'rgba(121,0,255,0.9)',
  thumbnailStrokeWidth: 0,

  thumbnailHoverScale: 1.5,
  thumbnailHoverStroke: 'rgba(0,255,188,0.9)',
  thumbnailHoverStrokeWidth: 5,
};

export const TEXT_TRACK_LANE_STYLE_DEFAULT: TextTrackLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  height: 40,
  paddingTop: 0,
  paddingBottom: 0,
  textLaneItemOpacity: 0.9,
  textLaneItemFill: 'rgba(255,73,145)',
};

export const LABEL_LANE_STYLE_DEFAULT: LabelLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  height: 40,
  textFill: 'red',
  textFontSize: 14,
  textAreaStretch: true,
};

export const OBSERVATION_TRACK_LANE_STYLE_DEFAULT: ObservationTrackLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  height: 120,
};
