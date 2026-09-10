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

import type {Observable} from 'rxjs';
import type {TextTrack, TextTrackState} from '../../media';

export type ReadableTextTrack = TextTrack<TextTrackState, any>;

/** What the playlist says about following this rendition from here. */
export interface SegmentedVttReadResult {
  targetDuration: number | undefined;
  ended: boolean;
  /** Whether this pass found the playlist changed; an unchanged one is worth re-reading sooner. */
  updated: boolean;
}

/**
 * What a reader needs of a fetcher to keep a text track populated, and no more - so the readers stay
 * clear of how any one media type resolves its cue times.
 */
export interface LiveTextCueFetcher {
  /** Reads whatever the rendition has gained since the last pass. */
  read(): Observable<SegmentedVttReadResult>;

  /** Takes the cues already on the track as read, so a restored session does not fetch them again. */
  adoptExistingCues(): void;
}
