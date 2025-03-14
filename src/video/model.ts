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

import {BehaviorSubject, Subject} from 'rxjs';
import {OmpAudioTrack} from '../types';

export type VideoProtocol = 'hls' | 'native';

export interface Video {
  sourceUrl: string;
  frameRate: number;
  dropFrame: boolean;
  duration: number;
  totalFrames: number;

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

export class PlaybackStateMachine {
  public readonly onChange$: Subject<PlaybackState>;

  private _state: PlaybackState = {
    playing: false,
    paused: true,
    pausing: false,
    waiting: false,
    seeking: false,
    buffering: false,
    ended: false,
  };

  constructor() {
    this.onChange$ = new BehaviorSubject(this._state);
  }

  private updateState(partialState: Partial<PlaybackState>) {
    let newState = {
      ...this._state,
      ...partialState,
    };
    let isEqual = this.compare(this._state, newState) === 0;
    this._state = newState;
    if (!isEqual) {
      this.onChange$.next(this._state);
    }
  }

  private compare(o1: PlaybackState, o2: PlaybackState): number {
    return o1.playing === o2.playing &&
      o1.paused === o2.paused &&
      o1.pausing === o2.pausing &&
      o1.waiting === o2.waiting &&
      o1.seeking === o2.seeking &&
      o1.buffering === o2.buffering &&
      o1.ended === o2.ended
      ? 0
      : -1;
  }

  get state(): PlaybackState {
    return this._state;
  }

  setPlaying() {
    this.updateState({
      playing: true,
      paused: false,
      pausing: false,
      waiting: false,
      seeking: false,
      buffering: false,
      ended: false,
    });
  }

  setPaused() {
    this.updateState({
      playing: false,
      paused: true,
      pausing: false,
      waiting: false,
      seeking: false,
      buffering: false,
      ended: false,
    });
  }

  get pausing(): boolean {
    return this._state.pausing;
  }

  setPausing() {
    this.updateState({
      pausing: true,
    });
  }

  setEnded() {
    this.updateState({
      playing: false,
      paused: true,
      pausing: false,
      waiting: false,
      seeking: false,
      buffering: false,
      ended: true,
    });
  }

  get waiting(): boolean {
    return this._state.waiting;
  }

  set waiting(value: boolean) {
    this.updateState({
      waiting: value,
    });
  }

  get seeking(): boolean {
    return this._state.seeking;
  }

  set seeking(value: boolean) {
    this.updateState({
      seeking: value,
      pausing: false,
      ended: false,
    });
  }

  get buffering(): boolean {
    return this._state.buffering;
  }

  set buffering(value: boolean) {
    this.updateState({
      buffering: value,
    });
  }
}

export interface VideoLoadOptions {
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
 * Represents connected or disconnected {@link AudioNode} or input-output point
 */
export interface AudioInputOutputNode {
  /**
   * Input
   */
  inputNumber: number;

  /**
   * Output
   */
  outputNumber: number;

  /**
   * Connected status, true = connected, false = not connected
   */
  connected: boolean;
}

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

/**
 * Main audio state
 */
export interface OmpMainAudioState extends OmpAudioState {}

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
  audioInputOutputNodes: AudioInputOutputNode[][];
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
