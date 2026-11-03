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
import {type PlayerController, type PlayerControllerEvent, PlayerControllerEventType, type PlayerDomController} from '../player/player-controller-api';
import type {MediaRotationValue} from '../media';
import type {Alert} from '../session/alerts-api';
import type {VideoKeyframe, VideoKeyframeOptions} from '../media';
import type {Destroyable} from '../common/capabilities';

/**
 * HTMLMediaElement events dispatched on virtual playback element for each controller event
 */
const MEDIA_ELEMENT_EVENTS: Partial<Record<PlayerControllerEventType, string[]>> = {
  [PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS]: ['timeupdate'],
  [PlayerControllerEventType.PLAYER_CONTROLLER_PLAY]: ['play', 'playing'],
  [PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE]: ['pause', 'timeupdate'],
  [PlayerControllerEventType.PLAYER_CONTROLLER_ENDED]: ['timeupdate', 'pause', 'ended'],
  [PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING]: ['seeking', 'waiting'],
  [PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED]: ['timeupdate', 'seeked', 'playing'],
  [PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE]: ['ratechange'],
};

/**
 * Minimal TimeRanges covering [0, end]
 */
const createTimeRanges = (end: number): TimeRanges => {
  let length = Number.isFinite(end) && end > 0 ? 1 : 0;
  return {
    length,
    start: () => 0,
    end: () => end,
  };
};

/**
 * {@link PlayerDomController} for virtual playback (playback without media element), backed by a single element.
 *
 * Element exposes subset of HTMLMediaElement API backed by attached {@link PlayerController}, so media-chrome controls
 * (ie. time range) observe and control virtual playback as any other media element.
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
   * Element is inserted before video element and takes its slot, so media-chrome's media-controller
   * (which uses first element in media slot) observes it as media.
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
    this.defineMediaElementApi();
    parentElement.appendChild(this._element);
  }

  /**
   * Exposes subset of HTMLMediaElement API on element, backed by attached controller
   */
  protected defineMediaElementApi() {
    let controllerValue = <T>(fn: (controller: PlayerController) => T, defaultValue: T): T => {
      try {
        return this._controller ? fn(this._controller) : defaultValue;
      } catch (e) {
        // controller not wired yet
        return defaultValue;
      }
    };
    let duration = () => controllerValue((p) => p.getDuration(), Number.NaN);

    Object.defineProperties(this._element, {
      duration: {get: duration},
      currentTime: {
        get: () => controllerValue((p) => p.getCurrentTime(), 0),
        set: (value: number) => this._controller?.seekTo(value).subscribe(),
      },
      paused: {get: () => controllerValue((p) => !p.mediaElementPlayback!.playing, true)},
      ended: {get: () => controllerValue((p) => p.mediaElementPlayback!.ended, false)},
      seeking: {get: () => controllerValue((p) => p.mediaElementPlayback!.seeking, false)},
      playbackRate: {
        get: () => controllerValue((p) => p.playbackRate, 1),
        set: (value: number) => this._controller?.setPlaybackRate(value).subscribe(),
      },
      // seeking drops below HAVE_FUTURE_DATA, so media-chrome stops interpolating time range until seeked
      readyState: {
        get: () =>
          controllerValue(
            (p) => (p.mediaElementPlayback ? (p.mediaElementPlayback.seeking ? HTMLMediaElement.HAVE_METADATA : HTMLMediaElement.HAVE_ENOUGH_DATA) : HTMLMediaElement.HAVE_NOTHING),
            HTMLMediaElement.HAVE_NOTHING
          ),
      },
      seekable: {get: () => createTimeRanges(duration())},
      buffered: {get: () => this.resolveBuffered(duration())},
      play: {
        value: () =>
          new Promise<void>((resolve, reject) => {
            this._controller ? this._controller.play().subscribe({next: () => resolve(), error: reject}) : reject(new Error(`Controller not attached`));
          }),
      },
      pause: {value: () => this._controller?.pause().subscribe()},
    });
  }

  /**
   * Buffered time ranges exposed on element, virtual media is buffered whole by default
   * @protected
   */
  protected resolveBuffered(duration: number): TimeRanges {
    return createTimeRanges(duration);
  }

  /**
   * Dispatches media element events for state that is resolved on wiring, ie. duration
   */
  refreshMediaState() {
    ['loadedmetadata', 'durationchange', 'progress', 'ratechange', 'timeupdate', 'playing'].forEach((type) => this._element.dispatchEvent(new Event(type)));
    if (this._controller) {
      this.onMediaStateRefreshed(this._controller);
    }
  }

  /**
   * Binds element to controller, controller events are dispatched as media element events
   */
  attachController(controller: PlayerController) {
    this._controllerBreaker.break();
    this._controller = controller;
    controller.onEvent$.pipe(takeUntil(this._controllerBreaker.observer)).subscribe((event) => {
      this.onControllerEvent(controller, event);
      MEDIA_ELEMENT_EVENTS[event.type]?.forEach((type) => this._element.dispatchEvent(new Event(type)));
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
