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

export enum PlayerChromingTheme {
  Default = 'DEFAULT',
  Stamp = 'STAMP',
  Chromeless = 'CHROMELESS',
  Custom = 'CUSTOM',
  Audio = 'AUDIO',
  Editorial = 'EDITORIAL',
}

export enum ControlBarVisibility {
  Enabled = 'ENABLED',
  Disabled = 'DISABLED',
  FullscreenOnly = 'FULLSCREEN_ONLY',
}

export enum DefaultThemeControl {
  Play = 'PLAY',
  FrameForward = 'FRAME_FORWARD',
  TenFramesForward = 'TEN_FRAMES_FORWARD',
  FrameBackward = 'FRAME_BACKWARD',
  TenFramesBackward = 'TEN_FRAMES_BACKWARD',
  Bitc = 'BITC',
  Fullscreen = 'FULLSCREEN',
  Captions = 'CAPTIONS',
  Volume = 'VOLUME',
  Scrubber = 'SCRUBBER',
  Trackselector = 'TRACKSELECTOR',
  PlaybackRate = 'PLAYBACK_RATE',
  Detach = 'DETACH',
}

export enum AudioThemeControl {
  Play = 'PLAY',
  Volume = 'VOLUME',
  PlaybackRate = 'PLAYBACK_RATE',
  Trackselector = 'TRACKSELECTOR',
  Scrubber = 'SCRUBBER',
  Bitc = 'BITC',
}

export enum DefaultThemeFloatingControl {
  Trackselector = 'TRACKSELECTOR',
  HelpMenu = 'HELP_MENU',
  PlaybackControls = 'PLAYBACK_CONTROLS',
}

export enum StampThemeFloatingControl {
  ProgressBar = 'PROGRESS_BAR',
  AudioToggle = 'AUDIO_TOGGLE',
  Time = 'TIME',
  PlaybackControls = 'PLAYBACK_CONTROLS',
  Fullscreen = 'FULLSCREEN',
}

export enum AudioThemeFloatingControl {
  PlaybackControls = 'PLAYBACK_CONTROLS',
  HelpMenu = 'HELP_MENU',
}

export enum EditorialThemeFloatingControl {
  ProgressBar = 'PROGRESS_BAR',
  Time = 'TIME',
  PlaybackControls = 'PLAYBACK_CONTROLS',
  HelpMenu = 'HELP_MENU',
  AudioToggle = 'AUDIO_TOGGLE',
  Fullscreen = 'FULLSCREEN',
}

export enum StampThemeScale {
  Fill = 'FILL',
  Fit = 'FIT',
}

export enum StampTimeFormat {
  Timecode = 'TIMECODE',
  CountdownTimer = 'COUNTDOWN_TIMER',
  MediaTime = 'MEDIA_TIME',
}

export enum EditorialTimeFormat {
  Timecode = 'TIMECODE',
  MediaTime = 'MEDIA_TIME',
}

export enum WatermarkVisibility {
  AlwaysOn = 'ALWAYS_ON',
  AutoHide = 'AUTO_HIDE',
}

export enum AudioPlayerSize {
  Full = 'FULL',
  Compact = 'COMPACT',
}

export enum FullscreenChroming {
  Enabled = 'ENABLED',
  Disabled = 'DISABLED',
}

export enum EditorialControlBarPosition {
  OverVideo = 'OVER_VIDEO',
  UnderVideo = 'UNDER_VIDEO',
}

export enum AudioVisualization {
  Disabled = 'DISABLED',
  Enabled = 'ENABLED',
}

interface BasePlayerChroming<T extends PlayerChromingTheme> {
  /**
   * Chroming theme determines how the player will be chromed.
   */
  readonly theme: T;

  /**
   * URL for the thumbnails (used for preview in media chrome time range)
   */
  thumbnailUrl?: string;

  /**
   * Function that allows custom handler for getting a thumbnail for given time
   * @param time time in seconds
   * @returns thumbnail url
   */
  thumbnailSelectionFn?: (time: number) => string;

  /**
   * Watermark text or svg
   */
  watermark?: string;

  /**
   * Specifies if watermark is shown when the video is playing
   */
  watermarkVisibility?: WatermarkVisibility;

  /**
   * Specifies if chroming is enabled in fullscreen
   */
  fullscreenChroming?: FullscreenChroming;

  /**
   * CSS file url(s) for player chroming styling
   */
  styleUrl?: string | string[];
}

export interface DefaultThemeConfig {
  /**
   * Specifies controls visibility
   */
  controlBarVisibility: ControlBarVisibility;

  /**
   * Specifies list of enabled controls in control bar
   */
  controlBar: DefaultThemeControl[];

  /**
   * Specifies list of enabled floating controls
   */
  floatingControls: DefaultThemeFloatingControl[];

  /**
   * Sets the available playback rates in menu
   */
  playbackRates: number[];

  /**
   * If false, track selection menu will keep open until explicitly closed.
   * If true it will close on track selection or when clicking outside of the menu
   */
  trackSelectorAutoClose: boolean;

  /**
   * Id of the custom web component used for Player chroming
   */
  htmlTemplateId?: string;
}

export interface CustomThemeConfig {
  /**
   * Id of the custom web component used for Player chroming
   */
  htmlTemplateId: string;
}

export interface DefaultChroming extends BasePlayerChroming<PlayerChromingTheme.Default> {
  themeConfig?: Partial<DefaultThemeConfig>;
}

export interface CustomChroming extends BasePlayerChroming<PlayerChromingTheme.Custom> {
  themeConfig?: Partial<CustomThemeConfig>;
}

export interface StampThemeConfig {
  /**
   * Specifies list of enabled floating controls
   */
  floatingControls: StampThemeFloatingControl[];

  /**
   * Specifies list of floating controls that are shown when the video is playing
   */
  alwaysOnFloatingControls: StampThemeFloatingControl[];

  /**
   * Specifies how the video will fill the container
   */
  stampScale: StampThemeScale;

  /**
   * Specifies which time format will be used in the timer control
   */
  timeFormat: StampTimeFormat;

  /**
   * Id of the custom web component used for Player chroming
   */
  htmlTemplateId?: string;
}

export interface AudioVisualizationConfig {
  /**
   * Hex value for the stroke color
   */
  strokeColor: string;

  /**
   * Hex values for the fill gradient colors
   */
  fillColors: string[];
}

export interface AudioThemeConfig {
  /**
   * Specifies controls visibility
   */
  controlBarVisibility: Omit<ControlBarVisibility, ControlBarVisibility.FullscreenOnly>;

  /**
   * Specifies list of enabled controls in control bar
   */
  controlBar: AudioThemeControl[];

  /**
   * Specifies list of enabled floating controls
   */
  floatingControls: AudioThemeFloatingControl[];

  /**
   * Sets the available playback rates in menu
   */
  playbackRates: number[];

  /**
   * Specifies the audio player size
   */
  playerSize: AudioPlayerSize;

  /**
   * Enables/disables the audio visualization
   */
  visualization: AudioVisualization;

  /**
   * Configures the audio visualization
   */
  visualizationConfig: AudioVisualizationConfig;

  /**
   * Id of the custom web component used for Player chroming
   */
  htmlTemplateId?: string;
}

export interface EditorialThemeConfig {
  /**
   * Specifies list of enabled floating controls
   */
  floatingControls: EditorialThemeFloatingControl[];

  /**
   * Specifies list of floating controls that are shown when the video is playing
   */
  alwaysOnFloatingControls: EditorialThemeFloatingControl[];
  /**
   * Specifies which time format will be used in the timer control
   */
  timeFormat: EditorialTimeFormat;

  /**
   * Specifies control bar position
   */
  controlBarPosition: EditorialControlBarPosition;

  /**
   * Id of the custom web component used for Player chroming
   */
  htmlTemplateId?: string;
}

export interface StampChroming extends BasePlayerChroming<PlayerChromingTheme.Stamp> {
  themeConfig?: Partial<StampThemeConfig>;
}

export interface AudioChroming extends BasePlayerChroming<PlayerChromingTheme.Audio> {
  themeConfig?: Partial<AudioThemeConfig>;
}

export interface EditorialChroming extends BasePlayerChroming<PlayerChromingTheme.Editorial> {
  themeConfig?: Partial<EditorialThemeConfig>;
}

export interface ChromelessChroming extends BasePlayerChroming<PlayerChromingTheme.Chromeless> {}

export type PlayerChroming = DefaultChroming | StampChroming | CustomChroming | ChromelessChroming | AudioChroming | EditorialChroming;

export const DEFAULT_PLAYER_CHROMING_CONFIG: DefaultThemeConfig = {
  controlBarVisibility: ControlBarVisibility.Enabled,
  controlBar: [
    DefaultThemeControl.Play,
    DefaultThemeControl.FrameForward,
    DefaultThemeControl.TenFramesForward,
    DefaultThemeControl.FrameBackward,
    DefaultThemeControl.TenFramesBackward,
    DefaultThemeControl.Bitc,
    DefaultThemeControl.Detach,
    DefaultThemeControl.Fullscreen,
    DefaultThemeControl.Captions,
    DefaultThemeControl.Volume,
    DefaultThemeControl.Scrubber,
    DefaultThemeControl.Fullscreen,
    DefaultThemeControl.Trackselector,
    DefaultThemeControl.PlaybackRate,
  ],
  floatingControls: [DefaultThemeFloatingControl.HelpMenu, DefaultThemeFloatingControl.PlaybackControls],
  playbackRates: [0.25, 0.5, 0.75, 1, 2, 4, 8],
  trackSelectorAutoClose: true,
};

export const DEFAULT_STAMP_PLAYER_CHROMING_CONFIG: StampThemeConfig = {
  stampScale: StampThemeScale.Fit,
  timeFormat: StampTimeFormat.MediaTime,
  floatingControls: [StampThemeFloatingControl.ProgressBar, StampThemeFloatingControl.AudioToggle, StampThemeFloatingControl.Time, StampThemeFloatingControl.PlaybackControls],
  alwaysOnFloatingControls: [StampThemeFloatingControl.ProgressBar, StampThemeFloatingControl.AudioToggle, StampThemeFloatingControl.Time],
};

export const DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG: AudioThemeConfig = {
  controlBarVisibility: ControlBarVisibility.Enabled,
  controlBar: [AudioThemeControl.Play, AudioThemeControl.Volume, AudioThemeControl.PlaybackRate, AudioThemeControl.Trackselector, AudioThemeControl.Scrubber, AudioThemeControl.Bitc],
  floatingControls: [AudioThemeFloatingControl.PlaybackControls, AudioThemeFloatingControl.HelpMenu],
  playbackRates: [0.5, 0.75, 1, 2],
  playerSize: AudioPlayerSize.Full,
  visualization: AudioVisualization.Disabled,
  visualizationConfig: {
    strokeColor: '#9968BF',
    fillColors: ['#F79433', '#88B840', '#CC6984', '#662D91'],
  },
};

export const DEFAULT_EDITORIAL_PLAYER_CHROMING_CONFIG: EditorialThemeConfig = {
  timeFormat: EditorialTimeFormat.Timecode,
  controlBarPosition: EditorialControlBarPosition.OverVideo,
  floatingControls: [
    EditorialThemeFloatingControl.PlaybackControls,
    EditorialThemeFloatingControl.ProgressBar,
    EditorialThemeFloatingControl.Time,
    EditorialThemeFloatingControl.HelpMenu,
    EditorialThemeFloatingControl.Fullscreen,
    EditorialThemeFloatingControl.AudioToggle,
  ],
  alwaysOnFloatingControls: [EditorialThemeFloatingControl.Time, EditorialThemeFloatingControl.ProgressBar],
};

export const DEFAULT_PLAYER_CHROMING: DefaultChroming = {
  theme: PlayerChromingTheme.Default,
  fullscreenChroming: FullscreenChroming.Enabled,
  themeConfig: DEFAULT_PLAYER_CHROMING_CONFIG,
};
