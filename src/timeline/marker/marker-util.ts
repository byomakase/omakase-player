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
import {KonvaFactory} from '../../factory/konva-factory';
import {ColorUtil} from '../../util/color-util';

export class MarkerUtil {
  static createPeriodSymbol(style: {handleType: 'start' | 'end'; symbolType: MarkerSymbolType; symbolSize: number; color: string}): Konva.Shape {
    const halfSymbolSize = new Decimal(style.symbolSize / 2).toDecimalPlaces(2).toNumber();

    switch (style.symbolType) {
      case 'none':
        const borderWidth = 1;
        const colorDiffPercent = 30;
        const borderColor = ColorUtil.lightenColor(style.color, colorDiffPercent * (ColorUtil.isLightColor(style.color) ? -1 : 1));

        return new Konva.Rect({
          width: borderWidth,
          height: style.symbolSize,
          fill: borderColor,
          opacity: 1,
          offsetY: halfSymbolSize,
          offsetX: style.handleType === 'start' ? 0 : borderWidth,
        });
      case 'triangle':
        const diagonal = Decimal.sqrt(2).mul(style.symbolSize).toDecimalPlaces(2).toNumber();
        const halfDiagonal = diagonal / 2;
        return new Konva.Line({
          points: style.handleType === 'start' ? [-halfDiagonal, 0, 0, 0, 0, halfDiagonal] : [0, 0, halfDiagonal, 0, 0, halfDiagonal],
          fill: style.color,
          closed: true,
          offsetY: halfDiagonal / 2,
        });
      case 'circle':
        return new Konva.Arc({
          fill: style.color,
          innerRadius: 0,
          outerRadius: halfSymbolSize,
          angle: 180,
          rotation: style.handleType === 'start' ? 90 : -90,
        });
      case 'square':
        return new Konva.Line({
          points: [0, 0, style.symbolSize, 0, style.symbolSize, style.symbolSize],
          fill: style.color,
          closed: true,
          rotation: style.handleType === 'start' ? 225 : 45,
          offsetX: halfSymbolSize,
          offsetY: halfSymbolSize,
        });
      default:
        throw Error('Unknown type');
    }
  }

  static createMomentSymbol(style: {symbolType: MarkerSymbolType; symbolSize: number; color: string}): Konva.Shape {
    const halfSymbolSize = new Decimal(style.symbolSize / 2).toDecimalPlaces(2).toNumber();
    switch (style.symbolType) {
      case 'none':
        return new Konva.Line({
          points: [0, 0, 0, style.symbolSize],
          stroke: style.color,
          strokeWidth: 1,
          closed: false,
          offsetY: halfSymbolSize,
        });
      case 'triangle':
        const diagonal = Decimal.sqrt(2).mul(style.symbolSize).toDecimalPlaces(2).toNumber();
        const halfDiagonal = diagonal / 2;
        return new Konva.Line({
          points: [-halfDiagonal, 0, halfDiagonal, 0, 0, halfDiagonal],
          fill: style.color,
          closed: true,
          offsetY: halfDiagonal / 2,
        });
      case 'circle':
        return new Konva.Circle({
          fill: style.color,
          radius: halfSymbolSize,
        });
      case 'square':
        return KonvaFactory.createRect({
          fill: style.color,
          width: style.symbolSize,
          height: style.symbolSize,
          rotation: 45,
          offsetX: halfSymbolSize,
          offsetY: halfSymbolSize,
        });
      default:
        throw Error('Unknown type');
    }
  }
}
