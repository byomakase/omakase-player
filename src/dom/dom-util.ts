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

export class DomUtil {
  static getElementByIdOrFail<T>(elementId: string): T {
    let element = this.getElementById<T>(elementId);
    if (!element) {
      throw new Error(`Cannot find element with id ${elementId}`);
    }
    return element;
  }

  static getElementById<T>(elementId: string): T | undefined {
    let element = document.getElementById(elementId);
    return element ? (element as T) : void 0;
  }

  static getElementByClass<T>(className: string, parentElement?: HTMLElement): T {
    return (parentElement ?? document).querySelector(`.${className}`) as T;
  }

  static createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
    return document.createElement(tagName);
  }

  static getAttribute(el: HTMLElement, attrName: string, defaultValue: any = null) {
    return el.getAttribute(attrName) ?? defaultValue;
  }

  static setAttributes(el: HTMLElement, attrs: Record<string, string | undefined>) {
    for (const [attrName, value] of Object.entries(attrs)) {
      this.setAttribute(el, attrName, value);
    }
  }

  static setAttribute(el: HTMLElement, attrName: string, value: string | undefined) {
    if (value === undefined) {
      if (el.hasAttribute(attrName)) {
        el.removeAttribute(attrName);
      }
      return;
    }
    const nextValue = `${value}`;
    if (this.getAttribute(el, attrName, undefined) === nextValue) return;
    el.setAttribute(attrName, nextValue);
  }

  static removeElementById(elementId: string): void {
    const el = document.getElementById(elementId);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  static showElements(...element: Array<Element | undefined | null>): typeof DomUtil {
    element.forEach((element) => {
      if (!element) {
        return;
      }
      element.classList.remove('d-none');
    });
    return this;
  }

  static hideElements(...element: Array<Element | undefined | null>): typeof DomUtil {
    element.forEach((element) => {
      if (!element) {
        return;
      }
      element.classList.add('d-none');
    });
    return this;
  }

  static isShown(element: Element): boolean {
    return element && !element.classList.contains('d-none');
  }

  static getPixelValue(value: number): string {
    return `${value}px`;
  }

  static getPercentValue(value: number): string {
    return `${100 * value}%`;
  }
}
