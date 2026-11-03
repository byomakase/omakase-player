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

import {filter, merge, takeUntil} from 'rxjs';
import {getPlayerAudioApi, getPlayerTextApi, type PlayerApi, type PlayerDetachedApi} from '../../player/player-api';
import {PlayerAudioEventType, PlayerAudioMode} from '../../player/player-audio-api';
import {PlayerAudioType} from '../../player/player-audio';
import {PlayerTextEventType} from '../../player/player-text-api';
import {PlayerTextType} from '../../player/player-text';
import type {AudioHandlerApi} from '../../audio/audio-handler';
import {DomUtil} from '../../dom/dom-util';
import {MainMediaType} from '../../media';
import {BrowserProvider} from '../../common/browser-provider';
import type {OmakaseDropdownListItem} from '../chroming-api';
import type {OmakaseDropdownList} from './omakase-dropdown-list';
import type {OmakaseRouterVisualization} from './omakase-router-visualization';
import {OmakaseDropdownSelector, OmakaseDropdownSelectorAttributes} from './omakase-dropdown-selector';

export const OmakaseTrackSelectorAttributes = {
  ...OmakaseDropdownSelectorAttributes,
  ROUTER: 'router',
};

export const OmakaseTrackSelectorDomClasses = {
  DROPDOWN: 'omakase-audio-text-dropdown',
  AUDIO_LIST: 'omakase-audio-dropdown-list',
  SIDECAR_LIST: 'omakase-sidecar-dropdown-list',
  TEXT_LIST: 'omakase-text-dropdown-list',
  ROUTER_DROPDOWN: 'omakase-audio-router-dropdown',
  ROUTER: 'media-chrome-router',
  ROUTER_DEFAULT: 'media-chrome-router-default',
  ROUTER_CHANGED: 'media-chrome-router-changed',
  BACK: 'media-chrome-back',
};

/**
 * Whether the routing of an audio handler differs from its default routing.
 */
export function isAudioRouterUpdated(handler: AudioHandlerApi | undefined): boolean {
  if (!handler?.router) {
    return false;
  }
  const connections = handler.router.state.routingConnections;
  const defaultConnections = handler.router.getDefaultRoutingConnections();
  let i = 0;
  for (const row of connections) {
    for (const connection of row) {
      const defaultConnection = defaultConnections[i++];
      if (!defaultConnection || connection.connected !== defaultConnection.connected) {
        return true;
      }
    }
  }
  return false;
}

export class OmakaseTrackSelector extends OmakaseDropdownSelector {
  protected readonly dropdownIdPrefix = 'omakase-track-dropdown';
  protected readonly dropdownClass = OmakaseTrackSelectorDomClasses.DROPDOWN;

  // last successfully read main media type; a loaded media's type can't change, so this stays correct through the
  // moments where it can't be safely read (see updateMainMediaType)
  private _mainMediaType: MainMediaType | undefined;

  static get observedAttributes() {
    return [...super.observedAttributes, OmakaseTrackSelectorAttributes.ROUTER];
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === OmakaseTrackSelectorAttributes.ROUTER) {
      this.refresh();
    }
  }

  /** Whether active audio tracks get an action that opens the audio router. */
  get router(): boolean {
    return this.hasAttribute(OmakaseTrackSelectorAttributes.ROUTER);
  }

  set router(router: boolean) {
    this.toggleAttribute(OmakaseTrackSelectorAttributes.ROUTER, router);
  }

  get audioList(): OmakaseDropdownList | undefined {
    return this.getList(OmakaseTrackSelectorDomClasses.AUDIO_LIST);
  }

  get sidecarList(): OmakaseDropdownList | undefined {
    return this.getList(OmakaseTrackSelectorDomClasses.SIDECAR_LIST);
  }

  get textList(): OmakaseDropdownList | undefined {
    return this.getList(OmakaseTrackSelectorDomClasses.TEXT_LIST);
  }

  // read at call time: the event type enums aren't initialized yet when this module is first evaluated
  private get audioRefreshEventTypes(): PlayerAudioEventType[] {
    return [
      PlayerAudioEventType.PLAYER_AUDIO_LOADED,
      PlayerAudioEventType.PLAYER_AUDIO_UNLOADED,
      PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED,
      PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED,
      PlayerAudioEventType.PLAYER_AUDIO_CHANGE,
    ];
  }

  private get textRefreshEventTypes(): PlayerTextEventType[] {
    return [
      PlayerTextEventType.PLAYER_TEXT_LOADED,
      PlayerTextEventType.PLAYER_TEXT_UNLOADED,
      PlayerTextEventType.PLAYER_TEXT_TRACK_LOADED,
      PlayerTextEventType.PLAYER_TEXT_TRACK_UNLOADED,
      PlayerTextEventType.PLAYER_TEXT_CHANGE,
    ];
  }

  /**
   * Rebuilds the options from the player's tracks. Runs on the player's audio and text events; call it when track
   * labels change, as the player doesn't emit an event for that.
   */
  refresh() {
    const {audioList, sidecarList, textList} = this;
    if (!this.player || !audioList || !sidecarList || !textList) {
      return;
    }
    const player = this.player;
    const multiple = getPlayerAudioApi(player).state.audioMode === PlayerAudioMode.MULTIPLE;

    this.setListType(audioList, multiple ? 'checkbox' : 'radio');
    this.setListType(textList, multiple ? 'checkbox' : 'radio');
    audioList.setTitle(multiple ? 'MAIN AUDIO' : 'AUDIO');

    const mainOptions = this.getAudioOptions(player, PlayerAudioType.MAIN, 0);
    if (multiple) {
      this.setListOptions(audioList, mainOptions);
      this.setListOptions(sidecarList, this.getAudioOptions(player, PlayerAudioType.SIDECAR, 0));
    } else {
      this.setListOptions(audioList, [...mainOptions, ...this.getAudioOptions(player, PlayerAudioType.SIDECAR, mainOptions.length)]);
      this.setListOptions(sidecarList, []);
    }
    this.setListOptions(textList, this.getTextOptions(player));
    this.updateListWidths();
  }

  protected renderDropdownLists(dropdownId: string): string {
    return `<omakase-dropdown-list class="${OmakaseTrackSelectorDomClasses.AUDIO_LIST} align-left" id="${dropdownId}-audio-list" title="AUDIO" width="125" type="radio"></omakase-dropdown-list>
      <omakase-dropdown-list class="${OmakaseTrackSelectorDomClasses.SIDECAR_LIST} align-left d-none" id="${dropdownId}-sidecar-list" multiselect="true" title="SIDECAR AUDIO" width="125" type="checkbox"></omakase-dropdown-list>
      <omakase-dropdown-list class="${OmakaseTrackSelectorDomClasses.TEXT_LIST} align-left d-none" id="${dropdownId}-text-list" title="TEXT" width="125" type="radio"></omakase-dropdown-list>`;
  }

  protected subscribeToPlayer(player: PlayerApi | PlayerDetachedApi) {
    merge(
      getPlayerAudioApi(player).onEvent$.pipe(filter((event) => this.audioRefreshEventTypes.includes(event.type))),
      getPlayerTextApi(player).onEvent$.pipe(filter((event) => this.textRefreshEventTypes.includes(event.type)))
    )
      .pipe(takeUntil(this._playerBreaker.observer))
      .subscribe({
        next: () => this.refresh(),
      });

    merge(this.audioList!.selectedAction$, this.sidecarList!.selectedAction$)
      .pipe(takeUntil(this._playerBreaker.observer))
      .subscribe({
        next: (option) => this.showRouter(option.value, player),
      });

    this.dropdown!.onClose$.pipe(takeUntil(this._playerBreaker.observer)).subscribe({
      next: () => this.hideRouter(),
    });

    this.refresh();
  }

  protected onOptionSelected(option: OmakaseDropdownListItem, player: PlayerApi | PlayerDetachedApi, list: OmakaseDropdownList) {
    const multiple = getPlayerAudioApi(player).state.audioMode === PlayerAudioMode.MULTIPLE;
    let api: ReturnType<typeof getPlayerTextApi> | ReturnType<typeof getPlayerAudioApi>;
    let tracks: {trackId: string; active: boolean}[];
    if (list === this.textList) {
      api = getPlayerTextApi(player);
      tracks = [...api.state.tracks[PlayerTextType.MAIN], ...api.state.tracks[PlayerTextType.SIDECAR]];
    } else {
      api = getPlayerAudioApi(player);
      tracks = [...api.state.tracks[PlayerAudioType.MAIN], ...api.state.tracks[PlayerAudioType.SIDECAR]];
    }
    // selecting an inactive track activates it; selecting an active one deactivates it where several can be active
    const active = tracks.find((track) => track.trackId === option.value)?.active;
    if (!active) {
      api.switchTrack(option.value, true).subscribe();
    } else if (multiple) {
      api.switchTrack(option.value, false).subscribe();
    }
  }

  private getList(className: string): OmakaseDropdownList | undefined {
    return this.dropdownLists.find((list) => list.classList.contains(className));
  }

  private setListType(list: OmakaseDropdownList, type: 'radio' | 'checkbox') {
    if (list.type !== type) {
      list.type = type;
      // options get their type's class when they're created
      list.setOptions([]);
    }
  }

  private setListOptions(list: OmakaseDropdownList, options: OmakaseDropdownListItem[]) {
    const sameOptions = list.options.length === options.length && list.options.every((option, i) => option.value === options[i]!.value && option.label === options[i]!.label);
    if (sameOptions) {
      // only the state changed, update it in place
      list.updateOptions(options);
    } else {
      list.setOptions(options);
    }
    if (options.length) {
      DomUtil.showElements(list);
    } else {
      DomUtil.hideElements(list);
    }
  }

  /** Lists get narrower when there are several side by side, and may grow up to twice the narrowest one's width. */
  private updateListWidths() {
    const shownLists = this.dropdownLists.filter((list) => DomUtil.isShown(list));
    const minListWidth = Math.min(...shownLists.map((list) => list.width));
    let totalWidth = 0;
    for (const list of shownLists) {
      list.width = shownLists.length > 1 ? 125 : 150;
      list.maxWidth = Math.round(Math.max(minListWidth * 2, list.width));
      totalWidth += list.width;
    }
    this.dropdown!.style.minWidth = DomUtil.getPixelValue(totalWidth);
  }

  /** Options of the audio tracks of a type. Tracks without a label are named by their position in the list. */
  private getAudioOptions(player: PlayerApi | PlayerDetachedApi, type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, listOffset: number): OmakaseDropdownListItem[] {
    const audio = getPlayerAudioApi(player);
    const playerTracks = audio.state.tracks[type];
    return this.getAudioTracks(player, type).map((track, index) => {
      const active = !!playerTracks.find((playerTrack) => playerTrack.trackId === track.id)?.active;
      return {
        value: track.id,
        label: track.label ?? `${type.toLowerCase()} ${listOffset + index + 1}`,
        active,
        actionClass: this.getRouterActionClass(player, type, track.id, active),
      };
    });
  }

  private getTextOptions(player: PlayerApi | PlayerDetachedApi): OmakaseDropdownListItem[] {
    const playerTracks = getPlayerTextApi(player).state.tracks;
    const activeTrackIds = [...playerTracks[PlayerTextType.MAIN], ...playerTracks[PlayerTextType.SIDECAR]].filter((track) => track.active).map((track) => track.trackId);
    const text = 'text' in player ? player.text : player.textInternal;
    return [...text.getTracks(PlayerTextType.MAIN), ...text.getTracks(PlayerTextType.SIDECAR)].map((track, index) => ({
      value: track.id,
      label: track.label ?? `captions ${index + 1}`,
      active: activeTrackIds.includes(track.id),
    }));
  }

  private getAudioTracks(player: PlayerApi | PlayerDetachedApi, type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR) {
    const audio = 'audio' in player ? player.audio : player.audioInternal;
    return type === PlayerAudioType.MAIN ? audio.getTracks(PlayerAudioType.MAIN) : audio.getTracks(PlayerAudioType.SIDECAR);
  }

  /**
   * The main audio track's routing can't be changed for HLS media on Safari. Available synchronously and correctly
   * whether the session was freshly loaded or restored (e.g. in a detached player, after detaching), unlike the
   * `PLAYER_MAIN_MEDIA_LOADING` / `PLAYER_MAIN_MEDIA_LOADED` events, which a restored session doesn't emit.
   */
  private isMainRouterSupported(player: PlayerApi | PlayerDetachedApi): boolean {
    this.updateMainMediaType(player);
    return !(BrowserProvider.instance.isSafari && this._mainMediaType === MainMediaType.HLS);
  }

  private updateMainMediaType(player: PlayerApi | PlayerDetachedApi): void {
    if (!('mainMedia' in player)) {
      this._mainMediaType = player.mainMediaType;
      return;
    }
    try {
      this._mainMediaType = player.mainMedia?.mainMediaType;
    } catch {
      // unstable window playback mode, keep the last known value
    }
  }

  private getRouterActionClass(player: PlayerApi | PlayerDetachedApi, type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, trackId: string, active: boolean): string {
    if (!this.router || !active || (type === PlayerAudioType.MAIN && !this.isMainRouterSupported(player))) {
      return '';
    }
    const audio = getPlayerAudioApi(player);
    const handler = type === PlayerAudioType.MAIN ? audio.getHandler(PlayerAudioType.MAIN) : audio.getHandler(PlayerAudioType.SIDECAR, trackId);
    return `${OmakaseTrackSelectorDomClasses.ROUTER} ${isAudioRouterUpdated(handler) ? OmakaseTrackSelectorDomClasses.ROUTER_CHANGED : OmakaseTrackSelectorDomClasses.ROUTER_DEFAULT}`;
  }

  /** Shows the router of an audio track in place of the lists, with a button back to them. */
  private showRouter(trackId: string, player: PlayerApi | PlayerDetachedApi) {
    const dropdown = this.dropdown!;
    const type = this.getAudioTracks(player, PlayerAudioType.SIDECAR).some((track) => track.id === trackId) ? PlayerAudioType.SIDECAR : PlayerAudioType.MAIN;
    const track = this.getAudioTracks(player, type).find((track) => track.id === trackId);
    if (!track) {
      return;
    }

    this.hideRouter();
    dropdown.classList.add(OmakaseTrackSelectorDomClasses.ROUTER_DROPDOWN);
    const backButton = document.createElement('media-chrome-button');
    backButton.classList.add(OmakaseTrackSelectorDomClasses.BACK);
    backButton.onclick = () => this.hideRouter();
    const router = document.createElement('omakase-router-visualization') as OmakaseRouterVisualization;
    dropdown.append(router, backButton);
    router.player = player;
    if (type === PlayerAudioType.MAIN) {
      router.mainTrack = {
        track: {
          name: track.label,
          maxInputNumber: track.channels!,
          inputNumber: track.channels!,
        },
      };
    } else {
      router.sidecarTracks = {
        tracks: [
          {
            trackId: track.id,
            name: track.label,
            maxInputNumber: track.channels!,
            inputNumber: track.channels!,
          },
        ],
      };
    }
  }

  private hideRouter() {
    const dropdown = this.dropdown;
    if (!dropdown) {
      return;
    }
    dropdown.querySelector('omakase-router-visualization')?.remove();
    dropdown.querySelector(`.${OmakaseTrackSelectorDomClasses.BACK}`)?.remove();
    dropdown.classList.remove(OmakaseTrackSelectorDomClasses.ROUTER_DROPDOWN);
  }
}
