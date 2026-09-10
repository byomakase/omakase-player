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

import {type Observable, of} from 'rxjs';
import {SegmentedVttTimedItemsFetcher, type SegmentedVttTimedItemsFetcherArgs} from '../hls/hls-segmented-vtt-timed-items-fetcher';
import type {SegmentedVttReadResult} from '../track';
import type {Manifest} from '../m3u8/m3u8.model';
import {M3u8Parser} from '../m3u8/m3u8-parser';
import {SourceUtil} from '../source';
import {TamsManifestRegistry} from './hls-bridge/tams-manifest-registry';

export interface TamsSegmentedVttTimedItemsFetcherArgs extends SegmentedVttTimedItemsFetcherArgs {
  cueTimeShift: (playlistUrl: string) => number | undefined;
}

/**
 * Reads TAMS text renditions, which are neither served nor rendered as the store wrote them.
 */
export class TamsSegmentedVttTimedItemsFetcher extends SegmentedVttTimedItemsFetcher {
  private readonly _cueTimeShift: (playlistUrl: string) => number | undefined;

  constructor(args: TamsSegmentedVttTimedItemsFetcherArgs) {
    super(args);

    this._cueTimeShift = args.cueTimeShift;
  }

  override read(): Observable<SegmentedVttReadResult> {
    const playlistUrl = this._track.source ? SourceUtil.resolveUrlFromSource(this._track.source) : void 0;

    if (playlistUrl === void 0 || TamsManifestRegistry.get(playlistUrl) === void 0) {
      return of({targetDuration: void 0, ended: false, updated: false});
    }

    return super.read();
  }

  protected override fetchPlaylist(playlistUrl: string): Observable<Manifest> {
    const playlistText = TamsManifestRegistry.get(playlistUrl);

    return playlistText === void 0 ? super.fetchPlaylist(playlistUrl) : of(M3u8Parser.parse(playlistText));
  }

  protected override resolveCueTimeOffset(text: string, playlistUrl: string): number {
    return super.resolveCueTimeOffset(text, playlistUrl) - (this._cueTimeShift(playlistUrl) ?? 0);
  }
}
