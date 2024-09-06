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

import Konva from 'konva';
import {GroupConfig} from 'konva/lib/Group';
import {StageConfig} from 'konva/lib/Stage';
import {LayerConfig} from 'konva/lib/Layer';

export class KonvaFactory {

  static createStage(config: StageConfig): Konva.Stage {
    return new Konva.Stage(config);
  }

  static createLayer(config?: LayerConfig): Konva.Layer {
    return new Konva.Layer(config);
  }

  static createGroup(config?: GroupConfig): Konva.Group {
    return new Konva.Group(config)
  }

  static createRect(config?: Konva.RectConfig): Konva.Rect {
    return new Konva.Rect(config)
  }

  static createEventCatcherRect(config: Konva.RectConfig = {}) {
    return KonvaFactory.createRect({
      opacity: 0,
      listening: true,
      ...config,
    });
  }

  static createBgRect(config: Konva.RectConfig = {}) {
    return KonvaFactory.createRect({
      listening: false,
      ...config,
    });
  }
}
