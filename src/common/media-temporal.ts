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
import {type FrameRateModel} from './frame-rate';
import {CountdownMediaTimeConverter, MediaTimeConverter} from './media-time';
import {TimecodeConverter, type TimecodeModel} from './timecode';
import Decimal from 'decimal.js';
import {z} from 'zod';

/**
 * Supported temporal formats for expressing media time values.
 */
export enum MediaTemporalFormat {
  /** Absolute time in seconds (number). */
  SECONDS = 'SECONDS',

  /** Zero-based frame index (number). Requires a known frame rate. */
  FRAME_COUNT = 'FRAME_COUNT',
  /** Percentage of total duration, 0–100 (number). Requires a known duration. */
  PERCENT = 'PERCENT',
  /** SMPTE-style timecode string (e.g. `"01:00:00:00"`). Requires a known frame rate. */
  TIMECODE = 'TIMECODE',

  /** ISO 8601 time-of-day string without date, milliseconds to 3 decimal places (string). */
  MEDIA_TIME = 'MEDIA_TIME',
  /** Countdown variant of {@link MEDIA_TIME}, counting down from the end of the media (string). Requires a known duration. */
  COUNTDOWN_MEDIA_TIME = 'COUNTDOWN_MEDIA_TIME',
}

/**
 * Maps each {@link MediaTemporalFormat} to its TypeScript value type
 * (`number` for numeric formats, `string` for textual formats).
 */
export type MediaTemporalFormatValueMap = {
  [MediaTemporalFormat.SECONDS]: number;
  [MediaTemporalFormat.FRAME_COUNT]: number;

  [MediaTemporalFormat.PERCENT]: number;

  [MediaTemporalFormat.TIMECODE]: string;

  [MediaTemporalFormat.MEDIA_TIME]: string;
  [MediaTemporalFormat.COUNTDOWN_MEDIA_TIME]: string;
};

/**
 * Discriminated map that pairs each {@link MediaTemporalFormat} with a
 * `{ format, value }` object carrying the correctly-typed value.
 */
export type MediaTemporalByFormat = {
  [K in MediaTemporalFormat]: {
    format: K;
    value: MediaTemporalFormatValueMap[K];
  };
};

/**
 * Discriminated union of all `{ format, value }` temporal representations.
 */
export type MediaTemporal = MediaTemporalByFormat[MediaTemporalFormat];

/**
 * Extracts the `{ format, value }` pair for a specific {@link MediaTemporalFormat}.
 */
export type MediaTemporalValueByFormat<F extends MediaTemporalFormat> = MediaTemporalByFormat[F];

/** Shorthand for a seconds-typed `{ format, value }` pair. */
export type MediaTemporalSeconds = MediaTemporalByFormat[MediaTemporalFormat.SECONDS];
/** Shorthand for a frame-count-typed `{ format, value }` pair. */
export type MediaTemporalFrame = MediaTemporalByFormat[MediaTemporalFormat.FRAME_COUNT];

/**
 * Construction arguments for {@link MediaTemporalConverter}.
 * All fields are optional; omitting a field disables conversions that depend on it.
 */
export interface MediaTemporalConverterArgs {
  /** Total media duration in seconds. Required for {@link MediaTemporalFormat.PERCENT} and {@link MediaTemporalFormat.COUNTDOWN_MEDIA_TIME} conversions. */
  duration?: number | undefined;
  /** Frame-rate model (rational fps + drop-frame flag). Required for {@link MediaTemporalFormat.FRAME_COUNT} and {@link MediaTemporalFormat.TIMECODE} conversions. */
  frameRateModel?: FrameRateModel | undefined;
  /** First-frame-of-media (FFOM) timecode model. When present, timecode output is offset so that `0 s` maps to this timecode value instead of `00:00:00:00`. */
  ffomTimecodeModel?: TimecodeModel | undefined;
  /** HLS init-segment time offset in seconds. Applied as a base offset when converting absolute media time to presentation time. */
  initSegmentTimeOffset?: number | undefined;
  /** Indicates if main media has video. **/
  hasVideo?: boolean | undefined;
  /** Indicates if main media has audio. **/
  hasAudio?: boolean | undefined;
}

export class MediaTemporalConverter {
  protected _duration?: number | undefined;
  protected _frameRateModel?: FrameRateModel | undefined;
  protected _ffomTimecodeModel?: TimecodeModel | undefined;
  protected _initSegmentTimeOffset?: number | undefined;
  protected _hasVideo?: boolean | undefined;
  protected _hasAudio?: boolean | undefined;

  private constructor(args?: MediaTemporalConverterArgs) {
    this._duration = args?.duration;
    this._frameRateModel = args?.frameRateModel;
    this._ffomTimecodeModel = args?.ffomTimecodeModel;
    this._initSegmentTimeOffset = args?.initSegmentTimeOffset;
    this._hasVideo = args?.hasVideo;
    this._hasAudio = args?.hasAudio;
  }

  static create(args?: MediaTemporalConverterArgs): MediaTemporalConverter {
    return new MediaTemporalConverter(args);
  }

  convert<S extends MediaTemporalFormat>(
    sourceValue: MediaTemporalFormatValueMap[S],
    sourceFormat: S,
    destinationFormat: MediaTemporalFormat.SECONDS
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  convert<S extends MediaTemporalFormat>(
    sourceValue: MediaTemporalFormatValueMap[S],
    sourceFormat: S,
    destinationFormat: MediaTemporalFormat.FRAME_COUNT
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.FRAME_COUNT];
  convert<S extends MediaTemporalFormat>(
    sourceValue: MediaTemporalFormatValueMap[S],
    sourceFormat: S,
    destinationFormat: MediaTemporalFormat.PERCENT
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.PERCENT];
  convert<S extends MediaTemporalFormat>(
    sourceValue: MediaTemporalFormatValueMap[S],
    sourceFormat: S,
    destinationFormat: MediaTemporalFormat.TIMECODE
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.TIMECODE];
  convert<S extends MediaTemporalFormat>(
    sourceValue: MediaTemporalFormatValueMap[S],
    sourceFormat: S,
    destinationFormat: MediaTemporalFormat.MEDIA_TIME
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.MEDIA_TIME];
  convert<S extends MediaTemporalFormat>(
    sourceValue: MediaTemporalFormatValueMap[S],
    sourceFormat: S,
    destinationFormat: MediaTemporalFormat.COUNTDOWN_MEDIA_TIME
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.COUNTDOWN_MEDIA_TIME];
  convert<S extends MediaTemporalFormat>(sourceValue: MediaTemporalFormatValueMap[S], sourceFormat: S, destinationFormat: MediaTemporalFormat): MediaTemporalFormatValueMap[MediaTemporalFormat];
  convert(sourceValue: MediaTemporalFormatValueMap[MediaTemporalFormat], sourceFormat: MediaTemporalFormat, destinationFormat: MediaTemporalFormat): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    const mediaTemporal = this.convertMediaTemporal(
      {
        format: sourceFormat,
        value: sourceValue,
      } as MediaTemporal,
      destinationFormat
    );
    return mediaTemporal.value;
  }

  convertMediaTemporal(sourceTemporal: MediaTemporal, destinationFormat: MediaTemporalFormat): MediaTemporal {
    switch (destinationFormat) {
      case MediaTemporalFormat.SECONDS: {
        let secondsTemporal = this.convertToSecondsTemporal(sourceTemporal);
        return {
          format: MediaTemporalFormat.SECONDS,
          value: secondsTemporal.value,
        };
      }
      case MediaTemporalFormat.PERCENT: {
        let secondsTemporal = this.convertToSecondsTemporal(sourceTemporal);
        if (isNullOrUndefined(this._duration)) {
          throw new Error(`Duration unknown`);
        }
        let percent = 0;
        if (this._duration > 0) {
          if (secondsTemporal.value >= this._duration) {
            percent = 100;
          } else {
            percent = new Decimal(secondsTemporal.value).div(this._duration).times(100).toNumber();
          }
        }
        return {
          format: MediaTemporalFormat.PERCENT,
          value: percent,
        };
      }
      case MediaTemporalFormat.FRAME_COUNT: {
        if (
          sourceTemporal.format === MediaTemporalFormat.SECONDS ||
          sourceTemporal.format === MediaTemporalFormat.PERCENT ||
          sourceTemporal.format === MediaTemporalFormat.MEDIA_TIME ||
          sourceTemporal.format === MediaTemporalFormat.COUNTDOWN_MEDIA_TIME
        ) {
          let secondsTemporal = this.convertToSecondsTemporal(sourceTemporal);
          let frame = this.timeToFrame(secondsTemporal.value);
          return {
            format: MediaTemporalFormat.FRAME_COUNT,
            value: frame,
          };
        } else {
          let frameTemporal = this.convertToFrameTemporal(sourceTemporal);
          return {
            format: MediaTemporalFormat.FRAME_COUNT,
            value: frameTemporal.value,
          };
        }
      }
      case MediaTemporalFormat.TIMECODE: {
        if (!this._frameRateModel) {
          throw new Error(`Frame rate unknown`);
        }
        let timecodeConverter = TimecodeConverter.create({
          frameRateModel: this._frameRateModel,
          ffomTimecodeModel: this._ffomTimecodeModel,
          initSegmentTimeOffset: this._initSegmentTimeOffset,
          hasVideo: this._hasVideo,
          hasAudio: this._hasAudio,
        });

        if (
          sourceTemporal.format === MediaTemporalFormat.SECONDS ||
          sourceTemporal.format === MediaTemporalFormat.PERCENT ||
          sourceTemporal.format === MediaTemporalFormat.MEDIA_TIME ||
          sourceTemporal.format === MediaTemporalFormat.COUNTDOWN_MEDIA_TIME
        ) {
          let secondsTemporal = this.convertToSecondsTemporal(sourceTemporal);
          return {
            format: MediaTemporalFormat.TIMECODE,
            value: timecodeConverter.timeToTimecodeModel(secondsTemporal.value).valueText,
          };
        } else {
          let frameTemporal = this.convertToFrameTemporal(sourceTemporal);
          return {
            format: MediaTemporalFormat.TIMECODE,
            value: timecodeConverter.frameToTimecodeModel(frameTemporal.value).valueText,
          };
        }
      }
      case MediaTemporalFormat.MEDIA_TIME: {
        const mediaTimeConverter = MediaTimeConverter.create();
        const seconds = this.convertToSecondsTemporal(sourceTemporal).value;
        return {
          format: MediaTemporalFormat.MEDIA_TIME,
          value: mediaTimeConverter.timeToMediaTimeModel(seconds).valueText,
        };
      }
      case MediaTemporalFormat.COUNTDOWN_MEDIA_TIME: {
        if (isNullOrUndefined(this._duration)) {
          throw new Error(`Can't convert to countdown media time without media duration`);
        }

        const countdownMediaTimeConverter = CountdownMediaTimeConverter.create({
          duration: this._duration!,
        });
        const seconds = this.convertToSecondsTemporal(sourceTemporal).value;

        return {
          format: MediaTemporalFormat.COUNTDOWN_MEDIA_TIME,
          value: countdownMediaTimeConverter.timeToCountdownMediaTimeModel(seconds).valueText,
        };
      }
      default:
        throw new Error(`Unsupported format: "${destinationFormat}"`);
    }
  }

  private convertToSecondsTemporal(sourceTemporal: MediaTemporal): MediaTemporalSeconds {
    let time = 0;
    switch (sourceTemporal.format) {
      case MediaTemporalFormat.SECONDS: {
        time = sourceTemporal.value;
        break;
      }
      case MediaTemporalFormat.PERCENT: {
        if (isNullOrUndefined(this._duration)) {
          throw new Error(`Duration unknown`);
        }
        let percent = z.coerce.number().min(0).max(100).parse(sourceTemporal.value);

        if (this._duration <= 0) {
          time = 0;
        } else {
          time = new Decimal(percent).div(100).times(this._duration).toNumber();
        }
        break;
      }
      case MediaTemporalFormat.FRAME_COUNT: {
        time = this.frameToTime(sourceTemporal.value);
        break;
      }
      case MediaTemporalFormat.TIMECODE: {
        let frame = this.timecodeToFrame(sourceTemporal.value);
        time = this.frameToTime(frame);
        break;
      }
      case MediaTemporalFormat.MEDIA_TIME:
        const mediaTimeConverter = MediaTimeConverter.create();
        time = mediaTimeConverter.mediaTimeToSeconds(sourceTemporal.value);
        break;
      case MediaTemporalFormat.COUNTDOWN_MEDIA_TIME: {
        if (isNullOrUndefined(this._duration)) {
          throw new Error(`Can't convert countdown media time without media duration`);
        }

        const countdownMediaTimeConverter = CountdownMediaTimeConverter.create({
          duration: this._duration!,
        });
        time = countdownMediaTimeConverter.countdownMediaTimeToSeconds(sourceTemporal.value);
        break;
      }
      default:
        throw new Error(`Unsupported format`);
    }
    return {
      format: MediaTemporalFormat.SECONDS,
      value: this.constrainTime(time),
    };
  }

  private convertToFrameTemporal(sourceTemporal: MediaTemporal): MediaTemporalFrame {
    let frame = 0;
    switch (sourceTemporal.format) {
      case MediaTemporalFormat.SECONDS: {
        let secondsTemporal = this.convertToSecondsTemporal(sourceTemporal);
        frame = this.timeToFrame(secondsTemporal.value);
        break;
      }
      case MediaTemporalFormat.PERCENT: {
        let secondsTemporal = this.convertToSecondsTemporal(sourceTemporal);
        frame = this.timeToFrame(secondsTemporal.value);
        break;
      }
      case MediaTemporalFormat.FRAME_COUNT: {
        frame = sourceTemporal.value;
        break;
      }
      case MediaTemporalFormat.TIMECODE: {
        frame = this.timecodeToFrame(sourceTemporal.value);
        break;
      }
      case MediaTemporalFormat.MEDIA_TIME:
      case MediaTemporalFormat.COUNTDOWN_MEDIA_TIME: {
        let secondsTemporal = this.convertToSecondsTemporal(sourceTemporal);
        frame = this.timeToFrame(secondsTemporal.value);
        break;
      }
      default:
        throw new Error(`Unsupported format`);
    }
    return {
      format: MediaTemporalFormat.FRAME_COUNT,
      value: this.constrainFrame(frame),
    };
  }

  private frameToTime(frame: number): number {
    frame = this.constrainFrame(frame);
    if (!this._frameRateModel) {
      throw new Error(`Frame rate unknown`);
    }
    let time = new Decimal(frame).div(this._frameRateModel.value).toNumber();
    if (this._initSegmentTimeOffset && frame > 0) {
      time = time + this._initSegmentTimeOffset;
    }
    return time;
  }

  private timeToFrame(time: number): number {
    time = this.constrainTime(time);
    if (!this._frameRateModel) {
      throw new Error(`Frame rate unknown`);
    }
    let frame = 0;
    if (this._initSegmentTimeOffset) {
      let isInsideInitSegment = time >= 0 && time < this._initSegmentTimeOffset;
      if (isInsideInitSegment) {
        // all time values inside init segment are 0
      } else {
        let offsettedTime = time - this._initSegmentTimeOffset;
        frame = Decimal.mul(this._frameRateModel.value, offsettedTime).floor().toNumber();
      }
    } else {
      frame = Decimal.mul(this._frameRateModel.value, time).floor().toNumber();
    }
    return this.constrainFrame(frame);
  }

  private constrainTime(time: number): number {
    if (time < 0) {
      throw new Error(`Time must be positive, given ${time}`);
    }
    return time;
  }

  private constrainFrame(frame: number): number {
    if (frame < 0) {
      throw new Error(`Frame must be positive, given ${frame}`);
    }
    return frame;
  }

  private timecodeToFrame(timecodeValueText: string): number {
    if (!this._frameRateModel) {
      throw new Error(`Frame rate unknown`);
    }
    let timecodeConverter = TimecodeConverter.create({
      frameRateModel: this._frameRateModel,
      ffomTimecodeModel: this._ffomTimecodeModel,
      initSegmentTimeOffset: this._initSegmentTimeOffset,
      hasVideo: this._hasVideo,
      hasAudio: this._hasAudio,
    });
    let timecodeModel = timecodeConverter.parseValueTextToTimecodeModel(timecodeValueText);
    let frame = timecodeConverter.timecodeModelToFrameNumber(timecodeModel);

    if (this._ffomTimecodeModel) {
      return frame - timecodeConverter.timecodeModelToFrameNumber(this._ffomTimecodeModel);
    }
    return frame;
  }
}
