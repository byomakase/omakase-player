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

import {type Source} from '../source';
import {BaseMainMedia, type BaseMainMediaArgs, type MainMediaState, MainMediaType} from '../media';
import {ObserverBreaker} from '../common/observer-breaker';

export interface Mp4MainMediaState extends MainMediaState {}

export interface Mp4MainMediaArgs extends BaseMainMediaArgs {

}

export class Mp4MainMedia extends BaseMainMedia<Mp4MainMediaState> {
  protected getState(): Mp4MainMediaState {
    return this._state();
  }
  protected _mainMediaType: MainMediaType = MainMediaType.MP4;

  protected _source: Source;

  protected readonly _destroyBreaker = new ObserverBreaker();

  constructor(args: Mp4MainMediaArgs) {
    super(args);
    this._source = args.source;
  }

  protected _state(): Mp4MainMediaState {
    return {
      id: this._id,
      mediaType: this._mediaType,
      mainMediaType: this._mainMediaType,
      loadOptions: this._loadOptions,
      tracks: this.tracks.map((p) => p.state),
      source: this._source.state,
      loadStage: this.loadStage.state,

      isDrm: this._isDrm,
      duration: this._duration,
      initialDuration: this._initialDuration,
      frameRateModel: this._frameRateModel,
      ffomTimecodeModel: this._ffomTimecodeModel,
      initSegmentTimeOffset: this._initSegmentTimeOffset,
    };
  }
}
