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

import {
  ChromingTheme,
  DEFAULT_PLAYER_CHROMING_CONFIG,
  DefaultThemeActionIcon,
  type DefaultThemeConfig,
  DefaultThemeControl,
  DefaultThemeFloatingControl,
  ChromingTimeFormat,
  type DefaultThemeConfigUpdateableAttrs,
  DEFAULT_CHROMING_VU_METER_STYLE,
  DEFAULT_CHROMING_VU_METER_CONFIG,
  ChromingVuMeterPosition,
} from '../chroming-api';
import {PlayerAudioEventType, PlayerEventType, PlayerTextEventType} from '../../player';
import {ChromingDomClasses, type ChromingDomConfig, ChromingDomController} from '../chroming-dom';
import '../components';
import '../../vu-meter/components';
import {DomUtil} from '../../dom/dom-util';
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
import type {MediaChromeButton} from 'media-chrome';
import {MediaTemporalFormat, WindowPlaybackMode} from '../../common';
import {PlayerTextType} from '../../player/player-text';
import type {ThumbnailTrackState} from '../../media/thumbnail-track';
import {ChromingUtil} from '../chroming-util';
import {VuMeterTheme} from '../../vu-meter';

export class DefaultDomController extends ChromingDomController<ChromingTheme.DEFAULT> {
  protected _themeConfig: DefaultThemeConfig;

  protected _playButton?: OmakasePlayButton;
  protected _muteButton?: OmakaseMuteButton;
  protected _frameForwardButton?: MediaChromeButton;
  protected _tenFramesForwardButton?: MediaChromeButton;
  protected _frameBackwardsButton?: MediaChromeButton;
  protected _tenFramesBackwardsButton?: MediaChromeButton;
  protected _bitcButton?: MediaChromeButton;
  protected _captionsToggle?: MediaChromeButton;
  protected _fullscreenButton?: OmakaseFullscreenButton;

  protected _volumeRange?: OmakaseVolumeRange;
  protected _speedDropdown?: OmakaseDropdown;
  protected _speedDropdownList?: OmakaseDropdownList;

  protected _audioTextDropdownTop?: OmakaseDropdown;
  protected _audioTextDropdownBottom?: OmakaseDropdown;

  protected _timecodeContainer?: HTMLElement;
  protected _currentTimecode?: OmakaseTimeDisplay;
  protected _previewTimecode?: OmakaseTimeDisplay;
  protected _previewThumbnail?: OmakasePreviewThumbnail;

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

  constructor(config: ChromingDomConfig<ChromingTheme.DEFAULT>) {
    super(config);
    this._themeConfig = {
      ...DEFAULT_PLAYER_CHROMING_CONFIG,
      ...this._config.themeConfig,
      vuMeterConfig: {
        ...DEFAULT_CHROMING_VU_METER_CONFIG,
        ...this._config.themeConfig?.vuMeterConfig,
        style: {
          ...DEFAULT_CHROMING_VU_METER_STYLE,
          ...this._config.themeConfig?.vuMeterConfig?.style,
          levelBackground: config.themeConfig?.vuMeterConfig?.style?.levelBackground ?? (this._config.themeConfig?.vuMeterConfig?.theme === VuMeterTheme.LED ? '#333333' : 'transparent'),
        },
      },
      isFloatingVuMeterVisible: !!config.themeConfig?.floatingControls?.includes(DefaultThemeFloatingControl.VU_METER),
    };

    this._mediaControllerElement.classList.add('media-controller-default');

    if (this._themeConfig.floatingControls.includes(DefaultThemeFloatingControl.VU_METER)) {
      this._mediaControllerElement.classList.add(ChromingDomClasses.vuMeterFloatingActive);
    }

    this._mediaControllerElement.insertAdjacentHTML('beforeend', `<div class="${ChromingDomClasses.vuMeter} ${ChromingDomClasses.vuMeterFloating}"></div>`);
    this._mediaControllerElement.insertAdjacentHTML('beforeend', this.addControlBar());

    this._themeElement.insertAdjacentHTML('beforeend', this.createSlotsDom());

    this._autoHidePlaybackButtons = !this._themeConfig.alwaysOnFloatingControls?.includes(DefaultThemeFloatingControl.PLAYBACK_CONTROLS);
    if (!this._themeConfig.floatingControls?.includes(DefaultThemeFloatingControl.PLAYBACK_CONTROLS)) {
      DomUtil.hideElements(this._divPlaybackButtons);
    }
    if (!this._themeConfig.floatingControls?.includes(DefaultThemeFloatingControl.ACTION_ICONS)) {
      DomUtil.hideElements(this._divActionIcons);
    }
    if (this._themeConfig.alwaysOnFloatingControls?.includes(DefaultThemeFloatingControl.ACTION_ICONS)) {
      this._divActionIcons?.setAttribute('noautohide', '');
    }
    if (this._themeConfig.actionIcons?.includes(DefaultThemeActionIcon.TRACK_SELECTOR)) {
      this._divActionIcons?.insertAdjacentHTML('beforeend', this.createAudioTextDropdownDom('top'));
      this._divActionIcons?.insertAdjacentHTML(
        'afterbegin',
        `<omakase-dropdown-toggle id="audio-dropdown-toggle-${this._config.playerHtmlElementId}-top" dropdown="audio-dropdown-${this._config.playerHtmlElementId}-top" class="audio-dropdown-toggle-top">
          <media-chrome-button class="${ChromingDomClasses.mediaChromeButton} omakase-player-audio-text">
            <span class="${ChromingDomClasses.mediaChromeAudioText} shadow"></span>
          </media-chrome-button>
        </omakase-dropdown-toggle>`
      );
    }
    if (this._themeConfig.actionIcons?.includes(DefaultThemeActionIcon.HELP_MENU)) {
      this.createHelpMenuDom();
    }

    this._playButton = this.getShadowElement<OmakasePlayButton>('omakase-play-button');
    this._muteButton = this.getShadowElement<OmakaseMuteButton>('omakase-mute-button');
    this._markerBar = this.getShadowElement<OmakaseMarkerBar>('omakase-marker-bars');
    this._fullscreenButton = this.getShadowElement<OmakaseFullscreenButton>('omakase-fullscreen-button');
    this._previewThumbnail = this.getShadowElement<OmakasePreviewThumbnail>('omakase-preview-thumbnail');
    this._timeRange = this.getShadowElement<OmakaseTimeRange>('omakase-time-range');
    this._volumeRange = this.getShadowElement<OmakaseVolumeRange>('omakase-volume-range');
    this._frameForwardButton = this.getShadowElementByClass<OmakaseMuteButton>(ChromingDomClasses.frameForwardButton);
    this._tenFramesForwardButton = this.getShadowElementByClass<OmakaseMuteButton>(ChromingDomClasses.tenFramesForwardButton);
    this._frameBackwardsButton = this.getShadowElementByClass<OmakaseMuteButton>(ChromingDomClasses.frameBackwardsButton);
    this._tenFramesBackwardsButton = this.getShadowElementByClass<OmakaseMuteButton>(ChromingDomClasses.tenFramesBackwardsButton);
    this._attachDetachButton = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.attachDetachButton);
    this._bitcButton = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.bitcButton);
    this._speedDropdownList = this.getShadowElementByClass<OmakaseDropdownList>(ChromingDomClasses.speedDropdownList);
    this._timecodeContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.timecodeContainer);
    this._currentTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeCurrentTimecode);
    this._previewTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromePreviewTimecode);
    this._speedDropdown = this.getShadowElementByClass<OmakaseDropdown>(ChromingDomClasses.speedDropdown);
    this._audioTextDropdownTop = this.getShadowElementByClass<OmakaseDropdown>(ChromingDomClasses.audioTextDropdownTop);
    this._audioTextDropdownBottom = this.getShadowElementByClass<OmakaseDropdown>(ChromingDomClasses.audioTextDropdownBottom);
    this._captionsToggle = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.omakaseTextToggle);
    this._controlBarVuMeterContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.vuMeterControlBar);
    this._floatingVuMeterContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.vuMeterFloating);
    this._vuMeterToggle = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.vuMeterToggle);

    if (this._audioTextDropdownTop) {
      this.registerAudioTextDropdown(this._audioTextDropdownTop);
    }
    if (this._audioTextDropdownBottom) {
      this.registerAudioTextDropdown(this._audioTextDropdownBottom);
    }

    if (this._timeRange) {
      ChromingUtil.connectResizeObserver(this._timeRange);
      ChromingUtil.onResize$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
        if (this._markerBar && this._timeRange) {
          this._markerBar.containerSize = this._timeRange.rangeWidth;
        }
        [this._audioTextDropdownTop, this._audioTextDropdownBottom]
          .filter((el) => el)
          .forEach((el) => {
            this.setAudioTextDropdownMaxWidth(el!);
          });
      });
    }

    if (this._floatingVuMeterContainer) {
      if (this._themeConfig.alwaysOnFloatingControls.includes(DefaultThemeFloatingControl.VU_METER)) {
        this._floatingVuMeterContainer.setAttribute('noautohide', '');
      }
      if (this._themeConfig.floatingControls.includes(DefaultThemeFloatingControl.VU_METER)) {
        this.createVuMeter(this.theme, this.themeConfig, this._floatingVuMeterContainer, ChromingVuMeterPosition.FLOATING);
      }
    }

    if (this._controlBarVuMeterContainer && this._themeConfig.controlBar.includes(DefaultThemeControl.VU_METER)) {
      this.createVuMeter(this.theme, this.themeConfig, this._controlBarVuMeterContainer, ChromingVuMeterPosition.CONTROL_BAR);
    }

    this.setThemeConfig(this._themeConfig);
  }

  protected addControlBar(): string {
    return `
        <div class="${ChromingDomClasses.timecodeContainer} d-none" slot="middle-chrome" noautohide>
            <omakase-time-display format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
        </div>
        <media-control-bar class="upper-control-bar">
            <omakase-marker-bars></omakase-marker-bars>
              <omakase-time-range class="${this.getControlBarClass(DefaultThemeControl.SCRUBBER)} omakase-time-range">
                  <div slot="preview" class="${ChromingDomClasses.mediaChromePreviewWrapper}">
                      <omakase-preview-thumbnail class="${ChromingDomClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
                      <omakase-time-display format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromePreviewTimecode}"></omakase-time-display>
                  </div>
              </omakase-time-range>
            ${
              this._themeConfig.playbackRates
                ? `<omakase-dropdown id="speed-dropdown-${this._config.playerHtmlElementId}" class="omakase-speed-dropdown" alignment="center">
                    <omakase-dropdown-list id="speed-dropdown-list-${this._config.playerHtmlElementId}" class="omakase-speed-dropdown-list" title="SPEED" width="76">
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
            <slot name="dropdown-container"></slot>
            ${this.createAudioTextDropdownDom('bottom')}
        </media-control-bar>
        <media-control-bar class="lower-control-bar">
            <div class="start-container">
                <div class="volume-container ${this.getControlBarClass(DefaultThemeControl.VOLUME)}">
                    <omakase-mute-button class="${ChromingDomClasses.mediaChromeButton} omakase-player-mute">
                    <span slot="high" class="${ChromingDomClasses.mediaChromeAudioHigh}"></span>
                    <span slot="medium" class="${ChromingDomClasses.mediaChromeAudioMedium}"></span>
                    <span slot="low" class="${ChromingDomClasses.mediaChromeAudioLow}"></span>
                    <span slot="off" class="${ChromingDomClasses.mediaChromeAudioMute}"></span>
                    </omakase-mute-button>
                    <omakase-volume-range class="omakase-volume-range"></omakase-volume-range>
                </div>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.TEXT_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} ${ChromingDomClasses.omakaseTextToggle}">
                    <span class="${ChromingDomClasses.mediaChromeTextOn} disabled"></span>
                </media-chrome-button>
                <omakase-dropdown-toggle class="${this.getControlBarClass(DefaultThemeControl.PLAYBACK_RATE)}" dropdown="speed-dropdown-${this._config.playerHtmlElementId}"></omakase-dropdown-toggle>
                <slot name="start-container"></slot>
                <div class="${ChromingDomClasses.vuMeter} ${ChromingDomClasses.vuMeterControlBar} ${this.getControlBarClass(DefaultThemeControl.VU_METER)}"></div>
            </div>
            <div class="center-container">
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.TEN_FRAMES_BACKWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-ten-frames-backwards">
                    <span class="${ChromingDomClasses.mediaFastRewindButton}"></span>
                    <media-tooltip>Rewind by 10 frames</media-tooltip>
                </media-chrome-button>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.FRAME_BACKWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-frame-backwards">
                    <span class="${ChromingDomClasses.mediaRewindButton}"></span>
                    <media-tooltip>Rewind to previous frame</media-tooltip>
                </media-chrome-button>
                <omakase-play-button class="${this.getControlBarClass(DefaultThemeControl.PLAY)} ${ChromingDomClasses.mediaChromeButton} omakase-player-play">
                    <span slot="play" class="${ChromingDomClasses.mediaChromePlay}"></span>
                    <span slot="pause" class="${ChromingDomClasses.mediaChromePause}"></span>
                </omakase-play-button>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.FRAME_FORWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-frame-forward">
                    <span class="${ChromingDomClasses.mediaForwardButton}"></span>
                    <media-tooltip>Fast forward to next frame</media-tooltip>
                </media-chrome-button>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.TEN_FRAMES_FORWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-ten-frames-forward">
                    <span class="${ChromingDomClasses.mediaFastForwardButton}"></span>
                    <media-tooltip>Fast forward by 10 frames</media-tooltip>
                </media-chrome-button>
            </div>
            <div class="end-container">
                <slot name="end-container"></slot>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.VU_METER_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} ${ChromingDomClasses.vuMeterToggle}">
                  <span class="${ChromingDomClasses.mediaChromeVuMeterToggle}"></span>
                </media-chrome-button>
                <omakase-dropdown-toggle class="${this.getControlBarClass(DefaultThemeControl.TRACK_SELECTOR)} audio-dropdown-toggle-bottom" id="audio-dropdown-toggle-${this._config.playerHtmlElementId}-bottom" dropdown="audio-dropdown-${this._config.playerHtmlElementId}-bottom">
                    <media-chrome-button class="${ChromingDomClasses.mediaChromeButton} omakase-player-audio-text">
                    <span class="${ChromingDomClasses.mediaChromeAudioText}"></span>
                    </media-chrome-button>
                </omakase-dropdown-toggle>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.BITC)} ${ChromingDomClasses.mediaChromeButton} omakase-player-bitc">
                    <span class="${ChromingDomClasses.mediaChromeBitcDisabled} omakase-player-bitc-icon"></span>
                    <media-tooltip class="${ChromingDomClasses.mediaChromeBitcTooltip} omakase-player-bitc-tooltip">Show timecode</media-tooltip>
                </media-chrome-button>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.DETACH)} ${ChromingDomClasses.mediaChromeButton} omakase-player-attach-detach">
                    <span class="${this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED ? ChromingDomClasses.mediaChromeAttach : ChromingDomClasses.mediaChromeDetach}"></span>
                    <media-tooltip>${this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED ? 'Attach player' : 'Detach player'}</media-tooltip>
                </media-chrome-button>
                <omakase-fullscreen-button class="${this.getControlBarClass(DefaultThemeControl.FULLSCREEN)} ${ChromingDomClasses.mediaChromeButton} omakase-player-fullscreen">
                    <span slot="enter" class="${ChromingDomClasses.mediaChromeFullscreenEnter}"></span>
                    <span slot="exit" class="${ChromingDomClasses.mediaChromeFullscreenExit}"></span>
                </omakase-fullscreen-button>
            </div>
        </media-control-bar>`;
  }

  protected createAudioTextDropdownDom(placement: 'top' | 'bottom') {
    return `
          <omakase-dropdown class="${ChromingDomClasses.audioTextDropdown} ${ChromingDomClasses.audioTextDropdown}-${placement}" ${this._themeConfig.trackSelectorAutoClose === false ? 'floating ' : ''} ${placement === 'top' ? 'position="below"' : ''} id="audio-dropdown-${this._config.playerHtmlElementId}-${placement}" style="display:none;right:${placement === 'top' ? '2.5%' : '20px'}">
              <omakase-dropdown-list class="omakase-audio-dropdown-list align-left" id="audio-dropdown-list-${this._config.playerHtmlElementId}" title="AUDIO" width="125" type="radio"></omakase-dropdown-list>
              <omakase-dropdown-list class="omakase-sidecar-dropdown-list align-left d-none" id="sidecar-dropdown-list-${this._config.playerHtmlElementId}" multiselect="true" title="SIDECAR AUDIO" width="125" type="checkbox"></omakase-dropdown-list>
              <omakase-dropdown-list class="omakase-text-dropdown-list align-left d-none" id="text-dropdown-list-${this._config.playerHtmlElementId}" title="TEXT" width="125" type="radio"></omakase-dropdown-list>
          </omakase-dropdown>`;
  }

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

  setThemeConfig(themeConfig: Partial<DefaultThemeConfigUpdateableAttrs>) {
    this._themeConfig = {
      ...this._themeConfig,
      controlBarVisibility: themeConfig.controlBarVisibility ?? this._themeConfig.controlBarVisibility,
      controlBar: themeConfig.controlBar ?? this._themeConfig.controlBar,
      floatingControls: (themeConfig as DefaultThemeConfig).floatingControls ?? this._themeConfig.floatingControls,
      timeFormat: themeConfig.timeFormat ?? this._themeConfig.timeFormat,
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
    if (this._audioTextDropdownTop) {
      this._audioTextDropdownTop.isFloating = !this._themeConfig.trackSelectorAutoClose;
    }
    if (this._audioTextDropdownBottom) {
      this._audioTextDropdownBottom.isFloating = !this._themeConfig.trackSelectorAutoClose;
    }
    this._mediaControllerElement.classList.remove('omakase-control-bar-enabled', 'omakase-control-bar-disabled', 'omakase-control-bar-fullscreen_only');
    this._mediaControllerElement.classList.add(`omakase-control-bar-${this._themeConfig.controlBarVisibility?.toLowerCase() ?? 'enabled'}`);
    if (themeConfig.vuMeterConfig || themeConfig.floatingVuMeterConfig) {
      this.updateVuMeterConfig(this._themeConfig, ChromingVuMeterPosition.FLOATING);
    }
    if (themeConfig.vuMeterConfig || themeConfig.controlBarVuMeterConfig) {
      this.updateVuMeterConfig(this._themeConfig, ChromingVuMeterPosition.CONTROL_BAR);
    }
    this.updateFloatingVuMeterVisibility();
    this.updateControlBar();
    this.updateFloatingTime();
    this.updateTimeFormat();
    this.updateAudioTrackRouters();
  }

  setTimeFormat(timeFormat: ChromingTimeFormat) {
    this._themeConfig = {
      ...this._themeConfig,
      timeFormat,
    };
    this.updateTimeFormat();
  }

  updateTimeFormat() {
    if (this._currentTimecode) {
      this._currentTimecode.format = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._currentTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
      this._currentTimecode.updateTime();
    }
    if (this._previewTimecode) {
      this._previewTimecode.format = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._previewTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
    }
  }

  setFloatingTimeVisible(visible: boolean): void {
    const floatingControls = this._themeConfig.floatingControls;
    if (visible && floatingControls && !floatingControls.includes(DefaultThemeFloatingControl.TIME)) {
      floatingControls.push(DefaultThemeFloatingControl.TIME);
      this.updateFloatingTime();
    } else if (!visible && floatingControls && floatingControls.includes(DefaultThemeFloatingControl.TIME)) {
      floatingControls.splice(floatingControls.indexOf(DefaultThemeFloatingControl.TIME), 1);
      this.updateFloatingTime();
    }
    this._themeConfigChange$.next();
  }

  isFloatingTimeVisible(): boolean {
    return this._themeConfig.floatingControls?.includes(DefaultThemeFloatingControl.TIME) ?? false;
  }

  updateFloatingTime() {
    const bitcEnabled = !!this._themeConfig.floatingControls?.includes(DefaultThemeFloatingControl.TIME);
    const bitcSpan = this.getShadowElementByClass<HTMLSpanElement>('omakase-player-bitc-icon');
    const bitcTooltip = this.getShadowElementByClass<HTMLSpanElement>('omakase-player-bitc-tooltip');
    if (bitcEnabled) {
      DomUtil.showElements(this._timecodeContainer!);
    } else {
      DomUtil.hideElements(this._timecodeContainer!);
    }
    bitcSpan!.classList.remove(bitcEnabled ? ChromingDomClasses.mediaChromeBitcDisabled : ChromingDomClasses.mediaChromeBitcEnabled);
    bitcSpan!.classList.add(bitcEnabled ? ChromingDomClasses.mediaChromeBitcEnabled : ChromingDomClasses.mediaChromeBitcDisabled);
    bitcTooltip!.innerHTML = bitcEnabled ? 'Hide timecode' : 'Show timecode';
  }

  updateControlBar() {
    for (const control of Object.values(DefaultThemeControl)) {
      if (this._themeConfig.controlBar?.includes(control)) {
        DomUtil.showElements(this.getShadowElementByClass(this.getControlBarClass(control)));
      } else {
        DomUtil.hideElements(this.getShadowElementByClass(this.getControlBarClass(control)));
      }
    }
    if (this._themeConfig.controlBar?.includes(DefaultThemeControl.VU_METER)) {
      this._mediaControllerElement.classList.add(ChromingDomClasses.withControlBarVuMeter);
      if (this._controlBarVuMeterContainer && !this._vuMeters[ChromingVuMeterPosition.CONTROL_BAR]) {
        this.createVuMeter(this.theme, this._themeConfig, this._controlBarVuMeterContainer, ChromingVuMeterPosition.CONTROL_BAR);
        this.wireVuMeters();
      }
    } else {
      this._mediaControllerElement.classList.remove(ChromingDomClasses.withControlBarVuMeter);
    }
    if (!this._themeConfig.controlBar?.includes(DefaultThemeControl.TRACK_SELECTOR) && this._audioTextDropdownBottom) {
      this._audioTextDropdownBottom.style.display = 'none';
    }
    if (!this._themeConfig.controlBar?.includes(DefaultThemeControl.PLAYBACK_RATE) && this._speedDropdown) {
      this._speedDropdown.style.display = 'none';
    }
  }

  setThumbnailTrack(track: ThumbnailTrackState | undefined) {
    if (this._previewThumbnail) {
      this._previewThumbnail.thumbnailTrack = track;
      this._previewThumbnail.thumbnailFn = this._config.findThumbnailFn;
    }
  }

  wirePlayer() {
    super.wirePlayer();
    this.checkPlayerInternal();
    let playerInternal = this._playerInternal!;

    if (this._playButton) {
      this._playButton.player = playerInternal;
    }
    if (this._muteButton) {
      this._muteButton.player = playerInternal;
    }
    if (this._volumeRange) {
      this._volumeRange.player = playerInternal;
    }
    if (this._currentTimecode) {
      this._currentTimecode.player = playerInternal;
    }
    if (this._fullscreenButton) {
      this._fullscreenButton.player = playerInternal;
    }
    if (this._previewTimecode && this._timeRange) {
      this._previewTimecode.player = playerInternal;
      this._previewTimecode.timeRange = this._timeRange;
    }
    if (this._audioTextDropdownTop) {
      this.wireAudioTextDropdown(this._audioTextDropdownTop);
    }
    if (this._audioTextDropdownBottom) {
      this.wireAudioTextDropdown(this._audioTextDropdownBottom);
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
    if (this._captionsToggle) {
      fromEvent<MouseEvent>(this._captionsToggle, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            playerInternal.textInternal.toggleShowHide();
          },
        });
      playerInternal.textInternal.onEvent$
        .pipe(
          filter((event) => event.type === PlayerTextEventType.PLAYER_TEXT_CHANGE),
          takeUntil(this._playerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: () => {
            const activeSubtitlesTrack =
              playerInternal.textInternal.state.tracks[PlayerTextType.MAIN].find((t) => t.active) ?? playerInternal.textInternal.state.tracks[PlayerTextType.SIDECAR].find((t) => t.active);
            const span = this._captionsToggle?.querySelector('span');
            if (span) {
              if (activeSubtitlesTrack) {
                span.classList.remove('disabled');
                if (activeSubtitlesTrack.shown) {
                  span.classList.remove(ChromingDomClasses.mediaChromeTextOff);
                  span.classList.add(ChromingDomClasses.mediaChromeTextOn);
                } else {
                  span.classList.remove(ChromingDomClasses.mediaChromeTextOn);
                  span.classList.add(ChromingDomClasses.mediaChromeTextOff);
                }
              } else {
                span.classList.add('disabled');
              }
            }
          },
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
    if (this._bitcButton) {
      fromEvent<MouseEvent>(this._bitcButton, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            this.setFloatingTimeVisible(!this.isFloatingTimeVisible());
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
      this.createVuMeter(ChromingTheme.DEFAULT, this._themeConfig, this._floatingVuMeterContainer!, ChromingVuMeterPosition.FLOATING);
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

  protected includeAudioRouter(): boolean {
    return this._themeConfig.controlBar.includes(DefaultThemeControl.ROUTER);
  }

  get theme(): ChromingTheme.DEFAULT {
    return ChromingTheme.DEFAULT;
  }

  get themeConfig() {
    return this._themeConfig;
  }
}
