/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

export interface Manifest {
  allowCache: boolean;
  endList: boolean;
  mediaSequence: number;
  dateRanges: any[];
  discontinuitySequence: number;
  playlistType: string;
  custom: Record<string, any>;
  playlists: Playlist[];
  mediaGroups: MediaGroups;
  dateTimeString: string;
  dateTimeObject: Date;
  targetDuration: number;
  totalDuration: number;
  discontinuityStarts: number[];
  segments: Segment[];
}

export interface Playlist {
  attributes: Record<string, any>;
  Manifest: Manifest;
}

export interface MediaGroups {
  AUDIO: Record<string, Record<string, AudioGroup>>;
  VIDEO: Record<string, any>;
  'CLOSED-CAPTIONS': Record<string, any>;
  SUBTITLES: Record<string, any>;
}

export interface AudioGroup {
  default: boolean;
  autoselect: boolean;
  language: string;
  uri: string;
  instreamId: string;
  characteristics: string;
  forced: boolean;
}

export interface Segment {
  title: string;
  byterange: Byterange;
  duration: number;
  programDateTime: number;
  attributes: Record<string, any>;
  discontinuity: number;
  uri: string;
  timeline: number;
  key: Key;
  map: SegmentMap;
  'cue-out'?: string;
  'cue-out-cont'?: string;
  'cue-in'?: string;
  custom: Record<string, any>;
}

export interface Byterange {
  length: number;
  offset: number;
}

export interface Key {
  method: string;
  uri: string;
  iv: string;
}

export interface SegmentMap {
  uri: string;
  byterange: Byterange;
}
