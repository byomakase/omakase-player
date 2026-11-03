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
import {WindowPlaybackMode} from '../../common';
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
  OmakaseFullscreenButton,
  OmakaseMarkerBar,
  OmakaseMuteButton,
  OmakasePlayButton,
  OmakasePreviewThumbnail,
  OmakaseTimeDisplay,
  OmakaseTimeRange,
  OmakaseTimeSkipButton,
  OmakaseTimeToggle,
  OmakasePlaybackRateSelector,
  OmakaseTrackSelector,
} from '../components';
import {filter, fromEvent, takeUntil} from 'rxjs';
import {PlayerAudioEventType} from '../../player';
import {ChromingUtil} from '../chroming-util';
import {OmakaseTimeDisplayAttributes} from '../components/omakase-time-display';
import type {OmakaseDetachToggle} from '../components/omakase-detach-toggle';
import {isNullOrUndefined} from '../../util/util-functions';

export class OmakaseDomController extends ChromingDomController<ChromingTheme.OMAKASE> {
  protected _themeConfig: OmakaseThemeConfig;

  protected _autoHidePlaybackButtons = false;

  protected _playButton: OmakasePlayButton;
  protected _muteButtons?: OmakaseMuteButton[] | undefined;
  protected _frameForwardButton: OmakaseTimeSkipButton;
  protected _tenFramesForwardButton: OmakaseTimeSkipButton;
  protected _frameBackwardsButton: OmakaseTimeSkipButton;
  protected _tenFramesBackwardsButton: OmakaseTimeSkipButton;
  protected _attachDetachButton: OmakaseDetachToggle;
  protected _playbackRateSelector?: OmakasePlaybackRateSelector;
  protected _timecodeWrapper: HTMLElement;
  protected _currentTimecode: OmakaseTimeDisplay;
  protected _previewTimecode: OmakaseTimeDisplay;
  protected _timeDuration: OmakaseTimeDisplay;
  protected _trackSelector?: OmakaseTrackSelector;
  protected _fullscreenButtons?: OmakaseFullscreenButton[] | undefined;
  protected _previewThumbnail: OmakasePreviewThumbnail;
  protected _controlBarToggle: MediaChromeButton;
  protected _controlBarCloseButton: MediaChromeButton;
  protected _timeToggle?: OmakaseTimeToggle;
  protected _upperControlBar: HTMLElement;
  protected _lowerControlBar: MediaControlBar;

  protected _controlBarVuMeterContainer?: HTMLElement;
  protected _floatingVuMeterContainer?: HTMLElement;

  protected override _enterPictureInPictureHandler = () => {
    if (this._attachDetachButton) {
      this._attachDetachButton.detached = true;
    }
  };

  protected override _leavePictureInPictureHandler = () => {
    if (this._attachDetachButton) {
      this._attachDetachButton.detached = false;
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
            <omakase-time-display ${this._themeConfig.timeInteractive ? 'editable' : ''} class="${ChromingDomClasses.mediaChromeCurrentTimecode}" showduration format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''}></omakase-time-display>
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
          this._themeConfig.actionIcons?.includes(OmakaseThemeActionIcon.FULLSCREEN_TOGGLE)
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
              ? `<omakase-mute-button class="${ChromingDomClasses.mediaChromeButton} shadow" ${this._themeConfig.actionIcons?.includes(OmakaseThemeActionIcon.VOLUME) ? 'volume-flyout="left"' : ''}>
                    <div slot="off" class="omakase-audio-toggle omakase-audio-off"></div>
                    <div slot="low" class="omakase-audio-toggle omakase-audio-on"></div>
                    <div slot="medium" class="omakase-audio-toggle omakase-audio-on"></div>
                    <div slot="high" class="omakase-audio-toggle omakase-audio-on"></div>
                </omakase-mute-button>`
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

    this._frameForwardButton = this.getShadowElementByClass<OmakaseTimeSkipButton>(ChromingDomClasses.frameForwardButton);
    this._tenFramesForwardButton = this.getShadowElementByClass<OmakaseTimeSkipButton>(ChromingDomClasses.tenFramesForwardButton);
    this._frameBackwardsButton = this.getShadowElementByClass<OmakaseTimeSkipButton>(ChromingDomClasses.frameBackwardsButton);
    this._tenFramesBackwardsButton = this.getShadowElementByClass<OmakaseTimeSkipButton>(ChromingDomClasses.tenFramesBackwardsButton);
    this._attachDetachButton = this.getShadowElementByClass<OmakaseDetachToggle>(ChromingDomClasses.attachDetachButton);
    this._playbackRateSelector = this.getShadowElement<OmakasePlaybackRateSelector>('omakase-playback-rate-selector');
    this._timecodeWrapper = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.timecodeWrapper);
    this._currentTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeCurrentTimecode);
    this._previewTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromePreviewTimecode);
    this._timeDuration = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeTimeDuration);
    this._trackSelector = this.getShadowElement<OmakaseTrackSelector>('omakase-track-selector');
    this._controlBarToggle = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.controlBarToggle);
    this._controlBarCloseButton = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.closeButton);
    this._timeToggle = this.getShadowElementByClass<OmakaseTimeToggle>(ChromingDomClasses.bitcButton);
    this._upperControlBar = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.omakaseControlBar);
    this._lowerControlBar = this.getShadowElementByClass<MediaControlBar>(ChromingDomClasses.mediaControlBar);
    this._controlBarVuMeterContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.vuMeterControlBar);
    this._floatingVuMeterContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.vuMeterFloating);
    this._vuMeterToggle = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.vuMeterToggle);

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
      ChromingUtil.observeElementResize(this._timeRange);
      ChromingUtil.onResize$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
        if (this._markerBar && this._timeRange) {
          this._markerBar.containerSize = this._timeRange.rangeWidth;
        }
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
            <div class="start-container">
              <omakase-mute-button class="${this.getControlBarClass(OmakaseThemeControl.VOLUME)} ${ChromingDomClasses.mediaChromeButton} omakase-player-mute" volume-flyout="right">
                  <span slot="high" class="${ChromingDomClasses.mediaChromeAudioHigh}"></span>
                  <span slot="medium" class="${ChromingDomClasses.mediaChromeAudioMedium}"></span>
                  <span slot="low" class="${ChromingDomClasses.mediaChromeAudioLow}"></span>
                  <span slot="off" class="${ChromingDomClasses.mediaChromeAudioMute}"></span>
                  <omakase-volume-range slot="volume"></omakase-volume-range>
              </omakase-mute-button>
              ${
                this._themeConfig.playbackRates
                  ? `<omakase-playback-rate-selector class="omakase-player-playback-rate-toggle ${this.getControlBarClass(OmakaseThemeControl.PLAYBACK_RATE)}" dropdown="speed-dropdown-${this._config.playerHtmlElementId}" rates="${this._themeConfig.playbackRates.join(',')}"></omakase-playback-rate-selector>`
                  : ''
              }
              <slot name="start-container"></slot>
              <div class="${ChromingDomClasses.vuMeter} ${ChromingDomClasses.vuMeterControlBar} ${this.getControlBarClass(OmakaseThemeControl.VU_METER)}"></div>
            </div>
            <div class="center-container">
              <omakase-time-skip-button unit="frame" amount="-10" class="${this.getControlBarClass(OmakaseThemeControl.TEN_FRAMES_BACKWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-ten-frames-backwards"></omakase-time-skip-button>
              <omakase-time-skip-button unit="frame" amount="-1" class="${this.getControlBarClass(OmakaseThemeControl.FRAME_BACKWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-frame-backwards"></omakase-time-skip-button>
              <omakase-play-button class="${this.getControlBarClass(OmakaseThemeControl.PLAY)} ${ChromingDomClasses.mediaChromeButton} omakase-player-play">
                  <span slot="play" class="${ChromingDomClasses.mediaChromePlay}"></span>
                  <span slot="pause" class="${ChromingDomClasses.mediaChromePause}"></span>
              </omakase-play-button>
              <omakase-time-skip-button unit="frame" amount="1" class="${this.getControlBarClass(OmakaseThemeControl.FRAME_FORWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-frame-forward"></omakase-time-skip-button>
              <omakase-time-skip-button unit="frame" amount="10" class="${this.getControlBarClass(OmakaseThemeControl.TEN_FRAMES_FORWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-ten-frames-forward"></omakase-time-skip-button>
            </div>
            <div class="end-container">
              <slot name="end-container"></slot>
              <media-chrome-button class="${this.getControlBarClass(OmakaseThemeControl.VU_METER_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} ${ChromingDomClasses.vuMeterToggle}">
                  <span class="${ChromingDomClasses.mediaChromeVuMeterToggle}"></span>
                </media-chrome-button>
              <omakase-track-selector class="${this.getControlBarClass(OmakaseThemeControl.TRACK_SELECTOR)}" dropdown="audio-dropdown-${this._config.playerHtmlElementId}" container-right="-1px" toggle-class="${ChromingDomClasses.mediaChromeButton} omakase-player-trackselector">
                  <span slot="toggle" class="${ChromingDomClasses.mediaChromeTrackselector}"></span>
                  <media-tooltip slot="toggle">Select track</media-tooltip>
              </omakase-track-selector>
              <omakase-time-toggle class="${this.getControlBarClass(OmakaseThemeControl.TIME_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} omakase-player-bitc">
                  <media-tooltip>Show timecode</media-tooltip>
              </omakase-time-toggle>
              <omakase-detach-toggle class="${this.getControlBarClass(OmakaseThemeControl.DETACH_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} omakase-player-attach-detach"${this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED ? ' detached' : ''}></omakase-detach-toggle>
              <omakase-fullscreen-button class="${this.getControlBarClass(OmakaseThemeControl.FULLSCREEN_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} omakase-player-fullscreen">
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

  protected createSlotsDom() {
    if (this._config.themeConfig?.htmlTemplateId) {
      return DomUtil.getElementById<HTMLElement>(this._config.themeConfig?.htmlTemplateId)?.innerHTML ?? '';
    } else {
      return '';
    }
  }

  override createMainMediaVideoElement() {
    super.createMainMediaVideoElement();
    this._themeElement.insertAdjacentHTML('beforeend', this.createSlotsDom());
  }

  setThumbnailTrack(track: ThumbnailTrackState | undefined): void {
    super.setThumbnailTrack(track);
    if (this._previewThumbnail) {
      this._previewThumbnail.thumbnailTrack = track;
      this._previewThumbnail.thumbnailFn = this._config.findThumbnailFn;
    }
  }

  setThemeConfig(themeConfig: Partial<OmakaseThemeConfigUpdateableAttrs>) {
    this._themeConfig = {
      ...this._themeConfig,
      timeFormat: themeConfig.timeFormat ?? this._themeConfig.timeFormat,
      timeInteractive: themeConfig.timeInteractive ?? this._themeConfig.timeInteractive,
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
    this.updateTimeInteractivity();
    if (themeConfig.vuMeterConfig || themeConfig.floatingVuMeterConfig) {
      this.updateVuMeterConfig(this._themeConfig, ChromingVuMeterPosition.FLOATING);
    }
    if (themeConfig.vuMeterConfig || themeConfig.controlBarVuMeterConfig) {
      this.updateVuMeterConfig(this._themeConfig, ChromingVuMeterPosition.CONTROL_BAR);
    }
  }

  setFloatingTimeVisible(visible: boolean, timeInteractive?: boolean, openEditMode?: boolean): void {
    const floatingControls = this._themeConfig.floatingControls;
    if (visible && floatingControls && !floatingControls.includes(OmakaseThemeFloatingControl.TIME)) {
      floatingControls.push(OmakaseThemeFloatingControl.TIME);
      this.updateFloatingTime();
    } else if (!visible && floatingControls && floatingControls.includes(OmakaseThemeFloatingControl.TIME)) {
      floatingControls.splice(floatingControls.indexOf(OmakaseThemeFloatingControl.TIME), 1);
      this.updateFloatingTime();
    }
    if (!isNullOrUndefined(timeInteractive)) {
      this._themeConfig.timeInteractive = timeInteractive;
      this.updateTimeInteractivity();
    }
    if (!isNullOrUndefined(openEditMode) && this._currentTimecode) {
      if (openEditMode) {
        if (!this._themeConfig.timeInteractive) {
          throw new Error('Unsupported mode');
        }
        this._currentTimecode.enableEditMode();
      } else {
        this._currentTimecode.disableEditMode();
      }
    }
    this._themeConfigChange$.next();
  }

  updateTimeInteractivity() {
    if (this._currentTimecode) {
      if (this._themeConfig.timeInteractive) {
        this._currentTimecode.setAttribute(OmakaseTimeDisplayAttributes.EDITABLE, '');
      } else {
        this._currentTimecode.removeAttribute(OmakaseTimeDisplayAttributes.EDITABLE);
      }
    }
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
    if (this._timeToggle) {
      this._timeToggle.timeVisible = bitcEnabled;
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
    if (this._trackSelector) {
      this._trackSelector.router = this.includeAudioRouter();
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
        this._lowerControlBar.classList.add(ChromingDomClasses.controlBarOffset);
      } else {
        this._lowerControlBar.classList.remove(ChromingDomClasses.controlBarOffset);
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

  protected override _liveButtonContainer(): HTMLElement | undefined {
    return this.getShadowElement<HTMLElement>('.omakase-control-bar-upper .start-container');
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
    if (this._trackSelector) {
      this._trackSelector.player = playerInternal;
    }
    if (this._timeRange) {
      this._timeRange.player = playerInternal;
      this._timeRange.onSeek$.pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (time) => {
          playerInternal.seekTo(time);
        },
      });
      if (this._previewThumbnail) {
        this._previewThumbnail.timeRange = this._timeRange;
      }
    }
    if (this._vuMeterToggle) {
      fromEvent<MouseEvent>(this._vuMeterToggle, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            this.setFloatingVuMeterVisible(!this._themeConfig.isFloatingVuMeterVisible);
          },
        });
      this._playerAudio!.onEvent$.pipe(
        filter((event) => event.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED),
        takeUntil(this._playerBreaker.observer),
        takeUntil(this._destroyBreaker.observer)
      ).subscribe((event) => {
        this.updateFloatingVuMeterToggle(event.data.playerAudio);
      });
    }
    if (this._frameForwardButton) {
      this._frameForwardButton.player = playerInternal;
    }
    if (this._tenFramesForwardButton) {
      this._tenFramesForwardButton.player = playerInternal;
    }
    if (this._frameBackwardsButton) {
      this._frameBackwardsButton.player = playerInternal;
    }
    if (this._tenFramesBackwardsButton) {
      this._tenFramesBackwardsButton.player = playerInternal;
    }
    if (this._attachDetachButton) {
      this._attachDetachButton.handler = {
        attach: () => {
          if (this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED) {
            this._config.requestAttachFn();
          } else {
            // picture in picture: leaving it is the "attach" action
            this.togglePiP();
          }
        },
        detach: () => {
          if (this._config.playerDetachable) {
            this._config.requestDetachFn();
          } else {
            this.togglePiP();
          }
        },
      };
    }
    if (this._playbackRateSelector) {
      this._playbackRateSelector.player = playerInternal;
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
    if (this._timeToggle) {
      fromEvent<MouseEvent>(this._timeToggle, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            this.setFloatingTimeVisible(!this.isFloatingTimeVisible());
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
    this.updateSimpleFullscreenTimeFormat();
  }

  updateTimeFormat() {
    if (this._currentTimecode) {
      this._currentTimecode.displayFormat = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._currentTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
      this._currentTimecode.updateTime();
    }
    if (this._timeDuration) {
      this._timeDuration.displayFormat = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._timeDuration.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
      this._timeDuration.updateTime();
    }
    if (this._previewTimecode) {
      this._previewTimecode.displayFormat = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
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
    if (this._playbackRateSelector) {
      this._playbackRateSelector.playbackRate = 1;
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
