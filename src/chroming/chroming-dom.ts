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

import 'media-chrome';
import 'media-chrome/media-theme-element';
import {DomUtil} from '../dom/dom-util';
import type {MediaChromeButton, MediaController} from 'media-chrome';
import type {MediaThemeElement} from 'media-chrome/media-theme-element';
import {CryptoUtil} from '../util/crypto-util';
import type {PlayerAudioState, PlayerAudioTrackState, PlayerDomController, PlayerInternalApi, PlayerPlayback, PlayerTextTrackState} from '../player';
import {PlayerAudioMode, PlayerAudioType, PlayerEventType} from '../player';
import {debounceTime, distinctUntilChanged, filter, fromEvent, merge, Observable, Subject, takeUntil} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import {
  ChromingTheme,
  type ChromingThemeConfigMap,
  ChromingTrackDestination,
  type ChromingVuMeterConfig,
  ChromingVuMeterPosition,
  type DefaultThemeConfig,
  FullscreenChroming,
  type HelpMenuGroup,
  type OmakaseDropdownListItem,
  type OmakaseThemeConfig,
  type PlayerChromingCommonConfig,
  type PlayerChromingThemeConfig,
  type VideoSafeZone,
  type VideoSafeZoneCreate,
  WatermarkVisibility,
} from './chroming-api';
import {StringUtil} from '../util/string-util';
// @ts-ignore
import playerChromingStyle from '../../style/player-chroming/player-chroming.css?raw';
// @ts-ignore
import mediaCaptionsStyle from '../../node_modules/media-captions/styles/captions.css?raw';
import {BrowserProvider} from '../common/browser-provider';
import {type DomMediaElementConfig, HTMLVideoElementEvent} from '../dom/dom-media-element';
import {WindowPlaybackMode} from '../common';
import {errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {Fullscreen} from '../common/fullscreen';
import {OpStageStatus} from '../common/op-stage';
import type {Alert, AlertState} from '../session/alerts-api';
import {OmakaseDropdown, OmakaseDropdownList, OmakaseMarkerBar, OmakaseMarkerTrack, OmakaseTimeDisplay, OmakaseTimeRange} from './components';
import {MainMediaType, type AudioState, type MarkerState, type MarkerTrackState, type TextTrackState, type ThumbnailState, type ThumbnailTrackState} from '../media';
import {ChromingUtil} from './chroming-util';
import type {OmakaseRouterVisualization} from './components/omakase-router-visualization';
import type {AudioHandlerApi} from '../audio';
import {type VideoKeyframe, VideoKeyframeExtractor, type VideoKeyframeOptions} from '../tools/keyframe-extractor';
import {AudioLevelSource, PeakProcessorAudioLevelSource, VuMeter, VuMeterOrientation} from '../vu-meter';

export interface ChromingDomConfig<T extends ChromingTheme> extends PlayerChromingThemeConfig<T>, PlayerChromingCommonConfig {
  playerHtmlElementId: string;
  playerWindowPlaybackMode: WindowPlaybackMode;
  playerDetachable: boolean;

  requestAttachFn: () => void;
  requestDetachFn: () => void;
  findThumbnailFn: (trackId: string, time: number) => Observable<ThumbnailState | undefined>;

  mediaElement?: Partial<Pick<DomMediaElementConfig, 'crossOrigin'>>;
}

export interface ChromingAudioTrackUpdateAttrs {
  type: PlayerAudioType;
  playerTrack: PlayerAudioTrackState;
}

export interface ChromingAudioTrack extends ChromingAudioTrackUpdateAttrs {
  audioTrack: AudioState;
}

export interface ChromingTextTrack {
  playerTrack: PlayerTextTrackState;
  textTrack: TextTrackState;
}

export const ChromingDomClasses = {
  video: 'omakase-video',
  videoFill: 'omakase-video-fill',
  mediaController: 'omakase-media-controller',
  mediaTheme: 'omakase-media-theme',
  playerFullscreen: 'omakase-player-fullscreen',

  backgroundImage: 'omakase-background-image',
  backgroundLogo: 'omakase-background-logo',

  safeZoneWrapper: 'omakase-video-safe-zone-wrapper',
  safeZone: 'omakase-video-safe-zone',
  watermarkWrapper: 'omakase-watermark-wrapper',
  watermark: 'omakase-watermark',
  mediaCaptions: 'omakase-media-captions',
  imsc: 'omakase-imsc',

  sectionTopLeft: 'omakase-section-top-left',
  sectionTopRight: 'omakase-section-top-right',
  actionIcons: 'omakase-action-icons',

  help: 'omakase-help',
  helpMenu: 'omakase-help-menu',
  helpWrapper: 'omakase-help-wrapper',

  alerts: 'omakase-alerts',

  overlayButtons: 'omakase-overlay-buttons',
  playbackButtons: 'omakase-playback-buttons',
  buttonOverlayPlay: 'omakase-button-play',
  buttonOverlayPause: 'omakase-button-pause',
  buttonOverlayLoading: 'omakase-button-loading',
  buttonOverlayError: 'omakase-button-error',
  buttonOverlayReplay: 'omakase-button-replay',
  buttonOverlayHelp: 'omakase-help-button',
  buttonOverlayAttach: 'omakase-overlay-button-attach',

  mediaChromeButton: 'media-chrome-button',
  mediaChromePlay: 'media-chrome-play',
  mediaChromePause: 'media-chrome-pause',
  mediaRewindButton: 'media-chrome-frame-backwards',
  mediaFastRewindButton: 'media-chrome-ten-frames-backwards',
  mediaForwardButton: 'media-chrome-frame-forward',
  mediaFastForwardButton: 'media-chrome-ten-frames-forward',
  mediaChromeFullscreenEnter: 'media-chrome-fullscreen-enter',
  mediaChromeFullscreenExit: 'media-chrome-fullscreen-exit',
  mediaChromeDetach: 'media-chrome-detach',
  mediaChromeAttach: 'media-chrome-attach',
  mediaChromeAudioMute: 'media-chrome-audio-mute',
  mediaChromeAudioLow: 'media-chrome-audio-low',
  mediaChromeAudioMedium: 'media-chrome-audio-medium',
  mediaChromeAudioHigh: 'media-chrome-audio-high',
  mediaChromeBitcDisabled: 'media-chrome-bitc-disabled',
  mediaChromeBitcEnabled: 'media-chrome-bitc-enabled',
  mediaChromeSettings: 'media-chrome-settings',
  mediaChromeAudioText: 'media-chrome-audio-text',
  mediaChromeAudio: 'media-chrome-audio',
  mediaChromeBitcTooltip: 'media-chrome-bitc-tooltip',
  mediaChromeCurrentTimecode: 'media-chrome-current-timecode',
  mediaChromeTimeDuration: 'media-chrome-time-duration',
  mediaChromePreviewTimecode: 'media-chrome-preview-timecode',
  mediaChromePreviewThumbnail: 'media-chrome-preview-thumbnail',
  mediaChromePreviewWrapper: 'media-chrome-preview-wrapper',
  mediaChromeTextOn: 'media-chrome-text-on',
  mediaChromeTextOff: 'media-chrome-text-off',
  mediaChromeHelp: 'media-chrome-help',
  mediaChromeTrackselector: 'media-chrome-trackselector',
  mediaChromeControlBarToggle: 'media-chrome-control-bar-toggle',
  mediaChromeClose: 'media-chrome-close',
  mediaChromeBack: 'media-chrome-back',
  mediaChromeVuMeterToggle: 'media-chrome-vu-meter-toggle',
  mediaControlBar: 'media-control-bar',
  omakaseControlBar: 'omakase-control-bar',
  timecodeContainer: 'timecode-container',
  timecodeWrapper: 'omakase-timecode-wrapper',
  timecodeFormatTimecode: 'omakase-timecode-format-timecode',
  timecodeFormatStandard: 'omakase-timecode-format-standard',
  audioTextDropdown: 'omakase-audio-text-dropdown',
  omakaseTextToggle: 'omakase-player-text-toggle',
  controlBarOffset: 'control-bar-offset',

  frameForwardButton: 'omakase-player-frame-forward',
  frameBackwardsButton: 'omakase-player-frame-backwards',
  tenFramesForwardButton: 'omakase-player-ten-frames-forward',
  tenFramesBackwardsButton: 'omakase-player-ten-frames-backwards',
  attachDetachButton: 'omakase-player-attach-detach',
  bitcButton: 'omakase-player-bitc',
  closeButton: 'omakase-player-close',
  controlBarPrefix: 'omakase-control-bar',
  controlBarToggle: 'omakase-player-control-bar-toggle',
  speedDropdownList: 'omakase-speed-dropdown-list',
  speedDropdown: 'omakase-speed-dropdown',
  audioTextDropdownTop: 'omakase-audio-text-dropdown-top',
  audioTextDropdownBottom: 'omakase-audio-text-dropdown-bottom',
  audioDropdownList: 'omakase-audio-dropdown-list',
  sidecarDropdownList: 'omakase-sidecar-dropdown-list',
  textDropdownList: 'omakase-text-dropdown-list',
  audioBackground: 'omakase-audio-background',
  audioRouterDropdown: 'omakase-audio-router-dropdown',

  mediaThemeCompact: 'omakase-media-theme-compact-audio',
  mediaControllerCompact: 'compact',
  mediaControllerWithCaptions: 'with-captions',

  audioRouter: 'media-chrome-router',
  audioRouterDefault: 'media-chrome-router-default',
  audioRouterChanged: 'media-chrome-router-changed',

  vuMeter: 'omakase-vu-meter',
  vuMeterFloating: 'omakase-vu-meter-floating',
  vuMeterControlBar: 'omakase-vu-meter-control-bar',
  vuMeterFloatingActive: 'omakase-vu-meter-floating-active',
  vuMeterNotSupported: 'omakase-vu-meter-not-supported',
  vuMeterToggle: 'omakase-vu-meter-toggle',

  alert: 'omakase-alert',
  alertIcon: 'omakase-alert-icon',
  alertText: 'alert-text',

  withControlBar: 'with-control-bar',
  withControlBarVuMeter: 'with-control-bar-vu-meter',
};

export abstract class ChromingDomController<T extends ChromingTheme> implements PlayerDomController, Destroyable {
  protected _themeConfigChange$ = new Subject<void>();

  protected _config: ChromingDomConfig<T>;
  protected _playerInternal: PlayerInternalApi | undefined;
  protected _mainMediaType: MainMediaType | undefined;

  protected _themeElement: MediaThemeElement;
  protected _videoElementId: string;
  protected _htmlElement: HTMLElement;
  protected _mediaControllerElement: MediaController;
  protected _mainMediaVideoElement: HTMLVideoElement;

  protected _divButtonOverlayPlay: HTMLElement;
  protected _divButtonOverlayPause: HTMLElement;
  protected _divButtonOverlayLoading: HTMLElement;
  protected _divButtonOverlayError: HTMLElement;
  protected _divButtonOverlayReplay: HTMLElement;
  protected _divButtonOverlayAttach: HTMLElement;
  protected _divWatermark: HTMLElement;
  protected _divSafeZoneWrapper: HTMLElement;
  protected _divBackground: HTMLElement;
  protected _divPlaybackButtons: HTMLElement;
  protected _autoHidePlaybackButtons = true;

  protected _divActionIcons: HTMLElement;
  protected _divAlerts: HTMLElement;

  protected _divHelp?: HTMLElement;
  protected _divHelpMenu?: HTMLElement;
  protected _divHelpWrapper?: HTMLElement;
  protected _divButtonHelp?: HTMLElement;

  protected _textMediaCaptionsElement: HTMLElement;
  protected _textImscElement: HTMLElement;

  protected _markerBar?: OmakaseMarkerBar;
  protected _timeRange?: OmakaseTimeRange;
  protected _attachDetachButton?: MediaChromeButton;

  protected _vuMeterToggle?: MediaChromeButton;
  protected _audioLevelSource?: AudioLevelSource;

  protected _audioDropdownLists: {
    [PlayerAudioType.MAIN]: OmakaseDropdownList[];
    [PlayerAudioType.SIDECAR]: OmakaseDropdownList[];
  } = {
    [PlayerAudioType.MAIN]: [],
    [PlayerAudioType.SIDECAR]: [],
  };
  protected _textDropdownLists: OmakaseDropdownList[] = [];

  protected _vuMeters: {
    [ChromingVuMeterPosition.CONTROL_BAR]: VuMeter | undefined;
    [ChromingVuMeterPosition.FLOATING]: VuMeter | undefined;
  } = {
    [ChromingVuMeterPosition.CONTROL_BAR]: void 0,
    [ChromingVuMeterPosition.FLOATING]: void 0,
  };

  protected _posterDisplayDelay = 1000;
  protected _hideBackgroundOnSetPoster = false;

  protected _playerPlayback?: PlayerPlayback | undefined;
  protected _seekingToTime?: number;
  protected _seekAnimationDelay = 100;

  private _showTemporaryOnMouseMoveTimeoutId?: ReturnType<typeof setTimeout>;
  private _showTemporaryBackgroundTimeoutId?: ReturnType<typeof setTimeout>;
  private _showSeekLoadingAnimationTimeoutId?: ReturnType<typeof setTimeout>;

  protected _playerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  protected _alertClosed$ = new Subject<Alert['id']>();
  protected _attachDetachButtonEnabled$ = new Subject<boolean>();
  private _maxAlertCount = 5;
  private _maxStackCount = 3;

  protected _enterPictureInPictureHandler?: () => void;
  protected _leavePictureInPictureHandler?: () => void;
  protected _fullscreenChangeHandler: () => void;
  protected _documentClickListener: ((event: MouseEvent) => void) | undefined;

  protected constructor(config: ChromingDomConfig<T>) {
    this._config = config;

    this._htmlElement = DomUtil.getElementByIdOrFail<HTMLElement>(this._config.playerHtmlElementId);

    if (!this._htmlElement) {
      throw new Error(`No html element with id ${this._config.playerHtmlElementId}`);
    }

    ChromingUtil.connectResizeObserver(this._htmlElement);

    this._videoElementId = CryptoUtil.uuid();

    this._htmlElement.innerHTML = `
        ${this.createTemplateDom()}
        <media-theme class="${ChromingDomClasses.mediaTheme}" template="omakase-player-theme-${this._config.playerHtmlElementId}">
        </media-theme>`;

    this._themeElement = DomUtil.getElementByClass<MediaThemeElement>(ChromingDomClasses.mediaTheme, this._htmlElement);
    this._mediaControllerElement = this.getShadowElementByClass<MediaController>(ChromingDomClasses.mediaController);

    this.createMainMediaVideoElement();
    this._mainMediaVideoElement = DomUtil.getElementByIdOrFail<HTMLVideoElement>(this._videoElementId);

    this._divButtonOverlayPlay = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.buttonOverlayPlay);
    this._divButtonOverlayPause = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.buttonOverlayPause);
    this._divButtonOverlayLoading = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.buttonOverlayLoading);
    this._divButtonOverlayError = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.buttonOverlayError);
    this._divButtonOverlayReplay = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.buttonOverlayReplay);
    this._divButtonOverlayAttach = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.buttonOverlayAttach);
    this._divWatermark = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.watermark);
    this._divSafeZoneWrapper = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.safeZoneWrapper);
    this._textMediaCaptionsElement = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.mediaCaptions);
    this._textImscElement = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.imsc);
    this._divBackground = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.backgroundImage);
    this._divPlaybackButtons = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.playbackButtons);
    this._divActionIcons = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.actionIcons);
    this._divAlerts = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.alerts);

    if (!StringUtil.isEmpty(this._config.mediaElement?.crossOrigin)) {
      this._mainMediaVideoElement.crossOrigin = config.mediaElement!.crossOrigin!;
    }

    if (!this._mediaControllerElement) {
      throw new Error('No media-controller element found for chroming');
    }

    if (this._config.watermark) {
      this.setWatermark(this._config.watermark);
    }

    this._fullscreenChangeHandler = () => {
      if (Fullscreen.isFullscreen()) {
        this._mediaControllerElement.classList.add(ChromingDomClasses.playerFullscreen);
        this._themeElement.setAttribute('fullscreen', '');
      } else {
        this._mediaControllerElement.classList.remove(ChromingDomClasses.playerFullscreen);
        this._themeElement.removeAttribute('fullscreen');
      }
    };

    Fullscreen.on('change', this._fullscreenChangeHandler);

    this._attachDetachButtonEnabled$.pipe(debounceTime(10), distinctUntilChanged(), takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (enabled) => {
        if (this._attachDetachButton && this._config.playerDetachable) {
          if (enabled && this._mainMediaType !== MainMediaType.AUDIO_FILE) {
            this._attachDetachButton.removeAttribute('disabled');
          } else {
            this._attachDetachButton.setAttribute('disabled', '');
          }
        }
      },
    });
  }

  abstract setThemeConfig(themeConfig: Partial<ChromingThemeConfigMap[T]>): void;

  abstract setThumbnailTrack(track: ThumbnailTrackState | undefined): void;

  abstract get theme(): T;

  abstract get themeConfig(): Partial<ChromingThemeConfigMap[T]> | undefined;

  setVideoPoster(poster: string) {
    this._mainMediaVideoElement.poster = poster;
    if (this._hideBackgroundOnSetPoster) {
      DomUtil.hideElements(this._divBackground);
    }
  }

  showLoading(): void {
    this._mediaControllerElement.classList.add('omakase-video-not-loaded');
    this.clearShowTemporaryBackgroundTimeoutId();
    DomUtil.showElements(this._divBackground);
    this._hideBackgroundOnSetPoster = false;
    this._showTemporaryBackgroundTimeoutId = setTimeout(() => {
      if (this._mainMediaVideoElement.poster) {
        DomUtil.hideElements(this._divBackground);
      } else {
        this._hideBackgroundOnSetPoster = true;
      }
    }, this._posterDisplayDelay);
  }

  showLoaded(): void {
    this._mediaControllerElement.classList.remove('omakase-video-not-loaded');
    DomUtil.hideElements(this._divButtonOverlayLoading, this._divButtonOverlayError);
    if (!this._mainMediaVideoElement.poster) {
      DomUtil.hideElements(this._divBackground);
    }
    const {videoWidth, videoHeight} = this._mainMediaVideoElement;
    if (videoWidth && videoHeight) {
      this._themeElement.style.setProperty('--video-aspect-ratio', `${videoWidth / videoHeight}`);
    }
    this.wireVuMeters();
    this.updateFloatingVuMeterToggle(this._playerInternal!.audioInternal.state);
  }

  showError(): void {
    DomUtil.hideElements(this._divButtonOverlayLoading).showElements(this._divButtonOverlayError);
  }

  isLoading(): boolean {
    return this._mediaControllerElement.classList.contains('omakase-video-not-loaded');
  }

  prepareForAttaching(): void {
    this._divAlerts.innerHTML = '';
    this._mediaControllerElement.classList.remove('omakase-player-detached');
    DomUtil.hideElements(this._divButtonOverlayAttach).showElements(this._divButtonOverlayLoading);
    this.showLoading();
  }

  prepareForDetaching(): void {
    this._mediaControllerElement.classList.add('omakase-player-detached');
    DomUtil.showElements(this._divButtonOverlayAttach);
  }

  setAttachDetachButtonEnabled(enabled: boolean): void {
    this._attachDetachButtonEnabled$.next(enabled);
  }

  setPlayer(playerInternal: PlayerInternalApi) {
    this.resetMainMediaVideoElement();
    this._playerInternal = playerInternal;
    this.wirePlayer();
  }

  setMainMediaType(type: MainMediaType) {
    this._mainMediaType = type;
    const timeDisplays = this.getShadowElements<OmakaseTimeDisplay>('omakase-time-display');
    if (type === MainMediaType.AUDIO_FILE) {
      if (timeDisplays) {
        timeDisplays.forEach((timeDisplay) => {
          timeDisplay.isAudio = true;
        });
      }
    } else {
      if (timeDisplays) {
        timeDisplays.forEach((timeDisplay) => {
          timeDisplay.isAudio = false;
        });
      }
    }
  }

  createMainMediaVideoElement() {
    this._themeElement.innerHTML = `<video id="${this._videoElementId}" class="${ChromingDomClasses.video}" slot="media" ${StringUtil.isNonEmpty(this._config.mediaElement?.crossOrigin) ? `crossorigin="${this._config.mediaElement?.crossOrigin}"` : ``}></video>`;
    this._mainMediaVideoElement = DomUtil.getElementByIdOrFail<HTMLVideoElement>(this._videoElementId);
  }

  createTemplateDom() {
    const styleUrls: string[] = this._config.styleUrl ? (Array.isArray(this._config.styleUrl) ? this._config.styleUrl : [this._config.styleUrl]) : [];
    return `<template id="omakase-player-theme-${this._config.playerHtmlElementId}">
        <style>${mediaCaptionsStyle}</style>
        <style>${playerChromingStyle}</style>
        ${this._config?.styleUrl ? styleUrls.map((url) => `<link rel="stylesheet" href="${url}"></link>`) : ''}
        <media-controller class="${ChromingDomClasses.mediaController}" nohotkeys gesturesdisabled>
          <div class="${ChromingDomClasses.backgroundImage}">
            <div class="${ChromingDomClasses.backgroundLogo}"></div>
          </div>
          <slot name="media" slot="media"></slot>
          <div class="${ChromingDomClasses.safeZoneWrapper}" noautohide></div>
          <div class="${ChromingDomClasses.watermarkWrapper}" ${this._config?.watermarkVisibility === WatermarkVisibility.AUTO_HIDE ? '' : 'noautohide'}>
            <div class="${ChromingDomClasses.watermark}"></div>
          </div>
          <div class="${ChromingDomClasses.sectionTopLeft}">
              <slot name="top-left"></slot>
          </div>
          <div class="${ChromingDomClasses.actionIcons} ${ChromingDomClasses.sectionTopRight}">
              <slot name="top-right"></slot>
          </div>
          <div class="omakase-overlay-buttons omakase-playback-buttons" noautohide>
            <div class="${ChromingDomClasses.buttonOverlayPlay} shadow omakase-video-overlay-button d-none"></div>
              <div class="${ChromingDomClasses.buttonOverlayPause} shadow omakase-video-overlay-button d-none"></div>
              <div class="${ChromingDomClasses.buttonOverlayReplay} shadow omakase-video-overlay-button d-none"></div>
          </div>
          <div class="omakase-overlay-buttons omakase-status-buttons" noautohide>
              <div class="${ChromingDomClasses.buttonOverlayAttach} shadow omakase-video-overlay-button d-none"></div>
              <div class="${ChromingDomClasses.buttonOverlayLoading} shadow omakase-video-overlay-button d-none"></div>
              <div class="${ChromingDomClasses.buttonOverlayError} shadow omakase-video-overlay-button d-none"></div>
          </div>
          <div class="${ChromingDomClasses.mediaCaptions}" noautohide></div>
          <div class="${ChromingDomClasses.imsc}" noautohide></div>
          <div class="${ChromingDomClasses.alerts}" noautohide></div>
        </media-controller>
      </template>`;
  }

  protected createHelpMenuDom() {
    this._divActionIcons.insertAdjacentHTML(
      'afterbegin',
      `<div class="${ChromingDomClasses.helpWrapper}">
        <div class="${ChromingDomClasses.help} d-none">
          <div class="omakase-help-dropdown">
            <button class="media-chrome-button omakase-help-button media-chrome-help shadow"></button>
            <div class="${ChromingDomClasses.helpMenu} d-none">
            </div>
          </div>
        </div>
      </div>`
    );

    this._divHelp = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.help);
    this._divHelpMenu = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.helpMenu);
    this._divHelpWrapper = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.helpWrapper);
    this._divButtonHelp = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.buttonOverlayHelp);

    this._documentClickListener = (event: MouseEvent) => {
      const path = event.composedPath();
      if (DomUtil.isShown(this._divHelpMenu!) && !path.includes(this._divHelp!)) {
        DomUtil.hideElements(this._divHelpMenu);
      }
    };
    document.addEventListener('click', this._documentClickListener);
  }

  getVuMeterConfig(themeConfig: DefaultThemeConfig | OmakaseThemeConfig, position?: ChromingVuMeterPosition): ChromingVuMeterConfig {
    const baseVuMeterConfig = themeConfig.vuMeterConfig as ChromingVuMeterConfig;
    if (position === ChromingVuMeterPosition.CONTROL_BAR) {
      return {
        ...baseVuMeterConfig,
        ...themeConfig.controlBarVuMeterConfig,
        style: {
          ...themeConfig.vuMeterConfig.style,
          ...themeConfig.controlBarVuMeterConfig?.style,
          showScaleMarks: false,
          showScaleLabels: false,
        },
      };
    } else if (position === ChromingVuMeterPosition.FLOATING) {
      return {
        ...baseVuMeterConfig,
        ...themeConfig.floatingVuMeterConfig,
        style: {
          ...themeConfig.vuMeterConfig.style,
          ...themeConfig.floatingVuMeterConfig?.style,
          showScaleMarks: false,
        },
      };
    } else {
      return baseVuMeterConfig;
    }
  }

  protected createVuMeter(theme: ChromingTheme, themeConfig: DefaultThemeConfig | OmakaseThemeConfig, container: HTMLElement, position: ChromingVuMeterPosition) {
    const vuMeterConfig = this.getVuMeterConfig(themeConfig, position);
    this._vuMeters[position] = new VuMeter({
      config: {
        ...vuMeterConfig,
        htmlElement: container,
        orientation: position === ChromingVuMeterPosition.FLOATING ? VuMeterOrientation.VERTICAL : VuMeterOrientation.HORIZONTAL,
        style: {
          ...vuMeterConfig.style,
          showChannelLabels: theme === ChromingTheme.OMAKASE,
        },
      },
    });
  }

  protected updateVuMeterConfig(themeConfig: DefaultThemeConfig | OmakaseThemeConfig, position: ChromingVuMeterPosition) {
    if (this._vuMeters[position]) {
      const config = this.getVuMeterConfig(themeConfig, position);
      this._vuMeters[position].setConfig(config);
    }
  }

  protected updateFloatingVuMeterToggle(playerAudio: PlayerAudioState) {
    if (!this.isMainAudioRouterSupported() && this._audioLevelSource instanceof PeakProcessorAudioLevelSource && !playerAudio.tracks[PlayerAudioType.SIDECAR].find((track) => track.active)) {
      this._vuMeterToggle?.setAttribute('disabled', '');
      this._mediaControllerElement.classList.add(ChromingDomClasses.vuMeterNotSupported);
    } else {
      this._vuMeterToggle?.removeAttribute('disabled');
      this._mediaControllerElement.classList.remove(ChromingDomClasses.vuMeterNotSupported);
    }
  }

  protected wireVuMeters() {
    if (this._playerInternal && (this._vuMeters[ChromingVuMeterPosition.CONTROL_BAR] || this._vuMeters[ChromingVuMeterPosition.FLOATING])) {
      if (!this._audioLevelSource) {
        this._audioLevelSource = new PeakProcessorAudioLevelSource();
      }
      if (this._audioLevelSource instanceof PeakProcessorAudioLevelSource) {
        this._audioLevelSource.setHandler(this._playerInternal.audioInternal.getHandler(PlayerAudioType.OUTPUT)!);
      }
      if (this._vuMeters[ChromingVuMeterPosition.CONTROL_BAR]) {
        this._vuMeters[ChromingVuMeterPosition.CONTROL_BAR].setSource(this._audioLevelSource);
      }
      if (this._vuMeters[ChromingVuMeterPosition.FLOATING]) {
        this._vuMeters[ChromingVuMeterPosition.FLOATING].setSource(this._audioLevelSource);
      }
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

  destroy(): void {
    if (this._fullscreenChangeHandler) {
      Fullscreen.off('change', this._fullscreenChangeHandler);
    }
    if (this._documentClickListener) {
      document.removeEventListener('click', this._documentClickListener);
    }
    ChromingUtil.disconnectResizeObserver();
    this.clearShowTemporaryOnMouseMoveTimeoutId();
    this.clearShowTemporaryBackgroundTimeoutId();
    this.clearShowSeekLoadingAnimationTimeoutId();
    this._htmlElement.innerHTML = ``;
    this._vuMeters[ChromingVuMeterPosition.CONTROL_BAR]?.destroy();
    this._vuMeters[ChromingVuMeterPosition.FLOATING]?.destroy();
    this._playerBreaker.destroy();
    this._destroyBreaker.destroy();
    this._audioLevelSource?.destroy();
    freeObserver(this._alertClosed$);
    freeObserver(this._attachDetachButtonEnabled$);
  }

  protected wirePlayer() {
    this._playerBreaker.break();

    if (!this._playerInternal) {
      throw new Error(`Cannot wire player, player is not set`);
    }
    let playerInternal = this._playerInternal;

    const allOverlayButtons = [
      this._divButtonOverlayPlay,
      this._divButtonOverlayPause,
      this._divButtonOverlayLoading,
      this._divButtonOverlayReplay,
      this._divButtonOverlayError,
      this._divButtonOverlayAttach,
    ];

    playerInternal.onEvent$
      .pipe(
        filter((event) =>
          [
            PlayerEventType.PLAYER_MAIN_MEDIA_LOAD_ERROR,
            PlayerEventType.PLAYER_MAIN_MEDIA_LOADING,
            PlayerEventType.PLAYER_MAIN_MEDIA_LOADED,
            PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED,
            PlayerEventType.PLAYER_ENDED,
            PlayerEventType.PLAYER_PLAY,
            PlayerEventType.PLAYER_PAUSE,
            PlayerEventType.PLAYER_BUFFERING,
            PlayerEventType.PLAYER_SEEKING,
            PlayerEventType.PLAYER_SEEKED,
            PlayerEventType.PLAYER_PLAYBACK_CHANGE,
          ].includes(event.type)
        ),
        takeUntil(this._playerBreaker.observer),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe({
        next: (event) => {
          switch (event.type) {
            case PlayerEventType.PLAYER_MAIN_MEDIA_LOAD_ERROR:
              this.showLoading();
              DomUtil.hideElements(...allOverlayButtons).showElements(this._divButtonOverlayError);
              break;
            case PlayerEventType.PLAYER_MAIN_MEDIA_LOADING:
              this.showLoading();
              DomUtil.hideElements(...allOverlayButtons).showElements(this._divButtonOverlayLoading);
              break;
            case PlayerEventType.PLAYER_SEEKING:
              if (!this._playerPlayback?.pausing) {
                this._showSeekLoadingAnimationTimeoutId = setTimeout(() => {
                  if (this._seekingToTime === event.data.toTime) {
                    DomUtil.hideElements(...allOverlayButtons).showElements(this._divButtonOverlayLoading);
                  }
                }, this._seekAnimationDelay);
                this._seekingToTime = event.data.toTime;
              }
              break;
            case PlayerEventType.PLAYER_MAIN_MEDIA_LOADED:
              this.showLoaded();
              if (this._markerBar) {
                this._markerBar.mediaDuration = playerInternal.getDuration();
              }
              if (!this._autoHidePlaybackButtons) {
                const playControlToShow = this._playerInternal!.playerSession.playback.playing ? this._divButtonOverlayPause : this._divButtonOverlayPlay;
                DomUtil.hideElements(...allOverlayButtons).showElements(playControlToShow);
              }
              break;
            case PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED:
              this.resetMainMediaVideoElement();
              return;
            case PlayerEventType.PLAYER_SEEKED:
              delete this._seekingToTime;
              this.clearShowSeekLoadingAnimationTimeoutId();
              if (!this.isLoading()) {
                DomUtil.hideElements(this._divButtonOverlayLoading);
                if (!this._autoHidePlaybackButtons) {
                  const playControlToShow = this._playerInternal!.playerSession.playback.playing ? this._divButtonOverlayPause : this._divButtonOverlayPlay;
                  DomUtil.hideElements(...allOverlayButtons).showElements(playControlToShow);
                }
              }
              break;
            case PlayerEventType.PLAYER_PLAYBACK_CHANGE:
              const state = event.data.playerPlayback;
              this._playerPlayback = state;
              if (state.waitingSyncedMedia) {
                DomUtil.hideElements(...allOverlayButtons).showElements(this._divButtonOverlayLoading);
              } else {
                if (state.waiting && state.playing) {
                  DomUtil.hideElements(...allOverlayButtons).showElements(this._divButtonOverlayLoading);
                } else if (state.playing) {
                  DomUtil.hideElements(...allOverlayButtons);
                  if (state.seeking && state.waiting) {
                    DomUtil.showElements(this._divButtonOverlayLoading);
                  } else if (!this._autoHidePlaybackButtons) {
                    DomUtil.showElements(this._divButtonOverlayPause);
                  }
                } else if (state.paused) {
                  DomUtil.hideElements(...allOverlayButtons);
                  if (state.seeking && state.waiting) {
                    DomUtil.showElements(this._divButtonOverlayLoading);
                  } else if (state.ended) {
                    DomUtil.showElements(this._divButtonOverlayReplay);
                  } else if (!this._autoHidePlaybackButtons) {
                    DomUtil.showElements(this._divButtonOverlayPlay);
                  }
                } else if (state.seeking && state.waiting) {
                  DomUtil.hideElements(...allOverlayButtons).showElements(this._divButtonOverlayLoading);
                }
              }
              break;
            case PlayerEventType.PLAYER_ENDED:
              DomUtil.hideElements(...allOverlayButtons).showElements(this._divButtonOverlayReplay);
              break;
            case PlayerEventType.PLAYER_PAUSE:
              if (DomUtil.isShown(this._divButtonOverlayPause)) {
                DomUtil.hideElements(...allOverlayButtons).showElements(this._divButtonOverlayPlay);
              }
              break;
            case PlayerEventType.PLAYER_PLAY:
              DomUtil.hideElements(this._divBackground, this._divButtonOverlayReplay);
              if (DomUtil.isShown(this._divButtonOverlayPlay) || !this._autoHidePlaybackButtons) {
                DomUtil.hideElements(...allOverlayButtons).showElements(this._divButtonOverlayPause);
              }
              break;
          }
        },
      });

    if (this._autoHidePlaybackButtons) {
      fromEvent<MouseEvent>(this._htmlElement, 'mousemove')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            if (playerInternal.isMainMediaLoaded && !playerInternal.playerSession.playback.seeking && !playerInternal.playerSession.playback.ended && !this.isLoading()) {
              this.clearShowTemporaryOnMouseMoveTimeoutId();
              if (!DomUtil.isShown(this._divButtonOverlayLoading)) {
                const playControlToShow = playerInternal.playerSession.playback.playing ? this._divButtonOverlayPause : this._divButtonOverlayPlay;
                DomUtil.hideElements(this._divButtonOverlayPlay, this._divButtonOverlayPause).showElements(playControlToShow);
                this._showTemporaryOnMouseMoveTimeoutId = setTimeout(() => {
                  DomUtil.hideElements(playControlToShow);
                }, 1000);
              }
            }
          },
        });

      fromEvent<MouseEvent>(this._htmlElement, 'mouseleave')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            DomUtil.hideElements(this._divButtonOverlayPlay, this._divButtonOverlayPause);
          },
        });
    }

    fromEvent<MouseEvent>(this._mediaControllerElement, 'click')
      .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (event) => {
          const composedTarget = event.composedPath()?.[0] as HTMLElement;
          const allowList = ['video', 'media-controller'];
          if (allowList.includes(composedTarget?.localName)) {
            if (this._mediaControllerElement.classList.contains('omakase-player-detached')) {
              this._config.requestAttachFn();
            } else if (playerInternal.isMainMediaLoaded && !this.isLoading()) {
              if (playerInternal.playerSession.playback.playing) {
                playerInternal.pause();
              } else {
                playerInternal.play();
              }
            }
          }
        },
      });

    if (this._divButtonHelp) {
      fromEvent<MouseEvent>(this._divButtonHelp, 'click')
        .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (event) => {
            if (event.target === this._divButtonHelp) {
              if (this._divHelpMenu && DomUtil.isShown(this._divHelpMenu)) {
                DomUtil.hideElements(this._divHelpMenu);
              } else {
                DomUtil.showElements(this._divHelpMenu);
              }
            }
          },
        });
    }
  }

  protected wireAudioTextDropdown(audioTextDropdown: OmakaseDropdown) {
    this.checkPlayerInternal();
    let playerInternal = this._playerInternal!;

    const audioDropdownList = audioTextDropdown.querySelector<OmakaseDropdownList>(`.${ChromingDomClasses.audioDropdownList}`);
    const sidecarDropdownList = audioTextDropdown.querySelector<OmakaseDropdownList>(`.${ChromingDomClasses.sidecarDropdownList}`);
    const textDropdownList = audioTextDropdown.querySelector<OmakaseDropdownList>(`.${ChromingDomClasses.textDropdownList}`);

    if (playerInternal.audioInternal.state.audioMode === PlayerAudioMode.SINGLE) {
      audioDropdownList!.type = 'radio';
      audioDropdownList!.setTitle('AUDIO');
      textDropdownList!.type = 'radio';
    } else {
      audioDropdownList!.type = 'checkbox';
      audioDropdownList!.setTitle('MAIN AUDIO');
      textDropdownList!.type = 'checkbox';
    }

    audioTextDropdown.onClose$.pipe(takeUntil(this._destroyBreaker.observer), takeUntil(this._playerBreaker.observer)).subscribe(() => {
      this.hideAudioRouter(audioTextDropdown);
    });

    merge(audioDropdownList!.selectedOption$, sidecarDropdownList!.selectedOption$)
      .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (audioOption) => {
          if (audioOption) {
            if (!audioOption.active) {
              playerInternal.audioInternal.switchTrack(audioOption.value, true).subscribe();
            } else if (playerInternal.audioInternal.state.audioMode === PlayerAudioMode.MULTIPLE) {
              playerInternal.audioInternal.switchTrack(audioOption.value, false).subscribe();
            }
          }
        },
      });

    audioDropdownList!.selectedAction$.pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (trackOption) => {
        if (this._playerInternal!.audioInternal.getTracks(PlayerAudioType.SIDECAR).find((track) => track.id === trackOption.value)) {
          this.displayAudioRouter(trackOption.value, PlayerAudioType.SIDECAR, audioTextDropdown, playerInternal);
        } else {
          this.displayAudioRouter(trackOption.value, PlayerAudioType.MAIN, audioTextDropdown, playerInternal);
        }
      },
    });

    sidecarDropdownList!.selectedAction$.pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (sidecarTrack) => {
        this.displayAudioRouter(sidecarTrack.value, PlayerAudioType.SIDECAR, audioTextDropdown, playerInternal);
      },
    });

    textDropdownList!.selectedOption$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (textOption) => {
        if (textOption) {
          if (!textOption.active) {
            playerInternal.textInternal.switchTrack(textOption.value, true).subscribe();
          } else if (playerInternal.audioInternal.state.audioMode === PlayerAudioMode.MULTIPLE) {
            playerInternal.textInternal.switchTrack(textOption.value, false).subscribe();
          }
        }
      },
    });
  }

  protected checkPlayerInternal() {
    if (!this._playerInternal) {
      throw new Error(`Cannot wire player, player is not set`);
    }
  }

  setWatermark(watermark: string | undefined) {
    if (this._divWatermark) {
      this._divWatermark.innerText = watermark ?? '';
    }
  }

  clearSafeZones(): void {
    this._divSafeZoneWrapper.innerHTML = '';
  }

  addSafeZone(videoSafeZone: VideoSafeZoneCreate, allVideoSafeZones: VideoSafeZone[]): VideoSafeZone {
    let newVideoSafeZone: VideoSafeZone = {
      id: StringUtil.isEmpty(videoSafeZone.id) ? CryptoUtil.uuid() : videoSafeZone.id!,
      htmlId: StringUtil.isEmpty(videoSafeZone.htmlId) ? `omakase-video-safe-zone-${allVideoSafeZones.length + 1}` : videoSafeZone.htmlId!,
      htmlClass: `${ChromingDomClasses.safeZone}${videoSafeZone.htmlClass ? ` ${videoSafeZone.htmlClass}` : ``}`,
      topRightBottomLeftPercent: [
        videoSafeZone.topRightBottomLeftPercent[0] ? videoSafeZone.topRightBottomLeftPercent[0] : 0,
        videoSafeZone.topRightBottomLeftPercent[1] ? videoSafeZone.topRightBottomLeftPercent[1] : 0,
        videoSafeZone.topRightBottomLeftPercent[2] ? videoSafeZone.topRightBottomLeftPercent[2] : 0,
        videoSafeZone.topRightBottomLeftPercent[3] ? videoSafeZone.topRightBottomLeftPercent[3] : 0,
      ],
    };

    let htmlElement: HTMLElement = DomUtil.createElement<'div'>('div');
    htmlElement.id = newVideoSafeZone.htmlId!;
    htmlElement.className = newVideoSafeZone.htmlClass;
    htmlElement.style.top = `${newVideoSafeZone.topRightBottomLeftPercent[0]}%`;
    htmlElement.style.right = `${newVideoSafeZone.topRightBottomLeftPercent[1]}%`;
    htmlElement.style.bottom = `${newVideoSafeZone.topRightBottomLeftPercent[2]}%`;
    htmlElement.style.left = `${newVideoSafeZone.topRightBottomLeftPercent[3]}%`;

    this._divSafeZoneWrapper.append(htmlElement);

    return newVideoSafeZone;
  }

  removeSafeZone(videoSafeZone: VideoSafeZone): void {
    let element = this.getShadowElementById<HTMLElement>(videoSafeZone.htmlId!);
    if (element) {
      element.remove();
    }
  }

  updateHelpMenu(helpMenuGroups: HelpMenuGroup[]) {
    if (this._config?.theme === ChromingTheme.CHROMELESS) {
      return;
    }
    if (helpMenuGroups.length > 0) {
      DomUtil.showElements(this._divHelp);
      if (this._divHelpMenu) {
        this._divHelpMenu.innerHTML = helpMenuGroups
          .map((helpMenuGroup) => {
            let items = `${helpMenuGroup.items.map((helpMenuItem) => `<div class="omakase-help-item"><span>${helpMenuItem.name}</span><span>${helpMenuItem.description}</span></div>`).join('')}`;
            return `<div class="omakase-help-group">
                      <div class="omakase-help-group-title">
                        <span>${helpMenuGroup.name}</span>
                      </div>
                      ${items}
                  </div>`;
          })
          .join('');
      }
    } else {
      if (this._divHelpMenu) {
        this._divHelpMenu.innerHTML = ``;
      }
      DomUtil.hideElements(this._divHelp);
    }
  }

  toggleFullScreen(): Observable<void> {
    return passiveObservable((observer) => {
      try {
        if (Fullscreen.isFullscreenEnabled()) {
          if (Fullscreen.isFullscreen()) {
            Fullscreen.exitFullscreen()
              .then(() => {
                nextCompleteObserver(observer);
              })
              .catch((error) => {
                console.error(error);
                errorCompleteObserver(observer, error);
              });
          } else {
            Fullscreen.requestFullscreen(this._config?.fullscreenChroming === FullscreenChroming.ENABLED ? this._mediaControllerElement : this._mainMediaVideoElement)
              .then(() => {
                nextCompleteObserver(observer);
              })
              .catch((error) => {
                console.error(error);
                errorCompleteObserver(observer, error);
              });
          }
        } else {
          nextCompleteObserver(observer);
        }
      } catch (e) {
        console.trace(e);
        observer.error(e);
      }
    });
  }

  enablePiP(): Observable<void> {
    return passiveObservable((observer) => {
      if (!this._playerInternal?.isMainMediaLoaded) {
        errorCompleteObserver(observer, 'Video is not loaded');
      } else if (!this.isPiPSupported()) {
        errorCompleteObserver(observer, 'Picture in picture is not supported in this browser');
      } else {
        if (!document.pictureInPictureElement && document.pictureInPictureEnabled) {
          this._mainMediaVideoElement.requestPictureInPicture().then(() => {
            console.debug('Video entered picture in picture mode');
            if (this._enterPictureInPictureHandler) {
              this._enterPictureInPictureHandler();
            }
          });
        }
        nextCompleteObserver(observer);
      }
    });
  }

  disablePiP(): Observable<void> {
    return passiveObservable((observer) => {
      if (this._playerInternal?.isMainMediaLoaded) {
        if (document.pictureInPictureElement && document.pictureInPictureEnabled) {
          document.exitPictureInPicture().then(() => {
            console.debug('Video exited picture in picture mode');
            if (this._leavePictureInPictureHandler) {
              this._leavePictureInPictureHandler();
            }
          });
        }
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, 'Video is not loaded');
      }
    });
  }

  isPiPSupported(): boolean {
    return !BrowserProvider.instance.isFirefox && !this._mainMediaVideoElement.disablePictureInPicture;
  }

  protected togglePiP(): Observable<void> {
    return document.pictureInPictureElement === this._mainMediaVideoElement ? this.disablePiP() : this.enablePiP();
  }

  protected addPiPListeners() {
    if (!this._config.playerDetachable && this._attachDetachButton) {
      if (this.isPiPSupported()) {
        if (this._enterPictureInPictureHandler) {
          this._mainMediaVideoElement.addEventListener(HTMLVideoElementEvent.ENTERPIP, this._enterPictureInPictureHandler);
        }
        if (this._leavePictureInPictureHandler) {
          this._mainMediaVideoElement.addEventListener(HTMLVideoElementEvent.LEAVEPIP, this._leavePictureInPictureHandler);
        }
      } else {
        DomUtil.hideElements(this._attachDetachButton);
      }
    }
  }

  getPlayerChromingElement<T>(querySelector: string): T {
    return (this._themeElement.querySelector(querySelector) ?? this._themeElement.shadowRoot?.querySelector(querySelector)) as T;
  }

  clearMarkerTracks() {
    if (this._markerBar) {
      this._markerBar.clearMarkerTracks();
      this._mediaControllerElement.style.setProperty('--marker-track-count', '0');
    }
  }

  addMarkerTrack(destination: ChromingTrackDestination): OmakaseMarkerTrack | OmakaseTimeRange {
    if (destination === ChromingTrackDestination.MARKER_BARS) {
      if (this._markerBar) {
        const markerTrack = this._markerBar.addMarkerBar();
        this._mediaControllerElement.style.setProperty('--marker-track-count', this._markerBar.markerBars.filter((track) => track.config.visible).length.toString());
        return markerTrack;
      } else {
        throw new Error('Marker bar element not found');
      }
    } else {
      if (this._timeRange) {
        return this._timeRange;
      } else {
        throw new Error('Progress bar element not found');
      }
    }
  }

  deleteMarkerTrack(idOrDestination: string | ChromingTrackDestination.PROGRESS_BAR): void {
    if (idOrDestination === ChromingTrackDestination.PROGRESS_BAR) {
      if (this._timeRange) {
        this._timeRange.removeAllMarkers();
      }
    } else {
      if (this._markerBar) {
        this._markerBar.deleteMarkerBar(idOrDestination);
        this._mediaControllerElement.style.setProperty('--marker-track-count', this._markerBar.markerBars.filter((track) => track.config.visible).length.toString());
      }
    }
  }

  setMarkerTrackVisible(element: OmakaseMarkerTrack | OmakaseTimeRange, visible: boolean): void {
    if (visible) {
      element.show();
    } else {
      element.hide();
    }
    if (this._markerBar) {
      this._mediaControllerElement.style.setProperty('--marker-track-count', this._markerBar.markerBars.filter((track) => track.config.visible).length.toString());
    }
  }

  hideMarkerTrack(idOrDestination: string | ChromingTrackDestination.PROGRESS_BAR): void {
    if (idOrDestination === ChromingTrackDestination.PROGRESS_BAR) {
      if (this._timeRange) {
        this._timeRange.removeAllMarkers();
      }
    } else {
      if (this._markerBar) {
        this._markerBar.deleteMarkerBar(idOrDestination);
        this._mediaControllerElement.style.setProperty('--marker-track-count', this._markerBar.markerBars.filter((track) => track.config.visible).length.toString());
      }
    }
  }

  addMarker(trackId: string, marker: MarkerState) {
    if (this._markerBar) {
      this._markerBar.addMarker(trackId, marker);
    }
    if (this._timeRange && this._timeRange.markerTracks?.find((track) => track.id === trackId)) {
      this._timeRange.addMarker(marker, trackId);
    }
  }

  updateMarker(trackId: string, marker: MarkerState) {
    if (this._markerBar) {
      this._markerBar.updateMarker(trackId, marker);
    }
    if (this._timeRange && this._timeRange.markerTracks?.find((track) => track.id === trackId)) {
      this._timeRange.updateMarker(marker);
    }
  }

  removeMarker(trackId: string, marker: MarkerState) {
    if (this._markerBar) {
      this._markerBar.removeMarker(trackId, marker.id);
    }
    if (this._timeRange && this._timeRange.markerTracks?.find((track) => track.id === trackId)) {
      this._timeRange.removeMarker(marker.id);
    }
  }

  updateMarkerTrackState(trackId: string, markerTrack: MarkerTrackState) {
    if (this._markerBar) {
      this._markerBar.updateMarkerTrackState(trackId, markerTrack);
    }
    if (this._timeRange && this._timeRange.markerTracks?.find((track) => track.id === trackId)) {
      this._timeRange.updateTrack(markerTrack);
    }
  }

  setAudioTracks(type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, tracks: ChromingAudioTrack[]) {
    for (const dropdownList of this._audioDropdownLists[type]) {
      this.setDropdownOptions(
        dropdownList,
        tracks.map((track, index) => this.getAudioDropdownOption(track, this.getDefaultAudioLabel(type, index)))
      );
    }
  }

  updateAudioTracks(type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, tracks: ChromingAudioTrackUpdateAttrs[]) {
    for (const dropdownList of this._audioDropdownLists[type]) {
      this.updateDropdownOptions(
        dropdownList,
        tracks.map((track) => ({value: track.playerTrack.trackId, active: track.playerTrack.active, actionClass: this.getAudioDropdownOptionActionClass(track.type, track.playerTrack)}))
      );
    }
  }

  updateAudioTrackRouters() {
    if (this._playerInternal) {
      for (const dropdownList of this._audioDropdownLists[PlayerAudioType.MAIN]) {
        this.updateDropdownOptions(
          dropdownList,
          this._playerInternal.audioInternal.state.tracks[PlayerAudioType.MAIN].map((track) => ({
            value: track.trackId,
            actionClass: this.getAudioDropdownOptionActionClass(PlayerAudioType.MAIN, track),
          }))
        );
      }
      for (const dropdownList of this._audioDropdownLists[PlayerAudioType.SIDECAR]) {
        this.updateDropdownOptions(
          dropdownList,
          this._playerInternal.audioInternal.state.tracks[PlayerAudioType.SIDECAR].map((track) => ({
            value: track.trackId,
            actionClass: this.getAudioDropdownOptionActionClass(PlayerAudioType.SIDECAR, track),
          }))
        );
      }
    }
  }

  updateAudioTrackLabel(type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, track: AudioState) {
    for (const dropdownList of this._audioDropdownLists[type]) {
      this.updateDropdownOptions(dropdownList, [{value: track.id, label: track.label ?? ''}]);
    }
  }

  addAudioTrack(type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, track: ChromingAudioTrack) {
    for (const dropdownList of this._audioDropdownLists[type]) {
      this.addDropdownOption(dropdownList, this.getAudioDropdownOption(track, this.getDefaultAudioLabel(track.type, dropdownList.options.length)));
    }
  }

  removeAudioTrack(type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, trackId: AudioState['id']) {
    for (const dropdownList of this._audioDropdownLists[type]) {
      this.removeDropdownOption(dropdownList, trackId);
    }
  }

  setTextTracks(tracks: ChromingTextTrack[]) {
    for (const dropdownList of this._textDropdownLists) {
      this.setDropdownOptions(
        dropdownList,
        tracks.map((track, index) => this.getTextDropdownOption(track, this.getDefaultTextLabel(index)))
      );
    }
  }

  updateTextTracks(tracks: PlayerTextTrackState[]) {
    for (const dropdownList of this._textDropdownLists) {
      this.updateDropdownOptions(
        dropdownList,
        tracks.map((track) => ({value: track.trackId, active: track.active}))
      );
    }
  }

  updateTextTrackLabel(track: TextTrackState) {
    for (const dropdownList of this._textDropdownLists) {
      this.updateDropdownOptions(dropdownList, [{value: track.id, label: track.label ?? ''}]);
    }
  }

  addTextTrack(track: ChromingTextTrack) {
    for (const dropdownList of this._textDropdownLists) {
      this.addDropdownOption(dropdownList, this.getTextDropdownOption(track, this.getDefaultTextLabel(dropdownList.options.length)));
    }
  }

  removeTextTrack(trackId: TextTrackState['id']) {
    for (const dropdownList of this._textDropdownLists) {
      this.removeDropdownOption(dropdownList, trackId);
    }
  }

  private clearShowTemporaryOnMouseMoveTimeoutId() {
    if (this._showTemporaryOnMouseMoveTimeoutId) {
      clearTimeout(this._showTemporaryOnMouseMoveTimeoutId);
    }
  }

  private clearShowTemporaryBackgroundTimeoutId() {
    if (this._showTemporaryBackgroundTimeoutId) {
      clearTimeout(this._showTemporaryBackgroundTimeoutId);
    }
  }

  private clearShowSeekLoadingAnimationTimeoutId() {
    if (this._showSeekLoadingAnimationTimeoutId) {
      clearTimeout(this._showSeekLoadingAnimationTimeoutId);
    }
  }

  protected getControlBarClass(element: string) {
    return `${ChromingDomClasses.controlBarPrefix}-${element.toLowerCase()}`;
  }

  protected includeAudioRouter() {
    return false;
  }

  protected getAudioDropdownOptionActionClass(type: PlayerAudioType, track: PlayerAudioTrackState) {
    return this.includeAudioRouter() && track.active && (type !== PlayerAudioType.MAIN || this.isMainAudioRouterSupported())
      ? `${ChromingDomClasses.audioRouter} ${this.isAudioRouterUpdated(this._playerInternal!.audioInternal.getHandler(PlayerAudioType.MAIN)!) ? ChromingDomClasses.audioRouterChanged : ChromingDomClasses.audioRouterDefault}`
      : '';
  }

  protected getDefaultAudioLabel(type: PlayerAudioType, index: number): string {
    return `${type.toLowerCase()} ${index + 1}`;
  }

  protected getDefaultTextLabel(index: number): string {
    return `captions ${index + 1}`;
  }

  protected getAudioDropdownOption(track: ChromingAudioTrack, defaultLabel: string): OmakaseDropdownListItem {
    return {
      value: track.playerTrack.trackId,
      label: track.audioTrack.label ?? defaultLabel,
      active: track.playerTrack.active,
      actionClass: this.getAudioDropdownOptionActionClass(track.type, track.playerTrack),
    };
  }

  protected getTextDropdownOption(track: ChromingTextTrack, defaultLabel: string): OmakaseDropdownListItem {
    return {
      value: track.playerTrack.trackId,
      label: track.textTrack.label ?? defaultLabel,
      active: track.playerTrack.active,
    };
  }

  protected registerAudioTextDropdown(dropdown: OmakaseDropdown) {
    const audioDropdownList = dropdown.querySelector<OmakaseDropdownList>(`.${ChromingDomClasses.audioDropdownList}`);
    const sidecarDropdownList = dropdown.querySelector<OmakaseDropdownList>(`.${ChromingDomClasses.sidecarDropdownList}`);
    const textDropdownList = dropdown.querySelector<OmakaseDropdownList>(`.${ChromingDomClasses.textDropdownList}`);
    if (audioDropdownList) {
      this._audioDropdownLists[PlayerAudioType.MAIN].push(audioDropdownList);
    }
    if (sidecarDropdownList) {
      this._audioDropdownLists[PlayerAudioType.SIDECAR].push(sidecarDropdownList);
    }
    if (textDropdownList) {
      this._textDropdownLists.push(textDropdownList);
    }
  }

  protected setDropdownOptions(dropdownList: OmakaseDropdownList, options: OmakaseDropdownListItem[]) {
    dropdownList.setOptions(options);
    if (options.length) {
      DomUtil.showElements(dropdownList);
    } else {
      DomUtil.hideElements(dropdownList);
    }
    if (dropdownList.parentElement?.classList.contains(ChromingDomClasses.audioTextDropdown)) {
      this.setAudioTextDropdownMaxWidth(dropdownList.parentElement as OmakaseDropdown);
    }
  }

  protected addDropdownOption(dropdownList: OmakaseDropdownList, option: OmakaseDropdownListItem) {
    dropdownList.addOption(option);
    if (!DomUtil.isShown(dropdownList)) {
      DomUtil.showElements(dropdownList);
    }
    if (dropdownList.parentElement?.classList.contains(ChromingDomClasses.audioTextDropdown)) {
      this.setAudioTextDropdownMaxWidth(dropdownList.parentElement as OmakaseDropdown);
    }
  }
  protected removeDropdownOption(dropdownList: OmakaseDropdownList, value: any) {
    dropdownList.removeOption(value);
    if (!dropdownList.options.length) {
      DomUtil.hideElements(dropdownList);
    }
    if (dropdownList.parentElement?.classList.contains(ChromingDomClasses.audioTextDropdown)) {
      this.setAudioTextDropdownMaxWidth(dropdownList.parentElement as OmakaseDropdown);
    }
  }

  protected updateDropdownOptions(dropdownList: OmakaseDropdownList, options: Partial<OmakaseDropdownListItem>[]) {
    dropdownList.updateOptions(options);
  }

  protected setAudioTextDropdownMaxWidth(audioTextDropdown: OmakaseDropdown) {
    const audioDropdownList = audioTextDropdown.querySelector<OmakaseDropdownList>(`.${ChromingDomClasses.audioDropdownList}`);
    const sidecarDropdownList = audioTextDropdown.querySelector<OmakaseDropdownList>(`.${ChromingDomClasses.sidecarDropdownList}`);
    const textDropdownList = audioTextDropdown.querySelector<OmakaseDropdownList>(`.${ChromingDomClasses.textDropdownList}`);
    const listCount = [audioDropdownList, sidecarDropdownList, textDropdownList].filter((el) => el && DomUtil.isShown(el)).length;
    const minListSize = Math.min(...[audioDropdownList, sidecarDropdownList, textDropdownList].filter((el) => el && DomUtil.isShown(el)).map((el) => el!.width));
    let totalWidth = 0;
    [audioDropdownList, sidecarDropdownList, textDropdownList].forEach((element) => {
      if (element && DomUtil.isShown(element)) {
        element.width = listCount > 1 ? 125 : 150;
        element.maxWidth = Math.round(Math.max(minListSize * 2, element.width));
        totalWidth += element.width;
      }
    });
    audioTextDropdown.style.minWidth = DomUtil.getPixelValue(totalWidth);
  }

  protected displayAudioRouter(trackId: string, audioType: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, audioTextDropdown: OmakaseDropdown, player: PlayerInternalApi) {
    audioTextDropdown.classList.add(ChromingDomClasses.audioRouterDropdown);
    const backButton = document.createElement('media-chrome-button');
    backButton.classList.add(ChromingDomClasses.mediaChromeBack);
    backButton.onclick = () => {
      this.hideAudioRouter(audioTextDropdown);
    };
    const audioRouter = document.createElement('omakase-router-visualization') as OmakaseRouterVisualization;
    audioTextDropdown.appendChild(audioRouter);
    audioTextDropdown.appendChild(backButton);
    audioRouter.player = player;
    if (audioType === PlayerAudioType.MAIN) {
      const mainTrack = player.audioInternal.getTracks(PlayerAudioType.MAIN).find((track) => track.id === trackId);
      if (mainTrack) {
        audioRouter.mainTrack = {
          track: {
            name: mainTrack.label,
            maxInputNumber: mainTrack.channels!,
            inputNumber: mainTrack.channels!,
          },
        };
      }
    } else if (audioType === PlayerAudioType.SIDECAR) {
      const sidecarTrack = player.audioInternal.getTracks(PlayerAudioType.SIDECAR).find((track) => track.id === trackId);
      if (sidecarTrack) {
        audioRouter.sidecarTracks = {
          tracks: [
            {
              trackId: sidecarTrack.id,
              name: sidecarTrack.label,
              maxInputNumber: sidecarTrack.channels!,
              inputNumber: sidecarTrack.channels!,
            },
          ],
        };
      }
    }
  }

  protected hideAudioRouter(audioTextDropdown: OmakaseDropdown) {
    audioTextDropdown.querySelector('omakase-router-visualization')?.remove();
    audioTextDropdown.querySelector(`.${ChromingDomClasses.mediaChromeBack}`)?.remove();
    audioTextDropdown.classList.remove(ChromingDomClasses.audioRouterDropdown);
  }

  protected isAudioRouterUpdated(handler: AudioHandlerApi): boolean {
    if (!handler?.router) {
      return false;
    }
    const connections = handler.router.state.routingConnections;
    const defaultConnections = handler.router.getDefaultRoutingConnections();
    let i = 0;
    for (const row of connections) {
      for (const connection of row) {
        const defaultConnection = defaultConnections[i++];
        if (!defaultConnection || connection.connected !== defaultConnection.connected) {
          return true;
        }
      }
    }
    return false;
  }

  protected isMainAudioRouterSupported(): boolean {
    return !(BrowserProvider.instance.isSafari && this._mainMediaType === MainMediaType.HLS);
  }

  resetMainMediaVideoElement() {
    this.showLoading();
    this.createMainMediaVideoElement();
    this._textMediaCaptionsElement.innerHTML = '';
    this._textImscElement.innerHTML = '';
    this.clearMarkerTracks();
    this.setThumbnailTrack(undefined);
    DomUtil.hideElements(this._divButtonOverlayPlay, this._divButtonOverlayPause, this._divButtonOverlayReplay, this._divButtonOverlayLoading, this._divButtonOverlayError);
    if (this._timeRange) {
      this._timeRange.removeAllMarkers();
    }
    if (this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED) {
      DomUtil.showElements(this._divButtonOverlayLoading);
    }
  }

  setAlerts(alerts: AlertState[]) {
    this._divAlerts.innerHTML = '';
    for (const alert of alerts.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
      this._createAlertInDom(alert);
    }
    this._stackAlertsInDom();
  }

  addAlert(alert: AlertState) {
    this._createAlertInDom(alert);
    this._stackAlertsInDom();
  }

  removeAlert(alertId: AlertState['id']) {
    const alertElement = this._divAlerts.querySelector<HTMLDivElement>('#omakase-alert-' + alertId);
    if (alertElement) {
      this._divAlerts.removeChild(alertElement);
    }
    this._stackAlertsInDom();
  }

  private _stackAlertsInDom() {
    let stackCount = 0;
    const alertElements = this._divAlerts.querySelectorAll<HTMLDivElement>('.omakase-alert');
    Array.from(alertElements)
      .reverse()
      .forEach((alertElement, index) => {
        if (index + 1 <= this._maxAlertCount) {
          alertElement.classList.remove('alert-stack', 'alert-hide');
          alertElement.style.left = '0';
          alertElement.style.top = '0';
        } else if (index + 1 < this._maxAlertCount + this._maxStackCount) {
          stackCount++;
          alertElement.classList.add('alert-stack');
          alertElement.style.left = DomUtil.getPixelValue(-5 * stackCount);
          alertElement.style.top = DomUtil.getPixelValue(-5 * stackCount);
        } else {
          alertElement.classList.add('alert-hide');
        }
      });
  }

  private _createAlertInDom(alert: AlertState) {
    const alertElement = DomUtil.createElement('div');
    alertElement.classList.add(ChromingDomClasses.alert, alert.level.toLowerCase());
    alertElement.id = `${ChromingDomClasses.alert}-${alert.id}`;
    const iconElement = DomUtil.createElement('i');
    iconElement.classList.add(ChromingDomClasses.alertIcon, `icon-${alert.level.toLowerCase()}`);
    const textElement = DomUtil.createElement('div');
    textElement.classList.add(ChromingDomClasses.alertText);
    textElement.innerText = alert.message;
    const closeElement = DomUtil.createElement('i');
    closeElement.classList.add(ChromingDomClasses.alertIcon, 'icon-close');
    closeElement.onclick = (e) => {
      e.stopPropagation();
      this._alertClosed$.next(alert.id);
    };
    alertElement.appendChild(iconElement);
    alertElement.appendChild(textElement);
    alertElement.appendChild(closeElement);
    this._divAlerts.appendChild(alertElement);
  }

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe> {
    return VideoKeyframeExtractor.extractVideoKeyframe(options, this._mainMediaVideoElement);
  }

  get mainMediaVideoElement(): HTMLVideoElement {
    return this._mainMediaVideoElement;
  }

  get textMediaCaptionsElement(): HTMLElement {
    return this._textMediaCaptionsElement;
  }

  get textImscElement(): HTMLElement {
    return this._textImscElement;
  }

  get alertClosed$(): Observable<Alert['id']> {
    return this._alertClosed$.asObservable();
  }

  get themeConfigChange$(): Observable<void> {
    return this._themeConfigChange$.asObservable();
  }
}
