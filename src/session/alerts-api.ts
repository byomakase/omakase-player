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

import {Observable} from 'rxjs';

export interface AlertConfig {
  /** Display duration in milliseconds. Undefined means the alert persists until dismissed. */
  duration?: number;
}

export type AlertEvent = {
  [K in AlertEventType]: {
    type: K;
    data: AlertEventTypeDataMap[K];
  };
}[keyof AlertEventTypeDataMap];

export interface AlertsApi {
  /** Emits an event whenever an alert is raised or dismissed. */
  onEvent$: Observable<AlertEvent>;

  /**
   * Raises an info alert.
   *
   * @param message - The message to display.
   * @param config - Optional display configuration (e.g. auto-dismiss duration).
   * @returns The unique ID of the created alert.
   */
  info(message: string, config?: AlertConfig): Alert['id'];

  /**
   * Raises a warning alert.
   *
   * @param message - The message to display.
   * @param config - Optional display configuration (e.g. auto-dismiss duration).
   * @returns The unique ID of the created alert.
   */
  warn(message: string, config?: AlertConfig): Alert['id'];

  /**
   * Raises an error alert.
   *
   * @param message - The message to display.
   * @param config - Optional display configuration (e.g. auto-dismiss duration).
   * @returns The unique ID of the created alert.
   */
  error(message: string, config?: AlertConfig): Alert['id'];

  /**
   * Dismisses the alert with the given ID.
   *
   * @param id - The ID of the alert to dismiss.
   */
  dismiss(id: Alert['id']): void;

  /** Dismisses all currently active alerts. */
  dismissAll(): void;
}

export enum AlertLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface AlertState {
  id: string;
  level: AlertLevel;
  message: string;
  timestamp: Date;
  config: AlertConfig | undefined;
}

export interface Alert {
  readonly id: string;
  readonly level: AlertLevel;
  readonly message: string;
  readonly timestamp: Date;
  readonly config: AlertConfig | undefined;
  readonly state: AlertState;
}

export enum AlertEventType {
  ALERT_RAISED = 'ALERT_RAISED',
  ALERT_DISMISSED = 'ALERT_DISMISSED',
}

export interface AlertEventData {
  alert: Alert;
}

export type AlertEventTypeDataMap = {
  [AlertEventType.ALERT_RAISED]: AlertEventData;
  [AlertEventType.ALERT_DISMISSED]: AlertEventData;
};
