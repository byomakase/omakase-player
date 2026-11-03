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

import type {FrameImage} from './frame-image-player-controller';

export interface FrameImageConfig {
  fetchBehindDuration: number;
  fetchAheadDuration: number;
  fetchAheadMinCount: number;
  decodeBehindCount: number;
  decodeAheadCount: number;
  /** Renderer starts buffering once less of frame images ahead in playback direction are decoded, single missing frame images are dropped above it */
  bufferStopRatio: number;
  /** Renderer stops buffering once frame images ahead in playback direction are decoded again at least at ratio */
  bufferResumeRatio: number;
}

export const FRAME_IMAGE_CONFIG_DEFAULT: FrameImageConfig = {
  fetchBehindDuration: 1,
  fetchAheadDuration: 2,
  fetchAheadMinCount: 10,
  decodeBehindCount: 1,
  decodeAheadCount: 10,
  bufferStopRatio: 0.4,
  bufferResumeRatio: 0.8,
};

export interface FrameImageStride {
  base: number;
  stride: number;
  wallStride: number;
}

/**
 * Resolves shown time and fetch, decode and seek ready windows around frame image. Shared by render worker, main thread controller (seek ready windows) and frame image sidecar.
 */
export class FrameImageWindowUtil {
  static resolveRunningTime(anchorTime: number, elapsed: number, playbackRate: number, frameDuration: number, frameImageDuration: number, duration: number): number {
    let time = Math.min(Math.max(anchorTime + elapsed * playbackRate, 0), duration);
    let ticks = Math.floor(elapsed / frameDuration);
    if (Math.abs(playbackRate) <= 1) {
      let steppedTime = anchorTime + ticks * frameDuration * playbackRate;
      return playbackRate < 0 ? Math.max(steppedTime, time) : Math.min(steppedTime, time);
    }
    return Math.min(Math.max(this.resolveTickTime(time, frameDuration, playbackRate, frameImageDuration), 0), duration);
  }

  static resolveTickTime(time: number, tickDuration: number, playbackRate: number, frameImageDuration: number): number {
    let step = tickDuration * Math.abs(playbackRate);
    return Math.floor(time / step) * step + Math.min(tickDuration, frameImageDuration) / 2;
  }

  static resolveTickStride(frameImage: FrameImage, time: number, tickDuration: number, playbackRate: number): FrameImageStride {
    let frameImageDuration = frameImage.end - frameImage.start;
    let windowStep = Math.max(tickDuration * Math.abs(playbackRate), frameImageDuration);
    return {
      base: this.resolveTickTime(time, tickDuration, playbackRate, frameImageDuration),
      stride: windowStep * (playbackRate < 0 ? -1 : 1),
      wallStride: windowStep / Math.abs(playbackRate),
    };
  }

  static resolveStride(frameImage: FrameImage, time: number, frameDuration: number, playbackRate: number, running: boolean): FrameImageStride {
    let frameImageDuration = frameImage.end - frameImage.start;
    if (running && Math.abs(playbackRate) > 1) {
      return this.resolveTickStride(frameImage, time, frameDuration, playbackRate);
    }
    let wallStride = Math.max(frameImageDuration, frameDuration);
    return {
      base: frameImage.start + frameImageDuration / 2,
      stride: wallStride * (playbackRate < 0 ? -1 : 1),
      wallStride: wallStride,
    };
  }

  /**
   * Stride for time running linearly, not stepped as {@link resolveRunningTime}, as frame image sidecar time follows main media time.
   * Frame image duration is used as frame duration.
   *
   * Above 1x stride skips frame images. Its base is snapped to stride grid from time 0, so that fetch and decode windows stay the same
   * while time is inside one stride step, and move by one stride step after it. Otherwise windows would alternate between skipped and
   * not skipped frame images on every frame image, aborting and fetching whole window again.
   * Frame image at {@link FrameImageStride.base} is the one rendered, skipped frame images are never fetched.
   */
  static resolveLinearStride(frameImage: FrameImage, time: number, playbackRate: number, running: boolean, tickDuration?: number): FrameImageStride {
    let frameImageDuration = frameImage.end - frameImage.start;
    if (running && Math.abs(playbackRate) > 1) {
      return this.resolveTickStride(frameImage, time, tickDuration ?? frameImageDuration, playbackRate);
    }
    return this.resolveStride(frameImage, time, frameImageDuration, playbackRate, running);
  }

  static resolveFetchTimes({base, stride, wallStride}: FrameImageStride, config: FrameImageConfig): number[] {
    let fetchBehind = Math.max(config.decodeBehindCount, Math.ceil(config.fetchBehindDuration / wallStride));
    let fetchAhead = Math.max(config.fetchAheadMinCount, config.decodeAheadCount, Math.ceil(config.fetchAheadDuration / wallStride));
    return this.resolveStrideTimes(base, stride, fetchBehind, fetchAhead);
  }

  static resolveDecodeTimes({base, stride}: FrameImageStride, config: FrameImageConfig): number[] {
    return this.resolveStrideTimes(base, stride, config.decodeBehindCount, config.decodeAheadCount);
  }

  static resolveBufferTimes({base, stride}: FrameImageStride, config: FrameImageConfig): number[] {
    return this.resolveStrideTimes(base, stride, 0, config.decodeAheadCount);
  }

  static resolveSeekReadyTimes({base, stride}: FrameImageStride, running: boolean, config: FrameImageConfig): number[] {
    return this.resolveStrideTimes(base, stride, 0, running ? config.decodeAheadCount : 0);
  }

  static resolveStrideTimes(time: number, stride: number, behind: number, ahead: number): number[] {
    let times: number[] = [];
    for (let i = 0; i <= ahead; i++) {
      times.push(time + i * stride);
    }
    for (let i = 1; i <= behind; i++) {
      times.push(time - i * stride);
    }
    return times;
  }
}
