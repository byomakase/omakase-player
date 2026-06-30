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
import {filter, Observable, Subject, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../common/observer-breaker';
import {errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {type PlayerController, PlayerControllerEventType} from '../player';
import {CryptoUtil} from '../util/crypto-util';
import type {TextTrackState} from '../media';
import {type TextTrackController} from './text-track-controller';
import {TextTrackControllerFactory} from './text-track-controller-factory';
import {PlayerTextHandlerType, type PlayerTextTrackLoadOptions} from '../player/player-text-track';
import type {PlayerTrackLoadOptions} from '../player/player-track';

export enum TextTrackHandlerEventType {
  TEXT_TRACK_HANDLER_CHANGE = 'TEXT_TRACK_HANDLER_CHANGE',
}

export interface TextTrackHandlerEventData extends Serializable {
  state: TextTrackHandlerState;
}

export type TextTrackHandlerEventTypeDataMap = {
  [TextTrackHandlerEventType.TEXT_TRACK_HANDLER_CHANGE]: TextTrackHandlerEventData;
};

export type TextTrackHandlerEvent = {
  [K in TextTrackHandlerEventType]: {
    type: K;
    data: TextTrackHandlerEventTypeDataMap[K];
  };
}[keyof TextTrackHandlerEventTypeDataMap];

export interface TextTrackHandlerState {
  handlerType: PlayerTextHandlerType;

  active: boolean;
  shown: boolean;
}

export interface TextTrackHandlerApi {
  onEvent$: Observable<TextTrackHandlerEvent>;

  active: boolean;

  shown: boolean;

  handlerType: PlayerTextHandlerType;

  state: TextTrackHandlerState;

  switch(active: boolean): Observable<void>;

  show(): Observable<void>;

  hide(): Observable<void>;

  toggleShowHide(): Observable<void>;
}

export interface PlayerTextTrackHandlerState extends TextTrackHandlerState {
  id: string;
}

export interface PlayerTextTrackHandlerApi extends TextTrackHandlerApi, Destroyable {
  id: string;

  handlerType: PlayerTextHandlerType;

  state: PlayerTextTrackHandlerState;

  restoreState(state: PlayerTextTrackHandlerState): Observable<void>;
}

export abstract class BasePlayerTextTrackHandler implements PlayerTextTrackHandlerApi {
  protected readonly _onEvent$: Subject<TextTrackHandlerEvent> = new Subject<TextTrackHandlerEvent>();

  protected _id: string;

  protected _trackState: TextTrackState;
  protected _playerController: PlayerController;
  protected _loadOptions: PlayerTrackLoadOptions | undefined;

  protected _active: boolean = false;
  protected _shown: boolean = false;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(trackState: TextTrackState, playerController: PlayerController, loadOptions?: PlayerTrackLoadOptions) {
    this._id = CryptoUtil.uuid();
    this._trackState = trackState;
    this._playerController = playerController;
    this._loadOptions = loadOptions;
  }

  abstract get handlerType(): PlayerTextHandlerType;

  abstract hide(): Observable<void>;
  abstract show(): Observable<void>;
  abstract switch(active: boolean): Observable<void>;

  protected setActive(active: boolean) {
    this._active = active;
  }

  protected setShown(shown: boolean) {
    this._shown = shown;
  }

  restoreState(state: PlayerTextTrackHandlerState): Observable<void> {
    throw new Error('niy');
  }

  get id(): string {
    return this._id;
  }

  get onEvent$(): Observable<TextTrackHandlerEvent> {
    return this._onEvent$.asObservable();
  }

  get active(): boolean {
    return this._active;
  }

  get shown(): boolean {
    return this._shown;
  }

  toggleShowHide(): Observable<void> {
    return this._shown ? this.hide() : this.show();
  }

  protected emitChangeEvent() {
    this._onEvent$.next({
      type: TextTrackHandlerEventType.TEXT_TRACK_HANDLER_CHANGE,
      data: {
        state: this.state,
      },
    });
  }

  protected getState(): PlayerTextTrackHandlerState {
    return {
      id: this._id,
      handlerType: this.handlerType,
      active: this._active,
      shown: this._shown,
    };
  }

  get state(): PlayerTextTrackHandlerState {
    return this.getState();
  }

  destroy() {
    this._destroyBreaker.destroy();

    freeObserver(this._onEvent$);
  }
}

/**
 * Functions without internal controller (only PlayerController)
 */
export class MainTextTrackHandler extends BasePlayerTextTrackHandler {
  constructor(trackState: TextTrackState, playerController: PlayerController) {
    super(trackState, playerController);

    let controllerTextTrackIdentifier = this._playerController.resolveTextTrackIdentifier(this._trackState);

    this._playerController.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_TEXT_TRACK_SWITCHED))
      .subscribe((event) => {
        let active = event.data.activeTextTrackIdentifiers.includes(controllerTextTrackIdentifier);
        this.setActive(active);
        this.setShown(event.data.textTracksDisplayed);
      });

    this.setActive(this._playerController.resolveActiveTextTracks([this._trackState]).length > 0);
    this.setShown(this._playerController.textTracksDisplayed);
  }

  get handlerType(): PlayerTextHandlerType {
    return PlayerTextHandlerType.EMBEDDED;
  }

  switch(active: boolean): Observable<void> {
    return passiveObservable((observer) => {
      if (this.active === active) {
        nextCompleteObserver(observer);
      } else {
        this._playerController.switchTextTrack(this._trackState, active).subscribe({
          next: () => {
            this.setShown(active ? this._playerController.textTracksDisplayed : false);
            this.emitChangeEvent();
            nextCompleteObserver(observer);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
      }
    });
  }

  show(): Observable<void> {
    return passiveObservable<void>((observer) => {
      if (this._active) {
        if (this._shown) {
          nextCompleteObserver(observer);
        } else {
          this._playerController.setTextTracksDisplayed(true);
          this._shown = true;
          this.emitChangeEvent();
        }
      } else {
        console.debug(`Cannot show track ${this._trackState.id}, track not active`);
      }
      nextCompleteObserver(observer);
    });
  }

  hide(): Observable<void> {
    return passiveObservable<void>((observer) => {
      if (this._active) {
        if (!this._shown) {
          nextCompleteObserver(observer);
        } else {
          this._playerController.setTextTracksDisplayed(false);
          this._shown = false;
          this.emitChangeEvent();
        }
      } else {
        console.debug(`Cannot hide track ${this._trackState.id}, track not active`);
      }
      nextCompleteObserver(observer);
    });
  }
}

/**
 * Functions with internal TextTrackController
 */
export class SidecarTextTrackHandler extends BasePlayerTextTrackHandler {
  protected _textTrackController: TextTrackController;

  constructor(trackState: TextTrackState, playerController: PlayerController, loadOptions?: PlayerTextTrackLoadOptions) {
    super(trackState, playerController, loadOptions);

    this._textTrackController = TextTrackControllerFactory.create(trackState, playerController, this._loadOptions);
  }

  get handlerType(): PlayerTextHandlerType {
    return this._textTrackController.playerTextHandlerType;
  }

  switch(active: boolean): Observable<void> {
    return passiveObservable((observer) => {
      if (this.active === active) {
        nextCompleteObserver(observer);
      } else {
        this._textTrackController.switch(active).subscribe({
          next: () => {
            this.setActive(active);
            this.setShown(active);
            this.emitChangeEvent();
            nextCompleteObserver(observer);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
      }
    });
  }

  show(): Observable<void> {
    return passiveObservable<void>((observer) => {
      if (this._active) {
        if (this._shown) {
          nextCompleteObserver(observer);
        } else {
          this._textTrackController.show().subscribe({
            next: () => {
              this.setShown(true);
              this.emitChangeEvent();
              nextCompleteObserver(observer);
            },
            error: (err) => {
              errorCompleteObserver(observer, err);
            },
          });
        }
      } else {
        console.debug(`Cannot show track ${this._trackState.id}, track not active`);
      }
      nextCompleteObserver(observer);
    });
  }

  hide(): Observable<void> {
    return passiveObservable<void>((observer) => {
      if (this._active) {
        if (!this._shown) {
          nextCompleteObserver(observer);
        } else {
          this._textTrackController.hide().subscribe({
            next: () => {
              this.setShown(false);
              this.emitChangeEvent();
              nextCompleteObserver(observer);
            },
            error: (err) => {
              errorCompleteObserver(observer, err);
            },
          });
        }
      } else {
        console.debug(`Cannot hide track ${this._trackState.id}, track not active`);
      }
      nextCompleteObserver(observer);
    });
  }

  get textTrackController(): TextTrackController {
    return this._textTrackController;
  }

  destroy() {
    super.destroy();
    this._textTrackController.destroy();
  }
}
