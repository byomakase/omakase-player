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

import type {FrameImageConfig} from './frame-image-window';

export interface FrameImageRenderClock {
  anchorTime: number;
  anchorEpoch: number;
  running: boolean;
  playbackRate: number;
  /** Upper bound of clock time. */
  duration: number;
  /** When set, running time steps by frames, see {@link FrameImageWindowUtil.resolveRunningTime}. Otherwise time runs linearly and frame image duration is used for fetch and decode windows. */
  frameDuration: number | undefined;
  tickDuration?: number | undefined;
  /** Lower bound of clock time, defaults to 0. */
  minTime?: number | undefined;
  /** Echoed in {@link FrameImageRenderResponse} status, so that status of previous clock is not mistaken for status of current one. */
  version?: number | undefined;
}

export interface FrameImageRenderSource {
  start: number;
  end: number;
  url: string;
  requestInit?: {headers?: Record<string, string>; credentials?: RequestCredentials} | undefined;
}

export type FrameImageRenderRequest =
  | {type: 'init'; canvas: OffscreenCanvas}
  | {type: 'config'; config: FrameImageConfig}
  | {type: 'frameImages'; frameImages: FrameImageRenderSource[]}
  | {type: 'clock'; clock: FrameImageRenderClock}
  | {type: 'resize'; width: number; height: number}
  | {type: 'clear'}
  | {type: 'whenReady'; id: number; times: number[]};

export type FrameImageRenderResponse = {type: 'started'} | {type: 'ready'; id: number} | {type: 'status'; version: number | undefined; ready: boolean; buffering: boolean};
