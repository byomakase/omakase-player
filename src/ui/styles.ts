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

import type {ObservationTrackLaneStyle, TextTrackLaneStyle} from '../timeline';
import {
  LABEL_LANE_STYLE_DEFAULT,
  type LabelLaneStyle,
  MARKER_ON_MARKER_TRACK_LANE_STYLE_DEFAULT,
  MARKER_TRACK_LANE_STYLE_DEFAULT,
  type MarkerOnMarkerTrackLaneStyle,
  type MarkerTrackLaneStyle,
  OBSERVATION_TRACK_LANE_STYLE_DEFAULT,
  SCRUBBER_LANE_STYLE_DEFAULT,
  type ScrubberLaneStyle,
  TEXT_TRACK_LANE_STYLE_DEFAULT,
  THUMBNAIL_TRACK_LANE_STYLE_DEFAULT,
  type ThumbnailTrackLaneStyle,
  TIMELINE_LANE_STYLE_DEFAULT,
  TIMELINE_STYLE_DEFAULT,
  type TimelineLaneStyle,
  type TimelineStyle,
} from '../timeline';
import type {MarkerOnChromingStyle} from '../chroming';
import {MARKER_ON_CHROMING_STYLE_DEFAULT} from '../chroming/style-defaults';
import {MARKER_ON_MARKER_LIST_STYLE_DEFAULT} from '../marker-list/style-defaults';
import type {MarkerOnMarkerListStyle} from '../marker-list';
import {omitKeysOf} from '../util/object-util';
import {
  MARKER_STYLE_DEFAULT,
  MARKER_TRACK_STYLE_DEFAULT,
  type MarkerStyle,
  type MarkerTrackStyle
} from './marker-style';
import {SCROLLBAR_STYLE_DEFAULT, type ScrollbarStyle} from '../timeline/scrollbar/scrollbar';
import {type ScrollbarLaneStyle, TIMELINE_SCROLLBAR_LANE_STYLE_DEFAULT} from '../timeline/scrollbar/scrollbar-lane';

export type ElementStyleByName = {
  // general
  Marker: MarkerStyle;
  MarkerTrack: Omit<MarkerTrackStyle, keyof MarkerStyle>;

  // timeline
  Timeline: TimelineStyle;
  TimelineLane: TimelineLaneStyle;

  ScrubberLane: ScrubberLaneStyle;
  ThumbnailTrackLane: ThumbnailTrackLaneStyle;
  MarkerTrackLane: Omit<MarkerTrackLaneStyle, keyof TimelineLaneStyle>;
  TextTrackLane: TextTrackLaneStyle;
  LabelLane: Omit<LabelLaneStyle, keyof TimelineLaneStyle>;
  ScrollbarLane: Omit<ScrollbarLaneStyle, keyof TimelineLaneStyle>;
  ObservationTrackLane: Omit<ObservationTrackLaneStyle, keyof TimelineLaneStyle>;

  MarkerTrackOnMarkerTrackLane: Omit<MarkerTrackStyle, keyof MarkerTrackStyle>;
  MarkerOnMarkerTrackLane: Omit<MarkerOnMarkerTrackLaneStyle, keyof MarkerTrackStyle>;

  Scrollbar: ScrollbarStyle;

  // chroming
  MarkerOnChroming: Omit<MarkerOnChromingStyle, keyof MarkerTrackStyle>;
  MarkerOnMarkerList: Omit<MarkerOnMarkerListStyle, keyof MarkerTrackStyle>;
};
export type ElementStyleName = keyof ElementStyleByName;

export const DEFAULT_ELEMENT_STYLES: {[K in ElementStyleName]: ElementStyleByName[K]} = {
  // general
  Marker: {
    ...MARKER_STYLE_DEFAULT,
  },
  MarkerTrack: {
    ...omitKeysOf(MARKER_TRACK_STYLE_DEFAULT, MARKER_STYLE_DEFAULT),
  },

  // timeline
  Timeline: {
    ...TIMELINE_STYLE_DEFAULT,
  },
  TimelineLane: {
    ...TIMELINE_LANE_STYLE_DEFAULT,
  },

  ScrubberLane: {
    ...SCRUBBER_LANE_STYLE_DEFAULT,
  },
  ThumbnailTrackLane: {
    ...THUMBNAIL_TRACK_LANE_STYLE_DEFAULT,
  },
  MarkerTrackLane: {
    ...omitKeysOf(MARKER_TRACK_LANE_STYLE_DEFAULT, TIMELINE_LANE_STYLE_DEFAULT),
  },
  MarkerTrackOnMarkerTrackLane: {
    ...omitKeysOf(MARKER_TRACK_STYLE_DEFAULT, MARKER_TRACK_STYLE_DEFAULT),
  },
  ObservationTrackLane: {
    ...omitKeysOf(OBSERVATION_TRACK_LANE_STYLE_DEFAULT, TIMELINE_LANE_STYLE_DEFAULT),
  },
  Scrollbar: {
    ...SCROLLBAR_STYLE_DEFAULT,
  },
  MarkerOnMarkerTrackLane: {
    ...omitKeysOf(MARKER_ON_MARKER_TRACK_LANE_STYLE_DEFAULT, MARKER_TRACK_STYLE_DEFAULT),
  },
  MarkerOnMarkerList: {
    ...omitKeysOf(MARKER_ON_MARKER_LIST_STYLE_DEFAULT, MARKER_TRACK_STYLE_DEFAULT),
  },

  TextTrackLane: {
    ...TEXT_TRACK_LANE_STYLE_DEFAULT,
  },
  LabelLane: {
    ...omitKeysOf(LABEL_LANE_STYLE_DEFAULT, TIMELINE_LANE_STYLE_DEFAULT),
  },
  ScrollbarLane: {
    ...omitKeysOf(TIMELINE_SCROLLBAR_LANE_STYLE_DEFAULT, TIMELINE_LANE_STYLE_DEFAULT),
  },

  MarkerOnChroming: {
    ...omitKeysOf(MARKER_ON_CHROMING_STYLE_DEFAULT, MARKER_TRACK_STYLE_DEFAULT),
  },
};
