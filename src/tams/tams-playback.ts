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

import type {TamsMainMediaLoadOptions} from '../media';
import {OmpError} from '../types';
import {TimeRangeUtil} from './time-range-util';

/**
 * How a TAMS flow is bridged to HLS, resolved from {@link TamsMainMediaLoadOptions}.
 */
export enum TamsPlaybackMode {
  /** Closed range — media playlist with `EXT-X-ENDLIST`. */
  VOD = 'VOD',
  /** Start-over live — fixed start growing towards the flow head (`EXT-X-PLAYLIST-TYPE:EVENT`, no endlist). */
  EVENT = 'EVENT',
  /** Sliding-window live — fixed length window following the flow head (no playlist type, no endlist). */
  CONTINUOUS = 'CONTINUOUS',
}

export interface TamsPlayback {
  mode: TamsPlaybackMode;
  requestTimerange: string | undefined;
  /** Sliding window length in seconds. Set for {@link TamsPlaybackMode.CONTINUOUS} only. */
  windowDuration: number | undefined;
}

export function resolveTamsPlayback(loadOptions?: TamsMainMediaLoadOptions | undefined): TamsPlayback {
  const timerange = loadOptions?.timerange?.trim();

  if (timerange) {
    const parsed = TimeRangeUtil.parseTimeRange(timerange);

    if (TimeRangeUtil.isNever(parsed) || TimeRangeUtil.isInstantaneous(parsed)) {
      throw new OmpError(`Timerange has no duration: ${timerange}`);
    }

    return {
      mode: TimeRangeUtil.isEndUnbounded(parsed) ? TamsPlaybackMode.EVENT : TamsPlaybackMode.VOD,
      requestTimerange: timerange,
      windowDuration: undefined,
    };
  }

  if (loadOptions?.duration !== undefined && loadOptions.duration > 0) {
    return {
      mode: TamsPlaybackMode.CONTINUOUS,
      requestTimerange: undefined,
      windowDuration: loadOptions.duration,
    };
  }

  return {
    mode: TamsPlaybackMode.VOD,
    requestTimerange: undefined,
    windowDuration: undefined,
  };
}

export function isTamsLivePlayback(playback: TamsPlayback): boolean {
  return playback.mode !== TamsPlaybackMode.VOD;
}
