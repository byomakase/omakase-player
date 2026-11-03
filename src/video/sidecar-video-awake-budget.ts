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

/**
 * Sidecar video competing for awake slot, see {@link SidecarVideoAwakeBudget}.
 */
export interface SidecarVideoAwakeCandidate {
  /** Awake priority at current main media time, lower is more important. Active sidecar inside its time window has `-Infinity`. */
  awakePriority(): number;

  /** Called when candidate lost its awake slot to more important one, candidate releases its source and waits for a free slot. */
  yieldAwake(): void;

  /** Called when slot became free, waiting candidate may try to acquire it again. */
  retryAwake(): void;
}

/**
 * Limits number of sidecar videos awake at once, see {@link SidecarVideoResidency}.
 *
 * When all slots are taken, candidate more important than least important holder by more than {@link preemptMargin} takes its slot,
 * otherwise it waits and is notified once a slot is free.
 */
export class SidecarVideoAwakeBudget {
  protected readonly _maxAwake: number;
  protected readonly _preemptMargin: number;

  protected _holders = new Set<SidecarVideoAwakeCandidate>();
  protected _waiting = new Set<SidecarVideoAwakeCandidate>();
  protected _retryScheduled = false;

  /**
   * @param maxAwake Maximum number of sidecar videos awake at once, `Infinity` for no limit
   * @param preemptMargin Seconds of priority candidate has to be ahead of holder to take its slot, so slots don't flip between two candidates
   */
  constructor(maxAwake: number, preemptMargin: number) {
    this._maxAwake = Math.max(1, maxAwake);
    this._preemptMargin = preemptMargin;
  }

  get maxAwake(): number {
    return this._maxAwake;
  }

  get awakeCount(): number {
    return this._holders.size;
  }

  /** Acquires awake slot, returns `false` when candidate has to wait. */
  tryAcquire(candidate: SidecarVideoAwakeCandidate): boolean {
    if (this._holders.has(candidate)) {
      return true;
    }
    if (this._holders.size < this._maxAwake) {
      this.grant(candidate);
      return true;
    }

    let priority = candidate.awakePriority();
    let leastImportant: SidecarVideoAwakeCandidate | undefined;
    let leastImportantPriority = Number.NEGATIVE_INFINITY;
    this._holders.forEach((holder) => {
      let holderPriority = holder.awakePriority();
      if (!leastImportant || holderPriority > leastImportantPriority) {
        leastImportant = holder;
        leastImportantPriority = holderPriority;
      }
    });

    // active sidecar inside its time window is never preempted
    if (leastImportant && leastImportantPriority !== Number.NEGATIVE_INFINITY && priority < leastImportantPriority - this._preemptMargin) {
      this._holders.delete(leastImportant);
      this._waiting.add(leastImportant);
      this.grant(candidate);
      leastImportant.yieldAwake();
      return true;
    }

    this._waiting.add(candidate);
    return false;
  }

  /** Releases awake slot, waiting candidates are notified. */
  release(candidate: SidecarVideoAwakeCandidate) {
    if (this._holders.delete(candidate)) {
      this.scheduleRetry();
    }
  }

  /** Removes candidate from holders and waiting candidates, once it doesn't need to be awake. */
  withdraw(candidate: SidecarVideoAwakeCandidate) {
    this._waiting.delete(candidate);
    this.release(candidate);
  }

  protected grant(candidate: SidecarVideoAwakeCandidate) {
    this._waiting.delete(candidate);
    this._holders.add(candidate);
  }

  /** Waiting candidates are notified asynchronously, so slot is not taken while releasing candidate is still updating. */
  protected scheduleRetry() {
    if (this._retryScheduled || this._waiting.size === 0) {
      return;
    }
    this._retryScheduled = true;
    queueMicrotask(() => {
      this._retryScheduled = false;
      [...this._waiting]
        .sort((a, b) => a.awakePriority() - b.awakePriority())
        .forEach((candidate) => {
          if (this._waiting.has(candidate) && this._holders.size < this._maxAwake) {
            candidate.retryAwake();
          }
        });
    });
  }
}
