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

import type {Observable} from 'rxjs';
import type {Alert, AlertConfig, AlertEvent, AlertState} from '../../session/alerts-api';
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import type {RemoteNode} from '../remote-node';
import type {AlertsManagerMessageChannel} from './alerts-manager-message-channel';

export class AlertsManagerProxy extends BaseMessageChannelProxy<AlertsManagerMessageChannel> implements AlertsManagerMessageChannel {
  constructor(remoteNode: RemoteNode) {
    super(remoteNode.getRemoteChannelOrFail('AlertsManager'));
    this._onInitialized$.next(true);
  }

  get onEvent$(): Observable<AlertEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  error(message: string, config?: AlertConfig): Observable<Alert["id"]> {
    return this.messageChannel.sendAndWaitForResponse('error', [message, config]);
  }

  info(message: string, config?: AlertConfig): Observable<Alert["id"]> {
    return this.messageChannel.sendAndWaitForResponse('info', [message, config]);
  }

  warn(message: string, config?: AlertConfig): Observable<Alert["id"]> {
    return this.messageChannel.sendAndWaitForResponse('warn', [message, config]);
  }



  dismiss(id: AlertState['id']) {
    return this.messageChannel.sendAndWaitForResponse('dismiss', [id]);
  }

  dismissAll(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('dismissAll');
  }
}
