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

import {Subject} from 'rxjs';

export const OmakaseDropdownOptionAttributes = {
  VALUE: 'value',
  TITLE: 'title',
  SELECTED: 'selected',
};

export const OmakaseDropdownOptionDomClasses = {
  ICON: 'omakase-dropdown-option-icon',
  TEXT: 'omakase-dropdown-option-text',
  ACTION: 'omakase-dropdown-option-action',
  ACTIVE: 'active',
};

export class OmakaseDropdownOption extends HTMLElement {
  value?: any;

  private _textElement?: HTMLSpanElement;
  private _iconElement?: HTMLSpanElement;
  private _actionElement?: HTMLSpanElement;

  onSelect$: Subject<void> = new Subject();
  onAction$: Subject<void> = new Subject();

  constructor() {
    super();
  }

  setActionClass(classNames: string) {
    if (this._actionElement) {
      this._actionElement.className = '';
      if (classNames.length) {
        this._actionElement.classList.add(...classNames.split(' '));
      }
    }
  }

  setLabel(label: string) {
    if (this._textElement) {
      this._textElement.textContent = label;
    }
  }

  connectedCallback() {
    const text = this.textContent;
    this.innerText = '';
    this._iconElement = document.createElement('span');
    this._iconElement.classList.add(OmakaseDropdownOptionDomClasses.ICON);
    this._textElement = document.createElement('span');
    this._textElement.textContent = text;
    this._textElement.classList.add(OmakaseDropdownOptionDomClasses.TEXT);
    this._actionElement = document.createElement('span');
    this._actionElement.classList.add(OmakaseDropdownOptionDomClasses.ACTION);
    this._iconElement.onclick = () => {
      this.onSelect$.next();
    };
    this._textElement.onclick = () => {
      this.onSelect$.next();
    };
    this._actionElement.onclick = () => {
      this.onAction$.next();
    };
    this.appendChild(this._iconElement);
    this.appendChild(this._textElement);
    this.appendChild(this._actionElement);
  }
}
