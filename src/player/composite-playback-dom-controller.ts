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

import {VirtualPlaybackDomController} from '../virtual/virtual-playback-dom-controller';
import type {PlayerDomController} from './player-controller-api';

/**
 * Media element of media slot media-chrome observes as media, for {@link CompositePlayerController}.
 *
 * Element is mounted along video element, video element stays visible - it shows main media picture also while reverse controller is active.
 * Element is transparent overlay that doesn't capture pointer events, it only takes media slot, so that media-chrome controls (ie. time range,
 * play button) follow composite controller at every playback rate, also while video element is paused and seeked in steps.
 * It is wired once, switching between forward and reverse controllers doesn't rewire media-chrome.
 *
 * Buffered time ranges are video element's, in main media time.
 */
export class CompositePlaybackDomController extends VirtualPlaybackDomController {
  protected _videoElement: HTMLVideoElement | undefined;
  /** Seconds video element time is ahead of main media time, ie. init segment time offset */
  protected _videoTimeOffset: () => number = () => 0;

  /**
   * Mounts element before video element, in its slot, ie. media slot in chroming media-theme. media-chrome's media-controller uses first element in media slot as media.
   */
  static mountAlongside(playerDomController: PlayerDomController): CompositePlaybackDomController {
    let videoElement = playerDomController.mainMediaVideoElement;
    if (!videoElement.parentElement) {
      throw new Error(`Video element is not attached to DOM`);
    }
    let domController = new CompositePlaybackDomController(videoElement.parentElement, playerDomController);
    domController._videoElement = videoElement;
    if (videoElement.slot) {
      domController._element.slot = videoElement.slot;
    }
    videoElement.parentElement.insertBefore(domController._element, videoElement);
    return domController;
  }

  constructor(parentElement: HTMLElement, delegate?: PlayerDomController) {
    super(parentElement, delegate);
    Object.assign(this._element.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      background: 'none',
    });
  }

  /** Video element time offset buffered time ranges are converted to main media time with. */
  setVideoTimeOffset(videoTimeOffset: () => number) {
    this._videoTimeOffset = videoTimeOffset;
  }

  protected override resolveBuffered(duration: number): TimeRanges {
    let buffered = this._videoElement?.buffered;
    if (!buffered) {
      return super.resolveBuffered(duration);
    }
    let offset = this._videoTimeOffset();
    return {
      length: buffered.length,
      start: (index: number) => Math.max(buffered.start(index) - offset, 0),
      end: (index: number) => Math.max(buffered.end(index) - offset, 0),
    };
  }

  /** Video element shows poster. */
  override setVideoPoster(poster: string): void {}

  override get mainMediaVideoElement(): HTMLVideoElement {
    if (!this._videoElement) {
      throw new Error(`Video element not mounted`);
    }
    return this._videoElement;
  }

  override destroy(): void {
    super.destroy();
    this._videoElement = void 0;
  }
}
