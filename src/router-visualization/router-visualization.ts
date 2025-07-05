/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {Subject} from 'rxjs';
import {Destroyable} from '../types';
import {nextCompleteSubject} from '../util/rxjs-util';
import {RouterVisualizationComponent} from './router-visualization-component';
import {RouterVisualizationDomController} from './router-visualization-dom-controller';
import {nullifier} from '../util/destroy-util';
import {RouterVisualizationApi} from '../api';
import {OmpAudioRoutingConnection, VideoControllerApi} from '../video';

export type RouterVisualizationSize = 'small' | 'medium' | 'large';

export interface RouterVisualizationTrackUpdate {
  name?: string;
  inputNumber?: number;
  inputLabels?: string[];
}

export interface RouterVisualizationTrack extends RouterVisualizationTrackUpdate {
  maxInputNumber: number;
}

export interface RouterVisualizationSidecarTrack extends RouterVisualizationTrack {
  trackId: string;
}

export interface RouterVisualizationConfig {
  size: RouterVisualizationSize;
  routerVisualizationHTMLElementId: string;
  outputNumber?: number;
  outputLabels?: string[];
  mainTrack?: RouterVisualizationTrack;
  sidecarTracks?: RouterVisualizationSidecarTrack[];
  defaultMatrix?: OmpAudioRoutingConnection[];
}

export const defaultRouterVisualizationLabels = ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'];

const configDefault: Partial<RouterVisualizationConfig> = {
  size: 'medium',
  routerVisualizationHTMLElementId: 'omakase-audio-router',
};

export class RouterVisualization implements Destroyable, RouterVisualizationApi {
  private _config: RouterVisualizationConfig;
  private _routerVisualizationDomController: RouterVisualizationDomController;
  private _routerVisualizationComponent: RouterVisualizationComponent;
  private _videoController: VideoControllerApi;
  private readonly _destroyed$ = new Subject<void>();

  constructor(config: RouterVisualizationConfig, videoController: VideoControllerApi) {
    this._config = {
      ...configDefault,
      ...config,
    };
    this._videoController = videoController;
    this._routerVisualizationDomController = new RouterVisualizationDomController(this);
    this._routerVisualizationComponent = this._routerVisualizationDomController.routerVisualizationComponent;
    this._routerVisualizationComponent.videoController = this._videoController;
    if (this._config.outputNumber || this._config.outputLabels) {
      this._routerVisualizationComponent.outputs = this._config.outputLabels
        ? this._config.outputLabels.slice(0, this._config.outputNumber)
        : defaultRouterVisualizationLabels.slice(0, this._config.outputNumber);
    }
    if (this._config.mainTrack) {
      this._routerVisualizationComponent.mainTrack = {
        track: this.prepareTrack(this._config.mainTrack),
        defaultMatrix: this._config.defaultMatrix,
      };
    }
    if (this._config.sidecarTracks) {
      this._routerVisualizationComponent.sidecarTracks = {
        tracks: this._config.sidecarTracks,
        defaultMatrix: this._config.defaultMatrix,
      };
    }
    this._routerVisualizationComponent.size = this._config.size;
  }

  get config(): RouterVisualizationConfig {
    return this._config;
  }

  updateMainTrack(track: RouterVisualizationTrackUpdate) {
    if (this._routerVisualizationComponent.mainTrack?.track) {
      this._routerVisualizationComponent.mainTrack = {
        track: this.prepareTrack({...this._routerVisualizationComponent.mainTrack.track, ...track}),
      };
    } else {
      throw Error('Main track is not defined');
    }
  }

  private prepareTrack(track: RouterVisualizationTrack): RouterVisualizationTrack {
    let channelCount = this._videoController.getActiveAudioTrack()?.channelCount;

    return channelCount ? {...track, inputNumber: channelCount} : track;
  }

  updateSize(size: RouterVisualizationSize): void {
    this._routerVisualizationComponent.size = size;
  }

  destroy(): void {
    nextCompleteSubject(this._destroyed$);
    this._routerVisualizationDomController.destroy();
    nullifier(this._config);
  }
}
