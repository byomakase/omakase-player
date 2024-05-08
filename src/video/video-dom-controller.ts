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
import {fromEvent, Observable, Subject, take, takeUntil} from 'rxjs';
import {Destroyable, OmakaseTextTrack, OmakaseTextTrackCue} from '../types';
import {nextCompleteVoidSubject, nextCompleteVoidSubjects} from '../util/observable-util';
import {z} from 'zod';
import {VideoControllerApi} from './video-controller-api';
import {StringUtil} from '../util/string-util';
import {nullifier} from '../util/destroy-util';

const omakaseClasses = {
  player: 'omakase-player',
  playerWrapper: 'omakase-player-wrapper',
  video: 'omakase-video',
  videoControls: 'omakase-video-controls',
  buttonPlay: 'omakase-button-play',
  buttonPause: 'omakase-button-pause',
  buttonLoading: 'omakase-button-loading',
  buttonError: 'omakase-button-error',
  buttonReplay: 'omakase-button-replay',
  buttonHelp: 'omakase-help-button',
  help: 'omakase-help',
  helpMenu: 'omakase-help-menu',
  errorMessage: 'omakase-error-message',
  safeZoneWrapper: 'omakase-video-safe-zone-wrapper',
  safeZone: 'omakase-video-safe-zone',
}

export class VideoDomController implements Destroyable {
  private readonly _playerHTMLElementId: string;
  private readonly _divPlayer: HTMLElement;

  private _videoElementCrossorigin: string;

  private _videoController!: VideoControllerApi;
  private _videoEventBreaker$!: Subject<void>;

  private _videoElement!: HTMLVideoElement;
  private _divPlayerWrapper!: HTMLElement;
  private _divButtonPlay!: HTMLElement;
  private _divButtonPause!: HTMLElement;
  private _divButtonLoading!: HTMLElement;
  private _divButtonError!: HTMLElement;
  private _divButtonReplay!: HTMLElement;
  private _divButtonHelp!: HTMLElement;
  private _divHelp!: HTMLElement;
  private _divHelpMenu!: HTMLElement;
  private _divErrorMessage!: HTMLElement;
  private _divSafeZoneWrapper!: HTMLElement;

  private _showTemporaryOnMouseMoveTimeoutId?: ReturnType<typeof setTimeout>;

  constructor(playerHTMLElementId: string, videoElementCrossorigin: string, videoController: VideoControllerApi) {
    this._playerHTMLElementId = playerHTMLElementId;
    this._videoElementCrossorigin = videoElementCrossorigin;

    if (StringUtil.isNullUndefinedOrWhitespace(this._playerHTMLElementId)) {
      throw new Error(`Player <div> id not provided`)
    }

    this._divPlayer = this.getElementById<HTMLElement>(this._playerHTMLElementId);

    if (!this._divPlayer) {
      throw new Error(`DOM <div> for player not found. ID provided: ${this._playerHTMLElementId}`)
    }

    this.createDom();

    this.videoController = videoController;
  }

  private createDom() {
    this._divPlayer.classList.add(`${omakaseClasses.player}`);

    this._divPlayer.innerHTML =
      `<div class="${omakaseClasses.playerWrapper}">
    <video class="${omakaseClasses.video}"></video>

    <div class="${omakaseClasses.videoControls}">
        <div class="${omakaseClasses.safeZoneWrapper}">

        </div>
        <div class="omakase-overlay-buttons">
            <div class="${omakaseClasses.buttonPlay} omakase-video-overlay-button d-none"></div>
            <div class="${omakaseClasses.buttonPause} omakase-video-overlay-button d-none"></div>
            <div class="${omakaseClasses.buttonReplay} omakase-video-overlay-button d-none"></div>
            <div class="${omakaseClasses.buttonLoading} omakase-video-overlay-button d-none"></div>
            <div class="${omakaseClasses.buttonError} omakase-video-overlay-button d-none"></div>
        </div>
    </div>

    <div class="${omakaseClasses.help} d-none">
        <div class="omakase-help-dropdown">
          <button class="omakase-help-button d-none"></button>
          <div class="${omakaseClasses.helpMenu} d-none">
          </div>
        </div>
    </div>

    <div class="${omakaseClasses.errorMessage} d-none">
    </div>
</div>`

    this._videoElement = this.getPlayerElement<HTMLVideoElement>(omakaseClasses.video);
    this._videoElement.crossOrigin = this._videoElementCrossorigin;


    this._divPlayerWrapper = this.getPlayerElement<HTMLElement>(omakaseClasses.playerWrapper);
    this._divButtonPlay = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonPlay);
    this._divButtonPause = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonPause);
    this._divButtonLoading = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonLoading);
    this._divButtonError = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonError);
    this._divButtonReplay = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonReplay);
    this._divButtonHelp = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonHelp);
    this._divHelp = this.getPlayerElement<HTMLElement>(omakaseClasses.help);
    this._divHelpMenu = this.getPlayerElement<HTMLElement>(omakaseClasses.helpMenu);
    this._divErrorMessage = this.getPlayerElement<HTMLElement>(omakaseClasses.errorMessage);
    this._divSafeZoneWrapper = this.getPlayerElement<HTMLElement>(omakaseClasses.safeZoneWrapper);
  }

  private getElementById<T>(elementId: string): T {
    return document.getElementById(elementId) as T;
  }

  private getPlayerElement<T>(className: string): T {
    return this.getPlayerElements<T>(className)[0];
  }

  private getPlayerElements<T>(className: string): T[] {
    return Array.from(this.getElementById<HTMLElement>(this._playerHTMLElementId).querySelectorAll(`.${className}`)) as T[];
  }

  private showElements(...element: HTMLElement[]): VideoDomController {
    element.forEach(element => {
      element.classList.remove('d-none')
      element.classList.add('d-block')
    })
    return this;
  }

  private isShown(element: HTMLElement) {
    return element.classList.contains('d-block');
  }

  private hideElements(...element: HTMLElement[]): VideoDomController {
    element.forEach(element => {
      element.classList.remove('d-block')
      element.classList.add('d-none')
    })
    return this;
  }

  private helpChangeHandler() {
    let helpMenuGroups = this._videoController.getHelpMenuGroups();

    if (helpMenuGroups.length > 0) {
      this.showElements(this._divHelp)
      this._divHelpMenu.innerHTML = this._videoController.getHelpMenuGroups().map(helpMenuGroup => {
        let items = `${helpMenuGroup.items.map(helpMenuItem => `<div class="omakase-help-item"><span class="float-start">${helpMenuItem.name}</span><span class="float-end">${helpMenuItem.description}</span></div>`).join('')}`
        return `<div class="omakase-help-group">
                            <div class="omakase-help-group-title">
                              <span>${helpMenuGroup.name}</span>
                            </div>
                            ${items}
                        </div>
                        `
      }).join('');
    } else {
      this.hideElements(this._divHelp)
    }
  }

  isFullscreen(): boolean {
    if (Fullscreen.isFullscreenEnabled()) {
      return Fullscreen.isFullscreen();
    }
    return false;
  }

  toggleFullscreen() {
    try {
      if (Fullscreen.isFullscreenEnabled()) {
        if (this.isFullscreen()) {
          Fullscreen.exitFullscreen().then(() => {
          })
        } else {
          Fullscreen.requestFullscreen(this._videoElement).then(() => {
          })
        }
      }
    } catch (e) {
      console.trace(e);
    }
  }

  clearSafeZones() {
    this._divSafeZoneWrapper.innerHTML = '';
  }

  addSafeZone(options: {
    topRightBottomLeftPercent: number[],
    htmlClass?: string
  }): string {
    let id = `omakase-video-safe-zone-${this._divSafeZoneWrapper.children.length + 1}`;

    let topRightBottomLeftPercent: number[] = [
      options.topRightBottomLeftPercent[0] ? options.topRightBottomLeftPercent[0] : 0,
      options.topRightBottomLeftPercent[1] ? options.topRightBottomLeftPercent[1] : 0,
      options.topRightBottomLeftPercent[2] ? options.topRightBottomLeftPercent[2] : 0,
      options.topRightBottomLeftPercent[3] ? options.topRightBottomLeftPercent[3] : 0
    ]

    let htmlElement: HTMLElement = document.createElement('div');
    htmlElement.id = id;
    htmlElement.className = `${omakaseClasses.safeZone}${options.htmlClass ? ` ${options.htmlClass}` : ``}`;
    htmlElement.style.top = `${topRightBottomLeftPercent[0]}%`;
    htmlElement.style.right = `${topRightBottomLeftPercent[1]}%`;
    htmlElement.style.bottom = `${topRightBottomLeftPercent[2]}%`;
    htmlElement.style.left = `${topRightBottomLeftPercent[3]}%`;

    this._divSafeZoneWrapper.append(htmlElement);

    return id;
  }

  addSafeZoneWithAspectRatio(options: {
    aspectRatioText: string,
    scalePercent?: number,
    htmlClass?: string
  }) {
    let ratioSplitted = options.aspectRatioText.split('/');
    let aspectRatio = z.coerce.number().parse(ratioSplitted[0]) / z.coerce.number().parse(ratioSplitted[1]);

    let width = this._divSafeZoneWrapper.clientWidth;
    let height = this._divSafeZoneWrapper.clientHeight;

    let scalePercent = options.scalePercent ? options.scalePercent : 100;
    let safeZoneWidth: number;
    let safeZoneHeight: number;

    if (aspectRatio >= 1) {
      safeZoneWidth = width * (scalePercent / 100);
      safeZoneHeight = (height / aspectRatio) * (scalePercent / 100);
    } else {
      safeZoneWidth = height * aspectRatio * (scalePercent / 100);
      safeZoneHeight = height * (scalePercent / 100);
    }

    let yPercent = (((height - safeZoneHeight) / 2) / height) * 100;
    let xPercent = (((width - safeZoneWidth) / 2) / width) * 100;

    return this.addSafeZone({topRightBottomLeftPercent: [yPercent, xPercent, yPercent, xPercent], htmlClass: options.htmlClass});
  }

  removeSafeZone(id: string) {
    let element = this.getElementById<HTMLElement>(id);
    if (element) {
      element.remove();
    }
  }

  set videoController(videoController: VideoControllerApi) {
    this._videoController = videoController;

    // clean previous subscribers and listeners
    nextCompleteVoidSubject(this._videoEventBreaker$);

    this._videoEventBreaker$ = new Subject<void>();

    let allOverlayButtons = [this._divButtonPlay, this._divButtonPause, this._divButtonLoading, this._divButtonReplay, this._divButtonError];

    let clearShowTemporaryOnMouseMoveTimeoutId = () => {
      if (this._showTemporaryOnMouseMoveTimeoutId) {
        clearTimeout(this._showTemporaryOnMouseMoveTimeoutId);
      }
    }

    fromEvent<MouseEvent>(this._divPlayerWrapper, 'mousemove').pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      if (this._videoController.isVideoLoaded() && !(this._videoController.getPlaybackState()!.ended || this._videoController.getPlaybackState()!.waiting || this._videoController.getPlaybackState()!.seeking)) {
        let playControlToShow = this._videoController.isPlaying() ? this._divButtonPause : this._divButtonPlay;
        clearShowTemporaryOnMouseMoveTimeoutId();
        this.hideElements(this._divButtonPause, this._divButtonPlay)
          .showElements(playControlToShow, this._divButtonHelp)

        this._showTemporaryOnMouseMoveTimeoutId = setTimeout(() => {
          this.hideElements(playControlToShow)
          if (!this.isShown(this._divHelpMenu)) {
            this.hideElements(this._divButtonHelp, this._divHelpMenu)
          }
        }, 1000)
      }
    })

    fromEvent<MouseEvent>(this._divPlayerWrapper, 'mouseleave').pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.hideElements(this._divButtonPlay, this._divButtonPause)
      this.hideElements(this._divButtonHelp, this._divHelpMenu)
    })

    fromEvent<MouseEvent>(this._divPlayerWrapper, 'click').pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      if (event.target !== this._divButtonHelp && event.target !== this._divButtonError && event.target !== this._divErrorMessage) {
        if (!this._videoController.isFullscreen()) {
          this._videoController.togglePlayPause()
        }
      }
      // if (event.target === this._videoElement || event.target === this._divButtonPlay || event.target === this._divButtonPause || event.target === this._divButtonReplay || event.target === this._divButtonLoading) {
      //   this._videoController.togglePlayPause()
      // }
    })

    // prevents video context menu
    fromEvent<MouseEvent>(this._videoElement, 'contextmenu').pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      event.preventDefault();
    })
    this._videoElement.controls = false;

    this._videoController.onVideoLoading$.pipe(takeUntil(this._videoEventBreaker$)).subscribe(event => {
      this.hideElements(...allOverlayButtons)
        .hideElements(this._divErrorMessage)
        .showElements(this._divButtonLoading)
    })

    this._videoController.onVideoLoaded$.pipe(takeUntil(this._videoEventBreaker$)).subscribe(videoLoaded => {
      this.hideElements(...allOverlayButtons)
        .hideElements(this._divErrorMessage)
      if (!videoLoaded) {
        this.showElements(this._divButtonLoading)
      }
    })

    this._videoController.onPlaybackState$.pipe(takeUntil(this._videoEventBreaker$)).subscribe(state => {
      clearShowTemporaryOnMouseMoveTimeoutId();
      if (state.waiting && state.playing) {
        this.hideElements(...allOverlayButtons)
          .hideElements(this._divErrorMessage)
          .showElements(this._divButtonLoading)
      } else if (state.playing) {
        this.hideElements(...allOverlayButtons)
          .hideElements(this._divErrorMessage)
        if (state.seeking && state.waiting) {
          this.showElements(this._divButtonLoading)
        }
      } else if (state.paused) {
        this.hideElements(...allOverlayButtons)
          .hideElements(this._divErrorMessage)
        if (state.seeking && state.waiting) {
          this.showElements(this._divButtonLoading)
        } else if (state.ended) {
          this.showElements(this._divButtonReplay)
        }
      } else if (state.seeking && state.waiting) {
        this.hideElements(...allOverlayButtons)
          .hideElements(this._divErrorMessage)
          .showElements(this._divButtonLoading)
      }
    })

    this._videoController.onVideoError$.pipe(takeUntil(this._videoEventBreaker$)).subscribe(event => {
      this.hideElements(...allOverlayButtons)
        .showElements(this._divErrorMessage, this._divButtonError)
      this._divErrorMessage.innerHTML = event.message ? event.message : '';
    })

    // help menu
    fromEvent<MouseEvent>(this._divButtonHelp, 'click').pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      if (event.target === this._divButtonHelp) {
        if (this.isShown(this._divHelpMenu)) {
          this.hideElements(this._divHelpMenu)
        } else {
          this.showElements(this._divHelpMenu)
        }
      }
    })

    this._videoController.onHelpMenuChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe(() => {
      this.helpChangeHandler()
    })
  }

  get videoElement(): HTMLVideoElement {
    return this._videoElement;
  }

  destroy() {
    nextCompleteVoidSubjects(this._videoEventBreaker$);

    if (this._divPlayer) {
      this._divPlayer.replaceChildren();
    }

    nullifier(
      this._videoController,
      this._videoElement
    )
  }


  private static createHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack<OmakaseTextTrackCue>): HTMLTrackElement {
    let element: HTMLTrackElement = document.createElement<'track'>('track');
    element.kind = omakaseTextTrack.kind;
    element.id = omakaseTextTrack.id;
    element.label = omakaseTextTrack.label;
    element.srclang = omakaseTextTrack.language;
    element.src = omakaseTextTrack.src;
    element.default = omakaseTextTrack.default;
    return element;
  }

  appendHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack<OmakaseTextTrackCue>): Observable<HTMLTrackElement | undefined> {
    return new Observable<HTMLTrackElement>(o$ => {
      let track = VideoDomController.createHTMLTrackElement(omakaseTextTrack);

      this._videoElement.appendChild(track);

      let textTrack = this.getTextTrackById(track.id)
      if (textTrack) {
        textTrack.mode = 'hidden'; // this line somehow triggers cues loading and thus we can catch 'load' event and complete the observable
      } else {
        console.debug('Something went wrong adding subtitles tracks')

        o$.next(void 0);
        o$.complete();
      }

      fromEvent(track, 'load').pipe(take(1)).subscribe({
        next: (event) => {
          o$.next(track);
          o$.complete();
        }
      })
    })
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
      this._videoElement.querySelectorAll<'track'>('track').forEach(trackElement => {
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
