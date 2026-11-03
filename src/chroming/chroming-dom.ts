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
import {getPlayerAudioApi, getPlayerTextApi, getPlayerVideoApi, type PlayerApi, type PlayerAudioState, type PlayerDetachedApi, type PlayerDomController, type PlayerPlayback} from '../player';
import type {PlayerAudioCommonApi} from '../player/player-audio-api';
import type {PlayerTextCommonApi} from '../player/player-text-api';
import type {LocalizationApi} from '../localization';
import {PlayerAudioType, PlayerEventType, PlayerVideoEventType} from '../player';
import {debounceTime, distinctUntilChanged, filter, fromEvent, Observable, Subject, takeUntil} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import {
  ChromingTheme,
  type ChromingThemeConfigMap,
  ChromingTimeFormat,
  ChromingTrackDestination,
  type ChromingVuMeterConfig,
  ChromingVuMeterPosition,
  type DefaultThemeConfig,
  FullscreenChroming,
  type HelpMenuGroup,
  type OmakaseThemeConfig,
  type PlayerChromingCommonConfig,
  type PlayerChromingThemeConfig,
  type VideoSafeZone,
  type VideoSafeZoneCreate,
  VideoSafeZoneRenderingRegion,
  WatermarkVisibility,
} from './chroming-api';
import {StringUtil} from '../util/string-util';
// @ts-ignore
import playerChromingStyle from '../../style/player-chroming/player-chroming.css?raw';
// @ts-ignore
import mediaCaptionsStyle from '../../node_modules/media-captions/styles/captions.css?raw';
import {BrowserProvider} from '../common/browser-provider';
import {type DomMediaElementConfig, HTMLVideoElementEvent} from '../dom/dom-media-element';
import {MediaTemporalFormat, WindowPlaybackMode} from '../common';
import {errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {Fullscreen} from '../common/fullscreen';
import type {Alert, AlertState} from '../session/alerts-api';
import {
  OmakaseFullscreenButton,
  OmakaseLiveButton,
  OmakaseMarkerBar,
  OmakaseMarkerTrack,
  OmakaseMuteButton,
  OmakasePlayButton,
  OmakasePreviewThumbnail,
  OmakaseTimeDisplay,
  OmakaseTimeRange,
  OmakaseTimeSkipButton,
  type OmakaseAudioSelector,
  type OmakaseDetachToggle,
  type OmakaseTextSelector,
  type OmakaseTrackSelector,
} from './components';
import {isAudioRouterUpdated as isHandlerRouterUpdated} from './components/omakase-track-selector';
import {
  MainMediaType,
  type AudioState,
  type MarkerState,
  type MarkerTrackState,
  type MediaRotationValue,
  type TextTrackState,
  type ThumbnailState,
  type ThumbnailTrackState,
  TrackType,
  type VideoKeyframe,
  type VideoKeyframeOptions,
} from '../media';
import {ChromingUtil} from './chroming-util';
import {UI_LIVE_MODEL_NOT_LIVE, type UiLiveModel} from '../live/live-model';
import type {AudioHandlerApi} from '../audio';
import {VideoKeyframeExtractor} from '../tools/keyframe-extractor';
import {AudioLevelSource, PeakProcessorAudioLevelSource, VuMeter, VuMeterOrientation, VuMeterScale} from '../vu-meter';

export interface ChromingDomConfig<T extends ChromingTheme> extends PlayerChromingThemeConfig<T>, PlayerChromingCommonConfig {
  playerHtmlElementId: string;
  playerWindowPlaybackMode: WindowPlaybackMode;
  playerDetachable: boolean;

  requestAttachFn: () => void;
  requestDetachFn: () => void;
  findThumbnailFn: (trackId: string, time: number) => Observable<ThumbnailState | undefined>;

  mediaElement?: Partial<Pick<DomMediaElementConfig, 'crossOrigin'>>;
}

export const ChromingDomClasses = {
  video: 'omakase-video',
  videoFill: 'omakase-video-fill',
  mediaController: 'omakase-media-controller',
  mediaTheme: 'omakase-media-theme',
  playerFullscreen: 'omakase-player-fullscreen',
  fullscreenChromingDisabled: 'omakase-fullscreen-chroming-disabled',
  simpleFullscreen: 'omakase-simple-fullscreen',
  simpleFullscreenMiddle: 'omakase-simple-fullscreen-middle',
  simpleFullscreenStart: 'omakase-simple-fullscreen-start',
  simpleFullscreenCenter: 'omakase-simple-fullscreen-center',
  simpleFullscreenTimecode: 'omakase-simple-fullscreen-timecode',
  simpleFullscreenLiveButton: 'omakase-simple-fullscreen-live-button',

  backgroundImage: 'omakase-background-image',
  backgroundLogo: 'omakase-background-logo',

  safeZoneWrapper: 'omakase-video-safe-zone-wrapper',
  safeZoneWrapperPlayerRegion: 'omakase-video-safe-zone-wrapper-player-region',
  safeZoneWrapperVideoRegion: 'omakase-video-safe-zone-wrapper-video-region',
  safeZone: 'omakase-video-safe-zone',
  watermarkWrapper: 'omakase-watermark-wrapper',
  watermark: 'omakase-watermark',
  mediaCaptions: 'omakase-media-captions',
  imsc: 'omakase-imsc',
  sidecarVideos: 'omakase-sidecar-videos',

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
  mediaChromeVuMeterToggleEnabled: 'media-chrome-vu-meter-toggle-enabled',
  mediaChromeVuMeterToggleDisabled: 'media-chrome-vu-meter-toggle-disabled',
  mediaChromeRewindAndPlay: 'media-chrome-rewind-and-play',
  mediaChromePlayAndRewind: 'media-chrome-play-and-rewind',
  mediaChromeHome: 'media-chrome-home',
  mediaChromeEnd: 'media-chrome-end',
  mediaChromeKeyframe: 'media-chrome-keyframe',
  mediaChromeSafeZoneOn: 'media-chrome-safe-zone-on',
  mediaChromeSafeZoneOff: 'media-chrome-safe-zone-off',
  mediaControlBar: 'media-control-bar',
  omakaseControlBar: 'omakase-control-bar',
  timecodeContainer: 'timecode-container',
  timecodeWrapper: 'omakase-timecode-wrapper',
  stampBottomRow: 'omakase-stamp-bottom-row',
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
  trackSelectorTop: 'omakase-track-selector-top',
  trackSelectorBottom: 'omakase-track-selector-bottom',
  audioDropdownList: 'omakase-audio-dropdown-list',
  sidecarDropdownList: 'omakase-sidecar-dropdown-list',
  textDropdownList: 'omakase-text-dropdown-list',
  audioBackground: 'omakase-audio-background',
  audioRouterDropdown: 'omakase-audio-router-dropdown',

  mediaThemeCompact: 'omakase-media-theme-compact-audio',
  mediaControllerCompact: 'compact',
  mediaPillarbox: 'media-pillarbox',
  mediaLetterbox: 'media-letterbox',
  mediaHasVideo: 'media-has-video',
  mediaVideoRotated: 'media-video-rotated',

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

  omakaseLiveButton: 'omakase-live-button',
};

export abstract class ChromingDomController<T extends ChromingTheme> implements PlayerDomController, Destroyable {
  protected _themeConfigChange$ = new Subject<void>();

  protected _config: ChromingDomConfig<T>;
  protected _playerInternal: PlayerApi | PlayerDetachedApi | undefined;
  protected _playerAudio: PlayerAudioCommonApi | undefined;
  protected _playerText: PlayerTextCommonApi | undefined;
  protected _localization: LocalizationApi | undefined;
  protected _mainMediaType: MainMediaType | undefined;
  protected _mediaRotation: MediaRotationValue = 0;

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
  protected _divSafeZoneWrapperPlayerRegion: HTMLElement;
  protected _divSafeZoneWrapperVideoRegion: HTMLElement;
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
  protected _sidecarVideosElement: HTMLElement;

  protected _markerBar?: OmakaseMarkerBar;
  protected _timeRange?: OmakaseTimeRange;
  protected _liveButton?: OmakaseLiveButton | undefined;
  protected _attachDetachButton?: OmakaseDetachToggle;

  protected _vuMeterToggle?: MediaChromeButton;
  protected _audioLevelSource?: AudioLevelSource;

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

  /** Last thumbnail track handed to setThumbnailTrack(), kept so the simple-fullscreen preview (mounted lazily on fullscreen entry) can be wired with current data. */
  protected _thumbnailTrack: ThumbnailTrackState | undefined;

  private _showTemporaryOnMouseMoveTimeoutId?: ReturnType<typeof setTimeout>;
  private _showTemporaryBackgroundTimeoutId?: ReturnType<typeof setTimeout>;
  private _showSeekLoadingAnimationTimeoutId?: ReturnType<typeof setTimeout>;

  protected _playerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  protected _alertClosed$ = new Subject<Alert['id']>();
  protected _attachDetachButtonEnabled$ = new Subject<boolean>();
  private _maxAlertCount = 5;
  private _maxStackCount = 3;
  private _displaySpinnerInDetached = true;

  protected _enterPictureInPictureHandler?: () => void;
  protected _leavePictureInPictureHandler?: () => void;
  protected _fullscreenChangeHandler: () => void;
  protected _documentClickListener: ((event: MouseEvent) => void) | undefined;

  /** Wires up (on entry) / tears down (on exit) the simple-fullscreen control bar's player bindings. */
  private _simpleFullscreenBreaker = new ObserverBreaker();

  protected uiLiveModel: UiLiveModel | undefined = undefined;

  protected constructor(config: ChromingDomConfig<T>) {
    this._config = config;

    this._htmlElement = DomUtil.getElementByIdOrFail<HTMLElement>(this._config.playerHtmlElementId);

    if (!this._htmlElement) {
      throw new Error(`No html element with id ${this._config.playerHtmlElementId}`);
    }

    ChromingUtil.observeElementResize(this._htmlElement);

    this._videoElementId = 'video-' + CryptoUtil.uuid();

    this._htmlElement.innerHTML = `
        ${this.createTemplateDom()}
        <media-theme class="${ChromingDomClasses.mediaTheme}" template="omakase-player-theme-${this._config.playerHtmlElementId}">
        </media-theme>`;
    this._htmlElement.addEventListener('contextmenu', (event) => event.preventDefault());

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
    this._divSafeZoneWrapperPlayerRegion = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.safeZoneWrapperPlayerRegion);
    this._divSafeZoneWrapperVideoRegion = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.safeZoneWrapperVideoRegion);
    this._textMediaCaptionsElement = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.mediaCaptions);
    this._textImscElement = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.imsc);
    this._sidecarVideosElement = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.sidecarVideos);
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

    if (BrowserProvider.instance.isSafari) {
      this._mediaControllerElement.classList.add('safari');
      this._themeElement.classList.add('safari');
    }

    if (this._config.watermark) {
      this.setWatermark(this._config.watermark);
    }

    this._fullscreenChangeHandler = () => {
      if (Fullscreen.isFullscreen()) {
        this._mediaControllerElement.classList.add(ChromingDomClasses.playerFullscreen);
        this._themeElement.setAttribute('fullscreen', '');
        if (this._config?.fullscreenChroming === FullscreenChroming.SIMPLE) {
          queueMicrotask(() => this._wireSimpleFullscreen());
        }
      } else {
        this._mediaControllerElement.classList.remove(ChromingDomClasses.playerFullscreen);
        this._themeElement.removeAttribute('fullscreen');
        this._simpleFullscreenBreaker.break();
        if (this._config?.fullscreenChroming === FullscreenChroming.SIMPLE && this.uiLiveModel) {
          queueMicrotask(() => this._syncLiveButton(this.uiLiveModel!));
        }
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

    ChromingUtil.onResize$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
      this.updateCssClassesAndVariables();
    });
  }

  abstract setThemeConfig(themeConfig: Partial<ChromingThemeConfigMap[T]>): void;

  setThumbnailTrack(track: ThumbnailTrackState | undefined): void {
    this._thumbnailTrack = track;
    this._updateSimpleFullscreenThumbnail();
  }

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
    const hasVideo = !!(this._mainMediaVideoElement.videoWidth && this._mainMediaVideoElement.videoHeight);
    if (hasVideo) {
      this._mediaControllerElement.classList.add(ChromingDomClasses.mediaHasVideo);
    } else {
      this._mediaControllerElement.classList.remove(ChromingDomClasses.mediaHasVideo);
    }
    DomUtil.hideElements(this._divButtonOverlayLoading, this._divButtonOverlayError);
    if (!this._mainMediaVideoElement.poster) {
      DomUtil.hideElements(this._divBackground);
    }
    this.updateCssClassesAndVariables();
    this.wireVuMeters();
    this.updateFloatingVuMeterToggle(this._playerAudio!.state);
  }

  private updateCssClassesAndVariables() {
    const {videoWidth, videoHeight} = this._mainMediaVideoElement;
    const {offsetHeight, offsetWidth} = this._mediaControllerElement;
    const comparisonTreshhold = 0.01;
    const rotated = this._mediaRotation === 90 || this._mediaRotation === 270;
    const effectiveVideoWidth = rotated ? videoHeight : videoWidth;
    const effectiveVideoHeight = rotated ? videoWidth : videoHeight;
    if (effectiveVideoWidth && effectiveVideoHeight) {
      this._themeElement.style.setProperty('--video-aspect-ratio', `${effectiveVideoWidth / effectiveVideoHeight}`);
      this._themeElement.style.setProperty('--video-letterbox-height', `${Math.max((offsetHeight - offsetWidth * (effectiveVideoHeight / effectiveVideoWidth)) / 2, 0)}px`);
      this._themeElement.style.setProperty('--player-width', `${offsetWidth}`);
      this._themeElement.style.setProperty('--player-height', `${offsetHeight}`);
      if (offsetWidth / offsetHeight > effectiveVideoWidth / effectiveVideoHeight + comparisonTreshhold) {
        this._mediaControllerElement.classList.remove(ChromingDomClasses.mediaLetterbox);
        this._mediaControllerElement.classList.add(ChromingDomClasses.mediaPillarbox);
        this._themeElement.classList.remove(ChromingDomClasses.mediaLetterbox);
        this._themeElement.classList.add(ChromingDomClasses.mediaPillarbox);
      } else if (offsetWidth / offsetHeight < effectiveVideoWidth / effectiveVideoHeight - comparisonTreshhold) {
        this._mediaControllerElement.classList.remove(ChromingDomClasses.mediaPillarbox);
        this._mediaControllerElement.classList.add(ChromingDomClasses.mediaLetterbox);
        this._themeElement.classList.remove(ChromingDomClasses.mediaPillarbox);
        this._themeElement.classList.add(ChromingDomClasses.mediaLetterbox);
      } else {
        this._mediaControllerElement.classList.remove(ChromingDomClasses.mediaPillarbox);
        this._mediaControllerElement.classList.remove(ChromingDomClasses.mediaLetterbox);
        this._themeElement.classList.remove(ChromingDomClasses.mediaPillarbox);
        this._themeElement.classList.remove(ChromingDomClasses.mediaLetterbox);
      }
    } else {
      this._themeElement.style.setProperty('--video-letterbox-height', '0px');
      this._mediaControllerElement.classList.remove(ChromingDomClasses.mediaPillarbox);
      this._mediaControllerElement.classList.remove(ChromingDomClasses.mediaLetterbox);
      this._themeElement.classList.remove(ChromingDomClasses.mediaPillarbox);
      this._themeElement.classList.remove(ChromingDomClasses.mediaLetterbox);
    }
  }

  showError(): void {
    DomUtil.hideElements(this._divButtonOverlayLoading).showElements(this._divButtonOverlayError);
  }

  isLoading(): boolean {
    return this._mediaControllerElement.classList.contains('omakase-video-not-loaded');
  }

  prepareForAttaching(hasMainMedia: boolean): void {
    this._divAlerts.innerHTML = '';
    this.setLiveModel(UI_LIVE_MODEL_NOT_LIVE);
    this._mediaControllerElement.classList.remove('omakase-player-detached');
    DomUtil.hideElements(this._divButtonOverlayAttach);
    if (hasMainMedia) {
      DomUtil.showElements(this._divButtonOverlayLoading);
    }
    this.showLoading();
  }

  prepareForDetaching(): void {
    this.setLiveModel(UI_LIVE_MODEL_NOT_LIVE);
    this._mediaControllerElement.classList.add('omakase-player-detached');
    DomUtil.showElements(this._divButtonOverlayAttach);
  }

  setAttachDetachButtonEnabled(enabled: boolean): void {
    this._attachDetachButtonEnabled$.next(enabled);
  }

  setPlayer(playerInternal: PlayerApi | PlayerDetachedApi) {
    this.resetMainMediaVideoElement();
    this._playerInternal = playerInternal;
    this._playerAudio = getPlayerAudioApi(playerInternal);
    this._playerText = getPlayerTextApi(playerInternal);
    this.wirePlayer();
  }

  protected getAudioTracks(playerAudioType?: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR) {
    const player = this._playerInternal!;
    return 'audio' in player ? player.audio.getTracks(playerAudioType as PlayerAudioType.MAIN) : player.audioInternal.getTracks(playerAudioType as PlayerAudioType.MAIN);
  }

  setLocalization(localization: LocalizationApi) {
    this._localization = localization;
    if (this._liveButton) {
      this._liveButton.localization = localization;
    }
  }

  setLiveModel(model: UiLiveModel): void {
    this.uiLiveModel = model;
    this._timeRange?.setLiveModel(model);
    this._markerBar?.setLiveModel(model);
    this._syncLiveButton(model);
  }

  /**
   * Themes that show a "go to live" button override this to return the element the button mounts into.
   * Returning undefined (the default) means the theme has no live button.
   */
  protected _liveButtonContainer(): HTMLElement | undefined {
    return undefined;
  }

  private _resolveLiveButtonContainer(): HTMLElement | undefined {
    if (this._config?.fullscreenChroming === FullscreenChroming.SIMPLE) {
      const overlayContainer = this.getShadowElement<HTMLElement>(`.${ChromingDomClasses.simpleFullscreenLiveButton}`);
      if (overlayContainer) {
        return overlayContainer;
      }
    }
    return this._liveButtonContainer();
  }

  private _syncLiveButton(model: UiLiveModel): void {
    const container = this._resolveLiveButtonContainer();
    if (model.isLive && container) {
      if (this._liveButton && this._liveButton.parentElement !== container) {
        this._liveButton.remove();
        this._liveButton = undefined;
      }
      if (!this._liveButton) {
        const liveButton = document.createElement('omakase-live-button') as OmakaseLiveButton;
        liveButton.className = `${ChromingDomClasses.mediaChromeButton} ${ChromingDomClasses.omakaseLiveButton}`;
        if (this._localization) {
          liveButton.localization = this._localization;
        }
        if (this._playerInternal) {
          liveButton.player = this._playerInternal;
        }
        container.insertBefore(liveButton, container.querySelector(`:scope > .${ChromingDomClasses.vuMeterControlBar}`));
        this._liveButton = liveButton;
      }
      this._liveButton.setLiveModel(model);
    } else if (this._liveButton) {
      this._liveButton.remove();
      this._liveButton = undefined;
    }
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

  get mediaRotation(): MediaRotationValue {
    return this._mediaRotation;
  }

  setMediaRotation(mediaRotation: MediaRotationValue) {
    this._mediaRotation = mediaRotation;
    const rotated = mediaRotation === 90 || mediaRotation === 270;
    this._mediaControllerElement.classList.toggle(ChromingDomClasses.mediaVideoRotated, rotated);
    this._themeElement.classList.toggle(ChromingDomClasses.mediaVideoRotated, rotated);
    this._themeElement.style.setProperty('--video-rotation-deg', `${mediaRotation}deg`);
    this.updateCssClassesAndVariables();
  }

  createMainMediaVideoElement() {
    if (this._mainMediaVideoElement) {
      //unload media before removing the element
      this._mainMediaVideoElement.src = '';
      this._mainMediaVideoElement.load();
    }
    this._themeElement.innerHTML = `<video id="${this._videoElementId}" class="${ChromingDomClasses.video}" slot="media" ${StringUtil.isNonEmpty(this._config.mediaElement?.crossOrigin) ? `crossorigin="${this._config.mediaElement?.crossOrigin}"` : ``}></video>`;
    this._mainMediaVideoElement = DomUtil.getElementByIdOrFail<HTMLVideoElement>(this._videoElementId, this._themeElement);
  }

  createTemplateDom() {
    const styleUrls: string[] = this._config.styleUrl ? (Array.isArray(this._config.styleUrl) ? this._config.styleUrl : [this._config.styleUrl]) : [];
    return `<template id="omakase-player-theme-${this._config.playerHtmlElementId}">
        <style>${mediaCaptionsStyle}</style>
        <style>${playerChromingStyle}</style>
        ${this._config?.styleUrl ? styleUrls.map((url) => `<link rel="stylesheet" href="${url}"></link>`) : ''}
        <media-controller class="${ChromingDomClasses.mediaController} ${this._config?.fullscreenChroming === FullscreenChroming.SIMPLE ? ChromingDomClasses.fullscreenChromingDisabled : ''}" nohotkeys gesturesdisabled>
          <div class="${ChromingDomClasses.backgroundImage}">
            <div class="${ChromingDomClasses.backgroundLogo}"></div>
          </div>
          <slot name="media" slot="media"></slot>
          <div class="${ChromingDomClasses.sidecarVideos}" noautohide></div>
          ${
            this._config?.fullscreenChroming === FullscreenChroming.SIMPLE
              ? `<template if="fullscreen">
                  <div class="${ChromingDomClasses.simpleFullscreen}">
                    <omakase-time-range>
                      <div slot="preview" class="${ChromingDomClasses.mediaChromePreviewWrapper}">
                        <omakase-preview-thumbnail class="${ChromingDomClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
                        <omakase-time-display format="${this.getSimpleFullscreenTimeFormat() === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this.getSimpleFullscreenTimeFormat() === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromePreviewTimecode}"></omakase-time-display>
                      </div>
                    </omakase-time-range>
                    <div class="${ChromingDomClasses.simpleFullscreenMiddle}">
                      <div class="${ChromingDomClasses.simpleFullscreenStart}">
                        <omakase-mute-button class="${ChromingDomClasses.mediaChromeButton} shadow" volume-flyout="right">
                            <span slot="high" class="${ChromingDomClasses.mediaChromeAudioHigh}"></span>
                            <span slot="medium" class="${ChromingDomClasses.mediaChromeAudioMedium}"></span>
                            <span slot="low" class="${ChromingDomClasses.mediaChromeAudioLow}"></span>
                            <span slot="off" class="${ChromingDomClasses.mediaChromeAudioMute}"></span>
                            <omakase-volume-range slot="volume"></omakase-volume-range>
                        </omakase-mute-button>
                        <div class="${ChromingDomClasses.simpleFullscreenLiveButton}"></div>
                      </div>
                      <div class="${ChromingDomClasses.simpleFullscreenCenter}">
                        <omakase-time-skip-button unit="frame" amount="-1" class="${ChromingDomClasses.mediaChromeButton} ${ChromingDomClasses.frameBackwardsButton}"></omakase-time-skip-button>
                        <omakase-play-button class="${ChromingDomClasses.mediaChromeButton}">
                          <span slot="play" class="${ChromingDomClasses.mediaChromePlay}"></span>
                          <span slot="pause" class="${ChromingDomClasses.mediaChromePause}"></span>
                        </omakase-play-button>
                        <omakase-time-skip-button unit="frame" amount="1" class="${ChromingDomClasses.mediaChromeButton} ${ChromingDomClasses.frameForwardButton}"></omakase-time-skip-button>
                      </div>
                      <omakase-fullscreen-button class="${ChromingDomClasses.mediaChromeButton}">
                        <span slot="enter" class="${ChromingDomClasses.mediaChromeFullscreenEnter}"></span>
                        <span slot="exit" class="${ChromingDomClasses.mediaChromeFullscreenExit}"></span>
                      </omakase-fullscreen-button>
                    </div>
                    <omakase-time-display withduration format="${this.getSimpleFullscreenTimeFormat() === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this.getSimpleFullscreenTimeFormat() === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.simpleFullscreenTimecode}"></omakase-time-display>
                  </div>
                </template>`
              : ''
          }
          <div class="${ChromingDomClasses.safeZoneWrapper} ${ChromingDomClasses.safeZoneWrapperPlayerRegion}" noautohide></div>
          <div class="${ChromingDomClasses.safeZoneWrapper} ${ChromingDomClasses.safeZoneWrapperVideoRegion}" noautohide></div>
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
      return this.applyNordicScale({
        ...baseVuMeterConfig,
        ...themeConfig.controlBarVuMeterConfig,
        style: {
          ...themeConfig.vuMeterConfig.style,
          ...themeConfig.controlBarVuMeterConfig?.style,
          showScaleMarks: false,
          showScaleLabels: false,
        },
      });
    } else if (position === ChromingVuMeterPosition.FLOATING) {
      return this.applyNordicScale({
        ...baseVuMeterConfig,
        ...themeConfig.floatingVuMeterConfig,
        style: {
          ...themeConfig.vuMeterConfig.style,
          ...themeConfig.floatingVuMeterConfig?.style,
          showScaleMarks: false,
        },
      });
    } else {
      return this.applyNordicScale(baseVuMeterConfig);
    }
  }

  protected applyNordicScale(config: ChromingVuMeterConfig): ChromingVuMeterConfig {
    if (config.scale === VuMeterScale.NORDIC) {
      config.scaleOffsetDb = 18;
    }
    return config;
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
        let handler = this._playerAudio!.getHandler(PlayerAudioType.OUTPUT);
        if (handler) {
          this._audioLevelSource.setHandler(handler);
        }
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
    this._simpleFullscreenBreaker.destroy();
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

    // failed sidecar video load is followed by unload
    getPlayerVideoApi(playerInternal)
      .onEvent$.pipe(
        filter((event) => event.type === PlayerVideoEventType.PLAYER_VIDEO_TRACK_LOADING || event.type === PlayerVideoEventType.PLAYER_VIDEO_TRACK_UNLOADED),
        takeUntil(this._playerBreaker.observer),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe(() => {
        this.updatePiPAvailability();
      });
    this.updatePiPAvailability();

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
              this._displaySpinnerInDetached = true;
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
              this.updatePiPAvailability();
              if (this._markerBar) {
                this._markerBar.mediaDuration = playerInternal.getDuration();
              }
              if (!this._autoHidePlaybackButtons) {
                const playControlToShow = this._playerInternal!.playerSession.playback.playing ? this._divButtonOverlayPause : this._divButtonOverlayPlay;
                DomUtil.hideElements(...allOverlayButtons).showElements(playControlToShow);
              }
              break;
            case PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED:
              this._displaySpinnerInDetached = false;
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
          // any element in media slot, ie. slate that replaces video element
          const isMediaSlotElement = composedTarget?.slot === 'media';
          if (allowList.includes(composedTarget?.localName) || isMediaSlotElement) {
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

    if (this.uiLiveModel) {
      this._syncLiveButton(this.uiLiveModel);
    }
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
    this._divSafeZoneWrapperPlayerRegion.innerHTML = '';
    this._divSafeZoneWrapperVideoRegion.innerHTML = '';
  }

  addSafeZone(videoSafeZone: VideoSafeZoneCreate, allVideoSafeZones: VideoSafeZone[], renderingRegion: VideoSafeZoneRenderingRegion = VideoSafeZoneRenderingRegion.VIDEO): VideoSafeZone {
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
      renderingRegion,
    };

    let htmlElement: HTMLElement = DomUtil.createElement<'div'>('div');
    htmlElement.id = newVideoSafeZone.htmlId!;
    htmlElement.className = newVideoSafeZone.htmlClass;
    htmlElement.style.top = `${newVideoSafeZone.topRightBottomLeftPercent[0]}%`;
    htmlElement.style.right = `${newVideoSafeZone.topRightBottomLeftPercent[1]}%`;
    htmlElement.style.bottom = `${newVideoSafeZone.topRightBottomLeftPercent[2]}%`;
    htmlElement.style.left = `${newVideoSafeZone.topRightBottomLeftPercent[3]}%`;

    const wrapper = renderingRegion === VideoSafeZoneRenderingRegion.PLAYER ? this._divSafeZoneWrapperPlayerRegion : this._divSafeZoneWrapperVideoRegion;
    wrapper.append(htmlElement);

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
            Fullscreen.requestFullscreen(this._config?.fullscreenChroming === FullscreenChroming.DISABLED ? this._mainMediaVideoElement : this._mediaControllerElement)
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

  protected getSimpleFullscreenTimeFormat(): ChromingTimeFormat | undefined {
    const themeConfig = this.themeConfig ?? this._config.themeConfig;
    return themeConfig && 'timeFormat' in themeConfig ? (themeConfig as {timeFormat?: ChromingTimeFormat}).timeFormat : undefined;
  }

  protected applySimpleFullscreenTimeFormat(timeDisplay: OmakaseTimeDisplay): void {
    const timeFormat = this.getSimpleFullscreenTimeFormat();
    timeDisplay.displayFormat = timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
    timeDisplay.isCountdown = timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
  }

  protected updateSimpleFullscreenTimeFormat(): void {
    const timeDisplays = this._themeElement.shadowRoot?.querySelectorAll(`.${ChromingDomClasses.simpleFullscreen} omakase-time-display`) as NodeListOf<OmakaseTimeDisplay> | undefined;
    timeDisplays?.forEach((timeDisplay) => this.applySimpleFullscreenTimeFormat(timeDisplay));

    const currentTimeDisplay = this._themeElement.shadowRoot?.querySelector(`.${ChromingDomClasses.simpleFullscreenTimecode}`) as OmakaseTimeDisplay | undefined;
    currentTimeDisplay?.updateTime();
  }

  /** Re-applies the current thumbnail track to the simple-fullscreen preview thumbnail, if it's currently mounted (i.e. we're in fullscreen). */
  private _updateSimpleFullscreenThumbnail(): void {
    const previewThumbnail = this._themeElement.shadowRoot?.querySelector(`.${ChromingDomClasses.simpleFullscreen} omakase-preview-thumbnail`) as OmakasePreviewThumbnail | undefined;
    if (previewThumbnail) {
      previewThumbnail.thumbnailTrack = this._thumbnailTrack;
      previewThumbnail.thumbnailFn = this._config.findThumbnailFn;
    }
  }

  private _wireSimpleFullscreen(): void {
    const playerInternal = this._playerInternal;
    if (!playerInternal) {
      return;
    }

    const simpleFullscreenQuery = <T extends Element>(selector: string) => this._themeElement.shadowRoot?.querySelector(`.${ChromingDomClasses.simpleFullscreen} ${selector}`) as T | undefined;

    const playButton = simpleFullscreenQuery<OmakasePlayButton>('omakase-play-button');
    const timeRange = simpleFullscreenQuery<OmakaseTimeRange>('omakase-time-range');
    const fullscreenButton = simpleFullscreenQuery<OmakaseFullscreenButton>('omakase-fullscreen-button');
    const muteButton = simpleFullscreenQuery<OmakaseMuteButton>('omakase-mute-button');
    const timeDisplay = simpleFullscreenQuery<OmakaseTimeDisplay>(`.${ChromingDomClasses.simpleFullscreenTimecode}`);
    const previewTimecode = simpleFullscreenQuery<OmakaseTimeDisplay>(`.${ChromingDomClasses.mediaChromePreviewTimecode}`);
    const previewThumbnail = simpleFullscreenQuery<OmakasePreviewThumbnail>('omakase-preview-thumbnail');
    const frameBackwardButton = simpleFullscreenQuery<OmakaseTimeSkipButton>(`.${ChromingDomClasses.frameBackwardsButton}`);
    const frameForwardButton = simpleFullscreenQuery<OmakaseTimeSkipButton>(`.${ChromingDomClasses.frameForwardButton}`);

    if (!playButton || !timeRange || !fullscreenButton || !muteButton || !timeDisplay || !frameBackwardButton || !frameForwardButton) {
      return;
    }

    playButton.player = playerInternal;
    fullscreenButton.player = playerInternal;
    timeRange.player = playerInternal;
    // also wires the mute button's volume range
    muteButton.player = playerInternal;
    timeDisplay.player = playerInternal;
    frameBackwardButton.player = playerInternal;
    frameForwardButton.player = playerInternal;
    this.applySimpleFullscreenTimeFormat(timeDisplay);
    timeDisplay.updateTime();
    const playerAudio = getPlayerAudioApi(playerInternal);
    muteButton.setVolumeLevel(playerAudio.muted, playerAudio.volume);

    if (previewTimecode) {
      previewTimecode.player = playerInternal;
      previewTimecode.timeRange = timeRange;
      this.applySimpleFullscreenTimeFormat(previewTimecode);
    }

    if (previewThumbnail) {
      previewThumbnail.timeRange = timeRange;
      previewThumbnail.thumbnailTrack = this._thumbnailTrack;
      previewThumbnail.thumbnailFn = this._config.findThumbnailFn;
    }

    timeRange.onSeek$.pipe(takeUntil(this._simpleFullscreenBreaker.observer)).subscribe({
      next: (time) => {
        playerInternal.seekTo(time);
      },
    });

    fromEvent<MouseEvent>(frameBackwardButton, 'click')
      .pipe(takeUntil(this._simpleFullscreenBreaker.observer))
      .subscribe(() => {
        playerInternal.pause().subscribe(() => {
          playerInternal.seekFromCurrentTime(-1, MediaTemporalFormat.FRAME_COUNT);
        });
      });

    fromEvent<MouseEvent>(frameForwardButton, 'click')
      .pipe(takeUntil(this._simpleFullscreenBreaker.observer))
      .subscribe(() => {
        playerInternal.pause().subscribe(() => {
          playerInternal.seekFromCurrentTime(1, MediaTemporalFormat.FRAME_COUNT);
        });
      });

    if (this.uiLiveModel) {
      this._syncLiveButton(this.uiLiveModel);
    }
  }

  enablePiP(): Observable<void> {
    return passiveObservable((observer) => {
      const pipDisabledReason = this.getPiPDisabledReason();
      if (pipDisabledReason) {
        console.warn(pipDisabledReason);
        nextCompleteObserver(observer);
      } else {
        if (!document.pictureInPictureElement) {
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

  /**
   * Whether picture in picture can be entered for the loaded media, see {@link getPiPDisabledReason}.
   */
  isPiPSupported(): boolean {
    return !this.getPiPDisabledReason();
  }

  /**
   * Returns why picture in picture can't be entered, or `undefined` if it can.
   */
  protected getPiPDisabledReason(): string | undefined {
    if (BrowserProvider.instance.isFirefox || !document.pictureInPictureEnabled) {
      return 'Picture in picture is not supported in this browser';
    }
    if (this._mainMediaVideoElement.disablePictureInPicture) {
      return 'Picture in picture is disabled on main media video element';
    }
    const player = this._playerInternal;
    if (!player?.isMainMediaLoaded) {
      return 'Picture in picture is disabled while main media is not loaded';
    }
    const mainMediaType = 'mainMediaType' in player ? player.mainMediaType : player.mainMedia?.mainMediaType;
    if (mainMediaType === MainMediaType.AUDIO_FILE) {
      return 'Picture in picture is disabled while an audio file is loaded as main media';
    }
    if (mainMediaType === MainMediaType.SLATE) {
      return 'Picture in picture is disabled while a slate is loaded as main media';
    }
    if (mainMediaType === MainMediaType.FRAME_IMAGE) {
      return 'Picture in picture is disabled while frame images are loaded as main media';
    }
    const videoTracks: {trackType: TrackType}[] = 'video' in player ? player.video.getTracks() : player.videoInternal.getTracks();
    if (videoTracks.some((p) => p.trackType === TrackType.TRICK_TRACK)) {
      return 'Picture in picture is disabled while a trick track is loaded';
    }
    if (videoTracks.length > 0) {
      return 'Picture in picture is disabled while sidecar videos are loaded';
    }
    return void 0;
  }

  /**
   * Disables the picture in picture button and leaves picture in picture if it can't be entered for the loaded media.
   * In detached window the same button attaches the player back, so it stays enabled.
   */
  protected updatePiPAvailability() {
    if (this._config.playerDetachable || this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED || !this._attachDetachButton) {
      return;
    }
    const pipDisabled = !this.isPiPSupported();
    this._attachDetachButton.enabled = !pipDisabled;
    if (pipDisabled && document.pictureInPictureElement === this._mainMediaVideoElement) {
      this.disablePiP().subscribe();
    }
  }

  protected togglePiP(): Observable<void> {
    return document.pictureInPictureElement === this._mainMediaVideoElement ? this.disablePiP() : this.enablePiP();
  }

  protected addPiPListeners() {
    if (!this._config.playerDetachable && this._attachDetachButton) {
      if (this._enterPictureInPictureHandler) {
        this._mainMediaVideoElement.addEventListener(HTMLVideoElementEvent.ENTERPIP, this._enterPictureInPictureHandler);
      }
      if (this._leavePictureInPictureHandler) {
        this._mainMediaVideoElement.addEventListener(HTMLVideoElementEvent.LEAVEPIP, this._leavePictureInPictureHandler);
      }
      this.updatePiPAvailability();
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

  // the player doesn't emit an event when a track is renamed, so the selectors listing it are refreshed from here
  updateAudioTrackLabel(type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, track: AudioState) {
    this.getShadowElements<OmakaseAudioSelector | OmakaseTrackSelector>('omakase-audio-selector, omakase-track-selector')?.forEach((selector) => selector.refresh());
  }

  updateTextTrackLabel(track: TextTrackState) {
    this.getShadowElements<OmakaseTextSelector | OmakaseTrackSelector>('omakase-text-selector, omakase-track-selector')?.forEach((selector) => selector.refresh());
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

  protected isAudioRouterUpdated(handler: AudioHandlerApi): boolean {
    return isHandlerRouterUpdated(handler);
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
    if (this._displaySpinnerInDetached && this._config.playerWindowPlaybackMode === WindowPlaybackMode.DETACHED) {
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

  get sidecarVideosElement(): HTMLElement {
    return this._sidecarVideosElement;
  }

  get alertClosed$(): Observable<Alert['id']> {
    return this._alertClosed$.asObservable();
  }

  get themeConfigChange$(): Observable<void> {
    return this._themeConfigChange$.asObservable();
  }
}
