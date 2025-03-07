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

import {Api} from './api';
import {OmpAudioPeakProcessorState} from '../video/model';
import {Observable} from 'rxjs';
import {AudioPeakProcessorMessageEvent} from '../types';

/**
 * Audio peak processor
 */
export interface AudioPeakProcessorApi extends Api {
  /**
   * Fires on audio peak processor message
   */
  onMessage$: Observable<AudioPeakProcessorMessageEvent>;

  /**
   * Source {@link AudioNode}
   */
  get sourceAudioNode(): AudioNode | undefined;

  /**
   * @returns audio peak processor state
   */
  getAudioPeakProcessorState(): OmpAudioPeakProcessorState;
}
