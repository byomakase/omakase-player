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
import {PlayerAudioEventType} from '../../player/player-audio-api';
import {PlayerAudioType} from '../../player/player-audio';
import type {AudioHandlerApi} from '../../audio/audio-handler';
import {BrowserProvider} from '../../common/browser-provider';
import {DomUtil} from '../../dom/dom-util';
import type {OmakaseDropdownListItem} from '../chroming-api';
import type {OmakaseRouterVisualization} from './omakase-router-visualization';
import {OmakaseDropdownSelector} from './omakase-dropdown-selector';

export const OmakaseAudioRouterSelectorAttributes = {
  CHANGED: 'changed',
};

export const OmakaseAudioRouterSelectorDomClasses = {
  DROPDOWN: 'omakase-audio-router-selector-dropdown',
  ICON: 'media-chrome-audio-router',
};

interface AudioRouterTarget {
  type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR;
  trackId: string;
  label: string | undefined;
  channels: number;
}

export class OmakaseAudioRouterSelector extends OmakaseDropdownSelector {
  protected readonly dropdownIdPrefix = 'omakase-audio-router-dropdown';
  protected readonly dropdownClass = OmakaseAudioRouterSelectorDomClasses.DROPDOWN;
  protected override readonly toggleIconClass = OmakaseAudioRouterSelectorDomClasses.ICON;

  private _router: OmakaseRouterVisualization | undefined;
  private _routerTargetKey: string | undefined;
  private _toggleListening = false;

  private get refreshEventTypes(): PlayerAudioEventType[] {
    return [
      PlayerAudioEventType.PLAYER_AUDIO_LOADED,
      PlayerAudioEventType.PLAYER_AUDIO_UNLOADED,
      PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED,
      PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED,
      PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED,
      PlayerAudioEventType.PLAYER_AUDIO_CHANGE,
    ];
  }

  /** Whether the routing of the active audio track differs from its default routing. */
  get changed(): boolean {
    return this.hasAttribute(OmakaseAudioRouterSelectorAttributes.CHANGED);
  }

  override connectedCallback() {
    super.connectedCallback();
    if (!this._toggleListening && this.toggle) {
      this._toggleListening = true;
      // queued after the toggle's own click handler, which shows the dropdown in a timeout
      this.toggle.addEventListener('click', () => setTimeout(() => this.onToggled()));
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.hideRouter();
  }

  /** Updates the availability, the `changed` attribute and an open router from the player's audio state. */
  refresh() {
    const player = this.player;
    if (!player || !this.dropdown) {
      return;
    }
    const target = this.getTarget(player);
    this.setDisabled(!target);
    this.toggleAttribute(OmakaseAudioRouterSelectorAttributes.CHANGED, !!target && this.isRoutingChanged(this.getHandler(player, target)));
    if (this._router && this.getTargetKey(target) !== this._routerTargetKey) {
      if (target) {
        this.showRouter(player, target);
      } else {
        this.hideRouter();
      }
    }
  }

  protected renderDropdownLists(): string {
    return '';
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

    this.dropdown!.onClose$.pipe(takeUntil(this._playerBreaker.observer)).subscribe({
      next: () => this.hideRouter(),
    });

    this.refresh();
  }

  protected onOptionSelected(_option: OmakaseDropdownListItem, _player: PlayerApi | PlayerDetachedApi): void {
    // the fly-out has no options
  }

  private onToggled() {
    const player = this.player;
    const dropdown = this.dropdown;
    if (!player || !dropdown || dropdown.style.display === 'none') {
      return;
    }
    const target = this.getTarget(player);
    if (!target) {
      dropdown.closeDropdown();
      return;
    }
    this.showRouter(player, target);
    this.positionRouterDropdown();
  }

  /**
   * The toggle positions the dropdown from the width of its lists, and this one has none, so the dropdown is aligned
   * again once it's shown and has a width. A `right` offset, set for `right` alignment above the toggle or with
   * `container-right`, already positions it.
   */
  private positionRouterDropdown() {
    const toggle = this.toggle;
    const dropdown = this.dropdown;
    if (!toggle || !dropdown || dropdown.style.right) {
      return;
    }
    const width = dropdown.offsetWidth;
    if (this.alignment === 'center') {
      dropdown.style.left = DomUtil.getPixelValue(toggle.offsetLeft + toggle.offsetWidth / 2 - width / 2);
    } else if (this.alignment === 'right') {
      dropdown.style.left = DomUtil.getPixelValue(toggle.offsetLeft + toggle.offsetWidth - width);
    }
  }

  private getTarget(player: PlayerApi | PlayerDetachedApi): AudioRouterTarget | undefined {
    const audio = getPlayerAudioApi(player);
    const tracks = audio.state.tracks;
    const activeMainTrackId = tracks[PlayerAudioType.MAIN].find((track) => track.active)?.trackId;
    if (activeMainTrackId) {
      if (BrowserProvider.instance.isSafari) {
        return undefined;
      }
      return this.toTarget(
        PlayerAudioType.MAIN,
        this.getAudioTracks(player, PlayerAudioType.MAIN).find((track) => track.id === activeMainTrackId)
      );
    }
    const activeSidecarTrackId = tracks[PlayerAudioType.SIDECAR].find((track) => track.active)?.trackId;
    return this.toTarget(
      PlayerAudioType.SIDECAR,
      this.getAudioTracks(player, PlayerAudioType.SIDECAR).find((track) => track.id === activeSidecarTrackId)
    );
  }

  private toTarget(type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR, track: {id: string; label?: string | undefined; channels?: number | undefined} | undefined): AudioRouterTarget | undefined {
    if (!track?.channels) {
      return undefined;
    }
    return {type, trackId: track.id, label: track.label, channels: track.channels};
  }

  private getTargetKey(target: AudioRouterTarget | undefined): string | undefined {
    return target ? `${target.type}:${target.trackId}:${target.channels}` : undefined;
  }

  private getAudioTracks(player: PlayerApi | PlayerDetachedApi, type: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR) {
    const audio = 'audio' in player ? player.audio : player.audioInternal;
    return type === PlayerAudioType.MAIN ? audio.getTracks(PlayerAudioType.MAIN) : audio.getTracks(PlayerAudioType.SIDECAR);
  }

  /** Whether a handler's routing differs from its router's default routing. A handler without a router has the default routing. */
  private isRoutingChanged(handler: AudioHandlerApi | undefined): boolean {
    const router = handler?.router;
    if (!router) {
      return false;
    }
    const connections = router.state.routingConnections.flat();
    const defaultConnections = router.getDefaultRoutingConnections();
    return connections.some((connection) => {
      const defaultConnection = defaultConnections.find((candidate) => candidate.path.input === connection.path.input && candidate.path.output === connection.path.output);
      return !!defaultConnection && defaultConnection.connected !== connection.connected;
    });
  }

  private getHandler(player: PlayerApi | PlayerDetachedApi, target: AudioRouterTarget) {
    const audio = getPlayerAudioApi(player);
    return target.type === PlayerAudioType.MAIN ? audio.getHandler(PlayerAudioType.MAIN) : audio.getHandler(PlayerAudioType.SIDECAR, target.trackId);
  }

  /** Shows the router of the target track in the dropdown, replacing a router shown before. */
  private showRouter(player: PlayerApi | PlayerDetachedApi, target: AudioRouterTarget) {
    this.hideRouter();
    const router = document.createElement('omakase-router-visualization') as OmakaseRouterVisualization;
    this.dropdown!.append(router);
    router.player = player;
    const track = {name: target.label, maxInputNumber: target.channels, inputNumber: target.channels};
    if (target.type === PlayerAudioType.MAIN) {
      router.mainTrack = {track};
    } else {
      router.sidecarTracks = {tracks: [{...track, trackId: target.trackId}]};
    }
    this._router = router;
    this._routerTargetKey = this.getTargetKey(target);
  }

  private hideRouter() {
    if (this._router) {
      this._router.destroy();
      this._router.remove();
      this._router = undefined;
      this._routerTargetKey = undefined;
    }
  }
}
