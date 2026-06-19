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

import {filter, takeUntil} from 'rxjs';
import {OmakaseTimeRange} from './omakase-time-range';
import type {PlayerInternalApi} from '../../player';
import {PlayerEventType} from '../../player';
import {ObserverBreaker} from '../../common/observer-breaker';
import {MediaTemporalFormat} from '../../common';
import {MainMediaType} from '../../media';

export const OmakaseTimeDisplayAttributes = {
  FORMAT: 'format',
  COUNTDOWN: 'countdown',
  AUDIO: 'audio',
  WITH_DURATION: 'withduration',
};

export type OmakaseTimeDisplayFormat = 'timecode' | 'standard';

export class OmakaseTimeDisplay extends HTMLElement {
  private _player: PlayerInternalApi | undefined;
  private _timeRange?: OmakaseTimeRange;
  private _mediaDuration = 0;
  protected _destroyBreaker = new ObserverBreaker();
  protected _playerBreaker = new ObserverBreaker();
  protected _timeRangeBreaker = new ObserverBreaker();

  private _innerSpan: HTMLSpanElement | null = null;

  constructor() {
    super();
  }

  get format(): OmakaseTimeDisplayFormat {
    return this.getAttribute(OmakaseTimeDisplayAttributes.FORMAT) === 'timecode' && !this.isAudio ? 'timecode' : 'standard';
  }

  set format(format: OmakaseTimeDisplayFormat) {
    this.setAttribute(OmakaseTimeDisplayAttributes.FORMAT, format.toLowerCase());
  }

  get isCountdown() {
    return this.hasAttribute(OmakaseTimeDisplayAttributes.COUNTDOWN);
  }

  set isCountdown(isCountdown: boolean) {
    if (isCountdown) {
      this.setAttribute(OmakaseTimeDisplayAttributes.COUNTDOWN, '');
    } else {
      this.removeAttribute(OmakaseTimeDisplayAttributes.COUNTDOWN);
    }
  }

  get isAudio() {
    return this.hasAttribute(OmakaseTimeDisplayAttributes.AUDIO);
  }

  set isAudio(isAudio: boolean) {
    if (isAudio) {
      this.setAttribute(OmakaseTimeDisplayAttributes.AUDIO, '');
    } else {
      this.removeAttribute(OmakaseTimeDisplayAttributes.AUDIO);
    }
  }

  get includeDuration() {
    return this.hasAttribute(OmakaseTimeDisplayAttributes.WITH_DURATION);
  }

  set includeDuration(includeDuration: boolean) {
    if (includeDuration) {
      this.setAttribute(OmakaseTimeDisplayAttributes.WITH_DURATION, '');
    } else {
      this.removeAttribute(OmakaseTimeDisplayAttributes.WITH_DURATION);
    }
  }

  set player(player: PlayerInternalApi | undefined) {
    this._player = player;
    this._playerBreaker.break();
    if (this._player) {
      if (this._player.isMainMediaLoaded) {
        this._mediaDuration = this._player.getDuration();
      }
      this._player.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe((loaded) => {
          this._mediaDuration = loaded.data.mainMediaState.duration ?? 0;
          this.isAudio = loaded.data.mainMediaState.mainMediaType === MainMediaType.AUDIO_FILE;
          if (!this._timeRange) {
            this.displayCurrentTime();
          }
        });
      this._player.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS),
          takeUntil(this._destroyBreaker.observer),
          takeUntil(this._timeRangeBreaker.observer)
        )
        .subscribe(() => {
          this.displayCurrentTime();
        });
    }
  }

  set timeRange(timeRange: OmakaseTimeRange) {
    this._timeRange = timeRange;
    this._timeRangeBreaker.break();
    this._timeRange.onMouseOver$
      .pipe(filter((p) => !!this._player?.isMainMediaLoaded))
      .pipe(takeUntil(this._destroyBreaker.observer), takeUntil(this._playerBreaker.observer))
      .subscribe((time) => {
        this.displayTime(time);
      });
  }

  updateTime(): void {
    this.displayCurrentTime();
  }

  private displayTime(time: number) {
    if (this._player && this._player.isMainMediaLoaded) {
      this._innerSpan!.textContent =
        this.format === 'timecode'
          ? this._player.convertTime(time, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE)
          : this.formatMediaTime(this._player!.convertTime(time, MediaTemporalFormat.SECONDS, this.isCountdown ? MediaTemporalFormat.COUNTDOWN_MEDIA_TIME : MediaTemporalFormat.MEDIA_TIME));
    } else {
      this._innerSpan!.textContent = '';
    }
  }

  private displayCurrentTime() {
    if (this._player && this._player.isMainMediaLoaded) {
      this._innerSpan!.textContent =
        this.format === 'timecode'
          ? this._player!.getCurrentTime(MediaTemporalFormat.TIMECODE)
          : this.formatMediaTime(this._player!.getCurrentTime(this.isCountdown ? MediaTemporalFormat.COUNTDOWN_MEDIA_TIME : MediaTemporalFormat.MEDIA_TIME));
      if (this.includeDuration) {
        this._innerSpan!.textContent += ` / ${this.format === 'timecode' ? this._player!.getDuration(MediaTemporalFormat.TIMECODE) : this.formatMediaTime(this._player!.getDuration(MediaTemporalFormat.MEDIA_TIME))}`;
      }
    } else {
      this._innerSpan!.textContent = '';
    }
  }

  private formatMediaTime(mediaTime: string): string {
    return this._mediaDuration < 3600 ? mediaTime.slice(3).split('.')[0]! : mediaTime.split('.')[0]!;
  }

  connectedCallback() {
    this._innerSpan = document.createElement('span');
    this.appendChild(this._innerSpan);
  }

  disconnectedCallback() {
    this._destroyBreaker.destroy();
  }
}
