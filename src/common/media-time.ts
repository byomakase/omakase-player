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
import type {Serializable} from './capabilities';

const regexValueTextMediaTime = /^(\d{1,3}):(\d{2}):(\d{2})\.(\d{1,3})$/;

export interface MediaTimeModel extends Serializable {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  valueText: string;
}

export class MediaTimeConverter {
  private constructor() {}

  static create() {
    return new MediaTimeConverter();
  }

  timeToMediaTimeModel(time: number): MediaTimeModel {
    return this.decimalTimeToMediaTimeModel(new Decimal(time));
  }

  mediaTimeToSeconds(mediaTime: string): number {
    if (!regexValueTextMediaTime.test(mediaTime)) {
      throw new Error(`Invalid media time value ${mediaTime}`);
    }

    const mediaTimeParts = regexValueTextMediaTime.exec(mediaTime);

    const hoursString = mediaTimeParts!.at(1)!;
    const minutesString = mediaTimeParts!.at(2)!;
    const secondsString = mediaTimeParts!.at(3)!;
    const millisecondsString = mediaTimeParts!.at(4)!;

    return this.hourMinSecMillisToSeconds(hoursString, minutesString, secondsString, millisecondsString);
  }

  hourMinSecMillisToSeconds(h: number | string, m: number | string, s: number | string, ms: number | string): number {
    const hours = new Decimal(h);
    const minutes = new Decimal(m);
    const seconds = new Decimal(s);
    const milliseconds = new Decimal(ms).div(Math.pow(10, `${ms}`.length)); // converts .2 into 200 milliseconds instead of 2
    const totalSeconds = hours.mul(3600).plus(minutes.mul(60)).plus(seconds).plus(milliseconds);

    return totalSeconds.toNumber();
  }

  decimalTimeToHourMinSecMillis(decimalTime: Decimal, rollover?: number): Omit<MediaTimeModel, 'valueText'> {
    let hoursDecimal = decimalTime.div(3600).floor(); // 60 min * 60 sec
    let remainingTimeDecimal = decimalTime.minus(hoursDecimal.mul(3600));

    if (rollover && hoursDecimal.gte(rollover)) {
      hoursDecimal = hoursDecimal.modulo(rollover); // rollover
    }

    const minutesDecimal = remainingTimeDecimal.div(60).floor();
    remainingTimeDecimal = remainingTimeDecimal.minus(minutesDecimal.times(60));

    const secondsDecimal = remainingTimeDecimal.floor();
    remainingTimeDecimal = remainingTimeDecimal.minus(secondsDecimal);
    const millisecondsDecimal = remainingTimeDecimal.mul(1000).floor();

    return {
      hours: hoursDecimal.toNumber(),
      minutes: minutesDecimal.toNumber(),
      seconds: secondsDecimal.toNumber(),
      milliseconds: millisecondsDecimal.toNumber(),
    };
  }

  private decimalTimeToMediaTimeModel(decimalTime: Decimal): MediaTimeModel {
    return this.createMediaTimeModel({
      ...this.decimalTimeToHourMinSecMillis(decimalTime, 1000),
    });
  }

  private createMediaTimeModel(hmsms: Pick<MediaTimeModel, 'hours' | 'minutes' | 'seconds' | 'milliseconds'>): MediaTimeModel {
    return {
      ...hmsms,
      valueText: this.formatMediaTimeValueText(hmsms),
    };
  }
  private formatMediaTimeValueText(hmsms: Pick<MediaTimeModel, 'hours' | 'minutes' | 'seconds' | 'milliseconds'>) {
    return `${hmsms.hours.toString().padStart(2, '0')}:${hmsms.minutes.toString().padStart(2, '0')}:${hmsms.seconds.toString().padStart(2, '0')}.${hmsms.milliseconds.toString().padStart(3, '0')}`;
  }
}

interface CountdownMediaConverterArgs {
  duration: number;
}

interface CountdownMediaTimeModel extends MediaTimeModel {
  duration: number;
}

export class CountdownMediaTimeConverter {
  private _mediaTimeConverter = MediaTimeConverter.create();
  private _duration: number;

  private constructor(args: CountdownMediaConverterArgs) {
    this._duration = args.duration;
  }

  public static create(args: CountdownMediaConverterArgs) {
    return new CountdownMediaTimeConverter(args);
  }

  timeToCountdownMediaTimeModel(time: number): CountdownMediaTimeModel {
    const timeLeft = this._duration - time;

    if (timeLeft < 0) {
      throw new Error('Time must be lower than media duration');
    }

    return {
      ...this._mediaTimeConverter.timeToMediaTimeModel(timeLeft),
      duration: this._duration,
    };
  }

  countdownMediaTimeToSeconds(countdownMediaTime: string) {
    const timeLeft = this._mediaTimeConverter.mediaTimeToSeconds(countdownMediaTime);

    const time = this._duration - timeLeft;

    if (time < 0) {
      throw new Error(`Countdown media time can't be higher than media duration`);
    }

    return time;
  }
}
