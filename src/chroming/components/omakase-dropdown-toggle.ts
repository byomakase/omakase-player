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

import {DomUtil} from '../../dom/dom-util';
import {OmakaseDropdown, OmakaseDropdownRegistry} from './omakase-dropdown';

export const OmakaseDropdownToggleAttributes = {
  DROPDOWN: 'dropdown',
  DISABLED: 'disabled',
};

export const OmakaseDropdownToggleDomClasses = {
  ACTIVE: 'active',
};

export class OmakaseDropdownToggle extends HTMLElement {
  static get observedAttributes() {
    return [OmakaseDropdownToggleAttributes.DROPDOWN];
  }

  private _dropdown?: OmakaseDropdown | undefined;
  private _span?: HTMLSpanElement;

  get span(): HTMLSpanElement | undefined {
    return this._span;
  }

  get isDisabled() {
    return this.hasAttribute(OmakaseDropdownToggleAttributes.DISABLED);
  }

  set isDisabled(isDisabled: boolean) {
    if (isDisabled) {
      this.setAttribute(OmakaseDropdownToggleAttributes.DISABLED, '');
    } else {
      this.removeAttribute(OmakaseDropdownToggleAttributes.DISABLED);
    }
  }

  constructor() {
    super();
  }

  connectedCallback() {
    this._bindDropdown();
    if (!this.children.length) {
      this._span = document.createElement('span');
      this._span.classList.add('omakase-dropdown-toggle');
      if (this._dropdown?.displayLabel) {
        this._span.innerText = this._dropdown.displayLabel;
      }
      this.appendChild(this._span);
    }
    this.onclick = (event) => {
      if (this.isDisabled) {
        event.stopPropagation();
        return;
      }
      if (this._dropdown?.style.display === 'none') {
        if (this._dropdown.position === 'below') {
          this._dropdown!.style.top = DomUtil.getPixelValue(this.offsetTop + this.offsetHeight + 10);
        } else if (!this._dropdown!.style.right) {
          if (this._dropdown!.alignment === 'center') {
            this._dropdown!.style.left = DomUtil.getPixelValue(this.offsetLeft + this.offsetWidth / 2 - this._dropdown!.width / 2);
          } else if (this._dropdown!.alignment === 'right') {
            this._dropdown!.style.left = DomUtil.getPixelValue(this.offsetLeft + this.offsetWidth - this._dropdown!.width);
          } else {
            this._dropdown!.style.left = DomUtil.getPixelValue(this.offsetLeft);
          }
        }
        setTimeout(() => {
          this._dropdown!.style.display = 'flex';
          this.classList.add(OmakaseDropdownToggleDomClasses.ACTIVE);
        });
      } else {
        this._dropdown!.style.display = 'none';
        this.classList.remove(OmakaseDropdownToggleDomClasses.ACTIVE);
      }
    };
  }

  private _bindDropdown() {
    const dropdownId = this.getAttribute(OmakaseDropdownToggleAttributes.DROPDOWN);
    if (!dropdownId) {
      return;
    }
    this._dropdown = OmakaseDropdownRegistry.getDropdown(dropdownId);
    if (this._dropdown) {
      this._dropdown.toggle = this;
    }
  }
}
