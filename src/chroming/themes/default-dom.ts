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
import {PlayerAudioEventType} from '../../player';
import {ChromingDomClasses, type ChromingDomConfig, ChromingDomController} from '../chroming-dom';
import '../components';
import '../../vu-meter/components';
import {DomUtil} from '../../dom/dom-util';
import type {
  OmakaseFullscreenButton,
  OmakaseMarkerBar,
  OmakaseMuteButton,
  OmakaseCaptionsToggle,
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
import type {MediaChromeButton} from 'media-chrome';
import {WindowPlaybackMode} from '../../common';
import type {ThumbnailTrackState} from '../../media/thumbnail-track';
import {ChromingUtil} from '../chroming-util';
import {VuMeterTheme} from '../../vu-meter';
import {OmakaseTimeDisplayAttributes} from '../components/omakase-time-display';
import type {OmakaseDetachToggle} from '../components/omakase-detach-toggle';
import {isNullOrUndefined} from '../../util/util-functions';

export class DefaultDomController extends ChromingDomController<ChromingTheme.DEFAULT> {
  protected _themeConfig: DefaultThemeConfig;

  protected _playButton?: OmakasePlayButton;
  protected _muteButton?: OmakaseMuteButton;
  protected _frameForwardButton?: OmakaseTimeSkipButton;
  protected _tenFramesForwardButton?: OmakaseTimeSkipButton;
  protected _frameBackwardsButton?: OmakaseTimeSkipButton;
  protected _tenFramesBackwardsButton?: OmakaseTimeSkipButton;
  protected _timeToggle?: OmakaseTimeToggle;
  protected _captionsToggle?: OmakaseCaptionsToggle;
  protected _fullscreenButton?: OmakaseFullscreenButton;

  protected _playbackRateSelector?: OmakasePlaybackRateSelector;

  protected _trackSelectorTop?: OmakaseTrackSelector;
  protected _trackSelectorBottom?: OmakaseTrackSelector;

  protected _timecodeContainer?: HTMLElement;
  protected _currentTimecode?: OmakaseTimeDisplay;
  protected _previewTimecode?: OmakaseTimeDisplay;
  protected _previewThumbnail?: OmakasePreviewThumbnail;

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
      this._divActionIcons?.insertAdjacentHTML(
        'afterbegin',
        `<omakase-track-selector class="${ChromingDomClasses.trackSelectorTop}" dropdown="audio-dropdown-${this._config.playerHtmlElementId}-top" position="below" container-right="2.5%" dropdown-class="${ChromingDomClasses.audioTextDropdownTop}" toggle-class="audio-dropdown-toggle-top">
          <media-chrome-button slot="toggle" class="${ChromingDomClasses.mediaChromeButton} omakase-player-audio-text">
            <span class="${ChromingDomClasses.mediaChromeAudioText} shadow"></span>
          </media-chrome-button>
        </omakase-track-selector>`
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
    this._frameForwardButton = this.getShadowElementByClass<OmakaseTimeSkipButton>(ChromingDomClasses.frameForwardButton);
    this._tenFramesForwardButton = this.getShadowElementByClass<OmakaseTimeSkipButton>(ChromingDomClasses.tenFramesForwardButton);
    this._frameBackwardsButton = this.getShadowElementByClass<OmakaseTimeSkipButton>(ChromingDomClasses.frameBackwardsButton);
    this._tenFramesBackwardsButton = this.getShadowElementByClass<OmakaseTimeSkipButton>(ChromingDomClasses.tenFramesBackwardsButton);
    this._attachDetachButton = this.getShadowElementByClass<OmakaseDetachToggle>(ChromingDomClasses.attachDetachButton);
    this._timeToggle = this.getShadowElementByClass<OmakaseTimeToggle>(ChromingDomClasses.bitcButton);
    this._playbackRateSelector = this.getShadowElement<OmakasePlaybackRateSelector>('omakase-playback-rate-selector');
    this._timecodeContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.timecodeContainer);
    this._currentTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeCurrentTimecode);
    this._previewTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromePreviewTimecode);
    this._trackSelectorTop = this.getShadowElementByClass<OmakaseTrackSelector>(ChromingDomClasses.trackSelectorTop);
    this._trackSelectorBottom = this.getShadowElementByClass<OmakaseTrackSelector>(ChromingDomClasses.trackSelectorBottom);
    this._captionsToggle = this.getShadowElementByClass<OmakaseCaptionsToggle>(ChromingDomClasses.omakaseTextToggle);
    this._controlBarVuMeterContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.vuMeterControlBar);
    this._floatingVuMeterContainer = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.vuMeterFloating);
    this._vuMeterToggle = this.getShadowElementByClass<MediaChromeButton>(ChromingDomClasses.vuMeterToggle);

    if (this._timeRange) {
      ChromingUtil.observeElementResize(this._timeRange);
      ChromingUtil.onResize$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
        if (this._markerBar && this._timeRange) {
          this._markerBar.containerSize = this._timeRange.rangeWidth;
        }
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
            <omakase-time-display ${this._themeConfig.timeInteractive ? 'editable' : ''} format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
        </div>
        <media-control-bar class="upper-control-bar">
            <omakase-marker-bars></omakase-marker-bars>
              <omakase-time-range class="${this.getControlBarClass(DefaultThemeControl.SCRUBBER)} omakase-time-range">
                  <div slot="preview" class="${ChromingDomClasses.mediaChromePreviewWrapper}">
                      <omakase-preview-thumbnail class="${ChromingDomClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
                      <omakase-time-display format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromePreviewTimecode}"></omakase-time-display>
                  </div>
              </omakase-time-range>
            <slot name="dropdown-container"></slot>
        </media-control-bar>
        <media-control-bar class="lower-control-bar">
            <div class="start-container">
                <omakase-mute-button class="${this.getControlBarClass(DefaultThemeControl.VOLUME)} ${ChromingDomClasses.mediaChromeButton} omakase-player-mute" volume-flyout="right">
                    <span slot="high" class="${ChromingDomClasses.mediaChromeAudioHigh}"></span>
                    <span slot="medium" class="${ChromingDomClasses.mediaChromeAudioMedium}"></span>
                    <span slot="low" class="${ChromingDomClasses.mediaChromeAudioLow}"></span>
                    <span slot="off" class="${ChromingDomClasses.mediaChromeAudioMute}"></span>
                    <omakase-volume-range slot="volume" class="omakase-volume-range"></omakase-volume-range>
                </omakase-mute-button>
                <omakase-captions-toggle class="${this.getControlBarClass(DefaultThemeControl.TEXT_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} ${ChromingDomClasses.omakaseTextToggle}">
                    <span class="${ChromingDomClasses.mediaChromeTextOn} disabled"></span>
                </omakase-captions-toggle>
                ${
                  this._themeConfig.playbackRates
                    ? `<omakase-playback-rate-selector class="${this.getControlBarClass(DefaultThemeControl.PLAYBACK_RATE)}" dropdown="speed-dropdown-${this._config.playerHtmlElementId}" rates="${this._themeConfig.playbackRates.join(',')}"></omakase-playback-rate-selector>`
                    : ''
                }
                <slot name="start-container"></slot>
                <div class="${ChromingDomClasses.vuMeter} ${ChromingDomClasses.vuMeterControlBar} ${this.getControlBarClass(DefaultThemeControl.VU_METER)}"></div>
            </div>
            <div class="center-container">
                <omakase-time-skip-button unit="frame" amount="-10" class="${this.getControlBarClass(DefaultThemeControl.TEN_FRAMES_BACKWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-ten-frames-backwards"></omakase-time-skip-button>
                <omakase-time-skip-button unit="frame" amount="-1" class="${this.getControlBarClass(DefaultThemeControl.FRAME_BACKWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-frame-backwards"></omakase-time-skip-button>
                <omakase-play-button class="${this.getControlBarClass(DefaultThemeControl.PLAY)} ${ChromingDomClasses.mediaChromeButton} omakase-player-play">
                    <span slot="play" class="${ChromingDomClasses.mediaChromePlay}"></span>
                    <span slot="pause" class="${ChromingDomClasses.mediaChromePause}"></span>
                </omakase-play-button>
                <omakase-time-skip-button unit="frame" amount="1" class="${this.getControlBarClass(DefaultThemeControl.FRAME_FORWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-frame-forward"></omakase-time-skip-button>
                <omakase-time-skip-button unit="frame" amount="10" class="${this.getControlBarClass(DefaultThemeControl.TEN_FRAMES_FORWARD)} ${ChromingDomClasses.mediaChromeButton} omakase-player-ten-frames-forward"></omakase-time-skip-button>
            </div>
            <div class="end-container">
                <slot name="end-container"></slot>
                <media-chrome-button class="${this.getControlBarClass(DefaultThemeControl.VU_METER_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} ${ChromingDomClasses.vuMeterToggle}">
                  <span class="${ChromingDomClasses.mediaChromeVuMeterToggle}"></span>
                </media-chrome-button>
                <omakase-track-selector class="${this.getControlBarClass(DefaultThemeControl.TRACK_SELECTOR)} ${ChromingDomClasses.trackSelectorBottom}" dropdown="audio-dropdown-${this._config.playerHtmlElementId}-bottom" container-right="20px" dropdown-class="${ChromingDomClasses.audioTextDropdownBottom}" toggle-class="audio-dropdown-toggle-bottom">
                    <media-chrome-button slot="toggle" class="${ChromingDomClasses.mediaChromeButton} omakase-player-audio-text">
                    <span class="${ChromingDomClasses.mediaChromeAudioText}"></span>
                    </media-chrome-button>
                </omakase-track-selector>
                <omakase-time-toggle class="${this.getControlBarClass(DefaultThemeControl.TIME_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} omakase-player-bitc">
                    <media-tooltip>Show timecode</media-tooltip>
                </omakase-time-toggle>
                <omakase-detach-toggle class="${this.getControlBarClass(DefaultThemeControl.DETACH_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} omakase-player-attach-detach"${this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED ? ' detached' : ''}></omakase-detach-toggle>
                <omakase-fullscreen-button class="${this.getControlBarClass(DefaultThemeControl.FULLSCREEN_TOGGLE)} ${ChromingDomClasses.mediaChromeButton} omakase-player-fullscreen">
                    <span slot="enter" class="${ChromingDomClasses.mediaChromeFullscreenEnter}"></span>
                    <span slot="exit" class="${ChromingDomClasses.mediaChromeFullscreenExit}"></span>
                </omakase-fullscreen-button>
            </div>
        </media-control-bar>`;
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

  setThemeConfig(themeConfig: Partial<DefaultThemeConfigUpdateableAttrs>) {
    this._themeConfig = {
      ...this._themeConfig,
      controlBarVisibility: themeConfig.controlBarVisibility ?? this._themeConfig.controlBarVisibility,
      controlBar: themeConfig.controlBar ?? this._themeConfig.controlBar,
      floatingControls: (themeConfig as DefaultThemeConfig).floatingControls ?? this._themeConfig.floatingControls,
      timeFormat: themeConfig.timeFormat ?? this._themeConfig.timeFormat,
      timeInteractive: themeConfig.timeInteractive ?? this._themeConfig.timeInteractive,
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
    for (const trackSelector of [this._trackSelectorTop, this._trackSelectorBottom]) {
      if (trackSelector) {
        trackSelector.floating = !this._themeConfig.trackSelectorAutoClose;
        trackSelector.router = this.includeAudioRouter();
      }
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
    this.updateTimeInteractivity();
  }

  setTimeFormat(timeFormat: ChromingTimeFormat) {
    this._themeConfig = {
      ...this._themeConfig,
      timeFormat,
    };
    this.updateTimeFormat();
    this.updateSimpleFullscreenTimeFormat();
  }

  updateTimeFormat() {
    if (this._currentTimecode) {
      this._currentTimecode.displayFormat = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._currentTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
      this._currentTimecode.updateTime();
    }
    if (this._previewTimecode) {
      this._previewTimecode.displayFormat = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._previewTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
    }
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

  setFloatingTimeVisible(visible: boolean, timeInteractive?: boolean, openEditMode?: boolean): void {
    const floatingControls = this._themeConfig.floatingControls;
    if (visible && floatingControls && !floatingControls.includes(DefaultThemeFloatingControl.TIME)) {
      floatingControls.push(DefaultThemeFloatingControl.TIME);
      this.updateFloatingTime();
    } else if (!visible && floatingControls && floatingControls.includes(DefaultThemeFloatingControl.TIME)) {
      floatingControls.splice(floatingControls.indexOf(DefaultThemeFloatingControl.TIME), 1);
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

  isFloatingTimeVisible(): boolean {
    return this._themeConfig.floatingControls?.includes(DefaultThemeFloatingControl.TIME) ?? false;
  }

  updateFloatingTime() {
    const bitcEnabled = !!this._themeConfig.floatingControls?.includes(DefaultThemeFloatingControl.TIME);
    if (bitcEnabled) {
      DomUtil.showElements(this._timecodeContainer!);
    } else {
      DomUtil.hideElements(this._timecodeContainer!);
    }
    if (this._timeToggle) {
      this._timeToggle.timeVisible = bitcEnabled;
    }
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
    if (!this._themeConfig.controlBar?.includes(DefaultThemeControl.TRACK_SELECTOR) && this._trackSelectorBottom) {
      this._trackSelectorBottom.style.display = 'none';
    }
    if (!this._themeConfig.controlBar?.includes(DefaultThemeControl.PLAYBACK_RATE) && this._playbackRateSelector) {
      this._playbackRateSelector.style.display = 'none';
    }
  }

  setThumbnailTrack(track: ThumbnailTrackState | undefined) {
    super.setThumbnailTrack(track);
    if (this._previewThumbnail) {
      this._previewThumbnail.thumbnailTrack = track;
      this._previewThumbnail.thumbnailFn = this._config.findThumbnailFn;
    }
  }

  protected override _liveButtonContainer(): HTMLElement | undefined {
    return this.getShadowElement<HTMLElement>('.lower-control-bar .start-container');
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
    if (this._trackSelectorTop) {
      this._trackSelectorTop.player = playerInternal;
    }
    if (this._trackSelectorBottom) {
      this._trackSelectorBottom.player = playerInternal;
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
    if (this._captionsToggle) {
      this._captionsToggle.player = playerInternal;
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
    if (this._timeToggle) {
      fromEvent<MouseEvent>(this._timeToggle, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            this.setFloatingTimeVisible(!this.isFloatingTimeVisible());
          },
        });
    }
    if (this._playbackRateSelector) {
      this._playbackRateSelector.player = playerInternal;
    }
  }

  resetMainMediaVideoElement(): void {
    super.resetMainMediaVideoElement();
    this.addPiPListeners();
    if (this._playbackRateSelector) {
      this._playbackRateSelector.playbackRate = 1;
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
