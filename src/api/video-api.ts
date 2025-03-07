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
import {Observable} from 'rxjs';
import {
  HelpMenuGroup,
  OmpAudioTrack,
  OmpNamedEvent,
  OmpNamedEventEventName,
  VideoBufferingEvent,
  VideoEndedEvent,
  VideoErrorEvent,
  VideoFullscreenChangeEvent,
  VideoLoadedEvent,
  VideoLoadingEvent,
  VideoPlaybackRateEvent,
  VideoPlayEvent,
  VideoSafeZoneChangeEvent,
  VideoSeekedEvent,
  VideoSeekingEvent,
  VideoTimeChangeEvent,
  VideoVolumeEvent,
  VideoWindowPlaybackStateChangeEvent,
} from '../types';
import Hls from 'hls.js';
import {Video, VideoLoadOptions} from '../video';
import {VideoSafeZone, VideoWindowPlaybackState} from '../video/model';

export interface VideoApi extends Api {
  /**
   * Fires on video load start.
   * @readonly
   */
  onVideoLoading$: Observable<VideoLoadingEvent>;

  /**
   * Fires on video load. Initial value is undefined.
   * Always emits the current value on subscription.
   * @readonly
   */
  onVideoLoaded$: Observable<VideoLoadedEvent | undefined>;

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
   * Fires on playback rate change
   *  @readonly
   */
  onPlaybackRateChange$: Observable<VideoPlaybackRateEvent>;

  /**
   * Fires on fullscreen change
   *  @readonly
   */
  onFullscreenChange$: Observable<VideoFullscreenChangeEvent>;

  /**
   * Fires on video safe zone change
   *  @readonly
   */
  onVideoSafeZoneChange$: Observable<VideoSafeZoneChangeEvent>;

  /**
   * Fires on video window playback state change
   * @readonly
   */
  onVideoWindowPlaybackStateChange$: Observable<VideoWindowPlaybackStateChangeEvent>;

  /**
   * Fires on event which has active stream (see {@link updateActiveNamedEventStreams}
   */
  onNamedEvent$: Observable<OmpNamedEvent>;

  /**
   * Loads new video
   *
   * @param sourceUrl Video manifest URL
   * @param frameRate Video frame rate
   */
  loadVideo(sourceUrl: string, frameRate: number | string): Observable<Video>;

  /**
   * Loads new video
   *
   * @param sourceUrl Video manifest URL
   * @param frameRate Video frame rate
   * @param options
   */
  loadVideo(sourceUrl: string, frameRate: number | string, options?: VideoLoadOptions): Observable<Video>;

  /**
   * Reloads video
   */
  reloadVideo(): Observable<Video>;

  /**
   * Indicates if video is loaded or not
   */
  isVideoLoaded(): boolean;

  /**
   * @returns Video object that holds loaded video properties
   */
  getVideo(): Video | undefined;

  /**
   * @returns VideoLoadOptions object used in {@link loadVideo}  method
   */
  getVideoLoadOptions(): VideoLoadOptions | undefined;

  /**
   * @returns HTML <video> element reference
   */
  getHTMLVideoElement(): HTMLVideoElement;

  /**
   * @returns video duration. If duration is provided in {@link loadVideo} method, method returns provided value. If duration is not provided in {@link loadVideo} method, method returns HTML <video> element "duration" property
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
  getPlaybackRate(): number;

  /**
   * Sets video playback rate
   * @param playbackRate Decimal value between [0.1, 16]. For example, if provided value is "2", video playback rate will be 2x of normal playback rate
   */
  setPlaybackRate(playbackRate: number): Observable<void>;

  /**
   * @returns current volume level
   */
  getVolume(): number;

  /**
   * Sets volume level
   * @param volume Decimal value between [0, 1]
   */
  setVolume(volume: number): Observable<void>;

  /**
   * @returns current frame number
   */
  getCurrentFrame(): number;

  /**
   * @returns video frame rate provided in {@link loadVideo} method
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
   * @returns Observable<void> when play started
   */
  play(): Observable<void>;

  /**
   * Pauses video playback
   */
  pause(): Observable<void>;

  /**
   * Toggles video play and pause
   */
  togglePlayPause(): Observable<void>;

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
  seekToPercent(percent: number): Observable<boolean>;

  /**
   * Seeks to end of video
   */
  seekToEnd(): Observable<boolean>;

  /**
   * Formats video timestamp to HH:MM:SS:FF
   * @param time Video media time in seconds
   */
  formatToTimecode(time: number): string;

  /**
   * Converts timestamp in format HH:MM:SS:FF to frame
   * @param timecode
   */
  parseTimecodeToFrame(timecode: string): number;

  /**
   * Converts timestamp in format HH:MM:SS:FF to time in seconds
   * @param timecode
   */
  parseTimecodeToTime(timecode: string): number;

  /**
   * @returns video frame number
   * @param time Video timestamp in seconds
   */
  calculateTimeToFrame(time: number): number;

  /**
   * @returns video timestamp in seconds
   * @param frameNumber Video frame number
   */
  calculateFrameToTime(frameNumber: number): number;

  /**
   * Video mute
   */
  mute(): Observable<void>;

  /**
   * Video unmute
   */
  unmute(): Observable<void>;

  /**
   * @returns is video muted
   */
  isMuted(): boolean;

  /**
   * Toggles mute / unmute
   */
  toggleMuteUnmute(): Observable<void>;

  /**
   * Indicates if video is in fullscreen mode
   */
  isFullscreen(): boolean;

  /**
   * Toggles video fullscreen mode
   */
  toggleFullscreen(): Observable<void>;

  /**
   * @returns available audio tracks
   */
  getAudioTracks(): OmpAudioTrack[];

  /**
   * @returns current active audio track
   */
  getActiveAudioTrack(): OmpAudioTrack | undefined;

  /**
   * Sets active audio track
   * @param id {@link OmpAudioTrack} id
   */
  setActiveAudioTrack(id: string): Observable<void>;

  /**
   * Appends new HelpMenuGroup to video context menu
   * @param helpMenuGroup
   */
  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void>;

  /**
   * Appends new HelpMenuGroup to video context menu
   * @param helpMenuGroup
   */
  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void>;

  /**
   * Removes help menu groups
   */
  clearHelpMenuGroups(): Observable<void>;

  /**
   * @returns available HelpMenuGroup's
   */
  getHelpMenuGroups(): HelpMenuGroup[];

  /**
   * Adds safe zone area.
   * @returns safe zone id.
   * @param videoSafeZone
   */
  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone>;

  /**
   * Removes safe zone area
   *
   * @param id
   */
  removeSafeZone(id: string): Observable<void>;

  /**
   * Clears all added safe zones
   */
  clearSafeZones(): Observable<void>;

  /**
   * @returns video safe zones
   */
  getSafeZones(): VideoSafeZone[];

  /**
   * @returns {@link VideoWindowPlaybackState}
   */
  getVideoWindowPlaybackState(): VideoWindowPlaybackState;

  /**
   * @returns true if player is detachable
   */
  isDetachable(): boolean;

  /**
   * @returns true if video can be detached, false if not
   */
  canDetach(): boolean;

  /**
   * @returns true if video can  be attached, false if not
   */
  canAttach(): boolean;

  /**
   * Detaches video to new window
   */
  detachVideoWindow(): Observable<void>;

  /**
   * Attaches back video from detached window
   */
  attachVideoWindow(): Observable<void>;

  /**
   * Enables picture in picture mode
   */
  enablePiP(): Observable<void>;

  /**
   * Disables picture in picture mode
   */
  disablePiP(): Observable<void>;

  /**
   * @returns Hls (hls.js) instance if video is loaded, otherwise undefined
   */
  getHls(): Hls | undefined;

  /**
   * Opens event stream for each provided event name in {@link eventNames} subscribable in {@link onNamedEvent$}. Deactivates all other event streams.
   * @param eventNames Event name
   */
  updateActiveNamedEventStreams(eventNames: OmpNamedEventEventName[]): Observable<void>;

  /**
   * @returns Event names for events streamed through {@link onNamedEvent$}
   */
  getActiveNamedEventStreams(): OmpNamedEventEventName[];

  /**
   * Loads black MP4 video
   */
  loadBlackVideo(): Observable<Video>;
}
