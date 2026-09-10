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

import {forkJoin, map, type Observable, Subject, type Subscription} from 'rxjs';
import type {Destroyable} from '../../common/capabilities';
import type {Flow, FlowSegment} from '../tams-model';
import {isTamsLivePlayback, type TamsPlayback, TamsPlaybackMode} from '../tams-playback';
import {TamsUtil} from '../tams-util';
import {TimeRangeUtil} from '../time-range-util';
import {buildTamsSources, resolveRenderedSegments} from './tams-manifest-builder';
import type {Manifest} from './tams-adapter';
import {writeMediaPlaylist} from './tams-adapter';
import {TamsManifestRegistry} from './tams-manifest-registry';
import {TAMS_LIVE} from '../constants';
import type {ManifestResourcesFetcher} from './tams-resource-fetcher';
import type {TamsMediaData} from './model/tams-media-data-model';

/** Playable length of a segment; unbounded or zero length timeranges contribute nothing. */
function segmentDuration(segment: FlowSegment): number {
  const duration = TimeRangeUtil.timerangeExprDuration(segment.timerange);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function segmentStart(segment: FlowSegment): number | undefined {
  const start = TimeRangeUtil.parseTimeRange(segment.timerange).start;
  return start ? TimeRangeUtil.timeMomentToSeconds(start) : undefined;
}

function segmentEnd(segment: FlowSegment): number | undefined {
  const end = TimeRangeUtil.parseTimeRange(segment.timerange).end;
  return end ? TimeRangeUtil.timeMomentToSeconds(end) : undefined;
}

export interface TamsLiveManifestUpdaterArgs {
  fetcher: ManifestResourcesFetcher;
  /** Manifest produced by the initial load; its media playlist URLs are re-registered in place. */
  manifest: Manifest;
  /** Media data the initial manifest was built from; accumulates polled segments. */
  tamsMediaData: TamsMediaData;
  playback: TamsPlayback;
  /** Numbering to continue from, when this media has already published playlists once. */
  mediaSequences?: Map<string, number> | undefined;
}

/**
 * Keeps live TAMS-derived HLS media playlists up to date.
 */
export class TamsLiveManifestUpdater implements Destroyable {
  private readonly _fetcher: ManifestResourcesFetcher;
  private readonly _playback: TamsPlayback;
  private readonly _tamsMediaData: TamsMediaData;

  private readonly _playlistUris: Map<string, string>;
  private readonly _flowsById: Map<string, Flow>;
  private readonly _mediaSequences: Map<string, number>;

  private _loadedTimerange: string | undefined;

  private _timeoutId: ReturnType<typeof setTimeout> | undefined;
  private _pollSubscription: Subscription | undefined;
  private _destroyed = false;

  private readonly _onPlaylistsUpdated$: Subject<void> = new Subject<void>();

  get onPlaylistsUpdated$(): Observable<void> {
    return this._onPlaylistsUpdated$.asObservable();
  }

  get mediaSequences(): Map<string, number> {
    return new Map<string, number>(this._mediaSequences);
  }

  get tamsMediaData(): TamsMediaData {
    return this._tamsMediaData;
  }

  get loadedTimerange(): string | undefined {
    return this._loadedTimerange;
  }

  constructor(args: TamsLiveManifestUpdaterArgs) {
    this._fetcher = args.fetcher;
    this._playback = args.playback;
    this._tamsMediaData = args.tamsMediaData;
    this._playlistUris = new Map<string, string>([...(args.manifest.video ?? []), ...(args.manifest.audio ?? []), ...(args.manifest.text ?? [])]);
    this._flowsById = new Map<string, Flow>([this._tamsMediaData.flow, ...(this._tamsMediaData.subflows ?? [])].map((flow) => [flow.id, flow]));
    this._mediaSequences = new Map<string, number>(args.mediaSequences ?? []);
  }

  start(): void {
    if (this._destroyed || !isTamsLivePlayback(this._playback)) {
      return;
    }
    this._schedulePoll();
  }

  destroy(): void {
    this._destroyed = true;
    if (this._timeoutId !== undefined) {
      clearTimeout(this._timeoutId);
      this._timeoutId = undefined;
    }
    this._pollSubscription?.unsubscribe();
    this._pollSubscription = undefined;
    this._onPlaylistsUpdated$.complete();
  }

  private _schedulePoll(): void {
    this._timeoutId = setTimeout(() => this._poll(), this._resolvePollInterval());
  }

  private _resolvePollInterval(): number {
    let longestSegmentDuration = 0;

    for (const flowId of this._playlistUris.keys()) {
      const lastSegment = this._tamsMediaData.flowsSegments.get(flowId)?.at(-1);
      if (!lastSegment) {
        continue;
      }
      longestSegmentDuration = Math.max(longestSegmentDuration, segmentDuration(lastSegment));
    }

    const interval = longestSegmentDuration > 0 ? longestSegmentDuration * 1000 * TAMS_LIVE.pollSegmentFraction : TAMS_LIVE.pollIntervalFallbackMs;
    return Math.max(TAMS_LIVE.pollIntervalMinMs, interval);
  }

  private _poll(): void {
    this._timeoutId = undefined;

    const requests: Observable<[string, FlowSegment[]]>[] = [...this._playlistUris.keys()].map((flowId) =>
      this._fetcher.fetchFlowSegments(flowId, this._resolveFetchTimerange(flowId)).pipe(map((segments) => [flowId, segments] as [string, FlowSegment[]]))
    );

    if (requests.length === 0) {
      return;
    }

    this._pollSubscription = forkJoin(requests).subscribe({
      next: (results) => {
        if (this._destroyed) {
          return;
        }
        if (this._appendSegments(results)) {
          this._rewritePlaylists();
        }
        this._schedulePoll();
      },
      error: (error) => {
        if (this._destroyed) {
          return;
        }
        console.warn(`[tams] live segment poll failed`, error);
        this._schedulePoll();
      },
    });
  }

  private _resolveFetchTimerange(flowId: string): string | undefined {
    const lastSegment = this._tamsMediaData.flowsSegments.get(flowId)?.at(-1);
    if (!lastSegment) {
      return this._playback.requestTimerange;
    }
    const end = TimeRangeUtil.parseTimeRange(lastSegment.timerange).end;
    return end ? TamsUtil.openEndedTimerangeFrom(end) : this._playback.requestTimerange;
  }

  private _appendSegments(results: [string, FlowSegment[]][]): boolean {
    let changed = false;

    for (const [flowId, fetchedSegments] of results) {
      const segments = this._tamsMediaData.flowsSegments.get(flowId);
      if (!segments) {
        continue;
      }

      const knownTimeranges = new Set(segments.map((segment) => segment.timerange));
      const newSegments = fetchedSegments.filter((segment) => !knownTimeranges.has(segment.timerange));

      if (newSegments.length > 0) {
        segments.push(...newSegments);
        changed = true;
      }

      if (this._trimToWindow(flowId, segments)) {
        changed = true;
      }
    }

    return changed;
  }

  private _trimToWindow(flowId: string, segments: FlowSegment[]): boolean {
    const windowDuration = this._playback.windowDuration;
    if (this._playback.mode !== TamsPlaybackMode.CONTINUOUS || !windowDuration) {
      return false;
    }

    const windowEnd = segmentEnd(segments[segments.length - 1]!);
    const flow = this._flowsById.get(flowId);
    const renderedBefore = flow ? resolveRenderedSegments(flow, segments).length : segments.length;
    let evicted = 0;

    while (segments.length > 1 && windowEnd !== undefined) {
      const secondStart = segmentStart(segments[1]!);
      if (secondStart === undefined || windowEnd - secondStart < windowDuration) {
        break;
      }
      segments.shift();
      evicted++;
    }

    if (evicted === 0) {
      return false;
    }

    const renderedAfter = flow ? resolveRenderedSegments(flow, segments).length : segments.length;
    this._mediaSequences.set(flowId, (this._mediaSequences.get(flowId) ?? 0) + Math.max(renderedBefore - renderedAfter, 0));
    return true;
  }

  private _rewritePlaylists(): void {
    for (const source of buildTamsSources(this._tamsMediaData, this._playback, this._mediaSequences)) {
      const uri = source.id ? this._playlistUris.get(source.id) : undefined;
      if (!uri) {
        continue;
      }
      TamsManifestRegistry.register(uri, writeMediaPlaylist(source));
    }

    this._loadedTimerange = TamsUtil.resolveSegmentsTimerange(this._tamsMediaData.flowsSegments, [...this._flowsById.values()]) ?? this._loadedTimerange;

    this._onPlaylistsUpdated$.next();
  }
}
