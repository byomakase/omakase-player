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
import {BehaviorSubject, Observable} from 'rxjs';
import {AudioEvent, HelpMenuGroup, VideoBufferingEvent, VideoEndedEvent, VideoErrorEvent, VideoLoadedEvent, VideoLoadingEvent, VideoPlayEvent, VideoSeekedEvent, VideoSeekingEvent, VideoTimeChangeEvent, VideoVolumeEvent} from '../types';
import Hls from 'hls.js';
import {Video} from '../video';

export interface VideoApi extends Api {

  /**
   * Fires on video load start.
   * @readonly
   */
  onVideoLoading$: Observable<VideoLoadingEvent>;

  /**
   * Fires on video load. Initial value is undefined.
   * @readonly
   */
  onVideoLoaded$: BehaviorSubject<VideoLoadedEvent | undefined>;

  /**
   * Fires on video time change
   * @readonly
   */
  onVideoTimeChange$: Observable<VideoTimeChangeEvent>;

  /**
   * Fires on video play
   * @readonly
   */
  onPlay$: Observable<VideoPlayEvent>;

  /**
   * Fires on video pause
   * @readonly
   */
  onPause$: Observable<VideoPlayEvent>;

  /**
   * Fires on video seeking
   * @readonly
   */
  onSeeking$: Observable<VideoSeekingEvent>;

  /**
   * Fires on video seeked
   * @readonly
   */
  onSeeked$: Observable<VideoSeekedEvent>;

  /**
   * Fires on video end
   * @readonly
   */
  onEnded$: Observable<VideoEndedEvent>;

  /**
   *  Fires on audio track switched
   *  @readonly
   */
  onAudioSwitched$: Observable<AudioEvent>;

  /**
   *  Fires on if error occurs on video load
   *  @readonly
   */
  onVideoError$: Observable<VideoErrorEvent>;

  /**
   *  Fires on video buffering
   *  @readonly
   */
  onBuffering$: Observable<VideoBufferingEvent>;

  /**
   *  Fires on volume change
   *  @readonly
   */
  onVolumeChange$: Observable<VideoVolumeEvent>;

  /**
   * Indicates if video is loaded or not
   */
  isVideoLoaded(): boolean;

  /**
   * @returns Video object that holds loaded video properties
   */
  getVideo(): Video | undefined;

  /**
   * @returns HTML <video> element reference
   */
  getHTMLVideoElement(): HTMLVideoElement;

  /**
   * @returns video duration. If duration is provided in omakasePlayer.loadVideo() method, method returns provided value. If duration is not provided in omakasePlayer.loadVideo() method, method returns HTML <video> element "duration" property
   */
  getDuration(): number;

  /**
   * @returns video current time in seconds
   */
  getCurrentTime(): number;

  /**
   * @returns video current timecode
   */
  getCurrentTimecode(): string;

  /**
   * @returns video playback rate
   */
  getPlaybackRate(): number

  /**
   * Sets video playback rate
   * @param playbackRate Decimal value between [0.1, 16]. For example, if provided value is "2", video playback rate will be 2x of normal playback rate
   */
  setPlaybackRate(playbackRate: number): void;

  /**
   * @returns current volume level
   */
  getVolume(): number;

  /**
   * Sets volume level
   * @param volume Decimal value between [0, 1]
   */
  setVolume(volume: number): void;

  /**
   * @returns current frame number
   */
  getCurrentFrame(): number;

  /**
   * @returns video frame rate provided in omakasePlayer.loadVideo() method
   */
  getFrameRate(): number;

  /**
   * @returns total number of frames in video
   */
  getTotalFrames(): number;

  /**
   * Indicates if video is playing
   */
  isPlaying(): boolean;

  /**
   * Indicates if video is paused
   */
  isPaused(): boolean;

  /**
   * Indicates if video is seeking
   */
  isSeeking(): boolean;

  /**
   * Starts video playback
   */
  play(): void;

  /**
   * Pauses video playback
   */
  pause(): void

  /**
   * Toggles video play and pause
   */
  togglePlayPause(): void;

  /**
   * Seeks to particular video frame. Video must be in non-playing mode.
   * @param frame Video frame number
   */
  seekToFrame(frame: number): Observable<boolean>;

  /**
   * Seeks to video frame offsetted by provided framesCount. Video must be in non-playing mode.
   * @param framesCount Positive (seek forward) or negative (seek backward) integer
   */
  seekFromCurrentFrame(framesCount: number): Observable<boolean>;

  /**
   * Seeks to video time offsetted by provided timeAmount. Video must be in non-playing mode.
   * @param timeAmount Positive (seek forward) or negative (seek backward) integer
   */
  seekFromCurrentTime(timeAmount: number): Observable<boolean>;

  /**
   * Seeks to previous video frame
   */
  seekPreviousFrame(): Observable<boolean>;

  /**
   * Seeks to next video frame
   */
  seekNextFrame(): Observable<boolean>;

  /**
   * Seeks to video timestamp
   * @param time Video timestamp in seconds
   */
  seekToTime(time: number): Observable<boolean>;

  /**
   * Seeks to video timestamp
   * @param timecode Video timestamp in HH:MM:SS:FF format
   */
  seekToTimecode(timecode: string): Observable<boolean>;

  /**
   * Seeks to timeline location
   *
   * @param percent
   */
  seekToPercent(percent: number): Observable<boolean>

  /**
   * Formats video timestamp to HH:MM:SS:FF
   * @param time Video media time in seconds
   */
  formatToTimecode(time: number): string

  /**
   * Converts timestamp in format HH:MM:SS:FF to frame
   * @param timecode
   */
  parseTimecodeToFrame(timecode: string): number

  /**
   * Converts timestamp in format HH:MM:SS:FF to time in seconds
   * @param timecode
   */
  parseTimecodeToTime(timecode: string): number

  /**
   * @returns video frame number
   * @param time Video timestamp in seconds
   */
  calculateTimeToFrame(time: number): number

  /**
   * @returns video timestamp in seconds
   * @param frameNumber Video frame number
   */
  calculateFrameToTime(frameNumber: number): number

  /**
   * Video mute
   */
  mute(): void;

  /**
   * Video unmute
   */
  unmute(): void;

  /**
   * @returns is video muted
   */
  isMuted(): boolean;

  /**
   * Toggles mute / unmute
   */
  toggleMuteUnmute(): void;

  /**
   * Indicates if video is in fullscreen mode
   */
  isFullscreen(): boolean;

  /**
   * Toggles video fullscreen mode
   */
  toggleFullscreen(): void;

  /**
   * @returns available audio tracks. Type depends on VideoController implementation.
   */
  getAudioTracks(): any[];

  /**
   * @returns current active audio tracks. Type depends on VideoController implementation.
   */
  getCurrentAudioTrack(): any;

  /**
   * Sets active audio track
   * @param audioTrackId Audio track ID
   */
  setAudioTrack(audioTrackId: number): void;

  /**
   * @returns Hls (hls.js) instance if video is loaded, otherwise undefined
   */
  getHls(): Hls | undefined;

  /**
   * Appends new HelpMenuGroup to video context menu
   * @param helpMenuGroup
   */
  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup): void;

  /**
   * Appends new HelpMenuGroup to video context menu
   * @param helpMenuGroup
   */
  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup): void;

  /**
   * @returns available HelpMenuGroup's
   */
  getHelpMenuGroups(): HelpMenuGroup[];

  /**
   * Adds safe zone area. @returns DOM <div> id.
   * @param options
   */
  addSafeZone(options: {
    topRightBottomLeftPercent: number[],
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
  removeSafeZone(id: string): void;

  /**
   * Clears all added safe zones
   */
  clearSafeZones(): void;

}
