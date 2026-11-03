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

export const OmakaseControlBarRowSlots = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
};

export const OmakaseControlBarRowDomClasses = {
  LEFT: 'omakase-control-bar-row-left',
  CENTER: 'omakase-control-bar-row-center',
  RIGHT: 'omakase-control-bar-row-right',
};

export class OmakaseControlBarRow extends HTMLElement {
  private _initialized = false;

  connectedCallback() {
    this.initializeDom();
  }

  initializeDom() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    const left = document.createElement('div');
    left.classList.add(OmakaseControlBarRowDomClasses.LEFT);
    const center = document.createElement('div');
    center.classList.add(OmakaseControlBarRowDomClasses.CENTER);
    const right = document.createElement('div');
    right.classList.add(OmakaseControlBarRowDomClasses.RIGHT);

    for (const child of Array.from(this.children)) {
      const slot = child.getAttribute('slot');
      const target = slot === OmakaseControlBarRowSlots.LEFT ? left : slot === OmakaseControlBarRowSlots.RIGHT ? right : center;
      target.appendChild(child);
    }

    this.append(left, center, right);
  }
}
