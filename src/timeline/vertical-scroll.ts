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

import {EMPTY, Observable, Subject} from 'rxjs';
import type {TimelineSlot} from './timeline-slot';
import {animate} from './animation-util';
import {nextCompleteObserver, passiveObservable} from '../util/rxjs-util';

export interface VerticalScrollOptions {
  /** Use an easing animation. */
  easing?: boolean;
  /** Easing duration in milliseconds. Defaults to 300. */
  duration?: number;
}

export interface VerticalScrollEvent {
  /** Current scroll position in percent (0–100). */
  readonly scrollPercent: number;
  /** Change since the previous event, in percent. */
  readonly deltaPercent: number;
}

export interface VerticalScrollApi {
  /** Current scroll position in percent (0–100). */
  readonly scrollPercent: number;

  /** Emits on every scroll change. */
  readonly onScroll$: Observable<VerticalScrollEvent>;

  /**
   * Scroll to an absolute position (0–100%). The scroll (and any easing) starts immediately,
   * regardless of whether the returned observable is subscribed to. Subscribe to be notified,
   * asynchronously, once the scroll (including easing) has settled, with the final scroll percent.
   */
  scrollTo(scrollPercent: number, options?: VerticalScrollOptions): Observable<number>;

  /**
   * Scroll by a relative delta (in %). Same passive-observable semantics as {@link scrollTo}.
   */
  scrollBy(deltaPercent: number, options?: VerticalScrollOptions): Observable<number>;
}

export class VerticalScrollAdapter implements VerticalScrollApi {
  private readonly _slot: TimelineSlot;
  private readonly _onScroll$ = new Subject<VerticalScrollEvent>();
  private _scrollPercent: number = 0;

  constructor(slot: TimelineSlot) {
    this._slot = slot;
  }

  get scrollPercent(): number {
    return this._scrollPercent;
  }

  get onScroll$(): Observable<VerticalScrollEvent> {
    return this._onScroll$.asObservable();
  }

  scrollTo(scrollPercent: number, options?: VerticalScrollOptions): Observable<number> {
    return passiveObservable((observer) => {
      const clamped = Math.max(0, Math.min(100, scrollPercent));
      const range = this._slot.getScrollRange();
      const targetPx = (clamped / 100) * range;

      if (options?.easing) {
        const startPx = (this._scrollPercent / 100) * range;
        animate({
          duration: options.duration ?? 300,
          startValue: startPx,
          endValue: targetPx,
          onUpdateHandler: (_frame, value) => {
            this._applyPx(value);
          },
          onCompleteHandler: (_frame, _value) => {
            this._applyPx(targetPx);
            nextCompleteObserver(observer, this._scrollPercent);
          },
        });
      } else {
        this._applyPx(targetPx);
        nextCompleteObserver(observer, this._scrollPercent);
      }
    });
  }

  scrollBy(deltaPercent: number, options?: VerticalScrollOptions): Observable<number> {
    return this.scrollTo(this._scrollPercent + deltaPercent, options);
  }

  /**
   * Recomputes the reported scroll percentage from the current (unchanged) scroll position
   * against a possibly-new scroll range — e.g. after content height changes (a lane added or
   * removed). Never moves the actual scroll position; only keeps the reported percentage honest,
   * since the same pixel offset represents a different percentage once the range has changed.
   */
  refreshOffset(): void {
    const range = this._slot.getScrollRange();
    const px = this._slot.getScrollY();
    const newPct = range > 0 ? (px / range) * 100 : 0;
    if (newPct !== this._scrollPercent) {
      const prev = this._scrollPercent;
      this._scrollPercent = newPct;
      this._onScroll$.next({scrollPercent: newPct, deltaPercent: newPct - prev});
    }
  }

  private _applyPx(px: number): void {
    const range = this._slot.getScrollRange();
    const clampedPx = Math.max(0, Math.min(px, range));
    const newPct = range > 0 ? (clampedPx / range) * 100 : 0;
    const prev = this._scrollPercent;
    this._slot.setVerticalScroll(clampedPx);
    this._scrollPercent = newPct;
    if (newPct !== prev) {
      this._onScroll$.next({scrollPercent: newPct, deltaPercent: newPct - prev});
    }
  }

  destroy(): void {
    this._onScroll$.complete();
  }
}

/**
 * No-op implementation for HEADER and FOOTER slots which do not scroll vertically.
 */
export class NoopVerticalScrollAdapter implements VerticalScrollApi {
  readonly scrollPercent = 0;
  readonly onScroll$: Observable<VerticalScrollEvent> = EMPTY;
  scrollTo(_scrollPercent: number, _options?: VerticalScrollOptions): Observable<number> {
    return passiveObservable((observer) => nextCompleteObserver(observer, 0));
  }
  scrollBy(_deltaPercent: number, _options?: VerticalScrollOptions): Observable<number> {
    return passiveObservable((observer) => nextCompleteObserver(observer, 0));
  }
}
