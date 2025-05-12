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

import {BehaviorSubject, Observable} from 'rxjs';
import {VideoApi} from '../api';
import {
  AudioLoadedEvent,
  AudioPeakProcessorMessageEvent,
  AudioSwitchedEvent,
  Destroyable,
  MainAudioChangeEvent,
  OmpAudioTrack,
  OmpNamedEventEventName,
  SidecarAudioChangeEvent,
  SidecarAudioCreateEvent,
  SidecarAudioPeakProcessorMessageEvent,
  SidecarAudioRemoveEvent,
  SidecarAudioVolumeChangeEvent,
  SubtitlesCreateEvent,
  SubtitlesEvent,
  SubtitlesLoadedEvent,
  SubtitlesVttTrack,
  ThumnbailVttUrlChangedEvent,
  VideoHelpMenuChangeEvent,
  VolumeChangeEvent,
  SidecarAudioInputSoloMuteEvent,
  MainAudioInputSoloMuteEvent,
} from '../types';
import {VideoControllerConfig} from './video-controller';
import {
  AudioMeterStandard,
  BufferedTimespan,
  OmpAudioRouterState,
  OmpAudioRoutingConnection,
  OmpAudioRoutingPath,
  OmpMainAudioInputSoloMuteState,
  OmpMainAudioState,
  OmpSidecarAudioInputSoloMuteState,
  OmpSidecarAudioState,
  PlaybackState,
  Video,
  VideoLoadOptions,
  VideoLoadOptionsInternal,
} from './model';
import {OmpAudioRouter} from './audio-router';
import {SidecarAudioApi} from '../api/sidecar-audio-api';
import {OmpAudioEffectFilter, OmpAudioEffectParam, OmpAudioEffectsGraphDef} from '../audio';

/**
 * @internal
 */
export interface VideoControllerApi extends VideoApi, Destroyable {
  onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined>;
  onAudioSwitched$: Observable<AudioSwitchedEvent>;

  onAudioOutputVolumeChange$: Observable<VolumeChangeEvent>;

  onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined>;

  onPlaybackState$: Observable<PlaybackState>;

  onSubtitlesCreate$: Observable<SubtitlesCreateEvent>;
  onSubtitlesRemove$: Observable<SubtitlesEvent>;
  onSubtitlesShow$: Observable<SubtitlesEvent>;
  onSubtitlesHide$: Observable<SubtitlesEvent>;

  onHelpMenuChange$: Observable<VideoHelpMenuChangeEvent>;
  onThumbnailVttUrlChanged$: Observable<ThumnbailVttUrlChangedEvent>;

  onActiveNamedEventStreamsChange$: Observable<OmpNamedEventEventName[]>;

  loadVideoInternal(sourceUrl: string, options: VideoLoadOptions | undefined, optionsInternal: VideoLoadOptionsInternal): Observable<Video>;

  getConfig(): VideoControllerConfig;

  getPlaybackState(): PlaybackState | undefined;

  getBufferedTimespans(): BufferedTimespan[];

  // subtitles
  createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack | undefined>;

  removeSubtitlesTrack(id: string): Observable<void>;

  removeAllSubtitlesTracks(): Observable<void>;

  getSubtitlesTracks(): SubtitlesVttTrack[];

  getActiveSubtitlesTrack(): SubtitlesVttTrack | undefined;

  showSubtitlesTrack(id: string): Observable<void>;

  hideSubtitlesTrack(id: string): Observable<void>;

  // audio

  getAudioContext(): AudioContext;

  // audio output

  getAudioOutputNode(): AudioNode;

  setAudioOutputVolume(volume: number): Observable<void>;

  getAudioOutputVolume(): number;

  setAudioOutputMuted(muted: boolean): Observable<void>;

  toggleAudioOutputMuteUnmute(): Observable<void>;

  isAudioOutputMuted(): boolean;

  muteAudioOutput(): Observable<void>;

  unmuteAudioOutput(): Observable<void>;

  // audio router

  onMainAudioChange$: Observable<MainAudioChangeEvent | undefined>;

  onMainAudioPeakProcessorMessage$: Observable<AudioPeakProcessorMessageEvent>;

  onMainAudioInputSoloMute$: Observable<MainAudioInputSoloMuteEvent | undefined>;

  getMainAudioNode(): AudioNode;

  getMainAudioState(): OmpMainAudioState | undefined;

  getMainAudioRouter(): OmpAudioRouter | undefined;

  getMainAudioInputSoloMuteState(): OmpMainAudioInputSoloMuteState | undefined;

  getMainAudioRouterInitialRoutingConnections(): OmpAudioRoutingConnection[] | undefined;

  setMainAudioRouterInitialRoutingConnections(connections: OmpAudioRoutingConnection[]): Observable<void>;

  createMainAudioRouter(inputsNumber: number, outputsNumber?: number, defaultMatrix?: OmpAudioRoutingConnection[][]): Observable<OmpAudioRouterState>;

  createMainAudioRouterWithOutputsResolver(
    inputsNumber: number,
    outputsNumberResolver: (maxChannelCount: number) => number,
    defaultMatrix?: OmpAudioRoutingConnection[][]
  ): Observable<OmpAudioRouterState>;

  createMainAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>>;

  updateMainAudioRouterConnections(connections: OmpAudioRoutingConnection[]): Observable<void>;

  setMainAudioEffectsGraphs(effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void>;

  removeMainAudioEffectsGraphs(routingPath?: Partial<OmpAudioRoutingPath>): Observable<void>;

  setMainAudioEffectsParams(param: OmpAudioEffectParam, filter?: {routingPath?: Partial<OmpAudioRoutingPath>} & OmpAudioEffectFilter): Observable<void>;

  toggleMainAudioRouterSolo(routingPath: Omit<OmpAudioRoutingPath, 'output'>): Observable<void>;

  toggleMainAudioRouterMute(routingPath: Omit<OmpAudioRoutingPath, 'output'>): Observable<void>;

  // sidecar audio

  onSidecarAudioCreate$: Observable<SidecarAudioCreateEvent>;

  onSidecarAudioRemove$: Observable<SidecarAudioRemoveEvent>;

  onSidecarAudioChange$: Observable<SidecarAudioChangeEvent>;

  onSidecarAudioVolumeChange$: Observable<SidecarAudioVolumeChangeEvent>;

  onSidecarAudioPeakProcessorMessage$: Observable<SidecarAudioPeakProcessorMessageEvent>;

  onSidecarAudioInputSoloMute$: Observable<SidecarAudioInputSoloMuteEvent>;

  getSidecarAudios(): SidecarAudioApi[];

  getSidecarAudio(id: string): SidecarAudioApi | undefined;

  getSidecarAudioState(id: string): OmpSidecarAudioState | undefined;

  getSidecarAudioStates(): OmpSidecarAudioState[];

  getSidecarAudioInputSoloMuteState(id: string): OmpSidecarAudioInputSoloMuteState | undefined;

  getSidecarAudioInputSoloMuteStates(): OmpSidecarAudioInputSoloMuteState[];

  getSidecarAudioRouterInitialRoutingConnections(id: string): OmpAudioRoutingConnection[] | undefined;

  setSidecarAudioRouterInitialRoutingConnections(id: string, connections: OmpAudioRoutingConnection[]): Observable<void>;

  createSidecarAudioTrack(track: Partial<OmpAudioTrack>): Observable<OmpAudioTrack>;

  createSidecarAudioTracks(tracks: Partial<OmpAudioTrack>[]): Observable<OmpAudioTrack[]>;

  removeSidecarAudioTracks(ids: string[]): Observable<void>;

  removeAllSidecarAudioTracks(): Observable<void>;

  getSidecarAudioTracks(): OmpAudioTrack[];

  getActiveSidecarAudioTracks(): OmpAudioTrack[];

  activateSidecarAudioTracks(ids: string[] | undefined, deactivateOthers: boolean | undefined): Observable<void>;

  deactivateSidecarAudioTracks(ids: string[] | undefined): Observable<void>;

  setSidecarVolume(volume: number, ids: string[] | undefined): Observable<void>;

  setSidecarMuted(muted: boolean, ids: string[] | undefined): Observable<void>;

  muteSidecar(ids: string[] | undefined): Observable<void>;

  unmuteSidecar(ids: string[] | undefined): Observable<void>;

  createSidecarAudioRouter(sidecarAudioTrackId: string, inputsNumber?: number, outputsNumber?: number, defaultMatrix?: OmpAudioRoutingConnection[][]): Observable<OmpAudioRouterState>;

  updateSidecarAudioRouterConnections(sidecarAudioTrackId: string, connections: OmpAudioRoutingConnection[]): Observable<void>;

  setSidecarAudioEffectsGraph(sidecarAudioTrackId: string, effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void>;

  removeSidecarAudioEffectsGraphs(sidecarAudioTrackId: string, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void>;

  setSidecarAudioEffectsParams(sidecarAudioTrackId: string, param: OmpAudioEffectParam, filter?: {routingPath?: Partial<OmpAudioRoutingPath>} & OmpAudioEffectFilter): Observable<void>;

  createSidecarAudioPeakProcessor(sidecarAudioTrackId: string, audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>>;

  exportMainAudioTrackToSidecar(mainAudioTrackId: string): Observable<OmpAudioTrack>;

  exportMainAudioTracksToSidecar(mainAudioTrackIds: string[]): Observable<OmpAudioTrack[]>;

  toggleSidecarAudioRouterSolo(sidecarAudioTrackId: string, routingPath: Omit<OmpAudioRoutingPath, 'output'>): Observable<void>;

  toggleSidecarAudioRouterMute(sidecarAudioTrackId: string, routingPath: Omit<OmpAudioRoutingPath, 'output'>): Observable<void>;

  // thumbnails

  getThumbnailVttUrl(): string | undefined;

  loadThumbnailVttUrl(thumbnailVttUrl: string): Observable<void>;

  //picture in picture

  isPiPSupported(): boolean;
}
