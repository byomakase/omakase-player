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

import {BrowserProvider} from './common/browser-provider';
import type {PlayerPlayback} from './player';

export const TEMPORAL = {
  timedItemsMillisPrecision: 3
}

export const REMOTING = {
  detachedBroadcastChannelId: '_ompBroadcastChannel',
  handshakeTopicPart: '_handshakeTopic',
  host: {
    heartbeatCheckInterval: 1000,
    heartbeatFailureTimeDiffThreshold: 2001,
    heartbeatFailuresNumberThreshold: 5,
    requestConnectTimeout: 1000 * 5,
  },
  client: {
    connectionRetryInterval: 1000,
    maxConnectionAttempts: 10,
    heartbeatInterval: 1000,
    heartbeatTimeout: 2000,
    maxHeartbeatTimeouts: 3,
  },
} as const;

export const PLAYER_CONTROLLER_DEFAULTS = {
  volume: 1,
  playbackRate: 1,
  pausingPauseTimeout: 3000,
  playbackRateUpdateTimeout: 60000,
  frameDurationSpillOverCorrection: 0.001,
  muted: false,
  MP4: {
    audioLabel: 'Default',
  },
  HLS: {
    audioTrackSwitchTimeout: 20000,
    textTrackSwitchTimeout: 5000,
  },
  AUDIO: {
    audioLabel: 'Default',
  },
} as const;

export const AUDIO_DEFAULTS = {
  volume: PLAYER_CONTROLLER_DEFAULTS.volume,
  muted: PLAYER_CONTROLLER_DEFAULTS.muted,

  channels: 2,

  sidecarAudioDriftCorrection: BrowserProvider.instance.isFirefox ? 0.04 : 0.01,
};

export const PLAYER_PLAYBACK_DEFAULT: PlayerPlayback = {
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
};

export const TIMELINE = {
  positionTopLeft: {
    x: 0,
    y: 0,
  },
  dimensionZero: {
    width: 0,
    height: 0,
  },
  twoPiRadians: Math.PI * 2,
  goldenRatio: (1 + Math.sqrt(5)) / 2,
  fillLinearGradientAudioPeak: [0, '#F58428', 0.33, '#FCD151', 0.5, '#FFF263', 0.59, '#DEE666', 0.78, '#A2D06C', 0.93, '#7DC370', 1, '#6FBE72'],
  descriptionMaxLength: 100,
  easingDuration: 300,
  defaultColor: 'teal'
};
