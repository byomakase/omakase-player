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

import {type AudioRouterState, type AudioRoutingConnection} from '../audio/audio-router';
import {PlayerAudioType} from '../player';
import {ROUTER_VISUALIZATION_LABELS_DEFAULT, type RouterVisualizationSize, type RouterVisualizationTrack} from './router-visualization';
import {ObserverBreaker} from '../common/observer-breaker';

export const RouterVisualizationClasses = {
  TABLE: 'omakase-router-table',
  WRAPPER: 'omakase-router-container',
  TOGGLE: 'omakase-router-toggle',
  TOGGLE_INNER: 'omakase-router-toggle-inner',
  ACTIVE: 'active',
  MULTIPLE: 'omakase-router-multiple',
  ALIGN_RIGHT: 'align-right',
  ALIGN_LEFT: 'align-left',
  ICON: 'omakase-router-icon',
  ICON_RESET: 'icon-reset',
  ICON_DESELECT: 'icon-deselect',
  ICON_RESET_ALL: 'icon-reset-all',
  ICON_DESELECT_ALL: 'icon-deselect-all',
  ICON_OUTPUTS_MANY: 'icon-outputs-many',
  ICON_OUTPUTS_FEW: 'icon-outputs-few',
  LABEL: 'router-visualization-label',
  TRACK_PREFIX: 'omakase-router-visualization',
};

export interface MainTrackConfig {
  track?: RouterVisualizationTrack | undefined;
  defaultMatrix?: AudioRoutingConnection[] | undefined;
}

export interface SidecarTracksConfig {
  tracks: RouterVisualizationTrack[];
  defaultMatrix?: AudioRoutingConnection[] | undefined;
}

export type SetNodesAction = 'deselect' | 'reset';

export abstract class RouterVisualizationBase extends HTMLElement {
  protected _outputs?: string[];
  protected _mainTrack?: RouterVisualizationTrack | undefined;
  protected _mainTrackLabel = 'main';
  protected _sidecarTracks?: (RouterVisualizationTrack & {trackId: string})[];
  protected _size: RouterVisualizationSize = 'medium';
  protected _tableElement!: HTMLTableElement;
  protected _wrapperElement!: HTMLDivElement;
  protected _destroyBreaker = new ObserverBreaker();
  protected _mainTrackSetterBreaker = new ObserverBreaker();
  protected _detachAttachBreaker = new ObserverBreaker();
  protected _providedMainTrackConfig?: MainTrackConfig | undefined;
  protected _mainTrackConfig?: MainTrackConfig | undefined;
  protected _providedSidecarTracksConfig?: SidecarTracksConfig | undefined;
  protected _sidecarTracksConfig?: SidecarTracksConfig | undefined;

  set outputs(outputs: string[]) {
    this._outputs = outputs;
    this.renderOutputs();
  }

  get mainTrack(): MainTrackConfig {
    return {
      track: this._mainTrack,
    };
  }

  set mainTrack(config: MainTrackConfig) {
    this._providedMainTrackConfig = config;
    this.updateMainTrack(config);
  }

  set size(size: RouterVisualizationSize) {
    this._size = size;
    this._wrapperElement.classList.remove('size-small', 'size-medium', 'size-large');
    this._wrapperElement.classList.add(`size-${this._size}`);
  }

  protected abstract updateMainTrack(config: MainTrackConfig | undefined): void;

  protected abstract setSidecarTracksConfig(config: SidecarTracksConfig): void;

  protected abstract _wireMainTrackEvents(): void;

  protected abstract _wireSidecarTrackEvents(trackId: string): void;

  protected abstract setAudioRouterDefaultMatrix(track: RouterVisualizationTrack, defaultMatrix?: AudioRoutingConnection[]): void;

  protected abstract renderOutputs(): void;

  protected abstract renderTrack(track: RouterVisualizationTrack | undefined, trackId?: string): void;

  protected abstract getRoutingConnections(trackId: string): AudioRoutingConnection[][] | undefined;

  protected abstract updateConnections(trackId: string, routingConnections: AudioRoutingConnection[]): void;

  protected abstract getOutputsFromAudioContext(): string[] | undefined;

  protected abstract updateTogglesFromState(state: AudioRouterState, trackId?: string | undefined): void;

  deselectAllNodes(track?: RouterVisualizationTrack) {
    return this.setAllNodes('deselect', track);
  }

  resetAllNodes(track?: RouterVisualizationTrack) {
    return this.setAllNodes('reset', track);
  }

  destroy(): void {
    this._destroyBreaker.destroy();
    this._mainTrackSetterBreaker.destroy();
    this._detachAttachBreaker.destroy();
  }

  protected setAllNodes(action: SetNodesAction, track?: RouterVisualizationTrack) {
    if (track) {
      let routingConnections: AudioRoutingConnection[];
      if (action === 'deselect') {
        routingConnections = [...Array(track.inputLabels!.length).keys()].flatMap((input) => {
          return [...Array(this._outputs!.length).keys()].map((output) => ({
            path: {
              input,
              output,
            },
            connected: false,
          }));
        });
      } else {
        if ('trackId' in track) {
          routingConnections = this.getDefaultRoutingConnections(PlayerAudioType.SIDECAR, track.trackId!) ?? [];
        } else {
          routingConnections = this.getDefaultRoutingConnections(PlayerAudioType.MAIN) ?? [];
        }
      }

      if (track.trackId) {
        this.updateConnections(track.trackId, routingConnections);
      } else {
        this.updateConnections(this._mainTrackLabel, routingConnections);
      }
    } else {
      if (this._mainTrack) {
        this.setAllNodes(action, this._mainTrack);
      }
      if (this._sidecarTracks) {
        this._sidecarTracks.forEach((track) => {
          this.setAllNodes(action, track);
        });
      }
    }
  }

  protected abstract getDefaultRoutingConnections(audioType: PlayerAudioType, trackId?: string): AudioRoutingConnection[] | undefined;

  protected prepareTrackForVisualization(track: RouterVisualizationTrack): RouterVisualizationTrack {
    if (!track.inputNumber) {
      track.inputNumber = track.maxInputNumber;
    }
    if (!track.inputLabels || track.inputLabels.length !== track.inputNumber) {
      track.inputLabels = ROUTER_VISUALIZATION_LABELS_DEFAULT.slice(0, track.inputNumber);
    } else {
      track.inputLabels = track.inputLabels.slice(0, track.inputNumber);
    }
    return track;
  }

  protected render() {
    this._wrapperElement = document.createElement('div');
    this._wrapperElement.classList.add(RouterVisualizationClasses.WRAPPER, `size-${this._size}`);

    this._tableElement = document.createElement('table');
    this._tableElement.classList.add(RouterVisualizationClasses.TABLE);

    this._wrapperElement.appendChild(this._tableElement);
    this.appendChild(this._wrapperElement);
  }

  protected getToggleElement(): HTMLElement {
    const element = document.createElement('div');
    element.classList.add(RouterVisualizationClasses.TOGGLE);
    const innerElement = document.createElement('div');
    innerElement.classList.add(RouterVisualizationClasses.TOGGLE_INNER);
    element.appendChild(innerElement);
    return element;
  }

  set sidecarTracks(config: SidecarTracksConfig) {
    this.setSidecarTracksConfig(config);
  }

  protected static get classes() {
    return RouterVisualizationClasses;
  }
}
