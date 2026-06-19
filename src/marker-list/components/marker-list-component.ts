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

import {Observable, Subject, takeUntil} from 'rxjs';
import Decimal from 'decimal.js';
import Sortable from 'sortablejs';
import type {MarkerListItem} from '../marker-list-item';
import {MarkerListEventType, type MarkerListEvent} from '../marker-list-event';
import type {MarkerListComponentModeController} from '../mode-controllers/marker-list-component-mode-controller';
import {TimelineMarkerListComponentModeController} from '../mode-controllers/timeline-marker-list-component-mode-controller';
import {OmakaseInlineEdit} from './omakase-inline-edit';
import {markerListDefaultTemplates} from '../marker-list-templates';
import {CutlistMarkerListComponentModeController} from '../mode-controllers/cutlist-marker-list-component-mode-controller';
import {MediaTemporalFormat} from '../../common';
import {ObserverBreaker} from '../../common/observer-breaker';
import type {OmakasePlayerApi} from '../../omakase-player-api';
import {MarkerType, TimedItemTemporalType, type MarkerState} from '../../media';
import {PLAYER_CONTROLLER_DEFAULTS} from '../../constants';

export const MarkerListAttributes = {
  MARKER_ID: 'data-marker-id',
};

export const MarkerListDomClasses = {
  BODY: 'omakase-marker-list-body',
  WRAPPER: 'omakase-marker-list-wrapper',
  ACTIVE: 'active',
  DRAG_HANDLE: 'drag-handle',
  DRAG_GHOST: 'drag-ghost',
  DRAG_ITEM: 'drag-item',
};

export enum MarkerListMode {
  TIMELINE = 'TIMELINE',
  CUTLIST = 'CUTLIST',
}

export interface MarkerListMarker {
  item: MarkerListItem;
  element: HTMLElement;
}

export class MarkerListComponent extends HTMLElement {
  private readonly _onEvent$ = new Subject<MarkerListEvent>();

  private _markers: MarkerListItem[] = [];
  private _markersById: Map<MarkerState['id'], MarkerListMarker> = new Map();
  private _defaultTemplate: HTMLTemplateElement;
  private _template: HTMLTemplateElement;
  private _headerElement: HTMLElement;
  private _emptyElement: HTMLElement;
  private _loadingElement: HTMLElement;
  private _listElement: HTMLElement;
  private _listBodyElement: HTMLElement;
  private _player?: OmakasePlayerApi | undefined;
  private _isLoading = false;
  private _labelEditable = false;
  private _timeEditable = false;
  private _labelOptions?: string[];
  private _labelValidationFn?: (text: string | undefined) => boolean;
  private _mode: MarkerListMode = MarkerListMode.TIMELINE;
  private _modeController: MarkerListComponentModeController = new TimelineMarkerListComponentModeController();
  private _sortable?: Sortable;
  protected _destroyBreaker = new ObserverBreaker();

  constructor() {
    super();

    if (!customElements.get('omakase-inline-edit')) {
      customElements.define('omakase-inline-edit', OmakaseInlineEdit);
    }

    this.attachShadow({mode: 'open'});

    const style = document.createElement('style');
    style.innerHTML = markerListDefaultTemplates.style;

    const wrapper = document.createElement('div');
    wrapper.classList.add(MarkerListDomClasses.WRAPPER);

    const slot = document.createElement('slot');
    slot.name = 'item-template';

    this._listElement = document.createElement('div');
    this._listBodyElement = document.createElement('div');
    this._headerElement = this.getDefaultHtmlElement('header');
    this._emptyElement = this.getDefaultHtmlElement('empty');
    this._loadingElement = this.getDefaultHtmlElement('loading');
    this._defaultTemplate = this.getDefaultHtmlElement('row') as HTMLTemplateElement;
    this._template = this._defaultTemplate;

    this._markers = [];

    slot.addEventListener('slotchange', () => {
      this._template = this.getTemplate();
      this.renderList();
    });

    wrapper.appendChild(slot);
    wrapper.appendChild(this._listElement);
    this.shadowRoot!.appendChild(style);
    this.shadowRoot!.appendChild(wrapper);

    this.renderList();
  }

  set player(player: OmakasePlayerApi) {
    this._player = player;
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
    this._labelEditable = isEditable;
  }

  set timeEditable(isEditable: boolean) {
    this._timeEditable = isEditable;
  }

  set labelOptions(options: string[]) {
    this._labelOptions = options;
  }

  set labelValidationFn(validationFn: (text: string | undefined) => boolean) {
    this._labelValidationFn = validationFn;
  }

  set mode(newMode: MarkerListMode) {
    this._mode = newMode;
    if (this._mode === MarkerListMode.CUTLIST) {
      this._modeController = new CutlistMarkerListComponentModeController();
    } else {
      this._modeController = new TimelineMarkerListComponentModeController();
    }
    if (this._modeController.isReorderingEnabled()) {
      this.enableDragging();
    }
  }

  get onEvent$(): Observable<MarkerListEvent> {
    return this._onEvent$.asObservable();
  }

  updateMarker(id: string, updateValue: Partial<MarkerListItem>): void {
    const marker = this._markersById.get(id);
    if (!marker) {
      return;
    }
    Object.assign(marker.item, updateValue);
    this.setMarkerSlotValues(marker.element, marker.item);
    this.resolveMarkerPosition(marker);
  }

  updateMarkerStyle(id: string): void {
    const marker = this._markersById.get(id);
    if (!marker) {
      return;
    }
    const {markerColor, highlightMarker, canDeleteMarker} = marker.item.style;
    const colorSlot = marker.element.querySelector<HTMLElement>('[slot="color"]');
    if (colorSlot) {
      colorSlot.style.backgroundColor = markerColor;
    }
    if (highlightMarker) {
      marker.element.classList.add(MarkerListDomClasses.ACTIVE);
    } else {
      marker.element.classList.remove(MarkerListDomClasses.ACTIVE);
    }

    const deleteSlot = marker.element.querySelector<HTMLElement>('[slot="remove"]');
    if (deleteSlot) {
      if (canDeleteMarker) {
        deleteSlot.style.removeProperty('display');
      } else {
        deleteSlot.style.setProperty('display', 'none');
      }
    }
  }

  addMarker(markerItem: MarkerListItem): void {
    if (!this._markersById.has(markerItem.markerId)) {
      this._markers.push(markerItem);
      if (this._markers.length === 1) {
        this.renderList();
      } else {
        const container = this._listElement.querySelector<HTMLElement>(`.${MarkerListDomClasses.BODY}`);
        const markerElement = this.addMarkerToDom(this._template, container!, markerItem);
        const marker = {item: markerItem, element: markerElement};
        this._markersById.set(markerItem.markerId, marker);
        this.resolveMarkerPosition(marker);
      }
    }
  }

  removeMarker(id: string): void {
    const marker = this._markersById.get(id);
    if (marker) {
      this._markers.splice(this._markers.indexOf(marker.item), 1);
      if (this.markers.length === 0) {
        this.renderList();
      } else {
        marker.element.remove();
        this._markersById.delete(id);
      }
    }
  }

  reorderMarker(id: string, index: number): void {
    if (!this._modeController.isReorderingEnabled()) {
      console.error('Marker reordering is not supported in current MLC mode');
      return;
    }

    const markerIndex = this._markers.findIndex((m) => m.markerId === id);

    if (markerIndex === -1) {
      console.error(`Marker with id ${id} does not exist`);
      return;
    }

    if (index >= this._markers.length || index < -1) {
      console.error('New position index is outside the list length');
      return;
    }

    if (markerIndex === index) {
      return;
    }

    const [marker] = this._markers.splice(markerIndex, 1);
    if (marker) {
      this._markers.splice(index, 0, marker);
    }
    this.renderList();
  }

  disconnectedCallback() {
    this._destroyBreaker.destroy();
  }

  private resolveMarkerPosition(marker: MarkerListMarker): void {
    const nextMarker = this.getNextMarker(marker.item);
    const nextSibling = marker.element.nextElementSibling as HTMLElement | null;
    if (nextSibling && nextMarker?.markerId === nextSibling.getAttribute(MarkerListAttributes.MARKER_ID)) {
      return;
    }
    const container = this._listBodyElement;
    if (nextMarker) {
      const nextElement = this.getMarkerElement(nextMarker.markerId);
      container!.insertBefore(marker.element, nextElement!);
    } else {
      container!.appendChild(marker.element);
    }
  }

  private getNextMarker(markerItem: MarkerListItem): MarkerListItem | undefined {
    return this._modeController.getNextMarker(this._markers, markerItem);
  }

  private renderList(): void {
    const template = this.getTemplate();

    this._listElement.innerHTML = '';
    this._markersById.clear();

    if (this._isLoading) {
      this._listElement.appendChild(this._loadingElement);
      return;
    }

    this._listElement.appendChild(this._headerElement);

    if (!this._markers.length) {
      this._listElement.appendChild(this._emptyElement);
      return;
    }

    this._listBodyElement = document.createElement('div');
    this._listBodyElement.classList.add(MarkerListDomClasses.BODY);
    this._listElement.appendChild(this._listBodyElement);

    if (this._modeController.isReorderingEnabled()) {
      this.enableDragging();
    }

    this._markers.forEach((item) => {
      const element = this.addMarkerToDom(template, this._listBodyElement, item);
      this._markersById.set(item.markerId, {item, element});
    });
  }

  private getTemplate(): HTMLTemplateElement {
    const slot = this.shadowRoot!.querySelector('slot');
    const template = slot!.assignedNodes().find((node: any) => node.tagName == 'TEMPLATE') as HTMLTemplateElement;
    return template ?? this._defaultTemplate;
  }

  private addMarkerToDom(template: HTMLTemplateElement, container: HTMLElement, item: MarkerListItem): HTMLElement {
    const clone = document.importNode(template.content, true);
    this.setMarkerSlotValues(clone, item);
    const actionSlots = clone.querySelectorAll<HTMLElement>('[slot^="action"]');
    actionSlots.forEach((actionSlot) => {
      const action = actionSlot.getAttribute('slot')!.replace('action-', '');
      actionSlot.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        this._onEvent$.next({type: MarkerListEventType.MARKER_LIST_ITEM_ACTION, data: {item: item.state, action}});
      };
    });
    const removeSlot = clone.querySelector<HTMLElement>('[slot="remove"]');
    if (removeSlot) {
      removeSlot.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        this._onEvent$.next({type: MarkerListEventType.MARKER_LIST_ITEM_DELETE, data: {item: item.state, source: item.track}});
      };
    }
    container.appendChild(clone);
    let rowElement = container.lastChild as HTMLElement;
    if (!(rowElement instanceof HTMLDivElement)) {
      rowElement = rowElement.previousSibling as HTMLElement;
    }
    rowElement!.setAttribute(MarkerListAttributes.MARKER_ID, item.markerId);
    rowElement!.onclick = () => {
      this._onEvent$.next({type: MarkerListEventType.MARKER_LIST_ITEM_CLICK, data: {item: item.state, trackId: item.track.id}});
    };
    rowElement!.onmouseenter = () => {
      this._onEvent$.next({type: MarkerListEventType.MARKER_LIST_ITEM_MOUSE_ENTER, data: {item: item.state, trackId: item.track.id}});
    };
    rowElement!.onmouseleave = () => {
      this._onEvent$.next({type: MarkerListEventType.MARKER_LIST_ITEM_MOUSE_LEAVE, data: {item: item.state, trackId: item.track.id}});
    };
    return rowElement;
  }

  private setMarkerSlotValues(element: HTMLElement | DocumentFragment, item: MarkerListItem): void {
    const colorSlot = element.querySelector<HTMLElement>('[slot="color"]');
    if (colorSlot) {
      colorSlot.style.backgroundColor = item.style.markerColor;
    }
    const thumbnailSlot = element.querySelector<HTMLImageElement>('[slot="thumbnail"]');
    if (thumbnailSlot) {
      thumbnailSlot.src = item.thumbnailUrl ?? '';
    }
    const nameSlot = element.querySelector<HTMLElement>('[slot="name"]');
    if (nameSlot) {
      if (this._labelEditable && !item.track.areTimedItemsLocked) {
        nameSlot.innerHTML = `<omakase-inline-edit></omakase-inline-edit>`;
        const inlineEdit = element.querySelector<OmakaseInlineEdit>('omakase-inline-edit');
        inlineEdit!.setText(item.label ?? '');
        inlineEdit!.onEdit$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((label) => {
          if (item.track) {
            item.track.updateTimedItem(item.markerId, {label});
          }
        });
        if (this._labelValidationFn) {
          inlineEdit!.validationFn = this._labelValidationFn;
        }
        if (this._labelOptions) {
          inlineEdit!.setOptions(this._labelOptions);
        }
      } else {
        nameSlot.innerText = item.label ?? '';
      }
    }
    const trackSlot = element.querySelector<HTMLElement>('[slot="track"]');
    if (trackSlot) {
      trackSlot.innerHTML = item.track.label ?? '';
    }
    const startSlot = element.querySelector<HTMLElement>('[slot="start"]');
    if (startSlot) {
      const timecode = item.numStart !== undefined ? this._player!.player.convertTime(item.numStart, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE) : '';
      if (this._timeEditable && !item.track.areTimedItemsLocked) {
        startSlot.innerHTML = `<omakase-inline-edit></omakase-inline-edit>`;
        const inlineEdit = startSlot.querySelector<OmakaseInlineEdit>('omakase-inline-edit');
        inlineEdit!.setTimecode!(timecode, this._player!.player, undefined, item.numEnd);
        inlineEdit!.onEdit$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((start) => {
          let startTime = Decimal(this._player!.player.convertTime(start, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS)).plus(PLAYER_CONTROLLER_DEFAULTS.frameDurationSpillOverCorrection);
          if (item.markerType === MarkerType.MOMENT_MARKER) {
            item.track.updateTimedItem(item.markerId, {temporal: {type: TimedItemTemporalType.MOMENT, time: startTime.toString()}});
          } else if (item.markerType === MarkerType.SPANNING_MARKER) {
            item.track.updateTimedItem(item.markerId, {temporal: {type: TimedItemTemporalType.SPAN, start: startTime.toString(), end: item.end!}});
          }
        });
      } else {
        startSlot.innerHTML = item.numStart !== undefined ? this._player!.player.convertTime(item.numStart, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE) : '';
      }
    }
    const endSlot = element.querySelector<HTMLElement>('[slot="end"]');
    if (endSlot) {
      const timecode = item.numEnd !== undefined ? this._player!.player.convertTime(item.numEnd, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE) : '';
      if (this._timeEditable && !item.track.areTimedItemsLocked && item.numEnd !== undefined) {
        endSlot.innerHTML = `<omakase-inline-edit></omakase-inline-edit>`;
        const inlineEdit = endSlot.querySelector<OmakaseInlineEdit>('omakase-inline-edit');

        inlineEdit!.setTimecode!(timecode, this._player!.player, item.numStart);
        inlineEdit!.onEdit$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((end) => {
          let endTime = Decimal(this._player!.player.convertTime(end, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS)).plus(PLAYER_CONTROLLER_DEFAULTS.frameDurationSpillOverCorrection);
          item.track.updateTimedItem(item.markerId, {temporal: {type: TimedItemTemporalType.SPAN, start: item.start!, end: endTime.toString()}});
        });
      } else {
        endSlot.innerHTML = item.numEnd !== undefined ? this._player!.player.convertTime(item.numEnd, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE) : '';
      }
    }
    const durationSlot = element.querySelector<HTMLElement>('[slot="duration"]');
    if (durationSlot) {
      if (item.numStart !== undefined && item.numEnd !== undefined) {
        const startFrame = this._player!.player.convertTime(item.numStart, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
        const endFrame = this._player!.player.convertTime(item.numEnd, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
        const frameDiff = new Decimal(endFrame).minus(new Decimal(startFrame)).toNumber();
        const timeDiff = Decimal(this._player!.player.convertTime(frameDiff, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS)).plus(
          PLAYER_CONTROLLER_DEFAULTS.frameDurationSpillOverCorrection
        );
        durationSlot.innerHTML = this._player!.player.convertTime(timeDiff.toNumber(), MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE)!;
      } else {
        durationSlot.innerHTML = '';
      }
    }
    const customSlots = element.querySelectorAll<HTMLElement>('[slot^="data"]');
    customSlots.forEach((customSlot) => {
      const attributeName = customSlot.getAttribute('slot')!.replace('data-', '');
      if (item.data) {
        customSlot.innerHTML = item.data[attributeName];
      }
    });
  }

  getMarkerItem(markerId: string): MarkerListItem | undefined {
    return this._markersById.get(markerId)?.item;
  }

  private getMarkerElement(markerId: string): HTMLElement | undefined {
    return this._markersById.get(markerId)?.element;
  }

  private getDefaultHtmlElement(name: 'header' | 'loading' | 'empty' | 'row'): HTMLTemplateElement | HTMLDivElement {
    const defaultHTMLElement = document.createElement(name === 'row' ? 'template' : 'div');
    defaultHTMLElement.innerHTML = markerListDefaultTemplates[name];
    return defaultHTMLElement;
  }

  private enableDragging(): void {
    this._sortable?.destroy();
    this._sortable = new Sortable(this._listBodyElement, {
      handle: `.${MarkerListDomClasses.DRAG_HANDLE}`,
      ghostClass: MarkerListDomClasses.DRAG_GHOST,
      chosenClass: MarkerListDomClasses.DRAG_ITEM,
      onEnd: (event) => {
        const markers = [...this._markers];
        const [removed] = markers.splice(event.oldIndex!, 1);
        if (removed) {
          markers.splice(event.newIndex!, 0, removed);
        }
        this._markers = markers;
      },
    });
  }
}
