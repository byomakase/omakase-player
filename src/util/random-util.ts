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
import {ColorUtil} from './color-util';

export class RandomUtil {

  static randomCircle(maxX: number, maxY: number): Konva.Circle {
    return new Konva.Circle({
      x: maxX * Math.random(),
      y: maxY * Math.random(),
      radius: 50,
      fill: ColorUtil.randomHexColor()
    });
  }

  static randomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static randomDecimal(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

}
