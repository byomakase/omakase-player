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

import {Api} from './api';
import {Observable} from 'rxjs';
import {AxiosRequestConfig} from 'axios';
import {ThumbnailVttFile} from '../track';
import {ThumbnailEvent} from '../types';

export interface ThumbnailLaneApi extends Api {

  /**
   * Fires on thumbnail click
   * @readonly
   */
  onClick$: Observable<ThumbnailEvent>;

  /**
   * Loads data from VTT file
   * @param vttUrl
   * @param axiosConfig
   */
  loadVtt(vttUrl: string, axiosConfig?: AxiosRequestConfig): Observable<ThumbnailVttFile | undefined>;

}
