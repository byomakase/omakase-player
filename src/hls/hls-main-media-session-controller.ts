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

import {filter, type Observable, of, take, takeUntil} from 'rxjs';
import {MainMediaEventType, type MainMedia, type MainMediaSessionController} from '../media';
import type {TrackRepository} from '../repository';
import type {TextTrackCueReaders} from '../track';
import {HlsTextTrackCueReaders} from './hls-text-track-cue-readers';
import {ObserverBreaker} from '../common/observer-breaker';

/**
 * Controls HLS media lifecycle.
 */
export class HlsMainMediaSessionController implements MainMediaSessionController {
  protected _textTrackCueReaders: TextTrackCueReaders | undefined;
  protected _destroyBreaker$ = new ObserverBreaker();

  constructor(
    protected mainMedia: MainMedia,
    protected trackRepository: TrackRepository
  ) {}

  // does not affect playback, only vtt readers
  prepare(): Observable<void> {
    this.mainMedia.onEvent$
      .pipe(
        filter((event) => event.type === MainMediaEventType.MAIN_MEDIA_LOADED),
        take(1),
        takeUntil(this._destroyBreaker$.observer)
      )
      .subscribe(() => {
        // once media is loaded, initiate readers
        this._textTrackCueReaders = new HlsTextTrackCueReaders({
          mainMedia: this.mainMedia,
          trackRepository: this.trackRepository,
        });
        this._textTrackCueReaders?.start();
      });
    return of(void 0);
  }

  destroy(): void {
    this._textTrackCueReaders?.destroy();
    this._destroyBreaker$.break();
  }
}
