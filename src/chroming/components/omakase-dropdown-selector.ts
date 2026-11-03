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

import {merge, map, skip, takeUntil} from 'rxjs';
import type {PlayerApi, PlayerDetachedApi} from '../../player/player-api';
import {ObserverBreaker} from '../../common/observer-breaker';
import type {OmakaseDropdownListItem} from '../chroming-api';
import type {OmakaseDropdown, OmakaseDropdownAlignment, OmakaseDropdownPosition} from './omakase-dropdown';
import type {OmakaseDropdownList} from './omakase-dropdown-list';
import {OmakaseDropdownToggleAttributes, type OmakaseDropdownToggle} from './omakase-dropdown-toggle';
import {ControlBarComponent, ControlBarComponentAttributes, ControlBarComponentClasses} from '../../control-bar/control-bar-component';

export const OmakaseDropdownSelectorAttributes = {
  DROPDOWN: 'dropdown',
  ALIGNMENT: 'alignment',
  POSITION: 'position',
  CONTAINER_RIGHT: 'container-right',
  DROPDOWN_CLASS: 'dropdown-class',
  TOGGLE_CLASS: 'toggle-class',
  FLOATING: 'floating',
  CARET: 'caret',
  TOGGLE_BACKGROUND: 'toggle-background',
  EXPAND_DIRECTION: 'expand-direction',
};

export type OmakaseDropdownSelectorExpandDirection = 'left' | 'right';

export const OmakaseDropdownSelectorDomClasses = {
  SELECTOR: 'omakase-dropdown-selector',
};

export const OmakaseDropdownSelectorSlots = {
  TOGGLE: 'toggle',
};

let dropdownIdCounter = 0;

export abstract class OmakaseDropdownSelector extends ControlBarComponent(HTMLElement) {
  private _player: PlayerApi | PlayerDetachedApi | undefined;
  private _dropdown: OmakaseDropdown | undefined;
  private _dropdownLists: OmakaseDropdownList[] = [];
  private _toggle: OmakaseDropdownToggle | undefined;
  private _toggleContent: HTMLElement[] = [];
  private _unavailable = false;
  protected _playerBreaker = new ObserverBreaker();
  protected _connectionBreaker = new ObserverBreaker();

  /** Prefix of the generated dropdown id, used when the `dropdown` attribute isn't set. */
  protected abstract readonly dropdownIdPrefix: string;

  /** Class set on the rendered `omakase-dropdown`. */
  protected abstract readonly dropdownClass: string;

  /** Markup of the `omakase-dropdown-list`s, given the id of the dropdown they're in. */
  protected abstract renderDropdownLists(dropdownId: string): string;

  /**
   * Subscribes to the player until `_playerBreaker` fires, and syncs the selection to the player's current state.
   * Called whenever the player is set while connected, and on every connect.
   */
  protected abstract subscribeToPlayer(player: PlayerApi | PlayerDetachedApi): void;

  /** Applies an option the user selected in `list`, or that was selected programmatically, to the player. */
  protected abstract onOptionSelected(option: OmakaseDropdownListItem, player: PlayerApi | PlayerDetachedApi, list: OmakaseDropdownList): void;

  connectedCallback() {
    this.classList.add(OmakaseDropdownSelectorDomClasses.SELECTOR);
    if (!this.style.display) {
      this.style.display = 'contents';
    }
    if (!this._dropdown) {
      this.render();
      this.updateDisabled();
    }
    if (this._player) {
      this.subscribeToPlayer(this._player);
    }
    // skip the selection each list replays on subscribe, so only selections made from now on reach the player
    merge(
      ...this._dropdownLists.map((list) =>
        list.selectedOption$.pipe(
          skip(1),
          map((option) => ({option, list}))
        )
      )
    )
      .pipe(takeUntil(this._connectionBreaker.observer))
      .subscribe({
        next: ({option, list}) => {
          if (option && this._player) {
            this.onOptionSelected(option, this._player, list);
          }
        },
      });
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === ControlBarComponentAttributes.DISABLED) {
      this.updateDisabled();
    }
  }

  disconnectedCallback() {
    this._connectionBreaker.break();
    this._playerBreaker.break();
  }

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
    this._playerBreaker.break();
    if (player && this.isConnected && this._dropdown) {
      this.subscribeToPlayer(player);
    }
  }

  get dropdown(): OmakaseDropdown | undefined {
    return this._dropdown;
  }

  /** The first (for most selectors, the only) dropdown list. */
  get dropdownList(): OmakaseDropdownList | undefined {
    return this._dropdownLists[0];
  }

  get dropdownLists(): OmakaseDropdownList[] {
    return this._dropdownLists;
  }

  get toggle(): OmakaseDropdownToggle | undefined {
    return this._toggle;
  }

  /** The elements given in the `toggle` slot. */
  get toggleContent(): HTMLElement[] {
    return this._toggleContent;
  }

  get alignment(): OmakaseDropdownAlignment {
    const alignment = this.getAttribute(OmakaseDropdownSelectorAttributes.ALIGNMENT);
    return alignment === 'left' || alignment === 'right' ? alignment : 'center';
  }

  get caret(): boolean {
    return this.hasAttribute(OmakaseDropdownSelectorAttributes.CARET);
  }

  set caret(caret: boolean) {
    this.toggleAttribute(OmakaseDropdownSelectorAttributes.CARET, caret);
  }

  get toggleBackground(): boolean {
    return this.hasAttribute(OmakaseDropdownSelectorAttributes.TOGGLE_BACKGROUND);
  }

  set toggleBackground(toggleBackground: boolean) {
    this.toggleAttribute(OmakaseDropdownSelectorAttributes.TOGGLE_BACKGROUND, toggleBackground);
  }

  get expandDirection(): OmakaseDropdownSelectorExpandDirection | undefined {
    const expandDirection = this.getAttribute(OmakaseDropdownSelectorAttributes.EXPAND_DIRECTION);
    return expandDirection === 'left' || expandDirection === 'right' ? expandDirection : undefined;
  }

  set expandDirection(expandDirection: OmakaseDropdownSelectorExpandDirection | undefined) {
    if (expandDirection) {
      this.setAttribute(OmakaseDropdownSelectorAttributes.EXPAND_DIRECTION, expandDirection);
    } else {
      this.removeAttribute(OmakaseDropdownSelectorAttributes.EXPAND_DIRECTION);
    }
  }

  get floating(): boolean {
    return this.hasAttribute(OmakaseDropdownSelectorAttributes.FLOATING);
  }

  set floating(floating: boolean) {
    this.toggleAttribute(OmakaseDropdownSelectorAttributes.FLOATING, floating);
    if (this._dropdown) {
      this._dropdown.isFloating = floating;
    }
  }

  get position(): OmakaseDropdownPosition {
    return this.getAttribute(OmakaseDropdownSelectorAttributes.POSITION) === 'below' ? 'below' : 'above';
  }

  /**
   * Selects the option matching `option` in `list` without closing an open dropdown needlessly: the list is only
   * updated when the selected value or its label differs.
   */
  protected selectOption(option: OmakaseDropdownListItem | undefined, list = this.dropdownList) {
    if (!list) {
      return;
    }
    const selected = list.selectedOption$.getValue();
    if (selected?.value !== option?.value || selected?.label !== option?.label) {
      list.selectedOption$.next(option);
    }
  }

  /**
   * Disables the selector while there's nothing to select (e.g. too few options), independently of {@link enabled}:
   * the selector is disabled while either says so.
   */
  protected setDisabled(disabled: boolean) {
    this._unavailable = disabled;
    this.updateDisabled();
  }

  private updateDisabled() {
    const disabled = this._unavailable || !this.enabled;
    if (this._toggle) {
      this._toggle.isDisabled = disabled;
    }
    this._toggleContent.forEach((element) => element.toggleAttribute(OmakaseDropdownToggleAttributes.DISABLED, disabled));
    if (disabled && this._dropdown && this._dropdown.style.display !== 'none') {
      this._dropdown.closeDropdown();
    }
  }

  private render() {
    const dropdownId = this.getAttribute(OmakaseDropdownSelectorAttributes.DROPDOWN) ?? `${this.dropdownIdPrefix}-${++dropdownIdCounter}`;
    const containerRight = this.getAttribute(OmakaseDropdownSelectorAttributes.CONTAINER_RIGHT);
    const dropdownClass = [this.dropdownClass, this.getAttribute(OmakaseDropdownSelectorAttributes.DROPDOWN_CLASS)].filter(Boolean).join(' ');
    const toggleClass = this.getAttribute(OmakaseDropdownSelectorAttributes.TOGGLE_CLASS);
    this._toggleContent = Array.from(this.querySelectorAll<HTMLElement>(`:scope > [slot="${OmakaseDropdownSelectorSlots.TOGGLE}"]`));
    // a plain media-chrome-button given as the toggle is styled like the control bar buttons
    this._toggleContent.filter((element) => element.localName === 'media-chrome-button').forEach((element) => element.classList.add(ControlBarComponentClasses.MEDIA_CHROME_BUTTON));

    // Built detached, so the slotted content is in the toggle before the toggle connects (it only adds its label span when empty).
    // omakase-dropdown and omakase-dropdown-list read their children on connect, and the toggle looks the dropdown up
    // by id when it connects, so the dropdown goes first and the whole subtree is inserted at once.
    // A `right` offset makes the toggle skip positioning the dropdown horizontally
    const template = document.createElement('template');
    template.innerHTML = `<omakase-dropdown id="${dropdownId}" class="${dropdownClass}" alignment="${this.alignment}" position="${this.position}" ${this.floating ? 'floating ' : ''}style="display:none;${containerRight ? `right:${containerRight}` : ''}">
        ${this.renderDropdownLists(dropdownId)}
      </omakase-dropdown>
      <omakase-dropdown-toggle dropdown="${dropdownId}" ${toggleClass ? `class="${toggleClass}"` : ''}></omakase-dropdown-toggle>`;
    template.content.querySelector('omakase-dropdown-toggle')!.append(...this._toggleContent);
    this.replaceChildren(template.content);

    this._dropdown = this.querySelector<OmakaseDropdown>('omakase-dropdown')!;
    this._dropdownLists = Array.from(this._dropdown.querySelectorAll<OmakaseDropdownList>('omakase-dropdown-list'));
    this._toggle = this.querySelector<OmakaseDropdownToggle>('omakase-dropdown-toggle')!;
    // runs after the toggle's own click handler, which positions the dropdown horizontally, and vertically when below
    this._toggle.addEventListener('click', () => this.positionDropdown());
  }

  /**
   * Anchors the bottom edge of a dropdown opening above to the toggle's top edge, and for `right` alignment its right
   * edge to the toggle's right edge (as a `right` offset, since the list can grow wider than its nominal width).
   * The host has no box of its own (`display: contents`), so the dropdown and the toggle share a containing block,
   * which is the toggle's offset parent.
   */
  private positionDropdown() {
    const container = this._toggle?.offsetParent;
    if (!this._toggle || !this._dropdown || !(container instanceof HTMLElement) || this.position !== 'above') {
      return;
    }
    const toggleTopToContainerBottom = container.clientHeight - this._toggle.offsetTop;
    this._dropdown.style.bottom = `calc(${toggleTopToContainerBottom}px + var(--omakase-dropdown-selector-offset, var(--omakase-dropdown-selector-offset-default, 10px)))`;
    if (this.alignment === 'right' && !this.hasAttribute(OmakaseDropdownSelectorAttributes.CONTAINER_RIGHT)) {
      this._dropdown.style.left = '';
      this._dropdown.style.right = `${container.clientWidth - this._toggle.offsetLeft - this._toggle.offsetWidth}px`;
    }
  }
}
