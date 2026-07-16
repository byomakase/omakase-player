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

import {Observable, Subject, map, of} from 'rxjs';
import type {PlayerCommonApi} from '../../player';
import type {OmakaseTimeEdit} from '../../timeline/time';
import {MediaTemporalFormat} from '../../common';
import '../../timeline/time';
import {OmakaseTimeEditAttributes} from '../../timeline/time/omakase-time-edit';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../../util/rxjs-util';

export class OmakaseInlineEdit extends HTMLElement {
  onEdit$: Subject<string> = new Subject();
  beforeEdit?: () => Observable<void>;
  afterEdit?: () => Observable<void>;

  private _text = '';
  private _isEditing = false;
  private _isClicked = false;
  private _validationFn?: (text: string | undefined) => boolean;

  private _container: HTMLDivElement;
  private _input: HTMLInputElement | OmakaseTimeEdit;
  private _span: HTMLSpanElement;
  private _select?: HTMLSelectElement;

  constructor() {
    super();

    this._container = document.createElement('div');
    this._container.classList.add('omakase-inline-edit-editable-text');

    this._span = document.createElement('span');
    this._span.classList.add('omakase-inline-edit-readonly-text');
    this._span.textContent = this._text;

    this._input = document.createElement('input');
    this._input.classList.add('omakase-inline-edit-input');
    this._input.type = 'text';
    this._input.value = this._text;
    this._input.style.display = 'none';

    this._span.addEventListener('click', this.handleClick.bind(this));
    this._input.addEventListener('keydown', this.handleKeyDown.bind(this));
    this._input.addEventListener('keyup', this.handleKeyUp.bind(this));
    this._input.addEventListener('blur', this.undoChanges.bind(this));
    this._input.addEventListener('click', this.stopPropagation.bind(this));
  }

  connectedCallback() {
    this._container.appendChild(this._span);
    this._container.appendChild(this._input);
    this.appendChild(this._container);
  }

  set validationFn(validationFn: (text: string | undefined) => boolean) {
    this._validationFn = validationFn;
  }

  get value(): string {
    return this._text;
  }

  get isValid$() {
    return (this._input as OmakaseTimeEdit).isValid$;
  }

  setText(text: string) {
    this._text = text;
    this._span.textContent = text;
    this._input.value = text;
  }

  setTimecode(timecode: string, player: PlayerCommonApi, format: MediaTemporalFormat = MediaTemporalFormat.TIMECODE, minTime?: number, maxTime?: number) {
    try {
      this._container.removeChild(this._input);
    } catch (e) {
      // noop
    }
    this._input = document.createElement('omakase-time-edit') as OmakaseTimeEdit;
    this._input.blurHandler = () => {
      console.log('blur');
      this.undoChanges();
    };
    this._container.appendChild(this._input);
    this._input.style.display = 'none';
    this._input.setAttribute(OmakaseTimeEditAttributes.FORMAT, format);
    this._input.value = timecode;
    this._input.player = player;

    if (minTime) {
      this._input.minValue = player.convertTime(minTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
    }

    if (maxTime) {
      this._input.maxValue = player.convertTime(maxTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
    }

    this._validationFn = () => (this._input as OmakaseTimeEdit).isTimeValid();

    this._input.addEventListener('keydown', this.handleKeyDown.bind(this));
    this._input.addEventListener('keyup', this.handleKeyUp.bind(this));
    this._input.addEventListener('blur', this.undoChanges.bind(this));
    this._input.addEventListener('click', this.stopPropagation.bind(this));

    this._span.textContent = timecode;
    this._text = timecode;
  }

  setOptions(options: string[]) {
    this._span.style.display = 'none';
    this._input.style.display = 'none';
    this._select = document.createElement('select');
    this._select.classList.add('omakase-inline-edit-dropdown');
    this._select.addEventListener('click', this.stopPropagation.bind(this));
    this._select.value = this._text;
    this._container.appendChild(this._select);
    let emptyOption: HTMLOptionElement;
    if (!options.includes(this._text)) {
      emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.selected = true;
      emptyOption.disabled = true;
      this._select.appendChild(emptyOption);
    }
    for (const optionText of options) {
      const optionElement = document.createElement('option');
      optionElement.value = optionText;
      optionElement.text = optionText;
      optionElement.selected = optionText === this._text;
      this._select.appendChild(optionElement);
    }
    this._select.onchange = () => {
      this.onEdit$.next(this._select!.value);
      if (emptyOption) {
        this._select!.removeChild(emptyOption);
      }
    };
  }

  enableEditMode(): Observable<void> {
    return passiveObservable((observer) => {
      if (this._isEditing) {
        nextCompleteObserver(observer);
        return;
      }
      this._isEditing = true;
      (this.beforeEdit ? this.beforeEdit() : of<void>(undefined)).subscribe({
        next: () => {
          this._input.style.width = `${this._span.offsetWidth}px`;
          this._span.style.display = 'none';
          this._input.style.display = 'inline-block';
          this._input.value = this._text;
          this._input.focus();
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  disableEditMode(): Observable<void> {
    return passiveObservable((observer) => {
      if (!this._isEditing) {
        nextCompleteObserver(observer);
        return;
      }
      if (this._text !== this._input.value) {
        if (this._validationFn && !this._validationFn(this._input.value)) {
          nextCompleteObserver(observer);
          return;
        }
        this._text = this._input.value ?? '';
        this._span.textContent = this._text;
        this.onEdit$.next(this._text);
      }
      this._isEditing = false;
      this._span.style.display = 'inline-block';
      this._input.style.display = 'none';
      this._input.classList.remove('omakase-inline-edit-input-error');
      (this.afterEdit ? this.afterEdit() : of<void>(undefined)).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  private undoChanges() {
    this._input.value = this._text;
    this.disableEditMode();
  }

  private stopPropagation(event: MouseEvent) {
    event.stopPropagation();
  }

  private handleClick(event: MouseEvent) {
    event.stopPropagation();
    if (this._isClicked) {
      this.enableEditMode();
      this._isClicked = false;
    } else {
      this._isClicked = true;
    }
    setTimeout(() => {
      if (!this._isEditing) {
        this._container.click();
        this._isClicked = false;
      }
    }, 200);
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.disableEditMode();
    } else if (event.key === 'Escape') {
      this.undoChanges();
    }
  }

  private handleKeyUp() {
    if (!this._validationFn) {
      return;
    }
    if (this._validationFn(this._input.value)) {
      this._input.classList.remove('omakase-inline-edit-input-error');
    } else {
      this._input.classList.add('omakase-inline-edit-input-error');
    }
  }
}
