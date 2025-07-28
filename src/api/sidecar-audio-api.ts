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
import {Destroyable, OmpAudioTrack, SidecarAudioLoadedEvent, SidecarAudioLoadingEvent, VolumeChangeEvent} from '../types';
import {AudioRouterApi} from './audio-router-api';
import {AudioPeakProcessorApi} from './audio-peak-processor-api';
import {AudioMeterStandard, OmpSidecarAudioState} from '../video';
import {Observable} from 'rxjs';
import {OmpSidecarAudioInputSoloMuteState} from '../video/model';
import {OmpAudioPeakProcessor} from '../video/audio-peak-processor';
import {OmpAudioRouter} from '../video/audio-router';

/**
 * For Sidecar audio operations
 */
export interface SidecarAudioApi extends Api, Destroyable {
  /**
   * Fires when sidecar audio starts loading
   * @readonly
   */
  onLoading$: Observable<SidecarAudioLoadingEvent>;

  /**
   * Fires @{link SidecarAudioLoadedEvent} when sidecar audio is loaded
   * @readonly
   */
  onLoaded$: Observable<SidecarAudioLoadedEvent | undefined>;

  /**
   * Fires when sidecar audio starts or stops buffering current video time.
   * Always emits the current value on subscription.
   * @readonly
   */
  onVideoCurrentTimeBuffering$: Observable<boolean>;

  /**
   * Fires on state change
   * @readonly
   */
  onStateChange$: Observable<OmpSidecarAudioState>;

  /**
   * Fires on audio router solo/mute action
   * @readonly
   */
  onInputSoloMute$: Observable<OmpSidecarAudioInputSoloMuteState>;

  /**
   *  Fires on volume change
   *  @readonly
   */
  onVolumeChange$: Observable<VolumeChangeEvent>;

  /**
   * Starts loading sidecar audio track
   */
  loadSource(): Observable<SidecarAudioLoadedEvent>;

  createAudioRouter(inputsNumber?: number, outputsNumber?: number): OmpAudioRouter;

  createAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<OmpAudioPeakProcessor>;

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
   * @returns Volume level
   */
  getVolume(): number;

  /**
   * Sets volume level. Unmutes audio.
   * @param volume Decimal value between [0, 1]
   */
  setVolume(volume: number): void;

  /**
   * Mute
   */
  mute(): void;

  /**
   * Unmute
   */
  unmute(): void;

  /**
   * @returns Is audio muted
   */
  isMuted(): boolean;

  /**
   * Toggles mute / unmute
   */
  toggleMuteUnmute(): void;

  /**
   * Sets mute / unmute
   * @param muted
   */
  setMuted(muted: boolean): void;

  /**
   * @returns Sidecar audio state
   */
  getSidecarAudioState(): OmpSidecarAudioState;

  /**
   * @returns Sidecar audio input state
   */
  getSidecarAudioInputSoloMuteState(): OmpSidecarAudioInputSoloMuteState;
}
