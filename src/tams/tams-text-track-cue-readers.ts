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

import {TextTrackCueReaders, type TextTrackCueReadersArgs} from '../track/text-track-cue-readers';
import type {LiveTextCueFetcher, ReadableTextTrack} from '../track/timed-items-fetcher/live-text-cue-fetcher';
import {TamsSegmentedVttTimedItemsFetcher} from './tams-segmented-vtt-timed-items-fetcher';

export interface TamsTextTrackCueReadersArgs extends TextTrackCueReadersArgs {
  /** See {@link TamsSegmentedVttTimedItemsFetcherArgs.cueTimeShift}. */
  cueTimeShift: (playlistUrl: string) => number | undefined;
}

/**
 * Reads the cues of a TAMS media's text renditions.
 *
 * Nothing is probed for: the store states how far each flow sits from the one carrying the presentation
 * timestamps, and the session controller passes that on.
 */
export class TamsTextTrackCueReaders extends TextTrackCueReaders {
  private readonly _cueTimeShift: (playlistUrl: string) => number | undefined;

  constructor(args: TamsTextTrackCueReadersArgs) {
    super(args);

    this._cueTimeShift = args.cueTimeShift;
  }

  protected override createFetcher(track: ReadableTextTrack): LiveTextCueFetcher {
    return new TamsSegmentedVttTimedItemsFetcher({track: track, cueTimeShift: this._cueTimeShift});
  }
}
