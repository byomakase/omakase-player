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

import {type FrameRateModel, FrameRateResolver} from './frame-rate';
import type {Serializable} from './capabilities';
import Decimal from 'decimal.js';

const regexValueTextNDF = /^(?:[01]\d|2[0-3]):(?:[0-5]\d):(?:[0-5]\d):(?:[0-9]{2})$/;
const regexValueTextDF = /^(?:[01]\d|2[0-3]):(?:[0-5]\d):(?:[0-5]\d);(?:[0-9]{2})$/;
const regexValueTextAudio = /^(?:[01]\d|2[0-3]):(?:[0-5]\d):(?:[0-5]\d)\.(?:[0-9]{2})$/;

const separatorHms = ':';
const separatorFramesNDF = ':';
const separatorFramesDF = ';';
const separatorFramesAudio = '.';

export interface TimecodeModel extends Serializable {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  valueText: string;
  frameRateModel: FrameRateModel;
  hasVideo: boolean;
  hasAudio: boolean;
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

interface TimecodeConverterArgs {
  frameRateModel: FrameRateModel;
  ffomTimecodeModel?: TimecodeModel | undefined;
  initSegmentTimeOffset?: number | undefined;
  hasVideo?: boolean | undefined;
  hasAudio?: boolean | undefined;
}

export class TimecodeConverter {
  protected _frameRateModel: FrameRateModel;
  protected _ffomTimecodeModel?: TimecodeModel | undefined;
  protected _initSegmentTimeOffset?: number | undefined;
  protected _hasVideo?: boolean | undefined;
  protected _hasAudio?: boolean | undefined;

  private constructor(args: TimecodeConverterArgs) {
    this._frameRateModel = args.frameRateModel;
    this._ffomTimecodeModel = args.ffomTimecodeModel;
    this._initSegmentTimeOffset = args.initSegmentTimeOffset;
    this._hasVideo = args.hasVideo;
    this._hasAudio = args.hasAudio;
  }

  static create(args: TimecodeConverterArgs): TimecodeConverter {
    return new TimecodeConverter(args);
  }

  timeToTimecodeModel(time: number): TimecodeModel {
    let timeDecimal = new Decimal(time);
    let frameRateValueDecimal = new Decimal(this._frameRateModel.value);
    let frameNumberDecimal: Decimal;

    if (this._initSegmentTimeOffset) {
      let isInsideInitSegment = timeDecimal.gte(0) && timeDecimal.lt(this._initSegmentTimeOffset);

      if (isInsideInitSegment) {
        frameNumberDecimal = new Decimal(0);
      } else {
        frameNumberDecimal = frameRateValueDecimal.mul(timeDecimal.minus(this._initSegmentTimeOffset)).floor();
      }
    } else {
      frameNumberDecimal = frameRateValueDecimal.mul(timeDecimal).floor();
    }

    return this.frameToTimecodeModel(frameNumberDecimal.toNumber());
  }

  frameToTimecodeModel(frame: number): TimecodeModel {
    let frameRateValueDecimal = new Decimal(this._frameRateModel.value);
    let frameNumberDecimal = new Decimal(frame);
    let frameRateRoundedDecimal = frameRateValueDecimal.round();

    if (this._ffomTimecodeModel) {
      let ffomFrameNumber = this.timecodeModelToFrameNumber(this._ffomTimecodeModel);
      frameNumberDecimal = frameNumberDecimal.add(ffomFrameNumber);
    }

    let framesDecimal: Decimal;
    let secondsDecimal: Decimal;
    let minutesDecimal: Decimal;
    let hoursDecimal: Decimal;

    if (this._frameRateModel.dropFrames) {
      // algorithm for drop frame
      let dropFramesDecimal = new Decimal(this._frameRateModel.dropFrames);
      let framesPerHourDecimal = frameRateValueDecimal.mul(3600).round(); // 60 * 60
      let framesPer24HoursDecimal = framesPerHourDecimal.mul(24);
      let framesPer10MinutesDecimal = frameRateValueDecimal.mul(600).round(); // 60 * 10
      let framesPerMinuteDecimal = frameRateValueDecimal.round().mul(60).minus(dropFramesDecimal);

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

    let timecodeModel: TimecodeModel = this.createTimecodeModel({
      hours: hoursDecimal.toNumber(),
      minutes: minutesDecimal.toNumber(),
      seconds: secondsDecimal.toNumber(),
      frames: framesDecimal.toNumber(),
    });

    return timecodeModel;
  }

  timecodeModelToFrameNumber(timecodeModel: TimecodeModel): number {
    let hours = timecodeModel.hours;
    let minutes = timecodeModel.minutes;
    let seconds = timecodeModel.seconds;
    let frames = timecodeModel.frames;
    let frameRateRoundedDecimal = new Decimal(timecodeModel.frameRateModel.value).round();

    if (!!timecodeModel.frameRateModel.dropFrames) {
      let dropFramesDecimal = new Decimal(timecodeModel.frameRateModel.dropFrames);
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

  private createTimecodeModel(hmsf: Pick<TimecodeModel, 'hours' | 'minutes' | 'seconds' | 'frames'>): TimecodeModel {
    return {
      hours: hmsf.hours,
      minutes: hmsf.minutes,
      seconds: hmsf.seconds,
      frames: hmsf.frames,
      frameRateModel: this._frameRateModel,
      valueText: this.formatTimecodeValueText(hmsf),
      hasVideo: this._hasVideo ?? false,
      hasAudio: this._hasAudio ?? false,
    };
  }

  private formatTimecodeValueText(hmsf: Pick<TimecodeModel, 'hours' | 'minutes' | 'seconds' | 'frames'>): string {
    let framesSeparator: string;
    if (this._hasVideo) {
      framesSeparator = !!this._frameRateModel.dropFrames ? separatorFramesDF : separatorFramesNDF;
    } else if (this._hasAudio && !this._hasVideo) {
      framesSeparator = separatorFramesAudio
    } else {
      throw new Error(`Cannot resolve frames separator`)
    }
    return this.createTimecodeValueText(padZero(hmsf.hours), padZero(hmsf.minutes), padZero(hmsf.seconds), padZero(hmsf.frames), framesSeparator);
  }

  createTimecodeValueText(hh: string, mm: string, ss: string, ff: string, framesSeparator: string): string {
    return `${hh}${separatorHms}${mm}${separatorHms}${ss}${framesSeparator}${ff}`;
  }

  parseValueTextToTimecodeModel(valueText: string): TimecodeModel {
    let throwFormatMismatchError = () => {
      throw new Error(`Timecode value text ${valueText} doesn't correspond to frame rate model "${FrameRateResolver.frameRateModelToText(this._frameRateModel)}"`);
    };

    let checkFramesNumber = (frames: number) => {
      if (frames < 0 || frames >= this._frameRateModel.value) {
        throwFormatMismatchError();
      }
    };

    if (regexValueTextNDF.test(valueText)) {
      // NDF
      let isNDFFrameRate = !this._frameRateModel.dropFrames;

      if (!isNDFFrameRate) {
        throwFormatMismatchError();
      }

      let parts = valueText.split(separatorFramesNDF);

      let frames = parseInt(parts[3]!, 10);
      checkFramesNumber(frames);

      return this.createTimecodeModel({
        hours: parseInt(parts[0]!, 10),
        minutes: parseInt(parts[1]!, 10),
        seconds: parseInt(parts[2]!, 10),
        frames: frames,
      });
    } else if (regexValueTextDF.test(valueText)) {
      // DF
      let isDFFrameRate = !!this._frameRateModel.dropFrames;

      if (!isDFFrameRate) {
        throwFormatMismatchError();
      }

      let parts = valueText.split(separatorFramesDF);
      let hms = parts[0]!.split(separatorHms);

      let frames = parseInt(parts[1]!, 10);
      checkFramesNumber(frames);

      return this.createTimecodeModel({
        hours: parseInt(hms[0]!, 10),
        minutes: parseInt(hms[1]!, 10),
        seconds: parseInt(hms[2]!, 10),
        frames: frames,
      });
    } else if (regexValueTextAudio.test(valueText)) {
      // Audio: HH:MM:SS.FF
      let isNDFFrameRate = !this._frameRateModel.dropFrames;

      if (!isNDFFrameRate) {
        throwFormatMismatchError();
      }

      let parts = valueText.split(separatorFramesAudio);
      let hms = parts[0]!.split(separatorHms);

      let frames = parseInt(parts[1]!, 10);
      checkFramesNumber(frames);

      return this.createTimecodeModel({
        hours: parseInt(hms[0]!, 10),
        minutes: parseInt(hms[1]!, 10),
        seconds: parseInt(hms[2]!, 10),
        frames: frames,
      });
    } else {
      throw new Error(
        `Invalid timecode value text format for ${valueText}. Allowed formats: ${[separatorFramesNDF, separatorFramesDF, separatorFramesAudio].map((p) => this.createTimecodeValueText('HH', 'MM', 'SS', 'FF', p)).join(', ')}}`
      );
    }
  }
}
