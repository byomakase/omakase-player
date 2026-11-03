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

import {Observable, type Subscription} from 'rxjs';

/**
 * Runs sidecar video loads with limited concurrency, loads above the limit wait until a running one completes, errors or is unsubscribed.
 */
export class SidecarVideoLoadQueue {
  protected readonly _concurrency: number;
  protected _running = 0;
  protected _pending: (() => void)[] = [];

  /**
   * @param concurrency Maximum number of loads running at once, `Infinity` for no limit
   */
  constructor(concurrency: number) {
    this._concurrency = Math.max(1, concurrency);
  }

  get running(): number {
    return this._running;
  }

  get pending(): number {
    return this._pending.length;
  }

  /** Subscribes to load once there is a free slot. */
  run<T>(load: () => Observable<T>): Observable<T> {
    return new Observable<T>((observer) => {
      let subscription: Subscription | undefined;
      let started = false;
      let finished = false;

      let finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        this._running--;
        this.startPending();
      };

      let start = () => {
        started = true;
        this._running++;
        subscription = load().subscribe({
          next: (value) => observer.next(value),
          error: (error) => {
            finish();
            observer.error(error);
          },
          complete: () => {
            finish();
            observer.complete();
          },
        });
      };

      if (this._running < this._concurrency) {
        start();
      } else {
        this._pending.push(start);
      }

      return () => {
        if (started) {
          subscription?.unsubscribe();
          finish();
        } else {
          this._pending = this._pending.filter((p) => p !== start);
        }
      };
    });
  }

  protected startPending() {
    while (this._running < this._concurrency && this._pending.length > 0) {
      this._pending.shift()!();
    }
  }
}
