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
import {getPlayerAudioApi, type PlayerApi, type PlayerDetachedApi} from '../../player/player-api';
import {PlayerAudioEventType, PlayerAudioMode} from '../../player/player-audio-api';
import {PlayerAudioType} from '../../player/player-audio';
import type {OmakaseDropdownListItem} from '../chroming-api';
import {OmakaseDropdownSelector} from './omakase-dropdown-selector';

export const OmakaseAudioSelectorDomClasses = {
  DROPDOWN: 'omakase-audio-selector-dropdown',
  DROPDOWN_LIST: 'omakase-audio-selector-dropdown-list',
};

export class OmakaseAudioSelector extends OmakaseDropdownSelector {
  protected readonly dropdownIdPrefix = 'omakase-audio-dropdown';
  protected readonly dropdownClass = OmakaseAudioSelectorDomClasses.DROPDOWN;

  private get refreshEventTypes(): PlayerAudioEventType[] {
    return [
      PlayerAudioEventType.PLAYER_AUDIO_LOADED,
      PlayerAudioEventType.PLAYER_AUDIO_UNLOADED,
      PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED,
      PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED,
      PlayerAudioEventType.PLAYER_AUDIO_CHANGE,
    ];
  }

  refresh() {
    if (!this.player || !this.dropdownList) {
      return;
    }
    const options = this.getOptions(this.player);
    this.dropdownList.setOptions(options);
    this.setDisabled(options.length < 2);
    this.selectOption(options.find((option) => option.active));
  }

  protected renderDropdownLists(dropdownId: string): string {
    return `<omakase-dropdown-list id="${dropdownId}-list" class="${OmakaseAudioSelectorDomClasses.DROPDOWN_LIST}" title="AUDIO" width="125" type="radio"></omakase-dropdown-list>`;
  }

  protected subscribeToPlayer(player: PlayerApi | PlayerDetachedApi) {
    getPlayerAudioApi(player)
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
    const audio = getPlayerAudioApi(player);
    if (option.value !== this.getActiveTrackId(player)) {
      audio.switchTrack(option.value, true).subscribe();
    }
  }

  private getOptions(player: PlayerApi | PlayerDetachedApi): OmakaseDropdownListItem[] {
    const activeTrackId = this.getActiveTrackId(player);
    const types: (PlayerAudioType.MAIN | PlayerAudioType.SIDECAR)[] =
      getPlayerAudioApi(player).state.audioMode === PlayerAudioMode.SINGLE ? [PlayerAudioType.MAIN, PlayerAudioType.SIDECAR] : [PlayerAudioType.MAIN];
    return types.flatMap((type) =>
      this.getTracks(player, type).map((track, index) => ({
        value: track.id,
        label: track.label ?? `${type.toLowerCase()} ${index + 1}`,
        active: track.id === activeTrackId,
      }))
    );
  }

  private getTracks(player: PlayerApi | PlayerDetachedApi, type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR) {
    const audio = 'audio' in player ? player.audio : player.audioInternal;
    return type === PlayerAudioType.MAIN ? audio.getTracks(PlayerAudioType.MAIN) : audio.getTracks(PlayerAudioType.SIDECAR);
  }

  private getActiveTrackId(player: PlayerApi | PlayerDetachedApi): string | undefined {
    const tracks = getPlayerAudioApi(player).state.tracks;
    return [...tracks[PlayerAudioType.MAIN], ...tracks[PlayerAudioType.SIDECAR]].find((track) => track.active)?.trackId;
  }
}
