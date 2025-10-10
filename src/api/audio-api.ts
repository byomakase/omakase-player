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
import {Observable, Subject} from 'rxjs';
import {
  AudioLoadedEvent,
  AudioPeakProcessorMessageEvent,
  AudioSwitchedEvent,
  AudioUpdatedEvent,
  MainAudioChangeEvent,
  MainAudioInputSoloMuteEvent,
  OmpAudioTrack,
  OmpAudioTrackCreateType,
  SidecarAudioChangeEvent,
  SidecarAudioCreateEvent,
  SidecarAudioInputSoloMuteEvent,
  SidecarAudioLoadedEvent,
  SidecarAudioPeakProcessorMessageEvent,
  SidecarAudioRemoveEvent,
  SidecarAudiosChangeEvent,
  SidecarAudioVolumeChangeEvent,
  VolumeChangeEvent,
} from '../types';
import {AudioMeterStandard, OmpAudioRouterState, OmpAudioRoutingConnection, OmpAudioRoutingPath, OmpMainAudioState, OmpSidecarAudioState} from '../video';
import {OmpAudioRouter} from '../video/audio-router';
import {SidecarAudioApi} from './sidecar-audio-api';
import {OmpAudioEffectFilter, OmpAudioEffectParam, OmpAudioEffectsGraphDef} from '../audio';
import {OmpAudioRoutingInputType, OmpMainAudioInputSoloMuteState, OmpSidecarAudioInputSoloMuteState} from '../video/model';

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
   *  Fires on audio track updated
   *  @readonly
   */
  onAudioUpdated$: Observable<AudioUpdatedEvent>

  /**
   * Fires on master audio output volume change
   * @readonly
   */
  onAudioOutputVolumeChange$: Observable<VolumeChangeEvent>;

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
   * Updates loaded audio track. Updateable properties are: {@link OmpAudioTrack.label}, {@link OmpAudioTrack.language}. Other changes will be ignored.
   * @param audioTrack
   */
  updateAudioTrack(audioTrack: OmpAudioTrack): Observable<void>;

  /**
   * @returns {@link AudioContext}
   */
  getAudioContext(): AudioContext;

  // audio output

  /**
   * Sets master output audio volume. Master output volume control is located in chain after main audio and sidecar audios. It affects main audio level and sidecar audios levels.
   * @param volume volume level
   */
  setAudioOutputVolume(volume: number): Observable<void>;

  /**
   * @returns master output audio volume
   */
  getAudioOutputVolume(): number;

  /**
   * Sets master output audio muted. Master output volume control is located in chain after main audio and sidecar audios. It affects main audio level and sidecar audios levels.
   * @param muted
   */
  setAudioOutputMuted(muted: boolean): Observable<void>;

  /**
   * Toggles master output audio muted.
   */
  toggleAudioOutputMuteUnmute(): Observable<void>;

  /**
   * @returns master output audio muted
   */
  isAudioOutputMuted(): boolean;

  /**
   * Mutes master output audio.
   */
  muteAudioOutput(): Observable<void>;

  /**
   * Unmutes master output audio.
   */
  unmuteAudioOutput(): Observable<void>;

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
   * Fires on Main audio input solo/mute action
   * @readonly
   */
  onMainAudioInputSoloMute$: Observable<MainAudioInputSoloMuteEvent | undefined>;

  /**
   * @returns Main {@link AudioNode}
   */
  getMainAudioNode(): AudioNode | undefined;

  /**
   * @returns Main audio state
   */
  getMainAudioState(): OmpMainAudioState | undefined;

  /**
   * @returns Main audio router
   */
  getMainAudioRouter(): OmpAudioRouter | undefined;

  /**
   * @returns Main audio input state
   */
  getMainAudioInputSoloMuteState(): OmpMainAudioInputSoloMuteState | undefined;

  /**
   * @returns Main audio router initial/default connections
   */
  getMainAudioRouterInitialRoutingConnections(): OmpAudioRoutingConnection[] | undefined;

  /**
   * Overrides main audio router initial/default connections
   * @param connections
   */
  setMainAudioRouterInitialRoutingConnections(connections: OmpAudioRoutingConnection[]): Observable<void>;

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
   * Updates Main audio routing connections
   *
   * @param connections
   */
  updateMainAudioRouterConnections(connections: OmpAudioRoutingConnection[]): Observable<void>;

  /**
   * Creates {@link OmpAudioEffectsGraph}'s from provided {@link effectsGraphDef}'s to routing paths provided with {@link routingPath}. </br>
   *
   * If {@link routingPath} is not provided {@link OmpAudioEffectsGraph}s will be set on all available routing paths. </br>
   * If {@link routingPath.output} is not provided {@link OmpAudioEffectsGraph}s will be set on all available routing paths where {@link OmpAudioRoutingPath.input} = {@link routingPath.input}. </br>
   * If {@link routingPath.input} is not provided {@link OmpAudioEffectsGraph}s will be set on all available routing paths where {@link OmpAudioRoutingPath.output} = {@link routingPath.output}. </br>
   *
   * @param effectsGraphDef
   * @param routingPath
   */
  setMainAudioEffectsGraphs(effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void>;

  /**
   * Removes {@link OmpAudioEffectsGraph}'s from routing paths provided with {@link routingPath}. </br>
   *
   * If {@link routingPath} is not provided {@link OmpAudioEffectsGraph}s will be removed on all available routing paths. </br>
   * If {@link routingPath.output} is not provided {@link OmpAudioEffectsGraph}s will be removed on all available routing paths where {@link OmpAudioRoutingPath.input} = {@link routingPath.input}. </br>
   * If {@link routingPath.input} is not provided {@link OmpAudioEffectsGraph}s will be removed on all available routing paths where {@link OmpAudioRoutingPath.output} = {@link routingPath.output}. </br>
   *
   * @param routingPath
   */
  removeMainAudioEffectsGraphs(routingPath?: Partial<OmpAudioRoutingPath>): Observable<void>;

  /**
   * Sets {@link OmpAudioEffectParam} for audio effects that match {@link filter}
   *
   * @param param
   * @param filter
   */
  setMainAudioEffectsParams(param: OmpAudioEffectParam, filter?: {routingPath?: Partial<OmpAudioRoutingPath>} & OmpAudioEffectFilter): Observable<void>;

  /**
   * Solo or unsolo (depending on current input state) given main audio router input
   *
   * @param routingPath
   */
  toggleMainAudioRouterSolo(routingPath: OmpAudioRoutingInputType): Observable<void>;

  /**
   * Mute or unmute (depending on current input state) given main audio router input
   *
   * @param routingPath
   */
  toggleMainAudioRouterMute(routingPath: OmpAudioRoutingInputType): Observable<void>;

  // sidecar audio

  /**
   * Fires when Sidecar audio is created
   * @readonly
   */
  onSidecarAudioCreate$: Observable<SidecarAudioCreateEvent>;

  /**
   * Fires when Sidecar audio is loaded
   * @readonly
   */
  onSidecarAudioLoaded$: Observable<SidecarAudioLoadedEvent>;

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
   * Fires when Sidecar audio volume changes.
   * @readonly
   */
  onSidecarAudioVolumeChange$: Observable<SidecarAudioVolumeChangeEvent>;

  /**
   * Fires on Sidecar audio peak processor message
   * @readonly
   */
  onSidecarAudioPeakProcessorMessage$: Observable<SidecarAudioPeakProcessorMessageEvent>;

  /**
   * Fires on Sidecar audio input solo/mute action
   * @readonly
   */
  onSidecarAudioInputSoloMute$: Observable<SidecarAudioInputSoloMuteEvent>;

  /**
   * Fires when any Sidecar audio is created, removed or changed
   * @readonly
   */
  onSidecarAudiosChange$: Observable<SidecarAudiosChangeEvent>;

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
   * @returns Sidecar audio state
   * @param id Sidecar audio {@link OmpAudioTrack.id}
   */
  getSidecarAudioState(id: string): OmpSidecarAudioState | undefined;

  /**
   * @returns Sidecar audio input state
   *
   * @param id
   */
  getSidecarAudioInputSoloMuteState(id: string): OmpSidecarAudioInputSoloMuteState | undefined;

  /**
   * @returns Sidecar audio router initial/default connections
   *
   * @param id
   */
  getSidecarAudioRouterInitialRoutingConnections(id: string): OmpAudioRoutingConnection[] | undefined;

  /**
   * Overrides sidecar audio router initial/default connections
   * @param id
   * @param connections
   */
  setSidecarAudioRouterInitialRoutingConnections(id: string, connections: OmpAudioRoutingConnection[]): Observable<void>;

  /**
   * Creates new Sidecar audio track
   * @param track
   */
  createSidecarAudioTrack(track: OmpAudioTrackCreateType): Observable<OmpAudioTrack>;

  /**
   * Creates multiple Sidecar audio tracks
   * @param tracks
   */
  createSidecarAudioTracks(tracks: OmpAudioTrackCreateType[]): Observable<OmpAudioTrack[]>;

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
   * @param ids Sidecar audio track {@link OmpAudioTrack.id}s, if undefined changes will affect all tracks
   * @param deactivateOthers Set to true if other sidecar audios should be deactivated
   */
  activateSidecarAudioTracks(ids: string[] | undefined, deactivateOthers: boolean | undefined): Observable<void>;

  /**
   * Deactivates Sidecar audio tracks, if undefined changes will affect all tracks
   * @param ids Sidecar audio track {@link OmpAudioTrack.id}s
   */
  deactivateSidecarAudioTracks(ids: string[] | undefined): Observable<void>;

  /**
   * Sets sidecar audio volume. Unmutes audio.
   * @param volume
   * @param ids Sidecar audio track {@link OmpAudioTrack.id}s, if undefined changes will affect all tracks
   */
  setSidecarVolume(volume: number, ids: string[] | undefined): Observable<void>;

  /**
   * Sets sidecar audio muted / unmuted
   * @param muted muted (true) or unmuted (false)
   * @param ids Sidecar audio track {@link OmpAudioTrack.id}s, if undefined changes will affect all tracks
   */
  setSidecarMuted(muted: boolean, ids: string[] | undefined): Observable<void>;

  /**
   * Mutes sidecar audio
   * @param ids Sidecar audio track {@link OmpAudioTrack.id}s, if undefined changes will affect all tracks
   */
  muteSidecar(ids: string[] | undefined): Observable<void>;

  /**
   * Unmutes sidecar audio
   * @param ids Sidecar audio track {@link OmpAudioTrack.id}s, if undefined changes will affect all tracks
   */
  unmuteSidecar(ids: string[] | undefined): Observable<void>;

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
   *
   * Updates Sidecar audio routing connections
   *
   * @param sidecarAudioTrackId id Sidecar audio {@link OmpAudioTrack.id}
   * @param connections
   */
  updateSidecarAudioRouterConnections(sidecarAudioTrackId: string, connections: OmpAudioRoutingConnection[]): Observable<void>;

  /**
   * Creates {@link OmpAudioEffectsGraph}'s from provided {@link effectsGraphDef}'s to routing paths provided with {@link routingPath}. </br>
   *
   * If {@link routingPath} is not provided {@link OmpAudioEffectsGraph}s will be set on all available routing paths. </br>
   * If {@link routingPath.output} is not provided {@link OmpAudioEffectsGraph}s will be set on all available routing paths where {@link OmpAudioRoutingPath.input} = {@link routingPath.input}. </br>
   * If {@link routingPath.input} is not provided {@link OmpAudioEffectsGraph}s will be set on all available routing paths where {@link OmpAudioRoutingPath.output} = {@link routingPath.output}. </br>
   *
   * @param sidecarAudioTrackId id Sidecar audio {@link OmpAudioTrack.id}
   * @param effectsGraphDef
   * @param routingPath
   */
  setSidecarAudioEffectsGraph(sidecarAudioTrackId: string, effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void>;

  /**
   * Removes {@link OmpAudioEffectsGraph}'s from routing paths provided with {@link routingPath}. </br>
   *
   * If {@link routingPath} is not provided {@link OmpAudioEffectsGraph}s will be removed on all available routing paths. </br>
   * If {@link routingPath.output} is not provided {@link OmpAudioEffectsGraph}s will be removed on all available routing paths where {@link OmpAudioRoutingPath.input} = {@link routingPath.input}. </br>
   * If {@link routingPath.input} is not provided {@link OmpAudioEffectsGraph}s will be removed on all available routing paths where {@link OmpAudioRoutingPath.output} = {@link routingPath.output}. </br>
   *
   * @param sidecarAudioTrackId id Sidecar audio {@link OmpAudioTrack.id}
   * @param routingPath
   */
  removeSidecarAudioEffectsGraphs(sidecarAudioTrackId: string, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void>;

  /**
   * Sets {@link OmpAudioEffectParam} for audio effects that match {@link filter}
   *
   * @param sidecarAudioTrackId id Sidecar audio {@link OmpAudioTrack.id}
   * @param param
   * @param filter
   */
  setSidecarAudioEffectsParams(sidecarAudioTrackId: string, param: OmpAudioEffectParam, filter?: {routingPath?: Partial<OmpAudioRoutingPath>} & OmpAudioEffectFilter): Observable<void>;

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

  /**
   * Solo or unsolo (depending on current input state) given sidecar audio router input
   * @param sidecarAudioTrackId
   * @param routingPath
   */
  toggleSidecarAudioRouterSolo(sidecarAudioTrackId: string, routingPath: OmpAudioRoutingInputType): Observable<void>;

  /**
   * Mute or unmute (depending on current input state) given sidecar audio router input
   * @param sidecarAudioTrackId
   * @param routingPath
   */
  toggleSidecarAudioRouterMute(sidecarAudioTrackId: string, routingPath: OmpAudioRoutingInputType): Observable<void>;
}
