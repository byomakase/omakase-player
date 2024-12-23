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

import {HelpMenuGroup, MomentObservation, PeriodObservation} from './model';
import {Thumbnail} from '../timeline/thumbnail/thumbnail';
import {OmakaseChartCue} from './chart';
import {MarkerApi} from '../api';
import {OmakaseAudioTrack, OmakaseTextTrackCue, SubtitlesVttTrack} from './track';
import {Video, VideoLoadOptions} from '../video';
import {AudioInputOutputNode, AudioMeterStandard, BufferedTimespan, VideoSafeZone, VideoWindowPlaybackState} from '../video/model';
import {Events as HlsEvents} from 'hls.js';

export interface OmpEvent {}

export interface OmpCancelableEvent {
  cancelableEvent: {
    cancelBubble: boolean;
  };
}

// region general

export interface OmpMouseEvent extends OmpEvent, OmpCancelableEvent {
  mouseEvent: MouseEvent;
}

export interface ClickEvent extends OmpMouseEvent {}

export interface MouseEnterEvent extends OmpMouseEvent {}

export interface MouseMoveEvent extends OmpMouseEvent {}

export interface MouseLeaveEvent extends OmpMouseEvent {}

export interface MouseOutEvent extends OmpMouseEvent {}

export interface MouseOverEvent extends OmpMouseEvent {}

// endregion

// region video

export interface VideoEvent extends OmpEvent {}

export interface VideoLoadingEvent extends VideoEvent {
  sourceUrl: string;
  frameRate: number;
  options?: VideoLoadOptions;
  isAttaching?: boolean;
  isDetaching?: boolean;
}

export interface VideoLoadedEvent extends VideoEvent {
  video: Video;
  videoLoadOptions?: VideoLoadOptions;
  isAttaching?: boolean;
  isDetaching?: boolean;
}

export interface VideoPlayEvent extends VideoEvent {
  /**
   * Current time
   */
  currentTime: number;

  /**
   * Current timecode
   */
  currentTimecode: string;
}

export interface VideoTimeChangeEvent extends VideoEvent {
  /**
   * Current time
   */
  currentTime: number;

  /**
   * Current frame
   */
  frame: number;
}

export interface VideoSeekingEvent extends VideoEvent {
  /**
   * Seek from time
   */
  fromTime: number;

  /**
   * Seek from timecode
   */
  fromTimecode: string;

  /**
   * Time to seek
   */
  toTime: number;

  /**
   * Seek to timecode
   */
  toTimecode: string;
}

export interface VideoSeekedEvent extends VideoEvent {
  /**
   * Current time
   */
  currentTime: number;

  /**
   * Current timecode
   */
  currentTimecode: string;

  /**
   * Previous time
   */
  previousTime: number;

  /**
   * Previous timecode
   */
  previousTimecode: string;
}

export interface VideoBufferingEvent extends VideoEvent {
  bufferedTimespans: BufferedTimespan[];
}

export interface VideoVolumeEvent extends VideoEvent {
  /**
   * Volume
   */
  volume: number;

  /**
   * Muted
   */
  muted: boolean;
}

export interface VideoPlaybackRateEvent extends VideoEvent {
  /**
   * Playback rate
   */
  playbackRate: number;
}

export interface VideoEndedEvent extends VideoEvent {}

export interface VideoHelpMenuChangeEvent extends VideoEvent {
  helpMenuGroups: HelpMenuGroup[];
}

export interface VideoFullscreenChangeEvent extends VideoEvent {
  fullscreen: boolean;
}

export interface VideoSafeZoneChangeEvent extends VideoEvent {
  videoSafeZones: VideoSafeZone[];
}

export interface VideoWindowPlaybackStateChangeEvent extends VideoEvent {
  videoWindowPlaybackState: VideoWindowPlaybackState;
}

export type VideoErrorType = 'VIDEO_LOAD_ERROR' | 'VIDEO_ERROR';

export interface VideoErrorEvent extends VideoEvent {
  type: VideoErrorType;
  message?: string;
}

export interface AudioEvent extends OmpEvent {}

export interface AudioLoadedEvent extends AudioEvent {
  /**
   * Audio tracks
   */
  audioTracks: OmakaseAudioTrack[];

  /**
   * Audio track
   */
  activeAudioTrack: OmakaseAudioTrack | undefined;
}

export interface AudioSwitchedEvent extends AudioEvent {
  /**
   * Audio track
   */
  activeAudioTrack: OmakaseAudioTrack;
}

export interface AudioRoutingEvent extends AudioEvent {
  audioInputOutputNodes: AudioInputOutputNode[][];
}

export interface AudioContextChangeEvent extends AudioEvent {
  audioInputsNumber?: number;
  audioOutputsNumber?: number;
  audioInputOutputNodes: AudioInputOutputNode[][];
}

export interface AudioWorkletNodeCreatedEvent extends AudioEvent {
  audioMeterStandard: AudioMeterStandard;
}

export interface AudioPeakProcessorWorkletNodeMessageEvent extends AudioEvent {
  data: any;
}

// endregion

// region subtitles

export interface SubtitlesEvent extends OmpEvent {
  tracks: SubtitlesVttTrack[];
  currentTrack: SubtitlesVttTrack | undefined;
}

export interface SubtitlesLoadedEvent extends SubtitlesEvent {}

export interface SubtitlesCreateEvent extends SubtitlesEvent {}

export interface SubtitlesChartEvent extends OmpEvent {
  cue?: OmakaseTextTrackCue;
}

// endregion

// region timeline

export interface TimelineEvent extends OmpEvent {}

export interface TimelineReadyEvent extends TimelineEvent {}

export interface TimelineZoomEvent extends TimelineEvent {
  zoomPercent: number;
}

export interface TimelineScrollEvent extends TimelineEvent {
  scrollPercent: number;
}

export interface TimecodeClickEvent extends ClickEvent {
  timecode: string;
}

export interface TimecodeMouseMoveEvent extends MouseMoveEvent {
  timecode: string;
}

export interface ScrubberMoveEvent extends TimelineEvent {
  timecode: string;
  snapped: boolean;
}

export interface PlayheadMoveEvent extends TimelineEvent {
  timecode: string;
}

// endregion

// region scrollbar

export interface ScrollbarEvent extends OmpEvent {}

export interface ScrollbarScrollEvent extends ScrollbarEvent {
  scrollPercent: number;
}

export interface ScrollbarZoomEvent extends ScrollbarEvent {
  zoomPercent: number;
  zoomFocus: number;
}

// endregion

// region thumbnail

export interface ThumbnailEvent extends OmpEvent {
  thumbnail: Thumbnail;
}

// endregion

// region marker

export interface MarkerEvent extends OmpEvent {}

export interface MarkerChangeEvent extends MarkerEvent {}

export interface MarkerFocusEvent extends MarkerEvent {
  marker: MarkerApi;
}

export interface MarkerCreateEvent extends MarkerEvent {
  marker: MarkerApi;
}

export interface MarkerDeleteEvent extends MarkerEvent {
  marker: MarkerApi;
}

export interface MarkerUpdateEvent extends MarkerEvent {
  marker: MarkerApi;
}

export interface MarkerSelectedEvent extends MarkerEvent {
  marker?: MarkerApi;
}

export interface MarkerInitEvent extends MarkerEvent {
  markers: MarkerApi[];
}

export interface MomentMarkerChangeEvent extends MarkerChangeEvent {
  timeObservation: MomentObservation;
}

export interface PeriodMarkerChangeEvent extends MarkerChangeEvent {
  timeObservation: PeriodObservation;
}

// endregion

// region charts

export interface ChartEvent extends OmpEvent {}

export interface ChartCueEvent extends ChartEvent {
  cue: OmakaseChartCue;
}

// endregion

// region marker list

export interface MarkerListEvent extends OmpEvent {}

export interface MarkerListClickEvent extends MarkerListEvent {
  marker: MarkerApi;
}

export interface MarkerListDeleteEvent extends MarkerListEvent {
  marker: MarkerApi;
}

export interface MarkerListUpdateEvent extends MarkerListEvent {
  marker: MarkerApi;
}

export interface MarkerListCreateEvent extends MarkerListEvent {
  marker: MarkerApi;
}

export interface MarkerListInitEvent extends MarkerListEvent {
  markers: MarkerApi[];
}

export interface MarkerListActionEvent extends MarkerListEvent {
  marker: MarkerApi;
  action: string;
}

export interface MarkerListSelectedEvent extends MarkerListEvent {
  marker?: MarkerApi;
}

export interface ThumnbailVttUrlChangedEvent extends VideoEvent {
  thumbnailVttUrl?: string;
}

export interface OmpNamedEvent extends OmpEvent {
  eventName: OmpNamedEvents;
}

export interface OmpNamedEvent extends OmpEvent {
  eventName: OmpNamedEvents;
}

export enum OmpNamedEvents {
  hlsManifestParsed = 'hlsManifestParsed',
  hlsMediaAttached = 'hlsMediaAttached',
  hlsFragLoading = 'hlsFragLoading',
  hlsFragLoaded = 'hlsFragLoaded',
  hlsError = 'hlsError',
}

export interface OmpHlsNamedEvent extends OmpNamedEvent {
  hlsEventName: HlsEvents;
  data: any;
}
