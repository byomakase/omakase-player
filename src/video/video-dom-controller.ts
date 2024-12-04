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
import {filter, fromEvent, Observable, race, Subject, take, takeUntil} from 'rxjs';
import {OmakaseTextTrack, VideoFullscreenChangeEvent, VideoHelpMenuChangeEvent, VideoSafeZoneChangeEvent} from '../types';
import {errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {z} from 'zod';
import {VideoControllerApi} from './video-controller-api';
import {StringUtil} from '../util/string-util';
import {nullifier} from '../util/destroy-util';
import {DomUtil} from '../util/dom-util';
import {VideoSafeZone} from './model';
import {isNullOrUndefined} from '../util/object-util';
import {CryptoUtil} from '../util/crypto-util';
import {VideoDomControllerApi} from './video-dom-controller-api';
import {MediaChromeButton, MediaController, MediaTooltip} from 'media-chrome';
import {OmakasePreviewThumbnail, OmakaseTimeDisplay, OmakaseTimeRange} from '../components';
import {VttLoadOptions} from '../api/vtt-aware-api';
import {VttAdapter} from '../common/vtt-adapter';
import {ThumbnailVttFile} from '../vtt';
import {AuthUtil} from '../util/auth-util';
import 'media-chrome';
import '../components';
// @ts-ignore
import silentWavBase64 from '../../assets/silent.wav.base64.txt?raw';

const domClasses = {
  player: 'omakase-player',
  playerWrapper: 'omakase-player-wrapper',
  playerDetached: 'omakase-player-detached',
  playerFullscreen: 'omakase-player-fullscreen',
  video: 'omakase-video',
  videoControls: 'omakase-video-controls',
  timecodeContainer: 'timecode-container',

  audioUtil: `omakase-audio-util-${CryptoUtil.uuid()}`,

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
  alerts: 'omakase-player-alerts',
  detachedBackground: 'omakase-detached-background',
  backgroundImage: 'omakase-background-image',

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
  mediaChromeBitcTooltip: 'media-chrome-bitc-tooltip',
  mediaChromeCurrentTimecode: 'media-chrome-current-timecode',
  mediaChromePreviewTimecode: 'media-chrome-preview-timecode',
  mediaChromePreviewThumbnail: 'media-chrome-preview-thumbnail',
  mediaChromePreviewWrapper: 'media-chrome-preview-wrapper',
};

export type MediaChromeVisibility = 'disabled' | 'enabled' | 'fullscreen-only';

export interface VideoDomControllerConfig {
  playerHTMLElementId: string;
  crossorigin: 'anonymous' | 'use-credentials';
  detachedPlayer: boolean;
  mediaChrome: MediaChromeVisibility;
  mediaChromeHTMLElementId?: string;
  thumbnailVttUrl?: string;
  thumbnailFn?: (time: number) => string | undefined;
}

export const VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT: VideoDomControllerConfig = {
  playerHTMLElementId: 'omakase-player',
  crossorigin: 'anonymous',
  detachedPlayer: false,
  mediaChrome: 'disabled',
};

export class VideoDomController implements VideoDomControllerApi {
  public readonly onFullscreenChange$: Subject<VideoFullscreenChangeEvent> = new Subject<VideoFullscreenChangeEvent>();
  public readonly onVideoSafeZoneChange$: Subject<VideoSafeZoneChangeEvent> = new Subject<VideoSafeZoneChangeEvent>();

  protected readonly _config: VideoDomControllerConfig;
  protected readonly _vttAdapter = new VttAdapter(ThumbnailVttFile);

  protected readonly _divPlayer: HTMLElement;

  protected _videoController!: VideoControllerApi;
  protected _videoEventBreaker$!: Subject<void>;

  /**
   * Main video element
   * @protected
   */
  protected _videoElement!: HTMLVideoElement;

  /**
   * Silent audio element, used for keepalive
   * @protected
   */
  protected _audioUtilElement!: HTMLAudioElement;

  protected _mediaControllerElement!: MediaController;
  protected _divPlayerWrapper!: HTMLElement;
  protected _divButtonOverlayPlay!: HTMLElement;
  protected _divButtonOverlayPause!: HTMLElement;
  protected _divButtonOverlayLoading!: HTMLElement;
  protected _divButtonOverlayError!: HTMLElement;
  protected _divButtonOverlayReplay!: HTMLElement;
  protected _divButtonOverlayAttach!: HTMLElement;

  protected _divButtonHelp!: HTMLElement;
  protected _divHelp!: HTMLElement;
  protected _divHelpMenu!: HTMLElement;

  protected _divSectionBottomRight!: HTMLElement;
  protected _divButtonAttach!: HTMLElement;
  protected _divButtonFullscreen!: HTMLElement;

  protected _divErrorMessage!: HTMLElement;
  protected _divSafeZoneWrapper!: HTMLElement;
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
  protected _currentTimecode?: OmakaseTimeDisplay;
  protected _previewTimecode?: OmakaseTimeDisplay;
  protected _previewThumbnail?: OmakasePreviewThumbnail;

  protected _bitcEnabled = false;

  protected _showTemporaryOnMouseMoveTimeoutId?: ReturnType<typeof setTimeout>;

  protected _fullscreenChangeHandler: () => void;

  protected _videoSafeZones: VideoSafeZone[] = [];

  protected _silentWavUrl?: string;

  constructor(config: Partial<VideoDomControllerConfig>) {
    this._config = {
      ...VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT,
      ...config,
    };

    this._divPlayer = DomUtil.getElementById<HTMLElement>(this._config.playerHTMLElementId);

    if (!this._divPlayer) {
      throw new Error(`DOM <div> for player not found. ID provided: ${this._config.playerHTMLElementId}`);
    }

    this._silentWavUrl = `data:${'audio/wav'};base64,${silentWavBase64}`;

    this.createDom();

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

    Fullscreen.on('change', this._fullscreenChangeHandler);
  }

  private createDom() {
    this._divPlayer.classList.add(`${domClasses.player}`);

    this._divPlayer.innerHTML = `<div class="${domClasses.playerWrapper} media-chrome-${this._config.mediaChrome}">
          <media-controller>
              <video slot="media" class="${domClasses.video}" playsinline=""></video>
              <div slot="centered-chrome" class="${domClasses.videoControls}" noautohide>
                  <div class="omakase-overlay-buttons">
                      <div class="${domClasses.buttonOverlayAttach} omakase-video-overlay-button"></div>
                      <div class="${domClasses.buttonOverlayPlay} omakase-video-overlay-button d-none"></div>
                      <div class="${domClasses.buttonOverlayPause} omakase-video-overlay-button d-none"></div>
                      <div class="${domClasses.buttonOverlayReplay} omakase-video-overlay-button d-none"></div>
                      <div class="${domClasses.buttonOverlayLoading} omakase-video-overlay-button d-none"></div>
                      <div class="${domClasses.buttonOverlayError} omakase-video-overlay-button d-none"></div>
                  </div>
              </div>
              ${this.getMediaChromeTemplate()}
          </media-controller>
          <div class="${domClasses.detachedBackground} d-none">
          </div>
          <div class="${domClasses.backgroundImage} d-none"></div>

          <div class="${domClasses.videoControls}">
              <div class="${domClasses.safeZoneWrapper}">
              </div>
          </div>

          <div class="${domClasses.help} d-none">
              <div class="omakase-help-dropdown">
                <button class="omakase-help-button d-none"></button>
                <div class="${domClasses.helpMenu} d-none">
                </div>
              </div>
          </div>

          <div class="${domClasses.sectionBottomRight} d-none">
              <button class="${domClasses.buttonAttach}"></button>
              <button class="${domClasses.buttonFullscreen}"></button>
          </div>

          <div class="${domClasses.alerts}">
          </div>

          <div class="${domClasses.errorMessage} d-none">
          </div>

          <audio controls loop class="${domClasses.audioUtil} d-none">
            <source src="${this._silentWavUrl}">
          </audio>
      </div>`;

    this._videoElement = this.getPlayerElement<HTMLVideoElement>(domClasses.video);
    this._videoElement.crossOrigin = this._config.crossorigin;

    this._audioUtilElement = this.getPlayerElement<HTMLAudioElement>(domClasses.audioUtil);

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

    this._divSectionBottomRight = this.getPlayerElement<HTMLElement>(domClasses.sectionBottomRight);
    this._divButtonAttach = this.getPlayerElement<HTMLElement>(domClasses.buttonAttach);
    this._divButtonFullscreen = this.getPlayerElement<HTMLElement>(domClasses.buttonFullscreen);

    this._divErrorMessage = this.getPlayerElement<HTMLElement>(domClasses.errorMessage);
    this._divSafeZoneWrapper = this.getPlayerElement<HTMLElement>(domClasses.safeZoneWrapper);
    this._divAlerts = this.getPlayerElement<HTMLElement>(domClasses.alerts);
    this._divBackgroundImage = this.getPlayerElement<HTMLElement>(domClasses.backgroundImage);
    this._divDetachedBackground = this.getPlayerElement<HTMLElement>(domClasses.detachedBackground);

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
    this._divTimecode = this.getPlayerElement<HTMLElement>(domClasses.timecodeContainer);
    this._currentTimecode = this.getPlayerElement<OmakaseTimeDisplay>(domClasses.mediaChromeCurrentTimecode);
    this._previewTimecode = this.getPlayerElement<OmakaseTimeDisplay>(domClasses.mediaChromePreviewTimecode);
    this._previewThumbnail = this.getPlayerElement<OmakasePreviewThumbnail>(domClasses.mediaChromePreviewThumbnail);
  }

  private getMediaChromeTemplate() {
    if (this._config.mediaChromeHTMLElementId) {
      const mediaChromeTemplate = DomUtil.getElementById<HTMLTemplateElement>(this._config.mediaChromeHTMLElementId);
      if (!mediaChromeTemplate) {
        throw new Error(`DOM <template> for media chrome template not found. ID provided: ${this._config.mediaChromeHTMLElementId}`);
      }
      return mediaChromeTemplate.innerHTML;
    }
    const defaultMediaChromeTemplate = `<div style="display:none" class="${domClasses.timecodeContainer} d-none" slot="middle-chrome" noautohide>
          <omakase-time-display class="${domClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
      </div>
      <media-control-bar style="display:none" class="upper-control-bar">
          <omakase-time-range>
            <div slot="preview" class="${domClasses.mediaChromePreviewWrapper}">
              <omakase-preview-thumbnail class="${domClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
              <omakase-time-display class="${domClasses.mediaChromePreviewTimecode}"></omakase-time-display>
            </div>
          </omakase-time-range>
      </media-control-bar>
      <media-control-bar style="display:none" class="lower-control-bar">
          <div class="start-container">
              <media-mute-button class="${domClasses.mediaChromeButton}">
                <span slot="high" class="${domClasses.mediaChromeAudioHigh}"></span>
                <span slot="medium" class="${domClasses.mediaChromeAudioMedium}"></span>
                <span slot="low" class="${domClasses.mediaChromeAudioLow}"></span>
                <span slot="off" class="${domClasses.mediaChromeAudioMute}"></span>
              </media-mute-button>
              <media-volume-range></media-volume-range>
          </div>
          <div class="center-container">
              <media-chrome-button class="${domClasses.mediaChromeButton}">
                <span class="${domClasses.mediaFastRewindButton}"></span>
                <media-tooltip>Rewind by 10 frames</media-tooltip>
              </media-chrome-button>
              <media-chrome-button class="${domClasses.mediaChromeButton}">
                <span class="${domClasses.mediaRewindButton}"></span>
                <media-tooltip>Rewind to previous frame</media-tooltip>
              </media-chrome-button>
              <media-play-button class="${domClasses.mediaChromeButton}">
                  <span slot="play" class="${domClasses.mediaChromePlay}"></span>
                  <span slot="pause" class="${domClasses.mediaChromePause}"></span>
              </media-play-button>
              <media-chrome-button class="${domClasses.mediaChromeButton}">
                <span class="${domClasses.mediaForwardButton}"></span>
                <media-tooltip>Fast forward to next frame</media-tooltip>
              </media-chrome-button>
              <media-chrome-button class="${domClasses.mediaChromeButton}">
                <span class="${domClasses.mediaFastForwardButton}"></span>
                <media-tooltip>Fast forward by 10 frames</media-tooltip>
              </media-chrome-button>
          </div>
          <div class="end-container">
              <media-chrome-button class="${domClasses.mediaChromeButton}">
                <span class="${domClasses.mediaChromeBitcDisabled}"></span>
                <media-tooltip class="${domClasses.mediaChromeBitcTooltip}">Show timecode</media-tooltip>
              </media-chrome-button>
              <media-chrome-button class="${domClasses.mediaChromeButton}">
                <span class="${this._config.detachedPlayer ? domClasses.mediaChromeAttach : domClasses.mediaChromeDetach}"></span>
                <media-tooltip>${this._config.detachedPlayer ? 'Attach player' : 'Detach player'}</media-tooltip>
              </media-chrome-button>
              <media-fullscreen-button class="${domClasses.mediaChromeButton}">
                  <span slot="enter" class="${domClasses.mediaChromeFullscreenEnter}"></span>
                   <span slot="exit" class="${domClasses.mediaChromeFullscreenExit}"></span>
              </media-fullscreen-button>
          </div>
      </media-control-bar>`;
    return defaultMediaChromeTemplate;
  }

  private getPlayerElement<T>(className: string): T {
    return this.getPlayerElements<T>(className)[0];
  }

  private getPlayerElements<T>(className: string): T[] {
    return Array.from(DomUtil.getElementById<HTMLElement>(this._divPlayer.id).querySelectorAll(`.${className}`)) as T[];
  }

  private showElements(...element: HTMLElement[]): VideoDomController {
    element.forEach((element) => {
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

  private hideElements(...element: HTMLElement[]): VideoDomController {
    element.forEach((element) => {
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
      this._divHelpMenu.innerHTML = helpMenuGroups
        .map((helpMenuGroup) => {
          let items = `${helpMenuGroup.items.map((helpMenuItem) => `<div class="omakase-help-item"><span class="float-start">${helpMenuItem.name}</span><span class="float-end">${helpMenuItem.description}</span></div>`).join('')}`;
          return `<div class="omakase-help-group">
                            <div class="omakase-help-group-title">
                              <span>${helpMenuGroup.name}</span>
                            </div>
                            ${items}
                        </div>
                        `;
        })
        .join('');
    } else {
      this._divHelpMenu.innerHTML = ``;
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
            Fullscreen.requestFullscreen(this._config.mediaChrome === 'disabled' ? this._videoElement : this._mediaControllerElement)
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

  loadThumbnailVtt(vttUrl: string) {
    return passiveObservable((observer) => {
      const options: VttLoadOptions = {};
      if (AuthUtil.authentication) {
        options.axiosConfig = AuthUtil.getAuthorizedAxiosConfig(vttUrl, AuthUtil.authentication);
      }
      this._vttAdapter.loadVtt(vttUrl, options).subscribe((vttFile) => {
        if (vttFile && this._previewThumbnail) {
          this._previewThumbnail.vttFile = vttFile;
          nextCompleteObserver(observer);
        }
      });
    });
  }

  attachVideoController(videoController: VideoControllerApi) {
    // clean previous subscribers and listeners
    nextCompleteSubject(this._videoEventBreaker$);
    this._videoEventBreaker$ = new Subject<void>();

    this._videoController = videoController;

    this._videoElement.controls = false;

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
        .pipe(takeUntil(this._videoEventBreaker$))
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

    if (!videoController.isDetachVideoWindowEnabled() && this._buttonDetach) {
      this._videoController.getHTMLVideoElement().addEventListener('enterpictureinpicture', (event) => {
        if (event instanceof PictureInPictureEvent) {
          this._buttonDetach!.className = domClasses.mediaChromeAttach;
        }
      });

      this._videoController.getHTMLVideoElement().addEventListener('leavepictureinpicture', (event) => {
        if (event instanceof PictureInPictureEvent) {
          this._buttonDetach!.className = domClasses.mediaChromeDetach;
        }
      });
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
      this._previewThumbnail.thumbnailFn = this._config.thumbnailFn;
    }

    fromEvent<MouseEvent>(this._divPlayerWrapper, 'mousemove')
      .pipe(
        takeUntil(this._videoEventBreaker$),
        filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached')
      )
      .subscribe({
        next: (event) => {
          if (
            this._videoController.isVideoLoaded() &&
            !(this._videoController.getPlaybackState()!.ended || this._videoController.getPlaybackState()!.waiting || this._videoController.getPlaybackState()!.seeking)
          ) {
            let playControlToShow = this._videoController.isPlaying() ? this._divButtonOverlayPause : this._divButtonOverlayPlay;
            clearShowTemporaryOnMouseMoveTimeoutId();
            this.hideElements(this._divButtonOverlayPause, this._divButtonOverlayPlay).showElements(playControlToShow, this._divButtonHelp);

            if (this._config.detachedPlayer) {
              this.showElements(this._divSectionBottomRight);
            }

            this._showTemporaryOnMouseMoveTimeoutId = setTimeout(() => {
              this.hideElements(playControlToShow).hideElements(this._divSectionBottomRight);

              if (!this.isShown(this._divHelpMenu)) {
                this.hideElements(this._divButtonHelp, this._divHelpMenu);
              }
            }, 1000);
          }
        },
      });

    fromEvent<MouseEvent>(this._divPlayerWrapper, 'mouseleave')
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: (event) => {
          this.hideElements(this._divButtonOverlayPlay, this._divButtonOverlayPause).hideElements(this._divButtonHelp, this._divHelpMenu).hideElements(this._divSectionBottomRight);
        },
      });

    fromEvent<MouseEvent>(this._divPlayerWrapper, 'click')
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: (event) => {
          if (this._videoController.isVideoLoaded()) {
            if (
              ![this._divButtonHelp, this._divButtonOverlayError, this._divErrorMessage, this._divButtonAttach, this._divButtonFullscreen].find((p) => p === event.target) &&
              !this._divAlerts.contains(event.target as HTMLElement)
            ) {
              if (this._videoController.getVideoWindowPlaybackState() !== 'detached') {
                if (!this._videoController.isFullscreen() && this._config.mediaChrome !== 'enabled') {
                  this._videoController.togglePlayPause().subscribe();
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
        .pipe(takeUntil(this._videoEventBreaker$))
        .subscribe({
          next: (event) => {
            this._videoController.seekNextFrame().subscribe();
          },
        });
    }
    if (this._buttonRewind) {
      fromEvent<MouseEvent>(this._buttonRewind, 'click')
        .pipe(takeUntil(this._videoEventBreaker$))
        .subscribe({
          next: (event) => {
            this._videoController.seekPreviousFrame().subscribe();
          },
        });
    }
    if (this._buttonFastForward) {
      fromEvent<MouseEvent>(this._buttonFastForward, 'click')
        .pipe(takeUntil(this._videoEventBreaker$))
        .subscribe({
          next: (event) => {
            this._videoController.seekFromCurrentFrame(10).subscribe();
          },
        });
    }
    if (this._buttonFastRewind) {
      fromEvent<MouseEvent>(this._buttonFastRewind, 'click')
        .pipe(takeUntil(this._videoEventBreaker$))
        .subscribe({
          next: (event) => {
            this._videoController.seekFromCurrentFrame(-10).subscribe();
          },
        });
    }
    if (this._buttonDetach) {
      fromEvent<MouseEvent>(this._buttonDetach, 'click')
        .pipe(takeUntil(this._videoEventBreaker$))
        .subscribe({
          next: (event) => {
            if (this._videoController.isDetachVideoWindowEnabled()) {
              this._videoController.detachVideoWindow();
            } else {
              this.togglePIP();
            }
          },
        });
    }
    if (this._buttonAttach) {
      fromEvent<MouseEvent>(this._buttonAttach, 'click')
        .pipe(takeUntil(this._videoEventBreaker$))
        .subscribe({
          next: (event) => {
            this._videoController.attachVideoWindow();
          },
        });
    }
    if (this._buttonBitc) {
      fromEvent<MouseEvent>(this._buttonBitc, 'click')
        .pipe(takeUntil(this._videoEventBreaker$))
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
      this._timeRangeControl.onSeek$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
        next: (time) => {
          this._videoController.seekToTime(time);
        },
      });
    }

    // prevents video context menu
    fromEvent<MouseEvent>(this._videoElement, 'contextmenu')
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: (event) => {
          event.preventDefault();
        },
      });

    this._videoController.onVideoLoading$
      .pipe(
        takeUntil(this._videoEventBreaker$),
        filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached')
      )
      .subscribe({
        next: (event) => {
          this.hideElements(...allOverlayButtons)
            .hideElements(this._divErrorMessage)
            .showElements(this._divButtonOverlayLoading)
            .showElements(this._divBackgroundImage);
        },
      });

    this._videoController.onVideoLoaded$
      .pipe(
        takeUntil(this._videoEventBreaker$),
        filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached')
      )
      .subscribe({
        next: (videoLoaded) => {
          this.hideElements(...allOverlayButtons)
            .hideElements(this._divErrorMessage)
            .hideElements(this._divBackgroundImage);
          if (!videoLoaded) {
            this.showElements(this._divButtonOverlayLoading).showElements(this._divBackgroundImage);
          }

          if (this._config.thumbnailVttUrl) {
            this.loadThumbnailVtt(this._config.thumbnailVttUrl);
          }
        },
      });

    this._videoController.onPlaybackState$
      .pipe(
        takeUntil(this._videoEventBreaker$),
        filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached')
      )
      .subscribe({
        next: (state) => {
          clearShowTemporaryOnMouseMoveTimeoutId();
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
            } else if (state.ended) {
              this.showElements(this._divButtonOverlayReplay);
            }
          } else if (state.seeking && state.waiting) {
            this.hideElements(...allOverlayButtons)
              .hideElements(this._divErrorMessage)
              .showElements(this._divButtonOverlayLoading);
          }
        },
      });

    this._videoController.onVideoError$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        this.hideElements(...allOverlayButtons)
          .hideElements(this._divBackgroundImage)
          .showElements(this._divErrorMessage, this._divButtonOverlayError);
        this._divErrorMessage.innerHTML = event.message ? event.message : '';
      },
    });

    // help menu
    fromEvent<MouseEvent>(this._divButtonHelp, 'click')
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: (event) => {
          if (event.target === this._divButtonHelp) {
            if (this.isShown(this._divHelpMenu)) {
              this.hideElements(this._divHelpMenu);
            } else {
              this.showElements(this._divHelpMenu);
            }
          }
        },
      });

    fromEvent<MouseEvent>(this._divButtonAttach, 'click')
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: (event) => {
          this._videoController.attachVideoWindow();
        },
      });

    fromEvent<MouseEvent>(this._divButtonFullscreen, 'click')
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: (event) => {
          this._videoController.toggleFullscreen();
        },
      });

    this._videoController.onHelpMenuChange$
      .pipe(
        takeUntil(this._videoEventBreaker$),
        filter((p) => this._videoController.getVideoWindowPlaybackState() === 'attached')
      )
      .subscribe({
        next: (event) => {
          this.onHelpMenuChangeHandler(event);
        },
      });

    this._videoController.onVideoWindowPlaybackStateChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
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

  getAudioUtilElement(): HTMLAudioElement {
    return this._audioUtilElement;
  }

  destroy() {
    nextCompleteSubject(this._videoEventBreaker$);

    if (this._divPlayer) {
      this._divPlayer.replaceChildren();
    }

    if (this._fullscreenChangeHandler) {
      Fullscreen.off('change', this._fullscreenChangeHandler);
    }

    nullifier(this._videoController, this._videoElement);
  }

  private static createHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack): HTMLTrackElement {
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
    return new Observable<HTMLTrackElement>((o$) => {
      let track = VideoDomController.createHTMLTrackElement(omakaseTextTrack);

      fromEvent(track, 'load')
        .pipe(take(1))
        .subscribe({
          next: (event) => {
            o$.next(track);
            o$.complete();
          },
          error: (error) => {
            console.debug('Something went wrong adding subtitles tracks');

            o$.next(void 0);
            o$.complete();
          },
        });

      this._videoElement.appendChild(track);

      let textTrack = this.getTextTrackById(track.id);
      if (textTrack) {
        textTrack.mode = 'hidden'; // this line somehow triggers cues loading and thus we can catch 'load' event and complete the observable
      } else {
        console.debug('Something went wrong adding subtitles tracks');

        o$.next(void 0);
        o$.complete();
      }
    });
  }

  getTextTrackList(): TextTrackList | undefined {
    return this._videoElement ? this._videoElement.textTracks : void 0;
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
}
