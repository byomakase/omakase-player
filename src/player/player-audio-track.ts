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

import {
  BasePlayerTrack,
  type PlayerTrack,
  PlayerTrackEventType,
  type PlayerTrackLoadOptions,
  type PlayerTrackState
} from './player-track';
import {type PlayerAudioHandlerApi, type PlayerAudioHandlerState} from '../audio/audio-handler';
import type {AudioState} from '../media';
import {type PlayerController, PlayerControllerEventType} from './player-controller-api';
import {filter, Observable, takeUntil} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import type {AudioTrackController} from '../audio/audio-track-controller';
import type {Destroyable} from '../common/capabilities';
import {AudioControllerFactory} from '../audio/audio-controller-factory';

/** Load options for audio tracks. */
export interface PlayerAudioLoadOptions extends PlayerTrackLoadOptions {}

export interface PlayerAudioTrackState extends PlayerTrackState {
  handlerId: PlayerAudioHandlerState['id'];
  active: boolean;
}

export interface PlayerAudioTrack extends PlayerTrack<AudioState, PlayerAudioTrackState>, Destroyable {
  playerAudioHandler: PlayerAudioHandlerApi;

  active: boolean;

  setActive(active: boolean): Observable<void>;
}

export abstract class BasePlayerAudioTrack extends BasePlayerTrack<AudioState, PlayerAudioTrackState, PlayerAudioLoadOptions> implements PlayerAudioTrack {
  protected _active: boolean = false;

  protected constructor(trackState: AudioState) {
    super(trackState);
  }

  abstract get playerAudioHandler(): PlayerAudioHandlerApi;

  abstract setActive(active: boolean): Observable<void>;

  protected getState(): PlayerAudioTrackState {
    return {
      trackId: this._trackState.id,
      loadStage: this._loadStage.state,
      handlerId: this.playerAudioHandler.id,
      active: this.active,
    };
  }

  get active(): boolean {
    return this._active && this.playerAudioHandler.enabled;
  }

  destroy() {
    super.destroy();

    this.playerAudioHandler.destroy();
  }
}

export class PlayerMainAudioTrack extends BasePlayerAudioTrack {
  protected _playerAudioHandler: PlayerAudioHandlerApi;
  protected _playerController: PlayerController;

  constructor(track: AudioState, playerAudioHandler: PlayerAudioHandlerApi, playerController: PlayerController) {
    super(track);

    this._playerAudioHandler = playerAudioHandler;
    this._playerController = playerController;

    this._playerController.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_AUDIO_SWITCHED))
      .subscribe((event) => {
        let activate = event.data.activeAudioIdentifiers.includes(this._playerController.resolveAudioTrackIdentifier(this._trackState));
        this.updateActive(activate);
      });

    this.updateActive(this._playerController.resolveActiveAudioTracks([this._trackState]).length > 0);
  }

  get playerAudioHandler(): PlayerAudioHandlerApi {
    return this._playerAudioHandler;
  }

  protected updateActive(active: boolean) {
    this._active = active;
  }

  setActive(active: boolean): Observable<void> {
    return new Observable<void>((observer) => {
      if (this.active === active) {
        nextCompleteObserver(observer);
      } else {
        this._playerController!.switchAudioTrack(this._trackState, active).subscribe({
          next: () => {
            this._active = active;
            if (active !== this._playerAudioHandler.enabled) {
              this._playerAudioHandler.setEnabled(active);
            }
            this._onEvent$.next({
              type: PlayerTrackEventType.PLAYER_TRACK_SWITCHED,
              data: {
                playerTrackState: this.state,
              },
            });
            nextCompleteObserver(observer);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
      }
    });
  }

  destroy() {
    super.destroy();

    this._playerAudioHandler.destroy();
  }
}

export class PlayerSidecarAudioTrack extends BasePlayerAudioTrack {
  protected _playerAudioHandler: PlayerAudioHandlerApi;
  private _audioTrackController: AudioTrackController;
  private _outputAudioNode: AudioNode;

  constructor(audioState: AudioState, playerController: PlayerController, outputAudioNode: AudioNode) {
    super(audioState);

    this._audioTrackController = AudioControllerFactory.create(audioState, playerController);
    this._playerAudioHandler = this._audioTrackController.handler;

    this._outputAudioNode = outputAudioNode;
  }

  get audioTrackController(): AudioTrackController {
    return this._audioTrackController;
  }

  loadSource(): Observable<void> {
    return new Observable<void>((observer) => {
      this.loadStart();
      this._audioTrackController
        .loadSource()
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (event) => {
            // connect sidecar to output node
            this._playerAudioHandler.outputAudioNode.connect(this._outputAudioNode);

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

  setActive(active: boolean): Observable<void> {
    return new Observable<void>((observer) => {
      if (this.active === active) {
        nextCompleteObserver(observer);
      } else {
        this._active = active;
        if (active !== this._playerAudioHandler.enabled) {
          this._playerAudioHandler.setEnabled(active);
        }
        this._onEvent$.next({
          type: PlayerTrackEventType.PLAYER_TRACK_SWITCHED,
          data: {
            playerTrackState: this.state,
          },
        });
        nextCompleteObserver(observer);
      }
    });
  }

  get playerAudioHandler(): PlayerAudioHandlerApi {
    return this._playerAudioHandler;
  }

  destroy() {
    try {
      this._playerAudioHandler.outputAudioNode.disconnect(this._outputAudioNode);
    } catch (e) {
      console.debug('Failed to disconnect sidecar audio track from output node', e);
    }
    super.destroy();
    this._audioTrackController.destroy();
  }
}
