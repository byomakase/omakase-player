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

import {isNullOrUndefined} from '../util/util-functions';
import {StringUtil} from '../util/string-util';
import type {Serializable} from './capabilities';
import Decimal from 'decimal.js';

export interface FrameRateModel extends Serializable {
  value: number;
  fraction: {
    numerator: number;
    denominator: number;
  };
  frameDuration: number;

  /**
   * Indicates number of frames to drop on minute mark
   */
  dropFrames?: number;
}

export class FrameRateResolver {
  private static _frameRateValuePrecision = 15;
  private static _frameRateValueForLooseKeyPrecision = 2;

  static readonly FR_23_98 = this.createFrameRateModel({fraction: {numerator: 24000, denominator: 1001}});
  static readonly FR_29_97 = this.createFrameRateModel({fraction: {numerator: 30000, denominator: 1001}});
  static readonly FR_29_97_DF = this.createFrameRateModel({fraction: {numerator: 30000, denominator: 1001}, dropFrames: 2});
  static readonly FR_59_94 = this.createFrameRateModel({fraction: {numerator: 60000, denominator: 1001}});
  static readonly FR_59_94_DF = this.createFrameRateModel({fraction: {numerator: 60000, denominator: 1001}, dropFrames: 4});
  static readonly FR_119_88 = this.createFrameRateModel({fraction: {numerator: 120000, denominator: 1001}});
  static readonly FR_239_76 = this.createFrameRateModel({fraction: {numerator: 240000, denominator: 1001}});

  private static _presetFrameRateModels: FrameRateModel[] = [this.FR_23_98, this.FR_29_97, this.FR_29_97_DF, this.FR_59_94, this.FR_59_94_DF, this.FR_119_88, this.FR_239_76];

  private static _presetFrameRateModelsByLooseKey: Map<string, FrameRateModel> = new Map(this._presetFrameRateModels.map((m) => [this.createFrameRateModelLooseKey(m.value, !!m.dropFrames), m]));

  private static createFrameRateModelLooseKey(value: number, dropFrame?: boolean): string {
    let valueRoundedText = value.toFixed(this._frameRateValueForLooseKeyPrecision);

    if (dropFrame === void 0 && valueRoundedText) {
      // if dropFrame is not provided for FR_29_97 we default dropFrame = true
      if (valueRoundedText === this.FR_29_97.value.toFixed(this._frameRateValueForLooseKeyPrecision)) {
        dropFrame = true;
      }
    }

    return `${valueRoundedText}${dropFrame ? '_DF' : ''}`;
  }

  private static createFrameRateModel(frameRate: Partial<FrameRateModel> & Pick<FrameRateModel, 'fraction'>): FrameRateModel {
    let numerator = frameRate.fraction.numerator;
    let denominator = frameRate.fraction.denominator;

    if (isNaN(numerator) || isNaN(denominator) || numerator < 1 || denominator < 0) {
      throw new Error(`Numerator and denominator must be integers larger than 0`);
    }

    let value = frameRate.value ? frameRate.value : parseFloat((numerator / denominator).toFixed(this._frameRateValuePrecision));
    let frameDuration = Decimal.div(1, value).toNumber();

    return {
      ...frameRate,
      value: value,
      frameDuration: frameDuration,
    };
  }

  /**
   * Resolves frame rate model from number or fraction string. If frame rate rounded to 2 digits corresponds to one of preset defined frame rates a pre-defined frame rate model with higher precision will be used
   * @param valueOrFractionText
   * @param dropFrame
   * @throws Error
   */
  static resolveFrameRateModel(valueOrFractionText: number | string, dropFrame?: boolean): FrameRateModel {
    const error1 = `Frame rate must be number or fraction string in format "numerator/denominator"`;
    const error2 = `Provided frame rate not supported. Supported drop frame rates: ${this._presetFrameRateModels
      .filter((p) => !!p.dropFrames)
      .map((p) => p.value.toFixed(this._frameRateValueForLooseKeyPrecision))
      .join(', ')}`;

    let resolveFromValue: (value: number) => FrameRateModel = (value: number) => {
      let frameRateLooseKey = this.createFrameRateModelLooseKey(value, dropFrame);

      let presetFrameRateModel = this._presetFrameRateModelsByLooseKey.get(frameRateLooseKey);

      if (!presetFrameRateModel && dropFrame) {
        throw new Error(error2);
      }

      return presetFrameRateModel
        ? presetFrameRateModel
        : this.createFrameRateModel({
            fraction: {
              numerator: value,
              denominator: 1,
            },
          });
    };

    let resolveFromFraction: (fractionText: string) => FrameRateModel = (fractionText: string) => {
      if (StringUtil.isEmpty(fractionText)) {
        throw new Error(error1);
      }

      let parts = fractionText.split('/');

      if (!parts[0] || !parts[1] || parts.length !== 2) {
        throw new Error(error1);
      }

      let numerator = Number(parts[0]);
      let denominator = Number(parts[1]);

      let frameRateLooseKey = this.createFrameRateModelLooseKey(numerator / denominator, dropFrame);

      let presetFrameRateModel = this._presetFrameRateModelsByLooseKey.get(frameRateLooseKey);

      if (!presetFrameRateModel && dropFrame) {
        throw new Error(error2);
      }

      return presetFrameRateModel
        ? presetFrameRateModel
        : this.createFrameRateModel({
            fraction: {
              numerator: numerator,
              denominator: denominator,
            },
          });
    };

    if (isNullOrUndefined(valueOrFractionText)) {
      throw new Error(error1);
    } else if (typeof valueOrFractionText === 'number') {
      return resolveFromValue(valueOrFractionText);
    } else if (typeof valueOrFractionText === 'string') {
      return resolveFromFraction(valueOrFractionText);
    } else {
      throw new Error(error1);
    }
  }

  static frameRateModelToText(frameRateModel: FrameRateModel): string {
    return `${frameRateModel.value}fps (${frameRateModel.fraction.numerator}/${frameRateModel.fraction.denominator})${!!frameRateModel.dropFrames ? `, DF` : ''}`;
  }
}
