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

import {BehaviorSubject, Subject, type Subscription} from 'rxjs';
import {OmakaseDropdownOption, OmakaseDropdownOptionAttributes, OmakaseDropdownOptionDomClasses} from './omakase-dropdown-option';
import type {OmakaseDropdownListApi, OmakaseDropdownListItem} from '../chroming-api';
import {DomUtil} from '../../dom/dom-util';
import {OmakaseDropdownRegistry} from './omakase-dropdown';
import {compareArrays} from '../../util/util-functions';

export const OmakaseDropdownListAttributes = {
  WIDTH: 'width',
  MAX_WIDTH: 'max-width',
  TYPE: 'type',
  MULTISELECT: 'multiselect',
  TITLE: 'title',
  DROPDOWN: 'dropdown',
};

export const OmakaseDropdownListDomClasses = {
  CONTAINER: 'omakase-dropdown-container',
  TITLE: 'omakase-dropdown-title',
  OPTION_PREFIX: 'omakase-dropdown-option',
};

export type OmakaseDropdownListType = 'radio' | 'checkbox' | 'default';
export class OmakaseDropdownList extends HTMLElement implements OmakaseDropdownListApi {
  private _title?: HTMLDivElement;
  private _list?: HTMLDivElement;
  private _options: OmakaseDropdownListItem[] = [];
  private _optionElements: Map<string, OmakaseDropdownOption> = new Map();
  private _selectedOption$ = new BehaviorSubject<OmakaseDropdownListItem | undefined>(undefined);
  private _selectedAction$ = new Subject<OmakaseDropdownListItem>();
  private _selectedOptionSubscription: Subscription | undefined;

  constructor() {
    super();
  }

  set width(width: number) {
    this.setAttribute(OmakaseDropdownListAttributes.WIDTH, width.toString());
    this.style.minWidth = DomUtil.getPixelValue(width);
  }

  get width(): number {
    return parseFloat(this.getAttribute(OmakaseDropdownListAttributes.WIDTH) ?? '100');
  }

  set maxWidth(width: number | undefined) {
    if (width) {
      this.setAttribute(OmakaseDropdownListAttributes.MAX_WIDTH, width.toString());
      this.style.maxWidth = DomUtil.getPixelValue(width);
    } else {
      this.removeAttribute(OmakaseDropdownListAttributes.MAX_WIDTH);
      this.style.removeProperty('maxWidth');
    }
  }

  get maxWidth(): number | undefined {
    return this.hasAttribute(OmakaseDropdownListAttributes.MAX_WIDTH) ? parseFloat(this.getAttribute(OmakaseDropdownListAttributes.MAX_WIDTH)!) : undefined;
  }

  get selectedOption$() {
    return this._selectedOption$;
  }

  get selectedAction$() {
    return this._selectedAction$.asObservable();
  }

  set type(type: OmakaseDropdownListType) {
    this.setAttribute(OmakaseDropdownListAttributes.TYPE, type);
  }

  get type(): OmakaseDropdownListType {
    if (this.getAttribute(OmakaseDropdownListAttributes.TYPE) === 'radio') {
      return 'radio';
    } else if (this.getAttribute(OmakaseDropdownListAttributes.TYPE) === 'checkbox') {
      return 'checkbox';
    } else {
      return 'default';
    }
  }

  get options() {
    return this._options;
  }

  setTitle(title: string) {
    if (this._title) {
      this._title.innerText = title;
    }
  }

  setOptions(options: OmakaseDropdownListItem[]) {
    if (compareArrays(this._options, options)) {
      return;
    }
    this._list!.innerHTML = '';
    this._optionElements.clear();
    this._options = [];
    for (const option of options) {
      this.addOption(option);
    }
  }

  updateOptions(options: Partial<OmakaseDropdownListItem>[]) {
    for (const option of options) {
      const optionElement = this._optionElements.get(option.value);
      if (optionElement) {
        if (option.hasOwnProperty('active')) {
          option.active ? optionElement.classList.add(OmakaseDropdownOptionDomClasses.ACTIVE) : optionElement.classList.remove(OmakaseDropdownOptionDomClasses.ACTIVE);
        }
        if (option.hasOwnProperty('actionClass')) {
          optionElement.setActionClass(option.actionClass);
        }
        if (option.hasOwnProperty('label')) {
          optionElement.setLabel(option.label);
        }
      }
    }
  }

  addOption(option: OmakaseDropdownListItem) {
    const optionElement = document.createElement('omakase-dropdown-option') as OmakaseDropdownOption;
    optionElement.classList.add(`${OmakaseDropdownListDomClasses.OPTION_PREFIX}-${this.type}`);
    optionElement.innerText = option.label;
    optionElement.setAttribute(OmakaseDropdownOptionAttributes.VALUE, option.value);
    optionElement.setAttribute(OmakaseDropdownOptionAttributes.TITLE, option.label);
    if (option.active) {
      optionElement.classList.add(OmakaseDropdownOptionDomClasses.ACTIVE);
    }
    const optionItem = {
      value: optionElement.getAttribute(OmakaseDropdownOptionAttributes.VALUE),
      label: optionElement.innerText,
      active: optionElement.classList.contains(OmakaseDropdownOptionDomClasses.ACTIVE),
    };
    optionElement.onSelect$.subscribe(() => {
      this._selectOption(optionItem);
    });
    optionElement.onAction$.subscribe(() => {
      this._selectedAction$.next(optionItem);
    });
    this._list!.appendChild(optionElement);
    if (option.actionClass) {
      optionElement.setActionClass(option.actionClass);
    }
    this._options.push(option);
    this._optionElements.set(option.value, optionElement);
  }

  removeOption(value: any) {
    const option = this._options.find((option) => option.value === value);
    if (option) {
      this._options.splice(this._options.indexOf(option), 1);
      this._optionElements.get(value)?.remove();
      this._optionElements.delete(value);
    }
    if (this._selectedOption$.value === value) {
      this._selectedOption$.next(undefined);
    }
  }

  connectedCallback() {
    this.style.minWidth = DomUtil.getPixelValue(this.width);
    this.style.maxWidth = this.maxWidth ? DomUtil.getPixelValue(this.maxWidth) : DomUtil.getPixelValue(this.width);

    if (!this.getAttribute(OmakaseDropdownListAttributes.TYPE)) {
      this.type = 'default';
    }

    if (!this.getAttribute(OmakaseDropdownListAttributes.MULTISELECT)) {
      this._selectedOptionSubscription = this.selectedOption$.subscribe((newValue) => {
        this._updateDropdownLabel(newValue);
        this.querySelectorAll('omakase-dropdown-option').forEach((option) => {
          if (
            option.getAttribute(OmakaseDropdownOptionAttributes.VALUE) === newValue?.value.toString() ||
            (!option.getAttribute(OmakaseDropdownOptionAttributes.VALUE) && !newValue?.value.toString())
          ) {
            option.classList.add(OmakaseDropdownOptionDomClasses.ACTIVE);
          } else {
            option.classList.remove(OmakaseDropdownOptionDomClasses.ACTIVE);
          }
        });
      });
    }

    if (this.getAttribute(OmakaseDropdownListAttributes.TITLE)) {
      this._title = document.createElement('div');
      this._title.classList.add(OmakaseDropdownListDomClasses.TITLE);
      this._title.innerText = this.getAttribute(OmakaseDropdownListAttributes.TITLE)!;
      this.appendChild(this._title);
    }

    this._list = document.createElement('div');
    this._list.classList.add(OmakaseDropdownListDomClasses.CONTAINER);
    this.appendChild(this._list);

    const optionElements = this.querySelectorAll('omakase-dropdown-option');
    optionElements.forEach((optionElement) => {
      const value = optionElement.getAttribute(OmakaseDropdownOptionAttributes.VALUE) ?? '';
      const label = optionElement.textContent;
      const option = {value, label};
      this._options.push(option);
      if (optionElement.hasAttribute(OmakaseDropdownOptionAttributes.SELECTED)) {
        this._selectOption(option);
      }
      const clone = optionElement.cloneNode(true) as OmakaseDropdownOption;
      clone.classList.add(`${OmakaseDropdownListDomClasses.OPTION_PREFIX}-${this.type}`);
      clone.addEventListener('click', () => {
        this._selectOption(option);
      });
      this.removeChild(optionElement);
      this._list!.appendChild(clone);
      this._optionElements.set(value, clone);
    });
  }

  disconnectedCallback() {
    this._selectedOptionSubscription?.unsubscribe();
    this._selectedOptionSubscription = void 0;
    this._optionElements.clear();
  }

  private _selectOption(option: OmakaseDropdownListItem | undefined) {
    if (option && option.value && this._optionElements.get(option.value)) {
      option.active = this._optionElements.get(option.value)!.classList.contains(OmakaseDropdownOptionDomClasses.ACTIVE);
    }
    this._selectedOption$.next(option);
    this._updateDropdownLabel(option);
  }

  private _updateDropdownLabel(option: OmakaseDropdownListItem | undefined) {
    const dropdown = this._getDropdown();
    if (dropdown) {
      if (!dropdown.isFloating) {
        dropdown.closeDropdown();
      }
      dropdown.displayLabel = option?.label;
    }
  }

  private _getDropdown() {
    const dropdownId = this.getAttribute(OmakaseDropdownListAttributes.DROPDOWN);
    if (dropdownId) {
      return OmakaseDropdownRegistry.getDropdown(dropdownId);
    }
  }
}
