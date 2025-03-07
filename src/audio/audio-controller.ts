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
import {AudioLoadedEvent, AudioPeakProcessorMessageEvent, AudioSwitchedEvent, Destroyable, MainAudioChangeEvent, OmpAudioTrack, SidecarAudioChangeEvent, SidecarAudioCreateEvent, SidecarAudioPeakProcessorMessageEvent, SidecarAudioRemoveEvent} from '../types';
import {AudioMeterStandard, VideoControllerApi} from '../video';
import {AudioInputOutputNode, OmpAudioRouterState, OmpMainAudioState} from '../video/model';
import {OmpAudioRouter} from '../video/audio-router';
import {SidecarAudioApi} from '../api/sidecar-audio-api';
import {undefined} from 'zod';

export class AudioController implements AudioApi, Destroyable {
  public readonly onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined> = new BehaviorSubject<AudioLoadedEvent | undefined>(void 0);
  public readonly onAudioSwitched$: Observable<AudioSwitchedEvent> = new Subject<AudioSwitchedEvent>();

  // audio router
  public readonly onMainAudioChange$: Observable<MainAudioChangeEvent | undefined> = new BehaviorSubject<MainAudioChangeEvent | undefined>(void 0);
  public readonly onMainAudioPeakProcessorMessage$: Observable<AudioPeakProcessorMessageEvent> = new Subject<AudioPeakProcessorMessageEvent>();

  // sidecar audio
  public readonly onSidecarAudioCreate$: Observable<SidecarAudioCreateEvent> = new Subject<SidecarAudioCreateEvent>();
  public readonly onSidecarAudioRemove$: Observable<SidecarAudioRemoveEvent> = new Subject<SidecarAudioRemoveEvent>();
  public readonly onSidecarAudioChange$: Observable<SidecarAudioChangeEvent> = new Subject<SidecarAudioChangeEvent>();
  public readonly onSidecarAudioPeakProcessorMessage$: Observable<SidecarAudioPeakProcessorMessageEvent> = new Subject<SidecarAudioPeakProcessorMessageEvent>();

  protected _videoController: VideoControllerApi;

  constructor(videoController: VideoControllerApi) {
    this._videoController = videoController;

    this.onAudioLoaded$ = this._videoController.onAudioLoaded$;
    this.onAudioSwitched$ = this._videoController.onAudioSwitched$;

    // audio router
    this.onMainAudioChange$ = this._videoController.onMainAudioChange$;
    this.onMainAudioPeakProcessorMessage$ = this._videoController.onMainAudioPeakProcessorMessage$;

    // sidecar audio
    this.onSidecarAudioCreate$ = this._videoController.onSidecarAudioCreate$;
    this.onSidecarAudioRemove$ = this._videoController.onSidecarAudioRemove$;
    this.onSidecarAudioChange$ = this._videoController.onSidecarAudioChange$;
    this.onSidecarAudioPeakProcessorMessage$ = this._videoController.onSidecarAudioPeakProcessorMessage$;
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

  // audio router

  getMainAudioSourceNode(): AudioNode {
    return this._videoController.getMainAudioSourceNode();
  }

  getMainAudioState(): OmpMainAudioState | undefined {
    return this._videoController.getMainAudioState();
  }

  getMainAudioRouter(): OmpAudioRouter | undefined {
    return this._videoController.getMainAudioRouter();
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

  routeMainAudioRouterNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void> {
    return this._videoController.routeMainAudioRouterNodes(newAudioInputOutputNodes);
  }

  // sidecar audio

  getSidecarAudios(): SidecarAudioApi[] {
    return this._videoController.getSidecarAudios();
  }

  getSidecarAudio(id: string): SidecarAudioApi | undefined {
    return this._videoController.getSidecarAudio(id);
  }

  createSidecarAudioTrack(track: Partial<OmpAudioTrack>): Observable<OmpAudioTrack> {
    return this._videoController.createSidecarAudioTrack(track);
  }

  createSidecarAudioTracks(tracks: Partial<OmpAudioTrack>[]): Observable<OmpAudioTrack[]> {
    return this._videoController.createSidecarAudioTracks(tracks);
  }

  activateSidecarAudioTracks(ids: string[], deactivateOthers: boolean | undefined): Observable<void> {
    return this._videoController.activateSidecarAudioTracks(ids, deactivateOthers);
  }

  deactivateSidecarAudioTracks(ids: string[]): Observable<void> {
    return this._videoController.deactivateSidecarAudioTracks(ids);
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

  routeSidecarAudioRouterNodes(sidecarAudioTrackId: string, newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void> {
    return this._videoController.routeSidecarAudioRouterNodes(sidecarAudioTrackId, newAudioInputOutputNodes);
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

  destroy() {}
}
