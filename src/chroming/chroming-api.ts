/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
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

import {MediaTemporalFormat} from '../common';
import type {MarkerTrack, ThumbnailTrack, Track} from '../media';
import {TrackType} from '../media';
import type {BehaviorSubject, Observable} from 'rxjs';
import type {ChromingState} from './chroming-state';
import type {ChromingEvent} from './chroming-event';
import type {Destroyable} from '../common/capabilities';
import type {ChromingSession} from '../session';
import {type PlayerInternalApi} from '../player';
import {type ChromingDomConfig, ChromingDomController} from './chroming-dom';
import type {Source} from '../source';
import type {ChromingMarkerBarConfig, ChromingMarkerBarHandlerApi, ChromingMarkerBarState} from './chroming-marker-bar';
import type {TrackLoadOptions} from '../track';
import type {OmakaseDropdownListType} from './components/omakase-dropdown-list';
import {DEFAULT_VU_METER_CONFIG, DEFAULT_VU_METER_STYLE, VuMeterScale, VuMeterTheme, type VuMeterConfig, type VuMeterStyle} from '../vu-meter';

type ChromingConfigLocalAndDetached = Omit<CommonChromingConfig, 'playerWindowPlaybackMode' | 'findThumbnailFn'>;

export interface ChromingConfig extends ChromingConfigLocalAndDetached {}

export interface ChromingInternalConfig extends CommonChromingConfig {}

export interface ChromingLocalConfig extends ChromingConfigLocalAndDetached {}

export interface ChromingDetachedConfig extends ChromingConfigLocalAndDetached {}

interface CommonChromingConfig extends ChromingDomConfig<ChromingThemeTypes> {}

/**
 * Public API for chroming the player
 * @document ../../docs/static/chroming/README.md
 */
export interface ChromingApi extends ChromingCommonApi {
  /**
   * Gets the HTML element from the player chroming DOM
   * @param querySelector HTML query selector
   */
  getPlayerChromingElement<T>(querySelector: string): T;

  /**
   * Add a marker bar to the player. Marker bar will be displayed in the marker bar area above the progress bar.
   * @param url URL of the marker bar to load
   * @param source Source of the marker bar to load
   * @param destination The destination where the marker bar should be added (marker bar area or progress bar)
   * @param options Track load options
   * @param config Marker bar configuration such as marker presentation function and initial visibility
   */
  addMarkerBar(url: string, destination: ChromingTrackDestination, options?: TrackLoadOptions, config?: Partial<ChromingMarkerBarConfig>): Observable<ChromingMarkerBarHandlerApi>;
  addMarkerBar(source: Source, destination: ChromingTrackDestination, options?: TrackLoadOptions, config?: Partial<ChromingMarkerBarConfig>): Observable<ChromingMarkerBarHandlerApi>;

  /**
   * Set a thumbnail track for the player. Thumbnail track will be used to display preview thumbnails when hovering over the progress bar.
   * @param url URL of the thumbnail track to load
   * @param source Source of the thumbnail track to load
   * @param options Track load options
   */
  setThumbnailTrack(url: string, options?: TrackLoadOptions): Observable<void>;
  setThumbnailTrack(source: Source, options?: TrackLoadOptions): Observable<void>;
  setThumbnailTrack(empty: undefined): Observable<void>;

  /**
   * Get current chroming VU meter configuration
   * @param position VU meter position in chroming
   */
  getVuMeterConfig(position?: ChromingVuMeterPosition): ChromingVuMeterConfig;
}

export interface ChromingLocalApi extends ChromingInternalApi, Destroyable {
  prepareDomForAttaching(): void;
  prepareDomForDetaching(): void;

  getPlayerChromingElement<T>(querySelector: string): T;

  loadTrack(trackType: TrackType.MARKER_TRACK, urlOrSource: string | Source, options?: TrackLoadOptions): Observable<MarkerTrack>;
  loadTrack(trackType: TrackType.THUMBNAIL_TRACK, urlOrSource: string | Source, options?: TrackLoadOptions): Observable<ThumbnailTrack>;
}

export interface ChromingDetachedApi extends ChromingInternalApi, Destroyable {}

export interface ChromingInternalApi extends ChromingCommonApi {
  domController: ChromingDomController<ChromingThemeTypes>;

  setPlayerInternal(playerInternal: PlayerInternalApi): void;

  addMarkerBar(id: Track['id'], destination: ChromingTrackDestination, config?: Partial<ChromingMarkerBarConfig>): Observable<ChromingMarkerBarState['id']>;
  setThumbnailTrack(id: Track['id'] | undefined): Observable<void>;
}

export interface ChromingCommonApi {
  /**
   * Observable that emits chroming events such as theme change, safe zones change, help menu change, marker track change, thumbnail track change and theme config change.
   */
  onEvent$: Observable<ChromingEvent>;

  /**
   * Current help menu groups configured in the player chroming.
   */
  helpMenuGroups: HelpMenuGroup[];

  /**
   * Current video safe zones configured in the player chroming.
   */
  videoSafeZones: VideoSafeZone[];

  /**
   * Whether the floating time display is visible in the player chroming.
   */
  isFloatingTimeVisible: boolean | undefined;

  /**
   * Current time format used in the player chroming.
   */
  timeFormat: ChromingTimeFormat | undefined;

  /**
   * Current chroming state of the player. Should not be edited externally.
   */
  state: ChromingState;

  /**
   * Current chroming session of the player. Should not be edited externally.
   */
  chromingSession: ChromingSession;

  /**
   * Adds a video safe zone to the player chroming.
   * @param videoSafeZone
   */
  addSafeZone(videoSafeZone: Partial<VideoSafeZone>): Observable<VideoSafeZone>;

  /**
   * Removes a video safe zone from the player chroming.
   * @param id Video safe zone id
   */
  removeSafeZone(id: string): Observable<void>;

  /**
   * Removes all video safe zones from the player chroming.
   */
  removeAllSafeZones(): Observable<void>;

  /**
   * Adds a help menu group to the player chroming.
   * @param helpMenuGroup Help menu group to add
   * @param insertPosition Position where the help menu group should be added in the help menu (append or prepend)
   */
  addHelpMenuGroup(helpMenuGroup: HelpMenuGroup, insertPosition: HelpMenuGroupInsertPosition): Observable<HelpMenuGroup>;

  /**
   * Removes all help menu groups from the player chroming.
   */
  clearHelpMenuGroups(): Observable<void>;

  /**
   * Shows or hides the floating time display in the player chroming.
   */
  setFloatingTimeVisible(visible: boolean): Observable<void>;

  /**
   * Changes the time format used in the player chroming.
   * @param timeFormat Time format to set (media time, countdown media time or timecode)
   */
  setTimeFormat(timeFormat: ChromingTimeFormat): Observable<void>;

  /**
   * Changes the theme configuration of the player chroming. Theme configuration includes settings such as control visibility, floating control configuration and action icon configuration for each theme.
   */
  setThemeConfig(themeConfig: Partial<ChromingThemeConfigTypes>): Observable<void>;

  /**
   * Updates the VU meter configuration in the player chroming
   * @param config New VU meter configuration, only attributes to update need to be sent
   * @param position Position of the VU meter to affect, if not sent all VU meters in chroming will be affected
   */
  setVuMeterConfig(config: Partial<ChromingVuMeterConfig>, position?: ChromingVuMeterPosition): Observable<void>;

  /**
   * Shows or hides the floating VU meter in the player chroming.
   */
  setFloatingVuMeterVisible(visible: boolean): Observable<void>;

  /**
   * Sets the watermark text in the player chroming. Sending undefined will remove the watermark.
   */
  setWatermark(watermark: string | undefined): Observable<void>;

  /**
   * Returns an object containing the progress bar marker bar and a list of marker bar handlers from the marker bar area in chroming
   */
  getMarkerBars(): ChromingMarkerBarHandlers;

  /**
   * Gets a marker bar handler by the marker bar id. Marker bar handler can be used to update the marker bar presentation and visibility and to add or remove marker tracks from the marker bar.
   * @param id Send id to get the marker bar from the marker bars area or progress bar
   */
  getMarkerBar(id: string): ChromingMarkerBarHandlerApi | undefined;

  /**
   * Removes a marker bar from chroming.
   * @param id Send id to remove the marker bar from the marker bars area or progress bar
   */
  deleteMarkerBar(id: string): Observable<void>;

  /**
   * Internal method. Restores the chroming state from the session.
   * @param chromingSession Chroming session to restore
   */
  restoreChromingSession(chromingSession: ChromingSession): Observable<void>;

  /**
   * Enters or exits fullscreen mode.
   */
  toggleFullScreen(): Observable<void>;
}

export type VideoSafeZoneCreate = Partial<VideoSafeZone> & Pick<VideoSafeZone, 'topRightBottomLeftPercent'>;

/**
 * Video safe zone determines the area of the video that is considered "safe" for displaying important content.
 */
export interface VideoSafeZone {
  /**
   * Video safe zone id. Should be unique for each safe zone.
   */
  id: string;

  /**
   * Percentages from the top, right, bottom and left of the video that defines the safe area of the video. For example, [10, 20, 30, 40] means the safe area starts at 10% from the top, 20% from the right, 30% from the bottom and 40% from the left of the video.
   */
  topRightBottomLeftPercent: number[];

  /**
   * Video safe zone HTML element id
   */
  htmlId: string;

  /**
   * Video safe zone HTML element class for styling.
   */
  htmlClass: string;
}

/**
 * Help menu group represents a group of help menu items in the player chroming help menu.
 */
export interface HelpMenuGroup {
  /**
   * Name of the help menu group. Will be displayed as the header of the group in the help menu.
   */
  name: string;

  /**
   * Array of help menu items in the help menu group. Each item represents a feature or functionality of the player and should have a name and description that will be displayed in the help menu.
   */
  items: HelpMenuItem[];
}

/**
 * Help menu item represents a feature or functionality of the player that will be displayed in the help menu.
 */
export interface HelpMenuItem {
  /**
   * Text to display on the right side of the help menu item. (i.e. functionality name))
   */
  name: string;

  /**
   * Text to display on the left side of the help menu item. (i.e. Keyboard shortcut)
   */
  description: string;
}

export enum HelpMenuGroupInsertPosition {
  APPEND = 'APPEND',
  PREPEND = 'PREPEND',
}

/**
 * Single item in the dropdown list.
 */
export interface OmakaseDropdownListItem extends Record<string, any> {
  /**
   * Internal value of the dropdown list item that can be used to determine which item is selected. Can be of any type and is not displayed in the UI.
   */
  value: any;

  /**
   * Label of the dropdown list item that will be displayed in the UI.
   */
  label: string;

  /**
   * If true, the dropdown list item will be displayed as selected in the UI.
   */
  active?: boolean;

  /**
   * Class(es) to add to the element displayed after the label text
   */
  actionClass?: string;
}

/**
 * Omakase dropdown component API
 */
export interface OmakaseDropdownListApi {
  /**
   * Width of the dropdown list in pixels. If the width is not set, the dropdown list will have a default width defined in CSS.
   */
  get width(): number;
  set width(width: number);

  /**
   * Type of icons displayed next to each dropdown list item. Can be 'radio' for radio button icons, 'checkbox' for checkbox icons, or 'default' for no icons. Default value is 'default'.
   */
  get type(): OmakaseDropdownListType;
  set type(type: OmakaseDropdownListType);

  /**
   * Observable that emits the currently selected dropdown list item whenever the selection changes. Emits undefined if no item is selected.
   */
  selectedOption$: BehaviorSubject<OmakaseDropdownListItem | undefined>;

  /**
   * Observable that emits the dropdown list item whenever the action icon on the right side of the dropdown list item is clicked.
   */
  selectedAction$: Observable<OmakaseDropdownListItem>;

  /**
   * Sets the dropdown list items and their configuration. The configuration includes the label to display for each item, the internal value of each item, and whether the item is active (selected) or not. The internal value can be used to determine which item is selected when subscribing to the selectedOption$ observable.
   * @param options Array of dropdown list items and their configuration
   */
  setOptions(options: OmakaseDropdownListItem[]): void;
}

export type ChromingVuMeterConfig = Pick<VuMeterConfig, 'theme' | 'scale' | 'rangeMinDb' | 'scaleStepDb' | 'scaleOffsetDb' | 'levelHoldDuration' | 'channels' | 'labels' | 'style'>;
export type ChromingVuMeterStyle = Pick<VuMeterStyle, 'levelColors' | 'levelBackground'>;

export type ChromingMarkerBarHandlers = {
  [ChromingTrackDestination.PROGRESS_BAR]: ChromingMarkerBarHandlerApi | undefined;
  [ChromingTrackDestination.MARKER_BARS]: ChromingMarkerBarHandlerApi[];
};

export enum ChromingTrackDestination {
  MARKER_BARS = 'MARKER_BARS',
  PROGRESS_BAR = 'PROGRESS_BAR',
}

export enum ChromingVuMeterPosition {
  CONTROL_BAR = 'CONTROL_BAR',
  FLOATING = 'FLOATING',
}

export enum ChromingTheme {
  DEFAULT = 'DEFAULT',
  STAMP = 'STAMP',
  CHROMELESS = 'CHROMELESS',
  CUSTOM = 'CUSTOM',
  AUDIO = 'AUDIO',
  OMAKASE = 'OMAKASE',
}

export enum ControlBarVisibility {
  ENABLED = 'ENABLED',
  DISABLED = 'DISABLED',
  FULLSCREEN_ONLY = 'FULLSCREEN_ONLY',
}

export enum OmakaseControlBarVisibility {
  ENABLED = 'ENABLED',
  DISABLED = 'DISABLED',
  ALWAYS_ON = 'ALWAYS_ON',
}

export enum DefaultThemeControl {
  PLAY = 'PLAY',
  FRAME_FORWARD = 'FRAME_FORWARD',
  TEN_FRAMES_FORWARD = 'TEN_FRAMES_FORWARD',
  FRAME_BACKWARD = 'FRAME_BACKWARD',
  TEN_FRAMES_BACKWARD = 'TEN_FRAMES_BACKWARD',
  TIME_TOGGLE = 'TIME_TOGGLE',
  FULLSCREEN = 'FULLSCREEN',
  TEXT_TOGGLE = 'TEXT_TOGGLE',
  VOLUME = 'VOLUME',
  SCRUBBER = 'SCRUBBER',
  TRACK_SELECTOR = 'TRACK_SELECTOR',
  PLAYBACK_RATE = 'PLAYBACK_RATE',
  DETACH_TOGGLE = 'DETACH_TOGGLE',
  ROUTER = 'ROUTER',
  VU_METER = 'VU_METER',
  VU_METER_TOGGLE = 'VU_METER_TOGGLE',
}

export enum AudioThemeControl {
  PLAY = 'PLAY',
  VOLUME = 'VOLUME',
  PLAYBACK_RATE = 'PLAYBACK_RATE',
  TRACK_SELECTOR = 'TRACK_SELECTOR',
  SCRUBBER = 'SCRUBBER',
  TIME = 'TIME',
  ROUTER = 'ROUTER',
}

export enum DefaultThemeFloatingControl {
  PLAYBACK_CONTROLS = 'PLAYBACK_CONTROLS',
  TIME = 'TIME',
  ACTION_ICONS = 'ACTION_ICONS',
  VU_METER = 'VU_METER',
}

export enum DefaultThemeActionIcon {
  TRACK_SELECTOR = 'TRACK_SELECTOR',
  HELP_MENU = 'HELP_MENU',
  ROUTER = 'ROUTER',
}

export enum StampThemeFloatingControl {
  PROGRESS_BAR = 'PROGRESS_BAR',
  TIME = 'TIME',
  PLAYBACK_CONTROLS = 'PLAYBACK_CONTROLS',
  ACTION_ICONS = 'ACTION_ICONS',
}

export enum StampThemeActionIcon {
  AUDIO_TOGGLE = 'AUDIO_TOGGLE',
  FULLSCREEN = 'FULLSCREEN',
}

export enum AudioThemeFloatingControl {
  PLAYBACK_CONTROLS = 'PLAYBACK_CONTROLS',
  HELP_MENU = 'HELP_MENU',
}

export enum ChromelessThemeFloatingControl {
  TIME = 'TIME',
}

export enum OmakaseThemeControl {
  PLAY = 'PLAY',
  FRAME_FORWARD = 'FRAME_FORWARD',
  TEN_FRAMES_FORWARD = 'TEN_FRAMES_FORWARD',
  FRAME_BACKWARD = 'FRAME_BACKWARD',
  TEN_FRAMES_BACKWARD = 'TEN_FRAMES_BACKWARD',
  FULLSCREEN = 'FULLSCREEN',
  VOLUME = 'VOLUME',
  TRACK_SELECTOR = 'TRACK_SELECTOR',
  PLAYBACK_RATE = 'PLAYBACK_RATE',
  DETACH_TOGGLE = 'DETACH_TOGGLE',
  TIME_TOGGLE = 'TIME_TOGGLE',
  CLOSE = 'CLOSE',
  ROUTER = 'ROUTER',
  VU_METER = 'VU_METER',
  VU_METER_TOGGLE = 'VU_METER_TOGGLE',
}

export enum OmakaseThemeFloatingControl {
  PROGRESS_BAR = 'PROGRESS_BAR',
  TIME = 'TIME',
  PLAYBACK_CONTROLS = 'PLAYBACK_CONTROLS',
  ACTION_ICONS = 'ACTION_ICONS',
  VU_METER = 'VU_METER',
}

export enum OmakaseThemeActionIcon {
  HELP_MENU = 'HELP_MENU',
  FULLSCREEN = 'FULLSCREEN',
  AUDIO_TOGGLE = 'AUDIO_TOGGLE',
  VOLUME = 'VOLUME',
  CONTROL_BAR_TOGGLE = 'CONTROL_BAR_TOGGLE',
}

export enum StampThemeScale {
  FILL = 'FILL',
  FIT = 'FIT',
}

export enum ChromingTimeFormat {
  TIMECODE = MediaTemporalFormat.TIMECODE,
  COUNTDOWN_MEDIA_TIME = MediaTemporalFormat.COUNTDOWN_MEDIA_TIME,
  MEDIA_TIME = MediaTemporalFormat.MEDIA_TIME,
}

export enum WatermarkVisibility {
  ALWAYS_ON = 'ALWAYS_ON',
  AUTO_HIDE = 'AUTO_HIDE',
}

export enum AudioPlayerSize {
  FULL = 'FULL',
  COMPACT = 'COMPACT',
}

export enum FullscreenChroming {
  ENABLED = 'ENABLED',
  DISABLED = 'DISABLED',
}

export enum OmakaseProgressBarPosition {
  OVER_VIDEO = 'OVER_VIDEO',
  UNDER_VIDEO = 'UNDER_VIDEO',
}

export enum AudioVisualization {
  DISABLED = 'DISABLED',
  ENABLED = 'ENABLED',
}

export interface PlayerChromingThemeConfig<T extends ChromingTheme> {
  /**
   * Chroming theme determines how the player will be chromed.
   */
  readonly theme: T;

  /**
   * Chroming theme configuration
   */
  themeConfig?: Partial<ChromingThemeConfigMap[T]> | undefined;
}

export interface PlayerChromingCommonConfig {
  /**
   * Watermark text or svg
   */
  watermark?: string | undefined;

  /**
   * Specifies if watermark is shown when the video is playing
   */
  watermarkVisibility?: WatermarkVisibility | undefined;

  /**
   * Specifies if chroming is enabled in fullscreen
   */
  fullscreenChroming?: FullscreenChroming | undefined;

  /**
   * CSS file url(s) for player chroming styling
   */
  styleUrl?: string | string[] | undefined;
}

export type PlayerChromingConfig = {
  [K in ChromingTheme]: PlayerChromingThemeConfig<K>;
}[keyof ChromingThemeConfigMap] &
  PlayerChromingCommonConfig;

export interface DefaultThemeConfigUpdateableAttrs {
  /**
   * Specifies controls visibility
   */
  controlBarVisibility: ControlBarVisibility;

  /**
   * Specifies list of enabled controls in control bar
   */
  controlBar: DefaultThemeControl[];

  /**
   * Specifies which time format will be used in the timer control
   */
  timeFormat: ChromingTimeFormat;

  /**
   * Shared configuration for floating and control bar VU meters
   */
  vuMeterConfig: Partial<ChromingVuMeterConfig>;

  /**
   * Specifies if the floating VU meter is displayed
   */
  isFloatingVuMeterVisible: boolean;

  /**
   * Override values for the floating VU meter configuration
   */
  floatingVuMeterConfig?: Partial<ChromingVuMeterConfig> | undefined;

  /**
   * Override values for the control bar VU meter configuration
   */
  controlBarVuMeterConfig?: Partial<ChromingVuMeterConfig> | undefined;
}

export interface DefaultThemeConfig extends DefaultThemeConfigUpdateableAttrs {
  /**
   * Specifies list of enabled floating controls
   */
  floatingControls: DefaultThemeFloatingControl[];

  /**
   * Specifies list of enabled floating controls
   */
  alwaysOnFloatingControls: DefaultThemeFloatingControl[];

  /**
   * Specifies list of enabled action icons
   */
  actionIcons: DefaultThemeActionIcon[];

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

export interface CustomThemeConfigUpdateableAttrs {}

export interface CustomThemeConfig extends CustomThemeConfigUpdateableAttrs {
  /**
   * Id of the custom web component used for Player chroming
   */
  htmlTemplateId: string;
}

export interface StampThemeConfigUpdateableAttrs {
  /**
   * Specifies how the video will fill the container
   */
  stampScale: StampThemeScale;

  /**
   * Specifies which time format will be used in the timer control
   */
  timeFormat: ChromingTimeFormat;
}

export interface StampThemeConfig extends StampThemeConfigUpdateableAttrs {
  /**
   * Specifies list of enabled floating controls
   */
  floatingControls: StampThemeFloatingControl[];

  /**
   * Specifies list of floating controls that are shown when the video is playing
   */
  alwaysOnFloatingControls: StampThemeFloatingControl[];

  /**
   * Specifies list of enabled action icons
   */
  actionIcons: StampThemeActionIcon[];

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

export interface AudioThemeConfigUpdateableAttrs {
  /**
   * Specifies controls visibility
   */
  controlBarVisibility: Omit<ControlBarVisibility, ControlBarVisibility.FULLSCREEN_ONLY>;

  /**
   * Specifies list of enabled controls in control bar
   */
  controlBar: AudioThemeControl[];

  /**
   * Specifies the audio player size
   */
  playerSize: AudioPlayerSize;

  /**
   * Specifies which time format will be used in the timer control
   */
  timeFormat: ChromingTimeFormat;
}

export interface AudioThemeConfig extends AudioThemeConfigUpdateableAttrs {
  /**
   * Specifies list of enabled floating controls
   */
  floatingControls: AudioThemeFloatingControl[];

  /**
   * Specifies list of floating controls that are shown when the video is playing
   */
  alwaysOnFloatingControls: AudioThemeFloatingControl[];

  /**
   * Sets the available playback rates in menu
   */
  playbackRates: number[];

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

export interface OmakaseThemeConfigUpdateableAttrs {
  /**
   * Specifies which time format will be used in the timer control
   */
  timeFormat: ChromingTimeFormat;

  /**
   * Specifies control bar visibility
   */
  controlBarVisibility: OmakaseControlBarVisibility;

  /**
   * Specifies controls visibility
   */
  controlBar: OmakaseThemeControl[];

  /**
   * Specifies control bar position
   */
  progressBarPosition: OmakaseProgressBarPosition;

  /**
   * Specifies if the floating VU meter is displayed
   */
  isFloatingVuMeterVisible: boolean;

  /**
   * Shared configuration for control bar and floating VU meters
   */
  vuMeterConfig: Partial<ChromingVuMeterConfig>;

  /**
   * Override values for the floating VU meter configuration
   */
  floatingVuMeterConfig?: Partial<ChromingVuMeterConfig> | undefined;

  /**
   * Override values for the control bar VU meter configuration
   */
  controlBarVuMeterConfig?: Partial<ChromingVuMeterConfig> | undefined;
}

export interface OmakaseThemeConfig extends OmakaseThemeConfigUpdateableAttrs {
  /**
   * Specifies the list of enabled floating controls
   */
  floatingControls: OmakaseThemeFloatingControl[];

  /**
   * Specifies the list of floating controls that are shown when the video is playing
   */
  alwaysOnFloatingControls: OmakaseThemeFloatingControl[];

  /**
   * Specifies the list of enabled action icons
   */
  actionIcons: OmakaseThemeActionIcon[];

  /**
   * Sets the available playback rates in menu
   */
  playbackRates: number[];

  /**
   * Id of the custom web component used for Player chroming
   */
  htmlTemplateId?: string;
}

export interface ChromelessThemeConfigUpdateableAttrs {
  /**
   * Specifies which time format will be used in the timer control
   */
  timeFormat: ChromingTimeFormat;
}

export interface ChromelessThemeConfig extends ChromelessThemeConfigUpdateableAttrs {
  /**
   * Specifies the list of enabled floating controls
   */
  floatingControls: ChromelessThemeFloatingControl[];

  /**
   * Specifies the list of floating controls that are shown when the video is playing
   */
  alwaysOnFloatingControls: ChromelessThemeFloatingControl[];
}

export type ChromingThemeTypes = ChromingTheme.DEFAULT | ChromingTheme.AUDIO | ChromingTheme.CHROMELESS | ChromingTheme.STAMP | ChromingTheme.OMAKASE | ChromingTheme.CUSTOM;

export type ChromingThemeConfigTypes = DefaultThemeConfig | StampThemeConfig | ChromelessThemeConfig | AudioThemeConfig | OmakaseThemeConfig | CustomThemeConfig;

export type ChromingThemeConfigMap = {
  [ChromingTheme.DEFAULT]: DefaultThemeConfig;
  [ChromingTheme.AUDIO]: AudioThemeConfig;
  [ChromingTheme.CHROMELESS]: ChromelessThemeConfig;
  [ChromingTheme.OMAKASE]: OmakaseThemeConfig;
  [ChromingTheme.STAMP]: StampThemeConfig;
  [ChromingTheme.CUSTOM]: CustomThemeConfig;
};

export const DEFAULT_CHROMING_VU_METER_STYLE: ChromingVuMeterStyle = {
  levelColors: DEFAULT_VU_METER_STYLE.levelColors,
  levelBackground: DEFAULT_VU_METER_STYLE.levelBackground,
};

export const DEFAULT_CHROMING_VU_METER_CONFIG: ChromingVuMeterConfig = {
  theme: VuMeterTheme.DEFAULT,
  scale: VuMeterScale.DEFAULT,
  rangeMinDb: DEFAULT_VU_METER_CONFIG.rangeMinDb,
  scaleStepDb: DEFAULT_VU_METER_CONFIG.scaleStepDb,
  scaleOffsetDb: DEFAULT_VU_METER_CONFIG.scaleOffsetDb,
  labels: DEFAULT_VU_METER_CONFIG.labels,
  style: DEFAULT_CHROMING_VU_METER_STYLE,
  channels: 2,
  levelHoldDuration: 0,
};

export const DEFAULT_PLAYER_CHROMING_CONFIG: DefaultThemeConfig = {
  controlBarVisibility: ControlBarVisibility.ENABLED,
  controlBar: [
    DefaultThemeControl.PLAY,
    DefaultThemeControl.FRAME_FORWARD,
    DefaultThemeControl.TEN_FRAMES_FORWARD,
    DefaultThemeControl.FRAME_BACKWARD,
    DefaultThemeControl.TEN_FRAMES_BACKWARD,
    DefaultThemeControl.TIME_TOGGLE,
    DefaultThemeControl.DETACH_TOGGLE,
    DefaultThemeControl.FULLSCREEN,
    DefaultThemeControl.TEXT_TOGGLE,
    DefaultThemeControl.VOLUME,
    DefaultThemeControl.SCRUBBER,
    DefaultThemeControl.FULLSCREEN,
    DefaultThemeControl.TRACK_SELECTOR,
    DefaultThemeControl.PLAYBACK_RATE,
  ],
  floatingControls: [DefaultThemeFloatingControl.ACTION_ICONS, DefaultThemeFloatingControl.PLAYBACK_CONTROLS],
  alwaysOnFloatingControls: [DefaultThemeFloatingControl.VU_METER],
  actionIcons: [DefaultThemeActionIcon.HELP_MENU],
  playbackRates: [0.25, 0.5, 0.75, 1, 2, 4, 8],
  trackSelectorAutoClose: true,
  timeFormat: ChromingTimeFormat.TIMECODE,
  vuMeterConfig: DEFAULT_CHROMING_VU_METER_CONFIG,
  isFloatingVuMeterVisible: true,
};

export const DEFAULT_STAMP_PLAYER_CHROMING_CONFIG: StampThemeConfig = {
  stampScale: StampThemeScale.FIT,
  timeFormat: ChromingTimeFormat.MEDIA_TIME,
  floatingControls: [StampThemeFloatingControl.PROGRESS_BAR, StampThemeFloatingControl.ACTION_ICONS, StampThemeFloatingControl.TIME, StampThemeFloatingControl.PLAYBACK_CONTROLS],
  alwaysOnFloatingControls: [StampThemeFloatingControl.PROGRESS_BAR, StampThemeFloatingControl.ACTION_ICONS, StampThemeFloatingControl.TIME],
  actionIcons: [StampThemeActionIcon.AUDIO_TOGGLE],
};

export const DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG: AudioThemeConfig = {
  controlBarVisibility: ControlBarVisibility.ENABLED,
  controlBar: [AudioThemeControl.PLAY, AudioThemeControl.VOLUME, AudioThemeControl.PLAYBACK_RATE, AudioThemeControl.TRACK_SELECTOR, AudioThemeControl.SCRUBBER, AudioThemeControl.TIME],
  floatingControls: [AudioThemeFloatingControl.PLAYBACK_CONTROLS, AudioThemeFloatingControl.HELP_MENU],
  alwaysOnFloatingControls: [],
  playbackRates: [0.5, 0.75, 1, 2],
  playerSize: AudioPlayerSize.FULL,
  visualization: AudioVisualization.DISABLED,
  visualizationConfig: {
    strokeColor: '#9968BF',
    fillColors: ['#F79433', '#88B840', '#CC6984', '#662D91'],
  },
  timeFormat: ChromingTimeFormat.TIMECODE,
};

export const DEFAULT_OMAKASE_PLAYER_CHROMING_CONFIG: OmakaseThemeConfig = {
  timeFormat: ChromingTimeFormat.TIMECODE,
  progressBarPosition: OmakaseProgressBarPosition.OVER_VIDEO,
  controlBarVisibility: OmakaseControlBarVisibility.ENABLED,
  controlBar: [
    OmakaseThemeControl.PLAY,
    OmakaseThemeControl.FRAME_BACKWARD,
    OmakaseThemeControl.TEN_FRAMES_BACKWARD,
    OmakaseThemeControl.FRAME_FORWARD,
    OmakaseThemeControl.TEN_FRAMES_FORWARD,
    OmakaseThemeControl.VOLUME,
    OmakaseThemeControl.PLAYBACK_RATE,
    OmakaseThemeControl.TRACK_SELECTOR,
    OmakaseThemeControl.FULLSCREEN,
    OmakaseThemeControl.DETACH_TOGGLE,
    OmakaseThemeControl.CLOSE,
    OmakaseThemeControl.TIME_TOGGLE,
  ],
  floatingControls: [OmakaseThemeFloatingControl.PLAYBACK_CONTROLS, OmakaseThemeFloatingControl.PROGRESS_BAR, OmakaseThemeFloatingControl.TIME, OmakaseThemeFloatingControl.ACTION_ICONS],
  alwaysOnFloatingControls: [OmakaseThemeFloatingControl.TIME, OmakaseThemeFloatingControl.PROGRESS_BAR, OmakaseThemeFloatingControl.VU_METER],
  actionIcons: [OmakaseThemeActionIcon.HELP_MENU, OmakaseThemeActionIcon.AUDIO_TOGGLE, OmakaseThemeActionIcon.FULLSCREEN],
  playbackRates: [0.25, 0.5, 0.75, 1, 2, 4, 8],
  vuMeterConfig: DEFAULT_CHROMING_VU_METER_CONFIG,
  isFloatingVuMeterVisible: true,
};

export const DEFAULT_CHROMELESS_PLAYER_CHROMING_CONFIG: ChromelessThemeConfig = {
  timeFormat: ChromingTimeFormat.TIMECODE,
  floatingControls: [],
  alwaysOnFloatingControls: [ChromelessThemeFloatingControl.TIME],
};

export const DEFAULT_PLAYER_CHROMING: PlayerChromingConfig = {
  theme: ChromingTheme.DEFAULT,
  fullscreenChroming: FullscreenChroming.ENABLED,
  themeConfig: DEFAULT_PLAYER_CHROMING_CONFIG,
};
