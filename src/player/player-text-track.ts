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

import {BasePlayerTrack, type PlayerTrack, PlayerTrackEventType, type PlayerTrackLoadOptions, type PlayerTrackState} from './player-track';
import {MainTextTrackHandler, type PlayerTextTrackHandlerApi, type PlayerTextTrackHandlerState, SidecarTextTrackHandler} from '../text';
import {type FallbackFormat, type TextTrackState, TimeReference} from '../media';
import type {TextTrackController} from '../text/text-track-controller';
import {type PlayerController} from './player-controller-api';
import {Observable, takeUntil} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import type {Destroyable} from '../common/capabilities';

/** Load options for text tracks. */
export interface PlayerTextTrackLoadOptions extends PlayerTrackLoadOptions {
  handlerType?: PlayerTextHandlerType;
  timeReference?: TimeReference;
  fallbackFormat?: FallbackFormat;
}

export enum PlayerTextHandlerType {
  EMBEDDED = 'EMBEDDED',
  NATIVE = 'NATIVE',
  MEDIA_CAPTIONS = 'MEDIA_CAPTIONS',
  IMSC = 'IMSC',
}

export interface PlayerTextTrackState extends PlayerTrackState {
  handlerId: PlayerTextTrackHandlerState['id'];
  active: boolean;
  shown: boolean;
}

export interface PlayerTextTrack extends PlayerTrack<TextTrackState, PlayerTextTrackState>, Destroyable {
  handler: PlayerTextTrackHandlerApi;

  active: boolean;
}

export abstract class BasePlayerTextTrack extends BasePlayerTrack<TextTrackState, PlayerTextTrackState, PlayerTextTrackLoadOptions> implements PlayerTextTrack {
  protected constructor(track: TextTrackState, loadOptions?: PlayerTextTrackLoadOptions) {
    super(track, loadOptions);
  }

  abstract get handler(): PlayerTextTrackHandlerApi;

  get active(): boolean {
    return this.handler.active;
  }

  protected getState(): PlayerTextTrackState {
    return {
      trackId: this._trackState.id,
      loadStage: this._loadStage.state,

      handlerId: this.handler.id,

      active: this.handler.active,
      shown: this.handler.shown,
    };
  }

  destroy() {
    super.destroy();

    this.handler.destroy();
  }
}

export class PlayerMainTextTrack extends BasePlayerTextTrack {
  protected _handler: PlayerTextTrackHandlerApi;

  constructor(track: TextTrackState, playerController: PlayerController) {
    super(track);
    this._handler = new MainTextTrackHandler(track, playerController);

    this._handler.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._onEvent$.next({
        type: PlayerTrackEventType.PLAYER_TRACK_SWITCHED,
        data: {
          playerTrackState: this.state,
        },
      });
    });
  }

  get handler(): PlayerTextTrackHandlerApi {
    return this._handler;
  }
}

export class PlayerSidecarTextTrack extends BasePlayerTextTrack {
  protected _handler: PlayerTextTrackHandlerApi;

  protected _textTrackController: TextTrackController;

  constructor(trackState: TextTrackState, playerController: PlayerController, loadOptions?: PlayerTextTrackLoadOptions) {
    super(trackState, loadOptions);

    let handler = new SidecarTextTrackHandler(trackState, playerController, loadOptions);

    this._handler = handler;
    this._textTrackController = handler.textTrackController;

    this._handler.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._onEvent$.next({
        type: PlayerTrackEventType.PLAYER_TRACK_SWITCHED,
        data: {
          playerTrackState: this.state,
        },
      });
    });
  }

  loadSource(): Observable<void> {
    return new Observable<void>((observer) => {
      this.loadStart();
      this._textTrackController
        .loadSource()
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (event) => {
            this.loadSuccess();
            nextCompleteObserver(observer);
          },
          error: (err) => {
            this.loadError(err);
            errorCompleteObserver(observer, err);
          },
        });
    });
  }

  get handler(): PlayerTextTrackHandlerApi {
    return this._handler;
  }

  destroy() {
    super.destroy();
    this._textTrackController.destroy();
  }
}
