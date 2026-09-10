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

import {bufferCount, catchError, concatMap, defer, forkJoin, from, map, Observable, of, switchMap, timeout, toArray} from 'rxjs';
import {DefaultTextCue, TimedItemTemporalType} from '../media';
import {BaseTimedItemsFetcher} from '../track/timed-items-fetcher/timed-items-fetcher';
import type {LiveTextCueFetcher, ReadableTextTrack, SegmentedVttReadResult} from '../track/timed-items-fetcher/live-text-cue-fetcher';
import type {TrackLoadOptions} from '../track/track-load-options';
import {VttUtil} from '../vtt';
import {SourceUtil} from '../source';
import {httpGetText} from '../http';
import {AuthConfig} from '../common';
import {OmpError} from '../types';
import {UrlUtil} from '../util/url-util';
import {M3u8Parser} from '../m3u8/m3u8-parser';
import type {Manifest} from '../m3u8/m3u8.model';
import {MediaMetadataResolver} from '../tools';

const DEFAULT_MAX_CONCURRENT_REQUESTS = 20;

const INIT_TIMESTAMP_TIMEOUT_MS = 10000;

const ADOPTED_CUES_KEY = '';

export interface SegmentedVttTimedItemsFetcherArgs {
  track: ReadableTextTrack;
  /** A video rendition's playlist; its first segment carries the presentation timestamp. */
  videoPlaylistUrl?: string | undefined;
  maxConcurrentRequests?: number | undefined;
  loadOptions?: TrackLoadOptions | undefined;
}

export class SegmentedVttTimedItemsFetcher extends BaseTimedItemsFetcher<ReadableTextTrack> implements LiveTextCueFetcher {
  private readonly _maxConcurrentRequests: number;
  private readonly _videoPlaylistUrl: string | undefined;

  private _cueIdsBySegmentUrl: Map<string, string[]> = new Map<string, string[]>();
  private _cueIndex = 0;
  private _initTimestamp: number | undefined;
  private _initTimestampResolved = false;

  constructor(args: SegmentedVttTimedItemsFetcherArgs) {
    super(args.track, args.loadOptions);

    this._maxConcurrentRequests = args.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS;
    this._videoPlaylistUrl = args.videoPlaylistUrl;
  }

  fetchTimedItems(): Observable<void> {
    return this.read().pipe(map(() => void 0));
  }

  read(): Observable<SegmentedVttReadResult> {
    if (!this._track.source) {
      throw new OmpError(`Source not set`);
    }

    const playlistUrl = SourceUtil.resolveUrlFromSource(this._track.source);

    return this.resolveInitTimestamp().pipe(
      switchMap(() => this.fetchPlaylist(playlistUrl)),
      switchMap((manifest) => {
        const segmentUrls = this.resolveSegmentUrls(playlistUrl, manifest);
        const unread = segmentUrls.filter((segmentUrl) => !this._cueIdsBySegmentUrl.has(segmentUrl));

        const evicted = this.evictDepartedSegments(segmentUrls);
        const result: SegmentedVttReadResult = {targetDuration: manifest.targetDuration, ended: !!manifest.endList, updated: unread.length > 0 || evicted};

        if (unread.length === 0) {
          this._track.areTimedItemsFetched = true;
          return of(result);
        }

        return this.fetchSegments(unread).pipe(
          map((segmentTexts) => {
            const cues: DefaultTextCue[] = [];

            segmentTexts.forEach((segmentText, index) => {
              if (segmentText === void 0) {
                return;
              }
              const segmentCues = this.mapCues(segmentText, playlistUrl);
              this._cueIdsBySegmentUrl.set(
                unread[index]!,
                segmentCues.map((cue) => cue.id)
              );
              cues.push(...segmentCues);
            });

            if (cues.length > 0) {
              this._track.addTimedItems(cues);
            }
            this._track.areTimedItemsFetched = true;
            return result;
          })
        );
      })
    );
  }

  adoptExistingCues(): void {
    const existingIds = this._track.timedItems.map((cue) => cue.id);

    if (existingIds.length > 0 && this._cueIdsBySegmentUrl.size === 0) {
      this._cueIdsBySegmentUrl.set(ADOPTED_CUES_KEY, existingIds);
      this._cueIndex = existingIds.length;
    }
  }

  protected evictDepartedSegments(segmentUrls: string[]): boolean {
    const listed = new Set<string>(segmentUrls);
    const departedCueIds: string[] = [];

    this._cueIdsBySegmentUrl.forEach((cueIds, segmentUrl) => {
      if (segmentUrl !== ADOPTED_CUES_KEY && !listed.has(segmentUrl)) {
        departedCueIds.push(...cueIds);
        this._cueIdsBySegmentUrl.delete(segmentUrl);
      }
    });

    if (departedCueIds.length > 0) {
      // TEMP
      //this._track.deleteTimedItems(departedCueIds);
    }

    return departedCueIds.length > 0;
  }

  /** Applies whatever also transforms these bytes on the way to the engine. */
  protected mapSegmentText(text: string, playlistUrl: string): string {
    return text;
  }

  /**
   * Probes a video segment for the timestamp media time zero sits at, once. Timed out rather than
   * awaited indefinitely - a probe that never settles would stop the reader entirely.
   */
  protected resolveInitTimestamp(): Observable<void> {
    if (this._initTimestampResolved || this._videoPlaylistUrl === void 0) {
      return of(void 0);
    }
    this._initTimestampResolved = true;

    return this.fetchPlaylist(this._videoPlaylistUrl).pipe(
      map((manifest) => this.resolveSegmentUrls(this._videoPlaylistUrl!, manifest)[0]),
      switchMap((segmentUrl) => (segmentUrl === void 0 ? of(void 0) : MediaMetadataResolver.getMediaMetadata(segmentUrl, ['firstVideoTrackInitSegmentTime']))),
      map((metadata) => {
        this._initTimestamp = metadata?.firstVideoTrackInitSegmentTime;
        console.debug(`SegmentedVttTimedItemsFetcher: init timestamp`, this._initTimestamp);
      }),
      timeout(INIT_TIMESTAMP_TIMEOUT_MS),
      catchError((err) => {
        console.debug(`SegmentedVttTimedItemsFetcher: could not resolve init timestamp`, err);
        return of(void 0);
      })
    );
  }

  /** Seconds to add to this segment's cue times to reach the media timeline. */
  protected resolveCueTimeOffset(text: string, playlistUrl: string): number {
    const timestampMap = VttUtil.parseTimestampMap(text);
    const mpegtsOffset = this._initTimestamp === void 0 ? 0 : (timestampMap?.mpegts ?? 0) - this._initTimestamp;

    return VttUtil.resolveCueTimeOffset(timestampMap) + mpegtsOffset;
  }

  protected fetchPlaylist(playlistUrl: string): Observable<Manifest> {
    return from(httpGetText(playlistUrl, AuthConfig.createRequestInit(playlistUrl, AuthConfig.authentication))).pipe(map((playlistText) => M3u8Parser.parse(playlistText)));
  }

  protected resolveSegmentUrls(playlistUrl: string, manifest: Manifest): string[] {
    const playlistRootUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/'));

    return (manifest.segments ?? []).filter((segment) => !!segment.uri).map((segment) => UrlUtil.absolutizeUrl(playlistRootUrl, segment.uri));
  }

  protected fetchSegments(segmentUrls: string[]): Observable<(string | undefined)[]> {
    return from(segmentUrls).pipe(
      bufferCount(this._maxConcurrentRequests),
      concatMap((batch) =>
        forkJoin(
          batch.map((segmentUrl) =>
            defer(() => from(httpGetText(segmentUrl, AuthConfig.createRequestInit(segmentUrl, AuthConfig.authentication)))).pipe(
              map((segmentText) => segmentText as string | undefined),
              catchError((err) => {
                console.debug(`SegmentedVttTimedItemsFetcher: failed to fetch segment ${segmentUrl}`, err);
                return of<string | undefined>(void 0);
              })
            )
          )
        )
      ),
      toArray(),
      map((batches) => batches.flat())
    );
  }

  protected mapCues(segmentText: string, playlistUrl: string): DefaultTextCue[] {
    const text = this.mapSegmentText(segmentText, playlistUrl);
    const offset = this.resolveCueTimeOffset(text, playlistUrl);

    let parsed;
    try {
      parsed = VttUtil.parseVtt(VttUtil.stripTimestampMap(text));
    } catch (err) {
      console.debug(`SegmentedVttTimedItemsFetcher: failed to parse segment`, err);
      return [];
    }

    return (
      parsed.cues
        .map((cue) => ({start: cue.start + offset, end: cue.end + offset, text: cue.text}))
        // whatever the shift pushes off the front of the timeline is not rendered either
        .filter((cue) => cue.end > 0)
        .map(
          (cue) =>
            new DefaultTextCue({
              text: cue.text,
              temporal: {
                type: TimedItemTemporalType.SPAN,
                start: `${Math.max(0, cue.start)}`,
                end: `${cue.end}`,
              },
              data: {
                index: this._cueIndex++,
              },
            })
        )
    );
  }
}
