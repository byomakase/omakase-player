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

import {MomentObservation, PeriodObservation} from './model';
import {Thumbnail} from '../timeline/thumbnail/thumbnail';
import {CamelToSnakeCase} from './types';
import {OmakaseTextTrack, OmakaseTextTrackCue} from './track';
import {Marker} from '../timeline';
import {OmakaseChartCue} from './chart';
import {Video} from '../video';

export const OmakasePlayerEvents: OmakasePlayerEventsType = {
  OMAKASE_SUBTITLES_HIDE: 'omakaseSubtitlesHide',
  OMAKASE_TIMELINE_ZOOM: 'omakaseTimelineZoom',
  OMAKASE_VIDEO_LOADING: 'omakaseVideoLoading',
  OMAKASE_VIDEO_LOADED: 'omakaseVideoLoaded',
  OMAKASE_VIDEO_PAUSE: 'omakaseVideoPause',
  OMAKASE_VIDEO_PLAY: 'omakaseVideoPlay',
  OMAKASE_VIDEO_SEEKED: 'omakaseVideoSeeked',
  OMAKASE_VIDEO_SEEKING: 'omakaseVideoSeeking',
  OMAKASE_VIDEO_BUFFERING: 'omakaseVideoBuffering',
  OMAKASE_VIDEO_ENDED: 'omakaseVideoEnded',
  OMAKASE_VIDEO_TIME_CHANGE: 'omakaseVideoTimeChange',
  OMAKASE_VIDEO_AUDIO_SWITCHED: 'omakaseVideoAudioSwitched',
  OMAKASE_AUDIO_SWITCHED: 'omakaseAudioSwitched',
  OMAKASE_SUBTITLES_LOADED: 'omakaseSubtitlesLoaded',
  OMAKASE_SUBTITLES_CREATE: 'omakaseSubtitlesCreate',
  OMAKASE_SUBTITLES_REMOVE: 'omakaseSubtitlesRemove',
  OMAKASE_SUBTITLES_SHOW: 'omakaseSubtitlesShow',
  OMAKASE_TIMELINE_SCROLL: 'omakaseTimelineScroll'
}

export type OmakasePlayerEventsType = OmakasePlayerEventsMappingType<OmakasePlayerEventMap>

export type OmakasePlayerEventsMappingType<T> = {
  [K in keyof T as Uppercase<CamelToSnakeCase<string & K>>]: K
}

export type OmakasePlayerEventMap = VideoEventMap & AudioEventMap & SubtitlesEventMap & TimelineEventMap

export type VideoEventMap = {
  'omakaseVideoLoading': VideoLoadingEvent,
  'omakaseVideoLoaded': VideoLoadedEvent,
  'omakaseVideoPlay': VideoPlayEvent,
  'omakaseVideoPause': VideoPlayEvent,
  'omakaseVideoTimeChange': VideoTimeChangeEvent,
  'omakaseVideoSeeking': VideoSeekingEvent,
  'omakaseVideoSeeked': VideoSeekedEvent,
  'omakaseVideoEnded': VideoEndedEvent,
  'omakaseVideoAudioSwitched': AudioEvent,
  'omakaseVideoBuffering': VideoBufferingEvent
}

export type AudioEventMap = {
  'omakaseAudioSwitched': AudioEvent,
}

export type SubtitlesEventMap = {
  'omakaseSubtitlesLoaded': SubtitlesLoadedEvent,
  'omakaseSubtitlesCreate': SubtitlesCreateEvent,
  'omakaseSubtitlesRemove': SubtitlesEvent,
  'omakaseSubtitlesShow': SubtitlesEvent,
  'omakaseSubtitlesHide': SubtitlesEvent
}

export type TimelineEventMap = {
  'omakaseTimelineScroll': TimelineScrollEvent,
  'omakaseTimelineZoom': TimelineZoomEvent
}

export interface OmakaseEvent {

}

export interface OmakaseCancelableEvent {
  cancelableEvent: {
    cancelBubble: boolean
  }
}

// region general

export interface OmakaseMouseEvent extends OmakaseEvent, OmakaseCancelableEvent {
  mouseEvent: MouseEvent
}

export interface ClickEvent extends OmakaseMouseEvent {

}

export interface MouseEnterEvent extends OmakaseMouseEvent {

}

export interface MouseMoveEvent extends OmakaseMouseEvent {

}

export interface MouseLeaveEvent extends OmakaseMouseEvent {

}

export interface MouseOutEvent extends OmakaseMouseEvent {

}

export interface MouseOverEvent extends OmakaseMouseEvent {

}

// endregion

// region video

export interface VideoEvent extends OmakaseEvent {

}

export interface VideoLoadingEvent extends VideoEvent {
  sourceUrl: string;
  frameRate: number;
}

export interface VideoLoadedEvent extends VideoEvent {
  video: Video;
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
  frame: number
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
  bufferedTimespans: {
    start: number,
    end: number
  }[]
}

export interface VideoVolumeEvent extends VideoEvent {
  /**
   * Volume
   */
  volume: number
}

export interface VideoEndedEvent extends VideoEvent {

}

export type VideoErrorType = 'VIDEO_LOAD_ERROR' | 'VIDEO_ERROR'

export interface VideoErrorEvent extends VideoEvent {
  type: VideoErrorType;
  message?: string;
}

export interface AudioEvent extends OmakaseEvent {

  /**
   * Audio track. Type depends on VideoController implementation.
   */
  audioTrack: any
}

// endregion

// region subtitles

export interface SubtitlesEvent extends OmakaseEvent {

}

export interface SubtitlesLoadedEvent extends OmakaseEvent {

}

export interface SubtitlesCreateEvent extends OmakaseEvent {
  textTrack: OmakaseTextTrack<OmakaseTextTrackCue>
}

export interface SubtitlesChartEvent extends OmakaseEvent {
  cue?: OmakaseTextTrackCue;
}

// endregion

// region timeline

export interface TimelineEvent extends OmakaseEvent {

}

export interface TimelineReadyEvent extends TimelineEvent {

}

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

export interface ScrollbarEvent extends OmakaseEvent {

}

export interface ScrollbarScrollEvent extends ScrollbarEvent {
  scrollPercent: number;
}

export interface ScrollbarZoomEvent extends ScrollbarEvent {
  zoomPercent: number;
  zoomFocus: number;
}

// endregion

// region thumbnail

export interface ThumbnailEvent extends OmakaseEvent {
  thumbnail: Thumbnail
}

// endregion

// region marker

export interface MarkerEvent extends OmakaseEvent {

}

export interface MarkerChangeEvent extends MarkerEvent {

}

export interface MarkerFocusEvent extends MarkerEvent {
  marker: Marker;
}

export interface MomentMarkerChangeEvent extends MarkerChangeEvent {
  timeObservation: MomentObservation
}

export interface PeriodMarkerChangeEvent extends MarkerChangeEvent {
  timeObservation: PeriodObservation
}

// endregion

// region charts

export interface ChartEvent extends OmakaseEvent {

}

export interface ChartCueEvent extends ChartEvent {
  cue: OmakaseChartCue;
}

// endregion
