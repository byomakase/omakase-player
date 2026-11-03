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

import {TrackType} from '../media';
import {type FrameImageTrackArgs, FrameImageTrack} from './frame-image-track';

/**
 * Frame image track shown over main media and other sidecar videos while main media plays at playback rate media elements can't play at -
 * backwards, or faster than {@link SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate}, regardless of main media type, see {@link TrickTrackControllerImpl}.
 * Time window defaults to whole main media, frame images are expected to be frames of main media.
 */
export class TrickTrack extends FrameImageTrack {
  protected override _trackType = TrackType.TRICK_TRACK;

  constructor(args: FrameImageTrackArgs) {
    super(args);
  }
}
