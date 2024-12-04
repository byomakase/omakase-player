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

import {AxiosRequestConfig} from 'axios';
import {OmakaseVttCue, OmakaseVttCueEvent} from '../types';
import {Observable} from 'rxjs';
import {OmakaseVttFile} from '../vtt';

export interface VttAwareApi<Q extends OmakaseVttCue, T extends OmakaseVttFile<Q>> {
  /**
   * URL pointing to the VTT file
   */
  get vttUrl(): string | undefined;

  set vttUrl(vttUrl: string | undefined);

  /**
   * VTT file content
   */
  get vttFile(): T | undefined;

  set vttFile(vttFile: T | undefined);

  /**
   * Fires when VTT file is loaded
   * @readonly
   */
  onVttFileLoaded$: Observable<T>;

  /**
   * Fires on VTT cue entry/exit on video time change
   * @readonly
   */
  onVideoCueEvent$: Observable<OmakaseVttCueEvent<Q>>;

  /**
   * Fires on VTT cue entry/exit on playhead drag
   * @readonly
   */
  onPlayheadCueEvent$: Observable<OmakaseVttCueEvent<Q>>;

  /**
   * Fires on VTT cue entry/exit on scrubber move
   * @readonly
   */
  onScrubberCueEvent$: Observable<OmakaseVttCueEvent<Q>>;

  /**
   * Loads data from VTT file
   * @param vttUrl
   * @param options
   */
  loadVtt(vttUrl: string, options?: VttLoadOptions): Observable<T | undefined>;
}

export type DownsampleStrategy = 'none' | 'drop' | 'max' | 'min' | 'avg';

export interface DownsampleConfig {
  /**
   * Period for downsampling in milliseconds
   */
  downsamplePeriod: number;

  /**
   * Strategy for downsampling (supported values: none, drop, min, max, and avg)
   */
  downsampleStrategy: DownsampleStrategy;
}

export interface VttLoadOptions {
  /**
   * Axios configuration for VTT fetch request
   */
  axiosConfig?: AxiosRequestConfig;

  /**
   * Donwsampling configuration
   */
  downsampleConfig?: DownsampleConfig;
}
