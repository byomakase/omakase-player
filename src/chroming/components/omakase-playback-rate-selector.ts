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
import type {PlayerApi, PlayerDetachedApi} from '../../player/player-api';
import {PlayerEventType} from '../../player/player-event';
import type {OmakaseDropdownListItem} from '../chroming-api';
import {OmakaseDropdownSelector, OmakaseDropdownSelectorAttributes} from './omakase-dropdown-selector';
import {PLAYER_CONTROLLER_DEFAULTS} from '../../constants';

export const OmakasePlaybackRateSelectorAttributes = {
  ...OmakaseDropdownSelectorAttributes,
  RATES: 'rates',
};

export const OmakasePlaybackRateSelectorDomClasses = {
  DROPDOWN: 'omakase-speed-dropdown',
  DROPDOWN_LIST: 'omakase-speed-dropdown-list',
};

export const DEFAULT_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 2, 4, 8];

const isValidPlaybackRate = (rate: number) => Number.isFinite(rate) && rate >= PLAYER_CONTROLLER_DEFAULTS.minPlaybackRate && rate <= PLAYER_CONTROLLER_DEFAULTS.maxPlaybackRate;

function parsePlaybackRates(value: string | null): number[] {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    return [...DEFAULT_PLAYBACK_RATES];
  }
  const rates = new Set<number>();
  const invalid: string[] = [];
  for (const entry of entries) {
    const rate = Number(entry);
    if (isValidPlaybackRate(rate)) {
      rates.add(rate);
    } else {
      invalid.push(entry);
    }
  }
  if (invalid.length > 0) {
    console.warn(
      `omakase-playback-rate-selector: ignoring invalid playback rates ${invalid.join(', ')}. Playback rates must be numbers from ${PLAYER_CONTROLLER_DEFAULTS.minPlaybackRate} to ${PLAYER_CONTROLLER_DEFAULTS.maxPlaybackRate}.`
    );
  }
  if (rates.size === 0) {
    console.warn(`omakase-playback-rate-selector: no valid playback rates given, using the default rates ${DEFAULT_PLAYBACK_RATES.join(', ')}.`);
    return [...DEFAULT_PLAYBACK_RATES];
  }
  return [...rates].sort((a, b) => a - b);
}

const playbackRateOption = (rate: number): OmakaseDropdownListItem => ({value: `${rate}`, label: `${rate}x`});

export class OmakasePlaybackRateSelector extends OmakaseDropdownSelector {
  protected readonly dropdownIdPrefix = 'omakase-playback-rate-dropdown';
  protected readonly dropdownClass = OmakasePlaybackRateSelectorDomClasses.DROPDOWN;

  private _rates = [...DEFAULT_PLAYBACK_RATES];

  static get observedAttributes() {
    return [...super.observedAttributes, OmakasePlaybackRateSelectorAttributes.RATES];
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakasePlaybackRateSelectorAttributes.RATES && oldValue !== newValue) {
      this._rates = parsePlaybackRates(newValue);
      this.renderRates();
    }
  }

  get rates(): number[] {
    return [...this._rates];
  }

  set rates(rates: number[]) {
    this.setAttribute(OmakasePlaybackRateSelectorAttributes.RATES, rates.join(','));
  }

  /**
   * Selected playback rate. Setting it selects the matching option, which in turn sets the player's
   * playback rate if it differs.
   */
  get playbackRate(): number | undefined {
    const value = this.dropdownList?.selectedOption$.getValue()?.value;
    return value !== undefined ? parseFloat(value) : undefined;
  }

  set playbackRate(playbackRate: number) {
    this.selectOption(playbackRateOption(playbackRate));
  }

  protected renderDropdownLists(dropdownId: string): string {
    const rates = this._rates;
    const selectedRate = this.getDefaultRate();
    return `<omakase-dropdown-list id="${dropdownId}-list" class="${OmakasePlaybackRateSelectorDomClasses.DROPDOWN_LIST}" title="SPEED" width="76">
        ${rates.map((rate) => `<omakase-dropdown-option ${rate === selectedRate ? 'selected ' : ''}value="${rate}">${rate}x</omakase-dropdown-option>`).join('')}
      </omakase-dropdown-list>`;
  }

  private renderRates() {
    const list = this.dropdownList;
    if (!list) {
      return;
    }
    const selectedRate = this.player?.playerSession.playback.playbackRate ?? this.playbackRate ?? this.getDefaultRate();
    list.setOptions(this._rates.map(playbackRateOption));
    list.selectedOption$.next(playbackRateOption(selectedRate));
  }

  private getDefaultRate(): number {
    return this._rates.includes(PLAYER_CONTROLLER_DEFAULTS.playbackRate) ? PLAYER_CONTROLLER_DEFAULTS.playbackRate : this._rates[0]!;
  }

  protected subscribeToPlayer(player: PlayerApi | PlayerDetachedApi) {
    player.onEvent$
      .pipe(
        filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_RATE_UPDATE),
        takeUntil(this._playerBreaker.observer)
      )
      .subscribe({
        next: (event) => {
          this.playbackRate = event.data.playbackRate;
        },
      });
    this.playbackRate = player.playerSession.playback.playbackRate;
  }

  protected onOptionSelected(option: OmakaseDropdownListItem, player: PlayerApi | PlayerDetachedApi) {
    const rate = parseFloat(option.value);
    if (rate !== player.playerSession.playback.playbackRate) {
      player.setPlaybackRate(rate);
    }
  }
}
