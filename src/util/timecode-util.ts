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
import {FrameUtil} from './frame-util';

export class TimecodeUtil {
  public static readonly HOUR_MINUTE_SECOND_FRAME_FORMATTED_ZERO = `${TimecodeUtil.padZero(0)}:${TimecodeUtil.padZero(0)}:${TimecodeUtil.padZero(0)}:${TimecodeUtil.padZero(0)}`;

  /**
   * Format video media time to timecode
   * @param time video time
   * @param frameRateDecimal frame rate in Decimal object
   * @param ffom video time offset, default = 0
   */
  static formatToTimecode(time: number, frameRateDecimal: Decimal, ffom: number = 0): string {
    let timeToFormat = time + ffom;

    const hours = Math.floor(timeToFormat / 3600);
    const minutes = Math.floor((timeToFormat % 3600) / 60);
    const seconds = Math.floor(timeToFormat % 60);

    let frameInSecond = new Decimal(FrameUtil.timeToFrame(timeToFormat, frameRateDecimal)).mod(frameRateDecimal).toNumber();
    return `${TimecodeUtil.padZero(hours)}:${TimecodeUtil.padZero(minutes)}:${TimecodeUtil.padZero(seconds)}:${TimecodeUtil.padZero(frameInSecond)}`;
  }

  static parseTimecodeToFrame(timestamp: string, frameRateDecimal: Decimal, ffom: number = 0): number {
    // Split the timestamp into its components
    const parts = timestamp.split(':');

    // Check if the format is valid
    if (parts.length !== 4) {
      throw new Error('Invalid timestamp format. It should be in the format "HH:MM:SS:FF".');
    }

    // Extract hours, minutes, seconds, and frames
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    const frames = parseInt(parts[3], 10);

    const time = hours * 3600 + minutes * 60 + seconds - ffom;

    // Calculate the total number of frames
    const totalFrames = new Decimal(time).mul(frameRateDecimal).plus(frames).toNumber();
    return totalFrames;
  }

  // static formatHourMinuteSecondMillisecond(time: number, frameRateDecimal: Decimal): string {
  //   if (time <= 0) {
  //     return TimecodeUtil.HOUR_MINUTE_SECOND_FRAME_FORMATTED_ZERO;
  //   }
  //
  //   const hours = Math.floor(time / 3600);
  //   const minutes = Math.floor((time % 3600) / 60);
  //   const seconds = Math.floor(time % 60);
  //   const milliseconds = Math.floor((time % 1) * 1000);
  //
  //   return `${TimecodeUtil.padZero(hours)}:${TimecodeUtil.padZero(minutes)}:${TimecodeUtil.padZero(seconds)}:${TimecodeUtil.padZero(milliseconds, 3)}`;
  // }

  private static padZero(num: number, length = 2): string {
    return num.toString().padStart(length, '0');
  }
}
