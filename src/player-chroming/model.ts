export type PlayerChromingTheme = 'DEFAULT' | 'STAMP' | 'CHROMELESS' | 'CUSTOM';

export type ControlBarVisibility = 'ENABLED' | 'DISABLED' | 'FULLSCREEN_ONLY';

export type DefaultThemeControl =
  | 'PLAY'
  | 'FRAME_FORWARD'
  | 'TEN_FRAMES_FORWARD'
  | 'FRAME_BACKWARD'
  | 'TEN_FRAMES_BACKWARD'
  | 'BITC'
  | 'FULLSCREEN'
  | 'CAPTIONS'
  | 'VOLUME'
  | 'SCRUBBER'
  | 'TRACKSELECTOR'
  | 'PLAYBACK_RATE'
  | 'DETACH';

export type DefaultThemeFloatingControl = 'TRACKSELECTOR' | 'HELP_MENU' | 'PLAYBACK_CONTROLS';

export type StampThemeFloatingControl = 'PROGRESS_BAR' | 'AUDIO_TOGGLE' | 'TIME' | 'PLAYBACK_CONTROLS';

export type StampThemeScale = 'FILL' | 'FIT';

export type StampTimeFormat = 'TIMECODE' | 'COUNTDOWN_TIMER' | 'MEDIA_TIME';

export type WatermarkVisibility = 'ALWAYS_ON' | 'AUTO_HIDE';

export interface PlayerChroming<T extends PlayerChromingTheme> {
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
}

export interface DefaultChroming extends PlayerChroming<'DEFAULT'> {
  themeConfig?: Partial<DefaultThemeConfig>;
}

export interface CustomChroming extends PlayerChroming<'CUSTOM'> {
  themeConfig?: {
    /**
     * Id of the custom web component used for Player chroming
     */
    htmlTemplateId: string;
  };
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
}

export interface StampChroming extends PlayerChroming<'STAMP'> {
  themeConfig?: Partial<StampThemeConfig>;
}

export interface ChromelessChroming extends PlayerChroming<'CHROMELESS'> {}

export const DEFAULT_PLAYER_CHROMING_CONFIG: DefaultThemeConfig = {
  controlBarVisibility: 'FULLSCREEN_ONLY',
  controlBar: [
    'PLAY',
    'FRAME_FORWARD',
    'TEN_FRAMES_FORWARD',
    'FRAME_BACKWARD',
    'TEN_FRAMES_BACKWARD',
    'BITC',
    'DETACH',
    'FULLSCREEN',
    'CAPTIONS',
    'VOLUME',
    'SCRUBBER',
    'FULLSCREEN',
    'TRACKSELECTOR',
    'PLAYBACK_RATE',
  ],
  floatingControls: ['HELP_MENU', 'PLAYBACK_CONTROLS'],
  playbackRates: [0.25, 0.5, 0.75, 1, 2, 4, 8],
  trackSelectorAutoClose: true,
};

export const DEFAULT_STAMP_PLAYER_CHROMING_CONFIG: StampThemeConfig = {
  stampScale: 'FIT',
  timeFormat: 'MEDIA_TIME',
  floatingControls: ['PROGRESS_BAR', 'AUDIO_TOGGLE', 'TIME', 'PLAYBACK_CONTROLS'],
  alwaysOnFloatingControls: ['PROGRESS_BAR', 'AUDIO_TOGGLE', 'TIME'],
};

export const DEFAULT_PLAYER_CHROMING: DefaultChroming = {
  theme: 'DEFAULT',
  themeConfig: DEFAULT_PLAYER_CHROMING_CONFIG,
};
