import {RouterVisualizationComponent} from './router-visualization-component';
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

import {Destroyable} from '../types';
import {DomUtil} from '../util/dom-util';
import {RouterVisualization} from './router-visualization';

export class RouterVisualizationDomController implements Destroyable {
  private _routerVisualization: RouterVisualization;
  private _divRouterVisualization: HTMLElement;
  private _template?: HTMLElement;

  constructor(routerVisualization: RouterVisualization) {
    this._routerVisualization = routerVisualization;
    if (!customElements.get('omakase-audio-router')) {
      customElements.define('omakase-audio-router', RouterVisualizationComponent);
    }
    this._divRouterVisualization = DomUtil.getElementById<HTMLElement>(this._routerVisualization.config.routerVisualizationHTMLElementId);
    this.createDom();
  }

  get routerVisualizationComponent(): RouterVisualizationComponent {
    return this._divRouterVisualization.getElementsByTagName('omakase-audio-router')[0] as RouterVisualizationComponent;
  }

  destroy() {
    const routerVisualizationComponent = this.routerVisualizationComponent;
    routerVisualizationComponent.destroy();
    this._divRouterVisualization.removeChild(routerVisualizationComponent);
  }

  private createDom() {
    this._divRouterVisualization.innerHTML = `<omakase-audio-router></omakase-audio-router>`;
  }
}
