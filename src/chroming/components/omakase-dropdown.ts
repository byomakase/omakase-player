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

import {OmakaseDropdownToggle, OmakaseDropdownToggleDomClasses} from './omakase-dropdown-toggle';
import {OmakaseDropdownList, OmakaseDropdownListAttributes} from './omakase-dropdown-list';
import {Subject, type Subscription} from 'rxjs';

export const OmakaseDropdownAttributes = {
  POSITION: 'position',
  ALIGNMENT: 'alignment',
  FLOATING: 'floating',
};

export const OmakaseDropdownDomClasses = {
  CLOSE: 'omakase-dropdown-close',
};

export type OmakaseDropdownPosition = 'above' | 'below';
export type OmakaseDropdownAlignment = 'left' | 'center' | 'right';

export class OmakaseDropdownRegistry {
  private static _dropdowns: Map<string, OmakaseDropdown> = new Map();

  static getDropdown(id: string) {
    return this._dropdowns.get(id);
  }

  static registerDropdown(dropdown: OmakaseDropdown) {
    this._dropdowns.set(dropdown.id, dropdown);
  }

  static unregisterDropdown(dropdown: OmakaseDropdown) {
    this._dropdowns.delete(dropdown.id);
  }
}

export class OmakaseDropdown extends HTMLElement {
  private _toggle: OmakaseDropdownToggle | undefined;
  private _displayLabel: string | undefined;
  private _subscriptions: Subscription[] = [];
  private _documentClickListener: ((event: MouseEvent) => void) | undefined;
  private _onClose$ = new Subject<void>();

  constructor() {
    super();
  }

  get width(): number {
    const lists = this.querySelectorAll('omakase-dropdown-list') as NodeListOf<OmakaseDropdownList>;
    let width = 0;
    lists.forEach((list) => {
      width += list.width;
    });
    return width;
  }

  get toggle(): OmakaseDropdownToggle | undefined {
    return this._toggle;
  }

  set toggle(toggle: OmakaseDropdownToggle | undefined) {
    this._toggle = toggle;
  }

  get displayLabel() {
    return this._displayLabel;
  }

  set displayLabel(displayLabel: string | undefined) {
    this._displayLabel = displayLabel;
    if (this._toggle?.span) {
      this._toggle.span.innerText = displayLabel ?? '';
    }
  }

  get isFloating() {
    return this.hasAttribute(OmakaseDropdownAttributes.FLOATING);
  }

  set isFloating(isFloating: boolean) {
    if (isFloating) {
      this.setAttribute(OmakaseDropdownAttributes.FLOATING, '');
    } else {
      this.removeAttribute(OmakaseDropdownAttributes.FLOATING);
    }
  }

  get position(): OmakaseDropdownPosition {
    return this.getAttribute(OmakaseDropdownAttributes.POSITION) === 'below' ? 'below' : 'above';
  }

  set position(position: OmakaseDropdownPosition) {
    this.setAttribute(OmakaseDropdownAttributes.POSITION, position);
  }

  get alignment(): OmakaseDropdownAlignment {
    if (this.getAttribute(OmakaseDropdownAttributes.ALIGNMENT) === 'left') {
      return 'left';
    } else if (this.getAttribute(OmakaseDropdownAttributes.ALIGNMENT) === 'right') {
      return 'right';
    } else {
      return 'center';
    }
  }

  set alignment(alignment: OmakaseDropdownAlignment) {
    this.setAttribute(OmakaseDropdownAttributes.ALIGNMENT, alignment);
  }

  get onClose$() {
    return this._onClose$.asObservable();
  }

  connectedCallback() {
    if (this.id) {
      OmakaseDropdownRegistry.registerDropdown(this);
    }

    const lists = this.querySelectorAll('omakase-dropdown-list') as NodeListOf<OmakaseDropdownList>;

    const closeButton = document.createElement('span');
    closeButton.classList.add(OmakaseDropdownDomClasses.CLOSE);
    closeButton.onclick = () => {
      this.closeDropdown();
    };
    if (lists.length > 0) {
      lists[lists.length - 1]!.appendChild(closeButton);
    }
    lists.forEach((list) => {
      list.setAttribute(OmakaseDropdownListAttributes.DROPDOWN, this.id);
    });
    this._documentClickListener = (event: MouseEvent) => {
      if (!this.isFloating && !event.composedPath().includes(this)) {
        this.closeDropdown();
      }
    };
    document.addEventListener('click', this._documentClickListener);
  }

  disconnectedCallback() {
    OmakaseDropdownRegistry.unregisterDropdown(this);
    this._subscriptions.forEach((sub) => sub.unsubscribe());
    this._subscriptions = [];

    if (this._documentClickListener) {
      document.removeEventListener('click', this._documentClickListener);
      this._documentClickListener = undefined;
    }
  }

  closeDropdown() {
    this.style.display = 'none';
    this._onClose$.next();
    if (this._toggle) {
      this._toggle.classList.remove(OmakaseDropdownToggleDomClasses.ACTIVE);
    }
  }
}
