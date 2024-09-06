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

import { DomUtil } from '../util/dom-util';
import { AlertsController } from './alerts-controller';
import { Alert } from './model';

export class AlertsDomController {
  private _alertsController!: AlertsController;
  private _maxAlertCount = 5;
  private _maxStackCount = 3;

  constructor(
    alertsController: AlertsController
  ) {
    this._alertsController = alertsController;
  }

  addAlertToDom(alert: Alert) {
    const alertElement = DomUtil.createElement('div');
    alertElement.classList.add('omakase-alert', alert.type);
    alertElement.id = alert.id;
    const iconElement = DomUtil.createElement('i');
    iconElement.classList.add('omakase-alert-icon', `icon-${alert.type}`);
    const textElement = DomUtil.createElement('div');
    textElement.classList.add('alert-text');
    textElement.innerText = alert.text;
    const closeElement = DomUtil.createElement('i');
    closeElement.classList.add('omakase-alert-icon', 'icon-close');
    closeElement.onclick = (e) => {
      e.stopPropagation();
      this._alertsController.dismiss(alert.id);
    };
    alertElement.appendChild(iconElement);
    alertElement.appendChild(textElement);
    alertElement.appendChild(closeElement);
    DomUtil.getElementByClass<HTMLDivElement>('omakase-player-alerts')?.appendChild(alertElement);
    this.stackAlertsInDom();
  }

  removeAlertFromDom(alert: Alert) {
    const alertElement = DomUtil.getElementById<HTMLDivElement>(alert.id);
    if (alertElement) {
        DomUtil.getElementByClass<HTMLDivElement>('omakase-player-alerts')?.removeChild(alertElement);
    }
    this.stackAlertsInDom();
  }

  updateAlertInDom(alert: Alert) {
    const alertElement = DomUtil.getElementById<HTMLDivElement>(alert.id);
    if (alertElement) {
        const textElement = DomUtil.getElementByClass<HTMLDivElement>('alert-text', alertElement);
        textElement.innerText = alert.text;
    }
    const alertIndex = this._alertsController.alerts.indexOf(alert);
    if (alertIndex < this._alertsController.alerts.length - 1) {
      this._alertsController.alerts.splice(this._alertsController.alerts.indexOf(alert), 1);
      this._alertsController.alerts.push(alert);
      this.moveAlertToEndInDom(alert);
    }
  }

  stackAlertsInDom() {
    let stackCount = 0;
    for (let i = 1; i <= this._alertsController.alerts.length; i++) {
      const alert = this._alertsController.alerts[this._alertsController.alerts.length - i];
      const alertElement = DomUtil.getElementById<HTMLDivElement>(alert.id);
      if (!alertElement) {
        continue;
      }
      if (i <= this._maxAlertCount) {
        alertElement.classList.remove('alert-stack', 'alert-hide');
        alertElement.style.left = '0';
        alertElement.style.top = '0';
      } else if (i < this._maxAlertCount + this._maxStackCount) {
        stackCount++;
        alertElement.classList.add('alert-stack');
        alertElement.style.left = -5 * stackCount + 'px';
        alertElement.style.top = -5 * stackCount + 'px';
      } else {
        alertElement.classList.add('alert-hide');
      }
    }
  }

  moveAlertToEndInDom(alert: Alert) {
    const alertElement = DomUtil.getElementById<HTMLDivElement>(alert.id);
    if (alertElement) {
        DomUtil.getElementByClass<HTMLDivElement>('omakase-player-alerts')?.appendChild(alertElement);
    }
    this.stackAlertsInDom();
  }
}
