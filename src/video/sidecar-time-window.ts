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

import type {MediaContainerTrackTimeWindow} from '../media';
import {isNullOrUndefined} from '../util/util-functions';

/**
 * Position of main media time relative to sidecar time window, in main media playback direction.
 */
export enum SidecarTimeWindowPosition {
  /** Main media time hasn't reached warm-up yet, or time window when there is no warm-up. */
  BEFORE = 'BEFORE',
  /**
   * Main media time is in warm-up, right before main media enters time window - before {@link MediaContainerTrackTimeWindow.playerStartTime},
   * or after time window end when main media plays backwards. Sidecar can play hidden and muted, ahead of its cut.
   */
  WARM_UP = 'WARM_UP',
  /** Main media time is inside the time window, sidecar cut is playing. */
  IN_WINDOW = 'IN_WINDOW',
  /** Main media time has left the time window, at or after its end, or before its start when main media plays backwards. */
  AFTER = 'AFTER',
}

/**
 * Maps main media time to sidecar time.
 *
 * ```
 * windowDuration = cutEndTime - cutStartTime
 * inWindow       = playerStartTime <= mainTime < playerStartTime + windowDuration
 * sidecarTime    = mainTime - playerStartTime + cutStartTime
 * ```
 *
 * Warm-up is a part of main media timeline right before main media enters time window, so it follows main media playback direction:
 * - forward - right before {@link playerStartTime}, mapped to sidecar media before {@link cutStartTime}.
 *   Limited by sidecar media available before {@link cutStartTime}, so cut starting at sidecar time 0 has no warm-up
 * - reverse - right after {@link playerEndTime}, mapped to sidecar media after {@link cutEndTime}.
 *   Limited by sidecar media available after {@link cutEndTime}, so cut ending at sidecar end, or with unknown sidecar duration, has no warm-up
 */
export class SidecarTimeWindow {
  readonly cutStartTime: number;
  readonly cutEndTime: number;
  readonly playerStartTime: number;
  /** Sidecar duration, undefined when not known. */
  readonly duration: number | undefined;

  protected constructor(cutStartTime: number, cutEndTime: number, playerStartTime: number, duration: number | undefined) {
    this.cutStartTime = cutStartTime;
    this.cutEndTime = cutEndTime;
    this.playerStartTime = playerStartTime;
    this.duration = duration;
  }

  /**
   * Resolves time window against sidecar duration. Undefined {@link MediaContainerTrackTimeWindow.cutEndTime} resolves to duration,
   * and {@link MediaContainerTrackTimeWindow.cutEndTime} beyond duration is clamped to duration.
   */
  static resolve(timeWindow: MediaContainerTrackTimeWindow, duration: number | undefined): SidecarTimeWindow {
    let hasDuration = !isNullOrUndefined(duration) && Number.isFinite(duration);
    let cutEndTime = isNullOrUndefined(timeWindow.cutEndTime) ? (hasDuration ? duration! : Number.POSITIVE_INFINITY) : timeWindow.cutEndTime!;
    if (hasDuration) {
      cutEndTime = Math.min(cutEndTime, duration!);
    }
    if (cutEndTime <= timeWindow.cutStartTime) {
      throw new Error(`Time window is out of sidecar duration, cutStartTime=${timeWindow.cutStartTime}, cutEndTime=${timeWindow.cutEndTime}, duration=${duration}`);
    }
    return new SidecarTimeWindow(timeWindow.cutStartTime, cutEndTime, isNullOrUndefined(timeWindow.playerStartTime) ? 0 : timeWindow.playerStartTime!, hasDuration ? duration! : void 0);
  }

  /**
   * Forward warm-up duration, requested warm-up duration limited by sidecar media available before {@link cutStartTime}.
   * Usable before sidecar duration is known, see {@link resolveWarmUp} for both directions.
   */
  static resolveWarmUpDuration(timeWindow: Pick<MediaContainerTrackTimeWindow, 'cutStartTime'>, warmUpDuration: number): number {
    return Math.max(0, Math.min(warmUpDuration, timeWindow.cutStartTime));
  }

  get windowDuration(): number {
    return this.cutEndTime - this.cutStartTime;
  }

  /** Main media time when sidecar playback ends. */
  get playerEndTime(): number {
    return this.playerStartTime + this.windowDuration;
  }

  /**
   * Warm-up duration in main media playback direction, requested warm-up duration limited by sidecar media available
   * before {@link cutStartTime}, or after {@link cutEndTime} when main media plays backwards.
   *
   * @param reverse - whether main media plays backwards
   */
  resolveWarmUp(warmUpDuration: number, reverse: boolean = false): number {
    if (!reverse) {
      return SidecarTimeWindow.resolveWarmUpDuration(this, warmUpDuration);
    }
    let available = isNullOrUndefined(this.duration) ? 0 : this.duration! - this.cutEndTime;
    return Math.max(0, Math.min(warmUpDuration, available));
  }

  /**
   * Main media time when warm-up starts, before {@link playerStartTime}, or after {@link playerEndTime} when main media plays backwards.
   *
   * @param reverse - whether main media plays backwards
   */
  warmUpIn(warmUpDuration: number, reverse: boolean = false): number {
    let warmUp = this.resolveWarmUp(warmUpDuration, reverse);
    return reverse ? this.playerEndTime + warmUp : this.playerStartTime - warmUp;
  }

  /**
   * @param warmUpDuration - requested warm-up duration, warm-up is not resolved if omitted
   * @param reverse - whether main media plays backwards
   */
  resolvePosition(mainTime: number, warmUpDuration: number = 0, reverse: boolean = false): SidecarTimeWindowPosition {
    if (reverse) {
      if (mainTime < this.playerStartTime) {
        return SidecarTimeWindowPosition.AFTER;
      } else if (mainTime < this.playerEndTime) {
        return SidecarTimeWindowPosition.IN_WINDOW;
      } else if (mainTime < this.warmUpIn(warmUpDuration, true)) {
        return SidecarTimeWindowPosition.WARM_UP;
      } else {
        return SidecarTimeWindowPosition.BEFORE;
      }
    }
    if (mainTime < this.warmUpIn(warmUpDuration)) {
      return SidecarTimeWindowPosition.BEFORE;
    } else if (mainTime < this.playerStartTime) {
      return SidecarTimeWindowPosition.WARM_UP;
    } else if (mainTime < this.playerEndTime) {
      return SidecarTimeWindowPosition.IN_WINDOW;
    } else {
      return SidecarTimeWindowPosition.AFTER;
    }
  }

  isInWindow(mainTime: number): boolean {
    return this.resolvePosition(mainTime) === SidecarTimeWindowPosition.IN_WINDOW;
  }

  /**
   * Maps main media time to sidecar time, clamped to [{@link cutStartTime}, {@link cutEndTime}].
   * With warm-up, bound main media enters time window at is extended to sidecar time warm-up starts at,
   * lower bound, or upper bound when main media plays backwards.
   *
   * @param warmUpDuration - requested warm-up duration, warm-up is not resolved if omitted
   * @param reverse - whether main media plays backwards
   */
  toSidecarTime(mainTime: number, warmUpDuration: number = 0, reverse: boolean = false): number {
    let warmUp = this.resolveWarmUp(warmUpDuration, reverse);
    let lowerBound = reverse ? this.cutStartTime : this.cutStartTime - warmUp;
    let upperBound = reverse ? this.cutEndTime + warmUp : this.cutEndTime;
    return Math.min(Math.max(mainTime - this.playerStartTime + this.cutStartTime, lowerBound), upperBound);
  }

  /**
   * Maps sidecar time to main media time.
   */
  toMainTime(sidecarTime: number): number {
    return sidecarTime - this.cutStartTime + this.playerStartTime;
  }
}
