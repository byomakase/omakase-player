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

export const TAMS_FORMAT = {
  video: 'urn:x-nmos:format:video',
  audio: 'urn:x-nmos:format:audio',
  data: 'urn:x-nmos:format:data',
  multi: 'urn:x-nmos:format:multi',
} as const;

export const TAMS_CONTAINER = {
  vtt: 'text/vtt',
} as const;

export const TAMS_HLS_TAG = {
  hlsName: 'hls_name',
  hlsLanguage: 'hls_language',
  hlsDefault: 'hls_default',
  hlsAutoSelect: 'hls_autoselect',
  /** Value a boolean valued tag carries when set; anything else reads as `NO`. */
  yes: 'YES',
} as const;

export const TAMS_TAG = {
  flow_status: 'flow_status',
  flow_status_ingesting: 'ingesting',
} as const;

export const TAMS_FLOW = {
  /** Value {@link TamsFlowWithStatus.status} carries while the store is still being written to. */
  status_ingesting: 'ingesting',
} as const;

export const TAMS_MANIFEST = {
  syntheticHost: 'https://tams.omakase.local',
  nonPlayableGapUri: 'http://byomakase.org/non-playable-gap',
  masterPlaylistVersion: 10,
  mediaPlaylistVersion: 3,
  gapToleranceSeconds: 0.001,
  minPlausibleVideoBitrate: 100_000,
} as const;

export const TAMS_LIVE = {
  pollSegmentFraction: 1,
  pollIntervalMinMs: 500,
  pollIntervalFallbackMs: 2000,
} as const;

export const TAMS_SUBTITLE = {
  timestampMapPattern: /^X-TIMESTAMP-MAP=.*$/m,
  timestampMapLocalPattern: /LOCAL:(\d{2,}):([0-5]\d):([0-5]\d[.,]\d{1,3})/,
} as const;

export const TAMS_TIME_MOMENT_EXPR = String.raw`-?(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]{0,8})`;
