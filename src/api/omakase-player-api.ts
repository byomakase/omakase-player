/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import {Api} from './api';
import {Timeline, TimelineConfig} from '../timeline';
import {Observable} from 'rxjs';
import {SubtitlesApi} from './subtitles-api';
import {VideoApi} from './video-api';
import {Video} from '../video/video';
import {OmakaseEventEmitter} from '../events';
import {OmakasePlayerEventMap, OmakasePlayerEventsType} from '../types';
import {AudioApi} from './audio-api';
import {TimelineApi} from './timeline-api';
import {OmakasePlayerStyle} from '../omakase-player';
import {ComponentConfigStyleComposed} from '../common';

export interface OmakasePlayerApi extends Api, OmakaseEventEmitter<OmakasePlayerEventMap> {

  /***
   * Loads new video
   * @param videoSourceUrl Video manifest URL
   * @param videoFrameRate Video frame rate
   */
  loadVideo(videoSourceUrl: string, videoFrameRate: number): Observable<Video>;

  /***
   * Loads new video
   *
   * @param videoSourceUrl Video manifest URL
   * @param videoFrameRate Video frame rate
   * @param duration Video duration
   */
  loadVideo(videoSourceUrl: string, videoFrameRate: number, duration: number): Observable<Video>;

  /***
   * Creates Timeline
   * @param config Timeline configuration
   */
  createTimeline(config: Partial<ComponentConfigStyleComposed<TimelineConfig>>): Observable<Timeline>;

  /***
   * Returns OmakasePlayerStyle
   */
  get style(): OmakasePlayerStyle;

  /***
   * Sets OmakasePlayerStyle
   * @param value
   */
  set style(value: Partial<OmakasePlayerStyle>)

  /***
   * Returns Timeline API
   */
  get timeline(): TimelineApi;

  /***
   * Returns Video API
   */
  get video(): VideoApi;

  /***
   * Returns Audio API
   */
  get audio(): AudioApi;


  /***
   * Returns Subtitles API
   */
  get subtitles(): SubtitlesApi;

  /***
   * Returns Omakase Player events enumeration
   */
  get EVENTS(): OmakasePlayerEventsType;

  /***
   * Destroys OmakasePlayer instance and frees up memory
   */
  destroy(): void;
}
