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

import {Fullscreen} from '../dom/fullscreen';
import {filter, fromEvent, merge, Observable, race, Subject, take, takeUntil} from 'rxjs';
import {OmakaseTextTrack, VideoFullscreenChangeEvent, VideoHelpMenuChangeEvent, VideoSafeZoneChangeEvent} from '../types';
import {errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {z} from 'zod';
import {VideoControllerApi} from './video-controller-api';
import {StringUtil} from '../util/string-util';
import {nullifier} from '../util/destroy-util';
import {DomUtil} from '../util/dom-util';
import {MarkerTrackConfig, VideoSafeZone} from './model';
import {isNullOrUndefined} from '../util/object-util';
import {CryptoUtil} from '../util/crypto-util';
import {VideoDomControllerApi} from './video-dom-controller-api';
import {MediaChromeButton, MediaController, MediaTooltip} from 'media-chrome';
import {OmakaseMarkerBar, OmakasePreviewThumbnail, OmakaseTimeDisplay, OmakaseTimeRange} from '../components';
import {VttLoadOptions} from '../api/vtt-aware-api';
import {VttAdapter} from '../common/vtt-adapter';
import {ThumbnailVttFile} from '../vtt';
import 'media-chrome';
import '../components';
import {OmakaseDropdown} from '../components/omakase-dropdown';
import {SvgUtil} from '../util/svg-util';
import {OmakaseVolumeRange} from '../components/omakase-volume-range';
import {OmakaseMuteButton} from '../components/omakase-mute-button';
import {OmakaseDropdownList, OmakaseDropdownListItem} from '../components/omakase-dropdown-list';
import {OmakaseDropdownToggle} from '../components/omakase-dropdown-toggle';
import {BrowserProvider} from '../common/browser-provider';
import {ChromelessChroming, CustomChroming, DEFAULT_PLAYER_CHROMING, DefaultChroming, StampChroming} from './../player-chroming/model';
import {MarkerTrackApi} from '../api';
import {TimeRangeMarkerTrackApi} from '../api/time-range-marker-track-api';
import {HTMLElementEvents, HTMLVideoElementEvents} from '../media-element/omp-media-element';
import {AuthConfig} from '../common/authentication';

const domClasses = {
  player: 'omakase-player',
  playerWrapper: 'omakase-player-wrapper',
  playerDetached: 'omakase-player-detached',
  playerFullscreen: 'omakase-player-fullscreen',
  video: 'omakase-video',
  videoControls: 'omakase-video-controls',
  timecodeContainer: 'timecode-container',

  buttonOverlayPlay: 'omakase-button-play',
  buttonOverlayPause: 'omakase-button-pause',
  buttonOverlayLoading: 'omakase-button-loading',
  buttonOverlayError: 'omakase-button-error',
  buttonOverlayReplay: 'omakase-button-replay',
  buttonOverlayHelp: 'omakase-help-button',
  buttonOverlayAttach: 'omakase-overlay-button-attach',

  help: 'omakase-help',
  helpMenu: 'omakase-help-menu',

  sectionBottomRight: 'omakase-section-bottom-right',
  buttonAttach: 'omakase-button-attach',
  buttonFullscreen: 'omakase-button-fullscreen',

  errorMessage: 'omakase-error-message',
  safeZoneWrapper: 'omakase-video-safe-zone-wrapper',
  safeZone: 'omakase-video-safe-zone',
  watermarkWrapper: 'omakase-watermark-wrapper',
  watermark: 'omakase-watermark',
  alerts: 'omakase-player-alerts',
  detachedBackground: 'omakase-detached-background',
  backgroundImage: 'omakase-background-image',
  audioTextMenu: 'omakase-audio-text-menu',
  audioTextToggle: 'omakase-audio-text-toggle',

  mediaChromeButton: 'media-chrome-button',
  mediaChromePlay: 'media-chrome-play',
  mediaChromePause: 'media-chrome-pause',
  mediaRewindButton: 'media-chrome-rewind',
  mediaFastRewindButton: 'media-chrome-fast-rewind',
  mediaForwardButton: 'media-chrome-forward',
  mediaFastForwardButton: 'media-chrome-fast-forward',
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
  mediaChromeBitcTooltip: 'media-chrome-bitc-tooltip',
  mediaChromeCurrentTimecode: 'media-chrome-current-timecode',
  mediaChromePreviewTimecode: 'media-chrome-preview-timecode',
  mediaChromePreviewThumbnail: 'media-chrome-preview-thumbnail',
  mediaChromePreviewWrapper: 'media-chrome-preview-wrapper',
  mediaChromeTextOn: 'media-chrome-text-on',
  mediaChromeTextOff: 'media-chrome-text-off',
};

export interface VideoDomControllerConfig {
  playerHTMLElementId: string;
  crossorigin: 'anonymous' | 'use-credentials';
  detachedPlayer: boolean;
  disablePictureInPicture: boolean;
  playerChroming: DefaultChroming | StampChroming | CustomChroming | ChromelessChroming;
  playerClickHandler?: () => void;
}

export const VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT: VideoDomControllerConfig = {
  playerHTMLElementId: 'omakase-player',
  crossorigin: 'anonymous',
  detachedPlayer: false,
  disablePictureInPicture: false,
  playerChroming: DEFAULT_PLAYER_CHROMING,
};

export class VideoDomController implements VideoDomControllerApi {
  public readonly onFullscreenChange$: Subject<VideoFullscreenChangeEvent> = new Subject<VideoFullscreenChangeEvent>();

  public readonly onVideoSafeZoneChange$: Subject<VideoSafeZoneChangeEvent> = new Subject<VideoSafeZoneChangeEvent>();

  protected readonly _config: VideoDomControllerConfig;
  protected readonly _vttAdapter = new VttAdapter(ThumbnailVttFile);

  protected readonly _divPlayer: HTMLElement;

  protected _videoController!: VideoControllerApi;
  protected _videoEventBreaker$: Subject<void> = new Subject();

  /**
   * Main video element
   * @protected
   */
  protected _videoElement!: HTMLVideoElement;

  protected _mediaControllerElement!: MediaController;
  protected _divPlayerWrapper!: HTMLElement;
  protected _divButtonOverlayPlay?: HTMLElement;
  protected _divButtonOverlayPause?: HTMLElement;
  protected _divButtonOverlayLoading?: HTMLElement;
  protected _divButtonOverlayError?: HTMLElement;
  protected _divButtonOverlayReplay?: HTMLElement;
  protected _divButtonOverlayAttach?: HTMLElement;

  protected _divButtonHelp?: HTMLElement;
  protected _divHelp!: HTMLElement;
  protected _divHelpMenu?: HTMLElement;

  protected _audioTextToggle?: OmakaseDropdownToggle;

  protected _divSectionBottomRight!: HTMLElement;
  protected _divButtonAttach!: HTMLElement;
  protected _divButtonFullscreen!: HTMLElement;

  protected _divErrorMessage!: HTMLElement;
  protected _divSafeZoneWrapper!: HTMLElement;
  protected _divWatermarkWrapper!: HTMLElement;
  protected _divWatermark!: HTMLElement;
  protected _divAlerts!: HTMLElement;
  protected _divBackgroundImage!: HTMLElement;
  protected _divDetachedBackground!: HTMLElement;
  protected _divTimecode?: HTMLElement;

  protected _buttonFastRewind?: MediaChromeButton;
  protected _buttonRewind?: MediaChromeButton;
  protected _buttonForward?: MediaChromeButton;
  protected _buttonFastForward?: MediaChromeButton;
  protected _buttonAttach?: MediaChromeButton;
  protected _buttonDetach?: MediaChromeButton;
  protected _buttonBitc?: MediaChromeButton;
  protected _tooltipBitc?: MediaTooltip;
  protected _timeRangeControl?: OmakaseTimeRange;
  protected _volumeRangeControl?: OmakaseVolumeRange;
  protected _currentTimecode?: OmakaseTimeDisplay;
  protected _previewTimecode?: OmakaseTimeDisplay;
  protected _previewThumbnail?: OmakasePreviewThumbnail;
  protected _muteButton?: OmakaseMuteButton;
  protected _textButton?: MediaChromeButton;
  protected _speedDropdown?: OmakaseDropdown;
  protected _audioDropdown?: OmakaseDropdown;
  protected _speedDropdownList?: OmakaseDropdownList;
  protected _audioDropdownList?: OmakaseDropdownList;
  protected _textDropdownList?: OmakaseDropdownList;
  protected _sidecarDropdownList?: OmakaseDropdownList;
  protected _audioDropdownToggle?: OmakaseDropdownToggle;
  protected _markerBar?: OmakaseMarkerBar;

  protected _bitcEnabled = false;

  protected _showTemporaryOnMouseMoveTimeoutId?: ReturnType<typeof setTimeout>;

  protected _fullscreenChangeHandler: () => void;
  protected _enterPictureInPictureHandler: () => void;
  protected _leavePictureInPictureHandler: () => void;

  protected _videoSafeZones: VideoSafeZone[] = [];

  protected _destroyed$ = new Subject<void>();

  constructor(config: Partial<VideoDomControllerConfig>) {
    this._config = {
      ...VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT,
      ...config,
    };

    this._divPlayer = DomUtil.getElementById<HTMLElement>(this._config.playerHTMLElementId);

    if (!this._divPlayer) {
      throw new Error(`DOM <div> for player not found. ID provided: ${this._config.playerHTMLElementId}`);
    }

    this.createPlayerDom();

    this._fullscreenChangeHandler = () => {
      if (this.isFullscreen()) {
        this._divPlayer.classList.add(domClasses.playerFullscreen);
      } else {
        this._divPlayer.classList.remove(domClasses.playerFullscreen);
      }
      this.onFullscreenChange$.next({
        fullscreen: this.isFullscreen(),
      });
    };

    this._enterPictureInPictureHandler = () => {
      this._buttonDetach!.className = domClasses.mediaChromeAttach;
    };

    this._leavePictureInPictureHandler = () => {
      this._buttonDetach!.className = domClasses.mediaChromeDetach;
    };

    Fullscreen.on('change', this._fullscreenChangeHandler);

    // this._onAudioElementAdded$.subscribe({
    //   next: (audioElement) => {
    //     this._audioElements.set(audioElement.id, audioElement);
    //   },
    // });
  }

  private createPlayerDom() {
    this._divPlayer.classList.add(`${domClasses.player}`);

    this._divPlayer.innerHTML = `<div class="${domClasses.playerWrapper} ${domClasses.playerWrapper}-${this._config.playerChroming.theme.toLowerCase()} media-chrome-${this.getVisibilityClass()}">
          <media-controller gesturesdisabled class="media-controller-${this._config.playerChroming.theme.toLowerCase()}">
              <video slot="media" class="${domClasses.video} ${domClasses.video}-${(this._config.playerChroming as StampChroming).themeConfig?.stampScale?.toLocaleLowerCase()}" playsinline=""></video>
              ${this._config.playerChroming.theme === 'DEFAULT' && this._config.playerChroming?.themeConfig?.floatingControls?.includes('TRACKSELECTOR') ? `<div slot="top-chrome"><div class="${domClasses.audioTextMenu}">${this.getAudioTextDropdown('top')}</div></div>` : ''}
              <div slot="centered-chrome" class="${domClasses.videoControls}" ${this._config.playerChroming.watermarkVisibility === 'AUTO_HIDE' ? '' : 'noautohide'}>
                  <div class="${domClasses.safeZoneWrapper}"></div>
                  <div class="${domClasses.watermarkWrapper}">
                    <div class="${domClasses.watermark}"></div>
                  </div>
                  ${
                    this._config.playerChroming.theme === 'DEFAULT'
                      ? `<div class="${domClasses.help} d-none">
                            ${
                              this._config.playerChroming.themeConfig?.floatingControls?.includes('TRACKSELECTOR')
                                ? `<omakase-dropdown-toggle id="audio-dropdown-toggle-${this._config.playerHTMLElementId}" dropdown="audio-dropdown-${this._config.playerHTMLElementId}" class="${domClasses.audioTextToggle} d-none">
                                    <media-chrome-button class="${domClasses.mediaChromeButton} omakase-player-audio-text">
                                      <span class="${domClasses.mediaChromeAudioText}"></span>
                                    </media-chrome-button>
                                  </omakase-dropdown-toggle>`
                                : ''
                            }
                            ${
                              this._config.playerChroming.themeConfig?.floatingControls?.includes('HELP_MENU')
                                ? `<div class="omakase-help-dropdown">
                                    <button class="omakase-help-button d-none"></button>
                                    <div class="${domClasses.helpMenu} d-none">
                                    </div>
                                  </div>`
                                : ''
                            }

                        </div>
                        ${
                          this._config.playerChroming.themeConfig?.floatingControls?.includes('PLAYBACK_CONTROLS')
                            ? `<div class="omakase-overlay-buttons">
                                  <div class="${domClasses.buttonOverlayAttach} omakase-video-overlay-button"></div>
                                  <div class="${domClasses.buttonOverlayPlay} omakase-video-overlay-button d-none"></div>
                                  <div class="${domClasses.buttonOverlayPause} omakase-video-overlay-button d-none"></div>
                                  <div class="${domClasses.buttonOverlayReplay} omakase-video-overlay-button d-none"></div>
                                  <div class="${domClasses.buttonOverlayLoading} omakase-video-overlay-button d-none"></div>
                                  <div class="${domClasses.buttonOverlayError} omakase-video-overlay-button d-none"></div>
                              </div>`
                            : ''
                        }`
                      : ''
                  }
              </div>
              ${this.getMediaChromeTemplate()}
          </media-controller>
          <div class="${domClasses.detachedBackground} d-none">
          </div>
          <div class="${domClasses.backgroundImage} d-none"></div>

          <div class="${domClasses.sectionBottomRight} d-none">
              <button class="${domClasses.buttonAttach}"></button>
              <button class="${domClasses.buttonFullscreen}"></button>
          </div>

          <div class="${domClasses.alerts}">
          </div>

          <div class="${domClasses.errorMessage} d-none">
          </div>
      </div>`;

    this._videoElement = this.getPlayerElement<HTMLVideoElement>(domClasses.video);
    this._videoElement.controls = false;
    this._videoElement.crossOrigin = this._config.crossorigin;
    if (this._config.disablePictureInPicture) {
      this._videoElement.disablePictureInPicture = true;
    }

    this._divPlayerWrapper = this.getPlayerElement<HTMLElement>(domClasses.playerWrapper);
    this._divButtonOverlayPlay = this.getPlayerElement<HTMLElement>(domClasses.buttonOverlayPlay);
    this._divButtonOverlayPause = this.getPlayerElement<HTMLElement>(domClasses.buttonOverlayPause);
    this._divButtonOverlayLoading = this.getPlayerElement<HTMLElement>(domClasses.buttonOverlayLoading);
    this._divButtonOverlayError = this.getPlayerElement<HTMLElement>(domClasses.buttonOverlayError);
    this._divButtonOverlayReplay = this.getPlayerElement<HTMLElement>(domClasses.buttonOverlayReplay);
    this._divButtonHelp = this.getPlayerElement<HTMLElement>(domClasses.buttonOverlayHelp);
    this._divButtonOverlayAttach = this.getPlayerElement<HTMLElement>(domClasses.buttonOverlayAttach);
    this._divHelp = this.getPlayerElement<HTMLElement>(domClasses.help);
    this._divHelpMenu = this.getPlayerElement<HTMLElement>(domClasses.helpMenu);

    this._audioTextToggle = this.getPlayerElement<OmakaseDropdownToggle>(domClasses.audioTextToggle);

    this._divSectionBottomRight = this.getPlayerElement<HTMLElement>(domClasses.sectionBottomRight);
    this._divButtonAttach = this.getPlayerElement<HTMLElement>(domClasses.buttonAttach);
    this._divButtonFullscreen = this.getPlayerElement<HTMLElement>(domClasses.buttonFullscreen);

    this._divErrorMessage = this.getPlayerElement<HTMLElement>(domClasses.errorMessage);
    this._divSafeZoneWrapper = this.getPlayerElement<HTMLElement>(domClasses.safeZoneWrapper);
    this._divAlerts = this.getPlayerElement<HTMLElement>(domClasses.alerts);
    this._divBackgroundImage = this.getPlayerElement<HTMLElement>(domClasses.backgroundImage);
    this._divDetachedBackground = this.getPlayerElement<HTMLElement>(domClasses.detachedBackground);
    this._divWatermarkWrapper = this.getPlayerElement<HTMLElement>(domClasses.watermarkWrapper);
    this._divWatermark = this.getPlayerElement<HTMLElement>(domClasses.watermark);

    this._mediaControllerElement = this._divPlayer.getElementsByTagName('media-controller')[0] as MediaController;
    this._buttonFastRewind = this.getPlayerElement<MediaChromeButton>(domClasses.mediaFastRewindButton);
    this._buttonRewind = this.getPlayerElement<MediaChromeButton>(domClasses.mediaRewindButton);
    this._buttonForward = this.getPlayerElement<MediaChromeButton>(domClasses.mediaForwardButton);
    this._buttonFastForward = this.getPlayerElement<MediaChromeButton>(domClasses.mediaFastForwardButton);
    this._buttonDetach = this.getPlayerElement<MediaChromeButton>(domClasses.mediaChromeDetach);
    this._buttonAttach = this.getPlayerElement<MediaChromeButton>(domClasses.mediaChromeAttach);
    this._buttonBitc = this.getPlayerElement<MediaChromeButton>(domClasses.mediaChromeBitcDisabled);
    this._tooltipBitc = this.getPlayerElement<MediaTooltip>(domClasses.mediaChromeBitcTooltip);
    this._timeRangeControl = this._divPlayer.getElementsByTagName('omakase-time-range')[0] as OmakaseTimeRange;
    this._volumeRangeControl = this._divPlayer.getElementsByTagName('omakase-volume-range')[0] as OmakaseVolumeRange;
    this._muteButton = this._divPlayer.getElementsByTagName('omakase-mute-button')[0] as OmakaseMuteButton;
    this._markerBar = this._divPlayer.getElementsByTagName('omakase-marker-bar')[0] as OmakaseMarkerBar;
    this._textButton = this.getPlayerElement<MediaChromeButton>(domClasses.mediaChromeTextOn);
    this._divTimecode = this.getPlayerElement<HTMLElement>(domClasses.timecodeContainer);
    this._currentTimecode = this._divPlayer.getElementsByTagName('omakase-time-display')[0] as OmakaseTimeDisplay;
    this._previewTimecode = this.getPlayerElement<OmakaseTimeDisplay>(domClasses.mediaChromePreviewTimecode);
    this._previewThumbnail = this.getPlayerElement<OmakasePreviewThumbnail>(domClasses.mediaChromePreviewThumbnail);
    this._speedDropdown = DomUtil.getElementById(`speed-dropdown-${this._config.playerHTMLElementId}`);
    this._audioDropdown = DomUtil.getElementById(`audio-dropdown-${this._config.playerHTMLElementId}`);
    this._audioDropdownToggle = DomUtil.getElementById(`audio-dropdown-toggle-${this._config.playerHTMLElementId}`);
    this._speedDropdownList = DomUtil.getElementById(`speed-dropdown-list-${this._config.playerHTMLElementId}`);
    this._audioDropdownList = DomUtil.getElementById(`audio-dropdown-list-${this._config.playerHTMLElementId}`);
    this._textDropdownList = DomUtil.getElementById(`text-dropdown-list-${this._config.playerHTMLElementId}`);
    this._sidecarDropdownList = DomUtil.getElementById(`sidecar-dropdown-list-${this._config.playerHTMLElementId}`);

    if (this._config.playerChroming.watermark) {
      this.setWatermark(this._config.playerChroming.watermark);
    }
  }

  private getMediaChromeTemplate() {
    if (this._config.playerChroming.theme === 'CUSTOM') {
      if (!this._config.playerChroming.themeConfig?.htmlTemplateId) {
        throw new Error('Must provide template HTMLElementId for custom player chroming theme');
      }
      const mediaChromeTemplate = DomUtil.getElementById<HTMLTemplateElement>(this._config.playerChroming.themeConfig.htmlTemplateId);
      if (!mediaChromeTemplate) {
        throw new Error(`DOM <template> for media chrome template not found. ID provided: ${this._config.playerChroming.themeConfig.htmlTemplateId}`);
      }
      return mediaChromeTemplate.innerHTML;
    } else if (this._config.playerChroming.theme === 'DEFAULT') {
      const defaultMediaChromeTemplate = `<div style="display:none" class="${domClasses.timecodeContainer} d-none" slot="middle-chrome" noautohide>
          <omakase-time-display format="timecode" class="${domClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
      </div>
      <media-control-bar style="display:none" class="upper-control-bar">
          <omakase-marker-bar></omakase-marker-bar>
          ${
            this._config.playerChroming.themeConfig?.controlBar?.includes('SCRUBBER')
              ? `<omakase-time-range>
            <div slot="preview" class="${domClasses.mediaChromePreviewWrapper}">
              <omakase-preview-thumbnail class="${domClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
              <omakase-time-display format="timecode" class="${domClasses.mediaChromePreviewTimecode}"></omakase-time-display>
            </div>
          </omakase-time-range>`
              : ''
          }
          ${
            this._config.playerChroming.themeConfig?.controlBar?.includes('PLAYBACK_RATE') && this._config.playerChroming.themeConfig.playbackRates
              ? `<omakase-dropdown id="speed-dropdown-${this._config.playerHTMLElementId}" align="center">
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
          ${this._config.playerChroming.themeConfig?.controlBar?.includes('TRACKSELECTOR') ? this.getAudioTextDropdown('bottom') : ''}
      </media-control-bar>
      <media-control-bar style="display:none" class="lower-control-bar">
          <div class="start-container">
          ${
            this._config.playerChroming.themeConfig?.controlBar?.includes('VOLUME')
              ? `<div class="volume-container">
                  <omakase-mute-button class="${domClasses.mediaChromeButton} omakase-player-mute">
                    <span slot="high" class="${domClasses.mediaChromeAudioHigh}"></span>
                    <span slot="medium" class="${domClasses.mediaChromeAudioMedium}"></span>
                    <span slot="low" class="${domClasses.mediaChromeAudioLow}"></span>
                    <span slot="off" class="${domClasses.mediaChromeAudioMute}"></span>
                  </omakase-mute-button>
                  <omakase-volume-range></omakase-volume-range>
                </div>`
              : ''
          }
          ${
            this._config.playerChroming.themeConfig?.controlBar?.includes('CAPTIONS')
              ? `<media-chrome-button class="${domClasses.mediaChromeButton} omakase-player-text-toggle">
                  <span class="${domClasses.mediaChromeTextOn} disabled"></span>
                </media-chrome-button>`
              : ''
          }
          ${this._config.playerChroming.themeConfig?.controlBar?.includes('PLAYBACK_RATE') ? `<omakase-dropdown-toggle dropdown="speed-dropdown-${this._config.playerHTMLElementId}"></omakase-dropdown-toggle>` : ''} 
          </div>
          <div class="center-container">
              ${
                this._config.playerChroming.themeConfig?.controlBar?.includes('TEN_FRAMES_BACKWARD')
                  ? `<media-chrome-button class="${domClasses.mediaChromeButton} omakase-player-fast-rewind">
                      <span class="${domClasses.mediaFastRewindButton}"></span>
                      <media-tooltip>Rewind by 10 frames</media-tooltip>
                    </media-chrome-button>`
                  : ''
              }
              ${
                this._config.playerChroming.themeConfig?.controlBar?.includes('FRAME_BACKWARD')
                  ? `<media-chrome-button class="${domClasses.mediaChromeButton} omakase-player-rewind">
                      <span class="${domClasses.mediaRewindButton}"></span>
                      <media-tooltip>Rewind to previous frame</media-tooltip>
                    </media-chrome-button>`
                  : ''
              }
              ${
                this._config.playerChroming.themeConfig?.controlBar?.includes('PLAY')
                  ? `<media-play-button class="${domClasses.mediaChromeButton} omakase-player-play">
                      <span slot="play" class="${domClasses.mediaChromePlay}"></span>
                      <span slot="pause" class="${domClasses.mediaChromePause}"></span>
                    </media-play-button>`
                  : ''
              }
              ${
                this._config.playerChroming.themeConfig?.controlBar?.includes('FRAME_FORWARD')
                  ? `<media-chrome-button class="${domClasses.mediaChromeButton} omakase-player-forward">
                      <span class="${domClasses.mediaForwardButton}"></span>
                      <media-tooltip>Fast forward to next frame</media-tooltip>
                    </media-chrome-button>`
                  : ''
              }
              ${
                this._config.playerChroming.themeConfig?.controlBar?.includes('TEN_FRAMES_FORWARD')
                  ? `<media-chrome-button class="${domClasses.mediaChromeButton} omakase-player-fast-forward">
                      <span class="${domClasses.mediaFastForwardButton}"></span>
                      <media-tooltip>Fast forward by 10 frames</media-tooltip>
                    </media-chrome-button>`
                  : ''
              }
          </div>
          <div class="end-container">
              ${
                this._config.playerChroming.themeConfig?.controlBar?.includes('TRACKSELECTOR')
                  ? `<omakase-dropdown-toggle id="audio-dropdown-toggle-${this._config.playerHTMLElementId}" dropdown="audio-dropdown-${this._config.playerHTMLElementId}">
                      <media-chrome-button class="${domClasses.mediaChromeButton} omakase-player-audio-text">
                        <span class="${domClasses.mediaChromeAudioText}"></span>
                      </media-chrome-button>
                    </omakase-dropdown-toggle>`
                  : ''
              }
              ${
                this._config.playerChroming.themeConfig?.controlBar?.includes('BITC')
                  ? `<media-chrome-button class="${domClasses.mediaChromeButton} omakase-player-bitc">
                      <span class="${domClasses.mediaChromeBitcDisabled}"></span>
                      <media-tooltip class="${domClasses.mediaChromeBitcTooltip}">Show timecode</media-tooltip>
                    </media-chrome-button>`
                  : ''
              }
              ${
                this._config.playerChroming.themeConfig?.controlBar?.includes('DETACH')
                  ? `<media-chrome-button class="${domClasses.mediaChromeButton} omakase-player-attach-detach">
                      <span class="${this._config.detachedPlayer ? domClasses.mediaChromeAttach : domClasses.mediaChromeDetach}"></span>
                      <media-tooltip>${this._config.detachedPlayer ? 'Attach player' : 'Detach player'}</media-tooltip>
                    </media-chrome-button>`
                  : ''
              }
              ${
                this._config.playerChroming.themeConfig?.controlBar?.includes('FULLSCREEN')
                  ? `<media-fullscreen-button class="${domClasses.mediaChromeButton} omakase-player-fullscreen">
                      <span slot="enter" class="${domClasses.mediaChromeFullscreenEnter}"></span>
                      <span slot="exit" class="${domClasses.mediaChromeFullscreenExit}"></span>
                    </media-fullscreen-button>`
                  : ''
              }
          </div>
      </media-control-bar>`;
      return defaultMediaChromeTemplate;
    } else if (this._config.playerChroming.theme === 'STAMP') {
      return `${
        this._config.playerChroming.themeConfig?.floatingControls?.includes('AUDIO_TOGGLE')
          ? `<div slot="top-chrome" ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes('AUDIO_TOGGLE') ? 'noautohide' : ''}>
              <omakase-mute-button></omakase-mute-button>
            </div>`
          : ''
      }
      ${
        this._config.playerChroming.themeConfig?.floatingControls?.includes('PLAYBACK_CONTROLS')
          ? `<div slot="centered-chrome" ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes('PLAYBACK_CONTROLS') ? 'noautohide' : ''}>
              <div class="omakase-overlay-buttons">
                  <div class="${domClasses.buttonOverlayAttach} omakase-video-overlay-button"></div>
                  <div class="${domClasses.buttonOverlayPlay} omakase-video-overlay-button d-none"></div>
                  <div class="${domClasses.buttonOverlayPause} omakase-video-overlay-button d-none"></div>
                  <div class="${domClasses.buttonOverlayReplay} omakase-video-overlay-button d-none"></div>
              </div>
            </div>
            <div slot="centered-chrome" noautohide>
              <div class="omakase-overlay-buttons">
                  <div class="${domClasses.buttonOverlayLoading} omakase-video-overlay-button d-none"></div>
                  <div class="${domClasses.buttonOverlayError} omakase-video-overlay-button d-none"></div>
              </div>
            </div>`
          : ''
      }
      ${
        this._config.playerChroming.themeConfig?.floatingControls?.includes('TIME')
          ? `<div slot="centered-chrome" ${
              this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes('TIME') ? 'noautohide' : ''
            } class="omakase-timecode-wrapper omakase-timecode-format-${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'} omakase-timecode-${
              this._config.playerChroming.themeConfig?.floatingControls?.includes('PROGRESS_BAR') ? 'with' : 'without'
            }-progress-bar">
              <omakase-time-display showduration="true" format="${this._config.playerChroming.themeConfig?.timeFormat === 'TIMECODE' ? 'timecode' : 'standard'}" ${this._config.playerChroming.themeConfig.timeFormat === 'COUNTDOWN_TIMER' ? 'countdown="true"' : ''}></omakase-time-display>
            </div>`
          : ''
      }
      <media-control-bar ${this._config.playerChroming.themeConfig?.alwaysOnFloatingControls?.includes('PROGRESS_BAR') ? 'noautohide' : ''}>
      ${
        this._config.playerChroming.themeConfig?.floatingControls?.includes('PROGRESS_BAR')
          ? `<omakase-time-range>
              <div slot="preview"></div>
            </omakase-time-range>`
          : ''
      }
      </media-control-bar>`;
    } else {
      return '';
    }
  }

  private getVisibilityClass() {
    if (this._config.playerChroming.theme !== 'DEFAULT') {
      return 'enabled';
    }
    switch (this._config.playerChroming.themeConfig?.controlBarVisibility) {
      case 'DISABLED':
        return 'disabled';
      case 'ENABLED':
        return 'enabled';
      case 'FULLSCREEN_ONLY':
        return 'fullscreen-only';
      default:
        return 'disabled';
    }
  }

  private getAudioTextDropdown(placement: 'top' | 'bottom') {
    return `<omakase-dropdown ${this._config.playerChroming.theme === 'DEFAULT' && this._config.playerChroming.themeConfig?.trackSelectorAutoClose === false ? 'floating="true"' : ''} id="audio-dropdown-${this._config.playerHTMLElementId}" style="display:none;${placement === 'top' ? 'right:20px' : ''}">
                <omakase-dropdown-list id="audio-dropdown-list-${this._config.playerHTMLElementId}" class="align-left" title="AUDIO" width="125" type="radio"></omakase-dropdown-list>
                <omakase-dropdown-list id="sidecar-dropdown-list-${this._config.playerHTMLElementId}" multiselect="true" class="d-none align-left" title="SIDECAR AUDIO" width="125" type="checkbox"></omakase-dropdown-list>
                <omakase-dropdown-list id="text-dropdown-list-${this._config.playerHTMLElementId}" class="d-none align-left" title="TEXT" width="125" type="radio"></omakase-dropdown-list>
            </omakase-dropdown>`;
  }

  private alignAudioTextDropdown(alignment: 'left' | 'right') {
    if (alignment === 'right') {
      this._audioDropdown!.style.removeProperty('left');
      this._audioDropdown!.style.right = '20px';
    } else {
      this._audioDropdown!.style.removeProperty('right');
      this._audioDropdown!.style.left = this._audioDropdownToggle!.offsetLeft + 'px';
    }
  }

  private getPlayerElement<T>(className: string): T {
    return this.getPlayerElements<T>(className)[0];
  }

  private getPlayerElements<T>(className: string): T[] {
    return Array.from(DomUtil.getElementById<HTMLElement>(this._divPlayer.id).querySelectorAll(`.${className}`)) as T[];
  }

  private showElements(...element: Array<HTMLElement | undefined>): VideoDomController {
    element.forEach((element) => {
      if (!element) {
        return;
      }
      if (element.classList.contains('d-none')) {
        element.classList.remove('d-none');
      }
      if (!element.classList.contains('d-block')) {
        element.classList.add('d-block');
      }
    });
    return this;
  }

  private isShown(element: HTMLElement) {
    return element.classList.contains('d-block');
  }

  private hideElements(...element: Array<HTMLElement | undefined>): VideoDomController {
    element.forEach((element) => {
      if (!element) {
        return;
      }
      if (element.classList.contains('d-block')) {
        element.classList.remove('d-block');
      }
      if (!element.classList.contains('d-none')) {
        element.classList.add('d-none');
      }
    });
    return this;
  }

  private onHelpMenuChangeHandler(event: VideoHelpMenuChangeEvent) {
    let helpMenuGroups = event.helpMenuGroups;
    if (helpMenuGroups.length > 0) {
      this.showElements(this._divHelp);
      this._divHelpMenu!.innerHTML = helpMenuGroups
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
    } else {
      this._divHelpMenu!.innerHTML = ``;
      this.hideElements(this._divHelp);
    }
  }

  isFullscreen(): boolean {
    if (Fullscreen.isFullscreenEnabled()) {
      return Fullscreen.isFullscreen();
    }
    return false;
  }

  toggleFullscreen(): Observable<void> {
    return passiveObservable((observer) => {
      try {
        if (Fullscreen.isFullscreenEnabled()) {
          if (this.isFullscreen()) {
            Fullscreen.exitFullscreen()
              .then(() => {
                nextCompleteObserver(observer);
              })
              .catch((error) => {
                console.error(error);
                errorCompleteObserver(observer, error);
              });
          } else {
            Fullscreen.requestFullscreen(
              this._config.playerChroming.theme === 'DEFAULT' && this._config.playerChroming.themeConfig?.controlBarVisibility === 'DISABLED' ? this._videoElement : this._mediaControllerElement
            )
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

  clearSafeZones(): Observable<void> {
    return passiveObservable((observer) => {
      this._divSafeZoneWrapper.innerHTML = '';
      this._videoSafeZones = [];
      this.onVideoSafeZoneChange$.next({
        videoSafeZones: this.getSafeZones(),
      });
      nextCompleteObserver(observer);
    });
  }

  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone> {
    return passiveObservable<VideoSafeZone>((observer) => {
      if (isNullOrUndefined(videoSafeZone.id)) {
        videoSafeZone.id = CryptoUtil.uuid();
      } else if (this._videoSafeZones.find((p) => p.id === videoSafeZone.id)) {
        throw new Error(`Safe zone with id ${videoSafeZone.id} already exists`);
      }

      if (isNullOrUndefined(videoSafeZone.htmlId)) {
        videoSafeZone.htmlId = `omakase-video-safe-zone-${this._videoSafeZones.length + 1}`;
      }

      if (videoSafeZone.topRightBottomLeftPercent && videoSafeZone.topRightBottomLeftPercent.length > 0) {
        // nop
      } else if (!StringUtil.isNullUndefinedOrWhitespace(videoSafeZone.aspectRatio)) {
        let ratioSplitted = videoSafeZone.aspectRatio!.split('/');
        let aspectRatio = z.coerce.number().parse(ratioSplitted[0]) / z.coerce.number().parse(ratioSplitted[1]);

        let width = this._divSafeZoneWrapper.clientWidth;
        let height = this._divSafeZoneWrapper.clientHeight;

        videoSafeZone.scalePercent = videoSafeZone.scalePercent ? videoSafeZone.scalePercent : 100;
        let safeZoneWidth: number;
        let safeZoneHeight: number;

        if (aspectRatio >= 1) {
          safeZoneWidth = width * (videoSafeZone.scalePercent / 100);
          safeZoneHeight = (height / aspectRatio) * (videoSafeZone.scalePercent / 100);
        } else {
          safeZoneWidth = height * aspectRatio * (videoSafeZone.scalePercent / 100);
          safeZoneHeight = height * (videoSafeZone.scalePercent / 100);
        }

        let yPercent = ((height - safeZoneHeight) / 2 / height) * 100;
        let xPercent = ((width - safeZoneWidth) / 2 / width) * 100;

        videoSafeZone.topRightBottomLeftPercent = [yPercent, xPercent, yPercent, xPercent];
      } else {
        throw new Error(`topRightBottomLeftPercent or aspectRatio must be provided`);
      }

      let topRightBottomLeftPercent: number[] = [
        videoSafeZone.topRightBottomLeftPercent[0] ? videoSafeZone.topRightBottomLeftPercent[0] : 0,
        videoSafeZone.topRightBottomLeftPercent[1] ? videoSafeZone.topRightBottomLeftPercent[1] : 0,
        videoSafeZone.topRightBottomLeftPercent[2] ? videoSafeZone.topRightBottomLeftPercent[2] : 0,
        videoSafeZone.topRightBottomLeftPercent[3] ? videoSafeZone.topRightBottomLeftPercent[3] : 0,
      ];

      let htmlElement: HTMLElement = DomUtil.createElement<'div'>('div');
      htmlElement.id = videoSafeZone.htmlId!;
      htmlElement.className = `${domClasses.safeZone}${videoSafeZone.htmlClass ? ` ${videoSafeZone.htmlClass}` : ``}`;
      htmlElement.style.top = `${topRightBottomLeftPercent[0]}%`;
      htmlElement.style.right = `${topRightBottomLeftPercent[1]}%`;
      htmlElement.style.bottom = `${topRightBottomLeftPercent[2]}%`;
      htmlElement.style.left = `${topRightBottomLeftPercent[3]}%`;

      this._divSafeZoneWrapper.append(htmlElement);

      this._videoSafeZones.push(videoSafeZone);

      this.onVideoSafeZoneChange$.next({
        videoSafeZones: this.getSafeZones(),
      });

      observer.next(videoSafeZone);
      observer.complete();
    });
  }

  removeSafeZone(id: string): Observable<void> {
    return passiveObservable((observer) => {
      let videoSafeZone = this._videoSafeZones.find((p) => p.id === id);
      if (videoSafeZone) {
        let element = DomUtil.getElementById<HTMLElement>(videoSafeZone.htmlId!);
        if (element) {
          element.remove();
        }
        this._videoSafeZones.splice(
          this._videoSafeZones.findIndex((p) => p.id === id),
          1
        );
        this.onVideoSafeZoneChange$.next({
          videoSafeZones: this.getSafeZones(),
        });
      }
      nextCompleteObserver(observer);
    });
  }

  getSafeZones(): VideoSafeZone[] {
    return this._videoSafeZones;
  }

  setSafeZoneAspectRatio(aspectRatio: string): void {
    if (this._config.playerChroming.theme !== 'STAMP') {
      this._divSafeZoneWrapper.style.aspectRatio = aspectRatio;
      this._divWatermarkWrapper.style.aspectRatio = aspectRatio;
      this._divPlayerWrapper.style.aspectRatio = aspectRatio;
    }
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
          nextCompleteObserver(observer);
        }
      });
    });
  }

  setWatermark(watermark: string) {
    if (SvgUtil.isValidSVG(watermark)) {
      this._divWatermark.innerHTML = watermark;
    } else {
      this._divWatermark.innerText = watermark;
    }
  }

  isPiPSupported(): boolean {
    return !BrowserProvider.instance().isFirefox && !this._videoElement.disablePictureInPicture;
  }

  attachVideoController(videoController: VideoControllerApi) {
    // clean previous subscribers and listeners
    nextCompleteSubject(this._videoEventBreaker$);
    this._videoEventBreaker$ = new Subject<void>();

    this._videoController = videoController;

    let allOverlayButtons = [
      this._divButtonOverlayPlay,
      this._divButtonOverlayPause,
      this._divButtonOverlayLoading,
      this._divButtonOverlayReplay,
      this._divButtonOverlayError,
      this._divButtonOverlayAttach,
    ];

    let clearShowTemporaryOnMouseMoveTimeoutId = () => {
      if (this._showTemporaryOnMouseMoveTimeoutId) {
        clearTimeout(this._showTemporaryOnMouseMoveTimeoutId);
      }
    };

    if (this._config.detachedPlayer) {
      race(fromEvent(window, 'unload'), fromEvent(window, 'beforeunload'))
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            this._videoController.attachVideoWindow().subscribe({
              next: () => {
                console.debug('Attached before closing, closing..');
              },
            });
          },
        });
    }

    if (!videoController.isDetachable() && this._buttonDetach) {
      if (this._videoController.isPiPSupported()) {
        this._videoController.getHTMLVideoElement().addEventListener(HTMLVideoElementEvents.ENTERPIP, this._enterPictureInPictureHandler);
        this._videoController.getHTMLVideoElement().addEventListener(HTMLVideoElementEvents.LEAVEPIP, this._leavePictureInPictureHandler);
      } else {
        this.hideElements(this._buttonDetach);
      }
    }

    if (this._currentTimecode) {
      this._currentTimecode.video = this._videoController;
    }

    if (this._previewTimecode) {
      this._previewTimecode.video = this._videoController;
      this._previewTimecode.timeRange = this._timeRangeControl!;
    }

    if (this._previewThumbnail) {
      this._previewThumbnail.timeRange = this._timeRangeControl!;
      this._previewThumbnail.thumbnailFn = this._config.playerChroming.thumbnailSelectionFn;
    }

    fromEvent<MouseEvent>(this._divPlayerWrapper, 'mousemove')
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .pipe(filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached'))
      .subscribe({
        next: (event) => {
          if (
            this._videoController.isVideoLoaded() &&
            !(this._videoController.getPlaybackState()!.ended || this._videoController.getPlaybackState()!.waiting || this._videoController.getPlaybackState()!.seeking)
          ) {
            clearShowTemporaryOnMouseMoveTimeoutId();
            if (this._config.playerClickHandler) {
              this.hideElements(this._divButtonOverlayPause, this._divButtonOverlayPlay).showElements(this._divButtonHelp);
              if (this._audioTextToggle) {
                this.showElements(this._audioTextToggle);
              }
            } else {
              let playControlToShow = this._videoController.isPlaying() ? this._divButtonOverlayPause : this._divButtonOverlayPlay;
              this.hideElements(this._divButtonOverlayPause, this._divButtonOverlayPlay).showElements(playControlToShow, this._divButtonHelp);
              if (this._audioTextToggle) {
                this.showElements(this._audioTextToggle);
              }

              if (this._config.playerChroming.theme !== 'STAMP') {
                this._showTemporaryOnMouseMoveTimeoutId = setTimeout(() => {
                  this.hideElements(playControlToShow).hideElements(this._divSectionBottomRight);

                  if (this._divHelpMenu && !this.isShown(this._divHelpMenu)) {
                    this.hideElements(this._divButtonHelp, this._divHelpMenu);
                    if (this._audioTextToggle) {
                      this.hideElements(this._audioTextToggle);
                    }
                  }
                }, 1000);
              }
            }

            if (this._config.detachedPlayer) {
              this.showElements(this._divSectionBottomRight);
            }
          }
        },
      });

    fromEvent<MouseEvent>(this._divPlayerWrapper, 'mouseleave')
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          if (this._config.playerChroming.theme !== 'STAMP') {
            this.hideElements(this._divButtonOverlayPlay, this._divButtonOverlayPause).hideElements(this._divButtonHelp, this._divHelpMenu).hideElements(this._divSectionBottomRight);
          }
          if (this._audioTextToggle) {
            this.hideElements(this._audioTextToggle);
          }
        },
      });

    fromEvent<MouseEvent>(this._divPlayerWrapper, 'click')
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          if (this._videoController.isVideoLoaded()) {
            if (
              ![this._divButtonHelp, this._divButtonOverlayError, this._divErrorMessage, this._divButtonAttach, this._divButtonFullscreen].find((p) => p === event.target) &&
              !this._divAlerts.contains(event.target as HTMLElement)
            ) {
              if (this._videoController.getVideoWindowPlaybackState() !== 'detached') {
                if (['VIDEO', 'DIV'].includes((event.target as HTMLElement).tagName)) {
                  if (this._config.playerClickHandler) {
                    this._config.playerClickHandler();
                  } else {
                    this._videoController.togglePlayPause();
                  }
                }
              } else {
                this._videoController.attachVideoWindow();
              }
            }
          }
        },
      });

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
    if (this._buttonDetach) {
      fromEvent<MouseEvent>(this._buttonDetach, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            if (this._videoController.isDetachable()) {
              if (this._videoController.canDetach()) {
                this._videoController.detachVideoWindow();
              }
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
            this._buttonBitc!.classList.remove(this._bitcEnabled ? domClasses.mediaChromeBitcDisabled : domClasses.mediaChromeBitcEnabled);
            this._buttonBitc!.classList.add(this._bitcEnabled ? domClasses.mediaChromeBitcEnabled : domClasses.mediaChromeBitcDisabled);
            this._tooltipBitc!.innerHTML = this._bitcEnabled ? 'Hide timecode' : 'Show timecode';
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

    if (this._volumeRangeControl) {
      this._volumeRangeControl.videoController = this._videoController;
    }

    if (this._muteButton) {
      this._muteButton.videoController = this._videoController;
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
          this._textButton!.classList.remove('disabled', domClasses.mediaChromeTextOff);
          this._textButton!.classList.add(domClasses.mediaChromeTextOn);
        },
      });
      this._videoController.onSubtitlesHide$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
        next: () => {
          this._textButton!.classList.remove(domClasses.mediaChromeTextOn);
          this._textButton!.classList.add(domClasses.mediaChromeTextOff);
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

                if (this._audioDropdown && this._textDropdownList && !this.isShown(this._textDropdownList)) {
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

    if (this._textDropdownList) {
      merge(this._videoController.onSubtitlesLoaded$, this._videoController.onSubtitlesCreate$, this._videoController.onSubtitlesRemove$)
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            const textOptions = this._videoController.getSubtitlesTracks().map((track) => ({
              value: track.id,
              label: track.label,
            }));
            this._textDropdownList!.setOptions(textOptions);
            if (textOptions.length) {
              this.showElements(this._textDropdownList!);
              this.alignAudioTextDropdown('right');
            } else {
              this.hideElements(this._textDropdownList!);
              if (this._audioDropdown && this._sidecarDropdownList && !this.isShown(this._sidecarDropdownList)) {
                this.alignAudioTextDropdown('left');
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
              this._videoController.showSubtitlesTrack(textOption.value);
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
      this._videoController.onSubtitlesHide$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe(() => {
        this._textDropdownList?.selectedOption$.next(undefined);
      });
    }

    // prevents video context menu
    fromEvent<MouseEvent>(this._videoElement, 'contextmenu')
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          event.preventDefault();
        },
      });

    this._videoController.onVideoLoading$
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .pipe(filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached'))
      .subscribe({
        next: (event) => {
          this.hideElements(...allOverlayButtons)
            .hideElements(this._divErrorMessage)
            .showElements(this._divButtonOverlayLoading)
            .showElements(this._divBackgroundImage);
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
          }
          if (this._config.playerChroming.theme === 'STAMP') {
            this._videoController.setAudioOutputMuted(true);
          }
        },
      });

    this._videoController.onVideoLoaded$
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .pipe(filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached'))
      .subscribe({
        next: (videoLoaded) => {
          this.hideElements(...allOverlayButtons)
            .hideElements(this._divErrorMessage)
            .hideElements(this._divBackgroundImage);
          if (!videoLoaded) {
            this.showElements(this._divButtonOverlayLoading).showElements(this._divBackgroundImage);
          }
          if (this._config.playerChroming.theme === 'STAMP' && this._videoController.isPaused()) {
            this.showElements(this._divButtonOverlayPlay);
          }

          if (this._config.playerChroming.thumbnailUrl) {
            this.loadThumbnailVtt(this._config.playerChroming.thumbnailUrl);
          }
        },
      });

    this._videoController.onPlaybackState$
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .pipe(filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached'))
      .subscribe({
        next: (state) => {
          clearShowTemporaryOnMouseMoveTimeoutId();

          if (state.waitingSyncedMedia) {
            this.hideElements(...allOverlayButtons)
              .hideElements(this._divErrorMessage)
              .showElements(this._divButtonOverlayLoading);
          } else {
            if (state.waiting && state.playing) {
              this.hideElements(...allOverlayButtons)
                .hideElements(this._divErrorMessage)
                .showElements(this._divButtonOverlayLoading);
            } else if (state.playing) {
              this.hideElements(...allOverlayButtons).hideElements(this._divErrorMessage);
              if (state.seeking && state.waiting) {
                this.showElements(this._divButtonOverlayLoading);
              }
            } else if (state.paused) {
              this.hideElements(...allOverlayButtons).hideElements(this._divErrorMessage);
              if (state.seeking && state.waiting) {
                this.showElements(this._divButtonOverlayLoading);
              } else if (state.ended && !this._config.playerClickHandler) {
                this.showElements(this._divButtonOverlayReplay);
              } else if (this._config.playerChroming.theme === 'STAMP') {
                this.showElements(this._divButtonOverlayPlay);
              }
            } else if (state.seeking && state.waiting) {
              this.hideElements(...allOverlayButtons)
                .hideElements(this._divErrorMessage)
                .showElements(this._divButtonOverlayLoading);
            }
          }
        },
      });

    this._videoController.onVideoError$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        this.hideElements(...allOverlayButtons)
          .hideElements(this._divBackgroundImage)
          .showElements(this._divErrorMessage, this._divButtonOverlayError);
        this._divErrorMessage.innerHTML = event.message ? event.message : '';
      },
    });

    // help menu
    if (this._divButtonHelp) {
      fromEvent<MouseEvent>(this._divButtonHelp, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            if (event.target === this._divButtonHelp) {
              if (this.isShown(this._divHelpMenu!)) {
                this.hideElements(this._divHelpMenu);
              } else {
                this.showElements(this._divHelpMenu);
              }
            }
          },
        });
    }

    fromEvent<MouseEvent>(this._divButtonAttach, 'click')
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this._videoController.attachVideoWindow();
        },
      });

    fromEvent<MouseEvent>(this._divButtonFullscreen, 'click')
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this._videoController.toggleFullscreen();
        },
      });

    this._videoController.onHelpMenuChange$
      .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
      .pipe(filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached'))
      .subscribe({
        next: (event) => {
          this.onHelpMenuChangeHandler(event);
        },
      });

    this._videoController.onVideoWindowPlaybackStateChange$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        if (this._videoController.getVideoWindowPlaybackState() === 'detached') {
          this.hideElements(...allOverlayButtons)
            .hideElements(this._divBackgroundImage)
            .hideElements(this._divSafeZoneWrapper)
            .showElements(this._divDetachedBackground)
            .showElements(this._divButtonOverlayAttach);

          this._divPlayer.classList.add(domClasses.playerDetached);
        } else if (this._videoController.getVideoWindowPlaybackState() === 'detaching' || this._videoController.getVideoWindowPlaybackState() === 'attaching') {
          this.hideElements(...allOverlayButtons)
            .hideElements(this._divBackgroundImage)
            .showElements(this._divBackgroundImage)
            .showElements(this._divSafeZoneWrapper)
            .showElements(this._divButtonOverlayLoading);
        } else if (this._videoController.getVideoWindowPlaybackState() === 'attached') {
          this.hideElements(...allOverlayButtons)
            .hideElements(this._divBackgroundImage)
            .hideElements(this._divDetachedBackground)
            .showElements(this._divSafeZoneWrapper);

          this._divPlayer.classList.remove(domClasses.playerDetached);
        }
      },
    });
  }

  private togglePIP() {
    this._buttonDetach!.className === domClasses.mediaChromeDetach ? this._videoController.enablePiP() : this._videoController.disablePiP();
  }

  getVideoElement(): HTMLVideoElement {
    return this._videoElement;
  }

  private createHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack): HTMLTrackElement {
    let element: HTMLTrackElement = DomUtil.createElement<'track'>('track');
    element.kind = omakaseTextTrack.kind;
    element.id = omakaseTextTrack.id;
    element.label = omakaseTextTrack.label;
    element.srclang = omakaseTextTrack.language;
    element.src = omakaseTextTrack.src;
    element.default = omakaseTextTrack.default;
    return element;
  }

  appendHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack): Observable<HTMLTrackElement | undefined> {
    return new Observable<HTMLTrackElement | undefined>((observer) => {
      let element = this.createHTMLTrackElement(omakaseTextTrack);

      let loadBreaker$ = new Subject<void>();

      fromEvent(element, HTMLElementEvents.ERROR)
        .pipe(takeUntil(loadBreaker$), take(1))
        .subscribe({
          next: (event) => {
            errorCompleteObserver(observer, 'Error adding subtitle track');
            nextCompleteSubject(loadBreaker$);
          },
        });

      fromEvent(element, HTMLElementEvents.LOAD)
        .pipe(takeUntil(loadBreaker$), take(1))
        .subscribe({
          next: (event) => {
            nextCompleteObserver(observer, element);
            nextCompleteSubject(loadBreaker$);
          },
          error: (error) => {
            errorCompleteObserver(observer, 'Error adding subtitle track');
            nextCompleteSubject(loadBreaker$);
          },
        });

      this._videoElement.appendChild(element);

      let textTrack = this.getTextTrackById(element.id);
      if (textTrack) {
        textTrack.mode = 'hidden'; // this line somehow triggers cues loading and thus we can catch LOAD' event and complete the observable
      } else {
        errorCompleteObserver(observer, 'Something went wrong adding subtitles tracks');
      }
    });
  }

  getTextTrackList(): TextTrackList {
    return this._videoElement.textTracks;
  }

  getTextTrackById(id: string): TextTrack | undefined {
    let track = this._videoElement.textTracks.getTrackById(id);
    return track ? track : void 0;
  }

  /**
   * https://github.com/whatwg/html/issues/1921
   * https://github.com/web-platform-tests/wpt/pull/6594
   *
   * @param id
   * @private
   */
  removeTextTrackById(id: string): boolean {
    // there is not remove track method in HTML TextTrack API, we have to fake it
    let domTextTrack = this.getTextTrackById(id);
    if (domTextTrack) {
      domTextTrack.mode = 'disabled';
      this._videoElement.querySelectorAll<'track'>('track').forEach((trackElement) => {
        if (trackElement.getAttribute('id') === id && trackElement.parentElement) {
          trackElement.parentElement.removeChild(trackElement);
        }
      });
      return true;
    } else {
      return false;
    }
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

  createMarkerTrack(config: MarkerTrackConfig): MarkerTrackApi {
    if (!this._markerBar) {
      throw Error('Marker bar element not found');
    }
    return this._markerBar.createMarkerTrack({
      ...config,
      mediaDuration: this._videoController.getDuration(),
    });
  }

  getProgressMarkerTrack(): TimeRangeMarkerTrackApi | undefined {
    return this._timeRangeControl;
  }

  destroy() {
    if (this._divPlayer) {
      this._divPlayer.replaceChildren();
    }

    if (this._fullscreenChangeHandler) {
      Fullscreen.off('change', this._fullscreenChangeHandler);
    }

    if (this._enterPictureInPictureHandler) {
      this._videoController.getHTMLVideoElement().removeEventListener(HTMLVideoElementEvents.ENTERPIP, this._enterPictureInPictureHandler);
    }

    if (this._leavePictureInPictureHandler) {
      this._videoController.getHTMLVideoElement().removeEventListener(HTMLVideoElementEvents.LEAVEPIP, this._leavePictureInPictureHandler);
    }

    nextCompleteSubject(this._videoEventBreaker$);
    nextCompleteSubject(this._destroyed$);

    nullifier(this._videoController, this._videoElement);
  }
}
