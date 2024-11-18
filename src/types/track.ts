/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

export interface OmakaseTextTrackCue {
  id: string;
  startTime: number;
  endTime: number;
}

export interface OmakaseTextTrack {
  id: string;
  src: string;
  default: boolean;
  label: string;
  language: string;
  kind: string;
  hidden: boolean;
}

export interface OmakaseVttCue extends OmakaseTextTrackCue {
  index: number;
  text: string;
  vttCue?: VTTCue;
  extension?: OmakaseVttCueExtension;
}

export interface ThumbnailVttCue extends OmakaseVttCue {
  url: string;
}

export interface SubtitlesVttCue extends OmakaseVttCue {

}

export interface AudioVttCue extends OmakaseVttCue {
  minSample: number;
  maxSample: number;
}

export interface MarkerVttCue extends OmakaseVttCue {

}

export interface LineChartVttCue extends OmakaseVttCue {
  value: number
}

export interface BarChartVttCue extends OmakaseVttCue {
  value: number
}

export interface OgChartVttCue extends OmakaseVttCue {
  value: number
}

export interface OmakaseVttCueExtension {
  rows?: VttCueExtensionRow[];
}

export interface VttCueExtensionRow {
  value?: string;
  measurement?: string;
  comment?: string;
}

export interface OmakaseVttCueEvent<T extends OmakaseVttCue> {
  cue?: T;
  action: 'entry' | 'exit';
}

export interface SubtitlesVttTrack extends OmakaseTextTrack {
  kind: 'subtitles';
  embedded: boolean;
  contentDigest?: string;
}

export interface OmakaseAudioTrack {
  id: string;
  src: string;
  label: string;
  language?: string;
}
