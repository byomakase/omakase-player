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

import {skip, takeUntil} from 'rxjs';
import type {OmakaseDropdownListItem} from '../chroming-api';
import {OmakaseDropdownSelector, OmakaseDropdownSelectorAttributes, OmakaseDropdownSelectorSlots} from './omakase-dropdown-selector';

export const OmakaseMenuAttributes = {
  ...OmakaseDropdownSelectorAttributes,
  MENU_TITLE: 'menu-title',
};

export const OmakaseMenuDomClasses = {
  DROPDOWN: 'omakase-menu-dropdown',
  DROPDOWN_LIST: 'omakase-menu-dropdown-list',
  ICON: 'media-chrome-menu',
};

export interface OmakaseMenuOption {
  /** Text shown in the menu, and passed to {@link OmakaseMenu.onSelect} when the option is selected. */
  label: string;

  /** Identifies the option within the menu. Defaults to `label`. */
  value?: string;

  /** Whether the option can be selected. Defaults to `true`. */
  enabled?: boolean;
}

const optionValue = (option: OmakaseMenuOption): string => option.value ?? option.label;

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export class OmakaseMenu extends OmakaseDropdownSelector {
  protected readonly dropdownIdPrefix = 'omakase-menu-dropdown';
  protected readonly dropdownClass = OmakaseMenuDomClasses.DROPDOWN;

  /** Called with the selected option's label and value. */
  onSelect?: (label: string, value: string) => void;

  private _options: OmakaseMenuOption[] = [];
  private _optionsSet = false;

  /** Options of the menu, in display order. Setting them replaces all options. */
  get options(): OmakaseMenuOption[] {
    return this._options.map((option) => ({...option}));
  }

  set options(options: OmakaseMenuOption[]) {
    this._options = options.map((option) => ({...option}));
    this._optionsSet = true;
    this.renderOptions();
  }

  /**
   * Adds an option at `index` (at the end when not given). An existing option with the same value is replaced in place.
   */
  addOption(option: OmakaseMenuOption, index?: number) {
    const existingIndex = this._options.findIndex((existing) => optionValue(existing) === optionValue(option));
    if (existingIndex >= 0) {
      this._options[existingIndex] = {...option};
    } else if (index !== undefined && index >= 0 && index < this._options.length) {
      this._options.splice(index, 0, {...option});
    } else {
      this._options.push({...option});
    }
    this._optionsSet = true;
    this.renderOptions();
  }

  /** Removes the option with the given value (its label, unless it was given a `value`). */
  removeOption(value: string) {
    this._options = this._options.filter((option) => optionValue(option) !== value);
    this._optionsSet = true;
    this.renderOptions();
  }

  /** Enables or disables the option with the given value (its label, unless it was given a `value`). */
  setOptionEnabled(value: string, enabled: boolean) {
    const option = this._options.find((option) => optionValue(option) === value);
    if (option) {
      option.enabled = enabled;
      this.renderOptions();
    }
  }

  override connectedCallback() {
    if (!this.dropdown) {
      this.readOptionElements();
      this.addDefaultToggle();
    }
    super.connectedCallback();
    this.renderOptions();

    this.dropdownList?.selectedOption$.pipe(skip(1), takeUntil(this._connectionBreaker.observer)).subscribe({
      next: (item) => {
        const option = item ? this._options.find((option) => optionValue(option) === item.value) : undefined;
        if (option && option.enabled !== false) {
          this.onSelect?.(option.label, optionValue(option));
        }
      },
    });
  }

  protected renderDropdownLists(dropdownId: string): string {
    const title = this.getAttribute(OmakaseMenuAttributes.MENU_TITLE);
    // multiselect, so that options aren't marked as the selected one: a menu triggers actions, it doesn't hold a selection
    return `<omakase-dropdown-list id="${dropdownId}-list" class="${OmakaseMenuDomClasses.DROPDOWN_LIST} align-left" ${title ? `title="${escapeAttribute(title)}" ` : ''}width="125" max-width="250" multiselect="true"></omakase-dropdown-list>`;
  }

  protected subscribeToPlayer() {}

  protected onOptionSelected() {}

  /** Takes the `<option>` children given in markup as the initial options, unless options were already set. */
  private readOptionElements() {
    const elements = Array.from(this.querySelectorAll<HTMLOptionElement>(':scope > option'));
    if (!this._optionsSet) {
      this._options = elements.map((element) => ({
        label: element.textContent?.trim() ?? '',
        ...(element.hasAttribute('value') ? {value: element.getAttribute('value')!} : {}),
        enabled: !element.disabled,
      }));
    }
    elements.forEach((element) => element.remove());
  }

  private addDefaultToggle() {
    if (this.querySelector(`:scope > [slot="${OmakaseDropdownSelectorSlots.TOGGLE}"]`)) {
      return;
    }
    const button = document.createElement('media-chrome-button');
    button.slot = OmakaseDropdownSelectorSlots.TOGGLE;
    button.classList.add('media-chrome-button');
    const icon = document.createElement('span');
    icon.classList.add(OmakaseMenuDomClasses.ICON);
    button.appendChild(icon);
    this.appendChild(button);
  }

  private renderOptions() {
    const list = this.dropdownList;
    if (!list) {
      return;
    }
    const items: OmakaseDropdownListItem[] = this._options.map((option) => ({
      value: optionValue(option),
      label: option.label,
      disabled: option.enabled === false,
    }));
    list.setOptions(items);
    // also disabled while the menu is disabled (see enabled); disabling closes the menu if open
    this.setDisabled(this._options.length === 0);
  }
}
