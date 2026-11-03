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

import {SEEK_STEP_PLAYBACK_DEFAULTS} from '../constants';

export interface SeekStepConfig {
  /** Seconds of media time between seeks at 1x, multiplied by absolute playback rate, see {@link SEEK_STEP_PLAYBACK_DEFAULTS.seekStep}. */
  seekStep: number;

  /** Minimum milliseconds between seeks, see {@link SEEK_STEP_PLAYBACK_DEFAULTS.minSeekInterval}. */
  minSeekInterval: number;
}

/** {@link SeekStepConfig} with optional options, unset or undefined options resolve to defaults. */
export type SeekStepConfigOptions = {[K in keyof SeekStepConfig]?: SeekStepConfig[K] | undefined};

export class SeekStepPlaybackUtil {
  /** Whether media element can't play at playback rate - backwards, or faster than {@link SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate}. */
  static isSeekStepPlaybackRate(playbackRate: number): boolean {
    return playbackRate < 0 || playbackRate > SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate;
  }

  /** Playback rate media element can be set to, playback rate media element can't play at resolves to 1, media element is paused then. */
  static resolveMediaElementPlaybackRate(playbackRate: number): number {
    return playbackRate > 0 && playbackRate <= SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate ? playbackRate : 1;
  }

  /** Unset or undefined options resolve to defaults. */
  static resolveConfig(config?: SeekStepConfigOptions): SeekStepConfig {
    return {
      seekStep: config?.seekStep ?? SEEK_STEP_PLAYBACK_DEFAULTS.seekStep,
      minSeekInterval: config?.minSeekInterval ?? SEEK_STEP_PLAYBACK_DEFAULTS.minSeekInterval,
    };
  }
}

/** Media element state and time mapping {@link SeekStepper.resolveSeekTime} decides on. */
export interface SeekStepOptions {
  /** Playback rate media time moves at, seek step scales with it and seeks lead playhead in its direction. Defaults to 1. */
  playbackRate?: number | undefined;

  /** Whether media element is still seeking to previous seek time. */
  seeking?: boolean | undefined;

  /** Maps lead playhead time to media element time to seek to, ie. clamps it to media bounds. Defaults to identity. */
  mapTime?: ((time: number) => number) | undefined;

  /** Whether media element already has media data at media element time, seek is not needed then. */
  isBuffered?: ((time: number) => boolean) | undefined;

  /** Milliseconds timestamp, defaults to `performance.now()`. */
  now?: number | undefined;
}

/**
 * Decides when paused media element is seeked while playhead moves at playback rate media element can't play at.
 * Seeks are not for showing frames, they make media data where playback resumes start buffering, so that playback resumes quickly
 * once playhead moves at playback rate media element can play at again.
 *
 * - seek step scales with playback rate - seek is due once playhead moved {@link SeekStepConfig.seekStep} times absolute playback rate
 *   since last seek, so seeks are issued at steady pace regardless of playback rate, every {@link SeekStepConfig.seekStep} seconds.
 *   {@link SeekStepConfig.minSeekInterval} is minimum milliseconds between seeks, it applies only to seek step shorter than it.
 * - seeks lead playhead - media element is seeked one seek step ahead of playhead in its direction, so that media data is buffered where
 *   playhead will be when next seek is due. Media element buffers forward from seek time, also while playhead moves backwards.
 * - seek is skipped when media element already has media data at seek time, seek is issued once lead playhead reaches media not buffered
 * - seeks don't overlap - while media element is still seeking, no seek is issued, so that seek finishes and media data at its time
 *   at least starts buffering, instead of being dropped by next seek. Seek not finished in {@link SEEK_STEP_PLAYBACK_DEFAULTS.seekTimeout} is replaced.
 *
 * First seek after {@link reset} is due right away. Exact seeks, ie. to paused playhead, are recorded with {@link markSeek}.
 */
export class SeekStepper {
  protected readonly _config: SeekStepConfig;

  /** Playhead time of last seek */
  protected _playheadTime: number | undefined;
  /** Media element time of last seek */
  protected _seekTime: number | undefined;
  protected _seekedAt: number | undefined;

  constructor(config?: SeekStepConfigOptions) {
    this._config = SeekStepPlaybackUtil.resolveConfig(config);
  }

  get config(): SeekStepConfig {
    return this._config;
  }

  /** Playhead distance between seeks at playback rate. */
  resolveSeekStep(playbackRate: number): number {
    return this._config.seekStep * Math.abs(playbackRate);
  }

  /**
   * Media element time to seek to when seek is due, see {@link SeekStepper}, seek is recorded then. Undefined when no seek is needed.
   *
   * @param playheadTime Current playhead time
   */
  resolveSeekTime(playheadTime: number, options: SeekStepOptions = {}): number | undefined {
    let now = options.now ?? performance.now();
    let playbackRate = options.playbackRate ?? 1;
    if (options.seeking && this._seekedAt !== void 0 && now - this._seekedAt < SEEK_STEP_PLAYBACK_DEFAULTS.seekTimeout) {
      return void 0;
    }
    let seekStep = this.resolveSeekStep(playbackRate);
    let due = this._playheadTime === void 0 || this._seekedAt === void 0 || (Math.abs(playheadTime - this._playheadTime) >= seekStep && now - this._seekedAt >= this._config.minSeekInterval);
    if (!due) {
      return void 0;
    }
    let leadTime = playheadTime + Math.sign(playbackRate) * seekStep;
    let seekTime = options.mapTime ? options.mapTime(leadTime) : leadTime;
    if (seekTime === this._seekTime || options.isBuffered?.(seekTime)) {
      // checked again on next playhead time, seek is issued once lead playhead reaches media not buffered
      return void 0;
    }
    this._playheadTime = playheadTime;
    this._seekTime = seekTime;
    this._seekedAt = now;
    return seekTime;
  }

  /**
   * Records exact seek, ie. to paused playhead, next seek is due one seek step from it.
   *
   * @param playheadTime Playhead time of seek
   * @param seekTime Media element time of seek, defaults to playhead time
   */
  markSeek(playheadTime: number, seekTime: number = playheadTime, now: number = performance.now()) {
    this._playheadTime = playheadTime;
    this._seekTime = seekTime;
    this._seekedAt = now;
  }

  /** Next {@link resolveSeekTime} is due right away. */
  reset() {
    this._playheadTime = void 0;
    this._seekTime = void 0;
    this._seekedAt = void 0;
  }
}

/** Whether time is inside media element buffered ranges. */
export const isMediaElementBuffered = (mediaElement: HTMLMediaElement, time: number): boolean => {
  let buffered = mediaElement.buffered;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= time && time < buffered.end(i)) {
      return true;
    }
  }
  return false;
};
