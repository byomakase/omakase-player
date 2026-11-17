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

import {Observable, takeUntil, throwError} from 'rxjs';
import {ObserverBreaker} from '../common/observer-breaker';
import type {PlayerController, PlayerControllerEvent, PlayerDomController} from '../player/player-controller-api';
import type {MediaRotationValue} from '../media';
import type {Alert} from '../session/alerts-api';
import type {VideoKeyframe, VideoKeyframeOptions} from '../media';
import type {Destroyable} from '../common/capabilities';

/**
 * {@link PlayerDomController} for virtual playback (playback without media element), backed by a single element.
 *
 * Element takes video element's place in media slot and renders virtual playback of attached {@link PlayerController}, see subclasses.
 * Chroming controls follow the player, not the element.
 *
 * Optional delegate {@link PlayerDomController} (ie. chroming) receives alerts, attach / detach and text rendering.
 */
export class VirtualPlaybackDomController implements PlayerDomController, Destroyable {
  protected _element: HTMLDivElement;
  protected _mediaRotation: MediaRotationValue = 0;

  protected _delegate: PlayerDomController | undefined;
  /**
   * Video element hidden by {@link mountOver}, restored on {@link destroy}
   * @protected
   */
  protected _hiddenVideoElement: HTMLVideoElement | undefined;
  protected _hiddenVideoElementDisplay = '';

  protected _controller: PlayerController | undefined;
  protected _controllerBreaker = new ObserverBreaker();

  /**
   * Mounts virtual playback element in place of delegate's video element. Video element is hidden until destroyed.
   *
   * Element is inserted before video element and takes its slot, ie. media slot in chroming media-theme.
   */
  static mountOver<T extends VirtualPlaybackDomController>(this: new (parentElement: HTMLElement, delegate?: PlayerDomController) => T, playerDomController: PlayerDomController): T {
    let videoElement = playerDomController.mainMediaVideoElement;
    if (!videoElement.parentElement) {
      throw new Error(`Video element is not attached to DOM`);
    }
    let domController = new this(videoElement.parentElement, playerDomController);
    // takes video element's slot, ie. media slot in chroming media-theme
    if (videoElement.slot) {
      domController._element.slot = videoElement.slot;
    }
    videoElement.parentElement.insertBefore(domController._element, videoElement);
    domController._hiddenVideoElement = videoElement;
    domController._hiddenVideoElementDisplay = videoElement.style.display;
    videoElement.style.display = 'none';
    return domController;
  }

  constructor(parentElement: HTMLElement, delegate?: PlayerDomController) {
    this._delegate = delegate;
    this._element = document.createElement('div');
    Object.assign(this._element.style, {
      width: '100%',
      height: '100%',
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    });
    parentElement.appendChild(this._element);
  }

  /**
   * Refreshes rendering for state that is resolved on wiring, ie. duration
   */
  refreshMediaState() {
    if (this._controller) {
      this.onMediaStateRefreshed(this._controller);
    }
  }

  /**
   * Binds element to controller, see {@link onControllerEvent}
   */
  attachController(controller: PlayerController) {
    this._controllerBreaker.break();
    this._controller = controller;
    controller.onEvent$.pipe(takeUntil(this._controllerBreaker.observer)).subscribe((event) => {
      this.onControllerEvent(controller, event);
    });
  }

  detachController() {
    this._controllerBreaker.break();
    this._controller = void 0;
  }

  /**
   * Hook for subclasses, called for every attached controller event
   * @protected
   */
  protected onControllerEvent(controller: PlayerController, event: PlayerControllerEvent): void {}

  /**
   * Hook for subclasses, called on {@link refreshMediaState} while controller is attached
   * @protected
   */
  protected onMediaStateRefreshed(controller: PlayerController): void {}

  get element(): HTMLDivElement {
    return this._element;
  }

  get mainMediaVideoElement(): HTMLVideoElement {
    throw new Error(`Virtual playback has no video element`);
  }

  get textMediaCaptionsElement(): HTMLElement {
    return this._delegate?.textMediaCaptionsElement ?? this._element;
  }

  get textImscElement(): HTMLElement {
    return this._delegate?.textImscElement ?? this._element;
  }

  get sidecarVideosElement(): HTMLElement {
    return this._delegate?.sidecarVideosElement ?? this._element;
  }

  get mediaRotation(): MediaRotationValue {
    return this._mediaRotation;
  }

  set mediaRotation(mediaRotation: MediaRotationValue) {
    this._mediaRotation = mediaRotation;
    this._element.style.transform = mediaRotation ? `rotate(${mediaRotation}deg)` : '';
  }

  resetMainMediaVideoElement(): void {}

  prepareForAttaching(hasMainMedia: boolean): void {
    this._delegate?.prepareForAttaching(hasMainMedia);
  }

  prepareForDetaching(): void {
    this._delegate?.prepareForDetaching();
  }

  setAttachDetachButtonEnabled(enabled: true): void {
    this._delegate?.setAttachDetachButtonEnabled(enabled);
  }

  setVideoPoster(poster: string): void {
    this._element.style.backgroundImage = `url("${poster}")`;
  }

  addAlert(alert: Alert): void {
    if (this._delegate) {
      this._delegate.addAlert(alert);
    } else {
      console.debug(`Virtual playback alert`, alert);
    }
  }

  removeAlert(alertId: Alert['id']): void {
    this._delegate?.removeAlert(alertId);
  }

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe> {
    return throwError(() => new Error(`Keyframe extraction not supported for virtual playback`));
  }

  destroy(): void {
    this._controllerBreaker.destroy();
    this._controller = void 0;
    this._element.remove();
    if (this._hiddenVideoElement) {
      this._hiddenVideoElement.style.display = this._hiddenVideoElementDisplay;
      this._hiddenVideoElement = void 0;
    }
    this._delegate = void 0;
  }
}
