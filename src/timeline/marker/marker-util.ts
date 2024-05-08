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
import {MarkerSymbolType} from './marker-types';

export class MarkerUtil {
  static createPeriodSymbol(style: {
    handleType: 'start' | 'end', symbolType: MarkerSymbolType, symbolSize: number, color: string
  }): Konva.Shape {
    switch (style.symbolType) {
      case 'triangle':
        let diagonal = Decimal.sqrt(2).mul(style.symbolSize).toNumber();
        let halfDiagonal = diagonal / 2;
        return new Konva.Line({
          points: style.handleType === 'start' ? [-halfDiagonal, 0, 0, 0, 0, halfDiagonal] : [0, 0, halfDiagonal, 0, 0, halfDiagonal],
          fill: style.color,
          closed: true,
          offsetY: halfDiagonal / 2,
        })
      case 'circle':
        return new Konva.Arc({
          fill: style.color,
          innerRadius: 0,
          outerRadius: style.symbolSize / 2,
          angle: 180,
          rotation: style.handleType === 'start' ? 90 : -90
        })
      case 'square':
        return new Konva.Line({
          points: [
            0, 0,
            style.symbolSize, 0,
            style.symbolSize, style.symbolSize
          ],
          fill: style.color,
          closed: true,
          rotation: style.handleType === 'start' ? 225 : 45,
          offsetX: style.symbolSize / 2,
          offsetY: style.symbolSize / 2,
        })
      default:
        throw Error('Unknown type');
    }
  }

  static createMomentSymbol(style: {
    symbolType: MarkerSymbolType, symbolSize: number, color: string
  }): Konva.Shape {
    switch (style.symbolType) {
      case 'triangle':
        let diagonal = Decimal.sqrt(2).mul(style.symbolSize).toNumber();
        let halfDiagonal = diagonal / 2;
        return new Konva.Line({
          points: [
            -halfDiagonal, 0,
            halfDiagonal, 0,
            0, halfDiagonal
          ],
          fill: style.color,
          closed: true,
          offsetY: halfDiagonal / 2,
        })
      case 'circle':
        return new Konva.Circle({
          fill: style.color,
          radius: style.symbolSize / 2
        })
      case 'square':
        return new Konva.Rect({
          fill: style.color,
          width: style.symbolSize,
          height: style.symbolSize,
          rotation: 45,
          offsetX: style.symbolSize / 2,
          offsetY: style.symbolSize / 2,
        })
      default:
        throw Error('Unknown type');
    }
  }
}
