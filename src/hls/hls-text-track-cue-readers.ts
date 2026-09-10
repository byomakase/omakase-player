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

import {TrackType} from '../media/track';
import {TextTrackCueReaders} from '../track/text-track-cue-readers';
import type {ReadableTextTrack} from '../track/timed-items-fetcher/live-text-cue-fetcher';
import {SegmentedVttTimedItemsFetcher} from './hls-segmented-vtt-timed-items-fetcher';

/**
 * Reads the cues of an HLS media's text renditions.
 *
 * Cue times are absolute against the stream's presentation timestamps, and nothing in the playlists
 * says where those start - so a video rendition is handed over for the fetcher to probe.
 */
export class HlsTextTrackCueReaders extends TextTrackCueReaders {
  protected override createFetcher(track: ReadableTextTrack): SegmentedVttTimedItemsFetcher {
    return new SegmentedVttTimedItemsFetcher({track: track, videoPlaylistUrl: this.resolveVideoPlaylistUrl()});
  }

  /** Any video rendition of this media; its first segment carries the presentation timestamp. */
  private resolveVideoPlaylistUrl(): string | undefined {
    const video = this._mainMedia.tracks.find((track) => track.trackType === TrackType.VIDEO) as {levels?: {url?: string | undefined}[] | undefined} | undefined;

    return video?.levels?.find((level) => !!level.url)?.url;
  }
}
