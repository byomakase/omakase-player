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

import {MediaChromeButton} from 'media-chrome';

export const ControlBarComponentAttributes = {
  DISABLED: 'disabled',
  SHORTCUT_DISABLED: 'shortcut-disabled',
  SHORTCUT: 'shortcut',
  HIDDEN: 'hidden',
};

export const ControlBarComponentClasses = {
  MEDIA_CHROME_BUTTON: 'media-chrome-button',
};

export interface ControlBarComponentApi {
  enabled: boolean;
  shortcutEnabled: boolean;
  shortcut: string | undefined;
  visible: boolean;

  /**
   * Enables or disables the component
   * @param enabled
   */
  setEnabled(enabled: boolean): void;

  /**
   * Enables or disables the component's keyboard shortcut
   * @param enabled
   */
  setShortcutEnabled(enabled: boolean): void;

  /**
   * Sets the key of the component's keyboard shortcut, overriding the key of its action, or restores the action's key when `undefined`
   * @param shortcut
   */
  setShortcut(shortcut: string | undefined): void;

  /**
   * Shows or hides the component
   * @param visible
   */
  setVisible(visible: boolean): void;
}

type ElementConstructor = new (...args: any[]) => HTMLElement;

type AttributeChangedCallback = (name: string, oldValue: string | null, newValue: string | null) => void;

type ConnectedCallback = () => void;

const controlBarComponents = new WeakSet<Element>();

export const isControlBarComponent = (element: Element): element is HTMLElement & ControlBarComponentApi => controlBarComponents.has(element);

export const isShortcutEnabled = (element: Element): boolean => !element.hasAttribute(ControlBarComponentAttributes.DISABLED) && !element.hasAttribute(ControlBarComponentAttributes.SHORTCUT_DISABLED);

export function ControlBarComponent<T extends ElementConstructor>(Base: T) {
  return class extends Base implements ControlBarComponentApi {
    constructor(...args: any[]) {
      super(...args);
      controlBarComponents.add(this);
    }

    static get observedAttributes(): string[] {
      const baseAttributes = (Base as unknown as {observedAttributes?: string[]}).observedAttributes ?? [];
      return Array.from(new Set([...baseAttributes, ControlBarComponentAttributes.DISABLED]));
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
      (Base.prototype as {attributeChangedCallback?: AttributeChangedCallback}).attributeChangedCallback?.call(this, name, oldValue, newValue);
    }

    connectedCallback(): void {
      (Base.prototype as {connectedCallback?: ConnectedCallback}).connectedCallback?.call(this);
      if (this instanceof MediaChromeButton) {
        this.classList.add(ControlBarComponentClasses.MEDIA_CHROME_BUTTON);
      }
    }

    get enabled(): boolean {
      return !this.hasAttribute(ControlBarComponentAttributes.DISABLED);
    }

    set enabled(enabled: boolean) {
      if (enabled) {
        this.removeAttribute(ControlBarComponentAttributes.DISABLED);
      } else {
        this.setAttribute(ControlBarComponentAttributes.DISABLED, '');
      }
    }

    get shortcutEnabled(): boolean {
      return !this.hasAttribute(ControlBarComponentAttributes.SHORTCUT_DISABLED);
    }

    set shortcutEnabled(enabled: boolean) {
      this.toggleAttribute(ControlBarComponentAttributes.SHORTCUT_DISABLED, !enabled);
    }

    get shortcut(): string | undefined {
      return this.getAttribute(ControlBarComponentAttributes.SHORTCUT) ?? undefined;
    }

    set shortcut(shortcut: string | undefined) {
      if (shortcut === undefined) {
        this.removeAttribute(ControlBarComponentAttributes.SHORTCUT);
      } else {
        this.setAttribute(ControlBarComponentAttributes.SHORTCUT, shortcut);
      }
    }

    get visible(): boolean {
      return !this.hidden;
    }

    set visible(visible: boolean) {
      this.hidden = !visible;
    }

    setEnabled(enabled: boolean): void {
      this.enabled = enabled;
    }

    setShortcutEnabled(enabled: boolean): void {
      this.shortcutEnabled = enabled;
    }

    setShortcut(shortcut: string | undefined): void {
      this.shortcut = shortcut;
    }

    setVisible(visible: boolean): void {
      this.visible = visible;
    }
  };
}
