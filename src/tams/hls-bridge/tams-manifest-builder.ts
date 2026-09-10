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

import type {AudioFlow, Flow, FlowSegment, VideoFlow} from '../tams-model';
import {TimeRangeUtil} from '../time-range-util';
import {M3U8Segment, M3U8StreamInfo} from './model/m3u8-model';
import type {TamsMediaData} from './model/tams-media-data-model';
import {exportSegmentsToManifest, type M3U8ManifestMetadata, type M3U8MediaInfo, type Manifest, NON_PLAYABLE_GAP_URI, type SegmentsWithMetadata} from './tams-adapter';
import {type TamsPlayback, TamsPlaybackMode} from '../tams-playback';
import {TAMS_CONTAINER, TAMS_FORMAT, TAMS_MANIFEST, TAMS_HLS_TAG} from '../constants';

/**
 * Converts fetched TAMS media data (a flow, its subflows and their segments) into
 * an HLS playlists, registered in the {@link TamsManifestRegistry}
 * and served by {@link TamsManifestLoader}. Returns the synthetic master URL and
 * per-track playlist URLs.
 */
export function buildTamsManifest(tamsMediaData: TamsMediaData, playback: TamsPlayback, mediaSequences?: Map<string, number> | undefined): Manifest {
  const sources = buildTamsSources(tamsMediaData, playback, mediaSequences);

  if (sources.length === 0) {
    throw new Error('No renderable TAMS flows (video/audio/data) with segments found');
  }

  return exportSegmentsToManifest(sources, {version: 10, independentSegments: true});
}

/**
 * Maps each flow with segments to a media playlist source. Called on initial load and, for live
 * playback, on every segment poll to re-render the playlists in place.
 *
 * @param mediaSequences per-flow sequence number of the first segment, tracking segments already
 *        evicted from a sliding window. Defaults to `0`.
 */
export function buildTamsSources(tamsMediaData: TamsMediaData, playback: TamsPlayback, mediaSequences?: Map<string, number> | undefined): SegmentsWithMetadata[] {
  const {flow, subflows, flowsSegments} = tamsMediaData;

  const flowsById = new Map<string, Flow>();
  [flow, ...(subflows ?? [])].forEach((f) => flowsById.set(f.id, f));

  const defaultAudioFlowId = resolveDefaultAudioFlowId([...flowsById.values()]);

  const sources: SegmentsWithMetadata[] = [];

  for (const [flowId, segments] of flowsSegments) {
    const flowObj = flowsById.get(flowId);
    if (!flowObj) {
      continue;
    }

    const isTextFlow = flowObj.format === TAMS_FORMAT.data;

    const playableSegments = resolveRenderedSegments(flowObj, segments);
    if (playableSegments.length === 0) {
      continue;
    }

    logFlowTimeline(flowObj, segments, playableSegments);

    const m3u8Segments = playableSegments.map((playable) => playable.segment);
    const metadata = toPlaylistMetadata(playback, mediaSequences?.get(flowId) ?? 0, resolveProgramDateTime(playableSegments[0]!.source));

    if (flowObj.format === TAMS_FORMAT.video) {
      sources.push({segments: m3u8Segments, metadata, id: flowId, streamInfo: toStreamInfo(flowObj as VideoFlow)});
    } else if (flowObj.format === TAMS_FORMAT.multi && flowObj.container) {
      // muxed flow - the segments hold every essence, so this is the one rendition
      sources.push({segments: m3u8Segments, metadata, id: flowId, streamInfo: toMuxedStreamInfo(subflows ?? [])});
    } else if (flowObj.format === TAMS_FORMAT.audio) {
      sources.push({segments: m3u8Segments, metadata, id: flowId, mediaInfo: toMediaInfo('AUDIO', flowObj as AudioFlow, flowObj.id === defaultAudioFlowId)});
    } else if (isTextFlow && flowObj.container === TAMS_CONTAINER.vtt) {
      sources.push({segments: m3u8Segments, metadata, id: flowId, mediaInfo: toMediaInfo('SUBTITLES', flowObj, false)});
    }
  }

  return sources;
}

export function resolveRenderedSegments(flow: Flow, segments: FlowSegment[]): PlayableSegment[] {
  const boundedSegments = boundOpenSegmentEnds(segments);
  // text segments are stretched over holes, everything else gets an explicit gap segment
  const timelineSegments = flow.format === TAMS_FORMAT.data ? extendSegmentsOverGaps(boundedSegments) : fillSegmentGaps(boundedSegments);
  return toPlayableSegments(timelineSegments);
}

function toPlaylistMetadata(playback: TamsPlayback, mediaSequence: number, programDateTime: string | undefined): Partial<M3U8ManifestMetadata> {
  const base = {version: 3, independentSegments: true, ...(programDateTime ? {programDateTime: programDateTime} : {})};

  switch (playback.mode) {
    case TamsPlaybackMode.VOD:
      return {...base, playlistType: 'VOD', endList: true};
    case TamsPlaybackMode.EVENT:
      return {...base, playlistType: 'EVENT', endList: false, mediaSequence: 0};
    case TamsPlaybackMode.CONTINUOUS:
      return {...base, endList: false, mediaSequence: mediaSequence};
  }
}

function resolveProgramDateTime(firstSegment: FlowSegment): string | undefined {
  const start = TimeRangeUtil.parseTimeRange(firstSegment.timerange).start;
  return start ? TimeRangeUtil.timeMomentToDate(start).toISOString() : undefined;
}

function logFlowTimeline(flow: Flow, segments: FlowSegment[], renderedSegments: PlayableSegment[]): void {
  const start = segments[0] ? TimeRangeUtil.parseTimeRange(segments[0].timerange).start : undefined;
  const end = segments[segments.length - 1] ? TimeRangeUtil.parseTimeRange(segments[segments.length - 1]!.timerange).end : undefined;

  console.debug(
    `[tams] flow ${flow.id} (${flow.format})`,
    `segments=${segments.length}`,
    `rendered=${renderedSegments.length}`,
    `gaps=${renderedSegments.filter((rendered) => rendered.segment.uri === NON_PLAYABLE_GAP_URI).length}`,
    `span=${start ? TimeRangeUtil.formatTimeMomentExpr(start) : '?'}..${end ? TimeRangeUtil.formatTimeMomentExpr(end) : '?'}`
  );
}

function boundOpenSegmentEnds(segments: FlowSegment[]): FlowSegment[] {
  return segments.map((segment, index) => {
    const timeRange = TimeRangeUtil.parseTimeRange(segment.timerange);
    if (timeRange.end !== undefined || timeRange.start === undefined) {
      return segment;
    }

    const nextSegment = segments[index + 1];
    const nextStart = nextSegment ? TimeRangeUtil.parseTimeRange(nextSegment.timerange).start : undefined;
    if (!nextStart) {
      return segment;
    }

    return {
      ...segment,
      timerange: TimeRangeUtil.formatTimeRangeExpr(TimeRangeUtil.toTimeRange(timeRange.start, nextStart, timeRange.isStartInclusive, false)),
    };
  });
}

/**
 * Inserts a non-playable placeholder segment wherever consecutive flow segments do not touch.
 */
function fillSegmentGaps(segments: FlowSegment[]): FlowSegment[] {
  return segments.flatMap((segment, index) => {
    const nextSegment = segments[index + 1];
    if (!nextSegment) {
      return [segment];
    }

    const end = TimeRangeUtil.parseTimeRange(segment.timerange).end;
    const nextStart = TimeRangeUtil.parseTimeRange(nextSegment.timerange).start;
    if (!end || !nextStart) {
      return [segment];
    }

    const endSeconds = TimeRangeUtil.timeMomentToSeconds(end);
    const nextStartSeconds = TimeRangeUtil.timeMomentToSeconds(nextStart);
    if (Math.abs(nextStartSeconds - endSeconds) < TAMS_MANIFEST.gapToleranceSeconds) {
      return [segment];
    }

    const gapSegment: FlowSegment = {
      object_id: 'non-playable-gap',
      timerange: TimeRangeUtil.formatTimeRangeExpr(TimeRangeUtil.toTimeRange(end, nextStart, true, false)),
      ...(segment.ts_offset !== undefined ? {ts_offset: segment.ts_offset} : {}),
      get_urls: [{url: NON_PLAYABLE_GAP_URI}],
    };

    return [segment, gapSegment];
  });
}

/**
 * Stretches each segment up to the start of the next one instead of inserting placeholders. Used for text tracks
 */
function extendSegmentsOverGaps(segments: FlowSegment[]): FlowSegment[] {
  return segments.map((segment, index) => {
    const nextSegment = segments[index + 1];
    if (!nextSegment) {
      return segment;
    }

    const start = TimeRangeUtil.parseTimeRange(segment.timerange).start;
    const nextStart = TimeRangeUtil.parseTimeRange(nextSegment.timerange).start;
    if (!start || !nextStart) {
      return segment;
    }

    return {
      ...segment,
      timerange: TimeRangeUtil.formatTimeRangeExpr(TimeRangeUtil.toTimeRange(start, nextStart, true, false)),
    };
  });
}

function resolveDefaultAudioFlowId(flows: Flow[]): string | undefined {
  const audioFlows = flows.filter((f) => f.format === TAMS_FORMAT.audio) as AudioFlow[];
  if (audioFlows.length === 0) {
    return undefined;
  }
  const maxChannels = Math.max(...audioFlows.map((f) => f.essence_parameters?.channels ?? 0));
  return audioFlows.find((f) => (f.essence_parameters?.channels ?? 0) === maxChannels)?.id;
}

export type PlayableSegment = {source: FlowSegment; segment: M3U8Segment};

function toPlayableSegments(segments: FlowSegment[]): PlayableSegment[] {
  const result: PlayableSegment[] = [];
  for (const segment of segments) {
    const duration = TimeRangeUtil.timerangeExprDuration(segment.timerange);
    if (!Number.isFinite(duration) || duration <= 0) {
      // an unbounded or zero length segment timerange cannot be expressed as EXTINF
      continue;
    }
    const url = resolveSegmentUrl(segment) ?? NON_PLAYABLE_GAP_URI;
    result.push({source: segment, segment: new M3U8Segment(duration, url)});
  }
  return result;
}

function resolveSegmentUrl(segment: FlowSegment): string | undefined {
  const urls = segment.get_urls;
  if (!urls || urls.length === 0) {
    return undefined;
  }
  const presigned = urls.find((u) => (u as {presigned?: boolean}).presigned === true || u.label?.includes('presigned'));
  const chosen = presigned ?? urls[urls.length - 1];
  return chosen?.url;
}

function toBitsPerSecond(bitRate: number | undefined): number | undefined {
  if (bitRate === undefined || bitRate <= 0) {
    return undefined;
  }
  return bitRate < TAMS_MANIFEST.minPlausibleVideoBitrate ? bitRate * 1000 : bitRate;
}

function resolveResolution(essence: VideoFlow['essence_parameters'] | undefined): {width: number; height: number} | null {
  return essence?.frame_width && essence?.frame_height ? {width: essence.frame_width, height: essence.frame_height} : null;
}

function resolveFrameRate(essence: VideoFlow['essence_parameters'] | undefined): number | null {
  return essence?.frame_rate ? essence.frame_rate.numerator / (essence.frame_rate.denominator ?? 1) : null;
}

function toStreamInfo(flow: VideoFlow): M3U8StreamInfo {
  const maxBitRate = toBitsPerSecond(flow.max_bit_rate);
  const avgBitRate = toBitsPerSecond(flow.avg_bit_rate);
  const bandwidth = maxBitRate ?? avgBitRate ?? 0;
  const averageBandwidth = avgBitRate ?? maxBitRate ?? 0;
  // uri is assigned by exportSegmentsToManifest once the media playlist is registered
  return new M3U8StreamInfo(bandwidth, averageBandwidth, resolveResolution(flow.essence_parameters), resolveFrameRate(flow.essence_parameters), null);
}

function toMuxedStreamInfo(subflows: Flow[]): M3U8StreamInfo {
  const videoFlow = subflows.find((subflow) => subflow.format === TAMS_FORMAT.video) as VideoFlow | undefined;

  const bitRates = subflows.reduce(
    (totals, subflow) => ({
      bandwidth: totals.bandwidth + (toBitsPerSecond(subflow.max_bit_rate) ?? toBitsPerSecond(subflow.avg_bit_rate) ?? 0),
      averageBandwidth: totals.averageBandwidth + (toBitsPerSecond(subflow.avg_bit_rate) ?? toBitsPerSecond(subflow.max_bit_rate) ?? 0),
    }),
    {bandwidth: 0, averageBandwidth: 0}
  );

  return new M3U8StreamInfo(bitRates.bandwidth, bitRates.averageBandwidth, resolveResolution(videoFlow?.essence_parameters), resolveFrameRate(videoFlow?.essence_parameters), null);
}

function toMediaInfo(type: 'AUDIO' | 'SUBTITLES', flow: AudioFlow | Flow, isDefault: boolean): M3U8MediaInfo {
  const channels = type === 'AUDIO' ? ((flow as AudioFlow).essence_parameters?.channels ?? null) : null;
  return {
    type,
    name: resolveMediaName(flow, type),
    isDefault: resolveMediaFlag(flow, TAMS_HLS_TAG.hlsDefault, isDefault),
    autoSelect: resolveMediaFlag(flow, TAMS_HLS_TAG.hlsAutoSelect, type === 'AUDIO'),
    channels: channels === null ? null : `${channels}`,
    language: resolveMediaLanguage(flow),
  };
}

function resolveFlowTag(flow: AudioFlow | Flow, tag: string): string | undefined {
  const value = flow.tags?.[tag];
  const resolved = Array.isArray(value) ? value[0] : value;

  return resolved ? resolved : undefined;
}

function resolveMediaFlag(flow: AudioFlow | Flow, tag: string, fallback: boolean): boolean {
  const value = resolveFlowTag(flow, tag);

  return value === undefined ? fallback : value.toUpperCase() === TAMS_HLS_TAG.yes;
}

/**
 * LANGUAGE the rendition is listed under, from the flow's `hls_language` tag, or `null` when it
 * declares none - hls.js matches a rendition to its text track by NAME and LANGUAGE, and an absent
 * language matches anything, where a placeholder would not.
 */
function resolveMediaLanguage(flow: AudioFlow | Flow): string | null {
  return resolveFlowTag(flow, TAMS_HLS_TAG.hlsLanguage) ?? null;
}

/**
 * NAME the rendition is listed under, from the flow's `hls_name` tag, else its label, else its
 * description.
 *
 * The tag comes first because it is the only one authored for this: labels are shared across the
 * flows of a source, and hls.js picks the text track to display by NAME and LANGUAGE alone, so
 * renditions sharing a name all resolve to whichever was created first.
 */
function resolveMediaName(flow: AudioFlow | Flow, type: 'AUDIO' | 'SUBTITLES'): string {
  return resolveFlowTag(flow, TAMS_HLS_TAG.hlsName) || flow.label || flow.description || type.toLowerCase();
}
