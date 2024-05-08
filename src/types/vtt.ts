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

import {OmakaseTextTrackCue, OmakaseTrackConfig} from './track';

export interface OmakaseRemoteVttFile<T extends OmakaseVttCue> extends OmakaseVttFile<T> {
  get url(): string;
}

export interface OmakaseVttFile<T extends OmakaseVttCue> {
  get cues(): T[];

  findCue(time: number): T | undefined;

  findCues(startTime: number, endTime: number): T[]
}

export interface OmakaseVttCue extends OmakaseTextTrackCue {
  index: number;
  text: string;
  vttCue?: VTTCue;
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

export interface SubtitlesVttTrackConfig extends OmakaseTrackConfig {
  label: string;
  language: string;
}

export interface ChartVttCue extends OmakaseVttCue {

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
