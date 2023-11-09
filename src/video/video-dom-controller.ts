/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 *
 */

import {Fullscreen} from "../dom/fullscreen";
import {fromEvent, Observable, Subject, takeUntil} from "rxjs";
import {Destroyable, OmakaseTextTrack, OmakaseTextTrackCue} from "../types";
import {nextCompleteVoidSubject, nextCompleteVoidSubjects} from "../util/observable-util";
import {z} from "zod";
import {VideoControllerApi} from "./video-controller-api";

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

    private _videoElement: HTMLVideoElement;
    private _videoElementCrossorigin: string;

    private _videoController: VideoControllerApi;
    private videoEventBreaker$: Subject<void>;

    private showTemporaryOnMouseMoveTimeoutId: ReturnType<typeof setTimeout>;

    private readonly divPlayer: HTMLElement;
    private divPlayerWrapper: HTMLElement;
    private divButtonPlay: HTMLElement;
    private divButtonPause: HTMLElement;
    private divButtonLoading: HTMLElement;
    private divButtonError: HTMLElement;
    private divButtonReplay: HTMLElement;

    private divButtonHelp: HTMLElement;
    private divHelp: HTMLElement;
    private divHelpMenu: HTMLElement;

    private divErrorMessage: HTMLElement;

    private divSafeZoneWrapper: HTMLElement;

    constructor(playerHTMLElementId: string, videoElementCrossorigin: string, videoController: VideoControllerApi) {
        this._playerHTMLElementId = playerHTMLElementId;
        this._videoElementCrossorigin = videoElementCrossorigin;

        this.divPlayer = this.getElementById<HTMLElement>(this._playerHTMLElementId);
        this.createDom();

        this.videoController = videoController;
    }

    private createDom() {
        this.divPlayer.classList.add(`${omakaseClasses.player}`);

        this.divPlayer.innerHTML =
            `<div class="${omakaseClasses.playerWrapper}">
    <video class="${omakaseClasses.video}"></video>

    <div class="${omakaseClasses.help} d-none">
        <div class="omakase-help-dropdown">
          <button class="omakase-help-button d-none"></button>
          <div class="${omakaseClasses.helpMenu} d-none">
          </div>
        </div>
    </div>

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

    <div class="${omakaseClasses.errorMessage} d-none">
    </div>
</div>`

        this._videoElement = this.getPlayerElement<HTMLVideoElement>(omakaseClasses.video);
        this._videoElement.crossOrigin = this._videoElementCrossorigin;


        this.divPlayerWrapper = this.getPlayerElement<HTMLElement>(omakaseClasses.playerWrapper);
        this.divButtonPlay = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonPlay);
        this.divButtonPause = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonPause);
        this.divButtonLoading = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonLoading);
        this.divButtonError = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonError);
        this.divButtonReplay = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonReplay);
        this.divButtonHelp = this.getPlayerElement<HTMLElement>(omakaseClasses.buttonHelp);
        this.divHelp = this.getPlayerElement<HTMLElement>(omakaseClasses.help);
        this.divHelpMenu = this.getPlayerElement<HTMLElement>(omakaseClasses.helpMenu);
        this.divErrorMessage = this.getPlayerElement<HTMLElement>(omakaseClasses.errorMessage);
        this.divSafeZoneWrapper = this.getPlayerElement<HTMLElement>(omakaseClasses.safeZoneWrapper);
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
            this.showElements(this.divHelp)
            this.divHelpMenu.innerHTML = this._videoController.getHelpMenuGroups().map(helpMenuGroup => {
                let items = `${helpMenuGroup.items.map(helpMenuItem => `<div class="omakase-help-item"><span class="float-start">${helpMenuItem.name}</span><span class="float-end">${helpMenuItem.description}</span></div>`).join('')}`
                return `<div class="omakase-help-group">
                            <span class="omakase-help-group-title">${helpMenuGroup.name}</span>
                            ${items}
                        </div>
                        `
            }).join('');
        } else {
            this.hideElements(this.divHelp)
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
        this.divSafeZoneWrapper.innerHTML = '';
    }

    addSafeZone(options: {
        topPercent: number,
        bottomPercent: number,
        leftPercent: number,
        rightPercent: number;
        htmlClass?: string
    }): string {
        let id = `omakase-video-safe-zone-${this.divSafeZoneWrapper.children.length + 1}`;

        let htmlElement: HTMLElement = document.createElement('div');
        htmlElement.id = id;
        htmlElement.className = `${omakaseClasses.safeZone}${options.htmlClass ? ` ${options.htmlClass}` : ``}`;
        htmlElement.style.top = `${options.topPercent}%`;
        htmlElement.style.bottom = `${options.bottomPercent}%`;
        htmlElement.style.left = `${options.leftPercent}%`;
        htmlElement.style.right = `${options.rightPercent}%`;
        this.divSafeZoneWrapper.append(htmlElement);

        return id;
    }

    addSafeZoneWithAspectRatio(options: {
        aspectRatioText: string,
        scalePercent?: number,
        htmlClass?: string
    }) {
        let ratioSplitted = options.aspectRatioText.split('/');
        let aspectRatio = z.coerce.number().parse(ratioSplitted[0]) / z.coerce.number().parse(ratioSplitted[1]);

        let width = this.divSafeZoneWrapper.clientWidth;
        let height = this.divSafeZoneWrapper.clientHeight;

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

        return this.addSafeZone({topPercent: yPercent, bottomPercent: yPercent, leftPercent: xPercent, rightPercent: xPercent, htmlClass: options.htmlClass});
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
        nextCompleteVoidSubject(this.videoEventBreaker$);

        this.videoEventBreaker$ = new Subject<void>();

        let allOverlayButtons = [this.divButtonPlay, this.divButtonPause, this.divButtonLoading, this.divButtonReplay, this.divButtonError];

        let clearShowTemporaryOnMouseMoveTimeoutId = () => {
            if (this.showTemporaryOnMouseMoveTimeoutId) {
                clearTimeout(this.showTemporaryOnMouseMoveTimeoutId);
            }
        }

        fromEvent<MouseEvent>(this.divPlayerWrapper, 'mousemove').pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
            if (this._videoController.isVideoLoaded() && !(this._videoController.getPlaybackState().ended || this._videoController.getPlaybackState().waiting || this._videoController.getPlaybackState().seeking)) {
                let playControlToShow = this._videoController.isPlaying() ? this.divButtonPause : this.divButtonPlay;
                clearShowTemporaryOnMouseMoveTimeoutId();
                this.hideElements(this.divButtonPause, this.divButtonPlay)
                    .showElements(playControlToShow, this.divButtonHelp)

                this.showTemporaryOnMouseMoveTimeoutId = setTimeout(() => {
                    this.hideElements(playControlToShow)
                    if (!this.isShown(this.divHelpMenu)) {
                        this.hideElements(this.divButtonHelp, this.divHelpMenu)
                    }
                }, 1000)
            }
        })

        fromEvent<MouseEvent>(this.divPlayerWrapper, 'mouseleave').pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
            this.hideElements(this.divButtonPlay, this.divButtonPause)
            this.hideElements(this.divButtonHelp, this.divHelpMenu)
        })

        fromEvent<MouseEvent>(this.divPlayerWrapper, 'click').pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
            if (event.target === this._videoElement || event.target === this.divButtonPlay || event.target === this.divButtonPause || event.target === this.divButtonReplay || event.target === this.divButtonLoading) {
                this._videoController.togglePlayPause()
            }
        })

        // prevents video context menu
        fromEvent<MouseEvent>(this._videoElement, 'contextmenu').pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
            event.preventDefault();
        })
        this._videoElement.controls = false;

        this._videoController.onVideoLoading$.pipe(takeUntil(this.videoEventBreaker$)).subscribe(event => {
            this.hideElements(...allOverlayButtons)
                .hideElements(this.divErrorMessage)
                .showElements(this.divButtonLoading)
        })

        this._videoController.onVideoLoaded$.pipe(takeUntil(this.videoEventBreaker$)).subscribe(videoLoaded => {
            this.hideElements(...allOverlayButtons)
                .hideElements(this.divErrorMessage)
            if (!videoLoaded) {
                this.showElements(this.divButtonLoading)
            }
        })

        this._videoController.onPlaybackState$.pipe(takeUntil(this.videoEventBreaker$)).subscribe(state => {
            clearShowTemporaryOnMouseMoveTimeoutId();
            if (state.waiting && state.playing) {
                this.hideElements(...allOverlayButtons)
                    .hideElements(this.divErrorMessage)
                    .showElements(this.divButtonLoading)
            } else if (state.playing) {
                this.hideElements(...allOverlayButtons)
                    .hideElements(this.divErrorMessage)
                if (state.seeking && state.waiting) {
                    this.showElements(this.divButtonLoading)
                }
            } else if (state.paused) {
                this.hideElements(...allOverlayButtons)
                    .hideElements(this.divErrorMessage)
                if (state.seeking && state.waiting) {
                    this.showElements(this.divButtonLoading)
                } else if (state.ended) {
                    this.showElements(this.divButtonReplay)
                }
            } else if (state.seeking && state.waiting) {
                this.hideElements(...allOverlayButtons)
                    .hideElements(this.divErrorMessage)
                    .showElements(this.divButtonLoading)
            }
        })

        this._videoController.onVideoError$.pipe(takeUntil(this.videoEventBreaker$)).subscribe(event => {
            this.hideElements(...allOverlayButtons)
                .showElements(this.divErrorMessage, this.divButtonError)
            this.divErrorMessage.innerHTML = event.message
        })

        // help menu
        fromEvent<MouseEvent>(this.divButtonHelp, 'click').pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
            if (event.target === this.divButtonHelp) {
                if (this.isShown(this.divHelpMenu)) {
                    this.hideElements(this.divHelpMenu)
                } else {
                    this.showElements(this.divHelpMenu)
                }
            }
        })

        this._videoController.onHelpMenuChange$.pipe(takeUntil(this.videoEventBreaker$)).subscribe(() => {
            this.helpChangeHandler()
        })
    }

    get videoElement(): HTMLVideoElement {
        return this._videoElement;
    }

    destroy() {
        nextCompleteVoidSubjects(this.videoEventBreaker$);

        if (this.divPlayer) {
            this.divPlayer.replaceChildren();
        }

        this._videoController = null;
        this._videoElement = null;
    }


    private static createHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack<OmakaseTextTrackCue>): HTMLTrackElement {
        let element: HTMLTrackElement = document.createElement<'track'>("track");
        element.kind = omakaseTextTrack.kind;
        element.id = omakaseTextTrack.id;
        element.label = omakaseTextTrack.label;
        element.srclang = omakaseTextTrack.language;
        element.src = omakaseTextTrack.src;
        element.default = omakaseTextTrack.default;
        return element;
    }

    appendHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack<OmakaseTextTrackCue>): Observable<HTMLTrackElement> {
        return new Observable<HTMLTrackElement>(o$ => {
            let track = VideoDomController.createHTMLTrackElement(omakaseTextTrack);
            this._videoElement.appendChild(track);

            o$.next(track);
            o$.complete();
        })
    }

    getTextTrackList(): TextTrackList | undefined {
        return this._videoElement ? this._videoElement.textTracks : void 0;
    }

    getTextTrackById(id: string): TextTrack | undefined {
        return this._videoElement ? this._videoElement.textTracks.getTrackById(id) : void 0;
    }

    /***
     * https://github.com/whatwg/html/issues/1921
     * https://github.com/web-platform-tests/wpt/pull/6594
     *
     * @param id
     * @private
     */
    removeTextTrackById(id: string): boolean {
        // there is not remove track method in HTML TextTrack API, we have to fake it
        let domTextTrack: TextTrack = this.getTextTrackById(id);
        if (domTextTrack) {
            this._videoElement.querySelectorAll<'track'>('track').forEach(trackElement => {
                if (trackElement.getAttribute('id') === id) {
                    trackElement.parentElement.removeChild(trackElement);
                }
            });
            return true;
        } else {
            return false;
        }
    }
}
