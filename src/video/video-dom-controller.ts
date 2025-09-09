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
import {MarkerTrackConfig, VideoSafeZone} from './model';
import {isNullOrUndefined} from '../util/object-util';
import {CryptoUtil} from '../util/crypto-util';
import {VideoDomControllerApi} from './video-dom-controller-api';
import 'media-chrome';
import 'media-chrome/dist/media-theme-element';
import '../components';
import {SvgUtil} from '../util/svg-util';
import {OmakaseDropdownToggle} from '../components/omakase-dropdown-toggle';
import {BrowserProvider} from '../common/browser-provider';
import {AudioPlayerSize, DEFAULT_PLAYER_CHROMING, FullscreenChroming, PlayerChroming, PlayerChromingTheme, StampChroming, StampThemeScale} from './../player-chroming/model';
import {MarkerTrackApi} from '../api';
import {TimeRangeMarkerTrackApi} from '../api/time-range-marker-track-api';
import {HTMLElementEvents} from '../media-element/omp-media-element';
import {PlayerChromingDomController} from '../player-chroming/player-chroming-dom-controller';
import {PlayerChromingDomControllerApi} from '../player-chroming/player-chroming-dom-controller-api';
import {DomController} from '../dom/dom-controller';

export interface VideoDomControllerConfig {
  playerHTMLElementId: string;
  crossorigin: 'anonymous' | 'use-credentials';
  detachedPlayer: boolean;
  disablePictureInPicture: boolean;
  playerChroming: PlayerChroming;
  playerClickHandler?: () => void;
}

export const VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT: VideoDomControllerConfig = {
  playerHTMLElementId: 'omakase-player',
  crossorigin: 'anonymous',
  detachedPlayer: false,
  disablePictureInPicture: false,
  playerChroming: DEFAULT_PLAYER_CHROMING,
};

export class VideoDomController extends DomController implements VideoDomControllerApi {
  public readonly onFullscreenChange$: Subject<VideoFullscreenChangeEvent> = new Subject<VideoFullscreenChangeEvent>();

  public readonly onVideoSafeZoneChange$: Subject<VideoSafeZoneChangeEvent> = new Subject<VideoSafeZoneChangeEvent>();

  protected readonly _config: VideoDomControllerConfig;

  protected readonly _playerChromingDomController: PlayerChromingDomControllerApi;

  protected readonly _divPlayer: HTMLElement;

  protected _videoController!: VideoControllerApi;
  protected _videoEventBreaker$: Subject<void> = new Subject();

  /**
   * Main video element
   * @protected
   */
  protected _videoElement!: HTMLVideoElement;
  protected _divPlayerWrapper!: HTMLElement;
  protected _divButtonOverlayPlay?: HTMLElement;
  protected _divButtonOverlayPause?: HTMLElement;
  protected _divButtonOverlayLoading?: HTMLElement;
  protected _divButtonOverlayError?: HTMLElement;
  protected _divButtonOverlayReplay?: HTMLElement;
  protected _divButtonOverlayAttach?: HTMLElement;

  protected _divButtonHelp?: HTMLElement;
  protected _divHelp?: HTMLElement;
  protected _divHelpMenu?: HTMLElement;

  protected _audioTextToggle?: OmakaseDropdownToggle;

  protected _divSectionBottomRight!: HTMLElement;
  protected _divButtonAttach!: HTMLElement;
  protected _divButtonFullscreen?: HTMLElement;

  protected _divErrorMessage!: HTMLElement;
  protected _divSafeZoneWrapper!: HTMLElement;
  protected _divWatermarkWrapper!: HTMLElement;
  protected _divWatermark!: HTMLElement;
  protected _divAlerts!: HTMLElement;
  protected _divBackgroundImage!: HTMLElement;
  protected _divDetachedBackground!: HTMLElement;

  protected _showTemporaryOnMouseMoveTimeoutId?: ReturnType<typeof setTimeout>;

  protected _fullscreenChangeHandler: () => void;

  protected _videoSafeZones: VideoSafeZone[] = [];

  protected _destroyed$ = new Subject<void>();

  constructor(config: Partial<VideoDomControllerConfig>) {
    super();
    this._config = {
      ...VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT,
      ...config,
    };

    this._divPlayer = DomUtil.getElementById<HTMLElement>(this._config.playerHTMLElementId);

    if (!this._divPlayer) {
      throw new Error(`DOM <div> for player not found. ID provided: ${this._config.playerHTMLElementId}`);
    }

    this._playerChromingDomController = new PlayerChromingDomController({
      playerHTMLElementId: this._config.playerHTMLElementId,
      detachedPlayer: this._config.detachedPlayer,
      playerChroming: this._config.playerChroming,
    });

    this.createPlayerDom();

    this._fullscreenChangeHandler = () => {
      if (this.isFullscreen()) {
        this._divPlayer.classList.add(this._domClasses.playerFullscreen);
        this._playerChromingDomController.mediaControllerElement.classList.add(this._domClasses.playerFullscreen);
        this._playerChromingDomController.themeElement.setAttribute('fullscreen', '');
      } else {
        this._divPlayer.classList.remove(this._domClasses.playerFullscreen);
        this._playerChromingDomController.mediaControllerElement.classList.remove(this._domClasses.playerFullscreen);
        this._playerChromingDomController.themeElement.removeAttribute('fullscreen');
      }
      this.onFullscreenChange$.next({
        fullscreen: this.isFullscreen(),
      });
    };

    Fullscreen.on('change', this._fullscreenChangeHandler);

    // this._onAudioElementAdded$.subscribe({
    //   next: (audioElement) => {
    //     this._audioElements.set(audioElement.id, audioElement);
    //   },
    // });
  }

  updateChromingTemplate(playerChroming: PlayerChroming) {
    this._config.playerChroming = playerChroming;
    this._playerChromingDomController.playerChroming = playerChroming;
    if (playerChroming.theme === PlayerChromingTheme.Stamp) {
      this._videoElement.classList.remove(`${this._domClasses.video}-${StampThemeScale.Fill.toLowerCase()}`, `${this._domClasses.video}-${StampThemeScale.Fit.toLowerCase()}`);
      this._videoElement.classList.add(`${this._domClasses.video}-${playerChroming.themeConfig?.stampScale?.toLowerCase()}`);
    }
    if (this.isCompactAudioTheme()) {
      this._videoElement.classList.add('d-none');
    } else {
      this._videoElement.classList.remove('d-none');
    }
  }

  private createPlayerDom() {
    this._divPlayer.classList.add(`${this._domClasses.player}`);

    this._divPlayer.innerHTML = `<div class="${this._domClasses.playerWrapper} ${this._domClasses.playerWrapper}-${this._config.playerChroming.theme.toLowerCase()}">
          ${this._playerChromingDomController.createTemplateDom()}
          <media-theme template="omakase-player-theme-${this._config.playerHTMLElementId}">
            <video slot="media" class="${this._domClasses.video} ${this._domClasses.video}-${(this._config.playerChroming as StampChroming).themeConfig?.stampScale?.toLowerCase()} ${this.isCompactAudioTheme() ? 'd-none' : ''}" playsinline=""></video>
            ${this._playerChromingDomController.createSlotsDom()}
          </media-theme>
          <div class="${this._domClasses.detachedBackground} d-none">
          </div>
          <div class="${this._domClasses.backgroundImage} d-none"></div>

          <div class="${this._domClasses.sectionBottomRight} d-none">
              <button class="${this._domClasses.buttonAttach}"></button>
              <button class="${this._domClasses.buttonFullscreen}"></button>
          </div>

          <div class="${this._domClasses.alerts}">
          </div>

          <div class="${this._domClasses.errorMessage} d-none">
          </div>
      </div>`;

    this._playerChromingDomController.initializeDomProperties();

    this._videoElement = this.getPlayerElement<HTMLVideoElement>(this._domClasses.video);
    this._videoElement.controls = false;
    this._videoElement.crossOrigin = this._config.crossorigin;
    if (this._config.disablePictureInPicture) {
      this._videoElement.disablePictureInPicture = true;
    }

    this._divPlayerWrapper = this.getPlayerElement<HTMLElement>(this._domClasses.playerWrapper);
    this._divButtonOverlayPlay = this.getShadowElementByClass<HTMLElement>(this._domClasses.buttonOverlayPlay);
    this._divButtonOverlayPause = this.getShadowElementByClass<HTMLElement>(this._domClasses.buttonOverlayPause);
    this._divButtonOverlayLoading = this.getShadowElementByClass<HTMLElement>(this._domClasses.buttonOverlayLoading);
    this._divButtonOverlayError = this.getShadowElementByClass<HTMLElement>(this._domClasses.buttonOverlayError);
    this._divButtonOverlayReplay = this.getShadowElementByClass<HTMLElement>(this._domClasses.buttonOverlayReplay);
    this._divButtonHelp = this.getShadowElementByClass<HTMLElement>(this._domClasses.buttonOverlayHelp);
    this._divButtonOverlayAttach = this.getShadowElementByClass<HTMLElement>(this._domClasses.buttonOverlayAttach);
    this._divHelp = this.getShadowElementByClass<HTMLElement>(this._domClasses.help);
    this._divHelpMenu = this.getShadowElementByClass<HTMLElement>(this._domClasses.helpMenu);

    this._audioTextToggle = this.getShadowElementByClass<OmakaseDropdownToggle>(this._domClasses.audioTextToggle);

    this._divSectionBottomRight = this.getShadowElementByClass<HTMLElement>(this._domClasses.sectionBottomRight);
    this._divButtonAttach = this.getPlayerElement<HTMLElement>(this._domClasses.buttonAttach);
    this._divButtonFullscreen = this.getShadowElementByClass<HTMLElement>(this._domClasses.buttonFullscreen);

    this._divErrorMessage = this.getPlayerElement<HTMLElement>(this._domClasses.errorMessage);
    this._divSafeZoneWrapper = this.getShadowElementByClass<HTMLElement>(this._domClasses.safeZoneWrapper);
    this._divAlerts = this.getPlayerElement<HTMLElement>(this._domClasses.alerts);
    this._divBackgroundImage = this.getPlayerElement<HTMLElement>(this._domClasses.backgroundImage);
    this._divDetachedBackground = this.getPlayerElement<HTMLElement>(this._domClasses.detachedBackground);
    this._divWatermarkWrapper = this.getShadowElementByClass<HTMLElement>(this._domClasses.watermarkWrapper);
    this._divWatermark = this.getShadowElementByClass<HTMLElement>(this._domClasses.watermark);

    // this._mediaControllerElement.hotkeys.add('noarrowleft', 'noarrowright');

    if (this._config.playerChroming.watermark) {
      this.setWatermark(this._config.playerChroming.watermark);
    }
  }

  getPlayerChromingElement<T>(querySelector: string): T {
    return this._playerChromingDomController.themeElement.querySelector(querySelector) as T;
  }

  private getPlayerElement<T>(className: string): T {
    return this.getPlayerElements<T>(className)[0];
  }

  private getShadowElementByClass<T>(className: string): T {
    return this._playerChromingDomController.themeElement.shadowRoot?.querySelector(`.${className}`) as T;
  }

  private getPlayerElements<T>(className: string): T[] {
    return Array.from(DomUtil.getElementById<HTMLElement>(this._divPlayer.id).querySelectorAll(`.${className}`)) as T[];
  }

  private onHelpMenuChangeHandler(event: VideoHelpMenuChangeEvent) {
    let helpMenuGroups = event.helpMenuGroups;
    if (helpMenuGroups.length > 0) {
      this.showElements(this._divHelp);
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
            Fullscreen.requestFullscreen(this._config.playerChroming.fullscreenChroming === FullscreenChroming.Enabled ? this._playerChromingDomController.mediaControllerElement : this._videoElement)
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
      htmlElement.className = `${this._domClasses.safeZone}${videoSafeZone.htmlClass ? ` ${videoSafeZone.htmlClass}` : ``}`;
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
    return this._playerChromingDomController.loadThumbnailVtt(vttUrl);
  }

  setWatermark(watermark: string) {
    if (this._divWatermark) {
      if (SvgUtil.isValidSVG(watermark)) {
        this._divWatermark.innerHTML = watermark;
      } else {
        this._divWatermark.innerText = watermark;
      }
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
    this._playerChromingDomController.attachVideoController(videoController);

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
              } else if (this._config.playerChroming.theme === 'STAMP') {
                this.showElements(this._divButtonOverlayPause);
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
              if (this._divHelpMenu && this.isShown(this._divHelpMenu)) {
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

    if (this._divButtonFullscreen) {
      fromEvent<MouseEvent>(this._divButtonFullscreen, 'click')
        .pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$))
        .subscribe({
          next: (event) => {
            this._videoController.toggleFullscreen();
          },
        });
    }

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

          this._divPlayer.classList.add(this._domClasses.playerDetached);
          this._playerChromingDomController.mediaControllerElement.classList.add(this._domClasses.playerDetached);
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

          this._divPlayer.classList.remove(this._domClasses.playerDetached);
          this._playerChromingDomController.mediaControllerElement.classList.remove(this._domClasses.playerDetached);
        }
      },
    });
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

  createMarkerTrack(config: MarkerTrackConfig): MarkerTrackApi {
    return this._playerChromingDomController.createMarkerTrack(config);
  }

  getProgressMarkerTrack(): TimeRangeMarkerTrackApi | undefined {
    return this._playerChromingDomController.getProgressMarkerTrack();
  }

  isCompactAudioTheme() {
    return this._config.playerChroming.theme === PlayerChromingTheme.Audio && this._config.playerChroming.themeConfig?.playerSize === AudioPlayerSize.Compact;
  }

  destroy() {
    if (this._divPlayer) {
      this._divPlayer.replaceChildren();
    }

    if (this._fullscreenChangeHandler) {
      Fullscreen.off('change', this._fullscreenChangeHandler);
    }

    nextCompleteSubject(this._videoEventBreaker$);
    nextCompleteSubject(this._destroyed$);

    this._playerChromingDomController.destroy();

    nullifier(this._videoController, this._videoElement);
  }
}
