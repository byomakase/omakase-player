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

import {
  type AudioObservationTrackGenerationOptions,
  type AudioTrackLoadOptions,
  type MediaContainerTrackLoadOptions,
  type MarkerTrackLoadOptions,
  type ObservationTrackLoadOptions,
  type TextTrackLoadOptions,
  type ThumbnailTrackLoadOptions,
  TrackType,
} from '../media';
import type {PlayerAudioLoadOptions, PlayerTextTrackLoadOptions, PlayerVideoLoadOptions} from '../player';

/** Maps each {@link TrackType} to its concrete load-options type. */
export type TrackLoadOptionsMap = {
  /** Load options for text (subtitle/caption) tracks. */
  [TrackType.TEXT_TRACK]: PlayerTextTrackLoadOptions & TextTrackLoadOptions;
  /** Load options for audio tracks. */
  [TrackType.AUDIO]: PlayerAudioLoadOptions & AudioTrackLoadOptions;
  /** Load options for thumbnail tracks. */
  [TrackType.THUMBNAIL_TRACK]: ThumbnailTrackLoadOptions;
  /** Load options for marker tracks. */
  [TrackType.MARKER_TRACK]: MarkerTrackLoadOptions;
  /** Load options for observation tracks. */
  [TrackType.OBSERVATION_TRACK]: ObservationTrackLoadOptions;
  /** Load options for MP4 files loaded as sidecar video. */
  [TrackType.MP4_TRACK]: PlayerVideoLoadOptions & MediaContainerTrackLoadOptions;
  /** Load options for HLS streams loaded as sidecar video. */
  [TrackType.HLS_TRACK]: PlayerVideoLoadOptions & MediaContainerTrackLoadOptions;
  /** Load options for frame image manifests loaded as sidecar video. Frame images have no sound, `muted` and `crossOrigin` are ignored. */
  [TrackType.FRAME_IMAGE_TRACK]: PlayerVideoLoadOptions & MediaContainerTrackLoadOptions;
  /** Load options for trick track, frame image manifest shown while main media plays backwards or faster than max native playback rate. `muted` and `crossOrigin` are ignored. */
  [TrackType.TRICK_TRACK]: PlayerVideoLoadOptions & MediaContainerTrackLoadOptions;
};

/** Maps some {@link TrackType} to its concrete generation-options type. */
export type TrackGenerationOptionsMap = {
  /** Generation options for audio observation tracks. */
  [TrackType.AUDIO]: AudioObservationTrackGenerationOptions;
};

/**
 * Discriminated union of all track load-options types.
 * The optional `trackType` field narrows the union to the options for a specific track type.
 */
export type TrackLoadOptions = {
  [T in keyof TrackLoadOptionsMap]: {
    trackType?: T;
  } & TrackLoadOptionsMap[T];
}[keyof TrackLoadOptionsMap];

/**
 * Discriminated union of some track generation-options types.
 * The optional `trackType` field narrows the union to the options for a specific track type.
 */
export type TrackGenerationOptions = {
  [T in keyof TrackGenerationOptionsMap]: {
    trackType?: T;
  } & TrackGenerationOptionsMap[T];
}[keyof TrackGenerationOptionsMap];
