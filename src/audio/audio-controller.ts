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

import {AudioApi} from '../api';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {
  AudioLoadedEvent,
  AudioPeakProcessorMessageEvent,
  AudioSwitchedEvent,
  Destroyable,
  MainAudioChangeEvent,
  MainAudioInputSoloMuteEvent,
  OmpAudioTrack,
  OmpAudioTrackCreateType,
  SidecarAudioChangeEvent,
  SidecarAudioCreateEvent,
  SidecarAudioInputSoloMuteEvent,
  SidecarAudioPeakProcessorMessageEvent,
  SidecarAudioRemoveEvent,
  SidecarAudioVolumeChangeEvent,
  VolumeChangeEvent,
} from '../types';
import {AudioMeterStandard, OmpAudioRouterState, OmpAudioRoutingConnection, OmpAudioRoutingPath, OmpMainAudioState, OmpSidecarAudioState, VideoControllerApi} from '../video';
import {OmpAudioRouter} from '../video/audio-router';
import {SidecarAudioApi} from '../api/sidecar-audio-api';
import {OmpAudioEffectFilter, OmpAudioEffectParam, OmpAudioEffectsGraphDef} from './audio-effects';
import {OmpAudioRoutingInputType, OmpMainAudioInputSoloMuteState, OmpSidecarAudioInputSoloMuteState} from '../video/model';

export class AudioController implements AudioApi, Destroyable {
  public readonly onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined> = new BehaviorSubject<AudioLoadedEvent | undefined>(void 0);
  public readonly onAudioSwitched$: Observable<AudioSwitchedEvent> = new Subject<AudioSwitchedEvent>();
  public readonly onAudioOutputVolumeChange$: Observable<VolumeChangeEvent> = new Subject<VolumeChangeEvent>();

  // audio router
  public readonly onMainAudioChange$: Observable<MainAudioChangeEvent | undefined> = new BehaviorSubject<MainAudioChangeEvent | undefined>(void 0);
  public readonly onMainAudioPeakProcessorMessage$: Observable<AudioPeakProcessorMessageEvent> = new Subject<AudioPeakProcessorMessageEvent>();
  public readonly onMainAudioInputSoloMute$: Observable<MainAudioInputSoloMuteEvent | undefined> = new BehaviorSubject<MainAudioInputSoloMuteEvent | undefined>(void 0);

  // sidecar audio
  public readonly onSidecarAudioCreate$: Observable<SidecarAudioCreateEvent> = new Subject<SidecarAudioCreateEvent>();
  public readonly onSidecarAudioRemove$: Observable<SidecarAudioRemoveEvent> = new Subject<SidecarAudioRemoveEvent>();
  public readonly onSidecarAudioChange$: Observable<SidecarAudioChangeEvent> = new Subject<SidecarAudioChangeEvent>();
  public readonly onSidecarAudioVolumeChange$: Observable<SidecarAudioVolumeChangeEvent> = new Subject<SidecarAudioVolumeChangeEvent>();
  public readonly onSidecarAudioPeakProcessorMessage$: Observable<SidecarAudioPeakProcessorMessageEvent> = new Subject<SidecarAudioPeakProcessorMessageEvent>();
  public readonly onSidecarAudioInputSoloMute$: Observable<SidecarAudioInputSoloMuteEvent> = new Subject<SidecarAudioInputSoloMuteEvent>();

  protected _videoController: VideoControllerApi;

  constructor(videoController: VideoControllerApi) {
    this._videoController = videoController;

    this.onAudioLoaded$ = this._videoController.onAudioLoaded$;
    this.onAudioSwitched$ = this._videoController.onAudioSwitched$;
    this.onAudioOutputVolumeChange$ = this._videoController.onAudioOutputVolumeChange$;

    // audio router
    this.onMainAudioChange$ = this._videoController.onMainAudioChange$;
    this.onMainAudioPeakProcessorMessage$ = this._videoController.onMainAudioPeakProcessorMessage$;
    this.onMainAudioInputSoloMute$ = this._videoController.onMainAudioInputSoloMute$;

    // sidecar audio
    this.onSidecarAudioCreate$ = this._videoController.onSidecarAudioCreate$;
    this.onSidecarAudioRemove$ = this._videoController.onSidecarAudioRemove$;
    this.onSidecarAudioChange$ = this._videoController.onSidecarAudioChange$;
    this.onSidecarAudioVolumeChange$ = this._videoController.onSidecarAudioVolumeChange$;
    this.onSidecarAudioPeakProcessorMessage$ = this._videoController.onSidecarAudioPeakProcessorMessage$;
    this.onSidecarAudioInputSoloMute$ = this._videoController.onSidecarAudioInputSoloMute$;
  }

  getActiveAudioTrack(): OmpAudioTrack | undefined {
    return this._videoController.getActiveAudioTrack();
  }

  getAudioTracks(): OmpAudioTrack[] {
    return this._videoController.getAudioTracks();
  }

  setActiveAudioTrack(id: string): Observable<void> {
    return this._videoController.setActiveAudioTrack(id);
  }

  getAudioContext(): AudioContext {
    return this._videoController.getAudioContext();
  }

  toggleMainAudioRouterSolo(routingPath: OmpAudioRoutingInputType): Observable<void> {
    return this._videoController.toggleMainAudioRouterSolo(routingPath);
  }

  toggleMainAudioRouterMute(routingPath: OmpAudioRoutingInputType): Observable<void> {
    return this._videoController.toggleMainAudioRouterMute(routingPath);
  }

  // audio output

  getAudioOutputVolume(): number {
    return this._videoController.getAudioOutputVolume();
  }

  isAudioOutputMuted(): boolean {
    return this._videoController.isAudioOutputMuted();
  }

  setAudioOutputMuted(muted: boolean): Observable<void> {
    return this._videoController.setAudioOutputMuted(muted);
  }

  toggleAudioOutputMuteUnmute(): Observable<void> {
    return this._videoController.toggleAudioOutputMuteUnmute();
  }

  muteAudioOutput(): Observable<void> {
    return this._videoController.muteAudioOutput();
  }

  unmuteAudioOutput(): Observable<void> {
    return this._videoController.unmuteAudioOutput();
  }

  setAudioOutputVolume(volume: number): Observable<void> {
    return this._videoController.setAudioOutputVolume(volume);
  }

  // audio router

  getMainAudioNode(): AudioNode {
    return this._videoController.getMainAudioNode();
  }

  getMainAudioState(): OmpMainAudioState | undefined {
    return this._videoController.getMainAudioState();
  }

  getMainAudioRouter(): OmpAudioRouter | undefined {
    return this._videoController.getMainAudioRouter();
  }

  getMainAudioInputSoloMuteState(): OmpMainAudioInputSoloMuteState | undefined {
    return this._videoController.getMainAudioInputSoloMuteState();
  }

  getMainAudioRouterInitialRoutingConnections(): OmpAudioRoutingConnection[] | undefined {
    return this._videoController.getMainAudioRouterInitialRoutingConnections();
  }

  setMainAudioRouterInitialRoutingConnections(connections: OmpAudioRoutingConnection[]): Observable<void> {
    return this._videoController.setMainAudioRouterInitialRoutingConnections(connections);
  }

  createMainAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<OmpAudioRouterState> {
    return this._videoController.createMainAudioRouter(inputsNumber, outputsNumber);
  }

  createMainAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<OmpAudioRouterState> {
    return this._videoController.createMainAudioRouterWithOutputsResolver(inputsNumber, outputsNumberResolver);
  }

  createMainAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>> {
    return this._videoController.createMainAudioPeakProcessor(audioMeterStandard);
  }

  updateMainAudioRouterConnections(connections: OmpAudioRoutingConnection[]): Observable<void> {
    return this._videoController.updateMainAudioRouterConnections(connections);
  }

  setMainAudioEffectsGraphs(effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    return this._videoController.setMainAudioEffectsGraphs(effectsGraphDef, routingPath);
  }

  removeMainAudioEffectsGraphs(routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    return this._videoController.removeMainAudioEffectsGraphs(routingPath);
  }

  setMainAudioEffectsParams(param: OmpAudioEffectParam, filter?: {routingPath?: Partial<OmpAudioRoutingPath>} & OmpAudioEffectFilter): Observable<void> {
    return this._videoController.setMainAudioEffectsParams(param, filter);
  }

  // sidecar audio

  getSidecarAudios(): SidecarAudioApi[] {
    return this._videoController.getSidecarAudios();
  }

  getSidecarAudio(id: string): SidecarAudioApi | undefined {
    return this._videoController.getSidecarAudio(id);
  }

  getSidecarAudioState(id: string): OmpSidecarAudioState | undefined {
    return this._videoController.getSidecarAudioState(id);
  }

  getSidecarAudioInputSoloMuteState(id: string): OmpSidecarAudioInputSoloMuteState | undefined {
    return this._videoController.getSidecarAudioInputSoloMuteState(id);
  }

  getSidecarAudioRouterInitialRoutingConnections(id: string): OmpAudioRoutingConnection[] | undefined {
    return this._videoController.getSidecarAudioRouterInitialRoutingConnections(id);
  }

  setSidecarAudioRouterInitialRoutingConnections(id: string, connections: OmpAudioRoutingConnection[]): Observable<void> {
    return this._videoController.setSidecarAudioRouterInitialRoutingConnections(id, connections);
  }

  createSidecarAudioTrack(track: OmpAudioTrackCreateType): Observable<OmpAudioTrack> {
    return this._videoController.createSidecarAudioTrack(track);
  }

  createSidecarAudioTracks(tracks: OmpAudioTrackCreateType[]): Observable<OmpAudioTrack[]> {
    return this._videoController.createSidecarAudioTracks(tracks);
  }

  activateSidecarAudioTracks(ids: string[] | undefined, deactivateOthers: boolean | undefined): Observable<void> {
    return this._videoController.activateSidecarAudioTracks(ids, deactivateOthers);
  }

  deactivateSidecarAudioTracks(ids: string[] | undefined): Observable<void> {
    return this._videoController.deactivateSidecarAudioTracks(ids);
  }

  muteSidecar(ids: string[] | undefined): Observable<void> {
    return this._videoController.muteSidecar(ids);
  }

  setSidecarVolume(volume: number, ids: string[] | undefined): Observable<void> {
    return this._videoController.setSidecarVolume(volume, ids);
  }

  setSidecarMuted(muted: boolean, ids: string[] | undefined): Observable<void> {
    return this._videoController.setSidecarMuted(muted, ids);
  }

  unmuteSidecar(ids: string[] | undefined): Observable<void> {
    return this._videoController.unmuteSidecar(ids);
  }

  getActiveSidecarAudioTracks(): OmpAudioTrack[] {
    return this._videoController.getActiveSidecarAudioTracks();
  }

  getSidecarAudioTracks(): OmpAudioTrack[] {
    return this._videoController.getSidecarAudioTracks();
  }

  removeSidecarAudioTracks(ids: string[]): Observable<void> {
    return this._videoController.removeSidecarAudioTracks(ids);
  }

  removeAllSidecarAudioTracks(): Observable<void> {
    return this._videoController.removeAllSidecarAudioTracks();
  }

  createSidecarAudioRouter(sidecarAudioTrackId: string, inputsNumber?: number, outputsNumber?: number): Observable<OmpAudioRouterState> {
    return this._videoController.createSidecarAudioRouter(sidecarAudioTrackId, inputsNumber, outputsNumber);
  }

  updateSidecarAudioRouterConnections(sidecarAudioTrackId: string, connections: OmpAudioRoutingConnection[]): Observable<void> {
    return this._videoController.updateSidecarAudioRouterConnections(sidecarAudioTrackId, connections);
  }

  setSidecarAudioEffectsGraph(sidecarAudioTrackId: string, effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    return this._videoController.setSidecarAudioEffectsGraph(sidecarAudioTrackId, effectsGraphDef, routingPath);
  }

  removeSidecarAudioEffectsGraphs(sidecarAudioTrackId: string, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    return this._videoController.removeSidecarAudioEffectsGraphs(sidecarAudioTrackId, routingPath);
  }

  setSidecarAudioEffectsParams(sidecarAudioTrackId: string, param: OmpAudioEffectParam, filter?: {routingPath?: Partial<OmpAudioRoutingPath>} & OmpAudioEffectFilter): Observable<void> {
    return this._videoController.setSidecarAudioEffectsParams(sidecarAudioTrackId, param, filter);
  }

  createSidecarAudioPeakProcessor(sidecarAudioTrackId: string, audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>> {
    return this._videoController.createSidecarAudioPeakProcessor(sidecarAudioTrackId, audioMeterStandard);
  }

  exportMainAudioTrackToSidecar(mainAudioTrackId: string): Observable<OmpAudioTrack> {
    return this._videoController.exportMainAudioTrackToSidecar(mainAudioTrackId);
  }

  exportMainAudioTracksToSidecar(mainAudioTrackIds: string[]): Observable<OmpAudioTrack[]> {
    return this._videoController.exportMainAudioTracksToSidecar(mainAudioTrackIds);
  }

  toggleSidecarAudioRouterSolo(sidecarAudioTrackId: string, routingPath: OmpAudioRoutingInputType): Observable<void> {
    return this._videoController.toggleSidecarAudioRouterSolo(sidecarAudioTrackId, routingPath);
  }

  toggleSidecarAudioRouterMute(sidecarAudioTrackId: string, routingPath: OmpAudioRoutingInputType): Observable<void> {
    return this._videoController.toggleSidecarAudioRouterMute(sidecarAudioTrackId, routingPath);
  }

  destroy() {}
}
