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

import {MediaThemeElement} from 'media-chrome/dist/media-theme-element';
import {DomUtil} from '../util/dom-util';
import {
  AudioPlayerSize,
  AudioThemeControl,
  AudioThemeFloatingControl,
  AudioVisualization,
  ControlBarVisibility,
  DEFAULT_PLAYER_CHROMING,
  DefaultThemeControl,
  DefaultThemeFloatingControl,
  OmakaseChroming,
  OmakaseProgressBarPosition,
  OmakaseThemeActionIcon,
  OmakaseThemeControl,
  OmakaseThemeFloatingControl,
  OmakaseControlBarVisibility,
  PlayerChroming,
  PlayerChromingTheme,
  StampThemeActionIcon,
  StampThemeFloatingControl,
  TimeFormat,
  ChromelessThemeFloatingControl,
} from './model';
import {PlayerChromingDomControllerApi} from './player-chroming-dom-controller-api';
import {MediaChromeButton, MediaControlBar, MediaController, MediaTooltip} from 'media-chrome';
import {OmakaseAudioVisualization, OmakaseMarkerBar, OmakasePlayButton, OmakasePreviewThumbnail, OmakaseTimeDisplay, OmakaseTimeRange} from '../components';
import {OmakaseVolumeRange} from '../components/omakase-volume-range';
import {OmakaseMuteButton} from '../components/omakase-mute-button';
import {OmakaseDropdown} from '../components/omakase-dropdown';
import {OmakaseDropdownList, OmakaseDropdownListItem} from '../components/omakase-dropdown-list';
import {OmakaseDropdownToggle} from '../components/omakase-dropdown-toggle';
import {VideoControllerApi} from '../video';
import {filter, from, fromEvent, merge, Subject, takeUntil} from 'rxjs';
import {nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {AuthConfig} from '../common/authentication';
import {VttLoadOptions} from '../api/vtt-aware-api';
import {VttAdapter} from '../common/vtt-adapter';
import {ThumbnailVttFile} from '../vtt';
import {MarkerTrackConfig} from '../video/model';
import {MarkerTrackApi} from '../api';
import {TimeRangeMarkerTrackApi} from '../api/time-range-marker-track-api';
import {nullifier} from '../util/destroy-util';
import {DomController} from '../dom/dom-controller';
import {HTMLVideoElementEvents} from '../media-element/omp-media-element';
import {FileUtil} from './../util/file-util';
import {CaptionsRenderer, parseResponse} from 'media-captions';
// @ts-ignore
import playerChromingStyle from '../../style/player-chroming/player-chroming.css?raw';
// @ts-ignore
import captionStyle from '../../node_modules/media-captions/styles/captions.css?raw';
import {SubtitlesVttTrack} from '../types';

export interface PlayerChromingDomControllerConfig {
  playerHTMLElementId: string;
  detachedPlayer: boolean;
  playerChroming: PlayerChroming;
}

export const PLAYER_CHROMING_DOM_CONTROLLER_CONFIG_DEFAULT: PlayerChromingDomControllerConfig = {
  playerHTMLElementId: 'omakase-player',
  detachedPlayer: false,
  playerChroming: DEFAULT_PLAYER_CHROMING,
};

export class PlayerChromingDomController extends DomController implements PlayerChromingDomControllerApi {
  protected readonly _config: PlayerChromingDomControllerConfig;
  protected readonly _vttAdapter = new VttAdapter(ThumbnailVttFile);

  protected _themeElement!: MediaThemeElement;
  protected _mediaControllerElement!: MediaController;
  protected readonly _divPlayer: HTMLElement;
  protected _controlBar?: MediaControlBar;
  protected _omakaseControlBar?: HTMLElement;

  protected _buttonFastRewind?: MediaChromeButton;
  protected _buttonRewind?: MediaChromeButton;
  protected _buttonForward?: MediaChromeButton;
  protected _buttonFastForward?: MediaChromeButton;
  protected _buttonAttach?: MediaChromeButton;
  protected _buttonDetach?: MediaChromeButton;
  protected _buttonPlay?: OmakasePlayButton;
  protected _buttonCloseControlBar?: MediaChromeButton;
  protected _buttonControlBarToggle?: MediaChromeButton;

  protected _timeRangeControl?: OmakaseTimeRange;
  protected _volumeRangeControls?: OmakaseVolumeRange[];
  protected _currentTimecode?: OmakaseTimeDisplay;
  protected _previewTimecode?: OmakaseTimeDisplay;
  protected _timeDuration?: OmakaseTimeDisplay;
  protected _previewThumbnail?: OmakasePreviewThumbnail;
  protected _muteButtons?: OmakaseMuteButton[];
  protected _textButton?: MediaChromeButton;
  protected _speedDropdown?: OmakaseDropdown;
  protected _audioDropdown?: OmakaseDropdown;
  protected _speedDropdownList?: OmakaseDropdownList;
  protected _audioDropdownList?: OmakaseDropdownList;
  protected _textDropdownList?: OmakaseDropdownList;
  protected _sidecarDropdownList?: OmakaseDropdownList;
  protected _audioDropdownToggle?: OmakaseDropdownToggle;
  protected _markerBar?: OmakaseMarkerBar;
  protected _audioVisualization?: OmakaseAudioVisualization;

  protected _buttonBitc?: MediaChromeButton;
  protected _buttonHelp?: MediaChromeButton;
  protected _tooltipBitc?: MediaTooltip;
  protected _divTimecode?: HTMLElement;
  protected _divBackground?: HTMLElement;
  protected _timecodeWrapper?: HTMLElement;
  protected _captions?: HTMLElement;
  protected _sectionTopRight?: HTMLElement;
  protected _previewWrapper?: HTMLElement;
  protected _divHelpMenu?: HTMLElement;

  protected _captionsRenderer?: CaptionsRenderer;

  protected _bitcEnabled = false;

  protected _enterPictureInPictureHandler: () => void;
  protected _leavePictureInPictureHandler: () => void;

  protected _videoController!: VideoControllerApi;
  protected _videoEventBreaker$: Subject<void> = new Subject();
  protected _subtitleEventBreaker$: Subject<void> = new Subject();

  protected _destroyed$ = new Subject<void>();

  get mediaControllerElement(): MediaController {
    return this._mediaControllerElement;
  }

  get themeElement(): MediaThemeElement {
    return this._themeElement;
  }

  get playerChroming() {
    return this._config.playerChroming;
  }

  set playerChroming(playerChroming: PlayerChroming) {
    this._config.playerChroming = playerChroming;
    this._mediaControllerElement.classList.remove('media-chrome-disabled', 'media-chrome-enabled', 'media-chrome-fullscreen-only');
    this._mediaControllerElement.classList.add(`media-chrome-${this.getVisibilityClass()}`);
    if (this._audioDropdown) {
      if (playerChroming.theme === PlayerChromingTheme.Default && playerChroming.themeConfig?.trackSelectorAutoClose === false) {
        this._audioDropdown.setAttribute('floating', '');
      } else {
        this._audioDropdown.removeAttribute('floating');
      }
    }
    if (playerChroming.theme === PlayerChromingTheme.Stamp) {
      if (this._currentTimecode) {
        this._currentTimecode.setAttribute('format', playerChroming.themeConfig?.timeFormat === TimeFormat.Timecode ? 'timecode' : 'standard');
        if (playerChroming.themeConfig?.timeFormat === TimeFormat.CountdownTimer) {
          this._currentTimecode.setAttribute('countdown', '');
        } else {
          this._currentTimecode.removeAttribute('countdown');
        }
        this._currentTimecode.updateTime();
      }
      if (this._timecodeWrapper) {
        this._timecodeWrapper.classList.remove('omakase-timecode-format-timecode', 'omakase-timecode-format-standard');
        this._timecodeWrapper.classList.add(`omakase-timecode-format-${playerChroming.themeConfig?.timeFormat === TimeFormat.Timecode ? 'timecode' : 'standard'}`);
      }
    }
    if (this._config.playerChroming.theme === PlayerChromingTheme.Audio && this._config.playerChroming.themeConfig?.playerSize === AudioPlayerSize.Compact) {
      this._mediaControllerElement.classList.add('compact');
    } else {
      this._mediaControllerElement.classList.remove('compact');
    }
  }

  constructor(config: PlayerChromingDomControllerConfig) {
    super();
    this._config = {
      ...PLAYER_CHROMING_DOM_CONTROLLER_CONFIG_DEFAULT,
      ...config,
    };
    this._divPlayer = DomUtil.getElementById<HTMLElement>(this._config.playerHTMLElementId);

    this._enterPictureInPictureHandler = () => {
      this._buttonDetach!.className = this._domClasses.mediaChromeAttach;
    };

    this._leavePictureInPictureHandler = () => {
      this._buttonDetach!.className = this._domClasses.mediaChromeDetach;
    };
  }

  createTemplateDom() {
    const styleUrls = Array.isArray(this._config.playerChroming.styleUrl) ? this._config.playerChroming.styleUrl : [this._config.playerChroming.styleUrl];
    return `
      <template id="omakase-player-theme-${this._config.playerHTMLElementId}">
        <style>${captionStyle}</style>
        <style>${playerChromingStyle}</style>
        ${this._config.playerChroming.styleUrl ? styleUrls.map((url) => `<link rel="stylesheet" href="${url}"></link>`) : ''}
        <media-controller gesturesdisabled class="media-controller-${this._config.playerChroming.theme.toLowerCase()} media-chrome-${this.getVisibilityClass()}">
          <slot name="media" slot="media"></slot>
          ${this._config.playerChroming.theme === PlayerChromingTheme.Default && this._config?.playerChroming.themeConfig?.floatingControls?.includes(DefaultThemeFloatingControl.Trackselector) ? `<div slot="top-chrome"><div class="${this._domClasses.audioTextMenu}">${this.createAudioTextDropdownDom('top')}</div></div>` : ''}
          <div slot="centered-chrome" class="${this._domClasses.videoControls}" ${this._config.playerChroming.watermarkVisibility === 'AUTO_HIDE' ? '' : 'noautohide'}>
              <div class="${this._domClasses.safeZoneWrapper}"></div>
              <div class="${this._domClasses.watermarkWrapper}">
                <div class="${this._domClasses.watermark}"></div>
              </div>
              ${
                this._config.playerChroming.theme === PlayerChromingTheme.Default
                  ? `<div class="${this._domClasses.sectionTopLeft}">
                        <slot name="top-left"></slot>
                    </div>
                    <div class="${this._domClasses.sectionTopRight}">
                        <slot name="top-right"></slot>
                    </div>
                    <div class="${this._domClasses.help} d-none">
                        ${
                          this._config.playerChroming.themeConfig?.floatingControls?.includes(DefaultThemeFloatingControl.Trackselector)
                            ? `<omakase-dropdown-toggle id="audio-dropdown-toggle-${this._config.playerHTMLElementId}" dropdown="audio-dropdown-${this._config.playerHTMLElementId}" class="${this._domClasses.audioTextToggle} d-none">
                                <media-chrome-button class="${this._domClasses.mediaChromeButton} omakase-player-audio-text">
                                  <span class="${this._domClasses.mediaChromeAudioText} shadow"></span>
                                </media-chrome-button>
                              </omakase-dropdown-toggle>`
                            : ''
                        }
                        ${
                          this._config.playerChroming.themeConfig?.floatingControls?.includes(DefaultThemeFloatingControl.HelpMenu)
                            ? `<div class="omakase-help-dropdown">
                                <button class="omakase-help-button d-none"></button>
                                <div class="${this._domClasses.helpMenu} d-none">
                                </div>
                              </div>`
                            : ''
                        }
                    </div>
                    ${
                      this._config.playerChroming.themeConfig?.floatingControls?.includes(DefaultThemeFloatingControl.PlaybackControls)
                        ? `<div class="omakase-overlay-buttons">
                              <div class="${this._domClasses.buttonOverlayAttach} omakase-video-overlay-button"></div>
                              <div class="${this._domClasses.buttonOverlayPlay} omakase-video-overlay-button d-none"></div>
                              <div class="${this._domClasses.buttonOverlayPause} omakase-video-overlay-button d-none"></div>
                              <div class="${this._domClasses.buttonOverlayReplay} omakase-video-overlay-button d-none"></div>
                              <div class="${this._domClasses.buttonOverlayLoading} omakase-video-overlay-button d-none"></div>
                              <div class="${this._domClasses.buttonOverlayError} omakase-video-overlay-button d-none"></div>
                          </div>`
                        : ''
                    }`
                  : this._config.playerChroming.theme === PlayerChromingTheme.Audio
                    ? `<div class="${this._domClasses.sectionTopLeft}">
                            <slot name="top-left"></slot>
                        </div>
                        <div class="${this._domClasses.sectionTopRight}">
                            <slot name="top-right"></slot>
                        </div>
                        <div class="${this._domClasses.help} d-none">
                        ${
                          this._config.playerChroming.themeConfig?.floatingControls?.includes(AudioThemeFloatingControl.HelpMenu)
                            ? `<div class="omakase-help-dropdown">
                                <button class="omakase-help-button d-none"></button>
                                <div class="${this._domClasses.helpMenu} d-none">
                                </div>
                              </div>`
                            : ''
                        }
                    </div>
                    ${
                      this._config.playerChroming.themeConfig?.floatingControls?.includes(AudioThemeFloatingControl.PlaybackControls)
                        ? `<div class="omakase-overlay-buttons">
                              <div class="${this._domClasses.buttonOverlayAttach} omakase-video-overlay-button"></div>
                              <div class="${this._domClasses.buttonOverlayPlay} omakase-video-overlay-button d-none"></div>
                              <div class="${this._domClasses.buttonOverlayPause} omakase-video-overlay-button d-none"></div>
                              <div class="${this._domClasses.buttonOverlayReplay} omakase-video-overlay-button d-none"></div>
                              <div class="${this._domClasses.buttonOverlayLoading} omakase-video-overlay-button d-none"></div>
                              <div class="${this._domClasses.buttonOverlayError} omakase-video-overlay-button d-none"></div>
                          </div>`
                        : ''
                    }`
                    : ''
              }
          </div>
          ${
            this._config.playerChroming.theme !== PlayerChromingTheme.Audio || this._config.playerChroming.themeConfig?.visualization === AudioVisualization.Disabled
              ? `<div noautohide class="${this._domClasses.backgroundImage}"></div>`
              : ''
          }
          ${this.createControlBarDom()}
      </media-controller>
    </template>`;
  }

  createSlotsDom() {
    if (
      (this._config.playerChroming.theme === PlayerChromingTheme.Default ||
        this._config.playerChroming.theme === PlayerChromingTheme.Stamp ||
        this._config.playerChroming.theme === PlayerChromingTheme.Audio) &&
      this._config.playerChroming.themeConfig?.htmlTemplateId
    ) {
      return DomUtil.getElementById<HTMLElement>(this._config.playerChroming.themeConfig.htmlTemplateId).innerHTML;
    } else {
      return '';
    }
  }

  initializeDomProperties() {
    this._themeElement = this._divPlayer.getElementsByTagName('media-theme')[0] as MediaThemeElement;
    this._mediaControllerElement = this.getShadowElement<MediaController>('media-controller');
    this._buttonDetach = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaChromeDetach);
    this._buttonAttach = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaChromeAttach);
    this._buttonFastRewind = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaFastRewindButton);
    this._buttonRewind = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaRewindButton);
    this._buttonForward = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaForwardButton);
    this._buttonFastForward = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaFastForwardButton);
    this._buttonCloseControlBar = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaChromeClose);
    this._buttonControlBarToggle = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaChromeControlBarToggle);
    this._buttonPlay = this.getShadowElementByClass<OmakasePlayButton>('omakase-player-play');
    this._timeRangeControl = this.getShadowElement<OmakaseTimeRange>('omakase-time-range');
    this._volumeRangeControls = this.getShadowElements<OmakaseVolumeRange>('omakase-volume-range');
    this._muteButtons = this.getShadowElements<OmakaseMuteButton>('omakase-mute-button');
    this._markerBar = this.getShadowElement<OmakaseMarkerBar>('omakase-marker-bar');
    this._audioVisualization = this.getShadowElement<OmakaseAudioVisualization>('omakase-audio-visualization');
    this._textButton = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaChromeTextOn);
    this._currentTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(this._domClasses.mediaChromeCurrentTimecode);
    this._previewTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(this._domClasses.mediaChromePreviewTimecode);
    this._timeDuration = this.getShadowElementByClass<OmakaseTimeDisplay>(this._domClasses.mediaChromeTimeDuration);
    this._previewThumbnail = this.getShadowElementByClass<OmakasePreviewThumbnail>(this._domClasses.mediaChromePreviewThumbnail);
    this._buttonBitc = this.getShadowElementByClass<MediaChromeButton>(this._domClasses.mediaChromeBitcDisabled);
    this._divTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(this._domClasses.timecodeContainer);
    this._tooltipBitc = this.getShadowElementByClass<MediaTooltip>(this._domClasses.mediaChromeBitcTooltip);
    this._speedDropdown = this.getShadowElementById<OmakaseDropdown>(`speed-dropdown-${this._config.playerHTMLElementId}`);
    this._audioDropdown = this.getShadowElementById<OmakaseDropdown>(`audio-dropdown-${this._config.playerHTMLElementId}`);
    this._audioDropdownToggle = this.getShadowElementById<OmakaseDropdownToggle>(`audio-dropdown-toggle-${this._config.playerHTMLElementId}`);
    this._speedDropdownList = this.getShadowElementById<OmakaseDropdownList>(`speed-dropdown-list-${this._config.playerHTMLElementId}`);
    this._audioDropdownList = this.getShadowElementById<OmakaseDropdownList>(`audio-dropdown-list-${this._config.playerHTMLElementId}`);
    this._textDropdownList = this.getShadowElementById<OmakaseDropdownList>(`text-dropdown-list-${this._config.playerHTMLElementId}`);
    this._sidecarDropdownList = this.getShadowElementById<OmakaseDropdownList>(`sidecar-dropdown-list-${this._config.playerHTMLElementId}`);
    this._divBackground = this.getShadowElementByClass<HTMLElement>(this._domClasses.backgroundImage);
    this._timecodeWrapper = this.getShadowElementByClass<HTMLElement>(this._domClasses.timecodeWrapper);
    this._captions = this.getShadowElementByClass<HTMLElement>(this._domClasses.captions);
    this._sectionTopRight = this.getShadowElementByClass<HTMLElement>(this._domClasses.sectionTopRight);
    this._controlBar = this.getShadowElementByClass<MediaControlBar>(this._domClasses.mediaControlBar);
    this._omakaseControlBar = this.getShadowElementByClass<HTMLElement>(this._domClasses.omakaseControlBar);
    this._previewWrapper = this.getShadowElementByClass<HTMLElement>(this._domClasses.mediaChromePreviewWrapper);
    this._buttonHelp = this.getShadowElementByClass<MediaChromeButton>('omakase-player-help-toggle');
    this._divHelpMenu = this.getShadowElementByClass<HTMLElement>(this._domClasses.helpMenu);

    if (this._captions) {
      this._captionsRenderer = new CaptionsRenderer(this._captions);
    }

    // disable default media chrome keyboard shortcuts
    this._mediaControllerElement.hotkeys.add('noarrowleft', 'noarrowright', 'noarrowup', 'noarrowup', 'nospace', 'nok', 'nom', 'nof', 'noc');

    if (this._config.playerChroming.theme === PlayerChromingTheme.Audio && this._config.playerChroming.themeConfig?.playerSize === AudioPlayerSize.Compact) {
      this._mediaControllerElement.classList.add('compact');
    }

    if (this._buttonHelp && this._divHelpMenu) {
      fromEvent(this._buttonHelp, 'click')
        .pipe(takeUntil(this._destroyed$))
        .subscribe(() => {
          if (this.isShown(this._divHelpMenu!)) {
            this.hideElements(this._divHelpMenu);
          } else {
            this.showElements(this._divHelpMenu);
          }
        });
    }
  }

  updateControlBar() {
    if (this.playerChroming.theme === PlayerChromingTheme.Chromeless) {
      this.updateBitc();
    } else if (this.playerChroming.theme === PlayerChromingTheme.Default) {
      for (const control of Object.values(DefaultThemeControl)) {
        if (this.playerChroming.themeConfig?.controlBar?.includes(control)) {
          this.showElements(this.getShadowElementByClass(this.getControlBarClass(control)));
        } else {
          this.hideElements(this.getShadowElementByClass(this.getControlBarClass(control)));
        }
      }
      if (!this.playerChroming.themeConfig?.controlBar?.includes(DefaultThemeControl.Trackselector) && this._audioDropdown?.classList.contains(`${this._domClasses.audioTextDropdown}-bottom`)) {
        this._audioDropdown.style.display = 'none';
      }
      if (!this.playerChroming.themeConfig?.controlBar?.includes(DefaultThemeControl.PlaybackRate) && this._speedDropdown) {
        this._speedDropdown.style.display = 'none';
      }
      this.updateBitc();
    } else if (this.playerChroming.theme === PlayerChromingTheme.Audio) {
      for (const control of Object.values(AudioThemeControl)) {
        if (this.playerChroming.themeConfig?.controlBar?.includes(control)) {
          this.showElements(this.getShadowElementByClass(this.getControlBarClass(control)));
        } else {
          this.hideElements(this.getShadowElementByClass(this.getControlBarClass(control)));
        }
        if (this.playerChroming.themeConfig?.controlBar?.includes(AudioThemeControl.Time)) {
          if (this.playerChroming.themeConfig.controlBar.includes(AudioThemeControl.Trackselector)) {
            this.getShadowElementByClass<HTMLDivElement>(this.getControlBarClass(AudioThemeControl.Time))!.classList.remove('padding-right');
          } else {
            this.getShadowElementByClass<HTMLDivElement>(this.getControlBarClass(AudioThemeControl.Time))!.classList.add('padding-right');
          }
        }
      }
      if (!this.playerChroming.themeConfig?.controlBar?.includes(AudioThemeControl.Trackselector) && this._audioDropdown?.classList.contains(`${this._domClasses.audioTextDropdown}-bottom`)) {
        this._audioDropdown.style.display = 'none';
      }
      if (!this.playerChroming.themeConfig?.controlBar?.includes(AudioThemeControl.PlaybackRate) && this._speedDropdown) {
        this._speedDropdown.style.display = 'none';
      }
    } else if (this.playerChroming.theme === PlayerChromingTheme.Omakase) {
      for (const control of Object.values(OmakaseThemeControl)) {
        if (this.playerChroming.themeConfig?.controlBar?.includes(control)) {
          this.showElements(this.getShadowElementByClass(this.getControlBarClass(control)));
        } else {
          this.hideElements(this.getShadowElementByClass(this.getControlBarClass(control)));
        }
      }
      if (this.playerChroming.themeConfig?.controlBarVisibility === OmakaseControlBarVisibility.Disabled) {
        this._mediaControllerElement.classList.remove('with-control-bar');
      } else {
        this._mediaControllerElement.classList.add('with-control-bar');
      }
      if (this._controlBar) {
        if (this.playerChroming.themeConfig?.progressBarPosition === OmakaseProgressBarPosition.UnderVideo) {
          this._controlBar.classList.add('control-bar-offset');
        } else {
          this._controlBar.classList.remove('control-bar-offset');
        }
      }
      if (this._omakaseControlBar) {
        if (this.playerChroming.themeConfig?.controlBarVisibility === OmakaseControlBarVisibility.AlwaysOn) {
          this._omakaseControlBar.setAttribute('noautohide', '');
        } else {
          this._omakaseControlBar.removeAttribute('noautohide');
        }
        if (this.playerChroming.themeConfig?.controlBarVisibility === OmakaseControlBarVisibility.Disabled) {
          this.hideElements(this._omakaseControlBar);
        } else {
          this.showElements(this._omakaseControlBar);
        }
      }
      if (this._buttonControlBarToggle) {
        if (this.playerChroming.themeConfig?.controlBarVisibility === OmakaseControlBarVisibility.AlwaysOn) {
          this._buttonControlBarToggle.classList.remove('control-bar-enabled', 'control-bar-disabled');
          this._buttonControlBarToggle.classList.add('control-bar-always-on');
        } else if (this.playerChroming.themeConfig?.controlBarVisibility === OmakaseControlBarVisibility.Enabled) {
          this._buttonControlBarToggle.classList.remove('control-bar-always-on', 'control-bar-disabled');
          this._buttonControlBarToggle.classList.add('control-bar-enabled');
        } else {
          this._buttonControlBarToggle.classList.remove('control-bar-enabled', 'control-bar-always-on');
          this._buttonControlBarToggle.classList.add('control-bar-disabled');
        }
      }
    }
  }

  updateBitc() {
    if (this._config.playerChroming.theme === PlayerChromingTheme.Audio || this._config.playerChroming.theme === PlayerChromingTheme.Custom) {
      return;
    }
    this._bitcEnabled = !!(this.playerChroming.themeConfig as any)?.floatingControls?.includes('TIME');
    if (this._buttonBitc) {
      this._buttonBitc.classList.remove(this._bitcEnabled ? this._domClasses.mediaChromeBitcDisabled : this._domClasses.mediaChromeBitcEnabled);
      this._buttonBitc.classList.add(this._bitcEnabled ? this._domClasses.mediaChromeBitcEnabled : this._domClasses.mediaChromeBitcDisabled);
    }
    const timecodeElement = this._divTimecode ?? this._timecodeWrapper;
    if (timecodeElement) {
      if (this._bitcEnabled) {
        this.showElements(timecodeElement);
      } else {
        this.hideElements(timecodeElement);
      }
    }
  }

  private createControlBarDom() {
    if (this._config.playerChroming.theme === PlayerChromingTheme.Custom) {
      if (!this._config.playerChroming.themeConfig?.htmlTemplateId) {
        throw new Error('Must provide template HTMLElementId for custom player chroming theme');
      }
      const mediaChromeTemplate = DomUtil.getElementById<HTMLTemplateElement>(this._config.playerChroming.themeConfig.htmlTemplateId);
      if (!mediaChromeTemplate) {
        throw new Error(`DOM <template> for media chrome template not found. ID provided: ${this._config.playerChroming.themeConfig.htmlTemplateId}`);
      }
      return mediaChromeTemplate.innerHTML;
    }
    if (this._config.playerChroming.theme === PlayerChromingTheme.Chromeless) {
      return `<div class="${this._domClasses.timecodeContainer} d-none" slot="middle-chrome" ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(ChromelessThemeFloatingControl.Time) ? 'noautohide' : ''}>
            <omakase-time-display format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" ${this._config.playerChroming.themeConfig?.timeFormat === 'COUNTDOWN_TIMER' ? 'countdown ' : ''} class="${this._domClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
        </div>`;
    } else if (this._config.playerChroming.theme === PlayerChromingTheme.Default) {
      return `
        <div class="${this._domClasses.timecodeContainer} d-none" slot="middle-chrome" ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(DefaultThemeFloatingControl.Time) ? 'noautohide' : ''}>
            <omakase-time-display format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" ${this._config.playerChroming.themeConfig?.timeFormat === 'COUNTDOWN_TIMER' ? 'countdown ' : ''} class="${this._domClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
        </div>
        <media-control-bar class="upper-control-bar">
            <omakase-marker-bar></omakase-marker-bar>
              <omakase-time-range class="${this.getControlBarClass(DefaultThemeControl.Scrubber)}">
                  <div slot="preview" class="${this._domClasses.mediaChromePreviewWrapper}">
                      <omakase-preview-thumbnail class="${this._domClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
                      <omakase-time-display format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" ${this._config.playerChroming.themeConfig?.timeFormat === 'COUNTDOWN_TIMER' ? 'countdown ' : ''} class="${this._domClasses.mediaChromePreviewTimecode}"></omakase-time-display>
                  </div>
              </omakase-time-range>
            ${
              this._config.playerChroming.themeConfig?.playbackRates
                ? `<omakase-dropdown  id="speed-dropdown-${this._config.playerHTMLElementId}" align="center">
                    <omakase-dropdown-list id="speed-dropdown-list-${this._config.playerHTMLElementId}" title="SPEED" width="76">
                    ${this._config.playerChroming.themeConfig.playbackRates
                      .map((rate) => {
                        if (rate === 1) return `<omakase-dropdown-option selected value="${rate}">${rate}x</omakase-dropdown-option>`;
                        else return `<omakase-dropdown-option value="${rate}">${rate}x</omakase-dropdown-option>`;
                      })
                      .join('\n')}
                    </omakase-dropdown-list>
                </omakase-dropdown>`
                : ''
            }
            <slot name="dropdown-container"></slot>
            ${this.createAudioTextDropdownDom('bottom')}
        </media-control-bar>
        <media-control-bar class="lower-control-bar">
            <div class="start-container">
                <div class="volume-container ${this.getControlBarClass(DefaultThemeControl.Volume)}">
                    <omakase-mute-button class="${this._domClasses.mediaChromeButton} omakase-player-mute">
                    <span slot="high" class="${this._domClasses.mediaChromeAudioHigh}"></span>
                    <span slot="medium" class="${this._domClasses.mediaChromeAudioMedium}"></span>
                    <span slot="low" class="${this._domClasses.mediaChromeAudioLow}"></span>
                    <span slot="off" class="${this._domClasses.mediaChromeAudioMute}"></span>
                    </omakase-mute-button>
                    <omakase-volume-range></omakase-volume-range>
                </div>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.Captions)} ${this._domClasses.mediaChromeButton} omakase-player-text-toggle">
                    <span class="${this._domClasses.mediaChromeTextOn} disabled"></span>
                </media-chrome-button>
                <omakase-dropdown-toggle class="${this.getControlBarClass(DefaultThemeControl.PlaybackRate)}" dropdown="speed-dropdown-${this._config.playerHTMLElementId}"></omakase-dropdown-toggle>
                <slot name="start-container"></slot>
            </div>
            <div class="center-container">
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.TenFramesBackward)} ${this._domClasses.mediaChromeButton} omakase-player-ten-frames-backwards">
                    <span class="${this._domClasses.mediaFastRewindButton}"></span>
                    <media-tooltip>Rewind by 10 frames</media-tooltip>
                </media-chrome-button>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.FrameBackward)} ${this._domClasses.mediaChromeButton} omakase-player-frame-backwards">
                    <span class="${this._domClasses.mediaRewindButton}"></span>
                    <media-tooltip>Rewind to previous frame</media-tooltip>
                </media-chrome-button>
                <omakase-play-button class="${this.getControlBarClass(DefaultThemeControl.Play)} ${this._domClasses.mediaChromeButton} omakase-player-play">
                    <span slot="play" class="${this._domClasses.mediaChromePlay}"></span>
                    <span slot="pause" class="${this._domClasses.mediaChromePause}"></span>
                </omakase-play-button>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.FrameForward)} ${this._domClasses.mediaChromeButton} omakase-player-frame-forward">
                    <span class="${this._domClasses.mediaForwardButton}"></span>
                    <media-tooltip>Fast forward to next frame</media-tooltip>
                </media-chrome-button>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.TenFramesForward)} ${this._domClasses.mediaChromeButton} omakase-player-ten-frames-forward">
                    <span class="${this._domClasses.mediaFastForwardButton}"></span>
                    <media-tooltip>Fast forward by 10 frames</media-tooltip>
                </media-chrome-button>
            </div>
            <div class="end-container">
                <slot name="end-container"></slot>
                <omakase-dropdown-toggle class="${this.getControlBarClass(DefaultThemeControl.Trackselector)}" id="audio-dropdown-toggle-${this._config.playerHTMLElementId}" dropdown="audio-dropdown-${this._config.playerHTMLElementId}">
                    <media-chrome-button class="${this._domClasses.mediaChromeButton} omakase-player-audio-text">
                    <span class="${this._domClasses.mediaChromeAudioText}"></span>
                    </media-chrome-button>
                </omakase-dropdown-toggle>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.Bitc)} ${this._domClasses.mediaChromeButton} omakase-player-bitc">
                    <span class="${this._domClasses.mediaChromeBitcDisabled}"></span>
                    <media-tooltip class="${this._domClasses.mediaChromeBitcTooltip}">Show timecode</media-tooltip>
                </media-chrome-button>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.Detach)} ${this._domClasses.mediaChromeButton} omakase-player-attach-detach">
                    <span class="${this._config.detachedPlayer ? this._domClasses.mediaChromeAttach : this._domClasses.mediaChromeDetach}"></span>
                    <media-tooltip>${this._config.detachedPlayer ? 'Attach player' : 'Detach player'}</media-tooltip>
                </media-chrome-button>
                <omakase-fullscreen-button class="${this.getControlBarClass(DefaultThemeControl.Fullscreen)} ${this._domClasses.mediaChromeButton} omakase-player-fullscreen">
                    <span slot="enter" class="${this._domClasses.mediaChromeFullscreenEnter}"></span>
                    <span slot="exit" class="${this._domClasses.mediaChromeFullscreenExit}"></span>
                </omakase-fullscreen-button>
            </div>
        </media-control-bar>`;
    } else if (this._config.playerChroming.theme === PlayerChromingTheme.Audio) {
      return `
        ${
          this._config.playerChroming.themeConfig?.visualization !== AudioVisualization.Disabled
            ? `<omakase-audio-visualization fill="${this._config.playerChroming.themeConfig?.visualizationConfig?.fillColors.join(' ')}" stroke="${this._config.playerChroming.themeConfig?.visualizationConfig?.strokeColor}" noautohide></omakase-audio-visualization>`
            : ''
        }
        <div class="${this._domClasses.captions}" noautohide></div>
        <media-control-bar class="upper-control-bar" noautohide>
            <omakase-marker-bar></omakase-marker-bar>
            <omakase-time-range class="${this.getControlBarClass(AudioThemeControl.Scrubber)}">
                <div slot="preview" class="${this._domClasses.mediaChromePreviewWrapper}">
                    <omakase-preview-thumbnail class="${this._domClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
                    <omakase-time-display format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" ${this._config.playerChroming.themeConfig?.timeFormat === 'COUNTDOWN_TIMER' ? 'countdown ' : ''} class="${this._domClasses.mediaChromePreviewTimecode}"></omakase-time-display>
                </div>
            </omakase-time-range>
            ${
              this._config.playerChroming.themeConfig?.playbackRates
                ? `<omakase-dropdown id="speed-dropdown-${this._config.playerHTMLElementId}" alignment="center">
                    <omakase-dropdown-list id="speed-dropdown-list-${this._config.playerHTMLElementId}" title="SPEED" width="76">
                    ${this._config.playerChroming.themeConfig.playbackRates
                      .map((rate) => {
                        if (rate === 1) return `<omakase-dropdown-option selected value="${rate}">${rate}x</omakase-dropdown-option>`;
                        else return `<omakase-dropdown-option value="${rate}">${rate}x</omakase-dropdown-option>`;
                      })
                      .join('\n')}
                    </omakase-dropdown-list>
                </omakase-dropdown>`
                : ''
            }
            <slot name="dropdown-container"></slot>
            ${this.createAudioTextDropdownDom('bottom')}
        </media-control-bar>
        <media-control-bar class="lower-control-bar" noautohide>
            <div class="start-container">
                <div class="volume-container ${this.getControlBarClass(AudioThemeControl.Volume)}">
                    <omakase-mute-button class="${this._domClasses.mediaChromeButton} omakase-player-mute">
                    <span slot="high" class="${this._domClasses.mediaChromeAudioHigh}"></span>
                    <span slot="medium" class="${this._domClasses.mediaChromeAudioMedium}"></span>
                    <span slot="low" class="${this._domClasses.mediaChromeAudioLow}"></span>
                    <span slot="off" class="${this._domClasses.mediaChromeAudioMute}"></span>
                    </omakase-mute-button>
                    <omakase-volume-range></omakase-volume-range>
                </div>
                <omakase-dropdown-toggle class="${this.getControlBarClass(AudioThemeControl.PlaybackRate)}" dropdown="speed-dropdown-${this._config.playerHTMLElementId}"></omakase-dropdown-toggle>
                <slot name="start-container"></slot>
            </div>
            <div class="center-container">
                <omakase-play-button class="${this.getControlBarClass(AudioThemeControl.Play)} ${this._domClasses.mediaChromeButton} omakase-player-play">
                    <span slot="play" class="${this._domClasses.mediaChromePlay}"></span>
                    <span slot="pause" class="${this._domClasses.mediaChromePause}"></span>
                </omakase-play-button>
            </div>
            <div class="end-container">
                <slot name="end-container"></slot>
                <div class="${this.getControlBarClass(AudioThemeControl.Time)} ${this._domClasses.timecodeWrapper}">
                  <omakase-time-display format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" ${this._config.playerChroming.themeConfig?.timeFormat === 'COUNTDOWN_TIMER' ? 'countdown ' : ''} class="${this._domClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
                </div>
                <omakase-dropdown-toggle class="${this.getControlBarClass(AudioThemeControl.Trackselector)}" id="audio-dropdown-toggle-${this._config.playerHTMLElementId}" dropdown="audio-dropdown-${this._config.playerHTMLElementId}">
                    <media-chrome-button class="${this._domClasses.mediaChromeButton} omakase-player-audio-text">
                        <span class="${this._domClasses.mediaChromeAudio}"></span>
                    </media-chrome-button>
                </omakase-dropdown-toggle>
            </div>
        </media-control-bar>`;
    } else if (this._config.playerChroming.theme === PlayerChromingTheme.Stamp) {
      return `
        <div class="omakase-action-icons d-none ${this._domClasses.sectionTopRight}" ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(StampThemeFloatingControl.ActionIcons) ? 'noautohide' : ''}>
            ${
              this._config.playerChroming.themeConfig?.floatingControls?.includes(StampThemeFloatingControl.ActionIcons) &&
              this._config.playerChroming.themeConfig?.actionIcons?.includes(StampThemeActionIcon.AudioToggle)
                ? `<omakase-mute-button class="shadow">
                    <div slot="off" class="stamp-audio-toggle stamp-audio-off"></div>
                    <div slot="low" class="stamp-audio-toggle stamp-audio-on"></div>
                    <div slot="medium" class="stamp-audio-toggle stamp-audio-on"></div>
                    <div slot="high" class="stamp-audio-toggle stamp-audio-on"></div>
                  </omakase-mute-button>`
                : ''
            }
            ${
              this._config.playerChroming.themeConfig?.floatingControls?.includes(StampThemeFloatingControl.ActionIcons) &&
              this._config.playerChroming.themeConfig?.actionIcons?.includes(StampThemeActionIcon.Fullscreen)
                ? `<omakase-fullscreen-button class="${this._domClasses.mediaChromeButton} omakase-player-fullscreen shadow">
                      <span slot="enter" class="${this._domClasses.mediaChromeFullscreenEnter}"></span>
                      <span slot="exit" class="${this._domClasses.mediaChromeFullscreenExit}"></span>
                  </omakase-fullscreen-button>`
                : ''
            }
            <slot name="top-right"></slot>
        </div>
        ${
          this._config.playerChroming.themeConfig?.floatingControls?.includes(StampThemeFloatingControl.PlaybackControls)
            ? `<div slot="centered-chrome" class="omakase-overlay-buttons-wrapper" ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(StampThemeFloatingControl.PlaybackControls) ? 'noautohide' : ''}>
                <div class="omakase-overlay-buttons">
                    <div class="${this._domClasses.buttonOverlayAttach} omakase-video-overlay-button shadow"></div>
                    <div class="${this._domClasses.buttonOverlayPlay} omakase-video-overlay-button shadow d-none"></div>
                    <div class="${this._domClasses.buttonOverlayPause} omakase-video-overlay-button shadow d-none"></div>
                    <div class="${this._domClasses.buttonOverlayReplay} omakase-video-overlay-button shadow d-none"></div>
                </div>
            </div>
            <div slot="centered-chrome" class="omakase-overlay-buttons-wrapper" noautohide>
                <div class="omakase-overlay-buttons">
                    <div class="omakase-loading-wrapper shadow">
                        <div class="${this._domClasses.buttonOverlayLoading} omakase-video-overlay-button d-none"></div>
                    </div>
                    <div class="${this._domClasses.buttonOverlayError} omakase-video-overlay-button shadow d-none"></div>
                </div>
            </div>`
            : ''
        }
        ${
          this._config.playerChroming.themeConfig?.floatingControls?.includes(StampThemeFloatingControl.Time)
            ? `<div slot="centered-chrome" ${
                this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(StampThemeFloatingControl.Time) ? 'noautohide' : ''
              } class="${this._domClasses.timecodeWrapper} omakase-timecode-format-${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'} omakase-timecode-${
                this._config.playerChroming.themeConfig?.floatingControls?.includes(StampThemeFloatingControl.ProgressBar) ? 'with' : 'without'
              }-progress-bar">
                <omakase-time-display class="${this._domClasses.mediaChromeCurrentTimecode}" showduration format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" ${this._config.playerChroming.themeConfig.timeFormat === 'COUNTDOWN_TIMER' ? 'countdown ' : ''}></omakase-time-display>
            </div>`
            : ''
        }
        <div class="${this._domClasses.captions} ${this._domClasses.captions}-${this._config.playerChroming.themeConfig?.floatingControls?.includes(StampThemeFloatingControl.ProgressBar) ? 'with' : 'without'}-progress-bar" noautohide></div>
        <media-control-bar class="${this._domClasses.mediaControlBar}" ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(StampThemeFloatingControl.ProgressBar) ? 'noautohide' : ''}>
        ${
          this._config.playerChroming.themeConfig?.floatingControls?.includes(StampThemeFloatingControl.ProgressBar)
            ? `<omakase-time-range>
                <div slot="preview"></div>
            </omakase-time-range>`
            : ''
        }
        </media-control-bar>`;
    } else if (this._config.playerChroming.theme === PlayerChromingTheme.Omakase) {
      return `
        <div class="omakase-action-icons d-none ${this._domClasses.sectionTopRight}" ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(OmakaseThemeFloatingControl.ActionIcons) ? 'noautohide' : ''}>
          ${
            this._config.playerChroming.themeConfig?.floatingControls?.includes(OmakaseThemeFloatingControl.ActionIcons) &&
            this._config.playerChroming?.themeConfig?.actionIcons?.includes(OmakaseThemeActionIcon.HelpMenu)
              ? `<div class="${this._domClasses.help}">
                  <media-chrome-button class="${this._domClasses.mediaChromeButton} omakase-player-help-toggle shadow">
                    <span class="${this._domClasses.mediaChromeHelp}"></span>
                  </media-chrome-button>
                  <div class="omakase-help-dropdown">
                    <div class="${this._domClasses.helpMenu} d-none"></div>
                  </div>
                </div>`
              : ''
          }
          ${
            this._config.playerChroming.themeConfig?.floatingControls?.includes(OmakaseThemeFloatingControl.ActionIcons) &&
            this._config.playerChroming?.themeConfig?.actionIcons?.includes(OmakaseThemeActionIcon.Fullscreen)
              ? `<omakase-fullscreen-button class="${this._domClasses.mediaChromeButton} omakase-player-fullscreen shadow">
                  <span slot="enter" class="${this._domClasses.mediaChromeFullscreenEnter}"></span>
                  <span slot="exit" class="${this._domClasses.mediaChromeFullscreenExit}"></span>
                </omakase-fullscreen-button>`
              : ''
          }
          ${
            this._config.playerChroming.themeConfig?.floatingControls?.includes(OmakaseThemeFloatingControl.ActionIcons) &&
            this._config.playerChroming?.themeConfig?.actionIcons?.includes(OmakaseThemeActionIcon.ControlBarToggle)
              ? `<media-chrome-button class="${this._domClasses.mediaChromeButton} omakase-player-control-bar-toggle shadow">
                  <span class="${this._domClasses.mediaChromeControlBarToggle} control-bar-enabled"></span>
                </media-chrome-button>`
              : ''
          }
          ${
            this._config.playerChroming.themeConfig?.floatingControls?.includes(OmakaseThemeFloatingControl.ActionIcons) &&
            (this._config.playerChroming?.themeConfig?.actionIcons?.includes(OmakaseThemeActionIcon.AudioToggle) ||
              this._config.playerChroming.themeConfig?.actionIcons?.includes(OmakaseThemeActionIcon.Volume))
              ? `<div class="volume-container">
                    ${this._config.playerChroming?.themeConfig?.actionIcons?.includes(OmakaseThemeActionIcon.Volume) ? `<omakase-volume-range></omakase-volume-range>` : ''}
                    <omakase-mute-button class="${this._domClasses.mediaChromeButton} shadow">
                      <div slot="off" class="omakase-audio-toggle omakase-audio-off"></div>
                      <div slot="low" class="omakase-audio-toggle omakase-audio-on"></div>
                      <div slot="medium" class="omakase-audio-toggle omakase-audio-on"></div>
                      <div slot="high" class="omakase-audio-toggle omakase-audio-on"></div>
                    </omakase-mute-button>
                </div>`
              : ''
          }
          <slot name="top-right"></slot>
        </div>
        ${
          this._config.playerChroming.themeConfig?.floatingControls?.includes(OmakaseThemeFloatingControl.Time)
            ? `<div ${
                this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(OmakaseThemeFloatingControl.Time) ? 'noautohide' : ''
              } class="${this._domClasses.timecodeWrapper} omakase-timecode-format-${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}">
                  <omakase-time-display class="${this._domClasses.mediaChromeCurrentTimecode}" showduration format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" ${this._config.playerChroming.themeConfig.timeFormat === 'COUNTDOWN_TIMER' ? 'countdown ' : ''}></omakase-time-display>
              </div>`
            : ''
        }
        ${
          this._config.playerChroming.themeConfig?.floatingControls?.includes(OmakaseThemeFloatingControl.PlaybackControls)
            ? `<div slot="centered-chrome" class="omakase-overlay-buttons-wrapper" ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(OmakaseThemeFloatingControl.PlaybackControls) ? 'noautohide' : ''}>
                <div class="omakase-overlay-buttons">
                    <div class="${this._domClasses.buttonOverlayAttach} omakase-video-overlay-button shadow"></div>
                    <div class="${this._domClasses.buttonOverlayPlay} omakase-video-overlay-button shadow d-none"></div>
                    <div class="${this._domClasses.buttonOverlayPause} omakase-video-overlay-button shadow d-none"></div>
                    <div class="${this._domClasses.buttonOverlayReplay} omakase-video-overlay-button shadow d-none"></div>
                </div>
            </div>
            <div slot="centered-chrome" class="omakase-overlay-buttons-wrapper" noautohide>
                <div class="omakase-overlay-buttons">
                    <div class="${this._domClasses.buttonOverlayLoading} omakase-video-overlay-button shadow d-none"></div>
                    <div class="${this._domClasses.buttonOverlayError} omakase-video-overlay-button shadow d-none"></div>
                </div>
            </div>`
            : ''
        }
        <media-control-bar 
          class="${this._domClasses.mediaControlBar} ${this._config.playerChroming.themeConfig?.progressBarPosition === OmakaseProgressBarPosition.UnderVideo ? 'control-bar-offset' : ''}" 
          ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes(OmakaseThemeFloatingControl.ProgressBar) ? 'noautohide' : ''}>
            <omakase-marker-bar omakase></omakase-marker-bar>
            ${
              this._config.playerChroming.themeConfig?.floatingControls?.includes(OmakaseThemeFloatingControl.ProgressBar)
                ? `<omakase-time-range omakase>
                    <div slot="preview" class="${this._domClasses.mediaChromePreviewWrapper}">
                      <omakase-preview-thumbnail class="${this._domClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
                      <omakase-time-display format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" ${this._config.playerChroming.themeConfig?.timeFormat === 'COUNTDOWN_TIMER' ? 'countdown ' : ''} class="${this._domClasses.mediaChromePreviewTimecode}"></omakase-time-display>
                    </div>
                </omakase-time-range>`
                : ''
            }
        </media-control-bar>
        <div class="${this._domClasses.omakaseControlBar}" ${this._config.playerChroming.themeConfig?.controlBarVisibility === OmakaseControlBarVisibility.AlwaysOn ? 'noautohide' : ''}>
          <div class="omakase-control-bar-upper">
            ${
              this._config.playerChroming.themeConfig?.playbackRates
                ? `<omakase-dropdown  id="speed-dropdown-${this._config.playerHTMLElementId}" alignment="center">
                      <omakase-dropdown-list id="speed-dropdown-list-${this._config.playerHTMLElementId}" title="SPEED" width="76">
                      ${this._config.playerChroming.themeConfig.playbackRates
                        .map((rate) => {
                          if (rate === 1) return `<omakase-dropdown-option selected value="${rate}">${rate}x</omakase-dropdown-option>`;
                          else return `<omakase-dropdown-option value="${rate}">${rate}x</omakase-dropdown-option>`;
                        })
                        .join('\n')}
                      </omakase-dropdown-list>
                  </omakase-dropdown>`
                : ''
            }
            ${this.createAudioTextDropdownDom('bottom')}
            <div class="start-container">
              <div class="volume-container ${this.getControlBarClass(OmakaseThemeControl.Volume)}">
                  <omakase-mute-button class="${this._domClasses.mediaChromeButton} omakase-player-mute">
                  <span slot="high" class="${this._domClasses.mediaChromeAudioHigh}"></span>
                  <span slot="medium" class="${this._domClasses.mediaChromeAudioMedium}"></span>
                  <span slot="low" class="${this._domClasses.mediaChromeAudioLow}"></span>
                  <span slot="off" class="${this._domClasses.mediaChromeAudioMute}"></span>
                  </omakase-mute-button>
                  <omakase-volume-range></omakase-volume-range>
              </div>
              <omakase-dropdown-toggle class="omakase-player-playback-rate-toggle ${this.getControlBarClass(OmakaseThemeControl.PlaybackRate)}" dropdown="speed-dropdown-${this._config.playerHTMLElementId}"></omakase-dropdown-toggle>
            </div>
            <div class="center-container">
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.TenFramesBackward)} ${this._domClasses.mediaChromeButton} omakase-player-ten-frames-backwards">
                  <span class="${this._domClasses.mediaFastRewindButton}"></span>
                  <media-tooltip>Rewind by 10 frames</media-tooltip>
              </media-chrome-button>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.FrameBackward)} ${this._domClasses.mediaChromeButton} omakase-player-frame-backwards">
                  <span class="${this._domClasses.mediaRewindButton}"></span>
                  <media-tooltip>Rewind to previous frame</media-tooltip>
              </media-chrome-button>
              <omakase-play-button class="${this.getControlBarClass(OmakaseThemeControl.Play)} ${this._domClasses.mediaChromeButton} omakase-player-play">
                  <span slot="play" class="${this._domClasses.mediaChromePlay}"></span>
                  <span slot="pause" class="${this._domClasses.mediaChromePause}"></span>
              </omakase-play-button>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.FrameForward)} ${this._domClasses.mediaChromeButton} omakase-player-frame-forward">
                  <span class="${this._domClasses.mediaForwardButton}"></span>
                  <media-tooltip>Fast forward to next frame</media-tooltip>
              </media-chrome-button>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.TenFramesForward)} ${this._domClasses.mediaChromeButton} omakase-player-ten-frames-forward">
                  <span class="${this._domClasses.mediaFastForwardButton}"></span>
                  <media-tooltip>Fast forward by 10 frames</media-tooltip>
              </media-chrome-button>
            </div>
            <div class="end-container">
              <slot name="end-container"></slot>
              <omakase-dropdown-toggle id="audio-dropdown-toggle-${this._config.playerHTMLElementId}" dropdown="audio-dropdown-${this._config.playerHTMLElementId}" class="${this.getControlBarClass(OmakaseThemeControl.Trackselector)} ${this._domClasses.mediaChromeButton} omakase-player-trackselector">
                  <span class="${this._domClasses.mediaChromeTrackselector}"></span>
                  <media-tooltip>Select track</media-tooltip>
              </omakase-dropdown-toggle>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.Detach)} ${this._domClasses.mediaChromeButton} omakase-player-detach">
                  <span class="${this._config.detachedPlayer ? this._domClasses.mediaChromeAttach : this._domClasses.mediaChromeDetach}"></span>
                  <media-tooltip>Select track</media-tooltip>
              </media-chrome-button>
              <omakase-fullscreen-button class="${this.getControlBarClass(OmakaseThemeControl.Fullscreen)} ${this._domClasses.mediaChromeButton} omakase-player-fullscreen">
                  <span slot="enter" class="${this._domClasses.mediaChromeFullscreenEnter}"></span>
                  <span slot="exit" class="${this._domClasses.mediaChromeFullscreenExit}"></span>
              </omakase-fullscreen-button>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.Close)} ${this._domClasses.mediaChromeButton} omakase-player-close">
                  <span class="${this._domClasses.mediaChromeClose}"></span>
                  <media-tooltip>Select track</media-tooltip>
              </media-chrome-button>
            </div>
          </div>
          <div class="omakase-control-bar-lower">
            <omakase-time-display withduration format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" class="${this._domClasses.mediaChromeTimeDuration}"></omakase-time-display>
          </div>
        </div>
        `;
    } else {
      return '';
    }
  }

  private createAudioTextDropdownDom = (placement: 'top' | 'bottom') => {
    return `
    <omakase-dropdown class="${this._domClasses.audioTextDropdown} ${this._domClasses.audioTextDropdown}-${placement}" ${this._config.playerChroming.theme === 'DEFAULT' && this._config.playerChroming.themeConfig?.trackSelectorAutoClose === false ? 'floating ' : ''} id="audio-dropdown-${this._config.playerHTMLElementId}" style="display:none;${placement === 'top' ? `right:${this.getAudioTextRightOffset()}` : ''}">
        ${
          this._config.playerChroming.theme !== PlayerChromingTheme.Audio
            ? `
            <omakase-dropdown-list id="audio-dropdown-list-${this._config.playerHTMLElementId}" class="align-left" title="AUDIO" width="125" type="radio"></omakase-dropdown-list>
            <omakase-dropdown-list id="sidecar-dropdown-list-${this._config.playerHTMLElementId}" multiselect="true" class="d-none align-left" title="SIDECAR AUDIO" width="125" type="checkbox"></omakase-dropdown-list>`
            : ''
        }
        <omakase-dropdown-list id="text-dropdown-list-${this._config.playerHTMLElementId}" class="d-none align-left" title="TEXT" width="125" type="radio"></omakase-dropdown-list>
    </omakase-dropdown>`;
  };

  private alignAudioTextDropdown(alignment: 'left' | 'right') {
    if (alignment === 'right') {
      this._audioDropdown!.style.removeProperty('left');
      this._audioDropdown!.style.right = this.getAudioTextRightOffset();
    } else {
      this._audioDropdown!.style.removeProperty('right');
      this._audioDropdown!.style.left = this._audioDropdownToggle!.offsetLeft + 'px';
    }
  }

  private getAudioTextRightOffset() {
    return this._config.playerChroming.theme === PlayerChromingTheme.Omakase ? '-1px' : '20px';
  }

  private getVisibilityClass() {
    if (this._config.playerChroming.theme !== PlayerChromingTheme.Default && this._config.playerChroming.theme !== PlayerChromingTheme.Audio) {
      return 'enabled';
    }
    switch (this._config.playerChroming.themeConfig?.controlBarVisibility) {
      case ControlBarVisibility.Disabled:
        return 'disabled';
      case ControlBarVisibility.Enabled:
        return 'enabled';
      case ControlBarVisibility.FullscreenOnly:
        return 'fullscreen-only';
      default:
        return 'disabled';
    }
  }

  getShadowElement<T>(querySelector: string): T {
    return this._themeElement.shadowRoot?.querySelector(querySelector) as T;
  }

  getShadowElements<T>(querySelector: string): T[] | undefined {
    return this._themeElement.shadowRoot?.querySelectorAll(querySelector) as T[] | undefined;
  }

  getShadowElementByClass<T>(className: string): T {
    return this._themeElement.shadowRoot?.querySelector(`.${className}`) as T;
  }

  getShadowElementById<T>(id: string): T {
    return this._themeElement.shadowRoot?.querySelector(`#${id}`) as T;
  }

  loadThumbnailVtt(vttUrl: string) {
    return passiveObservable((observer) => {
      const options: VttLoadOptions = {};
      if (AuthConfig.authentication) {
        options.axiosConfig = AuthConfig.createAxiosRequestConfig(vttUrl, AuthConfig.authentication);
      }
      this._vttAdapter.loadVtt(vttUrl, options).subscribe((vttFile) => {
        if (vttFile && this._previewThumbnail) {
          this._previewThumbnail.vttFile = vttFile;
          if (this._previewWrapper) {
            this._previewWrapper.classList.add('with-thumbnail');
          }
          nextCompleteObserver(observer);
        }
      });
    });
  }

  attachVideoController(videoController: VideoControllerApi) {
    nextCompleteSubject(this._videoEventBreaker$);
    this._videoEventBreaker$ = new Subject<void>();

    this._videoController = videoController;

    if (this._currentTimecode) {
      this._currentTimecode.video = this._videoController;
    }

    if (this._previewTimecode) {
      this._previewTimecode.video = this._videoController;
      this._previewTimecode.timeRange = this._timeRangeControl!;
    }

    if (this._timeDuration) {
      this._timeDuration.video = this._videoController;
    }

    if (this._previewThumbnail) {
      this._previewThumbnail.timeRange = this._timeRangeControl!;
      this._previewThumbnail.thumbnailFn = this._config.playerChroming.thumbnailSelectionFn;
    }

    if (this._audioVisualization) {
      this._audioVisualization.attachVideoController(videoController);
    }

    if (this._buttonPlay) {
      this._buttonPlay.videoController = this._videoController;
    }

    if (!videoController.isDetachable() && this._buttonDetach) {
      if (this._videoController.isPiPSupported()) {
        this._videoController.getHTMLVideoElement().addEventListener(HTMLVideoElementEvents.ENTERPIP, this._enterPictureInPictureHandler);
        this._videoController.getHTMLVideoElement().addEventListener(HTMLVideoElementEvents.LEAVEPIP, this._leavePictureInPictureHandler);
      } else {
        this.hideElements(this._buttonDetach);
      }
    }

    if (this._buttonBitc) {
      fromEvent<MouseEvent>(this._buttonBitc, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            this._bitcEnabled = !this._bitcEnabled;
            if (this._bitcEnabled) {
              this.showElements(this._divTimecode!);
            } else {
              this.hideElements(this._divTimecode!);
            }
            this._buttonBitc!.classList.remove(this._bitcEnabled ? this._domClasses.mediaChromeBitcDisabled : this._domClasses.mediaChromeBitcEnabled);
            this._buttonBitc!.classList.add(this._bitcEnabled ? this._domClasses.mediaChromeBitcEnabled : this._domClasses.mediaChromeBitcDisabled);
            this._tooltipBitc!.innerHTML = this._bitcEnabled ? 'Hide timecode' : 'Show timecode';
          },
        });
    }

    if (this._buttonDetach) {
      fromEvent<MouseEvent>(this._buttonDetach, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            if (this._videoController.isDetachable()) {
              this._videoController.detachVideoWindow();
            } else {
              this.togglePIP();
            }
          },
        });
    }
    if (this._buttonAttach) {
      fromEvent<MouseEvent>(this._buttonAttach, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            if (this._videoController.canAttach()) {
              this._videoController.attachVideoWindow();
            }
          },
        });
    }

    if (this._buttonForward) {
      fromEvent<MouseEvent>(this._buttonForward, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            this._videoController.pause().subscribe(() => {
              this._videoController.seekNextFrame();
            });
          },
        });
    }
    if (this._buttonRewind) {
      fromEvent<MouseEvent>(this._buttonRewind, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            this._videoController.pause().subscribe(() => {
              this._videoController.seekPreviousFrame();
            });
          },
        });
    }
    if (this._buttonFastForward) {
      fromEvent<MouseEvent>(this._buttonFastForward, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            this._videoController.pause().subscribe(() => {
              this._videoController.seekFromCurrentFrame(10);
            });
          },
        });
    }
    if (this._buttonFastRewind) {
      fromEvent<MouseEvent>(this._buttonFastRewind, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            this._videoController.pause().subscribe(() => {
              this._videoController.seekFromCurrentFrame(-10);
            });
          },
        });
    }
    if (this._timeRangeControl) {
      this._timeRangeControl.onSeek$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
        next: (time) => {
          this._videoController.seekToTime(time);
        },
      });
    }

    if (this._volumeRangeControls) {
      for (const control of this._volumeRangeControls) {
        control.videoController = this._videoController;
      }
    }

    if (this._muteButtons) {
      for (const button of this._muteButtons) {
        button.videoController = this._videoController;
      }
    }
    if (this._textButton) {
      fromEvent<MouseEvent>(this._textButton, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: () => {
            const activeSubtitlesTrack = this._videoController.getActiveSubtitlesTrack();
            if (activeSubtitlesTrack) {
              if (activeSubtitlesTrack.hidden) {
                this._videoController.showSubtitlesTrack(activeSubtitlesTrack.id);
              } else {
                this._videoController.hideSubtitlesTrack(activeSubtitlesTrack.id);
              }
            }
          },
        });
      this._videoController.onSubtitlesShow$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
        next: () => {
          this._textButton!.classList.remove('disabled', this._domClasses.mediaChromeTextOff);
          this._textButton!.classList.add(this._domClasses.mediaChromeTextOn);
        },
      });
      this._videoController.onSubtitlesHide$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
        next: () => {
          this._textButton!.classList.remove(this._domClasses.mediaChromeTextOn);
          this._textButton!.classList.add(this._domClasses.mediaChromeTextOff);
        },
      });
    }
    if (this._speedDropdownList) {
      this._speedDropdownList.selectedOption$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
        next: (speedOption) => {
          if (speedOption && parseFloat(speedOption.value) !== this._videoController.getPlaybackRate()) {
            this._videoController.setPlaybackRate(parseFloat(speedOption.value));
          }
        },
      });
      this._videoController.onPlaybackRateChange$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
        next: (event) => {
          if (event.playbackRate !== this._speedDropdownList?.selectedOption$.getValue()?.value) {
            this._speedDropdownList?.selectedOption$.next({
              value: event.playbackRate.toString(),
              label: `${event.playbackRate}x`,
            });
          }
        },
      });
    }
    if (this._audioDropdownList && this._sidecarDropdownList) {
      merge(
        this._videoController.onVideoWindowPlaybackStateChange$.pipe(filter((p) => p.videoWindowPlaybackState === 'attached')),

        this._videoController.onVideoLoaded$.pipe(filter((p) => !!p)),

        this._videoController.onAudioLoaded$.pipe(filter((p) => !!p)),
        this._videoController.onAudioUpdated$,

        this._videoController.onSidecarAudioCreate$,
        this._videoController.onSidecarAudioRemove$,

        this._videoController.onAudioSwitched$,
        this._videoController.onMainAudioChange$,
        this._videoController.onSidecarAudioChange$
      )
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: () => {
            if (this._videoController.getVideoWindowPlaybackState() === 'attached' && this._videoController.isVideoLoaded()) {
              if (this._videoController.getConfig().audioPlayMode === 'single') {
                this._audioDropdownList!.setOptions(this.getUnifiedAudioOptions());
                this._sidecarDropdownList!.setOptions([]);

                this.hideElements(this._sidecarDropdownList!);

                if (
                  this._audioDropdown &&
                  this._textDropdownList &&
                  !this.isShown(this._textDropdownList) &&
                  !(this._config.playerChroming.theme === PlayerChromingTheme.Default && this._config.playerChroming.themeConfig?.floatingControls?.includes(DefaultThemeFloatingControl.Trackselector))
                ) {
                  this.alignAudioTextDropdown('left');
                }
                this._audioDropdownList?.setAttribute('type', 'radio');
                this._textDropdownList?.setAttribute('type', 'radio');
                this._audioDropdownList?.setTitle('AUDIO');
              }

              if (this._videoController.getConfig().audioPlayMode === 'multiple') {
                this._audioDropdownList!.setOptions(this.getMainAudioOptions());
                this._sidecarDropdownList!.setOptions(this.getSidecarOptions());

                if (this._videoController.getSidecarAudios().length > 0) {
                  this.showElements(this._sidecarDropdownList!);
                } else {
                  this.hideElements(this._sidecarDropdownList!);
                }

                this.alignAudioTextDropdown('right');
                this._audioDropdownList?.setAttribute('type', 'checkbox');
                this._textDropdownList?.setAttribute('type', 'checkbox');
                this._audioDropdownList?.setTitle('MAIN AUDIO');
              }
            }
          },
        });

      merge(this._audioDropdownList.selectedOption$, this._sidecarDropdownList.selectedOption$)
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .pipe(filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached'))
        .subscribe({
          next: (audioOption) => {
            if (audioOption) {
              let mainAudioTrack = this._videoController.getAudioTracks().find((p) => p.id === audioOption.value);
              let sidecarAudioTrack = this._videoController.getSidecarAudioTracks().find((p) => p.id === audioOption.value);

              if (mainAudioTrack) {
                if (audioOption.active) {
                  this._videoController.deactivateMainAudio();
                } else {
                  this._videoController.setActiveAudioTrack(mainAudioTrack.id);
                }
              } else if (sidecarAudioTrack) {
                if (audioOption.active) {
                  this._videoController.deactivateSidecarAudioTracks([sidecarAudioTrack.id]);
                } else {
                  this._videoController.activateSidecarAudioTracks([sidecarAudioTrack.id]);
                }
              }
            }
          },
        });
    }

    if (this._captionsRenderer) {
      merge(this._videoController.onSubtitlesShow$, this._videoController.onSubtitlesHide$)
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe((event) => {
          if (event.currentTrack && !event.currentTrack.hidden) {
            this.showCaptions(event.currentTrack);
          } else {
            this.hideCaptions();
          }
        });
      this._videoController.onVideoTimeChange$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe((event) => {
        this._captionsRenderer!.currentTime = event.currentTime;
      });
    }

    if (this._textDropdownList) {
      merge(this._videoController.onSubtitlesLoaded$, this._videoController.onSubtitlesCreate$, this._videoController.onSubtitlesRemove$)
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            const textOptions: OmakaseDropdownListItem[] = this._videoController.getSubtitlesTracks().map((track) => ({
              value: track.id,
              label: track.label,
              active: event?.currentTrack?.id === track.id,
            }));
            if (this._config.playerChroming.theme === PlayerChromingTheme.Audio) {
              textOptions.unshift({
                value: '',
                label: 'Off',
                active: true,
              });
            }
            this._textDropdownList!.setOptions(textOptions);
            if (textOptions.filter((option) => option.value).length) {
              this.showElements(this._textDropdownList!);
              this.alignAudioTextDropdown('right');
              if (this._config.playerChroming.theme === PlayerChromingTheme.Audio && this._audioDropdownToggle) {
                this._audioDropdownToggle.removeAttribute('disabled');
                this._audioDropdownToggle.classList.remove('disabled');
              }
            } else {
              this.hideElements(this._textDropdownList!);
              if (this._audioDropdown && this._sidecarDropdownList && !this.isShown(this._sidecarDropdownList)) {
                this.alignAudioTextDropdown('left');
              }
              if (this._config.playerChroming.theme === PlayerChromingTheme.Audio && this._audioDropdownToggle) {
                this._audioDropdownToggle.setAttribute('disabled', '');
                this._audioDropdownToggle.classList.add('disabled');
              }
            }
            if (this._textButton && (!this._videoController.getSubtitlesTracks().length || !this._videoController.getActiveSubtitlesTrack())) {
              this._textButton.classList.add('disabled');
            }
          },
        });
      this._textDropdownList.selectedOption$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
        next: (textOption) => {
          if (textOption) {
            if (textOption.value !== this._videoController.getActiveSubtitlesTrack()?.id) {
              if (textOption.value) {
                this._videoController.showSubtitlesTrack(textOption.value);
              } else if (this._videoController.getActiveSubtitlesTrack()) {
                this._videoController.hideSubtitlesTrack(this._videoController.getActiveSubtitlesTrack()!.id);
              }
            }
          }
        },
      });
      this._videoController.onSubtitlesShow$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe((event) => {
        if (event.currentTrack?.id !== this._textDropdownList!.selectedOption$.getValue()?.value) {
          this._textDropdownList?.selectedOption$.next({
            value: event.currentTrack!.id,
            label: event.currentTrack!.label,
          });
        }
      });
    }

    if (this._buttonCloseControlBar) {
      fromEvent<MouseEvent>(this._buttonCloseControlBar, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            (this._config.playerChroming as OmakaseChroming).themeConfig!.controlBarVisibility = OmakaseControlBarVisibility.Disabled;
            this.updateControlBar();
          },
        });
    }

    if (this._buttonControlBarToggle) {
      fromEvent<MouseEvent>(this._buttonControlBarToggle, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            if ((this._config.playerChroming as OmakaseChroming).themeConfig!.controlBarVisibility === OmakaseControlBarVisibility.Disabled) {
              (this._config.playerChroming as OmakaseChroming).themeConfig!.controlBarVisibility = OmakaseControlBarVisibility.AlwaysOn;
            } else if ((this._config.playerChroming as OmakaseChroming).themeConfig!.controlBarVisibility === OmakaseControlBarVisibility.AlwaysOn) {
              (this._config.playerChroming as OmakaseChroming).themeConfig!.controlBarVisibility = OmakaseControlBarVisibility.Enabled;
            } else {
              (this._config.playerChroming as OmakaseChroming).themeConfig!.controlBarVisibility = OmakaseControlBarVisibility.Disabled;
            }
            this.updateControlBar();
          },
        });
    }

    this._videoController.onVideoLoading$
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .pipe(filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached'))
      .subscribe({
        next: (event) => {
          if (this._markerBar) {
            this._markerBar.clearMarkerTracks();
          }
          if (this._timeRangeControl) {
            this._timeRangeControl.removeAllMarkers();
          }
          if (this._previewThumbnail) {
            this._config.playerChroming.thumbnailUrl = undefined;
            this._config.playerChroming.thumbnailSelectionFn = undefined;
            this._previewThumbnail.vttFile = undefined;
            this._previewThumbnail.thumbnailFn = undefined;
            if (this._previewWrapper) {
              this._previewWrapper.classList.remove('with-thumbnail');
            }
          }
          if (this._config.playerChroming.theme === 'STAMP') {
            this._videoController.setAudioOutputMuted(true);
          }
          if (FileUtil.isAudioFile(event.sourceUrl)) {
            this._mediaControllerElement.classList.add('audio-only');
            this.showElements(this._divBackground);
          } else {
            this._mediaControllerElement.classList.remove('audio-only');
            this.hideElements(this._divBackground);
          }
          if (this._divBackground && event.options?.poster) {
            this._divBackground.style.backgroundImage = `url(${event.options.poster})`;
          }
        },
      });

    this._videoController.onVideoLoaded$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
      next: (videoLoaded) => {
        if (
          videoLoaded &&
          ((this._config.playerChroming.theme === PlayerChromingTheme.Omakase && this._config.playerChroming.themeConfig?.floatingControls?.includes(OmakaseThemeFloatingControl.ActionIcons)) ||
            (this._config.playerChroming.theme === PlayerChromingTheme.Stamp && this._config.playerChroming.themeConfig?.floatingControls?.includes(StampThemeFloatingControl.ActionIcons)))
        ) {
          this.showElements(this._sectionTopRight);
        }

        if (videoLoaded && this._timecodeWrapper && this._videoController.getDuration() >= 3600) {
          this._timecodeWrapper.classList.add('omakase-timecode-long');
        } else if (this._timecodeWrapper) {
          this._timecodeWrapper.classList.remove('omakase-timecode-long');
        }
      },
    });
  }

  createMarkerTrack(config: MarkerTrackConfig): MarkerTrackApi {
    if (!this._markerBar) {
      throw Error('Marker bar element not found');
    }
    const markerTrack = this._markerBar.createMarkerTrack({
      ...config,
      mediaDuration: this._videoController.getDuration(),
    });
    merge(markerTrack.onDestroy$, markerTrack.onHide$, markerTrack.onShow$)
      .pipe(takeUntil(this._destroyed$), takeUntil(this._videoEventBreaker$))
      .subscribe(() => {
        this._mediaControllerElement.style.setProperty('--marker-track-count', this._markerBar!.markerTracks.filter((track) => track.isVisible()).length.toString());
      });
    this._mediaControllerElement.style.setProperty('--marker-track-count', this._markerBar!.markerTracks.filter((track) => track.isVisible()).length.toString());
    return markerTrack;
  }

  getProgressMarkerTrack(): TimeRangeMarkerTrackApi | undefined {
    return this._timeRangeControl;
  }

  hideStampOverlay() {
    this.hideElements(...(this._muteButtons ?? []), this._controlBar, this._timecodeWrapper, this._sectionTopRight);
  }

  destroy() {
    if (this._enterPictureInPictureHandler) {
      this._videoController.getHTMLVideoElement().removeEventListener(HTMLVideoElementEvents.ENTERPIP, this._enterPictureInPictureHandler);
    }

    if (this._leavePictureInPictureHandler) {
      this._videoController.getHTMLVideoElement().removeEventListener(HTMLVideoElementEvents.LEAVEPIP, this._leavePictureInPictureHandler);
    }

    nextCompleteSubject(this._videoEventBreaker$);
    nextCompleteSubject(this._destroyed$);

    nullifier(this._mediaControllerElement, this._themeElement);
  }

  private getMainAudioOptions(): OmakaseDropdownListItem[] {
    return this._videoController.getAudioTracks().map((track) => ({
      value: track.id,
      label: track.label ?? '',
      active: track.active && !!this._videoController.getMainAudioState()?.active,
    }));
  }

  private getSidecarOptions(): OmakaseDropdownListItem[] {
    return this._videoController.getSidecarAudioTracks().map((track) => ({
      value: track.id,
      label: track.label ?? '',
      active: track.active,
    }));
  }

  private getUnifiedAudioOptions(): OmakaseDropdownListItem[] {
    return [...this.getMainAudioOptions(), ...this.getSidecarOptions()];
  }

  private togglePIP() {
    this._buttonDetach!.className === this._domClasses.mediaChromeDetach ? this._videoController.enablePiP() : this._videoController.disablePiP();
  }

  private getControlBarClass(element: string) {
    return `omakase-control-bar-${element.toLowerCase()}`;
  }

  private showCaptions(track: SubtitlesVttTrack) {
    from(parseResponse(fetch(track.src)))
      .pipe(takeUntil(this._subtitleEventBreaker$))
      .subscribe({
        next: ({regions, cues}) => {
          this._captionsRenderer!.changeTrack({regions, cues});
          this._mediaControllerElement.classList.add('with-captions');
        },
        error: (err) => {
          console.error(err);
        },
      });
  }

  private hideCaptions() {
    this._subtitleEventBreaker$.next();
    this._captionsRenderer!.changeTrack({regions: [], cues: []});
    this._mediaControllerElement.classList.remove('with-captions');
  }
}
