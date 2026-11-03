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

import {MediaChromeButton} from 'media-chrome';
import type {VideoKeyframe, VideoKeyframeOptions} from '../../media';
import type {PlayerApi, PlayerDetachedApi} from '../../player';
import {DomUtil} from '../../dom/dom-util';
import {ChromingDomClasses} from '../chroming-dom';
import {ControlBarComponent, ControlBarComponentAttributes} from '../../control-bar/control-bar-component';

export const OmakaseKeyframeButtonAttributes = {
  AUDIO_SRC: 'audio-src',
  INACTIVE: 'inactive',
};

/**
 * Configuration of the keyframe capability
 */
export interface OmakaseKeyframeConfig {
  /**
   * Invoked with the keyframe extracted at the playhead. The capability is inactive while not set. The keyframe's `src` is
   * an object URL that the callback function owns, and can release with `URL.revokeObjectURL` once it's no longer needed.
   */
  callbackFn?: ((keyframe: VideoKeyframe) => void) | undefined;
  /** URL of an audio file played when a keyframe is extracted. Keyframes are extracted silently while not set */
  audioSrc?: string | undefined;
  /** Options of the extracted keyframes, e.g. their image format */
  keyframeOptions?: VideoKeyframeOptions | undefined;
}

export class OmakaseKeyframeButton extends ControlBarComponent(MediaChromeButton) {
  static get observedAttributes(): string[] {
    return [...super.observedAttributes, OmakaseKeyframeButtonAttributes.AUDIO_SRC];
  }

  private _player: PlayerApi | PlayerDetachedApi | undefined;
  private _callbackFn: ((keyframe: VideoKeyframe) => void) | undefined;
  private _keyframeOptions: VideoKeyframeOptions | undefined;
  private _audio: HTMLAudioElement | undefined;
  private _iconSpan: HTMLSpanElement | undefined;
  private _tooltip: HTMLElement | undefined;

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
  }

  get callbackFn() {
    return this._callbackFn;
  }

  set callbackFn(callbackFn: ((keyframe: VideoKeyframe) => void) | undefined) {
    this._callbackFn = callbackFn;
    this.updateActiveState();
  }

  get audioSrc(): string | undefined {
    return DomUtil.getAttribute(this, OmakaseKeyframeButtonAttributes.AUDIO_SRC, undefined) || undefined;
  }

  set audioSrc(value: string | undefined) {
    DomUtil.setAttribute(this, OmakaseKeyframeButtonAttributes.AUDIO_SRC, value);
  }

  get keyframeOptions() {
    return this._keyframeOptions;
  }

  set keyframeOptions(options: VideoKeyframeOptions | undefined) {
    this._keyframeOptions = options;
  }

  get active(): boolean {
    return this.enabled && !!this._callbackFn;
  }

  configure(config: OmakaseKeyframeConfig): void {
    this._keyframeOptions = config.keyframeOptions;
    this.audioSrc = config.audioSrc;
    this.callbackFn = config.callbackFn;
  }

  deactivate(): void {
    this.configure({});
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this._iconSpan) {
      this._iconSpan = document.createElement('span');
      this._iconSpan.className = ChromingDomClasses.mediaChromeKeyframe;
      this.appendChild(this._iconSpan);
    }
    if (!this._tooltip) {
      this._tooltip = document.createElement('media-tooltip');
      this._tooltip.textContent = 'Extract keyframe';
      this.appendChild(this._tooltip);
    }
    this.setAttribute('aria-label', 'extract keyframe');
    this.updateActiveState();
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakaseKeyframeButtonAttributes.AUDIO_SRC) {
      this.releaseAudio();
    } else if (name === ControlBarComponentAttributes.DISABLED) {
      this.updateActiveState();
    }
  }

  override handleClick(): void {
    const player = this._player;
    const callbackFn = this._callbackFn;
    if (this.active && player && callbackFn) {
      this.extractKeyframe(player, callbackFn);
    } else {
      super.handleClick(undefined);
    }
    this.blur();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.releaseAudio();
  }

  private extractKeyframe(player: PlayerApi | PlayerDetachedApi, callbackFn: (keyframe: VideoKeyframe) => void): void {
    if (!player.isMainMediaLoaded) {
      return;
    }
    this.playAudio();
    player.extractVideoKeyframe(this._keyframeOptions).subscribe({
      next: (keyframe) => callbackFn(keyframe),
      error: (error) => console.error(error),
    });
  }

  private playAudio(): void {
    const audioSrc = this.audioSrc;
    if (!audioSrc) {
      return;
    }
    if (!this._audio) {
      this._audio = new Audio(audioSrc);
      this._audio.preload = 'auto';
    }
    this._audio.currentTime = 0;
    this._audio.play().catch((error) => console.warn(error));
  }

  private releaseAudio(): void {
    if (this._audio) {
      this._audio.pause();
      this._audio.removeAttribute('src');
      this._audio.load();
      this._audio = void 0;
    }
  }

  private updateActiveState(): void {
    const active = this.active;
    this.toggleAttribute(OmakaseKeyframeButtonAttributes.INACTIVE, !active);
    if (this.enabled) {
      this.tabIndex = active ? 0 : -1;
    }
  }
}
