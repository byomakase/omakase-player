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

import {Subject} from 'rxjs';
import {VideoControllerApi} from '../video/video-controller-api';
import {MarkerListItem} from './marker-list-item';
import {markerListDefaultTemplates} from './marker-list-templates';
import {OmakaseInlineEdit} from '../components/omakase-inline-edit';

const classes = {
  markerListBody: 'omakase-marker-list-body',
  markerListWrapper: 'omakase-marker-list-wrapper',
};

export class MarkerListComponent extends HTMLElement {
  onAction$: Subject<{marker: MarkerListItem; action: string}> = new Subject();
  onRemove$: Subject<MarkerListItem> = new Subject();
  onClick$: Subject<MarkerListItem> = new Subject();

  private _markers: MarkerListItem[] = [];
  private _defaultTemplate: HTMLTemplateElement;
  private _headerElement: HTMLElement;
  private _emptyElement: HTMLElement;
  private _loadingElement: HTMLElement;
  private _listElement: HTMLElement;
  private _videoController: VideoControllerApi | undefined;
  private _isLoading = false;
  private _nameEditable = false;
  private _nameOptions?: string[];
  private _nameValidationFn?: (text: string) => boolean;

  constructor() {
    super();

    if (!customElements.get('omakase-inline-edit')) {
      customElements.define('omakase-inline-edit', OmakaseInlineEdit);
    }

    this.attachShadow({mode: 'open'});

    const style = document.createElement('style');
    style.innerHTML = markerListDefaultTemplates.style;

    const wrapper = document.createElement('div');
    wrapper.classList.add(classes.markerListWrapper);

    const slot = document.createElement('slot');
    slot.name = 'item-template';

    this._listElement = document.createElement('div');
    this._headerElement = this.getDefaultHtmlElement('header');
    this._emptyElement = this.getDefaultHtmlElement('empty');
    this._loadingElement = this.getDefaultHtmlElement('loading');
    this._defaultTemplate = this.getDefaultHtmlElement('row') as HTMLTemplateElement;

    this._markers = [];

    slot.addEventListener('slotchange', () => {
      this.renderList();
    });

    wrapper.appendChild(slot);
    wrapper.appendChild(this._listElement);
    this.shadowRoot!.appendChild(style);
    this.shadowRoot!.appendChild(wrapper);

    this.renderList();
  }

  set videoController(videoController: VideoControllerApi) {
    this._videoController = videoController;
  }

  set headerElement(headerElement: HTMLElement) {
    this._headerElement = headerElement;
  }

  set emptyElement(emptyElement: HTMLElement) {
    this._emptyElement = emptyElement;
  }

  set loadingElement(loadingElement: HTMLElement) {
    this._loadingElement = loadingElement;
  }

  get markers(): MarkerListItem[] {
    return this._markers;
  }

  set markers(markers: MarkerListItem[]) {
    this._markers = markers;
    this.renderList();
  }

  set isLoading(isLoading: boolean) {
    this._isLoading = isLoading;
    this.renderList();
  }

  set nameEditable(isEditable: boolean) {
    this._nameEditable = isEditable;
  }

  set nameOptions(options: string[]) {
    this._nameOptions = options;
  }

  set nameValidationFn(validationFn: (text: string) => boolean) {
    this._nameValidationFn = validationFn;
  }

  updateMarker(id: string, updateValue: Partial<MarkerListItem>) {
    const markerItem = this._markers.find((m) => m.id === id);
    if (!markerItem) {
      return;
    }
    Object.assign(markerItem, updateValue);
    const listItem = this._listElement.querySelector<HTMLElement>(`#marker_${id}`);
    if (listItem) {
      this.setMarkerSlotValues(listItem, markerItem);
      this.reorderMarker(markerItem);
    }
  }

  toggleActiveClass(id: string) {
    const currentActiveItem = this._listElement.querySelector('.active');
    currentActiveItem?.classList.toggle('active');
    const listItem = this._listElement.querySelector(`#marker_${id}`);
    if (listItem !== currentActiveItem) {
      listItem?.classList.toggle('active');
    }
  }

  addMarker(markerItem: MarkerListItem) {
    this._markers.push(markerItem);
    if (this._markers.length === 1) {
      this.renderList();
    } else {
      const template = this.getTemplate();
      const container = this._listElement.querySelector<HTMLElement>(`.${classes.markerListBody}`);
      this.addMarkerToDom(template, container!, markerItem);
      this.reorderMarker(markerItem);
    }
  }

  removeMarker(id: string) {
    const markerItem = this._markers.find((item) => item.id === id);
    if (markerItem) {
      this._markers.splice(this._markers.indexOf(markerItem), 1);
      if (this.markers.length === 0) {
        this.renderList();
      } else {
        this.removeMarkerFromDom(markerItem);
      }
    }
  }

  private reorderMarker(markerItem: MarkerListItem) {
    const listItem = this._listElement.querySelector(`#marker_${markerItem.id}`);
    if (listItem) {
      const nextMarker = this.getNextMarker(markerItem);
      const nextSibling = listItem.nextElementSibling as HTMLElement | null;
      if (nextMarker?.id === nextSibling?.getAttribute('id')?.replace('marker_', '')) {
        return;
      }
      const container = this._listElement.querySelector<HTMLElement>(`.${classes.markerListBody}`);
      if (nextMarker) {
        const domElement = container!.querySelector<HTMLElement>(`#marker_${nextMarker.id}`);
        container!.insertBefore(listItem, domElement!);
      } else {
        container!.appendChild(listItem);
      }
    }
  }

  private getNextMarker(markerItem: MarkerListItem) {
    const sortedMarkers = this._markers.sort((a, b) => {
      if (a.start !== undefined && b.start !== undefined && a.start !== b.start) {
        return a.start - b.start;
      } else if (a.end !== undefined && b.end !== undefined && a.end !== b.end) {
        return a.end - b.end;
      } else {
        return 0;
      }
    });
    return sortedMarkers.find(
      (m) =>
        m.start !== undefined &&
        markerItem.start !== undefined &&
        (m.start > markerItem.start || (m.start === markerItem.start && m.end !== undefined && markerItem.end !== undefined && m.end > markerItem.end))
    );
  }

  private renderList() {
    const template = this.getTemplate();

    this._listElement.innerHTML = '';

    if (this._isLoading) {
      this._listElement.appendChild(this._loadingElement);
      return;
    }

    if (!this._markers.length) {
      this._listElement.appendChild(this._emptyElement);
      return;
    }

    this._listElement.appendChild(this._headerElement);

    const listBody = document.createElement('div');
    listBody.classList.add(classes.markerListBody);
    this._listElement.appendChild(listBody);

    this._markers.forEach((item) => {
      this.addMarkerToDom(template, listBody, item);
    });
  }

  private getTemplate(): HTMLTemplateElement {
    const slot = this.shadowRoot!.querySelector('slot');
    const template = slot!.assignedNodes().find((node: any) => node.tagName == 'TEMPLATE') as HTMLTemplateElement;
    return template ?? this._defaultTemplate;
  }

  private addMarkerToDom(template: HTMLTemplateElement, container: HTMLElement, item: MarkerListItem) {
    const clone = document.importNode(template.content, true);
    this.setMarkerSlotValues(clone, item);
    const actionSlots = clone.querySelectorAll<HTMLElement>('[slot^="action"]');
    actionSlots.forEach((actionSlot) => {
      const action = actionSlot.getAttribute('slot')!.replace('action-', '');
      actionSlot.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        this.onAction$.next({marker: item, action});
      };
    });
    const removeSlot = clone.querySelector<HTMLElement>('[slot="remove"]');
    if (removeSlot) {
      removeSlot.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        this.onRemove$.next(item);
      };
    }
    container.appendChild(clone);
    let rowElement = container.lastChild as HTMLElement;
    if (!(rowElement instanceof HTMLDivElement)) {
      rowElement = rowElement.previousSibling as HTMLElement;
    }
    rowElement!.setAttribute('id', 'marker_' + item.id);
    rowElement!.onclick = () => {
      this.onClick$.next(item);
    };
  }

  private setMarkerSlotValues(element: HTMLElement | DocumentFragment, item: MarkerListItem) {
    const colorSlot = element.querySelector<HTMLElement>('[slot="color"]');
    if (colorSlot) {
      colorSlot.style.backgroundColor = item.style.color;
    }
    const thumbnailSlot = element.querySelector<HTMLImageElement>('[slot="thumbnail"]');
    if (thumbnailSlot) {
      thumbnailSlot.src = item.thumbnail ?? '';
    }
    const nameSlot = element.querySelector<HTMLElement>('[slot="name"]');
    if (nameSlot) {
      if (this._nameEditable) {
        nameSlot.innerHTML = `<omakase-inline-edit></omakase-inline-edit>`;
        const inlineEdit = element.querySelector<OmakaseInlineEdit>('omakase-inline-edit');
        inlineEdit!.setText(item.name ?? '');
        inlineEdit!.onEdit$.subscribe((name) => {
          item.source.updateMarker(item.id, {name});
        });
        if (this._nameValidationFn) {
          inlineEdit!.validationFn = this._nameValidationFn;
        }
        if (this._nameOptions) {
          inlineEdit!.setOptions(this._nameOptions);
        }
      } else {
        nameSlot.innerText = item.name ?? '';
      }
    }
    const trackSlot = element.querySelector<HTMLElement>('[slot="track"]');
    if (trackSlot) {
      trackSlot.innerHTML = item.source?.name ?? '';
    }
    const startSlot = element.querySelector<HTMLElement>('[slot="start"]');
    if (startSlot) {
      startSlot.innerHTML = item.start !== undefined ? this._videoController!.formatToTimecode(item.start) : '';
    }
    const endSlot = element.querySelector<HTMLElement>('[slot="end"]');
    if (endSlot) {
      endSlot.innerHTML = item.end !== undefined ? this._videoController!.formatToTimecode(item.end) : '';
    }
    const durationSlot = element.querySelector<HTMLElement>('[slot="duration"]');
    if (durationSlot) {
      durationSlot.innerHTML = item.duration !== undefined ? this._videoController!.formatToTimecode(item.duration) : '';
    }
    const customSlots = element.querySelectorAll<HTMLElement>('[slot^="data"]');
    customSlots.forEach((customSlot) => {
      const attributeName = customSlot.getAttribute('slot')!.replace('data-', '');
      if (item.data) {
        customSlot.innerHTML = item.data[attributeName];
      }
    });
  }

  private removeMarkerFromDom(item: MarkerListItem) {
    const container = this._listElement.querySelector<HTMLElement>(`.${classes.markerListBody}`);
    const domElement = container!.querySelector(`#marker_${item.id}`);
    if (domElement) {
      container!.removeChild(domElement);
    }
  }

  private getDefaultHtmlElement(name: 'header' | 'loading' | 'empty' | 'row'): HTMLTemplateElement | HTMLDivElement {
    const defaultHTMLElement = document.createElement(name === 'row' ? 'template' : 'div');
    defaultHTMLElement.innerHTML = markerListDefaultTemplates[name];
    return defaultHTMLElement;
  }
}
