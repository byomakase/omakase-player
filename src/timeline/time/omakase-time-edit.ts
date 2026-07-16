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

import type {PlayerCommonApi} from '../../player';
import {MediaTemporalFormat} from '../../common';
import {BehaviorSubject} from 'rxjs';

export const OmakaseTimeEditAttributes = {
  FORMAT: 'format',
};

export class OmakaseTimeEdit extends HTMLElement {
  private _timeString: string | undefined;
  private _container: HTMLDivElement;
  private _input: HTMLInputElement;

  private _minValue: string | undefined;
  private _maxValue: string | undefined;

  private _player?: PlayerCommonApi | undefined;
  private _submitHandlerFn?: (timeString: string) => void;
  private _blurHandlerFn?: () => void;
  private _isValid$ = new BehaviorSubject<boolean>(true);

  constructor() {
    super();

    this._container = document.createElement('div');
    this._container.classList.add('omakase-time-edit');

    this._input = document.createElement('input');
    this._input.type = 'text';

    this._input.classList.add('omakase-time-edit-input');

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
  }

  get player(): PlayerCommonApi | undefined {
    return this._player;
  }

  set player(player: PlayerCommonApi) {
    this._player = player;
  }

  get value(): string | undefined {
    return this._timeString;
  }

  set value(timecodeText: string) {
    this.setTime(timecodeText);
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

  get isValid$() {
    return this._isValid$;
  }

  set submitHandler(submitHandlerFn: (timeString: string) => void) {
    this._submitHandlerFn = submitHandlerFn;
  }

  set blurHandler(blurHandlerFn: () => void) {
    this._blurHandlerFn = blurHandlerFn;
  }

  public override focus(options?: FocusOptions): void {
    this._input.focus(options);
  }

  private get _format(): MediaTemporalFormat {
    const attr = this.getAttribute(OmakaseTimeEditAttributes.FORMAT);
    if (attr && Object.values(MediaTemporalFormat).includes(attr as MediaTemporalFormat)) {
      return attr as MediaTemporalFormat;
    }
    return MediaTemporalFormat.TIMECODE;
  }

  private get _isNumericFormat(): boolean {
    const format = this._format;
    return format === MediaTemporalFormat.SECONDS || format === MediaTemporalFormat.FRAME_COUNT || format === MediaTemporalFormat.PERCENT;
  }

  private handleKeyUp(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (this._player && this._player.isMainMediaLoaded && !this._input.disabled) {
      if (event.key === 'ArrowUp') {
        this.stepTime(1);
      } else if (event.key === 'ArrowDown') {
        this.stepTime(-1);
      } else {
        const target = event.target as HTMLInputElement;
        this.setTime(target.value);
      }
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.stopPropagation();
    } else if (event.key === 'Enter' && this.isTimeValid() && !this._input.disabled) {
      // this.dispatchEvent(new Event('submit'));

      this._submitHandlerFn?.(this._input.value);
    }
  }

  private stepTime(direction: number) {
    if (!this._timeString) {
      return;
    }

    const format = this._format;
    const duration = this._player!.getDuration();

    if (format === MediaTemporalFormat.TIMECODE || format === MediaTemporalFormat.FRAME_COUNT) {
      let currentFrame: number;
      if (format === MediaTemporalFormat.FRAME_COUNT) {
        currentFrame = parseFloat(this._timeString);
        if (isNaN(currentFrame)) return;
      } else {
        currentFrame = this._player!.convertTime(this._timeString, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.FRAME_COUNT);
      }

      const nextFrame = currentFrame + direction;
      const nextSeconds = this._player!.convertTime(nextFrame, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);

      if (nextSeconds >= 0 && nextSeconds <= duration) {
        if (format === MediaTemporalFormat.FRAME_COUNT) {
          this.setTime(String(nextFrame));
        } else {
          this.setTime(this._player!.convertTime(nextFrame, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.TIMECODE));
        }
      }
    } else if (format === MediaTemporalFormat.SECONDS || format === MediaTemporalFormat.MEDIA_TIME || format === MediaTemporalFormat.COUNTDOWN_MEDIA_TIME) {
      let currentSeconds: number;
      if (format === MediaTemporalFormat.SECONDS) {
        currentSeconds = parseFloat(this._timeString);
        if (isNaN(currentSeconds)) return;
      } else {
        currentSeconds = this._player!.convertTime(this._timeString, format as MediaTemporalFormat.MEDIA_TIME | MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.SECONDS);
      }

      const nextSeconds = currentSeconds + direction;

      if (nextSeconds >= 0 && nextSeconds <= duration) {
        if (format === MediaTemporalFormat.SECONDS) {
          this.setTime(String(nextSeconds));
        } else {
          this.setTime(this._player!.convertTime(nextSeconds, MediaTemporalFormat.SECONDS, format as MediaTemporalFormat.MEDIA_TIME | MediaTemporalFormat.COUNTDOWN_MEDIA_TIME));
        }
      }
    } else if (format === MediaTemporalFormat.PERCENT) {
      const currentPercent = parseFloat(this._timeString);
      if (isNaN(currentPercent)) return;

      const nextPercent = currentPercent + direction;

      if (nextPercent >= 0 && nextPercent <= 100) {
        this.setTime(String(nextPercent));
      }
    }
  }

  private setTime(timeString: string) {
    this._timeString = timeString;
    this._input.value = timeString;
    this.validate();
  }

  private validate() {
    if (this.isTimeValid()) {
      this._input.classList.remove('omakase-time-edit-input-invalid');
      this._isValid$.next(true);
    } else {
      this._input.classList.add('omakase-time-edit-input-invalid');
      this._isValid$.next(false);
    }
  }

  public isTimeValid() {
    if (this._timeString && ((this._minValue && this._timeString < this._minValue) || (this._maxValue && this._timeString > this._maxValue))) {
      return false;
    }
    if (this._player?.isMainMediaLoaded && this._timeString) {
      try {
        const format = this._format;
        let seconds: number;

        if (this._isNumericFormat) {
          const numValue = parseFloat(this._timeString);
          if (isNaN(numValue)) {
            return false;
          }
          seconds = this._player.convertTime(numValue, format as MediaTemporalFormat.SECONDS | MediaTemporalFormat.FRAME_COUNT | MediaTemporalFormat.PERCENT, MediaTemporalFormat.SECONDS);
        } else {
          seconds = this._player.convertTime(
            this._timeString,
            format as MediaTemporalFormat.TIMECODE | MediaTemporalFormat.MEDIA_TIME | MediaTemporalFormat.COUNTDOWN_MEDIA_TIME,
            MediaTemporalFormat.SECONDS
          );
        }

        return seconds >= 0 && seconds <= this._player.getDuration();
      } catch (e) {
        return false;
      }
    } else {
      return false;
    }
  }
}
