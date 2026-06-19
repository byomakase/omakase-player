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

import type {Destroyable, Serializable} from '../common/capabilities';
import {Observable, Subject, takeUntil} from 'rxjs';
import {errorCompleteObserver, freeObserver, nextCompleteObserver} from '../util/rxjs-util';
import {BlobUtil} from '../util/blob-util';
import {ObserverBreaker} from '../common/observer-breaker';

// import workers for audio processing
// @ts-ignore
import peakSampleProcessor from '../worker/peak-sample-audio-worklet-processor.js?raw';
// @ts-ignore
import truePeakProcessor from '../worker/true-peak-audio-worklet-processor.js?raw';
import {OpStage, type OpStageState} from '../common/op-stage';
import {WorkerUtil} from '../worker/worker-util';
import {OmakaseAudioContextProvider} from '../omakase-audio-context-provider';

export enum AudioPeakProcessorEventType {
  AUDIO_PEAK_PROCESSOR_LOADING = 'AUDIO_PEAK_PROCESSOR_LOADING',
  AUDIO_PEAK_PROCESSOR_LOADED = 'AUDIO_PEAK_PROCESSOR_LOADED',
  AUDIO_PEAK_PROCESSOR_LOAD_ERROR = 'AUDIO_PEAK_PROCESSOR_LOAD_ERROR',

  AUDIO_PEAK_PROCESSOR_MESSAGE = 'AUDIO_PEAK_PROCESSOR_MESSAGE',
}

export interface AudioPeakProcessorEventData extends Serializable {}

export interface AudioPeakProcessorErrorEventData extends AudioPeakProcessorEventData {
  error: string | undefined;
}

export interface AudioPeakProcessorMessageMessage {
  type: 'message';
  message: number[][];
}

export interface AudioPeakProcessorPeaksMessage {
  type: 'peaks';
  peaks: number[];
}

export type AudioPeakProcessorMessage = AudioPeakProcessorMessageMessage | AudioPeakProcessorPeaksMessage;

export type AudioPeakProcessorEventTypeDataMap = {
  [AudioPeakProcessorEventType.AUDIO_PEAK_PROCESSOR_LOADING]: AudioPeakProcessorEventData;
  [AudioPeakProcessorEventType.AUDIO_PEAK_PROCESSOR_LOADED]: AudioPeakProcessorEventData;
  [AudioPeakProcessorEventType.AUDIO_PEAK_PROCESSOR_LOAD_ERROR]: AudioPeakProcessorErrorEventData;

  [AudioPeakProcessorEventType.AUDIO_PEAK_PROCESSOR_MESSAGE]: AudioPeakProcessorMessage;
};

export type AudioPeakProcessorEvent = {
  [K in AudioPeakProcessorEventType]: {
    type: K;
    data: AudioPeakProcessorEventTypeDataMap[K];
  };
}[keyof AudioPeakProcessorEventTypeDataMap];

export enum AudioPeakProcessorMeterStandard {
  PEAK_SAMPLE = 'PEAK_SAMPLE',
  TRUE_PEAK = 'TRUE_PEAK',
}

export interface AudioPeakProcessorState {
  /**
   * Audio peak processing strategy
   */
  meterStandard: AudioPeakProcessorMeterStandard;

  loadStage: OpStageState;
}

export interface AudioPeakProcessorApi extends Destroyable {
  onEvent$: Observable<AudioPeakProcessorEvent>;

  state: AudioPeakProcessorState;

  load(audioNode: AudioNode): Observable<void>;
}

export class AudioPeakProcessor implements AudioPeakProcessorApi {
  protected readonly _onEvent$: Subject<AudioPeakProcessorEvent> = new Subject<AudioPeakProcessorEvent>();

  protected readonly _meterStandard: AudioPeakProcessorMeterStandard;
  protected readonly _loadStage: OpStage;

  protected _audioWorkletNode?: AudioWorkletNode;
  protected _audioNode?: AudioNode;

  protected _destroyBreaker = new ObserverBreaker();

  constructor(meterStandard?: AudioPeakProcessorMeterStandard) {
    this._meterStandard = meterStandard ? meterStandard : AudioPeakProcessorMeterStandard.PEAK_SAMPLE;

    this._loadStage = new OpStage();
  }

  load(audioNode: AudioNode): Observable<void> {
    return new Observable<void>((observer) => {
      this._loadStage.start();
      this._onEvent$.next({
        type: AudioPeakProcessorEventType.AUDIO_PEAK_PROCESSOR_LOADING,
        data: {},
      });

      let createAudioWorkletNode: () => Observable<AudioWorkletNode> = () => {
        return new Observable((observer) => {
          let audioWorkletNodeName: string;
          switch (this._meterStandard) {
            case AudioPeakProcessorMeterStandard.TRUE_PEAK:
              audioWorkletNodeName = 'peak-sample-audio-worklet-processor';
              break;
            case AudioPeakProcessorMeterStandard.PEAK_SAMPLE:
              audioWorkletNodeName = 'true-peak-audio-worklet-processor';
              break;
            default:
              throw new Error('Unknown meterStandard');
          }

          try {
            let audioWorkletNode = new AudioWorkletNode(OmakaseAudioContextProvider.audioContext, audioWorkletNodeName, {
              parameterData: {},
            });
            nextCompleteObserver(observer, audioWorkletNode);
          } catch (e) {
            let workletCode;

            switch (this._meterStandard) {
              case AudioPeakProcessorMeterStandard.TRUE_PEAK:
                workletCode = truePeakProcessor;
                break;
              case AudioPeakProcessorMeterStandard.PEAK_SAMPLE:
                workletCode = truePeakProcessor;
                break;
              default:
                throw new Error('Unknown meterStandard');
            }

            let objectURL = BlobUtil.createObjectURL(BlobUtil.createBlob([workletCode], {type: 'application/javascript'}));

            OmakaseAudioContextProvider.audioContext.audioWorklet.addModule(objectURL).then(() => {
              let audioWorkletNode = new AudioWorkletNode(OmakaseAudioContextProvider.audioContext, audioWorkletNodeName, {
                parameterData: {},
              });
              nextCompleteObserver(observer, audioWorkletNode);
            });
          }
        });
      };

      createAudioWorkletNode()
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (audioWorkletNode) => {
            this._audioWorkletNode = audioWorkletNode;
            this._audioWorkletNode.port.onmessage = (event: MessageEvent) => {
              this.handleAudioPeakProcessorMessage(event);
            };

            // connect source audio node
            this._audioNode = audioNode;
            this._audioNode.connect(this._audioWorkletNode).connect(this._audioNode.context.destination);

            this._loadStage.success();
            this._onEvent$.next({
              type: AudioPeakProcessorEventType.AUDIO_PEAK_PROCESSOR_LOADED,
              data: {},
            });
            nextCompleteObserver(observer);
          },
          error: (error) => {
            this._loadStage.failure(error);
            this._onEvent$.next({
              type: AudioPeakProcessorEventType.AUDIO_PEAK_PROCESSOR_LOAD_ERROR,
              data: {
                error: error,
              },
            });
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  protected handleAudioPeakProcessorMessage = (event: MessageEvent) => {
    this._onEvent$.next({
      type: AudioPeakProcessorEventType.AUDIO_PEAK_PROCESSOR_MESSAGE,
      data: event.data,
    });
  };

  get onEvent$(): Observable<AudioPeakProcessorEvent> {
    return this._onEvent$.asObservable();
  }

  get state(): AudioPeakProcessorState {
    return {
      meterStandard: this._meterStandard,
      loadStage: this._loadStage.state,
    };
  }

  destroy() {
    this._destroyBreaker.destroy();

    if (this._audioNode && this._audioWorkletNode) {
      try {
        this._audioNode?.disconnect(this._audioWorkletNode);
      } catch (e) {
        // nop
      }
      WorkerUtil.dispose(this._audioWorkletNode);
    }

    freeObserver(this._onEvent$);
  }
}
