/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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
import {AlertsApi} from '../api';
import {AlertsDomController} from './alerts-dom-controller';
import {Alert, AlertConfig} from './model';
import {CryptoUtil} from '../util/crypto-util';

export interface AlertsConfig {
  /**
   * default duration in milliseconds before autodissmising alerts
   */
  duration: number;
}

export class AlertsController implements AlertsApi {
  private _alerts: Alert[] = [];
  private _alertDuration = 5000;
  private _alertsDomController!: AlertsDomController;

  constructor() {
    this._alertsDomController = new AlertsDomController(this);
  }

  get alerts() {
    return this._alerts;
  }

  configure(config: AlertsConfig) {
    this._alertDuration = config.duration;
  }

  warn(text: string, config?: AlertConfig): Alert {
    return this.createAlert('warning', text, config);
  }

  info(text: string, config?: AlertConfig): Alert {
    return this.createAlert('info', text, config);
  }

  error(text: string, config?: AlertConfig): Alert {
    return this.createAlert('error', text, config);
  }

  update(id: string, text: string) {
    const alert = this.getAlertById(id);
    if (!alert) {
      return;
    }
    alert.text = text;
    this._alertsDomController.updateAlertInDom(alert);
  }

  dismiss(id: string) {
    const alert = this.getAlertById(id);
    if (!alert) {
      return;
    }
    this._alerts.splice(this._alerts.indexOf(alert), 1);
    this._alertsDomController.removeAlertFromDom(alert);
  }

  private getAlertById(id: string): Alert | undefined {
    return this._alerts.find((alert) => alert.id === id);
  }

  private createAlert(type: 'info' | 'warning' | 'error', text: string, config?: AlertConfig): Alert {
    const alert = {
      id: CryptoUtil.uuid(),
      type,
      text,
    };
    this._alerts.push(alert);
    this._alertsDomController.addAlertToDom(alert);
    if (config?.autodismiss) {
      setTimeout(() => {
        this.dismiss(alert.id);
      }, config?.duration ?? this._alertDuration);
    }
    return alert;
  }
}
