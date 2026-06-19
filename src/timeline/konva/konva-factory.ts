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

import Konva from 'konva';
import type {StageConfig} from 'konva/lib/Stage';
import type {LayerConfig} from 'konva/lib/Layer';
import type {GroupConfig} from 'konva/lib/Group';

export class KonvaFactory {
  static createStage(config: StageConfig): Konva.Stage {
    return new Konva.Stage(config);
  }

  static createLayer(config?: LayerConfig): Konva.Layer {
    return new Konva.Layer(config);
  }

  static createGroup(config?: GroupConfig): Konva.Group {
    return new Konva.Group(config);
  }

  static createRect(config?: {[K in keyof Konva.RectConfig]?: Konva.RectConfig[K] | undefined}): Konva.Rect {
    return new Konva.Rect(KonvaFactory.filterUndefined(config));
  }

  static createText(config?: {[K in keyof Konva.TextConfig]?: Konva.TextConfig[K] | undefined}): Konva.Text {
    return new Konva.Text(KonvaFactory.filterUndefined(config));
  }

  static filterUndefined<T extends object>(config: {[K in keyof T]?: T[K] | undefined} | undefined): T | undefined {
    if (!config) {
      return undefined;
    }
    return Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined)) as T;
  }

  static setAttrs(node: Konva.Node, attrs: {[K in keyof Konva.NodeConfig]?: Konva.NodeConfig[K] | undefined}): void {
    node.setAttrs(KonvaFactory.filterUndefined(attrs));
  }

  static createCircle(config?: Konva.CircleConfig): Konva.Circle {
    return new Konva.Circle(config);
  }

  static createLine(config?: {[K in keyof Konva.LineConfig]?: Konva.LineConfig[K] | undefined}): Konva.Line {
    return new Konva.Line(KonvaFactory.filterUndefined(config));
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
