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

import {RouterVisualizationComponent} from './router-visualization-component';
import {RouterVisualizationDomController} from './router-visualization-dom-controller';
import type {AudioRoutingConnection} from '../audio';
import type {Destroyable} from '../common/capabilities';

import type {OmakasePlayerApi} from '../omakase-player-api';

export interface RouterVisualizationApi {
  /**
   * Updates the size of the Router Visualization component
   * @param size small, medium or large
   */
  updateSize(size: RouterVisualizationSize): void;

  /**
   * Destroys Router Visualization component
   */
  destroy(): void;
}

export type RouterVisualizationSize = 'small' | 'medium' | 'large';

export interface RouterVisualizationTrack {
  name?: string | undefined;
  inputNumber?: number | undefined;
  inputLabels?: string[] | undefined;
  maxInputNumber: number;
  trackId?: string | undefined;
}

export interface RouterVisualizationConfig {
  size: RouterVisualizationSize;
  routerVisualizationHTMLElementId: string;
  outputNumber?: number;
  outputLabels?: string[];
  visualizationTracks?: RouterVisualizationTrack[];
  defaultMatrix?: AudioRoutingConnection[];
}

export const ROUTER_VISUALIZATION_LABELS_DEFAULT = ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'];

const configDefault: Partial<RouterVisualizationConfig> = {
  size: 'medium',
  routerVisualizationHTMLElementId: 'omakase-audio-router',
};

export class RouterVisualization implements Destroyable, RouterVisualizationApi {
  private _config: RouterVisualizationConfig;
  private _routerVisualizationDomController: RouterVisualizationDomController;
  private _routerVisualizationComponent: RouterVisualizationComponent;
  private _omakasePlayer: OmakasePlayerApi;

  constructor(config: RouterVisualizationConfig, player: OmakasePlayerApi) {
    this._config = {
      ...configDefault,
      ...config,
    };
    this._omakasePlayer = player;

    this._omakasePlayer;
    this._routerVisualizationDomController = new RouterVisualizationDomController(this);
    this._routerVisualizationComponent = this._routerVisualizationDomController.routerVisualizationComponent;
    this._routerVisualizationComponent.player = this._omakasePlayer;
    if (this._config.outputNumber || this._config.outputLabels) {
      this._routerVisualizationComponent.outputs = this._config.outputLabels
        ? this._config.outputLabels.slice(0, this._config.outputNumber)
        : ROUTER_VISUALIZATION_LABELS_DEFAULT.slice(0, this._config.outputNumber);
    }
    const mainTrack = this._config.visualizationTracks?.filter((track) => !track.trackId);
    if (mainTrack?.length) {
      this._routerVisualizationComponent.mainTrack = {
        track: this.prepareTrack(mainTrack.at(0)!),
        defaultMatrix: this._config.defaultMatrix,
      };

      if (mainTrack.length > 1) {
        console.warn('Multiple visualization tracks without id have been provided, only the first one was used.');
      }
    }
    const sidecarTracks = this._config.visualizationTracks?.filter((track) => track.trackId);
    if (sidecarTracks?.length) {
      this._routerVisualizationComponent.sidecarTracks = {
        tracks: sidecarTracks,
        defaultMatrix: this._config.defaultMatrix,
      };
    }
    this._routerVisualizationComponent.size = this._config.size;
  }

  get config(): RouterVisualizationConfig {
    return this._config;
  }

  private prepareTrack(track: RouterVisualizationTrack): RouterVisualizationTrack {
    const activeMainTrackId = this._omakasePlayer!.player.playerSession.audio?.tracks['MAIN'].find((track) => track.active)?.trackId;
    let channelCount = this._omakasePlayer?.player.audio.getTracks().find((track) => track.id === activeMainTrackId)?.channels;

    return channelCount ? {...track, inputNumber: channelCount} : track;
  }

  updateSize(size: RouterVisualizationSize): void {
    this._routerVisualizationComponent.size = size;
  }

  destroy(): void {
    this._routerVisualizationDomController.destroy();
  }
}
