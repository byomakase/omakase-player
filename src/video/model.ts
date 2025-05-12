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

import {OmpAudioTrack} from '../types';
import {OmpAudioEffectsGraphDef} from '../audio';

export type VideoProtocol = 'hls' | 'native';

export interface Video {
  sourceUrl: string;
  frameRate: number;
  dropFrame: boolean;
  duration: number;
  totalFrames: number;
  protocol: VideoProtocol;

  /**
   * Frame duration in seconds
   * @private
   */
  frameDuration: number;

  /**
   * Time offset incurred by init segment
   * @private
   */
  initSegmentTimeOffset?: number;

  audioOnly: boolean;

  /**
   * Is DRM applied
   */
  drm: boolean;

  /**
   * Corrected duration field may be updated once when:
   *  * video element changes video duration
   *  * video ends on bare start of the last frame, which might not exist in that moment
   *  * last hls segment ends of different time than it was initially calculated
   *
   * @private correctedDuration
   */
  correctedDuration?: number;

  /**
   * Timecode offset
   */
  ffomTimecodeObject?: TimecodeObject;
}

export interface TimecodeObject {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  dropFrame: boolean;
  audioOnly: boolean;
}

export interface PlaybackState {
  playing: boolean;
  pausing: boolean;
  paused: boolean;
  waiting: boolean;
  seeking: boolean;
  buffering: boolean;
  ended: boolean;
}

export interface VideoLoadOptions {
  /**
   * Video frame rate
   */
  frameRate?: number | string;

  /**
   * Set video duration explicitly
   */
  duration?: number;

  /**
   * Time offset timecode
   */
  ffom?: string;

  /**
   * Is frame rate with drop frame or not
   */
  dropFrame?: boolean;

  /**
   * Set to force video protocol loader, it will be set automatically otherwise
   */
  protocol?: VideoProtocol;

  /**
   * Arbitrary key-value data provided on video load. Can be used to storevalues such as DRM tokens.
   */
  data?: Record<string, any>;
}

/**
 * @internal
 */
export interface VideoLoadOptionsInternal {
  /**
   * Active {@link VideoWindowPlaybackState} when video loaded started
   * @internal
   */
  videoWindowPlaybackState: VideoWindowPlaybackState;
}

export interface FrameRateModel {
  value: number;
  fraction?: string;
  dropFrameEnabled: boolean;
  dropFramesOnMinute?: number;
}

export interface VideoSafeZone {
  id?: string;

  /**
   * If provided {@link aspectRatio} will be ignored
   */
  topRightBottomLeftPercent?: number[];

  /**
   * Aspect ratio for safe zone
   */
  aspectRatio?: string;

  /**
   * If used {@link aspectRatio} must be provided
   */
  scalePercent?: number;

  htmlId?: string;
  htmlClass?: string;
}

export type VideoWindowPlaybackState = 'detaching' | 'detached' | 'attaching' | 'attached';

/**
 * Audio peak processing strategy
 */
export type AudioMeterStandard = 'peak-sample' | 'true-peak';

export interface BufferedTimespan {
  start: number;
  end: number;
}

export interface OmpAudioState {
  /**
   * Audio router state
   */
  audioRouterState: OmpAudioRouterState | undefined;

  /**
   * Main audio peak processor state
   */
  audioPeakProcessorState: OmpAudioPeakProcessorState | undefined;

  /**
   * Source audio node channel count
   */
  numberOfChannels: number;
}

export interface OmpAudioInputSoloMuteState {
  /**
   * Audio router input state
   */
  audioRouterInputSoloMuteState: OmpAudioRouterInputSoloMuteState | undefined;
}

/**
 * Main audio state
 */
export interface OmpMainAudioState extends OmpAudioState {}

export interface OmpMainAudioInputSoloMuteState extends OmpAudioInputSoloMuteState {}

/**
 * Sidecar audio state
 */
export interface OmpSidecarAudioState extends OmpAudioState {
  /**
   * Sidecar audio track
   */
  audioTrack: OmpAudioTrack;

  /**
   * Number of channels from {@link AudioBuffer}.numberOfChannels From {@link AudioBuffer} in which sidecar audio is loaded
   */
  numberOfChannels: number;

  /**
   * Audio volume level
   */
  volume: number;

  /**
   * Is audio muted
   */
  muted: boolean;
}

export interface OmpSidecarAudioInputSoloMuteState extends OmpAudioInputSoloMuteState {
  /**
   * Sidecar audio track
   */
  audioTrack: OmpAudioTrack;
}

/**
 * Describes routing path - channel splitter output and channel merger input
 */
export interface OmpAudioRoutingPath {
  /**
   * Input - Channel splitter output
   */
  input: number;

  /**
   * Output - Channel merger input
   */
  output: number;
}

/**
 * Describes {@ OmpAudioRoutingPoint} connection status - connected or disconnected
 */
export interface OmpAudioRoutingConnection {
  /**
   * Routing path - channel splitter output and channel merger input
   */
  path: OmpAudioRoutingPath;

  /**
   * Connected status, true = connected, false = disconnected
   */
  connected: boolean;
}

/**
 * Describes state on {@link OmpAudioRoutingPath}
 */
export interface OmpAudioRoutingRoute {
  /**
   * Routing path
   */
  path: OmpAudioRoutingPath;

  /**
   * Connection status
   */
  connection: OmpAudioRoutingConnection;

  /**
   * Audio graph definition
   */
  audioEffectsGraph: OmpAudioEffectsGraphDef | undefined;
}

/**
 * Audio router state
 */
export interface OmpAudioRouterState {
  /**
   * Number of audio inputs
   */
  inputsNumber: number;

  /**
   * Number of audio outputs
   */
  outputsNumber: number;

  /**
   * Audio routing matrix
   */
  routingConnections: OmpAudioRoutingConnection[][];

  /**
   * Audio router initial/default connections
   */
  initialRoutingConnections: OmpAudioRoutingConnection[];

  routingRoutes: OmpAudioRoutingRoute[];
}

/**
 * Peak processor state
 */
export interface OmpAudioPeakProcessorState {
  /**
   * Audio peak processing strategy
   */
  audioMeterStandard: AudioMeterStandard;
}

export interface OmpPeakProcessorDataMessage {
  type: 'message';
  message: number[][];
}

export interface OmpPeakProcessorDataPeaks {
  type: 'peaks';
  peaks: number[];
}

export interface OmpAudioRouterInputSoloMuteState {
  /**
   * Audio router input number
   */
  inputNumber: number;

  /**
   * Flag that tells if audio router input is soloed
   */
  soloed: boolean;

  /**
   * Flag that tells if audio router input is muted
   */
  muted: boolean;

  /**
   * Audio router soloed input connections
   */
  inputSoloedConnections: OmpAudioRoutingConnection[];

  /**
   * Audio router muted input connections
   */
  inputMutedConnections: OmpAudioRoutingConnection[];

  /**
   * Audio router connections before input solo action (current input connections are not included)
   */
  unsoloConnections: OmpAudioRoutingConnection[];
}

/**
 * Type of supported wrapped Web Audio API {@link AudioNode}.
 */
export type OmpAudioNodeType = 'gain' | 'delay';

/**
 * Wrapper for {@link AudioParam} attributes
 */
export interface OmpAudioNodeParamPropType {
  name: string;
  value: any;
}

/**
 * Wrapper for {@link AudioParam}
 */
export interface OmpAudioNodeParamType {
  name: string;
  props: OmpAudioNodeParamPropType[];
}
