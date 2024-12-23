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

import {Api} from './api';
import {Observable} from 'rxjs';
import {AudioContextChangeEvent, AudioLoadedEvent, AudioPeakProcessorWorkletNodeMessageEvent, AudioRoutingEvent, AudioSwitchedEvent, OmakaseAudioTrack} from '../types';
import {AudioInputOutputNode, AudioMeterStandard} from '../video/model';

export interface AudioApi extends Api {
  /**
   * Fires on subtitles load. Initial value is undefined.
   * Always emits the current value on subscription.
   *
   * @readonly
   */
  onAudioLoaded$: Observable<AudioLoadedEvent | undefined>;

  /**
   *  Fires on audio track switched
   *  @readonly
   */
  onAudioSwitched$: Observable<AudioSwitchedEvent>;

  /**
   * Fires on AudioContext creation
   * @readonly
   */
  onAudioContextChange$: Observable<AudioContextChangeEvent>;

  /**
   * Fires on audio input / output channel connection change
   * @readonly
   */
  onAudioRouting$: Observable<AudioRoutingEvent>;

  /**
   * Fires on event produced by {@link AudioWorkletNode} created with {@link createAudioPeakProcessorWorkletNode}
   * @readonly
   */
  onAudioPeakProcessorWorkletNodeMessage$: Observable<AudioPeakProcessorWorkletNodeMessageEvent>;

  /**
   * @returns available audio tracks
   */
  getAudioTracks(): OmakaseAudioTrack[];

  /**
   * @returns current active audio track
   */
  getActiveAudioTrack(): OmakaseAudioTrack | undefined;

  /**
   * Sets active audio track
   * @param id {@link OmakaseAudioTrack} id
   */
  setActiveAudioTrack(id: string): Observable<void>;

  /**
   * @returns {@link AudioContext} if created
   */
  getAudioContext(): AudioContext | undefined;

  /**
   * @returns {@link MediaElementAudioSourceNode} implicitly created on <video> element when {@link AudioContext} is created
   */
  getMediaElementAudioSourceNode(): MediaElementAudioSourceNode | undefined;

  /**
   * Creates AudioContext. {@link AudioContext}.resume() is invoked on first video play
   * @param contextOptions
   */
  createAudioContext(contextOptions?: AudioContextOptions): Observable<void>;

  /**
   * Creates AudioSplitterNode and AudioMergerMode configured for routing between {@link inputsNumber} and {@link outputsNumber}.
   *
   * @param inputsNumber Number of input channels. Implicitly created {@link ChannelSplitterNode} is configured with {@link inputsNumber}.
   * @param outputsNumber Number of output channels. Implicitly created {@link ChannelMergerNode} is configured with {@link outputsNumber}. If not provided {@link outputsNumber} is resolved by calling defaultAudioOutputsResolver function:
   * <pre>
   * const defaultAudioOutputsResolver: (maxChannelCount: number) => number = (maxChannelCount: number) => {
   *   if (maxChannelCount <= 1) {
   *     return 1;
   *   } else if (maxChannelCount >= 2 && maxChannelCount <= 5) {
   *     return 2
   *   } else if (maxChannelCount >= 6) {
   *     return 6
   *   } else {
   *     return maxChannelCount;
   *   }
   * }
   * </pre>
   */
  createAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<void>;

  /**
   * Creates AudioContext. {@link AudioContext}.resume() is invoked on first video play
   *
   * @param inputsNumber See {@link createAudioRouter}
   * @param outputsNumberResolver Function to resolve outputsNumber. Provides {@link AudioContext}.destination.maxChannelCount as input argument
   */
  createAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<void>;

  /**
   * @returns Matrix of {@link AudioInputOutputNode}s
   */
  getAudioInputOutputNodes(): AudioInputOutputNode[][];

  /**
   * Routes (connects or disconnects) provided {@link AudioInputOutputNode} (connects it or disconnects it)
   * @param newAudioInputOutputNode
   */
  routeAudioInputOutputNode(newAudioInputOutputNode: AudioInputOutputNode): Observable<void>;

  /**
   * Routes multiple {@link AudioInputOutputNode}
   * @param newAudioInputOutputNodes
   */
  routeAudioInputOutputNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void>;

  /**
   * Creates {@link AudioWorkletNode} and attaches it to {@link AudioContext} input. It can be used for audio peak processing and gathering live volume levels data
   */
  createAudioPeakProcessorWorkletNode(audioMeterStandard: AudioMeterStandard): Observable<void>;
}
