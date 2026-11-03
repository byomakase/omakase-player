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

import {UrlUtil} from '../util/url-util';
// @ts-ignore
import thumbnailPlaceholderLight from '../../assets/images/thumbnail-placeholder-light.svg?raw';
// @ts-ignore
import deleteIcon from '../../images/marker-list-delete.svg?raw';

const thumbnailPlaceholderDataUri = UrlUtil.formatBase64Url('image/svg+xml', btoa(thumbnailPlaceholderLight));

export const markerListDefaultTemplates = {
  style: `
      .flex-table {
        display: flex;
        flex-direction: column;
      }
      .flex-row {
        display: flex;
        flex-direction: row;
        cursor: pointer;
        border-bottom: var(--omakase-marker-list-border-width, 1px) solid var(--omakase-marker-list-border-color, black);
        font-family: var(--omakase-marker-list-font-family, 'Lato');
        font-size: var(--omakase-marker-list-font-size, 14px);
        color: var(--omakase-marker-list-text-color, black);
      }
      .flex-row.bordered {
        border-left: var(--omakase-marker-list-outer-border-width, var(--omakase-marker-list-border-width, 1px)) solid var(--omakase-marker-list-outer-border-color, var(--omakase-marker-list-border-color, black));
        border-right: var(--omakase-marker-list-outer-border-width, var(--omakase-marker-list-border-width, 1px)) solid var(--omakase-marker-list-outer-border-color, var(--omakase-marker-list-border-color, black));
        overflow: hidden;
        background-color: var(--omakase-marker-list-row-background-color, transparent);
      }
      .omakase-marker-list-body > .flex-row.bordered:first-child {
        border-top: var(--omakase-marker-list-outer-border-width, var(--omakase-marker-list-border-width, 1px)) solid var(--omakase-marker-list-outer-border-color, var(--omakase-marker-list-border-color, black));
        border-top-left-radius: var(--omakase-marker-list-border-radius, 0px);
        border-top-right-radius: var(--omakase-marker-list-border-radius, 0px);
      }
      .omakase-marker-list-body > .flex-row.bordered:last-child {
        border-bottom: var(--omakase-marker-list-outer-border-width, var(--omakase-marker-list-border-width, 1px)) solid var(--omakase-marker-list-outer-border-color, var(--omakase-marker-list-border-color, black));
        border-bottom-left-radius: var(--omakase-marker-list-border-radius, 0px);
        border-bottom-right-radius: var(--omakase-marker-list-border-radius, 0px);
      }
      .flex-row.bordered.active {
        background-color: var(--omakase-marker-list-active-row-background-color, rgba(0, 0, 0, 0.2));
      }
      .drag-ghost {
        background-color: var(--omakase-marker-list-drag-ghost-background-color, #ccc);
        color: transparent;
        border: none;
        opacity: 1;
        border-top: none !important;
      }
      .drag-ghost > * {
        visibility: hidden;
      }
      .drag-handle {
        cursor: grab;
      }
      .drag-item.flex-row {
        border-top: var(--omakase-marker-list-border-width, 1px) solid var(--omakase-marker-list-border-color, black);
      }
      .flex-cell {
        height: var(--omakase-marker-list-row-height, 60px);
        display: flex;
        align-items: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        -webkit-user-select: none;
        -ms-user-select: none;
        user-select: none;
        min-width: 0;
      }
      .name-cell, .start-cell, .end-cell, .duration-cell, .action-cell,
      .name-header-cell, .start-header-cell, .end-header-cell, .duration-header-cell, .action-header-cell {
        margin-left: var(--omakase-marker-list-cell-gap, 5px);
      }
      .header-cell {
        overflow: hidden;
        text-overflow: ellipsis;
        text-transform: uppercase;
        color: var(--omakase-marker-list-header-color, var(--omakase-marker-list-text-color, black));
        font-weight: var(--omakase-marker-list-header-font-weight, normal);
      }
      .marker-list-header-row {
        border-left: var(--omakase-marker-list-outer-border-width, 0px) solid var(--omakase-marker-list-outer-border-color, var(--omakase-marker-list-border-color, black));
        border-right: var(--omakase-marker-list-outer-border-width, 0px) solid var(--omakase-marker-list-outer-border-color, var(--omakase-marker-list-border-color, black));
        border-top: var(--omakase-marker-list-outer-border-width, 0px) solid var(--omakase-marker-list-outer-border-color, var(--omakase-marker-list-border-color, black));
        border-bottom: none;
      }
      .name-cell {
        color: var(--omakase-marker-list-name-color, var(--omakase-marker-list-text-color, black));
        font-weight: var(--omakase-marker-list-name-font-weight, normal);
      }
      .name-cell-text,
      .name-cell omakase-inline-edit,
      .name-cell .omakase-inline-edit-readonly-text {
        display: block;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .empty-row {
        border-top: var(--omakase-marker-list-border-width, 1px) solid var(--omakase-marker-list-border-color, black);
        text-align: center;
        line-height: var(--omakase-marker-list-row-height, 60px);
      }
      omakase-time-edit {
        display: inline-block;
        max-width: 100%;
        box-sizing: border-box;
      }
      .omakase-time-edit {
        width: 100%;
        box-sizing: border-box;
      }
      .omakase-time-edit-input {
        width: calc(100% + var(--omakase-marker-list-time-edit-input-width-offset, 10px));
        max-width: calc(100% + var(--omakase-marker-list-time-edit-input-width-offset, 10px));
        box-sizing: border-box;
      }
      .omakase-inline-edit-editable-text {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        min-width: 0;
      }
      .omakase-inline-edit-input {
        max-width: 100%;
        box-sizing: border-box;
      }
      .hide-duration .duration-cell,
      .hide-duration .duration-header-cell,
      .hide-end .end-cell,
      .hide-end .end-header-cell,
      .hide-start .start-cell,
      .hide-start .start-header-cell,
      .hide-thumbnail .thumbnail-cell,
      .hide-thumbnail .thumbnail-header-cell {
        display: none;
      }
      .thumbnail-cell {
        background-image: url("${thumbnailPlaceholderDataUri}");
        background-size: auto 100%;
        background-repeat: no-repeat;
      }
      .remove-icon {
        display: inline-block;
        width: var(--omakase-marker-list-icon-size, 18px);
        height: var(--omakase-marker-list-icon-size, 18px);
        color: var(--omakase-marker-list-icon-color, var(--omakase-marker-list-text-color, black));
      }
      .remove-icon svg {
        display: block;
        width: 100%;
        height: 100%;
      }`,
  row: `
        <div class="flex-row marker-list-item-row bordered">
            <div class="flex-cell color-cell"><span slot="color" style="display:inline-block;height:100%;min-width:var(--omakase-marker-list-color-cell-width, 10px)"></span></div>
            <div class="flex-cell thumbnail-cell" style="min-width:var(--omakase-marker-list-thumbnail-cell-width, 120px)"><img class="drag-handle" slot="thumbnail" style="height:100%"></div>
            <div class="flex-cell name-cell drag-handle" style="flex:1 1 0;min-width:var(--omakase-marker-list-name-cell-min-width, 100px)" slot="name"></div>
            <div class="flex-cell start-cell" style="min-width:var(--omakase-marker-list-start-cell-width, 120px)" slot="start"></div>
            <div class="flex-cell end-cell" style="min-width:var(--omakase-marker-list-end-cell-width, 120px)" slot="end"></div>
            <div class="flex-cell duration-cell" style="min-width:var(--omakase-marker-list-duration-cell-width, 120px)" slot="duration"></div>
            <div class="flex-cell action-cell" style="min-width:var(--omakase-marker-list-action-cell-width, 60px)">
                <span class="remove-icon" slot="remove">${deleteIcon}</span>
            </div>
        </div>
        `,
  header: `
          <div class="flex-row marker-list-header-row" slot="header">
            <div class="header-cell color-header-cell" style="flex-shrink:0;width:var(--omakase-marker-list-color-cell-width, 10px)"></div>
            <div class="header-cell thumbnail-header-cell" style="flex-shrink:0;width:var(--omakase-marker-list-thumbnail-cell-width, 120px)"></div>
            <div class="header-cell name-header-cell" style="flex:1 1 0;min-width:var(--omakase-marker-list-name-cell-min-width, 100px)">Name</div>
            <div class="header-cell start-header-cell" style="flex-shrink:0;width:var(--omakase-marker-list-start-cell-width, 120px)">In</div>
            <div class="header-cell end-header-cell" style="flex-shrink:0;width:var(--omakase-marker-list-end-cell-width, 120px)">Out</div>
            <div class="header-cell duration-header-cell" style="flex-shrink:0;width:var(--omakase-marker-list-duration-cell-width, 120px)">Duration</div>
            <div class="header-cell action-header-cell" style="flex-shrink:0;width:var(--omakase-marker-list-action-cell-width, 60px)"></div>
          </div>
        `,
  empty: `<div class="empty-row">No markers defined</div>`,
  loading: 'Loading...',
};
