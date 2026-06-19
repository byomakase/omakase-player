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

import type {Serializable} from '../common/capabilities';
import {type WindowPlayback, WindowPlaybackMode} from '../common';
import type {ChromingSession, MediaLoadRequest, PlayerSession} from './session-store';
import type {AlertState} from './alerts-api';

export enum SessionEventType {
  SESSION_WINDOW_PLAYBACK_UPDATED = 'SESSION_WINDOW_PLAYBACK_UPDATED',
  SESSION_WINDOW_PLAYBACK_MODE_CHANGE_REQUEST = 'SESSION_WINDOW_PLAYBACK_MODE_CHANGE_REQUEST',

  SESSION_PLAYER_UPDATED = 'SESSION_PLAYER_UPDATED',
  SESSION_CHROMING_UPDATED = 'SESSION_CHROMING_UPDATED',
  SESSION_MEDIA_LOAD_REQUESTS_UPDATED = 'SESSION_MEDIA_LOAD_REQUESTS_UPDATED',
  SESSION_ALERTS_UPDATED = 'SESSION_ALERTS_UPDATED',
}

export interface SessionEventData extends Serializable {}

export type SessionEventTypeDataMap = {
  [SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED]: {
    windowPlayback: WindowPlayback;
  };
  [SessionEventType.SESSION_WINDOW_PLAYBACK_MODE_CHANGE_REQUEST]: {
    mode: WindowPlaybackMode;
  };
  [SessionEventType.SESSION_PLAYER_UPDATED]: {
    player: PlayerSession | undefined;
  };

  [SessionEventType.SESSION_CHROMING_UPDATED]: {
    chroming: ChromingSession | undefined;
  };

  [SessionEventType.SESSION_MEDIA_LOAD_REQUESTS_UPDATED]: {
    mediaLoadRequests: MediaLoadRequest[];
  };

  [SessionEventType.SESSION_ALERTS_UPDATED]: {
    alerts: AlertState[];
  };
};

export type SessionEvent = {
  [K in SessionEventType]: {
    type: K;
    data: SessionEventTypeDataMap[K];
  };
}[keyof SessionEventTypeDataMap];
