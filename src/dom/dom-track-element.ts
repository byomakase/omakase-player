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

import {BaseDomElement, type DomElementApi, DomElementEventType, type DomElementState, HTMLElementEvent} from './dom-element';
import {fromEvent, Observable, take, takeUntil} from 'rxjs';
import {OpStage} from '../common/op-stage';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import type {TextTrackState} from '../media';
import {DomUtil} from './dom-util';
import {SourceUtil} from '../source';
import {StringUtil} from '../util/string-util';

export const HTMLTrackElementEvent = {
  ...HTMLElementEvent,
};

export interface DomTrackElementState extends DomElementState {}

export interface DomTrackElementApi extends DomElementApi<DomTrackElementState> {
  load(addToDomFn: (htmlElement: HTMLTrackElement) => TextTrack): Observable<void>;
}

export abstract class BaseDomTrackElement<T extends HTMLTrackElement, S extends DomTrackElementState> extends BaseDomElement<T, S> implements DomTrackElementApi {
  protected constructor(htmlElement: T) {
    super(htmlElement);
  }

  load(addToDomFn: (htmlElement: HTMLTrackElement) => TextTrack): Observable<void> {
    return new Observable((observer) => {
      this._loadStage = new OpStage();

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

      fromEvent(this._htmlElement, HTMLTrackElementEvent.ERROR)
        .pipe(take(1))
        .pipe(takeUntil(this._loadBreaker.observer))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe((error) => {
          loadError(error);
        });

      fromEvent(this._htmlElement, HTMLTrackElementEvent.LOAD)
        .pipe(take(1))
        .pipe(takeUntil(this._loadBreaker.observer))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (loadedData) => {
            this._loadBreaker.break();
            this._onEvent$.next({
              type: DomElementEventType.DOM_ELEMENT_LOADED,
              data: {
                state: this.state,
              },
            });
            this._loadStage.success();
            nextCompleteObserver(observer);

            fromEvent(this._htmlElement, HTMLTrackElementEvent.ERROR)
              .pipe(takeUntil(this._loadBreaker.observer))
              .pipe(takeUntil(this._destroyBreaker.observer))
              .subscribe({
                next: (error) => {
                  console.debug(error);
                  this._onEvent$.next({
                    type: DomElementEventType.DOM_ELEMENT_ERROR,
                    data: {
                      state: this.state,
                      error: `Unknown error`,
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

      try {
        let textTrack = addToDomFn(this._htmlElement);
        textTrack.mode = 'hidden'; // this line somehow triggers cues loading and thus we can catch LOAD' event and complete the observable
      } catch (e) {
        errorCompleteObserver(observer, e);
      }
    });
  }

  destroy() {
    super.destroy();
  }
}

export interface DomTrackElementConfig {}

export class DomTextTrackElement extends BaseDomTrackElement<HTMLTrackElement, DomTrackElementState> {
  constructor(track: TextTrackState) {
    super(DomTextTrackElement.createHtmlTrackElement(track));
  }

  static createHtmlTrackElement(track: TextTrackState): HTMLTrackElement {
    let element: HTMLTrackElement = DomUtil.createElement<'track'>('track');
    if (track.kind) {
      element.kind = track.kind;
    }

    element.id = track.id;
    element.label = StringUtil.isNonEmpty(track.label) ? `${track.label}` : ``;

    if (track.srclang) {
      element.srclang = track.srclang;
    }

    if (track.source) {
      element.src = SourceUtil.resolveUrlFromSourceState(track.source);
    }

    element.default = track.default;
    return element;
  }

  protected getState(): DomTrackElementState {
    return {
      id: this._id,
      loadStage: this._loadStage.state,
    };
  }
}
