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
import {OmpAudioTrack} from '../types';
import {AudioRouterApi} from './audio-router-api';
import {AudioPeakProcessorApi} from './audio-peak-processor-api';
import {OmpSidecarAudioState} from '../video/model';

/**
 * For Sidecar audio operations
 */
export interface SidecarAudioApi extends Api {
  /**
   * Sidecar audio track
   */
  get audioTrack(): OmpAudioTrack;

  /**
   * Sidecar audio router
   */
  get audioRouter(): AudioRouterApi | undefined;

  /**
   * Sidecar audio peak processor
   */
  get audioPeakProcessor(): AudioPeakProcessorApi | undefined;

  /**
   * Sidecar audio track active status
   */
  get isActive(): boolean;

  /**
   * Activates track
   */
  activate(): void;

  /**
   * Deactivates track
   */
  deactivate(): void;

  /**
   * @returns Sidecar audio state
   */
  getSidecarAudioState(): OmpSidecarAudioState;

  /**
   * @internal
   */
  correctAudioDrift(): void;
}
