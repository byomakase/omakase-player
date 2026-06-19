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

import type {Destroyable, Serializable} from '../common/capabilities';
import {type Observable, Subject} from 'rxjs';
import {OpStage, type OpStageState} from '../common/op-stage';
import {ObserverBreaker} from '../common/observer-breaker';
import {CryptoUtil} from '../util/crypto-util';
import {freeObserver} from '../util/rxjs-util';

export const HTMLElementEvent = {
  LOAD: 'load',
  ERROR: 'error',
};

export enum DomElementEventType {
  DOM_ELEMENT_LOADING = 'DOM_ELEMENT_LOADING',
  DOM_ELEMENT_LOADED = 'DOM_ELEMENT_LOADED',
  DOM_ELEMENT_LOAD_ERROR = 'DOM_ELEMENT_LOAD_ERROR',
  DOM_ELEMENT_ERROR = 'DOM_ELEMENT_ERROR',
}

export interface DomElementState {
  id: string;

  loadStage: OpStageState;
}

export interface DomElementEventData extends Serializable {
  state: DomElementState;
}

export interface DomElementErrorEventData extends DomElementEventData {
  error: string | undefined;
}

export type PlayerDomElementEventTypeDataMap = {
  [DomElementEventType.DOM_ELEMENT_LOADING]: DomElementEventData;
  [DomElementEventType.DOM_ELEMENT_LOADED]: DomElementEventData;
  [DomElementEventType.DOM_ELEMENT_LOAD_ERROR]: DomElementErrorEventData;
  [DomElementEventType.DOM_ELEMENT_ERROR]: DomElementErrorEventData;
};
export type DomElementEvent = {
  [K in DomElementEventType]: {
    type: K;
    data: PlayerDomElementEventTypeDataMap[K];
  };
}[keyof PlayerDomElementEventTypeDataMap];

export interface DomElementApi<S extends DomElementState = DomElementState> extends Destroyable {
  onEvent$: Observable<DomElementEvent>;

  state: S;
}

export abstract class BaseDomElement<T extends HTMLElement, S extends DomElementState> implements DomElementApi<S> {
  protected readonly _onEvent$: Subject<DomElementEvent> = new Subject<DomElementEvent>();

  protected readonly _id: string;
  protected _htmlElement: T;
  protected _loadStage: OpStage;

  protected _loadBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(htmlElement: T) {
    this._id = CryptoUtil.uuid();

    this._htmlElement = htmlElement;
    this._htmlElement.id = this._id;

    this._loadStage = new OpStage();
  }

  protected abstract getState(): S;

  get onEvent$(): Observable<DomElementEvent> {
    return this._onEvent$.asObservable();
  }

  get htmlElement(): T {
    return this._htmlElement;
  }

  get state(): S {
    return this.getState();
  }

  destroy() {
    this._destroyBreaker.destroy();
    this._loadBreaker.destroy();

    freeObserver(this._onEvent$);

    // @ts-ignore
    this._htmlElement = void 0;
  }
}
