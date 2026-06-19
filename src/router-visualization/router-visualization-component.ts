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
import {AudioRouterEventType, type AudioRouterState, type AudioRoutingConnection} from '../audio/audio-router';
import {PlayerAudioEventType, PlayerAudioType, PlayerEventType} from '../player';
import {ROUTER_VISUALIZATION_LABELS_DEFAULT, type RouterVisualizationTrack} from './router-visualization';
import {WindowPlaybackMode} from '../common/window-playback';
import {type MainTrackConfig, type SidecarTracksConfig, RouterVisualizationBase, RouterVisualizationClasses} from './router-visualization-base';
import type {OmakasePlayerApi} from '../omakase-player-api';
import {SessionEventType} from '../session';

export class RouterVisualizationComponent extends RouterVisualizationBase {
  private _omakasePlayer?: OmakasePlayerApi;

  constructor() {
    super();
    this.render();
  }

  protected updateMainTrack(config: MainTrackConfig | undefined) {
    this._mainTrackSetterBreaker.break();
    this._mainTrackConfig = config;
    if (!config) {
      // undefenied can only be provided
      this.renderTrack(undefined);
      return;
    }
    if (!config.track) {
      this._mainTrack = undefined;
      return;
    }
    this._mainTrack = this.prepareTrackForVisualization(config.track);

    const mainHandler = this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)!;
    const o$: Observable<any> = !mainHandler?.router ? mainHandler.createAudioRouter(config.track.maxInputNumber, this._outputs!.length) : of(true);
    o$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
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
      //   const sidecarAudioState = this._player!.getSidecarAudioState(track.trackId);
      const sidecarAudioState = this._omakasePlayer!.player.audio.getTracks(PlayerAudioType.SIDECAR).find((playerTrack) => track.trackId === playerTrack.id);

      if (sidecarAudioState) {
        return this.prepareTrackForVisualization({...track, inputNumber: sidecarAudioState.channels});
      }
      return this.prepareTrackForVisualization(track);
    }) as (RouterVisualizationTrack & {trackId: string})[];

    for (const track of config.tracks) {
      const handler = this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, track.trackId!)!;
      const o$: Observable<any> = !handler?.router ? handler.createAudioRouter(track.maxInputNumber, this._outputs!.length) : of(true);

      o$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
        next: () => {
          this._wireSidecarTrackEvents(track.trackId!);
          for (const track of this._sidecarTracks!) {
            this.renderTrack(track, track.trackId);
          }
        },
      });
    }

    // for (const track of this._sidecarTracks) {
    //   this.renderTrack(track, track.trackId);
    // }
  }

  protected _wireSidecarTrackEvents(trackId: string) {
    let attachedDetachedModeFilter = () => {
      return this._omakasePlayer!.session.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED || this._omakasePlayer!.session.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
    };
    this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, trackId)!
      .router!.onEvent$.pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(takeUntil(this._detachAttachBreaker.observer))
      .pipe(filter((event) => event.type === AudioRouterEventType.AUDIO_ROUTER_CHANGE))
      .pipe(filter(attachedDetachedModeFilter))

      .subscribe((event) => {
        this.updateTogglesFromState(this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, trackId)!.router!.state, trackId);
      });
    this.updateTogglesFromState(this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, trackId)!.router!.state, trackId);
  }

  protected _wireMainTrackEvents() {
    let attachedDetachedModeFilter = () => {
      return this._omakasePlayer!.session.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED || this._omakasePlayer!.session.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
    };
    this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)!
      .router!.onEvent$.pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(takeUntil(this._detachAttachBreaker.observer))
      .pipe(filter((event) => event.type === AudioRouterEventType.AUDIO_ROUTER_CHANGE))
      .pipe(filter(attachedDetachedModeFilter))

      .subscribe((event) => {
        this.updateTogglesFromState(this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)!.router!.state);
      });
    this.updateTogglesFromState(this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)!.router!.state);
  }

  set player(player: OmakasePlayerApi) {
    this._omakasePlayer = player;

    this._omakasePlayer.session.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED;

    let attachedDetachedModeFilter = () => {
      return this._omakasePlayer!.session.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED || this._omakasePlayer!.session.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
    };

    this._omakasePlayer!.session.onEvent$.pipe(
      takeUntil(this._destroyBreaker.observer),
      filter((event) => event.type === SessionEventType.SESSION_WINDOW_PLAYBACK_MODE_CHANGE_REQUEST)
    ).subscribe((event) => {
      this._detachAttachBreaker.break();
    });
    this._omakasePlayer!.session.onEvent$.pipe(
      takeUntil(this._destroyBreaker.observer),
      filter((event) => event.type === SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED)
    ).subscribe((event) => {
      if (event.data.windowPlayback.mode === WindowPlaybackMode.ATTACHED || event.data.windowPlayback.mode === WindowPlaybackMode.DETACHED) {
        this.updateMainTrack(this._mainTrackConfig);
        if (this._providedSidecarTracksConfig) {
          this.sidecarTracks = this._providedSidecarTracksConfig;
        }
      }
    });

    let updateMainTrack = () => {
      const activeMainTrackId = this._omakasePlayer?.player.audio.state.tracks[PlayerAudioType.MAIN].find((track) => track.active)?.trackId;
      let channelCount = this._omakasePlayer?.player.audio.getTracks().find((track) => track.id === activeMainTrackId)?.channels;
      if (channelCount && this._mainTrack) {
        this.updateMainTrack({
          track: {
            ...this._mainTrack,
            inputNumber: channelCount,
          },
        });
      }
    };

    this._omakasePlayer.player.audio.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((event) => event.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED))
      .pipe(filter(attachedDetachedModeFilter))

      .subscribe((event) => {
        updateMainTrack();
      });

    this._omakasePlayer.player.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED))
      .pipe(filter(attachedDetachedModeFilter))
      .subscribe(() => {
        updateMainTrack();
      });

    this._omakasePlayer.player.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING))
      .pipe(filter(attachedDetachedModeFilter))
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
        const handler = this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, track.trackId!)!;
        handler.router!.setDefaultRoutingConnections(defaultMatrix);
        this.resetAllNodes(track);
      } else {
        const handler = this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)!;
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
    const deselectAll = document.createElement('span');
    deselectAll.classList.add(RouterVisualizationClasses.ICON, RouterVisualizationClasses.ICON_DESELECT_ALL);
    deselectAll.onclick = () => {
      this.deselectAllNodes();
    };
    const resetAll = document.createElement('span');
    resetAll.classList.add(RouterVisualizationClasses.ICON, RouterVisualizationClasses.ICON_RESET_ALL);
    resetAll.onclick = () => {
      this.resetAllNodes();
    };
    th1.append(deselectAll, resetAll);
    tr.appendChild(th1);
    for (const output of this._outputs!) {
      const th = document.createElement('th');
      th.innerHTML = output;
      tr.appendChild(th);
    }
    const th3 = document.createElement('th');
    th3.classList.add('align-right');
    const outputCount = document.createElement('span');
    outputCount.classList.add(RouterVisualizationClasses.ICON, this._outputs!.length > 2 ? RouterVisualizationClasses.ICON_OUTPUTS_MANY : RouterVisualizationClasses.ICON_OUTPUTS_FEW);
    th3.appendChild(outputCount);
    tr.appendChild(th3);
    thead.appendChild(tr);
    this._tableElement.appendChild(thead);
  }

  protected renderTrack(track: RouterVisualizationTrack | undefined, trackId = this._mainTrackLabel) {
    const id = `${RouterVisualizationClasses.TRACK_PREFIX}-${trackId}`;
    const tbody = document.getElementById(id) ?? document.createElement('tbody');
    tbody.innerHTML = '';
    tbody.id = id;

    if (!track) {
      // there is nothing to render, return
      return;
    }

    const routingConnections =
      trackId === this._mainTrackLabel
        ? this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)?.router?.state.routingConnections
        : this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, trackId)?.router?.state.routingConnections;

    track.inputLabels!.forEach((input, inputNumber) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.classList.add(RouterVisualizationClasses.ALIGN_LEFT, RouterVisualizationClasses.LABEL);
      if (inputNumber === 0) {
        td1.innerHTML = track.name ?? '';
        td1.title = track.name ?? '';
      } else if (inputNumber === track.inputNumber! - 1) {
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
      this._outputs!.forEach((_, outputNumber) => {
        const td = document.createElement('td');
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
            this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)?.router?.updateConnections(routingConnections);
          } else {
            this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, trackId)?.router?.updateConnections(routingConnections);
          }
        };

        td.appendChild(toggle);
        tr.appendChild(td);
      });
      const td3 = document.createElement('td');
      tr.appendChild(td3);
      tbody.appendChild(tr);
    });
    if (!document.getElementById(id)) {
      this._tableElement.appendChild(tbody);
    }
    if (this._tableElement.getElementsByTagName('tbody').length > 1) {
      this._tableElement.classList.add(RouterVisualizationClasses.MULTIPLE);
    }
  }

  protected getRoutingConnections(trackId: string): AudioRoutingConnection[][] | undefined {
    return trackId === this._mainTrackLabel
      ? this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)?.router?.state.routingConnections
      : this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, trackId)?.router?.state.routingConnections;
  }

  protected updateConnections(trackId: string, routingConnections: AudioRoutingConnection[]): void {
    if (trackId === this._mainTrackLabel) {
      this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)?.router?.updateConnections(routingConnections);
    } else {
      this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, trackId)?.router?.updateConnections(routingConnections);
    }
  }

  protected getDefaultRoutingConnections(audioType: PlayerAudioType, trackId?: string): AudioRoutingConnection[] | undefined {
    if (audioType === PlayerAudioType.MAIN) {
      return this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.MAIN)?.router?.getDefaultRoutingConnections() ?? [];
    } else {
      return this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.SIDECAR, trackId!)?.router?.getDefaultRoutingConnections() ?? [];
    }
  }

  protected updateTogglesFromState(state: AudioRouterState, trackId?: string | undefined) {
    trackId = trackId ?? this._mainTrackLabel;
    if (state) {
      state.routingConnections.forEach((connections) => {
        connections.forEach((connection) => {
          if (connection.connected) {
            document.getElementById(`${RouterVisualizationClasses.TOGGLE}-${trackId}-${connection.path.input}-${connection.path.output}`)?.classList.add('active');
          } else {
            document.getElementById(`${RouterVisualizationClasses.TOGGLE}-${trackId}-${connection.path.input}-${connection.path.output}`)?.classList.remove('active');
          }
        });
      });
    }
  }

  protected getOutputsFromAudioContext(): string[] | undefined {
    const outputCount = this._omakasePlayer!.player.audio.getHandler(PlayerAudioType.OUTPUT)!.channelCount;
    if (outputCount && outputCount >= 6) {
      return ROUTER_VISUALIZATION_LABELS_DEFAULT.slice(0, 6);
    } else if (outputCount && outputCount >= 2) {
      return ROUTER_VISUALIZATION_LABELS_DEFAULT.slice(0, 2);
    } else {
      return undefined;
    }
  }
}
