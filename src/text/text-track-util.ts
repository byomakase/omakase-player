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

import Decimal from 'decimal.js';
import {MediaTimeConverter, type MediaTimeModel} from '../common/media-time';
import {FallbackFormat, type OutputTextFileFormatType, type SlewOptions, TimeReference} from '../media';
import {FrameRateResolver} from '../common/frame-rate';
import {isNullOrUndefined} from '../util/util-functions';
import {FileFormatType, MediaTemporalConverter, MediaTemporalFormat} from '../common';
import type {TimecodeModel} from '../common/timecode';

type TimeBase = 'media' | 'smpte' | 'clock';

interface MediaTimeBaseModel {
  expectedFrameRate: number | string | undefined;
  effectiveFrameRate: number;
  tickRate: number;
}

interface CueTimestamp {
  oldValue: number;
  newValue: number;
  newValueText: string;
}

export class TextTrackUtil {
  private static _vttCueTimingRegex: RegExp = /^(((\d{2,}):)?(\d{2}):(\d{2})\.(\d{3}))\s+-->\s+(((\d{2,}):)?(\d{2}):(\d{2})\.(\d{3}))(\s+.*)?$/;
  private static _srtCueTimingRegex: RegExp = /^((\d{2,}):(\d{2}):(\d{2}),(\d{3}))\s+-->\s+((\d{2,}):(\d{2}):(\d{2}),(\d{3}))(\s+.*)?$/;
  private static _minBeginTime = 0;
  private static _minEndTime = 0.001;

  static slewImscContent(content: string, slewOptions: SlewOptions): string {
    const document = this.parseImscContent(content);
    const tt = document.documentElement;
    const TTP = 'http://www.w3.org/ns/ttml#parameter';

    const resolveMediaTimeBaseModel = (): MediaTimeBaseModel => {
      const frameRate = tt.hasAttributeNS(TTP, 'frameRate') ? parseInt(tt.getAttributeNS(TTP, 'frameRate')!, 10) : 30;
      const frameRateMultiplier = tt.getAttributeNS(TTP, 'frameRateMultiplier')?.trim() ?? '1 1';
      const tickRate = tt.hasAttributeNS(TTP, 'tickRate') ? parseInt(tt.getAttributeNS(TTP, 'tickRate')!, 10) : 1;

      let multiplier = frameRateMultiplier.split(/\s+/);
      let frameRateFraction = `${frameRate * parseInt(multiplier[0]!)}/${parseInt(multiplier[1]!)}`;
      let frameRateModel = FrameRateResolver.resolveFrameRateModel(frameRateFraction);

      return {
        expectedFrameRate: slewOptions.expectedFrameRate,
        effectiveFrameRate: frameRateModel.value,
        tickRate,
      };
    };

    const timeBase: TimeBase = (tt.getAttributeNS(TTP, 'timeBase') as TimeBase) ?? 'media';
    if (timeBase === 'clock' || timeBase === 'smpte') {
      throw new Error(`Slewing ttml with ${timeBase} timeBase is not supported`);
    } else if (timeBase === 'media') {
      this.slewMediaTimeBaseContent(tt, slewOptions.timeSlew, resolveMediaTimeBaseModel());
    } else {
      throw new Error(`Unknown timeBase attribute: ${timeBase}`);
    }

    return this.serializeImscDocument(document);
  }

  static slewVttContent(content: string, slewOptions: SlewOptions): string {
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    let minCueBeginTime = this._minBeginTime;
    let minCueEndTime = this._minEndTime;

    return lines
      .map((line) => {
        if (!this._vttCueTimingRegex.test(line)) {
          return line;
        }

        let cueTiming = this._vttCueTimingRegex.exec(line);
        let cueBeginTimestamp = cueTiming!.at(1)!;
        let cueEndTimestamp = cueTiming!.at(7)!;
        let cueSettings = cueTiming!.at(13) ?? '';

        let newCueBeginTimestamp = TextTrackCueTimestampSlewer.slewVttCueTimestamp(cueBeginTimestamp, slewOptions.timeSlew, minCueBeginTime);
        let newCueEndTimestamp = TextTrackCueTimestampSlewer.slewVttCueTimestamp(cueEndTimestamp, slewOptions.timeSlew, minCueEndTime);

        if (newCueBeginTimestamp.oldValue + slewOptions.timeSlew < 0 && newCueEndTimestamp.oldValue + slewOptions.timeSlew < 0) {
          minCueBeginTime = newCueEndTimestamp.newValue;
          minCueEndTime = minCueBeginTime + this._minEndTime;
        }

        return `${newCueBeginTimestamp.newValueText} --> ${newCueEndTimestamp.newValueText}${cueSettings}`;
      })
      .join('\n');
  }

  static slewSrtContent(content: string, slewOptions: SlewOptions): string {
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    let minCueBeginTime = this._minBeginTime;
    let minCueEndTime = this._minEndTime;

    return lines
      .map((line) => {
        if (!this._srtCueTimingRegex.test(line)) {
          return line;
        }

        let cueTiming = this._srtCueTimingRegex.exec(line);
        let cueBeginTimestamp = cueTiming!.at(1)!;
        let cueEndTimestamp = cueTiming!.at(6)!;
        let cueSettings = cueTiming!.at(11) ?? '';

        let newCueBeginTimestamp = TextTrackCueTimestampSlewer.slewSrtCueTimestamp(cueBeginTimestamp, slewOptions.timeSlew, minCueBeginTime);
        let newCueEndTimestamp = TextTrackCueTimestampSlewer.slewSrtCueTimestamp(cueEndTimestamp, slewOptions.timeSlew, minCueEndTime);

        if (newCueBeginTimestamp.oldValue + slewOptions.timeSlew < 0 && newCueEndTimestamp.oldValue + slewOptions.timeSlew < 0) {
          minCueBeginTime = newCueEndTimestamp.newValue;
          minCueEndTime = minCueBeginTime + this._minEndTime;
        }

        return `${newCueBeginTimestamp.newValueText} --> ${newCueEndTimestamp.newValueText}${cueSettings}`;
      })
      .join('\n');
  }

  static slewAssContent(content: string, slewOptions: SlewOptions): string {
    const lines = content.split(/\r?\n/).map((l) => l.trim());

    let eventsSection: string[] = [];
    let otherLines: string[] = [];
    let eventsSectionFound = false;
    lines.forEach((line) => {
      if (!eventsSectionFound && line.startsWith('[Events]')) {
        eventsSectionFound = true;
      }

      if (eventsSectionFound) {
        eventsSection.push(line);
      } else {
        otherLines.push(line);
      }
    });
    if (!eventsSectionFound) {
      return lines.join('\n');
    }

    let formatLine = eventsSection.find((line) => line.startsWith('Format:'));
    if (!formatLine) {
      return lines.join('\n');
    }

    let minCueBeginTime = this._minBeginTime;
    let minCueEndTime = this._minEndTime;
    let formatFields = formatLine
      .slice(7)
      .split(',')
      .map((field) => field.trim().toLowerCase());
    let startFieldIdx = formatFields.indexOf('start');
    let endFieldIdx = formatFields.indexOf('end');

    const slewedLines = eventsSection.map((line) => {
      if (!line.startsWith('Dialogue:')) {
        return line;
      }

      let dialogueFields = line.slice(9).trim().split(',');
      let cueBeginTimestamp = dialogueFields.at(startFieldIdx);
      let cueEndTimestamp = dialogueFields.at(endFieldIdx);
      if (!cueBeginTimestamp || !cueEndTimestamp) {
        return line;
      }

      let newCueBeginTimestamp = TextTrackCueTimestampSlewer.slewAssCueTimestamp(cueBeginTimestamp, slewOptions.timeSlew, minCueBeginTime);
      let newCueEndTimestamp = TextTrackCueTimestampSlewer.slewAssCueTimestamp(cueEndTimestamp, slewOptions.timeSlew, minCueEndTime);

      if (newCueBeginTimestamp.oldValue + slewOptions.timeSlew < 0 && newCueEndTimestamp.oldValue + slewOptions.timeSlew < 0) {
        minCueBeginTime = newCueEndTimestamp.newValue;
        minCueEndTime = minCueBeginTime + this._minEndTime;
      }

      dialogueFields[startFieldIdx] = newCueBeginTimestamp.newValueText;
      dialogueFields[endFieldIdx] = newCueEndTimestamp.newValueText;

      return 'Dialogue: ' + dialogueFields.join(',');
    });

    return [...otherLines, ...slewedLines].join('\n');
  }

  static updateImscContentStyling(content: string): string {
    const document = this.parseImscContent(content);
    const tt = document.documentElement;
    const TTS = 'http://www.w3.org/ns/ttml#styling';

    let regionElems = tt.getElementsByTagName('region');
    let bodyElems = tt.getElementsByTagName('body');

    Array.of(...regionElems).forEach((region) => region.setAttributeNS(TTS, 'overflow', 'visible'));
    Array.of(...bodyElems).forEach((body) => body.setAttributeNS(TTS, 'lineHeight', '127%'));

    return this.serializeImscDocument(document);
  }

  private static parseImscContent(content: string): Document {
    const parser = new DOMParser();
    const document = parser.parseFromString(content, 'application/xml');
    const error = document.querySelector('parsererror');
    if (error) {
      throw new Error(`Invalid TTML file: ${error.textContent}`);
    }
    return document;
  }

  private static serializeImscDocument(document: Document): string {
    return new XMLSerializer().serializeToString(document);
  }

  private static slewMediaTimeBaseContent(tt: HTMLElement, timeSlew: number, mediaTimeBaseModel: MediaTimeBaseModel): void {
    let bodyElems = tt.getElementsByTagName('body');
    if (!timeSlew || !bodyElems.length) {
      return;
    }

    let bodyElem = bodyElems[0]!;
    if (timeSlew >= 0) {
      if (bodyElem.hasAttribute('begin')) {
        bodyElem.setAttribute('begin', TextTrackCueTimestampSlewer.slewImscCueTimestamp(bodyElem.getAttribute('begin')!, mediaTimeBaseModel, timeSlew, this._minBeginTime).newValueText);
      } else {
        bodyElem.setAttribute('begin', TextTrackCueTimestampSlewer.secondsToImscMediaTimeCue(timeSlew));
      }

      if (bodyElem.hasAttribute('end')) {
        bodyElem.setAttribute('end', TextTrackCueTimestampSlewer.slewImscCueTimestamp(bodyElem.getAttribute('end')!, mediaTimeBaseModel, timeSlew, this._minEndTime).newValueText);
      }
    } else {
      this.recursivelySlewElements(Array.of(bodyElem), mediaTimeBaseModel, timeSlew);
    }
  }

  private static recursivelySlewElements(elems: Element[], mediaTimeBaseModel: MediaTimeBaseModel, timeSlew: number): number {
    if (!elems.length) {
      return timeSlew;
    }

    elems.forEach((elem) => {
      let remainingTimeSlew = new Decimal(timeSlew);
      if (elem.hasAttribute('begin')) {
        let newCueBeginTimestamp = TextTrackCueTimestampSlewer.slewImscCueTimestamp(elem.getAttribute('begin')!, mediaTimeBaseModel, timeSlew, this._minBeginTime);
        remainingTimeSlew = remainingTimeSlew.plus(newCueBeginTimestamp.oldValue).minus(newCueBeginTimestamp.newValue);
        elem.setAttribute('begin', newCueBeginTimestamp.newValueText);
      }

      if (elem.hasAttribute('end')) {
        let newCueEndTimestamp = TextTrackCueTimestampSlewer.slewImscCueTimestamp(elem.getAttribute('end')!, mediaTimeBaseModel, timeSlew, this._minEndTime);
        elem.setAttribute('end', newCueEndTimestamp.newValueText);
      }

      if (remainingTimeSlew.lt(0)) {
        let oldTimeSlew = this.recursivelySlewElements(
          Array.of(...elem.children).filter((e) => e.tagName.toLowerCase() === 'div'),
          mediaTimeBaseModel,
          remainingTimeSlew.toNumber()
        );

        if (oldTimeSlew < 0) {
          const timedElems = elem.querySelectorAll(':scope > p[begin][end]');
          let minBeginTime = this._minBeginTime;
          let minEndTime = this._minEndTime;

          timedElems.forEach((e) => {
            let newCueBeginTimestamp = TextTrackCueTimestampSlewer.slewImscCueTimestamp(e.getAttribute('begin')!, mediaTimeBaseModel, oldTimeSlew, minBeginTime);
            let newCueEndTimestamp = TextTrackCueTimestampSlewer.slewImscCueTimestamp(e.getAttribute('end')!, mediaTimeBaseModel, oldTimeSlew, minEndTime);

            e.setAttribute('begin', newCueBeginTimestamp.newValueText);
            e.setAttribute('end', newCueEndTimestamp.newValueText);

            if (newCueBeginTimestamp.oldValue + oldTimeSlew < 0 && newCueEndTimestamp.oldValue + oldTimeSlew < 0) {
              minBeginTime = newCueEndTimestamp.newValue;
              minEndTime = minBeginTime + this._minEndTime;
            }
          });
        }
      }
    });

    return timeSlew;
  }

  static resolveSlewOptions(timeReference: TimeReference, ffomTimecodeModel: TimecodeModel | undefined): SlewOptions | undefined {
    switch (timeReference) {
      case TimeReference.SELF:
        return void 0;
      case TimeReference.FFOM:
        if (!ffomTimecodeModel) {
          return void 0;
        }

        let timeSlew = MediaTemporalConverter.create({
          frameRateModel: ffomTimecodeModel.frameRateModel,
        }).convert(ffomTimecodeModel.valueText, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS);

        return timeSlew
          ? {
              timeSlew: -timeSlew,
              expectedFrameRate: ffomTimecodeModel.frameRateModel.value,
            }
          : void 0;
      default:
        throw new Error(`Unknow timeReference ${timeReference}`);
    }
  }

  static resolveOutputFormat(fallbackFormat: FallbackFormat): OutputTextFileFormatType | undefined {
    switch (fallbackFormat) {
      case FallbackFormat.TTML:
        return FileFormatType.TTML;
      case FallbackFormat.VTT:
        return FileFormatType.VTT;
      case FallbackFormat.SRT:
        return FileFormatType.SRT;
      case FallbackFormat.NONE:
        return void 0;
      default:
        throw new Error(`Unknown fallbackFormat ${fallbackFormat}`);
    }
  }

  static isUnplayableTextTrackFileFormatType(fileFormatType?: FileFormatType): boolean {
    switch (fileFormatType) {
      case FileFormatType.SCC:
      case FileFormatType.STL:
        return true;
      default:
        return false;
    }
  }
}

class TextTrackCueTimestampSlewer {
  private static _vttOrAssCueMediaTimeRegex: RegExp = /^((\d{1,3}):)?(\d{2}):(\d{2})(\.(\d{1,3}))?$/;
  private static _srtCueMediaTimeRegex: RegExp = /^(\d{1,3}):(\d{2}):(\d{2}),(\d{1,3})$/;
  private static _imscCueMediaTimeRegex: RegExp = /^(\d{1,}):(\d{2}):(\d{2})(\.(\d{1,}))?$/;
  private static _imscCueMediaTimeWithFramesRegex = /^(\d{1,}):(\d{2}):(\d{2})(:(\d{1,}))?$/;
  private static _imscCueSecondsOffsetTimeRegex = /^(\d{1,})(\.(\d{1,}))?s$/;
  private static _imscCueFramesOffsetTimeRegex = /^(\d{1,})(\.(\d{1,}))?f$/;
  private static _imscCueTicksOffsetTimeRegex = /^(\d{1,})(\.(\d{1,}))?t$/;
  private static _mediaTimeConverter: MediaTimeConverter = MediaTimeConverter.create();
  private static _fillStringValue = '0';

  static slewVttCueTimestamp(vttCueTimestamp: string, timeSlew: number, minTime: number): CueTimestamp {
    if (!this._vttOrAssCueMediaTimeRegex.test(vttCueTimestamp)) {
      throw new Error(`Slewing vtt cue timestamp ${vttCueTimestamp} is not supported`);
    }

    const cueTimestampParts = this._vttOrAssCueMediaTimeRegex.exec(vttCueTimestamp);

    const hoursString = cueTimestampParts!.at(2) ? cueTimestampParts!.at(2)! : this._fillStringValue;
    const minutesString = cueTimestampParts!.at(3)!;
    const secondsString = cueTimestampParts!.at(4)!;
    const millisecondsString = cueTimestampParts!.at(6) ?? this._fillStringValue;

    const totalSeconds = this._mediaTimeConverter.hourMinSecMillisToSeconds(hoursString, minutesString, secondsString, millisecondsString);
    const newTotalSeconds = this.clampTime(this.slewTime(totalSeconds, timeSlew), minTime);

    return {
      oldValue: totalSeconds,
      newValue: newTotalSeconds,
      newValueText: this.secondsToVttMediaTimeCue(newTotalSeconds),
    };
  }

  static slewSrtCueTimestamp(srtCueTimestamp: string, timeSlew: number, minTime: number): CueTimestamp {
    if (!this._srtCueMediaTimeRegex.test(srtCueTimestamp)) {
      throw new Error(`Slewing srt cue timestamp ${srtCueTimestamp} is not supported`);
    }

    const cueTimestampParts = this._srtCueMediaTimeRegex.exec(srtCueTimestamp);

    const hoursString = cueTimestampParts!.at(1)!;
    const minutesString = cueTimestampParts!.at(2)!;
    const secondsString = cueTimestampParts!.at(3)!;
    const millisecondsString = cueTimestampParts!.at(4)!;

    const totalSeconds = this._mediaTimeConverter.hourMinSecMillisToSeconds(hoursString, minutesString, secondsString, millisecondsString);
    const newTotalSeconds = this.clampTime(this.slewTime(totalSeconds, timeSlew), minTime);

    return {
      oldValue: totalSeconds,
      newValue: newTotalSeconds,
      newValueText: this.secondsToSrtMediaTimeCue(newTotalSeconds),
    };
  }

  static slewImscCueTimestamp(imscCueTimestamp: string, mediaTimeBaseModel: MediaTimeBaseModel, timeSlew: number, minTime: number): CueTimestamp {
    if (this._imscCueMediaTimeRegex.test(imscCueTimestamp)) {
      const cueTimestampParts = this._imscCueMediaTimeRegex.exec(imscCueTimestamp);

      const hoursString = cueTimestampParts!.at(1)!;
      const minutesString = cueTimestampParts!.at(2)!;
      const secondsString = cueTimestampParts!.at(3)!;
      const millisecondsString = cueTimestampParts!.at(5) ?? this._fillStringValue;

      const totalSeconds = this._mediaTimeConverter.hourMinSecMillisToSeconds(hoursString, minutesString, secondsString, millisecondsString);
      const newTotalSeconds = this.clampTime(this.slewTime(totalSeconds, timeSlew), minTime);

      return {
        oldValue: totalSeconds,
        newValue: newTotalSeconds,
        newValueText: this.secondsToImscMediaTimeCue(newTotalSeconds),
      };
    } else if (this._imscCueMediaTimeWithFramesRegex.test(imscCueTimestamp)) {
      const {expectedFrameRate, effectiveFrameRate} = mediaTimeBaseModel;
      if (!isNullOrUndefined(expectedFrameRate)) {
        let expectedFrameRateModel = FrameRateResolver.resolveFrameRateModel(expectedFrameRate!);
        if (effectiveFrameRate !== expectedFrameRateModel.value) {
          throw new Error(`Expected frame rate: ${expectedFrameRateModel.value} is not equal to ttml file frame rate: ${effectiveFrameRate}`);
        }
      }

      const cueTimestampParts = this._imscCueMediaTimeWithFramesRegex.exec(imscCueTimestamp);

      const hoursString = cueTimestampParts!.at(1)!;
      const minutesString = cueTimestampParts!.at(2)!;
      const secondsString = cueTimestampParts!.at(3)!;
      const framesString = cueTimestampParts!.at(5) ?? this._fillStringValue;

      const hours = new Decimal(hoursString);
      const minutes = new Decimal(minutesString);
      const seconds = new Decimal(secondsString);
      const frames = new Decimal(framesString);

      const totalSeconds = hours.mul(3600).plus(minutes.mul(60)).plus(seconds).plus(frames.div(effectiveFrameRate)).toNumber();
      const newTotalSeconds = this.clampTime(this.slewTime(totalSeconds, timeSlew), minTime);

      return {
        oldValue: totalSeconds,
        newValue: newTotalSeconds,
        newValueText: this.secondsToImscMediaTimeWithFramesCue(newTotalSeconds, effectiveFrameRate),
      };
    } else if (this._imscCueSecondsOffsetTimeRegex.test(imscCueTimestamp)) {
      const cueTimestampParts = this._imscCueSecondsOffsetTimeRegex.exec(imscCueTimestamp);

      const secondsString = cueTimestampParts!.at(1)!;
      const millisecondsString = cueTimestampParts!.at(3) ?? this._fillStringValue;

      const totalSeconds = this._mediaTimeConverter.hourMinSecMillisToSeconds(this._fillStringValue, this._fillStringValue, secondsString, millisecondsString);
      const newTotalSeconds = this.clampTime(this.slewTime(totalSeconds, timeSlew), minTime);

      return {
        oldValue: totalSeconds,
        newValue: newTotalSeconds,
        newValueText: this.secondsToImscSecondsOffsetCue(newTotalSeconds),
      };
    } else if (this._imscCueFramesOffsetTimeRegex.test(imscCueTimestamp)) {
      const {expectedFrameRate, effectiveFrameRate} = mediaTimeBaseModel;
      if (!isNullOrUndefined(expectedFrameRate)) {
        let expectedFrameRateModel = FrameRateResolver.resolveFrameRateModel(expectedFrameRate!);
        if (effectiveFrameRate !== expectedFrameRateModel.value) {
          throw new Error(`Expected frame rate: ${expectedFrameRateModel.value} is not equal to ttml file frame rate: ${effectiveFrameRate}`);
        }
      }

      const cueTimestampParts = this._imscCueFramesOffsetTimeRegex.exec(imscCueTimestamp);

      const framesString = cueTimestampParts!.at(1)!;
      const fractionalFramesString = cueTimestampParts!.at(3) ?? this._fillStringValue;

      const frames = new Decimal(framesString);
      const fractionalFrames = new Decimal(fractionalFramesString).div(Math.pow(10, `${fractionalFramesString}`.length));

      const totalSeconds = frames.plus(fractionalFrames).div(effectiveFrameRate).toNumber();
      const newTotalSeconds = this.clampTime(this.slewTime(totalSeconds, timeSlew), minTime);

      return {
        oldValue: totalSeconds,
        newValue: newTotalSeconds,
        newValueText: this.secondsToImscFramesOffsetCue(newTotalSeconds, effectiveFrameRate),
      };
    } else if (this._imscCueTicksOffsetTimeRegex.test(imscCueTimestamp)) {
      const cueTimestampParts = this._imscCueTicksOffsetTimeRegex.exec(imscCueTimestamp);

      const ticksString = cueTimestampParts!.at(1)!;
      const fractionalTicksString = cueTimestampParts!.at(3) ?? this._fillStringValue;

      const ticks = new Decimal(ticksString);
      const fractionalTicks = new Decimal(fractionalTicksString).div(Math.pow(10, `${fractionalTicksString}`.length));

      const totalSeconds = ticks.plus(fractionalTicks).div(mediaTimeBaseModel.tickRate).toNumber();
      const newTotalSeconds = this.clampTime(this.slewTime(totalSeconds, timeSlew), minTime);

      return {
        oldValue: totalSeconds,
        newValue: newTotalSeconds,
        newValueText: this.secondsToImscTicksOffsetCue(newTotalSeconds, mediaTimeBaseModel.tickRate),
      };
    } else {
      throw new Error(`Slewing imsc cue timestamp ${imscCueTimestamp} is not supported`);
    }
  }

  static slewAssCueTimestamp(assCueTimestamp: string, timeSlew: number, minTime: number): CueTimestamp {
    if (!this._vttOrAssCueMediaTimeRegex.test(assCueTimestamp)) {
      throw new Error(`Slewing ass/ssa cue timestamp ${assCueTimestamp} is not supported`);
    }

    const cueTimestampParts = this._vttOrAssCueMediaTimeRegex.exec(assCueTimestamp);

    const hoursString = cueTimestampParts!.at(2) ? cueTimestampParts!.at(2)! : this._fillStringValue;
    const minutesString = cueTimestampParts!.at(3)!;
    const secondsString = cueTimestampParts!.at(4)!;
    const millisecondsString = cueTimestampParts!.at(6) ? cueTimestampParts!.at(6)! : this._fillStringValue;

    const totalSeconds = this._mediaTimeConverter.hourMinSecMillisToSeconds(hoursString, minutesString, secondsString, millisecondsString);
    const newTotalSeconds = this.clampTime(this.slewTime(totalSeconds, timeSlew), minTime);

    return {
      oldValue: totalSeconds,
      newValue: newTotalSeconds,
      newValueText: this.secondsToAssMediaTimeCue(newTotalSeconds),
    };
  }

  static secondsToVttMediaTimeCue(seconds: number): string {
    return this.formatMediaTimeCue(this._mediaTimeConverter.decimalTimeToHourMinSecMillis(new Decimal(seconds)), '.', 2, 3);
  }

  static secondsToSrtMediaTimeCue(seconds: number): string {
    return this.formatMediaTimeCue(this._mediaTimeConverter.decimalTimeToHourMinSecMillis(new Decimal(seconds)), ',', 2, 3);
  }

  static secondsToAssMediaTimeCue(seconds: number): string {
    return this.formatMediaTimeCue(this._mediaTimeConverter.decimalTimeToHourMinSecMillis(new Decimal(seconds), 10), '.', 1, 2);
  }

  static secondsToImscMediaTimeCue(seconds: number): string {
    return this.formatMediaTimeCue(this._mediaTimeConverter.decimalTimeToHourMinSecMillis(new Decimal(seconds)), '.', 2, 3);
  }

  static secondsToImscMediaTimeWithFramesCue(seconds: number, frameRate: number): string {
    let remainingTime = new Decimal(seconds);

    const hoursDecimal = remainingTime.div(3600).floor();
    remainingTime = remainingTime.minus(hoursDecimal.mul(3600));

    const minutesDecimal = remainingTime.div(60).floor();
    remainingTime = remainingTime.minus(minutesDecimal.times(60));

    const secondsDecimal = remainingTime.floor();
    remainingTime = remainingTime.minus(secondsDecimal);

    const frames = remainingTime.mul(frameRate).round();

    return `${hoursDecimal.toString().padStart(2, this._fillStringValue)}:${minutesDecimal.toString().padStart(2, this._fillStringValue)}:${secondsDecimal.toString().padStart(2, this._fillStringValue)}:${frames.toString().padStart(2, this._fillStringValue)}`;
  }

  static secondsToImscSecondsOffsetCue(seconds: number): string {
    return `${seconds}s`;
  }

  static secondsToImscFramesOffsetCue(seconds: number, frameRate: number): string {
    return `${Decimal.mul(frameRate, seconds).toNumber()}f`;
  }

  static secondsToImscTicksOffsetCue(seconds: number, tickRate: number): string {
    return `${Decimal.mul(seconds, tickRate).toNumber()}t`;
  }

  private static formatMediaTimeCue(cueTime: Omit<MediaTimeModel, 'valueText'>, msSeparator: string, hPad: number, msPad: number): string {
    return `${cueTime.hours.toString().padStart(hPad, this._fillStringValue)}:${cueTime.minutes.toString().padStart(2, this._fillStringValue)}:${cueTime.seconds.toString().padStart(2, this._fillStringValue)}${msSeparator}${cueTime.milliseconds.toString().padStart(msPad, this._fillStringValue)}`;
  }

  private static clampTime(time: number, minTime: number): number {
    return Math.max(minTime, time);
  }

  private static slewTime(seconds: number, timeSlew: number): number {
    return new Decimal(seconds).plus(timeSlew).toNumber();
  }
}
