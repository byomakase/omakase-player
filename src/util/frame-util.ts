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

import Decimal from 'decimal.js';

export class FrameUtil {

  /**
   * @returns frame number
   *
   * @param time in Seconds
   * @param frameRateDecimal
   */
  static timeToFrame(time: number, frameRateDecimal: Decimal): number {
    return frameRateDecimal.mul(time).floor().toNumber();
  }

  /**
   * @returns time in seconds
   *
   * @param framesCount
   * @param frameRateDecimal
   * @param timeCorrection
   */
  static frameToTime(frameNumber: number, frameRateDecimal: Decimal): number {
    return new Decimal(frameNumber).dividedBy(frameRateDecimal).toNumber();
  }
}
