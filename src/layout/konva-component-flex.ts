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

import {KonvaComponent} from './konva-component';
import {KonvaFlexContentNode} from './konva-flex';
import {destroyer} from '../util/destroy-util';
import {Layout} from './flex-node';
import {OnMeasurementsChange} from '../common';

/**
 * Used as content node in flex layouting
 */
export class KonvaComponentFlexContentNode<T extends KonvaComponent<any, any, any> & OnMeasurementsChange> extends KonvaFlexContentNode {
  protected _component: T;

  constructor(component: T) {
    super(component.konvaNode);
    this._component = component;
  }

  override updateLayout(layout: Layout) {
    super.updateLayout(layout);
    this.component.onMeasurementsChange();
  }

  override destroy() {
    super.destroy();
    destroyer(
      this._component
    )
  }

  get component(): T {
    return this._component;
  }
}
