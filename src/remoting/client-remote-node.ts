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

import {takeUntil, timeout, timer} from 'rxjs';
import {MessageChannel} from './message-channel';
import {BaseRemoteNode, RemoteNodeEventType} from './remote-node';
import {REMOTING} from '../constants';
import {type PlayerDetachedMessageChannel, PlayerDetachedMessageChannelBinding} from './impl/player-detached-message-channel';
import type {PlayerAudioInternalMessageChannel} from './impl/player-audio-internal-message-channel';
import type {PlayerTextInternalMessageChannel} from './impl/player-text-internal-message-channel';
import {type ChromingDetachedMessageChannel, ChromingDetachedMessageChannelBinding} from './impl/chroming-detached-message-channel';
import type {PlayerDetachedApi} from '../player';
import type {ChromingDetachedApi} from '../chroming';
import type {OmpProvider} from '../omp-provider';

export class ClientRemoteNode extends BaseRemoteNode {
  protected _playerDetached: PlayerDetachedApi;
  protected _chromingDetached: ChromingDetachedApi;

  private _heartbeatTimeoutNumber = 0;

  constructor(broadcastChannelId: string, playerDetached: PlayerDetachedApi, chromingDetached: ChromingDetachedApi, ompProvider: OmpProvider) {
    super(broadcastChannelId, ompProvider);

    this._playerDetached = playerDetached;
    this._chromingDetached = chromingDetached;

    this.setRemoteChannels([
      // offered message channels
      {messageChannelName: 'PlayerDetached', messageChannel: new MessageChannel<PlayerDetachedMessageChannel>(this._managedBroadcastChannel)},
      {messageChannelName: 'PlayerAudioInternal', messageChannel: new MessageChannel<PlayerAudioInternalMessageChannel>(this._managedBroadcastChannel)},
      {messageChannelName: 'PlayerTextInternal', messageChannel: new MessageChannel<PlayerTextInternalMessageChannel>(this._managedBroadcastChannel)},
      {messageChannelName: 'ChromingDetached', messageChannel: new MessageChannel<ChromingDetachedMessageChannel>(this._managedBroadcastChannel)},
    ]);

    this._messageChannelBindings = [
      new PlayerDetachedMessageChannelBinding(this.getChannelOrFail('PlayerDetached'), this.getChannelOrFail('PlayerAudioInternal'), this.getChannelOrFail('PlayerTextInternal'), this._playerDetached, ompProvider),
      new ChromingDetachedMessageChannelBinding(this.getChannelOrFail('ChromingDetached'), this._chromingDetached, ompProvider),
    ];
    this._messageChannelBindings.forEach((binding) => binding.bind());
  }

  startConnectLoop() {
    this._handshakeChannelBreaker.break();

    let connectionAttempt = 1;

    let connect = () => {
      this._handshakeChannel
        .sendAndWaitForResponse('requestConnect', [this.getMessageChannelDtos()])
        .pipe(takeUntil(this._handshakeChannelBreaker.observer))
        .pipe(timeout(REMOTING.client.connectionRetryInterval))
        .subscribe({
          next: (response) => {
            console.debug(`Connect response received. Received message channels:`, response.messageChannels);

            this.createRemoteMessageChannels(response.messageChannels);

            this.initRemoteProxies()
              .pipe(timeout(30000))
              .pipe(takeUntil(this._handshakeChannelBreaker.observer))
              .subscribe(() => {
                this._handshakeChannel
                  .sendAndWaitForResponse('connected')
                  .pipe(takeUntil(this._handshakeChannelBreaker.observer))
                  .subscribe(() => {
                    this._onEvent$.next({
                      type: RemoteNodeEventType.REMOTE_NODE_CONNECTED,
                      data: {},
                    });
                    this.startHeartbeatLoop();
                  });
              });
          },
          error: (error) => {
            console.error(error);
            console.debug(`Could not connect yet on ${this._handshakeChannel.topic}, attempt no ${connectionAttempt}`);
            if (connectionAttempt > REMOTING.client.maxConnectionAttempts) {
              console.debug(`Could not connect, quitting`);
              this._onEvent$.next({
                type: RemoteNodeEventType.REMOTE_NODE_CONNECT_FAILURE,
                data: {
                  error: `Could not connect, tried ${REMOTING.client.maxConnectionAttempts} times`,
                },
              });
              this.disconnect();
            } else {
              connectionAttempt++;
              connect();
            }
          },
        });
    };

    connect();
  }

  private startHeartbeatLoop() {
    timer(0, REMOTING.client.heartbeatInterval)
      .pipe(takeUntil(this._handshakeChannelBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (num) => {
          this.sendHeartBeat();
        },
      });
  }

  private sendHeartBeat() {
    let heartbeat = new Date().getTime();

    this._handshakeChannel
      .sendAndWaitForResponse(`heartbeat`, [heartbeat])
      .pipe(takeUntil(this._handshakeChannelBreaker.observer))
      .pipe(timeout(REMOTING.client.heartbeatTimeout))
      .subscribe({
        next: (response) => {
          // this._inboundLatest.heartbeat = heartbeat;
          this._heartbeatTimeoutNumber = 0;
          // console.debug(`Heartbeat response:`, response);
        },
        error: (error) => {
          console.error(error);

          this._heartbeatTimeoutNumber++;
          console.debug(`Heartbeat timeout no: ${this._heartbeatTimeoutNumber}`);

          if (this._heartbeatTimeoutNumber >= REMOTING.client.maxHeartbeatTimeouts) {
            console.debug(`Maximum heartheat timeouts reached (${REMOTING.client.maxHeartbeatTimeouts}), disconnecting..`);
            this.disconnect();
          }
        },
      });
  }

  private disconnect() {
    this._handshakeChannelBreaker.destroy();

    this._onEvent$.next({
      type: RemoteNodeEventType.REMOTE_NODE_DISCONNECTED,
      data: {},
    });
  }

  destroy() {
    this.disconnect();

    super.destroy();

    this._messageChannelBindings.forEach((binding) => binding.destroy());

    this._proxyByTopic.forEach((proxy) => proxy.destroy());
    Object.values(this._proxyByName).forEach((proxy) => proxy.destroy());
  }
}
