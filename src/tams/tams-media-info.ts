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

import {FrameRateResolver} from '../common/frame-rate';
import {TimecodeConverter} from '../common/timecode';
import type {Flow, FlowSegment, VideoFlow} from './tams-model';
import {TimeRangeUtil} from './time-range-util';
import {TAMS_FORMAT} from './constants';
import type {TamsMediaData} from './hls-bridge/model/tams-media-data-model';
import {TamsUtil} from './tams-util';

/**
 * What the loaded flows say about the media: where it sits on the absolute TAMS flow timeline, and
 * how its timecode should be counted.
 *
 * Media time is 0 based while TAMS timeranges are absolute, so every conversion between the two goes
 * through {@link mediaStartTime}: `flowTime = mediaTime + mediaStartTime`.
 */
export interface TamsMediaInfo {
  /** Absolute flow time, in seconds, that media time `0` maps to. */
  mediaStartTime: number;

  /** Absolute flow time, in seconds, at which the loaded segments end. */
  mediaEndTime: number;

  /**
   * Frame rate of the reference video flow, as a `"numerator/denominator"` fraction so the exact
   * rational rate survives. Audio only media counts in hundredths of a second instead, as elsewhere
   * in the player.
   */
  frameRate: number | string;

  /** Whether {@link frameRate} is a drop frame rate. */
  dropFrame: boolean;

  /** Whether a video flow sets the timeline; drives the timecode format (`FF` vs hundredths). */
  hasVideo: boolean;
}

/** Per flow extent of the segments that were loaded. */
type FlowSpan = {flow: Flow; start: number; end: number | undefined};

/**
 * Resolves the media info from the loaded flows and their segments.
 *
 * The timeline origin is the earliest starting stream carrier flow - the one bridged as the HLS
 * stream, which every other rendition is aligned to. A text flow can start before it and must not
 * take its place, so the origin falls back to the earliest starting flow of any format only when no
 * carrier contributes one. Flows without segments, or whose first segment has no bounded start,
 * contribute nothing.
 *
 * Returns `undefined` when no flow contributes a start.
 */
export function resolveTamsMediaInfo(tamsMediaData: TamsMediaData): TamsMediaInfo | undefined {
  const {flow, subflows, flowsSegments} = tamsMediaData;

  const spans: FlowSpan[] = [];

  for (const currentFlow of [flow, ...(subflows ?? [])]) {
    const segments = flowsSegments.get(currentFlow.id);
    if (!segments || segments.length === 0) {
      continue;
    }

    const start = segmentStartSeconds(segments[0]!);
    if (start === undefined) {
      continue;
    }

    spans.push({
      flow: currentFlow,
      start: start,
      end: segmentEndSeconds(segments[segments.length - 1]!),
    });
  }

  if (spans.length === 0) {
    return undefined;
  }

  spans.sort((a, b) => a.start - b.start);

  const carrierFlowIds = new Set(TamsUtil.resolveStreamCarrierFlows(spans.map((span) => span.flow)).map((carrier) => carrier.id));
  const origin = spans.find((span) => carrierFlowIds.has(span.flow.id)) ?? spans[0]!;
  const ends = spans.map((span) => span.end).filter((end): end is number => end !== undefined);

  const essence = resolveVideoEssence(origin.flow, [flow, ...(subflows ?? [])]);
  const frameRate = resolveFrameRateFraction(essence);

  return {
    mediaStartTime: origin.start,
    mediaEndTime: ends.length > 0 ? Math.max(...ends) : spans[spans.length - 1]!.start,
    // a video flow that does not declare a frame rate is counted like audio only media
    frameRate: frameRate ?? FrameRateResolver.FR_100.value,
    dropFrame: frameRate !== undefined && isDropFrame(essence),
    hasVideo: frameRate !== undefined,
  };
}

/**
 * Timecode the first frame of the media should display as (FFOM).
 *
 * TAMS timestamps are absolute, so the time of day `mediaStartTime` falls on is what the source was
 * stamped with. Only the time of day is kept - timecode wraps at 24h - and the date is dropped.
 *
 * Formatted with the frame rate the media will actually be loaded with, because the player parses
 * the string back against that same rate and rejects a mismatch. Returns `undefined` if the rate
 * cannot produce a timecode, leaving the media on a 0 based one rather than failing the load.
 *
 * @param ffomTimeZoneOffset whole hours to shift by. The timestamp carries no zone, so this is the
 *        caller's way of turning UTC into the wall clock the material was stamped with.
 */
export function resolveTamsFfom(mediaStartTime: number, frameRate: number | string, dropFrame: boolean, hasVideo: boolean, ffomTimeZoneOffset?: number | undefined): string | undefined {
  const date = new Date(mediaStartTime * 1000);
  const hours = Math.max(date.getUTCHours() + (ffomTimeZoneOffset ?? 0), 0);
  const secondsOfDay = hours * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;

  try {
    const frameRateModel = FrameRateResolver.resolveFrameRateModel(frameRate, dropFrame);
    const timecodeConverter = TimecodeConverter.create({frameRateModel: frameRateModel, hasVideo: hasVideo, hasAudio: !hasVideo});

    const valueText = timecodeConverter.timeToTimecodeModel(secondsOfDay).valueText;
    // the player parses the ffom back and fails the load if it cannot - rather no ffom than that
    timecodeConverter.parseValueTextToTimecodeModel(valueText);

    return valueText;
  } catch (error) {
    console.warn(`[tams] could not resolve ffom timecode for frame rate ${frameRate}`, error);
    return undefined;
  }
}


function resolveVideoEssence(origin: Flow, flows: Flow[]): VideoFlow['essence_parameters'] | undefined {
  if (origin.format === TAMS_FORMAT.video) {
    return (origin as VideoFlow).essence_parameters;
  }

  if (origin.format === TAMS_FORMAT.multi && origin.container) {
    return (flows.find((flow) => flow.format === TAMS_FORMAT.video) as VideoFlow | undefined)?.essence_parameters;
  }

  return undefined;
}

/** Exact rational rate, so 30000/1001 does not become 29.97. */
function resolveFrameRateFraction(essence: VideoFlow['essence_parameters'] | undefined): string | undefined {
  const frameRate = essence?.frame_rate;
  return frameRate ? `${frameRate.numerator}/${frameRate.denominator ?? 1}` : undefined;
}

function isDropFrame(essence: VideoFlow['essence_parameters'] | undefined): boolean {
  const frameRate = essence?.frame_rate;
  return !!frameRate && frameRate.denominator === 1001 && (frameRate.numerator === 30000 || frameRate.numerator === 60000);
}

/** Start of a flow's first loaded segment, in seconds; how far it sits from the media's own start. */
export function resolveFlowStartSeconds(tamsMediaData: TamsMediaData, flowId: string): number | undefined {
  const segments = tamsMediaData.flowsSegments.get(flowId);
  return segments && segments.length > 0 ? segmentStartSeconds(segments[0]!) : undefined;
}

export function resolveAbsoluteFlowStartSeconds(tamsMediaData: TamsMediaData, flowId: string): number | undefined {
  const flow = resolveFlow(tamsMediaData, flowId);
  const start = flow?.timerange === undefined ? undefined : TimeRangeUtil.parseTimeRange(flow.timerange).start;

  return start ? TimeRangeUtil.timeMomentToSeconds(start) : undefined;
}

function resolveFlow(tamsMediaData: TamsMediaData, flowId: string): Flow | undefined {
  const {flow, subflows} = tamsMediaData;

  return [flow, ...(subflows ?? [])].find((currentFlow) => currentFlow.id === flowId);
}

function segmentStartSeconds(segment: FlowSegment): number | undefined {
  const start = TimeRangeUtil.parseTimeRange(segment.timerange).start;
  return start ? TimeRangeUtil.timeMomentToSeconds(start) : undefined;
}

function segmentEndSeconds(segment: FlowSegment): number | undefined {
  const end = TimeRangeUtil.parseTimeRange(segment.timerange).end;
  return end ? TimeRangeUtil.timeMomentToSeconds(end) : undefined;
}
