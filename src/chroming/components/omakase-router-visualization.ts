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

import {filter, Observable, of, takeUntil} from 'rxjs';
import {ROUTER_VISUALIZATION_LABELS_DEFAULT, type RouterVisualizationTrack} from '../../router-visualization';
import {AudioRouterEventType, type AudioRouterState, type AudioRoutingConnection} from '../../audio';
import {PlayerAudioEventType, PlayerAudioType, PlayerEventType, type PlayerInternalApi} from '../../player';
import {WindowPlaybackMode} from '../../common';
import {type MainTrackConfig, type SidecarTracksConfig, RouterVisualizationBase, RouterVisualizationClasses} from '../../router-visualization/router-visualization-base';

export class OmakaseRouterVisualization extends RouterVisualizationBase {
  private _player?: PlayerInternalApi;
  private _windowPlaybackMode: WindowPlaybackMode.ATTACHED | WindowPlaybackMode.DETACHED = WindowPlaybackMode.ATTACHED;

  get windowPlaybackMode() {
    return this._windowPlaybackMode;
  }

  set windowPlaybackMode(windowPlaybackMode: WindowPlaybackMode.ATTACHED | WindowPlaybackMode.DETACHED) {
    this._windowPlaybackMode = windowPlaybackMode;
  }

  connectedCallback() {
    this.render();
  }

  protected updateMainTrack(config: MainTrackConfig | undefined) {
    this._mainTrackSetterBreaker.break();
    this._mainTrackConfig = config;
    if (!config) {
      this.renderTrack(undefined);
      return;
    }
    if (!config.track) {
      this._mainTrack = undefined;
      return;
    }
    this._mainTrack = this.prepareTrackForVisualization(config.track);

    const mainHandler = this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)!;
    const o$: Observable<any> = !mainHandler?.router ? mainHandler.createAudioRouter(config.track.maxInputNumber, this._outputs!.length) : of(true);
    o$.subscribe({
      next: () => {
        this.setAudioRouterDefaultMatrix(config.track!, config.defaultMatrix);
        this._wireMainTrackEvents();
      },
    });

    this.renderTrack(config.track);
  }

  protected setSidecarTracksConfig(config: SidecarTracksConfig) {
    if (config.tracks.length === 0) {
      this._providedSidecarTracksConfig?.tracks.forEach((track) => {
        this.renderTrack(undefined, track.trackId);
      });
    }
    this._providedSidecarTracksConfig = config;

    this._sidecarTracks = config.tracks.map((track) => {
      const sidecarAudioState = this._player!.audioInternal.getTracks(PlayerAudioType.SIDECAR).find((playerTrack) => track.trackId === playerTrack.id);

      if (sidecarAudioState) {
        return this.prepareTrackForVisualization({...track, inputNumber: sidecarAudioState.channels});
      }
      return this.prepareTrackForVisualization(track);
    }) as (RouterVisualizationTrack & {trackId: string})[];

    for (const track of config.tracks) {
      const handler = this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, track.trackId!)!;
      const o$: Observable<any> = !handler?.router ? handler.createAudioRouter(track.maxInputNumber, this._outputs!.length) : of(true);

      o$.subscribe({
        next: () => {
          this._wireSidecarTrackEvents(track.trackId!);
          for (const track of this._sidecarTracks!) {
            this.renderTrack(track, track.trackId);
          }
        },
      });
    }
  }

  protected _wireSidecarTrackEvents(trackId: string) {
    this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, trackId)!
      .router!.onEvent$.pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(takeUntil(this._detachAttachBreaker.observer))
      .pipe(filter((event) => event.type === AudioRouterEventType.AUDIO_ROUTER_CHANGE))

      .subscribe((event) => {
        this.updateTogglesFromState(this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, trackId)!.router!.state, trackId);
      });
    this.updateTogglesFromState(this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, trackId)!.router!.state, trackId);
  }

  protected _wireMainTrackEvents() {
    this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)!
      .router!.onEvent$.pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(takeUntil(this._detachAttachBreaker.observer))
      .pipe(filter((event) => event.type === AudioRouterEventType.AUDIO_ROUTER_CHANGE))

      .subscribe((event) => {
        this.updateTogglesFromState(this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)!.router!.state);
      });
    this.updateTogglesFromState(this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)!.router!.state);
  }

  set player(player: PlayerInternalApi) {
    this._player = player;

    let updateMainTrack = () => {
      const activeMainTrackId = this._player?.audioInternal.state.tracks[PlayerAudioType.MAIN].find((track) => track.active)?.trackId;
      const activeMainTrack = this._player?.audioInternal.getTracks(PlayerAudioType.MAIN).find((track) => track.id === activeMainTrackId);
      let channelCount = this._player?.audioInternal.getTracks().find((track) => track.id === activeMainTrackId)?.channels;
      if (channelCount && this._mainTrack) {
        this.updateMainTrack({
          track: {
            ...this._mainTrack,
            name: activeMainTrack?.label,
            inputNumber: channelCount,
          },
        });
      }
    };

    this._player.audioInternal.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((event) => event.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED))

      .subscribe((event) => {
        updateMainTrack();
      });

    this._player.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED))
      .subscribe(() => {
        updateMainTrack();
      });

    this._player.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING))
      .subscribe(() => {
        this.updateMainTrack(undefined);
        this.sidecarTracks = {
          tracks: [],
          defaultMatrix: [],
        };
      });

    if (!this._outputs) {
      const outputs = this.getOutputsFromAudioContext();
      if (outputs) {
        this.outputs = outputs;
      }
    }
  }

  protected setAudioRouterDefaultMatrix(track: RouterVisualizationTrack, defaultMatrix?: AudioRoutingConnection[]) {
    if (defaultMatrix) {
      if ('trackId' in track) {
        const handler = this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, track.trackId!)!;
        handler.router!.setDefaultRoutingConnections(defaultMatrix);
        this.resetAllNodes(track);
      } else {
        const handler = this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)!;
        handler.router!.setDefaultRoutingConnections(defaultMatrix);
        this.resetAllNodes(track);
      }
    }
  }

  protected renderOutputs() {
    const existingThead = this._tableElement.getElementsByTagName('thead')[0];
    if (existingThead) {
      this._tableElement.removeChild(existingThead);
    }
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    const th1 = document.createElement('th');
    th1.colSpan = 2;
    th1.classList.add(RouterVisualizationClasses.ALIGN_LEFT);
    tr.appendChild(th1);
    let th: HTMLTableCellElement;
    for (const output of this._outputs!) {
      th = document.createElement('th');
      th.innerHTML = output;
      tr.appendChild(th);
    }
    const th3 = document.createElement('th');
    th3.classList.add(RouterVisualizationClasses.ALIGN_RIGHT);
    const outputCount = document.createElement('span');
    outputCount.classList.add(RouterVisualizationClasses.ICON, this._outputs!.length > 2 ? RouterVisualizationClasses.ICON_OUTPUTS_MANY : RouterVisualizationClasses.ICON_OUTPUTS_FEW);
    th3.appendChild(outputCount);
    if (this._outputs!.length === 2) {
      th!.before(th3);
    } else {
      tr.appendChild(th3);
    }
    thead.appendChild(tr);
    this._tableElement.appendChild(thead);
  }

  protected renderTrack(track: RouterVisualizationTrack | undefined, trackId = this._mainTrackLabel) {
    const id = `${RouterVisualizationClasses.TRACK_PREFIX}-${trackId}`;
    const tbody = this.querySelector(`#${id}`) ?? document.createElement('tbody');
    tbody.innerHTML = '';
    tbody.id = id;

    if (!track) {
      // there is nothing to render, return
      return;
    }

    const labelCell = this.querySelector('thead')?.querySelector('tr')?.querySelector('th');
    if (labelCell && track?.name) {
      labelCell.innerText = track?.name;
    }

    const routingConnections =
      trackId === this._mainTrackLabel
        ? this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)?.router?.state.routingConnections
        : this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, trackId)?.router?.state.routingConnections;

    track.inputLabels!.forEach((input, inputNumber) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.classList.add(RouterVisualizationClasses.ALIGN_LEFT, RouterVisualizationClasses.LABEL);
      if (inputNumber === 0) {
        const iconDeselect = document.createElement('span');
        iconDeselect.classList.add(RouterVisualizationClasses.ICON, RouterVisualizationClasses.ICON_DESELECT);
        iconDeselect.onclick = () => {
          this.deselectAllNodes(track);
        };
        const iconReset = document.createElement('span');
        iconReset.classList.add(RouterVisualizationClasses.ICON, RouterVisualizationClasses.ICON_RESET);
        iconReset.onclick = () => {
          this.resetAllNodes(track);
        };
        td1.appendChild(iconDeselect);
        td1.appendChild(iconReset);
      }
      const td2 = document.createElement('td');
      td2.classList.add(RouterVisualizationClasses.ALIGN_RIGHT);
      td2.innerHTML = input;
      tr.append(td1, td2);
      let td: HTMLTableCellElement;
      this._outputs!.forEach((_, outputNumber) => {
        td = document.createElement('td');
        const toggle = this.getToggleElement();
        toggle.id = `${RouterVisualizationClasses.TOGGLE}-${trackId}-${inputNumber}-${outputNumber}`;

        if (routingConnections && routingConnections[inputNumber] && routingConnections[inputNumber][outputNumber] && routingConnections[inputNumber][outputNumber].connected) {
          toggle.classList.add(RouterVisualizationClasses.ACTIVE);
        }
        toggle.onclick = () => {
          const routingConnections: AudioRoutingConnection[] = [
            {
              path: {
                input: inputNumber,
                output: outputNumber,
              },
              connected: !toggle.classList.contains(RouterVisualizationClasses.ACTIVE),
            },
          ];
          if (trackId === this._mainTrackLabel) {
            this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)?.router?.updateConnections(routingConnections);
          } else {
            this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, trackId)?.router?.updateConnections(routingConnections);
          }
        };

        td.appendChild(toggle);
        tr.appendChild(td);
      });
      const td3 = document.createElement('td');
      if (this._outputs!.length === 2) {
        td!.before(td3);
      } else {
        tr.appendChild(td3);
      }
      tbody.appendChild(tr);
    });
    if (!this.querySelector(`#${id}`)) {
      this._tableElement.appendChild(tbody);
    }
    if (this._tableElement.getElementsByTagName('tbody').length > 1) {
      this._tableElement.classList.add(RouterVisualizationClasses.MULTIPLE);
    }
  }

  protected getRoutingConnections(trackId: string): AudioRoutingConnection[][] | undefined {
    return trackId === this._mainTrackLabel
      ? this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)?.router?.state.routingConnections
      : this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, trackId)?.router?.state.routingConnections;
  }

  protected updateConnections(trackId: string, routingConnections: AudioRoutingConnection[]): void {
    if (trackId === this._mainTrackLabel) {
      this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)?.router?.updateConnections(routingConnections);
    } else {
      this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, trackId)?.router?.updateConnections(routingConnections);
    }
  }

  protected getDefaultRoutingConnections(audioType: PlayerAudioType, trackId?: string): AudioRoutingConnection[] | undefined {
    if (audioType === PlayerAudioType.MAIN) {
      return this._player!.audioInternal.getHandler(PlayerAudioType.MAIN)?.router?.getDefaultRoutingConnections() ?? [];
    } else {
      return this._player!.audioInternal.getHandler(PlayerAudioType.SIDECAR, trackId!)?.router?.getDefaultRoutingConnections() ?? [];
    }
  }

  protected getOutputsFromAudioContext(): string[] | undefined {
    const outputCount = this._player!.audioInternal.getHandler(PlayerAudioType.OUTPUT)!.channelCount;
    if (outputCount && outputCount >= 6) {
      return ROUTER_VISUALIZATION_LABELS_DEFAULT.slice(0, 6);
    } else if (outputCount && outputCount >= 2) {
      return ROUTER_VISUALIZATION_LABELS_DEFAULT.slice(0, 2);
    } else {
      return undefined;
    }
  }

  protected updateTogglesFromState(state: AudioRouterState, trackId?: string | undefined) {
    trackId = trackId ?? this._mainTrackLabel;
    if (state) {
      state.routingConnections.forEach((connections) => {
        connections.forEach((connection) => {
          if (connection.connected) {
            this.querySelector(`#${RouterVisualizationClasses.TOGGLE}-${trackId}-${connection.path.input}-${connection.path.output}`)?.classList.add(RouterVisualizationClasses.ACTIVE);
          } else {
            this.querySelector(`#${RouterVisualizationClasses.TOGGLE}-${trackId}-${connection.path.input}-${connection.path.output}`)?.classList.remove(RouterVisualizationClasses.ACTIVE);
          }
        });
      });
    }
  }
}
