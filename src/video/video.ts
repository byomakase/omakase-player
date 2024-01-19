/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import Decimal from 'decimal.js';

export class Video {
  private readonly _sourceUrl: string;
  private readonly _frameRate: number;
  private readonly _duration: number;
  private readonly _totalFrames: number;

  /***
   * Frame duration in seconds
   * @private
   */
  private readonly _frameDuration: number

  /**
   * Corrected duration field may be updated once when:
   *  * video element changes video duration
   *  * video ends on bare start of the last frame, which might not exist in that moment
   *  * last hls segment ends of different time than it was initially calculated
   *
   * @private correctedDuration
   */
  private _correctedDuration: number;

  constructor(sourceUrl: string, frameRate: number, duration: number) {
    this._sourceUrl = sourceUrl;
    this._frameRate = frameRate;
    this._duration = duration;
    this._totalFrames = new Decimal(this._duration).mul(this._frameRate).ceil().toNumber();
    this._frameDuration = new Decimal(1).div(this._frameRate).toNumber();
  }

  get sourceUrl(): string {
    return this._sourceUrl;
  }

  get frameRate(): number {
    return this._frameRate;
  }

  get duration(): number {
    return this._duration;
  }

  get totalFrames() {
    return this._totalFrames;
  }

  get frameDuration(): number {
    return this._frameDuration;
  }

  get correctedDuration() {
    return this._correctedDuration;
  }

  setCorrectedDuration(value: number) {
    console.debug(`%cVideo duration correction: initialDuration:${this.duration} > updatedDuration:${value} `, 'color: magenta');
    this._correctedDuration = value;
  }
}
