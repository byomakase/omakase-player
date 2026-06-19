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

import {UrlSource, type UrlSourceState} from '../source';
import {BaseDomElement, type DomElementApi, DomElementEventType, type DomElementState, HTMLElementEvent} from './dom-element';
import {forkJoin, fromEvent, Observable, take, takeUntil, timeout} from 'rxjs';
import {OpStage} from '../common/op-stage';
import {ObserverBreaker} from '../common/observer-breaker';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {StringUtil} from '../util/string-util';

export const HTMLMediaElementEvent = {
  ...HTMLElementEvent,

  DURATIONCHANGE: 'durationchange',
  ENDED: 'ended',
  LOADEDDATA: 'loadeddata',
  LOADEDMETEDATA: 'loadedmetadata',
  PAUSE: 'pause',
  PLAYING: 'playing',
  PROGRESS: 'progress',
  RATECHANGE: 'ratechange',
  SEEKED: 'seeked',
  SEEKING: 'seeking',
  TIMEUPDATE: 'timeupdate',
  VOLUMECHANGE: 'volumechange',
  WAITING: 'waiting',
};

export const HTMLVideoElementEvent = {
  ...HTMLMediaElementEvent,
  ENTERPIP: 'enterpictureinpicture',
  LEAVEPIP: 'leavepictureinpicture',
};

export interface BufferedTimeRange {
  start: number;
  end: number;
}

export interface DomMediaElementState extends DomElementState {
  /**
   * Media source
   */
  source: UrlSourceState | undefined;
}

export interface DomMediaElementApi extends DomElementApi<DomMediaElementState> {
  bufferedTimeRanges: BufferedTimeRange[];

  loadSource(source: UrlSource): Observable<void>;
}

export class HtmlMediaElementUtil {
  public static resolveBufferedTimeRanges(element: HTMLMediaElement): BufferedTimeRange[] {
    if (!element) {
      return [];
    }
    let result: BufferedTimeRange[] = [];
    let timeRanges: TimeRanges = element.buffered;
    for (let i = 0; i < timeRanges.length; i++) {
      result.push({
        start: timeRanges.start(i),
        end: timeRanges.end(i),
      });
    }
    return result;
  }
}

export abstract class BaseDomMediaElement<T extends HTMLMediaElement, S extends DomMediaElementState> extends BaseDomElement<T, S> implements DomMediaElementApi {
  protected _source: UrlSource | undefined;

  protected _nextLoadBreaker = new ObserverBreaker();

  protected constructor(htmlElement: T) {
    super(htmlElement);
  }

  loadSource(source: UrlSource): Observable<void> {
    return new Observable((observer) => {
      let firstLoad = !!this._source;

      this._loadStage = new OpStage();

      this._source = source;

      this._loadBreaker.break();
      this._nextLoadBreaker.break();

      let loadedData$ = fromEvent(this._htmlElement, HTMLMediaElementEvent.LOADEDDATA).pipe(take(1));
      let loadedMetadata$ = fromEvent(this._htmlElement, HTMLMediaElementEvent.LOADEDMETEDATA).pipe(take(1));
      let error$ = fromEvent(this._htmlElement, HTMLMediaElementEvent.ERROR).pipe(take(1));

      let loadError = (error: any) => {
        console.debug(error);
        this._loadBreaker.break();
        this._onEvent$.next({
          type: DomElementEventType.DOM_ELEMENT_LOAD_ERROR,
          data: {
            state: this.state,
            error: error,
          },
        });
        this._loadStage.failure(error);
        errorCompleteObserver(observer, error);
      };

      error$
        .pipe(take(1))
        .pipe(takeUntil(this._loadBreaker.observer))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe((error) => {
          loadError(this._htmlElement.error?.message);
        });

      forkJoin([loadedData$, loadedMetadata$])
        .pipe(take(1))
        .pipe(timeout(20000))
        .pipe(takeUntil(this._loadBreaker.observer))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: ([loadedData, loadedMetadata]) => {
            this._loadBreaker.break();
            this._onEvent$.next({
              type: DomElementEventType.DOM_ELEMENT_LOADED,
              data: {
                state: this.state,
              },
            });
            this._loadStage.success();
            nextCompleteObserver(observer);

            fromEvent(this._htmlElement, HTMLMediaElementEvent.ERROR)
              .pipe(takeUntil(this._nextLoadBreaker.observer))
              .pipe(takeUntil(this._destroyBreaker.observer))
              .subscribe({
                next: (error) => {
                  console.debug(error);
                  this._onEvent$.next({
                    type: DomElementEventType.DOM_ELEMENT_ERROR,
                    data: {
                      state: this.state,
                      error: this._htmlElement.error?.message,
                    },
                  });
                },
              });
          },
          error: (error) => {
            loadError(error);
          },
        });

      this._loadStage.start();
      this._onEvent$.next({
        type: DomElementEventType.DOM_ELEMENT_LOADING,
        data: {
          state: this.state,
        },
      });

      this._htmlElement.src = this._source.url;

      if (!firstLoad) {
        this._htmlElement.load();
      }
    });
  }

  get bufferedTimeRanges(): BufferedTimeRange[] {
    return HtmlMediaElementUtil.resolveBufferedTimeRanges(this._htmlElement);
  }

  destroy() {
    this._nextLoadBreaker.break();
    super.destroy();
  }
}

export interface DomMediaElementConfig {
  crossOrigin?: string | undefined;
  loop?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
}

export class DomAudioElement extends BaseDomMediaElement<HTMLAudioElement, DomMediaElementState> {
  constructor(config?: DomMediaElementConfig) {
    super(new Audio());

    if (config && config.loop !== void 0) {
      this._htmlElement.loop = config.loop;
    }
    if (StringUtil.isNonEmpty(config?.crossOrigin)) {
      this._htmlElement.crossOrigin = config!.crossOrigin!;
    }

    if (StringUtil.isNonEmpty(config?.preload)) {
      this._htmlElement.preload = config!.preload!;
    } else {
      this._htmlElement.preload = 'metadata'
    }
  }

  protected getState(): DomMediaElementState {
    return {
      id: this._id,
      source: this._source?.state,
      loadStage: this._loadStage.state,
    };
  }

  destroy() {
    if (this._htmlElement) {
      this._htmlElement.pause();
      this._htmlElement.src = '';
      this._htmlElement.load();
    }
    super.destroy();
  }
}
