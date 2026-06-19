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

import {Observable, Subject} from 'rxjs';
import {CryptoUtil} from '../util/crypto-util';
import {type Alert, type AlertsApi, type AlertConfig, type AlertEvent, AlertEventType, AlertLevel, type AlertState} from './alerts-api';
import type {Destroyable} from '../common/capabilities';
import {freeObserver} from '../util/rxjs-util';

class AlertImpl implements Alert {
  readonly id: string;
  readonly level: AlertLevel;
  readonly message: string;
  readonly timestamp: Date;
  readonly config: AlertConfig | undefined;

  constructor(level: AlertLevel, message: string, config: AlertConfig | undefined) {
    this.id = CryptoUtil.uuid();
    this.level = level;
    this.message = message;
    this.timestamp = new Date();
    this.config = config;
  }

  get state(): AlertState {
    return {
      id: this.id,
      level: this.level,
      message: this.message,
      timestamp: this.timestamp,
      config: this.config,
    };
  }
}

export class AlertsManager implements AlertsApi, Destroyable {
  private readonly _onEvent$: Subject<AlertEvent> = new Subject<AlertEvent>();
  private readonly _activeAlerts: Map<string, Alert> = new Map();

  constructor() {}

  get onEvent$(): Observable<AlertEvent> {
    return this._onEvent$.asObservable();
  }

  info(message: string, config?: AlertConfig): string {
    return this._emit(new AlertImpl(AlertLevel.INFO, message, config));
  }

  warn(message: string, config?: AlertConfig): string {
    return this._emit(new AlertImpl(AlertLevel.WARN, message, config));
  }

  error(message: string, config?: AlertConfig): string {
    return this._emit(new AlertImpl(AlertLevel.ERROR, message, config));
  }

  dismiss(id: string): void {
    const alert = this._activeAlerts.get(id);
    if (alert) {
      this._dismiss(alert);
    }
  }

  dismissAll() {
    this._activeAlerts.forEach((alert) => {
      this._dismiss(alert);
    });
  }

  private _emit(alert: Alert): string {
    this._activeAlerts.set(alert.id, alert);

    this._onEvent$.next({
      type: AlertEventType.ALERT_RAISED,
      data: {alert},
    });

    if (alert.config?.duration !== undefined) {
      setTimeout(() => {
        this._dismiss(alert);
      }, alert.config!.duration);
    }

    return alert.id;
  }

  private _dismiss(alert: Alert): void {
    if (!this._activeAlerts.has(alert.id)) {
      return;
    }
    this._activeAlerts.delete(alert.id);
    this._onEvent$.next({
      type: AlertEventType.ALERT_DISMISSED,
      data: {alert},
    });
  }

  destroy() {
    this.dismissAll();
    freeObserver(this._onEvent$);
  }
}
