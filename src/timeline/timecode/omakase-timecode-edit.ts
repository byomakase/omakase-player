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

import type {PlayerApi} from '../../player';
import {MediaTemporalFormat} from '../../common';

export class OmakaseTimecodeEdit extends HTMLElement {
  private _timecodeText: string | undefined;
  private _container: HTMLDivElement;
  private _input: HTMLInputElement;

  private _minValue: string | undefined;
  private _maxValue: string | undefined;

  private _player?: PlayerApi | undefined;
  private _submitHandlerFn?: (timecodeText: string) => void;
  private _blurHandlerFn?: () => void;

  constructor() {
    super();

    this._container = document.createElement('div');
    this._container.classList.add('omakase-timecode-edit');

    this._input = document.createElement('input');
    this._input.type = 'text';

    this._input.classList.add('omakase-timecode-edit-input');

    this._input.addEventListener('keyup', (event) => {
      this.handleKeyUp(event);
    });
    this._input.addEventListener('keydown', (event) => {
      this.handleKeyDown(event);
    });
    this._input.addEventListener('blur', () => {
      this._blurHandlerFn?.();
    });

    this._container.appendChild(this._input);

    setTimeout(() => {
      this._input.focus();
    });
  }

  public connectedCallback() {
    this.appendChild(this._container);
    this.appendStyle();
  }

  private appendStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .omakase-timecode-edit {
        display: inline-block;
        width: 90%;
      }

      .omakase-timecode-edit-input-invalid {
        border-color: red;
      }

      .omakase-timecode-edit-input {
        outline: none;
        width: 100%;
        padding: 4px;
        font-size: 16px;
      }

      input {
        width: 100%;
        box-sizing: border-box;
      }
    `;
    this.appendChild(style);
  }

  set player(player: PlayerApi) {
    this._player = player;
  }

  get value(): string | undefined {
    return this._timecodeText;
  }

  set value(timecodeText: string) {
    this.setTimecode(timecodeText);
  }

  get minValue(): string | undefined {
    return this._minValue;
  }

  set minValue(minValue: string | undefined) {
    this._minValue = minValue;
  }

  get maxValue(): string | undefined {
    return this._maxValue;
  }

  set maxValue(maxValue: string | undefined) {
    this._maxValue = maxValue;
  }

  set submitHandler(submitHandlerFn: (timecodeText: string) => void) {
    this._submitHandlerFn = submitHandlerFn;
  }

  set blurHandler(blurHandlerFn: () => void) {
    this._blurHandlerFn = blurHandlerFn;
  }

  public override focus(options?: FocusOptions): void {
    this._input.focus(options);
  }

  private handleKeyUp(event: KeyboardEvent) {
    event.preventDefault();
    if (this._player && this._player.mainMedia && this._player.mainMedia.duration !== undefined && !this._input.disabled) {
      if (event.key === 'ArrowUp') {
        this.stepTimecode(1);
      } else if (event.key === 'ArrowDown') {
        this.stepTimecode(-1);
      } else {
        const target = event.target as HTMLInputElement;
        this.setTimecode(target.value);
      }
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
    } else if (event.key === 'Enter' && this.isTimecodeValid() && !this._input.disabled) {
      // this.dispatchEvent(new Event('submit'));

      this._submitHandlerFn?.(this._input.value);
    }
  }

  private stepTimecode(stepFrames: number) {
    if (this._timecodeText) {
      let currentFrame = this._player!.convertTime(this._timecodeText, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.FRAME_COUNT);
      let nextFrame = currentFrame + stepFrames;
      let nextSeconds = this._player!.convertTime(nextFrame, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);

      if (nextSeconds >= 0 && nextSeconds <= this._player!.mainMedia!.duration!) {
        this.setTimecode(this._player!.convertTime(nextFrame, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.TIMECODE));
      }
    }
  }

  private setTimecode(timecodeText: string) {
    this._timecodeText = timecodeText;
    this._input.value = timecodeText;
    this.validate();
  }

  private validate() {
    if (this.isTimecodeValid()) {
      this._input.classList.remove('omakase-timecode-edit-input-invalid');
    } else {
      this._input.classList.add('omakase-timecode-edit-input-invalid');
    }
  }

  public isTimecodeValid() {
    if (this._timecodeText && ((this._minValue && this._timecodeText < this._minValue) || (this._maxValue && this._timecodeText > this._maxValue))) {
      return false;
    }
    if (this._player?.mainMedia && this._player.mainMedia.duration && this._timecodeText) {
      try {
        let timecodeEditSeconds = this._player.convertTime(this._timecodeText, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS);
        return timecodeEditSeconds >= 0 && timecodeEditSeconds <= this._player.mainMedia.duration;
      } catch (e) {
        return false;
      }
    } else {
      return false;
    }
  }
}
