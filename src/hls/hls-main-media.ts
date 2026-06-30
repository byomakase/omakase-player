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

import {BaseMainMedia, type BaseMainMediaArgs, type MainMediaState, MainMediaType} from '../media';
import {ObserverBreaker} from '../common/observer-breaker';

export interface HlsMainMediaState extends MainMediaState {}

export interface HlsMainMediaArgs extends BaseMainMediaArgs {}

export class HlsMainMedia extends BaseMainMedia<HlsMainMediaState> {
  protected _mainMediaType: MainMediaType = MainMediaType.HLS;

  protected readonly _destroyBreaker = new ObserverBreaker();

  constructor(args: HlsMainMediaArgs) {
    super(args);
  }

  protected getState(): HlsMainMediaState {
    return {
      id: this._id,
      mediaType: this._mediaType,
      mainMediaType: this._mainMediaType,
      loadOptions: this._loadOptions,
      tracks: this.tracks.map((p) => p.state),
      source: this.source.state,
      loadStage: this.loadStage.state,

      duration: this._duration,
      initialDuration: this._initialDuration,
      frameRateModel: this._frameRateModel,
      ffomTimecodeModel: this._ffomTimecodeModel,
      initSegmentTimeOffset: this._initSegmentTimeOffset,
      hasDrm: this._hasDrm,
      hasVideo: this._hasVideo,
      hasAudio: this._hasAudio
    };
  }
}
