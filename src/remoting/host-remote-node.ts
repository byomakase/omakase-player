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

import {MessageChannel, type MessageChannelBinding} from './message-channel';
import {take, takeUntil, timeout, timer} from 'rxjs';
import {BaseRemoteNode, RemoteNodeEventType} from './remote-node';
import {REMOTING} from '../constants';
import {type MainMediaRepositoryMessageChannel, MainMediaRepositoryMessageChannelBinding} from './impl/main-media-repository-message-channel';
import {type TrackRepositoryMessageChannel, TrackRepositoryMessageChannelBinding} from './impl/track-repository-message-channel';
import {type SessionStoreMessageChannel, SessionStoreMessageChannelBinding} from './impl/session-store-message-channel';
import {type OmakaseTrackApiMessageChannel, OmakaseTrackApiMessageChannelBinding} from './impl/omakase-track-api-message-channel';
import {AlertsManagerMessageChannelBinding, type AlertsManagerMessageChannel} from './impl/alerts-manager-message-channel';
import {type TrackUtilsMessageChannel, TrackUtilsMessageChannelBinding} from './impl/track-utils-message-channel';
import type {OmpProvider} from '../omp-provider';
import {type UiMessageChannel, UiMessageChannelBinding} from './impl/ui-message-channel';

export class HostRemoteNode extends BaseRemoteNode {
  protected _messageChannelBindings: MessageChannelBinding[] = [];

  protected _lastHeartbeatTime?: number;
  protected _heartbeatFailuresNumber = 0;

  constructor(broadcastChannelId: string, ompProvider: OmpProvider) {
    super(broadcastChannelId, ompProvider);

    this.setRemoteChannels([
      // offered message channels
      {messageChannelName: 'MainMediaRepository', messageChannel: new MessageChannel<MainMediaRepositoryMessageChannel>(this._managedBroadcastChannel)},
      {messageChannelName: 'TrackRepository', messageChannel: new MessageChannel<TrackRepositoryMessageChannel>(this._managedBroadcastChannel)},
      {messageChannelName: 'SessionStore', messageChannel: new MessageChannel<SessionStoreMessageChannel>(this._managedBroadcastChannel)},
      {messageChannelName: 'OmakaseTrackApi', messageChannel: new MessageChannel<OmakaseTrackApiMessageChannel>(this._managedBroadcastChannel)},
      {messageChannelName: 'AlertsManager', messageChannel: new MessageChannel<AlertsManagerMessageChannel>(this._managedBroadcastChannel)},
      {messageChannelName: 'TrackUtils', messageChannel: new MessageChannel<TrackUtilsMessageChannel>(this._managedBroadcastChannel)},
      {messageChannelName: 'Ui', messageChannel: new MessageChannel<UiMessageChannel>(this._managedBroadcastChannel)},
    ]);

    this._messageChannelBindings = [
      new MainMediaRepositoryMessageChannelBinding(this.getChannelOrFail('MainMediaRepository'), ompProvider),
      new TrackRepositoryMessageChannelBinding(this.getChannelOrFail('TrackRepository'), ompProvider),
      new SessionStoreMessageChannelBinding(this.getChannelOrFail('SessionStore'), ompProvider),
      new OmakaseTrackApiMessageChannelBinding(this.getChannelOrFail('OmakaseTrackApi'), ompProvider),
      new AlertsManagerMessageChannelBinding(this.getChannelOrFail('AlertsManager'), ompProvider),
      new TrackUtilsMessageChannelBinding(this.getChannelOrFail('TrackUtils'), ompProvider),
      new UiMessageChannelBinding(this.getChannelOrFail('Ui'), ompProvider),
    ];
    this._messageChannelBindings.forEach((binding) => binding.bind());
  }

  listenForConnections() {
    console.debug(`Handshake channel started listening for connections on topic "${this._handshakeChannel.topic}"`);

    this._handshakeChannelBreaker.break();

    this._onEvent$.next({
      type: RemoteNodeEventType.REMOTE_NODE_CONNECTING,
      data: {},
    });

    this._handshakeChannel
      .receiveAndSendResponse('requestConnect')
      .pipe(take(1), takeUntil(this._handshakeChannelBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .pipe(timeout(REMOTING.host.requestConnectTimeout))
      .subscribe({
        next: ([[remoteMessageChannelDtos], sendResponseHook]) => {
          console.debug(`Connect request received on "${this._handshakeChannel.topic}". Remote message channels:`, remoteMessageChannelDtos);

          this.createRemoteMessageChannels(remoteMessageChannelDtos);
          this.initRemoteProxies()
            .pipe(timeout(30000))
            .pipe(takeUntil(this._handshakeChannelBreaker.observer))
            .subscribe(() => {
              sendResponseHook({
                messageChannels: this.getMessageChannelDtos(),
              });

              this._handshakeChannel
                .receiveAndSendResponse('connected')
                .pipe(take(1), takeUntil(this._handshakeChannelBreaker.observer), takeUntil(this._destroyBreaker.observer))
                .subscribe({
                  next: ([request, sendResponseHook]) => {
                    sendResponseHook();

                    this._onEvent$.next({
                      type: RemoteNodeEventType.REMOTE_NODE_CONNECTED,
                      data: {},
                    });

                    this._lastHeartbeatTime = new Date().getTime();
                    this._handshakeChannel
                      .receiveAndSendResponse(`heartbeat`)
                      .pipe(takeUntil(this._handshakeChannelBreaker.observer))
                      .subscribe({
                        next: ([[heartbeat], sendResponseHook]) => {
                          let heartbeatTime = new Date().getTime();

                          sendResponseHook(heartbeat);

                          this._lastHeartbeatTime = heartbeatTime;
                          this._heartbeatFailuresNumber = 0;

                          // console.debug('Heartbeat', heartbeatTime)
                        },
                      });

                    this.startHeartbeatCheckLoop();
                  },
                });
            });
        },
        error: (err) => {
          console.error(err);
          this._onEvent$.next({
            type: RemoteNodeEventType.REMOTE_NODE_CONNECT_FAILURE,
            data: {
              error: err,
            },
          });
        },
      });
  }

  stopListeningForConnections() {
    this.disconnect();
  }

  protected startHeartbeatCheckLoop() {
    timer(0, REMOTING.host.heartbeatCheckInterval)
      .pipe(takeUntil(this._handshakeChannelBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: () => {
          let now = new Date().getTime();
          let diff = now - this._lastHeartbeatTime!;
          if (diff > REMOTING.host.heartbeatFailureTimeDiffThreshold) {
            this._heartbeatFailuresNumber++;
            console.debug(`Heartbeat threshold reached (${diff}), failures number: ${this._heartbeatFailuresNumber}`);

            if (this._heartbeatFailuresNumber >= REMOTING.host.heartbeatFailuresNumberThreshold) {
              console.debug(`Heartbeat failures number threshold reached (${this._heartbeatFailuresNumber})`);
              this.disconnect();
            }
          }
        },
      });
  }

  protected disconnect() {
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
  }
}
