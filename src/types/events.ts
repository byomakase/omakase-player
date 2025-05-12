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
import {OmakaseTextTrackCue, OmpAudioTrack, SubtitlesVttTrack} from './track';
import {Video, VideoLoadOptions} from '../video';
import {
  BufferedTimespan,
  OmpAudioRouterInputSoloMuteState,
  OmpAudioRouterState,
  OmpMainAudioInputSoloMuteState,
  OmpMainAudioState,
  OmpPeakProcessorDataMessage,
  OmpPeakProcessorDataPeaks,
  OmpSidecarAudioInputSoloMuteState,
  OmpSidecarAudioState,
  VideoSafeZone,
  VideoWindowPlaybackState,
} from '../video/model';
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

// synchronization

export interface SyncTickEvent extends OmpEvent {}

// endregion

// region video

export interface VideoEvent extends OmpEvent {}

export interface VideoLoadingEvent extends VideoEvent {
  sourceUrl: string;
  frameRate?: number;
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

export interface VideoPlaybackRateEvent extends VideoEvent {
  /**
   * Playback rate
   */
  playbackRate: number;
}

export interface VideoDurationEvent extends VideoEvent {
  /**
   * Duration
   */
  duration: number;
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

export interface VolumeChangeEvent extends AudioEvent {
  /**
   * Volume
   */
  volume: number;

  /**
   * Muted
   */
  muted: boolean;

  /**
   * Previous volume value
   */
  oldVolume: number;
}

export interface AudioLoadedEvent extends AudioEvent {
  /**
   * Audio tracks
   */
  audioTracks: OmpAudioTrack[];

  /**
   * Audio track
   */
  activeAudioTrack: OmpAudioTrack | undefined;
}

export interface AudioSwitchedEvent extends AudioEvent {
  /**
   * Audio track
   */
  activeAudioTrack: OmpAudioTrack;
}

export interface MainAudioEvent extends AudioEvent {}

export interface MainAudioChangeEvent extends MainAudioEvent {
  mainAudioState: OmpMainAudioState;
}

export interface OmpAudioRouterChangeEvent extends AudioEvent {
  audioRouterState: OmpAudioRouterState;
}

export interface AudioPeakProcessorMessageEvent extends AudioEvent {
  data: OmpPeakProcessorDataMessage | OmpPeakProcessorDataPeaks;
}

export interface OmpAudioRouterInputSoloMuteEvent extends AudioEvent {
  audioRouterInputSoloMuteState: OmpAudioRouterInputSoloMuteState;
}

export interface MainAudioInputSoloMuteEvent extends MainAudioEvent {
  mainAudioInputSoloMuteState: OmpMainAudioInputSoloMuteState;
}

export interface SidecarAudioEvent extends AudioEvent {}

export interface SidecarAudioCreateEvent extends SidecarAudioEvent {
  /**
   * Created Sidecar audio state
   */
  createdSidecarAudioState: OmpSidecarAudioState;

  /**
   * All available Sidecar audio states
   */
  sidecarAudioStates: OmpSidecarAudioState[];
}

export interface SidecarAudioRemoveEvent extends SidecarAudioEvent {
  /**
   * Removed Sidecar audio state
   */
  removedSidecarAudio: OmpSidecarAudioState;

  /**
   * All available Sidecar audio states
   */
  sidecarAudioStates: OmpSidecarAudioState[];
}

export interface SidecarAudioChangeEvent extends SidecarAudioEvent {
  /**
   * Changed Sidecar audio state
   */
  changedSidecarAudioState: OmpSidecarAudioState;

  /**
   * All available Sidecar audio states
   */
  sidecarAudioStates: OmpSidecarAudioState[];
}

export interface SidecarAudioVolumeChangeEvent extends SidecarAudioEvent, VolumeChangeEvent {
  /**
   * Sidecar audio state
   */
  sidecarAudioState: OmpSidecarAudioState;
}

export interface SidecarAudioPeakProcessorMessageEvent extends AudioPeakProcessorMessageEvent {
  sidecarAudioTrackId: string; // keep object as light as possible
}

export interface SidecarAudioInputSoloMuteEvent extends SidecarAudioEvent {
  /**
   * Changed sidecar audio input state
   */
  changedSidecarAudioInputSoloMuteState: OmpSidecarAudioInputSoloMuteState;

  /**
   * All available Sidecar audio input states
   */
  sidecarAudioInputSoloMuteStates: OmpSidecarAudioInputSoloMuteState[];
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
  oldValue: MarkerApi;
}

export interface MarkerSelectedEvent extends MarkerEvent {
  marker?: MarkerApi;
}

export interface MarkerInitEvent extends MarkerEvent {
  markers: MarkerApi[];
}

export interface MomentMarkerChangeEvent extends MarkerChangeEvent {
  timeObservation: MomentObservation;
  oldTimeObservation: MomentObservation;
}

export interface PeriodMarkerChangeEvent extends MarkerChangeEvent {
  timeObservation: PeriodObservation;
  oldTimeObservation: PeriodObservation;
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
  eventName: OmpNamedEventEventName;
}

export interface OmpNamedEvent extends OmpEvent {
  eventName: OmpNamedEventEventName;
}

export type OmpNamedEventEventName = 'hlsManifestParsed' | 'hlsMediaAttached' | 'hlsFragLoading' | 'hlsFragLoaded' | 'hlsError';

export interface OmpHlsNamedEvent extends OmpNamedEvent {
  hlsEventName: HlsEvents;
  data: any;
}
