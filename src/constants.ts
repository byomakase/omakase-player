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
  timedItemsMillisPrecision: 3,
  audioWaveformPrecision: 4,
  audioLevelsPrecision: 3,
};

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
    windowCloseCountdownSeconds: 10,
  },
} as const;

/**
 * Seek step playback - media element can't play backwards nor faster than {@link maxNativePlaybackRate}.
 * At such playback rates media element stays paused and is seeked to current time in steps, see {@link SeekStepper}.
 */
export const SEEK_STEP_PLAYBACK_DEFAULTS = {
  /** Lowest playback rate media element plays natively. */
  minNativePlaybackRate: 0.1,
  /** Highest playback rate media element plays natively, browsers don't play faster. */
  maxNativePlaybackRate: 16,
  /** Seconds of media time between seeks at 1x, multiplied by absolute playback rate, so that seeks are issued every this many seconds at any playback rate. */
  seekStep: 2,
  /** Minimum milliseconds between seeks, applies only to seek step shorter than it. */
  minSeekInterval: 500,
  /**
   * Milliseconds next seek waits for media element still seeking, seek not finished by then is considered stuck and replaced by next one.
   * Longer than seek step at 1x, so that seek in progress is not replaced as soon as next seek is due.
   */
  seekTimeout: 10000,
};

export const PLAYER_CONTROLLER_DEFAULTS = {
  volume: 1,
  playbackRate: 1,
  minPlaybackRate: 0.1,
  maxPlaybackRate: 16,
  pausingPauseTimeout: 3000,
  playbackRateUpdateTimeout: 60000,
  frameDurationSpillOverCorrection: 0.001,
  muted: false,
  /** Cadence for refreshing live state while playback is suspended */
  liveStateTickIntervalMs: 100,
  liveLeadingSegmentsCaptured: 6,
  /** Milliseconds threshold for detecting live pin. Shared by UI components - agreement what "at the live edge" means. */
  liveEdgeThreshold: 1000,
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

export const SIDECAR_VIDEO_DEFAULTS = {
  /** Number of drift samples averaged before drift correction is applied. */
  driftHistoryLength: 10,
  /** Average drift in seconds above which sidecar video playbackRate is adjusted to catch up with main media. */
  driftPlaybackRateThreshold: BrowserProvider.instance.isFirefox ? 0.04 : 0.02,
  /** Average drift in seconds above which sidecar video is hard seeked to main media. */
  driftSeekThreshold: 0.5,
  /** Maximum relative playbackRate adjustment applied while catching up with main media. */
  driftMaxPlaybackRateAdjustment: 0.1,
  /** Tolerance in seconds below which paused sidecar video is not seeked. */
  seekTolerance: 0.01,
  /** Interval in milliseconds of sidecar video buffering checks while main media is playing. */
  bufferingCheckInterval: 250,
  /** Seconds that have to be buffered ahead of sidecar video current time, when readyState doesn't report enough data. */
  bufferingRequiredAhead: 0.5,
  /** Seconds before time window start sidecar video starts playing hidden and muted, to pre-buffer and sync before its cut is shown. */
  warmUpDuration: 2,
  /**
   * Seconds before warm-up start dormant sidecar video is woken up - its source is attached again and data at warm-up start is loaded.
   * Scaled by playback rate.
   */
  wakeAhead: 8,
  /** Seconds after time window end sidecar video is kept awake, so scrubbing back over its end doesn't load it again. */
  keepAwakeAfter: 2,
  /** Seconds awake range is extended by before sidecar video is released, so main media time at range edge doesn't wake and release it repeatedly. */
  releaseHysteresis: 2,
  /** Milliseconds sidecar video waking up may take, after which it stays dormant and main media doesn't wait for it. */
  wakeTimeout: 10000,
  /** Seconds of awake priority sidecar video has to be ahead of awake one to take its slot, when awake sidecar videos are limited. */
  awakePreemptMargin: 1,
  /** Milliseconds active sidecar video may keep seeking inside its time window before seek is issued again, and then before it is reloaded. */
  seekWatchdogTimeout: 2000,
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

  mediaRotation: 0,
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
  defaultColor: 'teal',
};
