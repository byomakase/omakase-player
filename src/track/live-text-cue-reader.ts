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

import type {Subscription} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import type {LiveTextCueFetcher, SegmentedVttReadResult} from './timed-items-fetcher';

/** Floor on how often a rendition's playlist is re-read, and the cadence to use when none is known. */
const READ_INTERVAL_MIN_MS = 1000;
const READ_INTERVAL_FALLBACK_MS = 6000;

export interface LiveTextCueReaderArgs {
  fetcher: LiveTextCueFetcher;
}

/**
 * Keeps one text track populated with its rendition's cues, for media whose text is rendered by the
 * playback engine.
 */
export class LiveTextCueReader implements Destroyable {
  private readonly _fetcher: LiveTextCueFetcher;

  private _timeoutId: ReturnType<typeof setTimeout> | undefined;
  private _subscription: Subscription | undefined;
  private _started = false;
  private _destroyed = false;

  constructor(args: LiveTextCueReaderArgs) {
    this._fetcher = args.fetcher;
  }

  start(): void {
    if (this._started || this._destroyed) {
      return;
    }
    this._started = true;

    this._fetcher.adoptExistingCues();

    this.read();
  }

  private read(): void {
    this._timeoutId = void 0;

    this._subscription = this._fetcher.read().subscribe({
      next: (result) => {
        if (!result.ended) {
          this.scheduleRead(result);
        }
      },
      error: (err) => {
        this.scheduleRead(void 0);
      },
    });
  }

  /**
   * Re-reads on the rendition's own cadence
   */
  private scheduleRead(result: SegmentedVttReadResult | undefined): void {
    if (this._destroyed) {
      return;
    }

    const interval = result?.targetDuration ? result.targetDuration * 1000 : READ_INTERVAL_FALLBACK_MS;
    const cadence = result && !result.updated ? interval / 2 : interval;

    this._timeoutId = setTimeout(() => this.read(), Math.max(READ_INTERVAL_MIN_MS, cadence));
  }

  destroy(): void {
    this._destroyed = true;

    if (this._timeoutId !== void 0) {
      clearTimeout(this._timeoutId);
      this._timeoutId = void 0;
    }
    this._subscription?.unsubscribe();
    this._subscription = void 0;
  }
}
