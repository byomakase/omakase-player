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

import {z} from 'zod';
import type {TamsMainMediaLoadOptions} from '../media';
import type {Flow} from './tams-model';
import {TimeRangeUtil} from './time-range-util';
import {TAMS_FORMAT} from './constants';
import type {TamsMediaData} from './hls-bridge/model/tams-media-data-model';

/** Outcome of a validation; `message` says what makes the input unplayable. */
export interface TamsValidationResult {
  valid: boolean;
  message?: string | undefined;
}

/**
 * Checks that fetched TAMS media can be bridged to HLS at all, so an unplayable payload fails with
 * what is wrong with it rather than as a missing rendition further down.
 *
 * Runs before the manifest is built, on the flow, its subflows and their segments.
 */
export function validateTamsPayload(tamsMediaData: TamsMediaData): TamsValidationResult {
  const {flow, subflows, flowsSegments} = tamsMediaData;

  const hasSegments = (candidate: Flow) => (flowsSegments.get(candidate.id)?.length ?? 0) > 0;

  // muxed multi flow - one container holding every essence, so the segments are on the flow itself
  if (flow.format === TAMS_FORMAT.multi && flow.container) {
    if ((subflows ?? []).some((subflow) => subflow.format === TAMS_FORMAT.multi && subflow.container)) {
      return {valid: false, message: `Muxed flow has a muxed child flow as well`};
    }

    if (!hasSegments(flow)) {
      return {valid: false, message: `Muxed flow has no muxed segments`};
    }
  }

  // unmuxed multi flow - a collection, so the essence is on the subflows
  if (flow.format === TAMS_FORMAT.multi && !flow.container) {
    const videoSubflows = (subflows ?? []).filter((subflow) => subflow.format === TAMS_FORMAT.video);
    const audioSubflows = (subflows ?? []).filter((subflow) => subflow.format === TAMS_FORMAT.audio);

    if (videoSubflows.length === 0 && audioSubflows.length === 0) {
      return {valid: false, message: `Multiflow has no audio or video subflows`};
    }

    if (!videoSubflows.some(hasSegments) && !audioSubflows.some(hasSegments)) {
      return {valid: false, message: `Multiflow's child flows have no segments`};
    }
  }

  // mono essence flow
  if (flow.format === TAMS_FORMAT.audio || flow.format === TAMS_FORMAT.video) {
    if (!hasSegments(flow)) {
      return {valid: false, message: `Mono essence flow has no segments`};
    }
  }

  if (flow.format !== TAMS_FORMAT.audio && flow.format !== TAMS_FORMAT.video && flow.format !== TAMS_FORMAT.multi) {
    return {valid: false, message: `Playback not possible for flows that are not audio, video or multi`};
  }

  return {valid: true};
}

/** Unknown keys are ignored - these options travel alongside the common main media load options. */
const tamsLoadOptionsSchema = z.object({
  timerange: z.string().optional(),
  duration: z.number().positive().optional(),
  ffomTimeZoneOffset: z.number().int().min(-23).max(23).optional(),
  additionalFlowUrls: z.array(z.string().min(1)).optional(),
});

/**
 * Checks the TAMS load options before anything is fetched, so a malformed request fails on the spot
 * instead of after a round trip to the API.
 */
export function validateTamsLoadOptions(loadOptions?: TamsMainMediaLoadOptions | undefined): TamsValidationResult {
  if (!loadOptions) {
    return {valid: true};
  }

  const parsed = tamsLoadOptionsSchema.safeParse(loadOptions);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join(', ');
    return {valid: false, message: `Invalid TAMS load options: ${issues}`};
  }

  const timerange = loadOptions.timerange?.trim();
  if (!timerange) {
    return {valid: true};
  }

  let parsedTimerange;
  try {
    parsedTimerange = TimeRangeUtil.parseTimeRange(timerange);
  } catch (error) {
    return {valid: false, message: `Invalid timerange: ${timerange}`};
  }

  if (TimeRangeUtil.isNever(parsedTimerange) || TimeRangeUtil.isInstantaneous(parsedTimerange)) {
    return {valid: false, message: `Timerange has no duration: ${timerange}`};
  }

  return {valid: true};
}
