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

import type {Destroyable} from '../common/capabilities';
import {DomUtil} from '../dom/dom-util';
import {MarkerListComponent} from './components/marker-list-component';
import type {MarkerList} from './marker-list';

export class MarkerListDomController implements Destroyable {
  private _markerList: MarkerList;
  private _divMarkerList: HTMLElement;
  private _template?: HTMLElement | undefined;

  constructor(markerList: MarkerList) {
    this._markerList = markerList;
    if (!customElements.get('omakase-marker-list')) {
      customElements.define('omakase-marker-list', MarkerListComponent);
    }
    const divMarkerList = DomUtil.getElementById<HTMLElement>(this._markerList.config.markerListHTMLElementId);
    if (divMarkerList) {
      this._divMarkerList = divMarkerList;
    } else {
      throw new Error(`Marker list HTML element with id ${this._markerList.config.markerListHTMLElementId} not found`);
    }
    if (this._markerList.config.templateHTMLElementId) {
      this._template = DomUtil.getElementById<HTMLElement>(this._markerList.config.templateHTMLElementId);
    }
    this.createDom();
    if (this._markerList.config.styleUrl) {
      const styleUrls = Array.isArray(this._markerList.config.styleUrl) ? this._markerList.config.styleUrl : [this._markerList.config.styleUrl];
      for (const styleUrl of styleUrls) {
        this.loadStyle(styleUrl);
      }
    }
    if (this._markerList.config.headerHTMLElementId) {
      this.markerListComponent.headerElement = this.getHTMLElement(this._markerList.config.headerHTMLElementId);
    }
    if (this._markerList.config.emptyHTMLElementId) {
      this.markerListComponent.emptyElement = this.getHTMLElement(this._markerList.config.emptyHTMLElementId);
    }
    if (this._markerList.config.loadingHTMLElementId) {
      this.markerListComponent.loadingElement = this.getHTMLElement(this._markerList.config.loadingHTMLElementId);
    }
    if (this._markerList.config.timeEditable) {
      this.markerListComponent.timeEditable = this._markerList.config.timeEditable;
    }
    if (this._markerList.config.labelEditable) {
      this.markerListComponent.nameEditable = this._markerList.config.labelEditable;
    }
    if (this._markerList.config.labelOptions) {
      this.markerListComponent.labelOptions = this._markerList.config.labelOptions;
    }
    if (this._markerList.config.labelValidationFn) {
      this.markerListComponent.labelValidationFn = this._markerList.config.labelValidationFn;
    }
  }

  get markerListComponent(): MarkerListComponent {
    return this._divMarkerList.getElementsByTagName('omakase-marker-list')[0] as MarkerListComponent;
  }

  destroy() {
    this._divMarkerList.removeChild(this.markerListComponent);
  }

  private loadStyle(styleUrl: string) {
    const link = document.createElement('link');
    link.href = styleUrl;
    link.rel = 'stylesheet';
    this.markerListComponent.shadowRoot!.appendChild(link);
  }

  private createDom() {
    this._divMarkerList.innerHTML = `<omakase-marker-list>${this.getTemplateHtml()}</omakase-marker-list>`;
  }

  private getTemplateHtml(): string {
    if (this._template) {
      return `<template slot="item-template"><div class="omakase-marker-list-row">${this._template.innerHTML}</div></template>`;
    } else {
      return '';
    }
  }

  private getHTMLElement(templateId: string): HTMLElement {
    const template = DomUtil.getElementById<HTMLElement>(templateId);
    if (template instanceof HTMLTemplateElement) {
      const clone = document.importNode(template.content, true);
      const element = DomUtil.createElement('div');
      element.appendChild(clone);
      return element;
    } else {
      const element = DomUtil.createElement('div');
      element.innerHTML = template!.innerHTML;
      return element;
    }
  }
}
