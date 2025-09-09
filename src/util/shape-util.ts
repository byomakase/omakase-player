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
import Decimal from 'decimal.js';
import {goldenRatio, positionTopLeft} from '../constants';
import {ColorUtil} from './color-util';
import {KonvaFactory} from '../konva/konva-factory';

export class ShapeUtil {
  static createGoldenRatioWedge(config: {x: number; y: number; height: number; color: string}): Konva.Line {
    let b = new Decimal(config.height)
      .div(goldenRatio + 1)
      .toDecimalPlaces(2)
      .toNumber();
    let a = config.height - b;
    let halfWidth = a / 2;
    return new Konva.Line({
      points: [config.x - halfWidth, config.y, config.x + halfWidth, config.y, config.x + halfWidth, config.y + a, config.x, config.y + a + b, config.x - halfWidth, config.y + a],
      fill: config.color,
      stroke: config.color,
      closed: true,
      listening: false,
    });
  }

  static createDebugRect(fill?: string) {
    return KonvaFactory.createRect({
      ...positionTopLeft,
      width: 100,
      height: 100,
      fill: fill ? fill : ColorUtil.randomHexColor(),
      opacity: 0.5,
    });
  }
}
