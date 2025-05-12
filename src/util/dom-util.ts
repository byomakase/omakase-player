/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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
  static getElementById<T>(elementId: string): T {
    return document.getElementById(elementId) as T;
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

  static setAttribute(el: HTMLElement, attrName: string, value?: string) {
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
}
