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
  AudioContextChangeEvent,
  AudioLoadedEvent,
  AudioRoutingEvent,
  AudioSwitchedEvent,
  AudioWorkletNodeCreatedEvent,
  AudioPeakProcessorWorkletNodeMessageEvent,
  Destroyable,
  SubtitlesCreateEvent,
  SubtitlesEvent,
  SubtitlesLoadedEvent,
  SubtitlesVttTrack,
  VideoHelpMenuChangeEvent,
  ThumnbailVttUrlChangedEvent,
} from '../types';
import {BufferedTimespan} from './video-controller';
import {AudioInputOutputNode, AudioMeterStandard, PlaybackState, Video, VideoLoadOptions, VideoLoadOptionsInternal} from './model';

/**
 * @internal
 */
export interface VideoControllerApi extends VideoApi, Destroyable {
  onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined>;
  onAudioWorkletNodeCreated$: BehaviorSubject<AudioWorkletNodeCreatedEvent | undefined>;
  onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined>;

  onPlaybackState$: Observable<PlaybackState>;

  onAudioSwitched$: Observable<AudioSwitchedEvent>;
  onAudioContextChange$: Observable<AudioContextChangeEvent>;
  onAudioRouting$: Observable<AudioRoutingEvent>;
  onAudioPeakProcessorWorkletNodeMessage$: Observable<AudioPeakProcessorWorkletNodeMessageEvent>;

  onSubtitlesCreate$: Observable<SubtitlesCreateEvent>;
  onSubtitlesRemove$: Observable<SubtitlesEvent>;
  onSubtitlesShow$: Observable<SubtitlesEvent>;
  onSubtitlesHide$: Observable<SubtitlesEvent>;

  onHelpMenuChange$: Observable<VideoHelpMenuChangeEvent>;
  onThumbnailVttUrlChanged$: Observable<ThumnbailVttUrlChangedEvent | undefined>;

  loadVideoInternal(sourceUrl: string, frameRate: number | string, options: VideoLoadOptions | undefined, optionsInternal: VideoLoadOptionsInternal): Observable<Video>;

  dispatchVideoTimeChange(): void;

  getPlaybackState(): PlaybackState | undefined;

  getBufferedTimespans(): BufferedTimespan[];

  // subtitles
  createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack | undefined>;

  getSubtitlesTracks(): SubtitlesVttTrack[];

  getActiveSubtitlesTrack(): SubtitlesVttTrack | undefined;

  removeSubtitlesTrack(id: string): Observable<void>;

  removeAllSubtitlesTracks(): Observable<void>;

  showSubtitlesTrack(id: string): Observable<void>;

  hideSubtitlesTrack(id: string): Observable<void>;

  // audio
  getHTMLAudioUtilElement(): HTMLAudioElement;

  createAudioContext(contextOptions?: AudioContextOptions): Observable<void>;

  getAudioContext(): AudioContext | undefined;

  getMediaElementAudioSourceNode(): MediaElementAudioSourceNode | undefined;

  createAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<void>;

  createAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<void>;

  getAudioInputOutputNodes(): AudioInputOutputNode[][];

  routeAudioInputOutputNode(newAudioInputOutputNode: AudioInputOutputNode): Observable<void>;

  routeAudioInputOutputNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void>;

  getAudioPeakProcessorWorkletNode(): AudioWorkletNode | undefined;

  createAudioPeakProcessorWorkletNode(audioMeterStandard: AudioMeterStandard): Observable<void>;

  getThumbnailVttUrl(): string | undefined;

  loadThumbnailVttUrl(thumbnailVttUrl: string): Observable<void>;
}
