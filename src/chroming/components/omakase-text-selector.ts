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

import {filter, takeUntil} from 'rxjs';
import {getPlayerTextApi, type PlayerApi, type PlayerDetachedApi} from '../../player/player-api';
import {PlayerTextEventType} from '../../player/player-text-api';
import {PlayerTextType} from '../../player/player-text';
import type {OmakaseDropdownListItem} from '../chroming-api';
import {OmakaseDropdownSelector, OmakaseDropdownSelectorAttributes} from './omakase-dropdown-selector';

export const OmakaseTextSelectorAttributes = {
  ...OmakaseDropdownSelectorAttributes,
  OFF_OPTION: 'off-option',
};

export const OmakaseTextSelectorDomClasses = {
  DROPDOWN: 'omakase-text-selector-dropdown',
  DROPDOWN_LIST: 'omakase-text-selector-dropdown-list',
};

const offValue = '';

export class OmakaseTextSelector extends OmakaseDropdownSelector {
  protected readonly dropdownIdPrefix = 'omakase-text-dropdown';
  protected readonly dropdownClass = OmakaseTextSelectorDomClasses.DROPDOWN;

  static get observedAttributes() {
    return [...super.observedAttributes, OmakaseTextSelectorAttributes.OFF_OPTION];
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakaseTextSelectorAttributes.OFF_OPTION) {
      this.refresh();
    }
  }

  get offOption(): boolean {
    return this.hasAttribute(OmakaseTextSelectorAttributes.OFF_OPTION);
  }

  set offOption(offOption: boolean) {
    this.toggleAttribute(OmakaseTextSelectorAttributes.OFF_OPTION, offOption);
  }

  private get refreshEventTypes(): PlayerTextEventType[] {
    return [
      PlayerTextEventType.PLAYER_TEXT_LOADED,
      PlayerTextEventType.PLAYER_TEXT_UNLOADED,
      PlayerTextEventType.PLAYER_TEXT_TRACK_LOADED,
      PlayerTextEventType.PLAYER_TEXT_TRACK_UNLOADED,
      PlayerTextEventType.PLAYER_TEXT_CHANGE,
    ];
  }

  refresh() {
    if (!this.player || !this.dropdownList) {
      return;
    }
    const options = this.getOptions(this.player);
    this.dropdownList.setOptions(options);
    this.setDisabled(!options.some((option) => option.value !== offValue));
    this.selectOption(options.find((option) => option.active));
  }

  protected renderDropdownLists(dropdownId: string): string {
    return `<omakase-dropdown-list id="${dropdownId}-list" class="${OmakaseTextSelectorDomClasses.DROPDOWN_LIST} align-left" title="TEXT" width="150" max-width="250" type="radio"></omakase-dropdown-list>`;
  }

  protected subscribeToPlayer(player: PlayerApi | PlayerDetachedApi) {
    getPlayerTextApi(player)
      .onEvent$.pipe(
        filter((event) => this.refreshEventTypes.includes(event.type)),
        takeUntil(this._playerBreaker.observer)
      )
      .subscribe({
        next: () => this.refresh(),
      });
    this.refresh();
  }

  protected onOptionSelected(option: OmakaseDropdownListItem, player: PlayerApi | PlayerDetachedApi) {
    const text = getPlayerTextApi(player);
    if (option.value === (this.getShownTrackId(player) ?? offValue)) {
      return;
    }
    if (option.value === offValue) {
      text.hide().subscribe();
    } else if (option.value === this.getActiveTrackId(player)) {
      text.show().subscribe();
    } else {
      text.switchTrack(option.value, true).subscribe();
    }
  }

  private getOptions(player: PlayerApi | PlayerDetachedApi): OmakaseDropdownListItem[] {
    const shownTrackId = this.getShownTrackId(player);
    const selectedTrackId = this.offOption ? shownTrackId : this.getActiveTrackId(player);
    const tracks = [...this.getTracks(player, PlayerTextType.MAIN), ...this.getTracks(player, PlayerTextType.SIDECAR)];
    const trackOptions = tracks.map((track, index) => ({
      value: track.id,
      label: track.label ?? `captions ${index + 1}`,
      active: track.id === selectedTrackId,
    }));
    return this.offOption ? [{value: offValue, label: 'Off', active: !shownTrackId}, ...trackOptions] : trackOptions;
  }

  private getTracks(player: PlayerApi | PlayerDetachedApi, type: PlayerTextType.MAIN | PlayerTextType.SIDECAR) {
    const text = 'text' in player ? player.text : player.textInternal;
    return type === PlayerTextType.MAIN ? text.getTracks(PlayerTextType.MAIN) : text.getTracks(PlayerTextType.SIDECAR);
  }

  private getPlayerTracks(player: PlayerApi | PlayerDetachedApi) {
    const tracks = getPlayerTextApi(player).state.tracks;
    return [...tracks[PlayerTextType.MAIN], ...tracks[PlayerTextType.SIDECAR]];
  }

  private getActiveTrackId(player: PlayerApi | PlayerDetachedApi): string | undefined {
    return this.getPlayerTracks(player).find((track) => track.active)?.trackId;
  }

  private getShownTrackId(player: PlayerApi | PlayerDetachedApi): string | undefined {
    return this.getPlayerTracks(player).find((track) => track.active && track.shown)?.trackId;
  }
}
