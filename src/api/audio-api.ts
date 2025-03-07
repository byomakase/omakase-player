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
import {AudioLoadedEvent, AudioPeakProcessorMessageEvent, AudioSwitchedEvent, MainAudioChangeEvent, OmpAudioTrack, SidecarAudioChangeEvent, SidecarAudioCreateEvent, SidecarAudioPeakProcessorMessageEvent, SidecarAudioRemoveEvent} from '../types';
import {AudioInputOutputNode, AudioMeterStandard, OmpAudioRouterState, OmpMainAudioState} from '../video/model';
import {OmpAudioRouter} from '../video/audio-router';
import {SidecarAudioApi} from './sidecar-audio-api';

export interface AudioApi extends Api {
  /**
   * Fires on audio load. Initial value is undefined.
   * Always emits the current value on subscription.
   *
   * @readonly
   */
  onAudioLoaded$: Observable<AudioLoadedEvent | undefined>;

  /**
   *  Fires on audio track switched
   *  @readonly
   */
  onAudioSwitched$: Observable<AudioSwitchedEvent>;

  /**
   * @returns available audio tracks
   */
  getAudioTracks(): OmpAudioTrack[];

  /**
   * @returns current active audio track
   */
  getActiveAudioTrack(): OmpAudioTrack | undefined;

  /**
   * Sets active audio track
   * @param id {@link OmpAudioTrack} id
   */
  setActiveAudioTrack(id: string): Observable<void>;

  /**
   * @returns {@link AudioContext}
   */
  getAudioContext(): AudioContext;

  // main audio

  /**
   * Fires when Main audio topology changes. For example, audio router is created.
   * @readonly
   */
  onMainAudioChange$: Observable<MainAudioChangeEvent | undefined>;

  /**
   * Fires on Main audio peak processor message
   * @readonly
   */
  onMainAudioPeakProcessorMessage$: Observable<AudioPeakProcessorMessageEvent>;

  /**
   * @returns Main {@link AudioNode}
   */
  getMainAudioSourceNode(): AudioNode;

  /**
   * @returns Main audio state
   */
  getMainAudioState(): OmpMainAudioState | undefined;

  /**
   * @returns Main audio router
   */
  getMainAudioRouter(): OmpAudioRouter | undefined;

  /**
   * Creates Main audio router
   *
   * @param inputsNumber Number of inputs
   * @param outputsNumber Number of outputs
   */
  createMainAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<OmpAudioRouterState>;

  /**
   * Creates Main audio router
   *
   * @param inputsNumber Number of inputs
   * @param outputsNumberResolver Function for resolving number of router outputs. Provides {@link outputsNumberResolver.maxChannelCount} as function input
   */
  createMainAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<OmpAudioRouterState>;

  /**
   * Creates Main audio peak processor
   *
   * @param audioMeterStandard default "peak-sample"
   * @returns observable with stream of {@link AudioPeakProcessorMessageEvent} events
   */
  createMainAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>>;

  /**
   * Routes provided Main audio  {@link AudioInputOutputNode} nodes
   *
   * @param newAudioInputOutputNodes
   */
  routeMainAudioRouterNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void>;

  // sidecar audio

  /**
   * Fires when Sidecar audio is created
   * @readonly
   */
  onSidecarAudioCreate$: Observable<SidecarAudioCreateEvent>;

  /**
   * Fires when Sidecar audio is removed
   * @readonly
   */
  onSidecarAudioRemove$: Observable<SidecarAudioRemoveEvent>;

  /**
   * Fires when Sidecar audio topology changes. For example, audio router is created.
   * @readonly
   */
  onSidecarAudioChange$: Observable<SidecarAudioChangeEvent>;

  /**
   * Fires on Sidecar audio peak processor message
   * @readonly
   */
  onSidecarAudioPeakProcessorMessage$: Observable<SidecarAudioPeakProcessorMessageEvent>;

  /**
   * @returns Sidecar audios
   */
  getSidecarAudios(): SidecarAudioApi[];

  /**
   * @returns Sidecar audio
   * @param id Sidecar audio {@link OmpAudioTrack.id}
   */
  getSidecarAudio(id: string): SidecarAudioApi | undefined;

  /**
   * Creates new Sidecar audio track
   * @param track
   */
  createSidecarAudioTrack(track: Partial<OmpAudioTrack>): Observable<OmpAudioTrack>;

  /**
   * Creates multiple Sidecar audio tracks
   * @param tracks
   */
  createSidecarAudioTracks(tracks: Partial<OmpAudioTrack>[]): Observable<OmpAudioTrack[]>;

  /**
   * Removes Sidecar audio tracks
   * @param ids Sidecar audio {@link OmpAudioTrack}.id array
   */
  removeSidecarAudioTracks(ids: string[]): Observable<void>;

  /**
   * @returns Sidecar audio tracks
   */
  getSidecarAudioTracks(): OmpAudioTrack[];

  /**
   * @returns active Sidecar audio tracks
   */
  getActiveSidecarAudioTracks(): OmpAudioTrack[];

  /**
   * Activates Sidecar audio tracks
   * @param ids Sidecar audio {@link OmpAudioTrack.id} array to activate
   * @param deactivateOthers Set to true if other sidecar audios should be deactivated
   */
  activateSidecarAudioTracks(ids: string[], deactivateOthers: boolean | undefined): Observable<void>;

  /**
   * Deactivates Sidecar audio tracks
   * @param ids Sidecar audio {@link OmpAudioTrack.id} array to activate
   */
  deactivateSidecarAudioTracks(ids: string[]): Observable<void>;

  /**
   * Removes all Sidecar audio tracks
   */
  removeAllSidecarAudioTracks(): Observable<void>;

  /**
   * Creates Sidecar audio router
   *
   * @param sidecarAudioTrackId id Sidecar audio {@link OmpAudioTrack.id}
   * @param inputsNumber
   * @param outputsNumber
   */
  createSidecarAudioRouter(sidecarAudioTrackId: string, inputsNumber?: number, outputsNumber?: number): Observable<OmpAudioRouterState>;

  /**
   * Routes provided Sidecar audio {@link AudioInputOutputNode} nodes
   * @param sidecarAudioTrackId id Sidecar audio {@link OmpAudioTrack.id}
   * @param newAudioInputOutputNodes
   */
  routeSidecarAudioRouterNodes(sidecarAudioTrackId: string, newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void>;

  /**
   * Creates Sidecar audio peak processor
   *
   * @param sidecarAudioTrackId id Sidecar audio {@link OmpAudioTrack.id}
   * @param audioMeterStandard
   * @returns observable with stream of {@link AudioPeakProcessorMessageEvent} events
   */
  createSidecarAudioPeakProcessor(sidecarAudioTrackId: string, audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>>;

  /**
   * Exports Main audio track as Sidecar audio track
   *
   * @param mainAudioTrackId Main audio track id
   */
  exportMainAudioTrackToSidecar(mainAudioTrackId: string): Observable<OmpAudioTrack>;

  /**
   * Exports Main audio tracks as Sidecar audio tracks
   *
   * @param mainAudioTrackIds
   */
  exportMainAudioTracksToSidecar(mainAudioTrackIds: string[]): Observable<OmpAudioTrack[]>;
}
