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

import {filter, of, takeUntil, tap} from 'rxjs';
import {OmakaseTimeRange} from './omakase-time-range';
import type {PlayerInternalApi} from '../../player';
import {PlayerEventType} from '../../player';
import {ObserverBreaker} from '../../common/observer-breaker';
import {MediaTemporalFormat} from '../../common';
import {MainMediaType} from '../../media';
import {OmakaseInlineEdit} from '../../marker-list/components/omakase-inline-edit';
import Decimal from 'decimal.js';
import {PLAYER_CONTROLLER_DEFAULTS} from '../../constants';

export const OmakaseTimeDisplayAttributes = {
  FORMAT: 'format',
  COUNTDOWN: 'countdown',
  AUDIO: 'audio',
  WITH_DURATION: 'withduration',
  EDITABLE: 'editable',
};

export const OmakaseTimeDisplayDomClasses = {
  EDITING: 'omakase-time-display-editing',
  INVALID: 'omakase-time-display-invalid',
};

export type OmakaseTimeDisplayFormat = 'timecode' | 'standard';

export class OmakaseTimeDisplay extends HTMLElement {
  static get observedAttributes() {
    return [OmakaseTimeDisplayAttributes.EDITABLE, OmakaseTimeDisplayAttributes.FORMAT];
  }

  private _player: PlayerInternalApi | undefined;
  private _timeRange?: OmakaseTimeRange;
  private _mediaDuration = 0;
  protected _destroyBreaker = new ObserverBreaker();
  protected _playerBreaker = new ObserverBreaker();
  protected _timeRangeBreaker = new ObserverBreaker();
  private _editBreaker = new ObserverBreaker();

  private _innerSpan: HTMLSpanElement | null = null;
  private _inlineEdit: OmakaseInlineEdit | null = null;
  private _isEditingTime = false;

  constructor() {
    super();
  }

  get displayFormat(): OmakaseTimeDisplayFormat {
    return this.getAttribute(OmakaseTimeDisplayAttributes.FORMAT) === 'timecode' && !this.isAudio ? 'timecode' : 'standard';
  }

  set displayFormat(format: OmakaseTimeDisplayFormat) {
    this.setAttribute(OmakaseTimeDisplayAttributes.FORMAT, format.toLowerCase());
  }

  get temporalFormat(): MediaTemporalFormat.TIMECODE | MediaTemporalFormat.MEDIA_TIME | MediaTemporalFormat.COUNTDOWN_MEDIA_TIME {
    return this.displayFormat === 'timecode' ? MediaTemporalFormat.TIMECODE : this.isCountdown ? MediaTemporalFormat.COUNTDOWN_MEDIA_TIME : MediaTemporalFormat.MEDIA_TIME;
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
        if (this._inlineEdit) {
          this.setupInlineEditTimecode();
        }
      }
      this._player.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe((loaded) => {
          this._mediaDuration = loaded.data.mainMediaState.duration ?? 0;
          this.isAudio = loaded.data.mainMediaState.mainMediaType === MainMediaType.AUDIO_FILE;
          if (this._inlineEdit) {
            this.setupInlineEditTimecode();
          }
          if (!this._timeRange) {
            this.displayTime(this._player!.getCurrentTime());
          }
        });
      this._player.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS),
          takeUntil(this._destroyBreaker.observer),
          takeUntil(this._timeRangeBreaker.observer)
        )
        .subscribe(() => {
          this.displayTime(this._player!.getCurrentTime());
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
    if (this._player && !!this._player?.isMainMediaLoaded) {
      this.displayTime(this._player.getCurrentTime());
    }
  }

  enableEditMode() {
    if (this._inlineEdit) {
      this._inlineEdit.enableEditMode();
    }
  }

  disableEditMode() {
    if (this._inlineEdit) {
      this._inlineEdit.disableEditMode();
    }
  }

  private getTimeString(time: number) {
    if (!this._player) {
      throw new Error('Player is not initialized');
    }
    return this.displayFormat === 'timecode'
      ? this._player.convertTime(time, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE)
      : this.formatMediaTime(this._player.convertTime(time, MediaTemporalFormat.SECONDS, this.isCountdown ? MediaTemporalFormat.COUNTDOWN_MEDIA_TIME : MediaTemporalFormat.MEDIA_TIME));
  }

  private displayTime(time: number) {
    if (this._player && this._player.isMainMediaLoaded) {
      const timeString = this.getTimeString(time);
      if (this._inlineEdit) {
        if (!this._isEditingTime) {
          this._inlineEdit.setText(timeString);
        }
      } else {
        this._innerSpan!.textContent = timeString;
        if (this.includeDuration) {
          this._innerSpan!.textContent += ` / ${this.displayFormat === 'timecode' ? this._player.getDuration(MediaTemporalFormat.TIMECODE) : this.formatMediaTime(this._player.getDuration(MediaTemporalFormat.MEDIA_TIME))}`;
        }
      }
    } else {
      if (this._inlineEdit) {
        if (!this._isEditingTime) {
          this._inlineEdit.setText('');
        }
      } else {
        this._innerSpan!.textContent = '';
      }
    }
  }

  private setupInlineEditTimecode() {
    if (this._inlineEdit && this._player) {
      const timecode = this._player.getCurrentTime(this.temporalFormat);
      this._inlineEdit.setTimecode(timecode, this._player, this.temporalFormat);
      this._inlineEdit.isValid$.pipe(takeUntil(this._destroyBreaker.observer), takeUntil(this._editBreaker.observer)).subscribe((isValid) => {
        if (isValid) {
          this.classList.remove(OmakaseTimeDisplayDomClasses.INVALID);
        } else {
          this.classList.add(OmakaseTimeDisplayDomClasses.INVALID);
        }
      });
    }
  }

  private formatMediaTime(mediaTime: string): string {
    return this._mediaDuration < 3600 ? mediaTime.slice(3).split('.')[0]! : mediaTime.split('.')[0]!;
  }

  connectedCallback() {
    this._teardownDOM();
    this._setupDOM(this.hasAttribute(OmakaseTimeDisplayAttributes.EDITABLE));
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (name === OmakaseTimeDisplayAttributes.EDITABLE) {
      const wasEditable = oldValue !== null;
      const isEditable = newValue !== null;
      if (wasEditable !== isEditable) {
        this._teardownDOM();
        this._setupDOM(isEditable);
        if (this._player) {
          this.displayTime(this._player.getCurrentTime());
        }
      }
    } else if (name === OmakaseTimeDisplayAttributes.FORMAT) {
      if (oldValue !== newValue && this._inlineEdit) {
        this._inlineEdit.setFormat(this.temporalFormat);
      }
    }
  }

  private _setupDOM(editable: boolean) {
    if (editable) {
      if (!customElements.get('omakase-inline-edit')) {
        customElements.define('omakase-inline-edit', OmakaseInlineEdit);
      }
      this._inlineEdit = document.createElement('omakase-inline-edit') as OmakaseInlineEdit;
      this.appendChild(this._inlineEdit);

      this._inlineEdit.beforeEdit = () => {
        this._isEditingTime = true;
        this.classList.add(OmakaseTimeDisplayDomClasses.EDITING);
        return this._player
          ? this._player.pause().pipe(
              tap(() => {
                if (this.displayFormat !== 'timecode') {
                  const time = this._player!.getCurrentTime(this.temporalFormat);
                  this._inlineEdit!.setText(time);
                }
              })
            )
          : of(undefined);
      };

      this._inlineEdit.afterEdit = () => {
        this._isEditingTime = false;
        this.classList.remove(OmakaseTimeDisplayDomClasses.EDITING);
        if (this.displayFormat !== 'timecode') {
          const time = this._player!.convertTime(this._inlineEdit!.value, this.temporalFormat, MediaTemporalFormat.SECONDS);
          this._inlineEdit?.setText(this.getTimeString(time));
        }
        return of(undefined);
      };

      this._inlineEdit.onEdit$.pipe(takeUntil(this._destroyBreaker.observer), takeUntil(this._editBreaker.observer)).subscribe((timeString) => {
        if (this._player) {
          const seconds =
            this.displayFormat === 'timecode'
              ? Decimal(this._player.convertTime(timeString, this.temporalFormat, MediaTemporalFormat.SECONDS))
                  .plus(PLAYER_CONTROLLER_DEFAULTS.frameDurationSpillOverCorrection)
                  .toNumber()
              : this._player.convertTime(timeString, this.temporalFormat, MediaTemporalFormat.SECONDS);

          this._player.seekTo(seconds, MediaTemporalFormat.SECONDS).subscribe();
        }
      });

      if (this._player?.isMainMediaLoaded) {
        this.setupInlineEditTimecode();
      }
    } else {
      this._innerSpan = document.createElement('span');
      this.appendChild(this._innerSpan);
    }
  }

  private _teardownDOM() {
    this._editBreaker.break();
    this._isEditingTime = false;
    if (this._inlineEdit) {
      this._inlineEdit.remove();
      this._inlineEdit = null;
    }
    if (this._innerSpan) {
      this._innerSpan.remove();
      this._innerSpan = null;
    }
  }

  disconnectedCallback() {
    this._destroyBreaker.destroy();
  }
}
