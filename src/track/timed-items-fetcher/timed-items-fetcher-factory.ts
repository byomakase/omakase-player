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

import {MarkerTrack, type ObservationTrack, type TextTrack, TextTrackType, ThumbnailTrack, type Track, TrackType} from '../../media';
import {MarkerTrackFetcher, ObservationTrackFetcher, TextTrackFetcher, ThumbnailTrackFetcher} from './default-timed-items-fetcher';
import {OmpError} from '../../types';
import type {TimedItemsFetcher} from './timed-items-fetcher';
import {FileFormatType} from '../../common';
import type {TrackLoadOptions} from '../track-load-options';

export class TimedItemsFetcherFactory {
  public static createTimedItemsFetcher(track: Track, loadOptions: TrackLoadOptions | undefined): TimedItemsFetcher {
    const createFetcher = () => {
      switch (track.trackType) {
        case TrackType.TEXT_TRACK:
          return this.createTextTrackFetcher(track as TextTrack, loadOptions);
        case TrackType.THUMBNAIL_TRACK:
          return this.createThumbnailTrackFetcher(track as ThumbnailTrack, loadOptions);
        case TrackType.MARKER_TRACK:
          return this.createMarkerTrackFetcher(track as MarkerTrack, loadOptions);
        case TrackType.OBSERVATION_TRACK:
          return this.createObservationTrackFetcher(track as ObservationTrack, loadOptions);
        default:
          throw new OmpError(`Unsupported track type: ${track.trackType}`);
      }
    };

    const resolvedFileFormatType = track.sourceFileFormatType ?? loadOptions?.fileFormatType;
    switch (resolvedFileFormatType) {
      case FileFormatType.VTT:
      case FileFormatType.SRT:
      case FileFormatType.TTML:
      case FileFormatType.SCC:
      case FileFormatType.STL:
      case FileFormatType.SSA:
      case FileFormatType.ASS:
        return createFetcher();
      default:
        throw new OmpError(`Unsupported timed items file format: ${resolvedFileFormatType}`);
    }
  }

  private static createTextTrackFetcher(track: TextTrack, loadOptions: TrackLoadOptions | undefined): TimedItemsFetcher {
    switch (track.textTrackType) {
      case TextTrackType.TEXT_TRACK_FILE:
        return new TextTrackFetcher(track, loadOptions);
      default:
        throw new OmpError(`Unsupported text track type: ${track.textTrackType}`);
    }
  }

  private static createThumbnailTrackFetcher(track: ThumbnailTrack, loadOptions: TrackLoadOptions | undefined): TimedItemsFetcher {
    return new ThumbnailTrackFetcher(track, loadOptions);
  }

  private static createMarkerTrackFetcher(track: MarkerTrack, loadOptions: TrackLoadOptions | undefined): TimedItemsFetcher {
    return new MarkerTrackFetcher(track, loadOptions);
  }

  private static createObservationTrackFetcher(track: ObservationTrack, loadOptions: TrackLoadOptions | undefined): TimedItemsFetcher {
    return new ObservationTrackFetcher(track, loadOptions);
  }
}
