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
import {FrameRateUtil} from './frame-rate-util';
import {TimecodeObject, Video} from '../video/model';
import {VideoUtil} from './video-util';

export const timecodeNonDropRegex = /^(?:[01]\d|2[0-3]):(?:[0-5]\d):(?:[0-5]\d):(?:[0-9]{2})$/;
export const timecodeDropRegex = /^(?:[01]\d|2[0-3]):(?:[0-5]\d):(?:[0-5]\d);(?:[0-9]{2})$/;
const timecodeAudioOnlyRegex = /^(?:[01]\d|2[0-3]):(?:[0-5]\d):(?:[0-5]\d)\.(?:[0-9]{2})$/;

const timecodeFormatNonDrop = 'HH:MM:SS:FF';
const timecodeFormatDrop = 'HH:MM:SS;FF';

export class TimecodeUtil {
  /**
   * Format video media time to timecode
   * @param time video time
   * @param video
   */
  static formatToTimecode(time: number, video: Video): string {
    return this.formatDecimalTimeToTimecode(new Decimal(time), video);
  }

  static formatDecimalTimeToTimecode(time: Decimal, video: Video): string {
    let frameRateDecimal = new Decimal(video.frameRate);
    let frameNumberDecimal: Decimal;
    let frameRateRoundedDecimal = frameRateDecimal.round();

    if (video.initSegmentTimeOffset) {
      if (VideoUtil.isInitSegment(video, time.toNumber())) {
        frameNumberDecimal = new Decimal(0);
      } else {
        frameNumberDecimal = frameRateDecimal.mul(time.minus(video.initSegmentTimeOffset)).floor();
      }
    } else {
      frameNumberDecimal = frameRateDecimal.mul(time).floor();
    }

    if (video.ffomTimecodeObject) {
      let ffomFrameNumber = TimecodeUtil.timecodeObjectToFrameNumber(video.ffomTimecodeObject, frameRateDecimal);
      frameNumberDecimal = frameNumberDecimal.add(ffomFrameNumber);
    }

    let framesDecimal: Decimal;
    let secondsDecimal: Decimal;
    let minutesDecimal: Decimal;
    let hoursDecimal: Decimal;

    if (video.dropFrame) {
      // algorithm for drop frame
      let dropFramesDecimal = new Decimal(FrameRateUtil.resolveDropFramesOnMinute(frameRateDecimal));
      let framesPerHourDecimal = frameRateDecimal.mul(3600).round(); // 60 * 60
      let framesPer24HoursDecimal = framesPerHourDecimal.mul(24);
      let framesPer10MinutesDecimal = frameRateDecimal.mul(600).round(); // 60 * 10
      let framesPerMinuteDecimal = frameRateDecimal.round().mul(60).minus(dropFramesDecimal);

      frameNumberDecimal = frameNumberDecimal.mod(framesPer24HoursDecimal);

      let dDecimal = frameNumberDecimal.divToInt(framesPer10MinutesDecimal);
      let mDecimal = frameNumberDecimal.mod(framesPer10MinutesDecimal);

      if (mDecimal.gt(dropFramesDecimal)) {
        frameNumberDecimal = frameNumberDecimal.plus(dropFramesDecimal.mul(9).mul(dDecimal)).plus(dropFramesDecimal.mul(mDecimal.minus(dropFramesDecimal).divToInt(framesPerMinuteDecimal)));
      } else {
        frameNumberDecimal = frameNumberDecimal.plus(dropFramesDecimal.mul(9).mul(dDecimal));
      }

      framesDecimal = frameNumberDecimal.mod(frameRateRoundedDecimal);
      secondsDecimal = frameNumberDecimal.divToInt(frameRateRoundedDecimal).mod(60);
      minutesDecimal = frameNumberDecimal.divToInt(frameRateRoundedDecimal).divToInt(60).mod(60);
      hoursDecimal = frameNumberDecimal.divToInt(frameRateRoundedDecimal).divToInt(60).divToInt(60);
    } else {
      // algorithm for non-drop frame
      let framesPer24HoursDecimal = frameRateRoundedDecimal.mul(86400); // 60 * 60 * 24

      let remainingFramesDecimal = frameNumberDecimal.mod(framesPer24HoursDecimal);
      let hourFramesDecimal = frameRateRoundedDecimal.mul(3600); // 60 * 60
      let minuteFramesDecimal = frameRateRoundedDecimal.mul(60);

      hoursDecimal = remainingFramesDecimal.divToInt(hourFramesDecimal);
      remainingFramesDecimal = remainingFramesDecimal.minus(hoursDecimal.mul(hourFramesDecimal));

      minutesDecimal = remainingFramesDecimal.divToInt(minuteFramesDecimal);
      remainingFramesDecimal = remainingFramesDecimal.minus(minutesDecimal.mul(minuteFramesDecimal));

      secondsDecimal = remainingFramesDecimal.divToInt(frameRateRoundedDecimal);
      framesDecimal = remainingFramesDecimal.minus(secondsDecimal.mul(frameRateRoundedDecimal));
    }

    let timecodeObject: TimecodeObject = {
      hours: hoursDecimal.toNumber(),
      minutes: minutesDecimal.toNumber(),
      seconds: secondsDecimal.toNumber(),
      frames: framesDecimal.toNumber(),
      dropFrame: video.dropFrame,
      audioOnly: video.audioOnly,
    };

    return TimecodeUtil.formatTimecodeText(timecodeObject);
  }

  static formatTimecodeText(timecodeObject: TimecodeObject): string {
    let frameSeparator = timecodeObject.audioOnly ? '.' : timecodeObject.dropFrame ? ';' : ':';
    return `${TimecodeUtil.padZero(timecodeObject.hours)}:${TimecodeUtil.padZero(timecodeObject.minutes)}:${TimecodeUtil.padZero(timecodeObject.seconds)}${frameSeparator}${TimecodeUtil.padZero(timecodeObject.frames)}`;
  }

  static parseTimecodeToTime(timecode: string, video: Video, ffomTimecodeObject: TimecodeObject | undefined = void 0): number {
    return this.parseTimecodeToTimeDecimal(timecode, video, ffomTimecodeObject).toNumber();
  }

  static parseTimecodeToTimeDecimal(timecode: string, video: Video, ffomTimecodeObject: TimecodeObject | undefined = void 0): Decimal {
    let frameNumber = TimecodeUtil.parseTimecodeToFrame(timecode, new Decimal(video.frameRate), ffomTimecodeObject);
    return FrameRateUtil.videoFrameNumberToVideoTimeDecimal(frameNumber, video);
  }

  static parseTimecodeToFrame(timecode: string, frameRateDecimal: Decimal, ffomTimecodeObject: TimecodeObject | undefined = void 0): number {
    let timecodeObject = TimecodeUtil.parseTimecodeToTimecodeObject(timecode);
    if (timecodeObject.dropFrame) {
      return TimecodeUtil.parseTimecodeToFrameDropFrame(timecode, frameRateDecimal, ffomTimecodeObject);
    } else {
      return TimecodeUtil.parseTimecodeToFrameNonDropFrame(timecode, frameRateDecimal, ffomTimecodeObject);
    }
  }

  private static parseTimecodeToFrameDropFrame(timecode: string, frameRateDecimal: Decimal, ffomTimecodeObject: TimecodeObject | undefined = void 0): number {
    let timecodeObject = TimecodeUtil.parseTimecodeToTimecodeObject(timecode);

    let hours = timecodeObject.hours;
    let minutes = timecodeObject.minutes;
    let seconds = timecodeObject.seconds;
    let frames = timecodeObject.frames;

    let dropFramesDecimal = new Decimal(FrameRateUtil.resolveDropFramesOnMinute(frameRateDecimal));
    let frameRateRoundedDecimal = frameRateDecimal.round();

    let hourFramesDecimal = frameRateRoundedDecimal.mul(3600);
    let minuteFramesDecimal = frameRateRoundedDecimal.mul(60);
    let totalMinutesDecimal = Decimal.mul(hours, 60).plus(minutes);

    let frameNumberDecimal = hourFramesDecimal
      .mul(hours)
      .plus(minuteFramesDecimal.mul(minutes))
      .plus(frameRateRoundedDecimal.mul(seconds))
      .plus(frames)
      .minus(dropFramesDecimal.mul(totalMinutesDecimal.minus(totalMinutesDecimal.divToInt(10))));

    if (ffomTimecodeObject) {
      let ffomFrameNumber = TimecodeUtil.timecodeObjectToFrameNumber(ffomTimecodeObject, frameRateDecimal);
      frameNumberDecimal = frameNumberDecimal.minus(ffomFrameNumber);
    }

    // let timecodeReverseCheck = TimecodeUtil.formatToTimecode(FrameUtil.frameToTime(frameNumberDecimal.toNumber(), frameRateDecimal), frameRateDecimal, true, ffomTimecodeObject);

    return frameNumberDecimal.toNumber();
  }

  private static parseTimecodeToFrameNonDropFrame(timecode: string, frameRateDecimal: Decimal, ffomTimecodeObject: TimecodeObject | undefined = void 0): number {
    let timecodeObject = TimecodeUtil.parseTimecodeToTimecodeObject(timecode);

    let hours = timecodeObject.hours;
    let minutes = timecodeObject.minutes;
    let seconds = timecodeObject.seconds;
    let frames = timecodeObject.frames;

    let timeDecimal = Decimal.mul(hours, 3600).plus(Decimal.mul(minutes, 60)).plus(seconds);

    let frameNumberDecimal = timeDecimal.mul(frameRateDecimal.round()).plus(frames);

    if (ffomTimecodeObject) {
      let ffomFrameNumber = TimecodeUtil.timecodeObjectToFrameNumber(ffomTimecodeObject, frameRateDecimal);

      frameNumberDecimal = frameNumberDecimal.minus(ffomFrameNumber);

      // do we have a 24h rollover ?
      if (frameNumberDecimal.lt(0)) {
        frameNumberDecimal = frameNumberDecimal.add(TimecodeUtil.timecodeObjectToFrameNumber(this.create24hTimecodeObject(timecodeObject), frameRateDecimal));
      }
    }

    return frameNumberDecimal.toNumber();
  }

  private static create24hTimecodeObject(timecodeObject: TimecodeObject): TimecodeObject {
    return {
      hours: 24,
      minutes: 0,
      seconds: 0,
      frames: 0,
      dropFrame: timecodeObject.dropFrame,
      audioOnly: timecodeObject.audioOnly,
    };
  }

  static timecodeObjectToFrameNumber(timecodeObject: TimecodeObject, frameRateDecimal: Decimal): number {
    let hours = timecodeObject.hours;
    let minutes = timecodeObject.minutes;
    let seconds = timecodeObject.seconds;
    let frames = timecodeObject.frames;
    let frameRateRoundedDecimal = frameRateDecimal.round();

    if (timecodeObject.dropFrame) {
      let dropFramesDecimal = new Decimal(FrameRateUtil.resolveDropFramesOnMinute(frameRateDecimal));
      let hourFramesDecimal = frameRateRoundedDecimal.mul(3600);
      let minuteFramesDecimal = frameRateRoundedDecimal.mul(60);
      let totalMinutesDecimal = Decimal.mul(hours, 60).plus(minutes);
      let frameNumberDecimal = hourFramesDecimal
        .mul(hours)
        .plus(minuteFramesDecimal.mul(minutes))
        .plus(frameRateRoundedDecimal.mul(seconds))
        .plus(frames)
        .minus(dropFramesDecimal.mul(totalMinutesDecimal.minus(totalMinutesDecimal.divToInt(10))));
      return frameNumberDecimal.toNumber();
    } else {
      let timeDecimal = Decimal.mul(hours, 3600).plus(Decimal.mul(minutes, 60)).plus(seconds);
      let frameNumberDecimal = timeDecimal.mul(frameRateRoundedDecimal).plus(frames);
      return frameNumberDecimal.toNumber();
    }
  }

  static isTimecodeValid(timecode: string): boolean {
    return timecodeDropRegex.test(timecode) || timecodeNonDropRegex.test(timecode) || timecodeAudioOnlyRegex.test(timecode);
  }

  static parseTimecodeToTimecodeObject(timecode: string): TimecodeObject {
    if (!TimecodeUtil.isTimecodeValid(timecode)) {
      throw new Error(`Invalid timecode format for ${timecode}. Allowed formats: ${timecodeFormatDrop} | ${timecodeFormatNonDrop}`);
    }

    let isTimecodeAudioOnly = timecodeAudioOnlyRegex.test(timecode);

    if (isTimecodeAudioOnly) {
      let parts = timecode.split('.');
      let hms = parts[0].split(':');
      return {
        hours: parseInt(hms[0], 10),
        minutes: parseInt(hms[1], 10),
        seconds: parseInt(hms[2], 10),
        frames: parseInt(parts[1], 10),
        dropFrame: false,
        audioOnly: true,
      };
    } else {
      if (timecodeDropRegex.test(timecode)) {
        let parts = timecode.split(';');
        let hms = parts[0].split(':');
        return {
          hours: parseInt(hms[0], 10),
          minutes: parseInt(hms[1], 10),
          seconds: parseInt(hms[2], 10),
          frames: parseInt(parts[1], 10),
          dropFrame: true,
          audioOnly: false,
        };
      } else {
        let parts = timecode.split(':');
        return {
          hours: parseInt(parts[0], 10),
          minutes: parseInt(parts[1], 10),
          seconds: parseInt(parts[2], 10),
          frames: parseInt(parts[3], 10),
          dropFrame: false,
          audioOnly: false,
        };
      }
    }
  }

  /**
   * Fast padding
   * @param num
   * @private
   */
  private static padZero(num: number): string {
    return num < 10 ? `0${num}` : `${num}`;
  }
}
