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

import {concatMap, map, Observable, observeOn, of, type OperatorFunction, queueScheduler, Subject, takeUntil} from 'rxjs';
import {type PlayerAudioEvent, type PlayerAudioInternalApi, type PlayerAudioState, PlayerAudioType} from '../../player';
import {type Audio, type AudioState, type TrackState} from '../../media';
import type {AudioHandlerApi, AudioHandlerState} from '../../audio';
import type {Destroyable} from '../../common/capabilities';
import {ObserverBreaker} from '../../common/observer-breaker';
import {TrackRepository} from '../../repository';
import {AudioHandlerProxy} from './audio-handler-proxy';
import {type PlayerAudioInternalMessageChannel} from './player-audio-internal-message-channel';
import {BaseMessageChannelProxy, type MessageChannelProxy} from '../message-channel-proxy';
import type {RemoteNode} from '../remote-node';
import {SessionStore} from '../../session';
import {freeObserver} from '../../util/rxjs-util';
import type {OmpProvider} from '../../omp-provider';
import type {AudioLevelSourceApi, AudioLevelSourceType} from '../../vu-meter/audio-level-source';

export class PlayerAudioInternalProxy extends BaseMessageChannelProxy<PlayerAudioInternalMessageChannel> implements PlayerAudioInternalApi, Destroyable {
  private readonly _trackRepository: TrackRepository;
  private readonly _session: SessionStore;

  protected _remoteNode: RemoteNode;

  private _tracks: {
    [PlayerAudioType.MAIN]: AudioState[];
    [PlayerAudioType.SIDECAR]: AudioState[];
  };

  private _state?: PlayerAudioState;

  private readonly _onEventQueue$ = new Subject<PlayerAudioEvent>();

  private _handlers: Set<MessageChannelProxy<any>> = new Set<MessageChannelProxy<any>>();

  private _destroyBreaker = new ObserverBreaker();

  constructor(remoteNode: RemoteNode, ompProvider: OmpProvider) {
    super(remoteNode.getRemoteChannelOrFail('PlayerAudioInternal'));

    this._trackRepository = ompProvider.trackRepository;
    this._session = ompProvider.sessionStore;
    this._remoteNode = remoteNode;

    this._tracks = {
      [PlayerAudioType.MAIN]: [],
      [PlayerAudioType.SIDECAR]: [],
    };

    this.messageChannel
      .listen('onEvent$')
      .pipe(this.syncStateOperator())
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this._onEventQueue$.next(event);
      });

    this.initialize();
  }

  private syncStateOperator<T>(): OperatorFunction<T, T> {
    return concatMap((arg) =>
      this.messageChannel
        .sendAndWaitForResponse('state')
        .pipe(takeUntil(this._destroyBreaker.observer))
        .pipe(
          map((state) => {
            this.updateFromState(state);
            return arg;
          })
        )
    );
  }

  protected initialize() {
    this.messageChannel
      .sendAndWaitForResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((playerAudioState) => {
        this.updateFromState(playerAudioState);
        this._onInitialized$.next(true);
      });
  }

  protected updateFromState(playerAudioState: PlayerAudioState) {
    this._state = playerAudioState;
    this._tracks = {
      [PlayerAudioType.MAIN]: this._state.tracks[PlayerAudioType.MAIN].map((p) => this._trackRepository.getOrFail(p.trackId).state as AudioState),
      [PlayerAudioType.SIDECAR]: this._state.tracks[PlayerAudioType.SIDECAR].map((p) => this._trackRepository.getOrFail(p.trackId).state as AudioState),
    };
    this.updateAudioHandlerProxies();
  }

  private updateAudioHandlerProxies() {
    let mapping: {
      playerAudioType: PlayerAudioType;
      trackId?: Audio['id'];
      state: AudioHandlerState | undefined;
    }[] = [
      {
        playerAudioType: PlayerAudioType.OUTPUT,
        state: this._state!.handlers[PlayerAudioType.OUTPUT],
      },
      {
        playerAudioType: PlayerAudioType.MAIN,
        state: this._state!.handlers[PlayerAudioType.MAIN],
      },
      ...this._state!.tracks[PlayerAudioType.SIDECAR].map((playerAudioTrackState) => ({
        playerAudioType: PlayerAudioType.SIDECAR,
        trackId: playerAudioTrackState.trackId,
        state: this._state!.handlers[PlayerAudioType.SIDECAR].find((p) => p.id === playerAudioTrackState.handlerId),
      })),
    ];

    let mainMediaId = this._session.state.player.mainMediaId;
    let handlersFromState: Set<MessageChannelProxy<any>> = new Set<MessageChannelProxy<any>>();
    if (mainMediaId) {
      mapping.forEach((mapping) => {
        if (mapping.state) {
          let handler: AudioHandlerProxy = this._remoteNode.getOrCreateProxy('AudioHandler', mainMediaId, mapping.playerAudioType, mapping.trackId, mapping.state);
          handler.updateFromState(mapping.state);
          handlersFromState.add(handler);
        }
      });
    }

    let obsoleteHandlers: Set<MessageChannelProxy<any>> = new Set<MessageChannelProxy<any>>();
    this._handlers.forEach((handler) => {
      if (!handlersFromState.has(handler)) {
        obsoleteHandlers.add(handler);
      }
    });

    this._handlers = new Set([...handlersFromState]);

    this._remoteNode.deleteProxies([...obsoleteHandlers]);
  }

  protected resolveHandlerState(playerAudioType: PlayerAudioType, trackId?: Audio['id']): AudioHandlerState | undefined {
    switch (playerAudioType) {
      case PlayerAudioType.OUTPUT:
      case PlayerAudioType.MAIN:
        return this._state!.handlers[playerAudioType];
      case PlayerAudioType.SIDECAR:
        let trackState = this._state!.tracks[PlayerAudioType.SIDECAR].find((p) => p.trackId === trackId);
        return this._state!.handlers[PlayerAudioType.SIDECAR].find((p) => p.id === trackState?.handlerId);
      default:
        return void 0;
    }
  }

  get onEvent$(): Observable<PlayerAudioEvent> {
    return this._onEventQueue$.pipe(observeOn(queueScheduler), takeUntil(this._destroyBreaker.observer));
  }

  private checkLateInitialization() {
    if (!this._state) {
      throw new Error('Late to initialize playerAudioState');
    }
  }

  get state(): PlayerAudioState {
    this.checkLateInitialization();
    return this._state!;
  }

  switchTrack(trackId: Audio['id'], activate?: boolean): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('switchTrack', [trackId, activate]).pipe(this.syncStateOperator());
  }

  loadSidecarTrack(audioState: AudioState): Observable<AudioState> {
    return this.messageChannel.sendAndWaitForResponse('loadSidecarTrack', [audioState]).pipe(this.syncStateOperator());
  }

  removeSidecarTrack(id: TrackState['id']): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeSidecarTrack', [id]).pipe(this.syncStateOperator());
  }

  removeAllSidecarTracks(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeAllSidecarTracks').pipe(this.syncStateOperator());
  }

  getHandler(playerAudioType: PlayerAudioType.OUTPUT | PlayerAudioType.MAIN): AudioHandlerApi | undefined;
  getHandler(playerAudioType: PlayerAudioType.SIDECAR, id: Audio['id']): AudioHandlerApi | undefined;
  getHandler(playerAudioType: PlayerAudioType, id?: Audio['id']): AudioHandlerApi | undefined {
    let state = this.resolveHandlerState(playerAudioType, id);
    let mainMediaId = this._session.state.player.mainMediaId;
    return state && mainMediaId ? this._remoteNode.getOrCreateProxy('AudioHandler', mainMediaId, playerAudioType, id, state) : void 0;
  }

  updateTrack(trackState: AudioState): void {
    ([PlayerAudioType.MAIN, PlayerAudioType.SIDECAR] as const).forEach((type) => {
      const index = this._tracks[type].findIndex((t) => t.id === trackState.id);
      if (index !== -1) {
        this._tracks[type][index] = trackState;
      }
    });
  }

  private _getTracks() {
    return [...this._tracks[PlayerAudioType.MAIN], ...this._tracks[PlayerAudioType.SIDECAR]];
  }

  getTracks(): AudioState[];
  getTracks(playerAudioType: PlayerAudioType.MAIN): AudioState[];
  getTracks(playerAudioType: PlayerAudioType.SIDECAR): AudioState[];
  getTracks(playerAudioType?: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR): AudioState[] {
    switch (playerAudioType) {
      case undefined:
        return this._getTracks();
      case PlayerAudioType.MAIN:
        return this._tracks[PlayerAudioType.MAIN];
      case PlayerAudioType.SIDECAR:
        return this._tracks[PlayerAudioType.SIDECAR];
      default:
        throw new Error(`Unknown player audio type ${playerAudioType}`);
    }
  }

  private getOutputHandlerOrFail(): AudioHandlerApi {
    let handler = this.getHandler(PlayerAudioType.OUTPUT);
    if (!handler) {
      throw new Error(`Audio not set up`);
    }
    return handler;
  }

  get muted(): boolean {
    return this.getOutputHandlerOrFail().muted;
  }

  get volume(): number {
    return this.getOutputHandlerOrFail().volume;
  }

  mute(): Observable<void> {
    return this.getOutputHandlerOrFail().mute().pipe(this.syncStateOperator());
  }

  setMuted(muted: boolean): Observable<void> {
    return this.getOutputHandlerOrFail().setMuted(muted).pipe(this.syncStateOperator());
  }

  setVolume(volume: number): Observable<void> {
    return this.getOutputHandlerOrFail().setVolume(volume).pipe(this.syncStateOperator());
  }

  toggleMuted(): Observable<void> {
    return this.getOutputHandlerOrFail().toggleMuted().pipe(this.syncStateOperator());
  }

  unmute(): Observable<void> {
    return this.getOutputHandlerOrFail().unmute().pipe(this.syncStateOperator());
  }

  destroy(): void {
    super.destroy();
    freeObserver(this._onEventQueue$);
    this._destroyBreaker.destroy();
  }
}
