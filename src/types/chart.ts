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

export interface OmakaseChartCue {
  id: string;

  /**
   * Seconds
   */
  startTime: number;

  /**
   * Seconds
   */
  endTime: number;
}

export interface OmakaseChart<T extends OmakaseChartCue> {
  cues: T[];
}

export interface OmakaseChartFile<T extends OmakaseChart<any>> {
  get cues(): T['cues'];

  findCue(time: number): T['cues'][0] | undefined;

  findCues(startTime: number, endTime: number): T['cues'];
}

export interface BarChartCue extends OmakaseChartCue {
  value: number;
}

export interface LineChartCue extends OmakaseChartCue {
  value: number;
}

export interface OgChartCue extends BarChartCue {

}

export interface OgChart extends OmakaseChart<OgChartCue> {

}

export interface BarChart extends OmakaseChart<BarChartCue> {

}


