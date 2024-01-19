/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import {Api} from './api';
import {Observable} from 'rxjs';
import {AudioEvent, HelpMenuGroup, VideoBufferingEvent, VideoEndedEvent, VideoErrorEvent, VideoLoadedEvent, VideoPlayEvent, VideoSeekedEvent, VideoSeekingEvent, VideoTimeChangeEvent} from '../types';
import {Video} from '../video/video';
import Hls from 'hls.js';

export interface VideoApi extends Api {

  /***
   * Fires on video load
   */
  onVideoLoaded$: Observable<VideoLoadedEvent>;

  /***
   * Fires on video time change
   */
  onVideoTimeChange$: Observable<VideoTimeChangeEvent>;

  /***
   * Fires on video play
   */
  onPlay$: Observable<VideoPlayEvent>;

  /***
   * Fires on video pause
   */
  onPause$: Observable<VideoPlayEvent>;

  /***
   * Fires on video seeking
   */
  onSeeking$: Observable<VideoSeekingEvent>;

  /***
   * Fires on video seeked
   */
  onSeeked$: Observable<VideoSeekedEvent>;

  /***
   * Fires on video end
   */
  onEnded$: Observable<VideoEndedEvent>;

  /***
   *  Fires on audio track switched
   */
  onAudioSwitched$: Observable<AudioEvent>;

  /***
   *  Fires on if error occurs on video load
   */
  onVideoError$: Observable<VideoErrorEvent>;

  /***
   *  Fires on video buffering
   */
  onBuffering$: Observable<VideoBufferingEvent>;

  /***
   * Indicates if video is loaded or not
   */
  isVideoLoaded(): boolean;

  /***
   * Returns Video object that holds loaded video properties
   */
  getVideo(): Video;

  /***
   * Returns HTML <video> element reference
   */
  getHTMLVideoElement(): HTMLVideoElement;

  /***
   * Returns video duration. If duration is provided in omakasePlayer.loadVideo() method, method returns provided value. If duration is not provided in omakasePlayer.loadVideo() method, method returns HTML <video> element "duration" property
   */
  getDuration(): number;

  /***
   * Returns video current time in seconds
   */
  getCurrentTime(): number;

  /***
   * Returns video playback rate
   */
  getPlaybackRate(): number

  /***
   * Sets video playback rate
   * @param playbackRate Decimal value between [0.1, 16]. For example, if provided value is "2", video playback rate will be 2x of normal playback rate
   */
  setPlaybackRate(playbackRate: number);

  /***
   * Returns current volume level
   */
  getVolume(): number;

  /***
   * Sets volume level
   * @param volume Decimal value between [0, 1]
   */
  setVolume(volume: number);

  /***
   * Returns current frame number
   */
  getCurrentFrame(): number;

  /***
   * Returns video frame rate provided in omakasePlayer.loadVideo() method
   */
  getFrameRate(): number;

  /***
   * Returns total number of frames in video
   */
  getTotalFrames(): number;

  /***
   * Indicates if video is playing
   */
  isPlaying(): boolean;

  /***
   * Indicates if video is paused
   */
  isPaused(): boolean;

  /***
   * Indicates if video is seeking
   */
  isSeeking(): boolean;

  /***
   * Starts video playback
   */
  play(): void;

  /***
   * Pauses video playback
   */
  pause(): void

  /***
   * Toggles video play and pause
   */
  togglePlayPause(): void;

  /***
   * Seeks to particular video frame. Video must be in non-playing mode.
   * @param frame Video frame number
   */
  seekToFrame(frame: number): Observable<boolean>;

  /***
   * Seeks to video frame offsetted by provided framesCount. Video must be in non-playing mode.
   * @param framesCount Positive (seek forward) or negative (seek backward) integer
   */
  seekFromCurrentFrame(framesCount: number): Observable<boolean>;

  /***
   * Seeks to previous video frame
   */
  seekPreviousFrame(): Observable<boolean>;

  /***
   * Seeks to next video frame
   */
  seekNextFrame(): Observable<boolean>;

  /***
   * Seeks to video timestamp
   * @param time Video timestamp in seconds
   */
  seekToTimestamp(time: number): Observable<boolean>;

  /***
   * Seeks to video timestamp
   * @param timestamp Video timestamp in HH:MM:SS:FF format
   */
  seekToFormattedTimestamp(timestamp: string): Observable<boolean>;

  /***
   * Formats video timestamp to HH:MM:SS:FF
   * @param time Video timestamp in seconds
   */
  formatTimestamp(time: number): string

  /**
   * Converts timestamp in format HH:MM:SS:FF to frame
   * @param timestamp
   */
  convertTimestampToFrame(timestamp: string): number

  /***
   * Returns video frame number
   * @param time Video timestamp in seconds
   */
  calculateTimeToFrame(time: number): number

  /***
   * Returns video timestamp in seconds
   * @param frameNumber Video frame number
   */
  calculateFrameToTime(frameNumber: number): number

  /***
   * Video mute
   */
  mute();

  /***
   * Video unmute
   */
  unmute();

  /***
   * Indicates if video is in fullscreen mode
   */
  isFullscreen(): boolean;

  /***
   * Toggles video fullscreen mode
   */
  toggleFullscreen();

  /***
   * Returns available audio tracks
   */
  getAudioTracks(): any[];

  /***
   * Returns current active audio tracks
   */
  getCurrentAudioTrack(): any;

  /***
   * Sets active audio track
   * @param audioTrackId Audio track ID
   */
  setAudioTrack(audioTrackId: number);

  /***
   * Returns Hls (hls.js) instance
   */
  getHls(): Hls;

  /***
   * Adds new HelpMenuGroup to video context menu
   * @param helpMenuGroup
   */
  addHelpMenuGroup(helpMenuGroup: HelpMenuGroup);

  /***
   * Returns available HelpMenuGroup's
   */
  getHelpMenuGroups(): HelpMenuGroup[];

  /**
   * Adds safe zone area. Returns DOM <div> id.
   * @param options
   */
  addSafeZone(options: {
    topPercent: number,
    bottomPercent: number,
    leftPercent: number,
    rightPercent: number,
    htmlClass?: string
  }): string;

  /**
   * Adds safe zone calculated from provided aspect ratio expression
   * @param options
   */
  addSafeZoneWithAspectRatio(options: {
    aspectRatioText: string,
    scalePercent?: number,
    htmlClass?: string
  }): string;

  /**
   * Removes safe zone area by DOM <div> id
   *
   * @param id
   */
  removeSafeZone(id: string);

  /**
   * Clears all added safe zones
   */
  clearSafeZones();

}
