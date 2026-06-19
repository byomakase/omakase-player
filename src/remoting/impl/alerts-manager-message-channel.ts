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

import {takeUntil, type Observable} from 'rxjs';
import type {Alert, AlertConfig, AlertEvent} from '../../session/alerts-api';
import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import type {AlertsManager} from '../../session/alert';
import type {OmpProvider} from '../../omp-provider';

export interface AlertsManagerMessageChannel {
  onEvent$: Observable<AlertEvent>;

  info(message: string, config?: AlertConfig): Observable<Alert['id']>;

  warn(message: string, config?: AlertConfig): Observable<Alert['id']>;

  error(message: string, config?: AlertConfig): Observable<Alert['id']>;

  dismiss(id: Alert['id']): Observable<void>;

  dismissAll(): Observable<void>;
}

export class AlertsManagerMessageChannelBinding extends BaseMessageChannelBinding {
  private _messageChannel: MessageChannel<AlertsManagerMessageChannel>;
  private _alertsManager: AlertsManager;

  constructor(messageChannel: MessageChannel<AlertsManagerMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._alertsManager = ompProvider.alertsManager;
    this._messageChannel = messageChannel;
  }

  override bind() {
    this._alertsManager.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onEvent$', event);
    });

    this._messageChannel
      .receiveAndSendResponse('info')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[message, config], sendResponseHook]) => {
          sendResponseHook(this._alertsManager.info(message, config));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('warn')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[message, config], sendResponseHook]) => {
          sendResponseHook(this._alertsManager.warn(message, config));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('error')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[message, config], sendResponseHook]) => {
          sendResponseHook(this._alertsManager.error(message, config));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('dismiss')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          this._alertsManager.dismiss(id);
          sendResponseHook();
        },
      });

    this._messageChannel
      .receiveAndSendResponse('dismissAll')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          this._alertsManager.dismissAll();
          sendResponseHook();
        },
      });
  }
}
