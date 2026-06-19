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

import type {MediaChromeButton, MediaControlBar} from 'media-chrome';
import {MediaTemporalFormat, WindowPlaybackMode} from '../../common';
import {DomUtil} from '../../dom/dom-util';
import type {ThumbnailTrackState} from '../../media';
import {
  ChromingTheme,
  DEFAULT_OMAKASE_PLAYER_CHROMING_CONFIG,
  OmakaseControlBarVisibility,
  OmakaseProgressBarPosition,
  OmakaseThemeActionIcon,
  OmakaseThemeControl,
  OmakaseThemeFloatingControl,
  ChromingTimeFormat,
  type OmakaseThemeConfig,
  type OmakaseThemeConfigUpdateableAttrs,
  DEFAULT_CHROMING_VU_METER_STYLE,
  DEFAULT_CHROMING_VU_METER_CONFIG,
  ChromingVuMeterPosition,
} from '../chroming-api';
import {ChromingDomClasses, ChromingDomController, type ChromingDomConfig} from '../chroming-dom';
import type {
  OmakaseDropdown,
  OmakaseDropdownList,
  OmakaseFullscreenButton,
  OmakaseMarkerBar,
  OmakaseMuteButton,
  OmakasePlayButton,
  OmakasePreviewThumbnail,
  OmakaseTimeDisplay,
  OmakaseTimeRange,
  OmakaseVolumeRange,
} from '../components';
import {filter, fromEvent, takeUntil} from 'rxjs';
import {PlayerAudioEventType, PlayerEventType} from '../../player';
import {ChromingUtil} from '../chroming-util';

export class OmakaseDomController extends ChromingDomController<ChromingTheme.OMAKASE> {
  protected _themeConfig: OmakaseThemeConfig;

  protected _autoHidePlaybackButtons = false;

  protected _playButton: OmakasePlayButton;
  protected _muteButtons?: OmakaseMuteButton[] | undefined;
  protected _frameForwardButton: MediaChromeButton;
  protected _tenFramesForwardButton: MediaChromeButton;
  protected _frameBackwardsButton: MediaChromeButton;
  protected _tenFramesBackwardsButton: MediaChromeButton;
  protected _attachDetachButton: MediaChromeButton;
  protected _volumeRanges?: OmakaseVolumeRange[] | undefined;
  protected _speedDropdownList: OmakaseDropdownList;
  protected _timecodeWrapper: HTMLElement;
  protected _currentTimecode: OmakaseTimeDisplay;
  protected _previewTimecode: OmakaseTimeDisplay;
  protected _timeDuration: OmakaseTimeDisplay;
  protected _speedDropdown: OmakaseDropdown;
  protected _audioTextDropdown: OmakaseDropdown;
  protected _fullscreenButtons?: OmakaseFullscreenButton[] | undefined;
  protected _previewThumbnail: OmakasePreviewThumbnail;
  protected _controlBarToggle: MediaChromeButton;
  protected _controlBarCloseButton: MediaChromeButton;
  protected _upperControlBar: HTMLElement;
  protected _lowerControlBar: MediaControlBar;

  protected _controlBarVuMeterContainer?: HTMLElement;
  protected _floatingVuMeterContainer?: HTMLElement;

  protected override _enterPictureInPictureHandler = () => {
    const span = this._attachDetachButton?.querySelector('span');
    if (span) {
      span.className = ChromingDomClasses.mediaChromeAttach;
    }
  };

  protected override _leavePictureInPictureHandler = () => {
    const span = this._attachDetachButton?.querySelector('span');
    if (span) {
      span.className = ChromingDomClasses.mediaChromeDetach;
    }
  };

  constructor(config: ChromingDomConfig<ChromingTheme.OMAKASE>) {
    super(config);
    this._themeConfig = {
      ...DEFAULT_OMAKASE_PLAYER_CHROMING_CONFIG,
      ...this._config.themeConfig,
      vuMeterConfig: {
        ...DEFAULT_CHROMING_VU_METER_CONFIG,
        ...this._config.themeConfig?.vuMeterConfig,
        style: {
          ...DEFAULT_CHROMING_VU_METER_STYLE,
          ...this._config.themeConfig?.vuMeterConfig?.style,
          levelBackground: config.themeConfig?.vuMeterConfig?.style?.levelBackground ?? '#002335',
        },
      },
      isFloatingVuMeterVisible: !!config.themeConfig?.floatingControls?.includes(OmakaseThemeFloatingControl.VU_METER),
    };

    this._mediaControllerElement.insertAdjacentHTML(
      'beforeend',
      `<div ${
        this._themeConfig.alwaysOnFloatingControls?.includes(OmakaseThemeFloatingControl.TIME) ? 'noautohide' : ''
      } class="${ChromingDomClasses.timecodeWrapper} omakase-timecode-format-${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}">
            <omakase-time-display class="${ChromingDomClasses.mediaChromeCurrentTimecode}" showduration format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''}></omakase-time-display>
        </div>`
    );

    if (this._themeConfig.floatingControls.includes(OmakaseThemeFloatingControl.VU_METER)) {
      this._mediaControllerElement.classList.add(ChromingDomClasses.vuMeterFloatingActive);
    }

    this._mediaControllerElement.insertAdjacentHTML('beforeend', `<div class="${ChromingDomClasses.vuMeter} ${ChromingDomClasses.vuMeterFloating}"></div>`);

    this._mediaControllerElement.classList.add('media-controller-omakase');
    this._mediaControllerElement.insertAdjacentHTML('beforeend', this.addControlBar());

    if (this._themeConfig.floatingControls?.includes(OmakaseThemeFloatingControl.ACTION_ICONS)) {
      this._divActionIcons.insertAdjacentHTML(
        'afterbegin',
        `${
          this._themeConfig.actionIcons?.includes(OmakaseThemeActionIcon.FULLSCREEN)
            ? `<omakase-fullscreen-button class="${ChromingDomClasses.mediaChromeButton} omakase-player-fullscreen shadow">
                  <span slot="enter" class="${ChromingDomClasses.mediaChromeFullscreenEnter}"></span>
                  <span slot="exit" class="${ChromingDomClasses.mediaChromeFullscreenExit}"></span>
                </omakase-fullscreen-button>`
            : ''
        }
          ${
            this._themeConfig.actionIcons?.includes(OmakaseThemeActionIcon.CONTROL_BAR_TOGGLE)
              ? `<media-chrome-button class="${ChromingDomClasses.mediaChromeButton} omakase-player-control-bar-toggle shadow">
                  <span class="${ChromingDomClasses.mediaChromeControlBarToggle} control-bar-enabled"></span>
                </media-chrome-button>`
              : ''
          }
          ${
            this._themeConfig.actionIcons?.includes(OmakaseThemeActionIcon.AUDIO_TOGGLE) || this._themeConfig.actionIcons?.includes(OmakaseThemeActionIcon.VOLUME)
              ? `<div class="volume-container">
                    ${this._themeConfig.actionIcons?.includes(OmakaseThemeActionIcon.VOLUME) ? `<omakase-volume-range></omakase-volume-range>` : ''}
                    <omakase-mute-button class="${ChromingDomClasses.mediaChromeButton} shadow">
                      <div slot="off" class="omakase-audio-toggle omakase-audio-off"></div>
                      <div slot="low" class="omakase-audio-toggle omakase-audio-on"></div>
                      <div slot="medium" class="omakase-audio-toggle omakase-audio-on"></div>
                      <div slot="high" class="omakase-audio-toggle omakase-audio-on"></div>
                    </omakase-mute-button>
                </div>`
              : ''
          }`
      );
    } else {
      DomUtil.hideElements(this._divActionIcons);
    }

    if (this._themeConfig.actionIcons?.includes(OmakaseThemeActionIcon.HELP_MENU)) {
      this.createHelpMenuDom();
    }
    if (!this._themeConfig.floatingControls?.includes(OmakaseThemeFloatingControl.PLAYBACK_CONTROLS)) {
      DomUtil.hideElements(this._divPlaybackButtons);
    }
    if (!this._themeConfig.alwaysOnFloatingControls?.includes(OmakaseThemeFloatingControl.PLAYBACK_CONTROLS)) {
      this._divPlaybackButtons?.removeAttribute('noautohide');
    }
    if (this._themeConfig.alwaysOnFloatingControls?.includes(OmakaseThemeFloatingControl.ACTION_ICONS)) {
      this._divActionIcons?.setAttribute('noautohide', '');
    }

    this._themeElement.insertAdjacentHTML('beforeend', this.createSlotsDom());

    this._timeRange = this.getShadowElement<OmakaseTimeRange>('omakase-time-range');
    this._playButton = this.getShadowElement<OmakasePlayButton>('omakase-play-button');
    this._muteButtons = this.getShadowElements<OmakaseMuteButton>('omakase-mute-button');
    this._markerBar = this.getShadowElement<OmakaseMarkerBar>('omakase-marker-bars');
    this._fullscreenButtons = this.getShadowElements<OmakaseFullscreenButton>('omakase-fullscreen-button');
    this._previewThumbnail = this.getShadowElement<OmakasePreviewThumbnail>('omakase-preview-thumbnail');
    this._timeRange = this.getShadowElement<OmakaseTimeRange>('omakase-time-range');
    this._volumeRanges = this.getShadowElements<OmakaseVolumeRange>('omakase-volume-range');

    this._frameForwardButton = this.getShadowElementByClass<OmakaseMuteButton>(ChromingDomClasses.frameForwardButton);
    this._tenFramesForwardButton = this.getShadowElementByClass<OmakaseMuteButton>(ChromingDomClasses.tenFramesForwardButton);
    this._frameBackwardsButton = this.getShadowElementByClass<OmakaseMuteButton>(ChromingDomClasses.frameBackwardsButton);
    this._tenFramesBackwardsButton = this.getShadowElementByClass<OmakaseMuteButton>(ChromingDomClasses.tenFramesBackwardsButton);
    this._attachDetachButton = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.attachDetachButton);
    this._speedDropdownList = this.getShadowElementByClass<OmakaseDropdownList>(ChromingDomClasses.speedDropdownList);
    this._timecodeWrapper = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.timecodeWrapper);
    this._currentTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeCurrentTimecode);
    this._previewTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromePreviewTimecode);
    this._timeDuration = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeTimeDuration);
    this._speedDropdown = this.getShadowElementByClass<OmakaseDropdown>(ChromingDomClasses.speedDropdownList);
    this._audioTextDropdown = this.getShadowElementByClass<OmakaseDropdown>(ChromingDomClasses.audioTextDropdown);
    this._controlBarToggle = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.controlBarToggle);
    this._controlBarCloseButton = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.closeButton);
    this._upperControlBar = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.omakaseControlBar);
    this._lowerControlBar = this.getShadowElementByClass<MediaControlBar>(ChromingDomClasses.mediaControlBar);
    this._controlBarVuMeterContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.vuMeterControlBar);
    this._floatingVuMeterContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.vuMeterFloating);
    this._vuMeterToggle = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.vuMeterToggle);

    if (this._audioTextDropdown) {
      this.registerAudioTextDropdown(this._audioTextDropdown);
    }

    if (this._floatingVuMeterContainer) {
      if (this._themeConfig.alwaysOnFloatingControls.includes(OmakaseThemeFloatingControl.VU_METER)) {
        this._floatingVuMeterContainer.setAttribute('noautohide', '');
      }
      if (this._themeConfig.floatingControls.includes(OmakaseThemeFloatingControl.VU_METER)) {
        this.createVuMeter(this.theme, this.themeConfig, this._floatingVuMeterContainer, ChromingVuMeterPosition.FLOATING);
      }
    }

    if (this._controlBarVuMeterContainer && this._themeConfig.controlBar.includes(OmakaseThemeControl.VU_METER)) {
      this.createVuMeter(this.theme, this.themeConfig, this._controlBarVuMeterContainer, ChromingVuMeterPosition.CONTROL_BAR);
    }

    if (this._timeRange) {
      ChromingUtil.connectResizeObserver(this._timeRange);
      ChromingUtil.onResize$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
        if (this._markerBar && this._timeRange) {
          this._markerBar.containerSize = this._timeRange.rangeWidth;
        }
        this.setAudioTextDropdownMaxWidth(this._audioTextDropdown);
      });
    }

    this.setThemeConfig(this._themeConfig);
  }

  protected addControlBar(): string {
    return `<media-control-bar 
          class="${ChromingDomClasses.mediaControlBar} ${this._themeConfig.progressBarPosition === OmakaseProgressBarPosition.UNDER_VIDEO ? 'control-bar-offset' : ''}" 
          ${this._themeConfig.alwaysOnFloatingControls?.includes(OmakaseThemeFloatingControl.PROGRESS_BAR) ? 'noautohide' : ''}>
            <omakase-marker-bars omakase></omakase-marker-bars>
            ${
              this._themeConfig.floatingControls?.includes(OmakaseThemeFloatingControl.PROGRESS_BAR)
                ? `<omakase-time-range omakase>
                    <div slot="preview" class="${ChromingDomClasses.mediaChromePreviewWrapper}">
                      <omakase-preview-thumbnail class="${ChromingDomClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
                      <omakase-time-display format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromePreviewTimecode}"></omakase-time-display>
                    </div>
                </omakase-time-range>`
                : ''
            }
        </media-control-bar>
        <div class="${ChromingDomClasses.omakaseControlBar}" ${this._themeConfig.controlBarVisibility === OmakaseControlBarVisibility.ALWAYS_ON ? 'noautohide' : ''}>
          <div class="omakase-control-bar-upper">
            ${
              this._themeConfig.playbackRates
                ? `<omakase-dropdown  id="speed-dropdown-${this._config.playerHtmlElementId}" alignment="center">
                      <omakase-dropdown-list class="omakase-speed-dropdown-list" id="speed-dropdown-list-${this._config.playerHtmlElementId}" title="SPEED" width="76">
                      ${this._themeConfig.playbackRates
                        .map((rate) => {
                          if (rate === 1) return `<omakase-dropdown-option selected value="${rate}">${rate}x</omakase-dropdown-option>`;
                          else return `<omakase-dropdown-option value="${rate}">${rate}x</omakase-dropdown-option>`;
                        })
                        .join('\n')}
                      </omakase-dropdown-list>
                  </omakase-dropdown>`
                : ''
            }
            ${this.createAudioTextDropdownDom()}
            <div class="start-container">
              <div class="volume-container ${this.getControlBarClass(OmakaseThemeControl.VOLUME)}">
                  <omakase-mute-button class="${ChromingDomClasses.mediaChromeButton} omakase-player-mute">
                  <span slot="high" class="${ChromingDomClasses.mediaChromeAudioHigh}"></span>
                  <span slot="medium" class="${ChromingDomClasses.mediaChromeAudioMedium}"></span>
                  <span slot="low" class="${ChromingDomClasses.mediaChromeAudioLow}"></span>
                  <span slot="off" class="${ChromingDomClasses.mediaChromeAudioMute}"></span>
                  </omakase-mute-button>
                  <omakase-volume-range></omakase-volume-range>
              </div>
              <omakase-dropdown-toggle class="omakase-player-playback-rate-toggle ${this.getControlBarClass(OmakaseThemeControl.PLAYBACK_RATE)}" dropdown="speed-dropdown-${this._config.playerHtmlElementId}"></omakase-dropdown-toggle>
              <slot name="start-container"></slot>
              <div class="${ChromingDomClasses.vuMeter} ${ChromingDomClasses.vuMeterControlBar} ${this.getControlBarClass(OmakaseThemeControl.VU_METER)}"></div>
            </div>
            <div class="center-container">
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.TEN_FRAMES_BACKWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-ten-frames-backwards">
                  <span class="${ChromingDomClasses.mediaFastRewindButton}"></span>
                  <media-tooltip>Rewind by 10 frames</media-tooltip>
              </media-chrome-button>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.FRAME_BACKWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-frame-backwards">
                  <span class="${ChromingDomClasses.mediaRewindButton}"></span>
                  <media-tooltip>Rewind to previous frame</media-tooltip>
              </media-chrome-button>
              <omakase-play-button class="${this.getControlBarClass(OmakaseThemeControl.PLAY)} ${ChromingDomClasses.mediaChromeButton} omakase-player-play">
                  <span slot="play" class="${ChromingDomClasses.mediaChromePlay}"></span>
                  <span slot="pause" class="${ChromingDomClasses.mediaChromePause}"></span>
              </omakase-play-button>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.FRAME_FORWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-frame-forward">
                  <span class="${ChromingDomClasses.mediaForwardButton}"></span>
                  <media-tooltip>Fast forward to next frame</media-tooltip>
              </media-chrome-button>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.TEN_FRAMES_FORWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-ten-frames-forward">
                  <span class="${ChromingDomClasses.mediaFastForwardButton}"></span>
                  <media-tooltip>Fast forward by 10 frames</media-tooltip>
              </media-chrome-button>
            </div>
            <div class="end-container">
              <slot name="end-container"></slot>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.VU_METER_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} ${ChromingDomClasses.vuMeterToggle}">
                  <span class="${ChromingDomClasses.mediaChromeVuMeterToggle}"></span>
                </media-chrome-button>
              <omakase-dropdown-toggle id="audio-dropdown-toggle-${this._config.playerHtmlElementId}" dropdown="audio-dropdown-${this._config.playerHtmlElementId}" class="${this.getControlBarClass(OmakaseThemeControl.TRACK_SELECTOR)} ${ChromingDomClasses.mediaChromeButton} omakase-player-trackselector">
                  <span class="${ChromingDomClasses.mediaChromeTrackselector}"></span>
                  <media-tooltip>Select track</media-tooltip>
              </omakase-dropdown-toggle>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.DETACH)} ${ChromingDomClasses.mediaChromeButton} omakase-player-attach-detach">
                  <span class="${this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED ? ChromingDomClasses.mediaChromeAttach : ChromingDomClasses.mediaChromeDetach}"></span>
                  <media-tooltip>Select track</media-tooltip>
              </media-chrome-button>
              <omakase-fullscreen-button class="${this.getControlBarClass(OmakaseThemeControl.FULLSCREEN)} ${ChromingDomClasses.mediaChromeButton} omakase-player-fullscreen">
                  <span slot="enter" class="${ChromingDomClasses.mediaChromeFullscreenEnter}"></span>
                  <span slot="exit" class="${ChromingDomClasses.mediaChromeFullscreenExit}"></span>
              </omakase-fullscreen-button>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.CLOSE)} ${ChromingDomClasses.mediaChromeButton} omakase-player-close">
                  <span class="${ChromingDomClasses.mediaChromeClose}"></span>
                  <media-tooltip>Select track</media-tooltip>
              </media-chrome-button>
            </div>
          </div>
          <div class="omakase-control-bar-lower">
            <omakase-time-display withduration format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" class="${ChromingDomClasses.mediaChromeTimeDuration}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''}></omakase-time-display>
          </div>
        </div>`;
  }

  protected createAudioTextDropdownDom = () => {
    return `
          <omakase-dropdown class="${ChromingDomClasses.audioTextDropdown} ${ChromingDomClasses.audioTextDropdown}" id="audio-dropdown-${this._config.playerHtmlElementId}" style="display:none;right:-1px">
              <omakase-dropdown-list class="omakase-audio-dropdown-list align-left" id="audio-dropdown-list-${this._config.playerHtmlElementId}" title="AUDIO" width="125" type="radio"></omakase-dropdown-list>
              <omakase-dropdown-list class="omakase-sidecar-dropdown-list align-left d-none" id="sidecar-dropdown-list-${this._config.playerHtmlElementId}" multiselect="true" title="SIDECAR AUDIO" width="125" type="checkbox"></omakase-dropdown-list>
              <omakase-dropdown-list class="omakase-text-dropdown-list align-left d-none" id="text-dropdown-list-${this._config.playerHtmlElementId}" title="TEXT" width="125" type="radio"></omakase-dropdown-list>
          </omakase-dropdown>`;
  };

  protected createSlotsDom() {
    if (this._config.themeConfig?.htmlTemplateId) {
      return DomUtil.getElementByIdOrFail<HTMLElement>(this._config.themeConfig?.htmlTemplateId)?.innerHTML ?? '';
    } else {
      return '';
    }
  }

  override createMainMediaVideoElement() {
    super.createMainMediaVideoElement();
    this._themeElement.insertAdjacentHTML('beforeend', this.createSlotsDom());
  }

  setThumbnailTrack(track: ThumbnailTrackState | undefined): void {
    if (this._previewThumbnail) {
      this._previewThumbnail.thumbnailTrack = track;
      this._previewThumbnail.thumbnailFn = this._config.findThumbnailFn;
    }
  }

  setThemeConfig(themeConfig: Partial<OmakaseThemeConfigUpdateableAttrs>) {
    this._themeConfig = {
      ...this._themeConfig,
      timeFormat: themeConfig.timeFormat ?? this._themeConfig.timeFormat,
      controlBar: themeConfig.controlBar ?? this._themeConfig.controlBar,
      floatingControls: (themeConfig as OmakaseThemeConfig).floatingControls ?? this._themeConfig.floatingControls,
      controlBarVisibility: themeConfig.controlBarVisibility ?? this._themeConfig.controlBarVisibility,
      progressBarPosition: themeConfig.progressBarPosition ?? this._themeConfig.progressBarPosition,
      vuMeterConfig: {
        ...this._themeConfig.vuMeterConfig,
        ...(themeConfig.vuMeterConfig ?? this._themeConfig.vuMeterConfig),
        style: {
          ...this._themeConfig.vuMeterConfig.style,
          ...themeConfig.vuMeterConfig?.style,
        },
      },
      floatingVuMeterConfig: themeConfig.floatingVuMeterConfig,
      controlBarVuMeterConfig: themeConfig.controlBarVuMeterConfig,
      isFloatingVuMeterVisible: themeConfig.isFloatingVuMeterVisible ?? this._themeConfig.isFloatingVuMeterVisible,
    };
    this.updateFloatingVuMeterVisibility();
    this.updateControlBar();
    this.updateFloatingTime();
    this.updateTimeFormat();
    if (themeConfig.vuMeterConfig || themeConfig.floatingVuMeterConfig) {
      this.updateVuMeterConfig(this._themeConfig, ChromingVuMeterPosition.FLOATING);
    }
    if (themeConfig.vuMeterConfig || themeConfig.controlBarVuMeterConfig) {
      this.updateVuMeterConfig(this._themeConfig, ChromingVuMeterPosition.CONTROL_BAR);
    }
  }

  setFloatingTimeVisible(visible: boolean): void {
    const floatingControls = this._themeConfig.floatingControls;
    if (visible && floatingControls && !floatingControls.includes(OmakaseThemeFloatingControl.TIME)) {
      floatingControls.push(OmakaseThemeFloatingControl.TIME);
      this.updateFloatingTime();
    } else if (!visible && floatingControls && floatingControls.includes(OmakaseThemeFloatingControl.TIME)) {
      floatingControls.splice(floatingControls.indexOf(OmakaseThemeFloatingControl.TIME), 1);
      this.updateFloatingTime();
    }
    this._themeConfigChange$.next();
  }

  isFloatingTimeVisible(): boolean {
    return this._themeConfig.floatingControls?.includes(OmakaseThemeFloatingControl.TIME) ?? false;
  }

  updateFloatingTime() {
    const bitcEnabled = !!this._themeConfig.floatingControls?.includes(OmakaseThemeFloatingControl.TIME);
    if (bitcEnabled) {
      DomUtil.showElements(this._timecodeWrapper!);
    } else {
      DomUtil.hideElements(this._timecodeWrapper!);
    }
  }

  updateControlBar() {
    for (const control of Object.values(OmakaseThemeControl)) {
      if (this._themeConfig.controlBar?.includes(control)) {
        DomUtil.showElements(this.getShadowElementByClass(this.getControlBarClass(control)));
      } else {
        DomUtil.hideElements(this.getShadowElementByClass(this.getControlBarClass(control)));
      }
    }
    if (this._themeConfig.controlBarVisibility === OmakaseControlBarVisibility.DISABLED) {
      this._mediaControllerElement.classList.remove(ChromingDomClasses.withControlBar);
    } else {
      this._mediaControllerElement.classList.add(ChromingDomClasses.withControlBar);
    }
    if (this._themeConfig.controlBar?.includes(OmakaseThemeControl.VU_METER)) {
      this._mediaControllerElement.classList.add(ChromingDomClasses.withControlBarVuMeter);
      if (this._controlBarVuMeterContainer && !this._vuMeters[ChromingVuMeterPosition.CONTROL_BAR]) {
        this.createVuMeter(this.theme, this._themeConfig, this._controlBarVuMeterContainer, ChromingVuMeterPosition.CONTROL_BAR);
        this.wireVuMeters();
      }
    } else {
      this._mediaControllerElement.classList.remove(ChromingDomClasses.withControlBarVuMeter);
    }
    if (this._lowerControlBar) {
      if (this._themeConfig.progressBarPosition === OmakaseProgressBarPosition.UNDER_VIDEO) {
        this._lowerControlBar.classList.add('control-bar-offset');
      } else {
        this._lowerControlBar.classList.remove('control-bar-offset');
      }
    }
    if (this._upperControlBar) {
      if (this._themeConfig.controlBarVisibility === OmakaseControlBarVisibility.ALWAYS_ON) {
        this._upperControlBar.setAttribute('noautohide', '');
      } else {
        this._upperControlBar.removeAttribute('noautohide');
      }
      if (this._themeConfig.controlBarVisibility === OmakaseControlBarVisibility.DISABLED) {
        DomUtil.hideElements(this._upperControlBar);
      } else {
        DomUtil.showElements(this._upperControlBar);
      }
    }
    if (this._controlBarToggle) {
      const controlBarToggleIcon = this._controlBarToggle.querySelector('span') as HTMLSpanElement;
      if (this._themeConfig.controlBarVisibility === OmakaseControlBarVisibility.ALWAYS_ON) {
        controlBarToggleIcon.classList.remove('control-bar-enabled', 'control-bar-disabled');
        controlBarToggleIcon.classList.add('control-bar-always-on');
      } else if (this._themeConfig.controlBarVisibility === OmakaseControlBarVisibility.ENABLED) {
        controlBarToggleIcon.classList.remove('control-bar-always-on', 'control-bar-disabled');
        controlBarToggleIcon.classList.add('control-bar-enabled');
      } else {
        controlBarToggleIcon.classList.remove('control-bar-enabled', 'control-bar-always-on');
        controlBarToggleIcon.classList.add('control-bar-disabled');
      }
    }
  }

  wirePlayer() {
    super.wirePlayer();
    this.checkPlayerInternal();
    const playerInternal = this._playerInternal!;
    if (this._playButton) {
      this._playButton.player = playerInternal;
    }
    if (this._muteButtons) {
      for (const muteButton of this._muteButtons) {
        muteButton.player = playerInternal;
      }
    }
    if (this._volumeRanges) {
      for (const volumeRange of this._volumeRanges) {
        volumeRange.player = playerInternal;
      }
    }
    if (this._currentTimecode) {
      this._currentTimecode.player = playerInternal;
    }
    if (this._timeDuration) {
      this._timeDuration.player = playerInternal;
    }
    if (this._fullscreenButtons) {
      for (const fullscreenButton of this._fullscreenButtons) {
        fullscreenButton.player = playerInternal;
      }
    }
    if (this._previewTimecode && this._timeRange) {
      this._previewTimecode.player = playerInternal;
      this._previewTimecode.timeRange = this._timeRange;
    }
    if (this._audioTextDropdown) {
      this.wireAudioTextDropdown(this._audioTextDropdown);
    }
    if (this._timeRange) {
      this._timeRange.onSeek$.pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (time) => {
          playerInternal.seekTo(time);
        },
      });
      if (this._previewThumbnail) {
        this._previewThumbnail.timeRange = this._timeRange;
      }
    }
    if (!this._config.playerDetachable && this._attachDetachButton && !this.isPiPSupported()) {
      DomUtil.hideElements(this._attachDetachButton);
    }
    if (this._vuMeterToggle) {
      fromEvent<MouseEvent>(this._vuMeterToggle, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            this.setFloatingVuMeterVisible(!this._themeConfig.isFloatingVuMeterVisible);
          },
        });
      playerInternal.audioInternal.onEvent$
        .pipe(
          filter((event) => event.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED),
          takeUntil(this._playerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe((event) => {
          this.updateFloatingVuMeterToggle(event.data.playerAudio);
        });
    }
    if (this._frameForwardButton) {
      fromEvent<MouseEvent>(this._frameForwardButton, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            playerInternal.pause().subscribe(() => {
              playerInternal.seekFromCurrentTime(1, MediaTemporalFormat.FRAME_COUNT);
            });
          },
        });
    }
    if (this._tenFramesForwardButton) {
      fromEvent<MouseEvent>(this._tenFramesForwardButton, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            playerInternal.pause().subscribe(() => {
              playerInternal.seekFromCurrentTime(10, MediaTemporalFormat.FRAME_COUNT);
            });
          },
        });
    }
    if (this._frameBackwardsButton) {
      fromEvent<MouseEvent>(this._frameBackwardsButton, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            playerInternal.pause().subscribe(() => {
              playerInternal.seekFromCurrentTime(-1, MediaTemporalFormat.FRAME_COUNT);
            });
          },
        });
    }
    if (this._tenFramesBackwardsButton) {
      fromEvent<MouseEvent>(this._tenFramesBackwardsButton, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            playerInternal.pause().subscribe(() => {
              playerInternal.seekFromCurrentTime(-10, MediaTemporalFormat.FRAME_COUNT);
            });
          },
        });
    }
    if (this._attachDetachButton) {
      fromEvent<MouseEvent>(this._attachDetachButton, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            if (this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED) {
              this._config.requestAttachFn();
            } else {
              if (this._config.playerDetachable) {
                this._config.requestDetachFn();
              } else {
                this.togglePiP();
              }
            }
          },
        });
    }
    if (this._speedDropdownList) {
      this._speedDropdownList.selectedOption$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (speedOption) => {
          if (speedOption && parseFloat(speedOption.value) !== playerInternal.playerSession.playback.playbackRate) {
            playerInternal.setPlaybackRate(parseFloat(speedOption.value));
          }
        },
      });
      playerInternal.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_RATE_UPDATE),
          takeUntil(this._playerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: (event) => {
            if (event.data.playbackRate.toString() !== this._speedDropdownList?.selectedOption$.getValue()?.value) {
              this._speedDropdownList!.selectedOption$.next({
                value: event.data.playbackRate.toString(),
                label: `${event.data.playbackRate}x`,
              });
            }
          },
        });
    }
    if (this._controlBarCloseButton) {
      fromEvent<MouseEvent>(this._controlBarCloseButton, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (event) => {
            this._themeConfig!.controlBarVisibility = OmakaseControlBarVisibility.DISABLED;
            this.updateControlBar();
          },
        });
    }

    if (this._controlBarToggle) {
      fromEvent<MouseEvent>(this._controlBarToggle, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (event) => {
            if (this._themeConfig!.controlBarVisibility === OmakaseControlBarVisibility.DISABLED) {
              this._themeConfig!.controlBarVisibility = OmakaseControlBarVisibility.ALWAYS_ON;
            } else if (this._themeConfig!.controlBarVisibility === OmakaseControlBarVisibility.ALWAYS_ON) {
              this._themeConfig!.controlBarVisibility = OmakaseControlBarVisibility.ENABLED;
            } else {
              this._themeConfig!.controlBarVisibility = OmakaseControlBarVisibility.DISABLED;
            }
            this.updateControlBar();
          },
        });
    }
  }

  setTimeFormat(timeFormat: ChromingTimeFormat) {
    this._themeConfig = {
      ...this._themeConfig,
      timeFormat,
    };
    this.updateControlBar();
    this.updateFloatingTime();
    this.updateTimeFormat();
  }

  updateTimeFormat() {
    if (this._currentTimecode) {
      this._currentTimecode.format = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._currentTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
      this._currentTimecode.updateTime();
    }
    if (this._timeDuration) {
      this._timeDuration.format = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._timeDuration.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
      this._timeDuration.updateTime();
    }
    if (this._previewTimecode) {
      this._previewTimecode.format = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._previewTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
    }
  }

  setFloatingVuMeterVisible(visible: boolean): void {
    if (visible) {
      this.initializeFloatingVuMeter();
    }
    this._themeConfig.isFloatingVuMeterVisible = visible;
    this.updateFloatingVuMeterVisibility();
    this._themeConfigChange$.next();
  }

  protected initializeFloatingVuMeter() {
    if (!this._vuMeters[ChromingVuMeterPosition.FLOATING]) {
      this.createVuMeter(ChromingTheme.OMAKASE, this._themeConfig, this._floatingVuMeterContainer!, ChromingVuMeterPosition.FLOATING);
      if (this._playerInternal && this._playerInternal.isMainMediaLoaded) {
        this.wireVuMeters();
      }
    }
  }

  protected updateFloatingVuMeterVisibility() {
    if (this._themeConfig.isFloatingVuMeterVisible) {
      this._mediaControllerElement.classList.add(ChromingDomClasses.vuMeterFloatingActive);
      this.initializeFloatingVuMeter();
    } else {
      this._mediaControllerElement.classList.remove(ChromingDomClasses.vuMeterFloatingActive);
    }
  }

  resetMainMediaVideoElement(): void {
    super.resetMainMediaVideoElement();
    this.addPiPListeners();
    if (this._speedDropdownList) {
      this._speedDropdownList.selectedOption$.next({
        value: 1,
        label: '1x',
      });
    }
  }

  protected includeAudioRouter(): boolean {
    return this._themeConfig.controlBar.includes(OmakaseThemeControl.ROUTER);
  }

  get theme(): ChromingTheme.OMAKASE {
    return ChromingTheme.OMAKASE;
  }

  get themeConfig() {
    return this._themeConfig;
  }
}
