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
  SubtitlesCreateEvent,
  SubtitlesEvent,
  SubtitlesLoadedEvent,
  SubtitlesVttTrack,
  ThumnbailVttUrlChangedEvent,
  VideoHelpMenuChangeEvent,
} from '../types';
import {VideoControllerConfig} from './video-controller';
import {
  AudioInputOutputNode,
  AudioMeterStandard,
  BufferedTimespan,
  OmpAudioRouterState,
  OmpMainAudioState,
  OmpSidecarAudioState,
  PlaybackState,
  Video,
  VideoLoadOptions,
  VideoLoadOptionsInternal,
} from './model';
import {OmpAudioRouter} from './audio-router';
import {SidecarAudioApi} from '../api/sidecar-audio-api';

/**
 * @internal
 */
export interface VideoControllerApi extends VideoApi, Destroyable {
  onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined>;
  onAudioSwitched$: Observable<AudioSwitchedEvent>;

  onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined>;

  onPlaybackState$: Observable<PlaybackState>;

  onSubtitlesCreate$: Observable<SubtitlesCreateEvent>;
  onSubtitlesRemove$: Observable<SubtitlesEvent>;
  onSubtitlesShow$: Observable<SubtitlesEvent>;
  onSubtitlesHide$: Observable<SubtitlesEvent>;

  onHelpMenuChange$: Observable<VideoHelpMenuChangeEvent>;
  onThumbnailVttUrlChanged$: Observable<ThumnbailVttUrlChangedEvent>;

  onActiveNamedEventStreamsChange$: Observable<OmpNamedEventEventName[]>;

  loadVideoInternal(sourceUrl: string, frameRate: number | string, options: VideoLoadOptions | undefined, optionsInternal: VideoLoadOptionsInternal): Observable<Video>;

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

  // audio router

  onMainAudioChange$: Observable<MainAudioChangeEvent | undefined>;

  onMainAudioPeakProcessorMessage$: Observable<AudioPeakProcessorMessageEvent>;

  getMainAudioSourceNode(): AudioNode;

  getMainAudioState(): OmpMainAudioState | undefined;

  getMainAudioRouter(): OmpAudioRouter | undefined;

  createMainAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<OmpAudioRouterState>;

  createMainAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<OmpAudioRouterState>;

  createMainAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>>;

  routeMainAudioRouterNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void>;

  // sidecar audio

  onSidecarAudioCreate$: Observable<SidecarAudioCreateEvent>;

  onSidecarAudioRemove$: Observable<SidecarAudioRemoveEvent>;

  onSidecarAudioChange$: Observable<SidecarAudioChangeEvent>;

  onSidecarAudioPeakProcessorMessage$: Observable<SidecarAudioPeakProcessorMessageEvent>;

  getSidecarAudios(): SidecarAudioApi[];

  getSidecarAudio(id: string): SidecarAudioApi | undefined;

  getSidecarAudioStates(): OmpSidecarAudioState[]; // non api method ?

  createSidecarAudioTrack(track: Partial<OmpAudioTrack>): Observable<OmpAudioTrack>;

  createSidecarAudioTracks(tracks: Partial<OmpAudioTrack>[]): Observable<OmpAudioTrack[]>;

  removeSidecarAudioTracks(ids: string[]): Observable<void>;

  removeAllSidecarAudioTracks(): Observable<void>;

  getSidecarAudioTracks(): OmpAudioTrack[];

  getActiveSidecarAudioTracks(): OmpAudioTrack[];

  activateSidecarAudioTracks(ids: string[], deactivateOthers: boolean | undefined): Observable<void>;

  deactivateSidecarAudioTracks(ids: string[]): Observable<void>;

  createSidecarAudioRouter(sidecarAudioTrackId: string, inputsNumber?: number, outputsNumber?: number): Observable<OmpAudioRouterState>;

  // createSidecarAudioRouterWithOutputsResolver(sidecarAudioTrackId: string, inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<OmpAudioRouterState>;

  routeSidecarAudioRouterNodes(sidecarAudioTrackId: string, newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void>;

  createSidecarAudioPeakProcessor(sidecarAudioTrackId: string, audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>>;

  exportMainAudioTrackToSidecar(mainAudioTrackId: string): Observable<OmpAudioTrack>;

  exportMainAudioTracksToSidecar(mainAudioTrackIds: string[]): Observable<OmpAudioTrack[]>;



  // thumbnails

  getThumbnailVttUrl(): string | undefined;

  loadThumbnailVttUrl(thumbnailVttUrl: string): Observable<void>;

  //picture in picture

  isPiPSupported(): boolean;
}
