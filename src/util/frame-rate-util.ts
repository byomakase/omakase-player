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
import {Video} from '../video';
import {VideoUtil} from './video-util';
import {isNullOrUndefined} from './object-util';
import {StringUtil} from './string-util';
import {FrameRateModel} from '../video';

const frameRatePrecision = 15; // frame rate precision

const initFrameRates: {fraction: string; dropFramesOnMinute?: number}[] = [
  {
    fraction: '24000/1001',
  },
  {
    fraction: '30000/1001',
    dropFramesOnMinute: 2,
  },
  {
    fraction: '60000/1001',
    dropFramesOnMinute: 4,
  },
  {
    fraction: '120000/1001',
  },
  {
    fraction: '240000/1001',
  },
];

const initDropFrames: {fraction: string; dropFrameEnabled: boolean}[] = [
  {
    fraction: '24000/1001',
    dropFrameEnabled: false,
  },
  {
    fraction: '30000/1001',
    dropFrameEnabled: true,
  },
  {
    fraction: '60000/1001',
    dropFrameEnabled: false,
  },
];

export class FrameRateUtil {
  static AUDIO_FRAME_RATE = 100;

  private static frameRateModels: FrameRateModel[];
  private static frameRateModelByValue: Map<number, FrameRateModel> = new Map<number, FrameRateModel>();
  private static dropFrameByFramerate: Map<number, boolean> = new Map<number, boolean>();

  static {
    this.frameRateModels = initFrameRates.map((fractionFrameRate) => {
      return {
        value: this.resolveFrameRateValueFromFraction(fractionFrameRate.fraction),
        fraction: fractionFrameRate.fraction,
        dropFrameEnabled: !isNullOrUndefined(fractionFrameRate.dropFramesOnMinute),
        dropFramesOnMinute: fractionFrameRate.dropFramesOnMinute,
      };
    });

    this.frameRateModels.forEach((frameRateModel) => {
      this.frameRateModelByValue.set(frameRateModel.value, frameRateModel);
    });

    initDropFrames.forEach((dropFrame) => {
      this.dropFrameByFramerate.set(this.resolveFrameRateValueFromFraction(dropFrame.fraction), dropFrame.dropFrameEnabled);
    });
  }

  private static resolveFrameRateValueFromFraction(fraction: string): number {
    let parts = fraction.split('/');

    if (parts.length !== 2) {
      throw new Error(`Incorrect frame rate fraction format`);
    }

    let numerator = parseInt(parts[0]);
    let denominator = parseInt(parts[1]);

    if (isNaN(numerator) || isNaN(denominator) || numerator < 1 || denominator < 0) {
      throw new Error(`Numerator and denominator must be integers larger than 0`);
    }

    return parseFloat((numerator / denominator).toFixed(frameRatePrecision));
  }

  /**
   * @returns frame number
   *
   * @param time in Seconds
   * @param video
   */
  static videoTimeToVideoFrameNumber(time: number, video: Video): number {
    if (video.initSegmentTimeOffset) {
      if (VideoUtil.isInitSegment(video, time)) {
        return 0;
      } else {
        let offsettedTime = time - video.initSegmentTimeOffset;
        return new Decimal(video.frameRate).mul(offsettedTime).floor().toNumber();
      }
    } else {
      return new Decimal(video.frameRate).mul(time).floor().toNumber();
    }
  }

  /**
   * @returns time in seconds
   *
   * @param frameNumber
   * @param video
   */
  static videoFrameNumberToVideoTime(frameNumber: number, video: Video): number {
    return this.videoFrameNumberToVideoTimeDecimal(frameNumber, video).toNumber();
  }

  static videoFrameNumberToVideoTimeDecimal(frameNumber: number, video: Video): Decimal {
    let time = FrameRateUtil.frameNumberToTimeDecimal(frameNumber, video.frameRate);
    if (video.initSegmentTimeOffset && frameNumber !== 0) {
      return time.add(video.initSegmentTimeOffset);
    } else {
      return time;
    }
  }

  static frameNumberToTime(frameNumber: number, frameRate: number): number {
    return this.frameNumberToTimeDecimal(frameNumber, frameRate).toNumber();
  }

  static frameNumberToTimeDecimal(frameNumber: number, frameRate: number): Decimal {
    return Decimal.div(frameNumber, frameRate);
  }

  static totalFramesNumber(duration: number, frameRate: number): number {
    return Decimal.mul(duration, frameRate).ceil().toNumber();
  }

  static frameDuration(frameRate: number): number {
    return FrameRateUtil.frameNumberToTime(1, frameRate);
  }

  static isSupportedDropFrameRate(frameRate: number): boolean {
    let frameRateModel = this.frameRateModelByValue.get(frameRate);
    return !!frameRateModel && frameRateModel.dropFrameEnabled;
  }

  /**
   * Method body hardcoded to make it faster
   * Number of frames to drop on the minute marks is the nearest integer to 6% of the framerate
   *
   * @param frameRateDecimal
   */
  static resolveDropFramesOnMinute(frameRateDecimal: Decimal): number {
    let frameRateModel = this.frameRateModelByValue.get(frameRateDecimal.toNumber());
    if (!frameRateModel || !frameRateModel.dropFrameEnabled) {
      throw new Error('Drop frame for frame rate not supported');
    }
    return frameRateModel.dropFramesOnMinute!;
  }

  /**
   * Resolves frame rate from number or fraction string. If frame rate rounded to 2 digits corresponds to one of pre-defined frame rates a pre-defined frame rate with higher precision is used
   * @param requestedFrameRate
   */
  static resolveFrameRate(requestedFrameRate: number | string | any): number | undefined {
    const errorMessage = `Frame rate must be number or fraction string`;

    let resolveFrameRateFromNumber: (requestedFrameRateNumber: number) => number = (requestedFrameRateNumber: number) => {
      let requestedRoundedTwoDigits = requestedFrameRateNumber.toFixed(2);
      let frameRateModel = this.frameRateModels.find((frameRateModel) => {
        let frameRateModelValueRoundedTwoDigits = frameRateModel.value.toFixed(2);
        return frameRateModelValueRoundedTwoDigits === requestedRoundedTwoDigits ? frameRateModel : void 0;
      });

      return frameRateModel ? frameRateModel.value : requestedFrameRateNumber;
    };

    if (isNullOrUndefined(requestedFrameRate)) {
      return undefined;
    } else if (typeof requestedFrameRate === 'number') {
      return resolveFrameRateFromNumber(requestedFrameRate);
    } else if (typeof requestedFrameRate === 'string') {
      if (StringUtil.isNullUndefinedOrWhitespace(requestedFrameRate)) {
        throw new Error(errorMessage);
      }
      let requestedFrameRateNumber = FrameRateUtil.resolveFrameRateValueFromFraction(requestedFrameRate);

      return resolveFrameRateFromNumber(requestedFrameRateNumber);
    } else {
      throw new Error(errorMessage);
    }
  }

  static isFrameRateFractional(frameRate: number): boolean {
    return Number.isInteger(frameRate);
  }

  static resolveDropFrameFromFramerate(frameRate: number): boolean {
    let dropFrame = this.dropFrameByFramerate.get(frameRate);
    return dropFrame ?? false;
  }
}
