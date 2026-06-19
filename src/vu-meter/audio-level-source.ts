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

import {Subject, type Observable} from 'rxjs';
import type {Destroyable, Serializable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';

export enum AudioLevelSourceType {
  PEAK_PROCESSOR = 'PEAK_PROCESSOR',
  OBSERVATION_TRACK = 'OBSERVATION_TRACK',
}

export enum AudioLevelEventType {
  AUDIO_LEVEL_CHANGE = 'AUDIO_LEVEL_CHANGE',
  CHANNEL_COUNT_CHANGE = 'CHANNEL_COUNT_CHANGE',
}

export interface AudioLevelEventData extends Serializable {
  dbValues: number[];
}

export interface ChannelCountEventData extends Serializable {
  channelCount: number;
}

export type AudioLevelEventTypeDataMap = {
  [AudioLevelEventType.AUDIO_LEVEL_CHANGE]: AudioLevelEventData;
  [AudioLevelEventType.CHANNEL_COUNT_CHANGE]: ChannelCountEventData;
};

export type AudioLevelEvent = {
  [K in AudioLevelEventType]: {
    type: K;
    data: AudioLevelEventTypeDataMap[K];
  };
}[keyof AudioLevelEventTypeDataMap];

export interface AudioLevelSourceApi extends Destroyable {
  onEvent$: Observable<AudioLevelEvent>;
}

export abstract class AudioLevelSource implements AudioLevelSourceApi {
  protected _onEvent$ = new Subject<AudioLevelEvent>();
  protected _destroyBreaker = new ObserverBreaker();

  get onEvent$() {
    return this._onEvent$.asObservable();
  }

  protected getBaseLog(x: number, y: number): number {
    return Math.log(y) / Math.log(x);
  }

  protected dbFromFloat(floatVal: number): number {
    return this.getBaseLog(10, floatVal) * 20;
  }

  destroy() {
    this._destroyBreaker.destroy();
    this._onEvent$.complete();
  }
}
