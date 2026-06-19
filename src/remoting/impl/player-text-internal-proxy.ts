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
import type {Destroyable} from '../../common/capabilities';
import {ObserverBreaker} from '../../common/observer-breaker';
import {TrackRepository} from '../../repository';
import {BaseMessageChannelProxy, type MessageChannelProxy} from '../message-channel-proxy';
import type {PlayerTextInternalMessageChannel} from './player-text-internal-message-channel';
import {type PlayerTextEvent, type PlayerTextInternalApi, type PlayerTextState} from '../../player';
import {type TextTrack, type TextTrackState, type TrackState} from '../../media';
import {TextTrackHandlerProxy} from './text-track-handler-proxy';
import type {TextTrackHandlerApi, TextTrackHandlerState} from '../../text';
import {PlayerTextType} from '../../player/player-text';
import type {RemoteNode} from '../remote-node';
import {SessionStore} from '../../session';
import {freeObserver} from '../../util/rxjs-util';
import type {OmpProvider} from '../../omp-provider';

export class PlayerTextInternalProxy extends BaseMessageChannelProxy<PlayerTextInternalMessageChannel> implements PlayerTextInternalApi, Destroyable {
  private readonly _trackRepository: TrackRepository;
  private readonly _session: SessionStore;

  protected _remoteNode: RemoteNode;

  private _tracks: {
    [PlayerTextType.MAIN]: TextTrackState[];
    [PlayerTextType.SIDECAR]: TextTrackState[];
  };

  private _state?: PlayerTextState;

  private readonly _onEventQueue$ = new Subject<PlayerTextEvent>();

  private _handlers: Set<MessageChannelProxy<any>> = new Set<MessageChannelProxy<any>>();

  private _destroyBreaker = new ObserverBreaker();

  constructor(remoteNode: RemoteNode, ompProvider: OmpProvider) {
    super(remoteNode.getRemoteChannelOrFail('PlayerTextInternal'));

    this._trackRepository = ompProvider.trackRepository;
    this._session = ompProvider.sessionStore;
    this._remoteNode = remoteNode;

    this._tracks = {
      [PlayerTextType.MAIN]: [],
      [PlayerTextType.SIDECAR]: [],
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
      .subscribe((playerTextState) => {
        this.updateFromState(playerTextState);
        this._onInitialized$.next(true);
      });
  }

  protected updateFromState(playerTextState: PlayerTextState) {
    this._state = playerTextState;
    this._tracks = {
      [PlayerTextType.MAIN]: this._state.tracks[PlayerTextType.MAIN].map((p) => this._trackRepository.getOrFail(p.trackId).state as TextTrackState),
      [PlayerTextType.SIDECAR]: this._state.tracks[PlayerTextType.SIDECAR].map((p) => this._trackRepository.getOrFail(p.trackId).state as TextTrackState),
    };
    this.updateTextTrackHandlerProxies();
  }

  private updateTextTrackHandlerProxies() {
    let allTracks = [...this._state!.tracks[PlayerTextType.MAIN], ...this._state!.tracks[PlayerTextType.SIDECAR]];
    let allHandlers = [...this._state!.handlers[PlayerTextType.MAIN], ...this._state!.handlers[PlayerTextType.SIDECAR]];

    let mappings: {
      trackId: TextTrack['id'];
      state: TextTrackHandlerState | undefined;
    }[] = allTracks.map((playerTrackState) => ({
      trackId: playerTrackState.trackId,
      state: allHandlers.find((p) => p.id === playerTrackState.handlerId),
    }));

    let mainMediaId = this._session.state.player.mainMediaId;
    let handlersFromState: Set<MessageChannelProxy<any>> = new Set<MessageChannelProxy<any>>();
    if (mainMediaId) {
      mappings.forEach((mapping) => {
        if (mapping.state) {
          let handler: TextTrackHandlerProxy = this._remoteNode.getOrCreateProxy('TextTrackHandler', mainMediaId, mapping.trackId, mapping.state);
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

  protected resolveHandlerState(id: TextTrack['id']): TextTrackHandlerState | undefined {
    let allTracks = [...this._state!.tracks[PlayerTextType.MAIN], ...this._state!.tracks[PlayerTextType.SIDECAR]];
    let allHandlers = [...this._state!.handlers[PlayerTextType.MAIN], ...this._state!.handlers[PlayerTextType.SIDECAR]];
    let handlerId = allTracks.find((p) => p.trackId === id)?.handlerId;
    return allHandlers.find((p) => p.id === handlerId) ?? void 0;
  }

  get onEvent$(): Observable<PlayerTextEvent> {
    return this._onEventQueue$.pipe(observeOn(queueScheduler), takeUntil(this._destroyBreaker.observer));
  }

  private checkLateInitialization() {
    if (!this._state) {
      throw new Error('Late to initialize playerTextState');
    }
  }

  get state(): PlayerTextState {
    this.checkLateInitialization();
    return this._state!;
  }

  switchTrack(trackId: TextTrack['id'], activate?: boolean): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('switchTrack', [trackId, activate]).pipe(this.syncStateOperator());
  }

  get shown(): boolean {
    return this.state.shown;
  }

  hide(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('hide').pipe(this.syncStateOperator());
  }

  show(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('show').pipe(this.syncStateOperator());
  }

  toggleShowHide(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('toggleShowHide').pipe(this.syncStateOperator());
  }

  loadSidecarTrack(textTrackState: TextTrackState): Observable<TextTrackState> {
    return this.messageChannel.sendAndWaitForResponse('loadSidecarTrack', [textTrackState]).pipe(this.syncStateOperator());
  }

  removeSidecarTrack(id: TrackState['id']): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeSidecarTrack', [id]).pipe(this.syncStateOperator());
  }

  removeAllSidecarTracks(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeAllSidecarTracks').pipe(this.syncStateOperator());
  }

  getHandler(id: TextTrack['id']): TextTrackHandlerApi | undefined {
    let state = this.resolveHandlerState(id);
    let mainMediaId = this._session.state.player.mainMediaId;
    return state && mainMediaId ? this._remoteNode.getOrCreateProxy('TextTrackHandler', mainMediaId, id, state) : void 0;
  }

  updateTrack(trackState: TextTrackState): void {
    ([PlayerTextType.MAIN, PlayerTextType.SIDECAR] as const).forEach((type) => {
      const index = this._tracks[type].findIndex((t) => t.id === trackState.id);
      if (index !== -1) {
        this._tracks[type][index] = trackState;
      }
    });
  }

  getTracks(): TextTrackState[];
  getTracks(playerTextTrackType: PlayerTextType.MAIN): TextTrackState[];
  getTracks(playerTextTrackType: PlayerTextType.SIDECAR): TextTrackState[];
  getTracks(playerTextTrackType?: PlayerTextType.MAIN | PlayerTextType.SIDECAR): TextTrackState[] {
    switch (playerTextTrackType) {
      case undefined:
        return [...this._tracks[PlayerTextType.MAIN], ...this._tracks[PlayerTextType.SIDECAR]];
      case PlayerTextType.MAIN:
        return this._tracks[PlayerTextType.MAIN];
      case PlayerTextType.SIDECAR:
        return this._tracks[PlayerTextType.SIDECAR];
      default:
        throw new Error(`Unknown player textTrack type ${playerTextTrackType}`);
    }
  }

  destroy(): void {
    super.destroy();
    freeObserver(this._onEventQueue$);
    this._destroyBreaker.destroy();
  }
}
