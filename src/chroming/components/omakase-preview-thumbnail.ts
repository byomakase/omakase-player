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

import {Observable, takeUntil} from 'rxjs';
import {OmakaseTimeRange} from './omakase-time-range';
import type {ThumbnailState, ThumbnailTrackState} from '../../media/thumbnail-track';
import {ObserverBreaker} from '../../common/observer-breaker';
import {ControlBarComponent} from '../../control-bar/control-bar-component';

export class OmakasePreviewThumbnail extends ControlBarComponent(HTMLElement) {
  private _timeRange?: OmakaseTimeRange;
  private _thumbnailTrack?: ThumbnailTrackState | undefined;
  private _thumbnailFn?: (trackId: string, time: number) => Observable<ThumbnailState | undefined>;
  protected _destroyBreaker = new ObserverBreaker();
  protected _timeRangeBreaker = new ObserverBreaker();

  constructor() {
    super();
  }

  set thumbnailTrack(thumbnailTrack: ThumbnailTrackState | undefined) {
    this._thumbnailTrack = thumbnailTrack;
    this.querySelector('img')!.src = '';
  }

  set thumbnailFn(thumbnailFn: (trackId: string, time: number) => Observable<ThumbnailState | undefined>) {
    this._thumbnailFn = thumbnailFn;
  }

  set timeRange(timeRange: OmakaseTimeRange) {
    this._timeRange = timeRange;
    this._timeRangeBreaker.break();
    this._timeRange.onMouseOver$.pipe(takeUntil(this._timeRangeBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe((time) => {
      if (this._thumbnailTrack && this._thumbnailFn) {
        this._thumbnailFn(this._thumbnailTrack.id, time)
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe((thumbnail) => {
            if (thumbnail) {
              this.querySelector('img')!.src = thumbnail.url;
            }
          });
      }
    });
  }

  connectedCallback() {
    this.innerHTML = `<img src=""/>`;
    if (this._timeRange) {
      this.timeRange = this._timeRange;
    }
  }

  disconnectedCallback() {
    this._destroyBreaker.break();
  }
}
