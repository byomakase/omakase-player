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

import {AudioApi} from '../api';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {AudioContextChangeEvent, AudioLoadedEvent, AudioRoutingEvent, AudioSwitchedEvent, AudioPeakProcessorWorkletNodeMessageEvent, Destroyable, OmakaseAudioTrack} from '../types';
import {VideoControllerApi} from '../video';
import {AudioInputOutputNode, AudioMeterStandard} from '../video/model';

export class AudioController implements AudioApi, Destroyable {
  public readonly onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined> = new BehaviorSubject<AudioLoadedEvent | undefined>(void 0);
  public readonly onAudioSwitched$: Observable<AudioSwitchedEvent> = new Subject<AudioSwitchedEvent>();
  public readonly onAudioContextChange$: Observable<AudioContextChangeEvent> = new Subject<AudioContextChangeEvent>();
  public readonly onAudioRouting$: Observable<AudioRoutingEvent> = new Subject<AudioRoutingEvent>();
  public readonly onAudioPeakProcessorWorkletNodeMessage$: Observable<AudioPeakProcessorWorkletNodeMessageEvent> = new Subject<AudioPeakProcessorWorkletNodeMessageEvent>();

  protected _videoController: VideoControllerApi;

  constructor(videoController: VideoControllerApi) {
    this._videoController = videoController;

    this.onAudioLoaded$ = this._videoController.onAudioLoaded$;
    this.onAudioSwitched$ = this._videoController.onAudioSwitched$;
    this.onAudioContextChange$ = this._videoController.onAudioContextChange$;
    this.onAudioRouting$ = this._videoController.onAudioRouting$;
    this.onAudioPeakProcessorWorkletNodeMessage$ = this._videoController.onAudioPeakProcessorWorkletNodeMessage$;
  }

  getActiveAudioTrack(): OmakaseAudioTrack | undefined {
    return this._videoController.getActiveAudioTrack();
  }

  getAudioTracks(): OmakaseAudioTrack[] {
    return this._videoController.getAudioTracks();
  }

  setActiveAudioTrack(id: string): Observable<void> {
    return this._videoController.setActiveAudioTrack(id);
  }

  getAudioContext(): AudioContext | undefined {
    return this._videoController.getAudioContext();
  }

  getMediaElementAudioSourceNode(): MediaElementAudioSourceNode | undefined {
    return this._videoController.getMediaElementAudioSourceNode();
  }

  createAudioContext(contextOptions?: AudioContextOptions): Observable<void> {
    return this._videoController.createAudioContext(contextOptions);
  }

  createAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<void> {
    return this._videoController.createAudioRouter(inputsNumber, outputsNumber);
  }

  createAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<void> {
    return this._videoController.createAudioRouterWithOutputsResolver(inputsNumber, outputsNumberResolver);
  }

  getAudioInputOutputNodes(): AudioInputOutputNode[][] {
    return this._videoController.getAudioInputOutputNodes();
  }

  routeAudioInputOutputNode(newAudioInputOutputNode: AudioInputOutputNode): Observable<void> {
    return this._videoController.routeAudioInputOutputNode(newAudioInputOutputNode);
  }

  routeAudioInputOutputNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void> {
    return this._videoController.routeAudioInputOutputNodes(newAudioInputOutputNodes);
  }

  createAudioPeakProcessorWorkletNode(audioMeterStandard: AudioMeterStandard): Observable<void> {
    return this._videoController.createAudioPeakProcessorWorkletNode(audioMeterStandard);
  }

  destroy() {}
}
