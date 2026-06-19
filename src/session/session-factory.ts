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

import {PLAYER_CONTROLLER_DEFAULTS} from '../constants';
import {ChromingTheme} from '../chroming';
import type {ChromingSession, PlayerSession, SessionState} from './session-store';
import {WindowPlaybackMode} from '../common';

export class SessionFactory {
  static createEmptySession(): SessionState {
    return {
      isDetachable: false,
      windowPlayback: {
        mode: WindowPlaybackMode.ATTACHED,
        canDetach: false,
        canAttach: false,
      },
      mediaLoadRequests: [],
      alerts: [],
      player: SessionFactory.createEmptyPlayerSession(),
      chroming: SessionFactory.createEmptyChromingSession(),
    };
  }

  static createEmptyPlayerSession(): PlayerSession {
    return {
      mainMediaId: void 0,
      playback: {
        playing: false,
        paused: true,
        pausing: false,
        waiting: false,
        seeking: false,
        buffering: false,
        ended: false,
        waitingSyncedMedia: false,

        currentTime: 0,
        playbackRate: PLAYER_CONTROLLER_DEFAULTS.playbackRate,

        bufferedTimeRanges: [],
      },
      audio: void 0,
      text: void 0,
    };
  }

  static createEmptyChromingSession(): ChromingSession {
    return {
      theme: ChromingTheme.DEFAULT,
      themeConfig: void 0,
      watermark: void 0,
      safeZones: [],
      helpMenuGroups: [],
      progressBarMarkerBar: void 0,
      markerBars: [],
      thumbnailTrackId: void 0,
    };
  }
}
