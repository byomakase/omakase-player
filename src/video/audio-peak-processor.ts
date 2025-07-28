/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

import {AudioPeakProcessorMessageEvent, Destroyable} from '../types';
import {BehaviorSubject, Observable, Subject, takeUntil} from 'rxjs';
import {AudioMeterStandard, OmpAudioPeakProcessorState} from './model';
import {completeUnsubscribeSubjects, nextCompleteObserver, nextCompleteSubject} from '../util/rxjs-util';
import {BlobUtil} from '../util/blob-util';

// import workers for audio processing
// @ts-ignore
import peakSampleProcessor from '../worker/omp-peak-sample-processor.js?raw';
// @ts-ignore
import truePeakProcessor from '../worker/omp-true-peak-processor.js?raw';
import {AudioPeakProcessorApi} from '../api/audio-peak-processor-api';

export class OmpAudioPeakProcessor implements AudioPeakProcessorApi, Destroyable {
  public readonly onAudioWorkletLoaded$: BehaviorSubject<AudioWorkletNode | undefined> = new BehaviorSubject<AudioWorkletNode | undefined>(void 0);
  public readonly onMessage$: Subject<AudioPeakProcessorMessageEvent> = new Subject<AudioPeakProcessorMessageEvent>();

  protected _audioMeterStandard: AudioMeterStandard;

  protected _sourceAudioNode?: AudioNode;
  protected _audioWorkletNode?: AudioWorkletNode;

  protected _destroyed$ = new Subject<void>();

  constructor(audioContext: AudioContext, audioMeterStandard?: AudioMeterStandard) {
    this._audioMeterStandard = audioMeterStandard ? audioMeterStandard : 'peak-sample';

    this.init(audioContext);
  }

  protected init(audioContext: AudioContext) {
    let createAudioWorkletNode: () => Observable<AudioWorkletNode> = () => {
      return new Observable((observer) => {
        let audioWorkletNodeName = `omp-${this._audioMeterStandard}-processor`; // name unique to omakase-player
        try {
          let audioWorkletNode = new AudioWorkletNode(audioContext, audioWorkletNodeName, {
            parameterData: {},
          });
          nextCompleteObserver(observer, audioWorkletNode);
        } catch (e) {
          const workletCode = this._audioMeterStandard === 'true-peak' ? truePeakProcessor : peakSampleProcessor;
          let objectURL = BlobUtil.createObjectURL(BlobUtil.createBlob([workletCode], {type: 'application/javascript'}));

          audioContext.audioWorklet.addModule(objectURL).then(() => {
            let audioWorkletNode = new AudioWorkletNode(audioContext, audioWorkletNodeName, {
              parameterData: {},
            });
            nextCompleteObserver(observer, audioWorkletNode);
          });
        }
      });
    };

    createAudioWorkletNode()
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (audioWorkletNode) => {
          this._audioWorkletNode = audioWorkletNode;
          this._audioWorkletNode.port.onmessage = (event: MessageEvent) => {
            this.handleAudioPeakProcessorMessage(event);
          };
          this.onAudioWorkletLoaded$.next(this._audioWorkletNode);
        },
        error: (error) => {
          throw new Error(error);
        },
      });
  }

  disconnectSource() {
    if (this.isSourceConnected && this._audioWorkletNode) {
      try {
        this._sourceAudioNode!.disconnect(this._audioWorkletNode);
        this._audioWorkletNode.disconnect();
      } catch (e) {
        console.debug();
      }
    }
  }

  connectSource(audioNode: AudioNode) {
    this.disconnectSource();
    if (this._audioWorkletNode) {
      this._sourceAudioNode = audioNode;
      this._sourceAudioNode.connect(this._audioWorkletNode).connect(this._sourceAudioNode.context.destination);
    } else {
      console.debug(`AudioWorkletNode not initialized`);
    }
  }

  get isSourceConnected(): boolean {
    return !!this._sourceAudioNode;
  }

  get sourceAudioNode(): AudioNode | undefined {
    return this._sourceAudioNode;
  }

  getAudioPeakProcessorState(): OmpAudioPeakProcessorState {
    return {
      audioMeterStandard: this._audioMeterStandard,
    };
  }

  protected handleAudioPeakProcessorMessage = (event: MessageEvent) => {
    this.onMessage$.next({
      data: event.data,
    });
  };

  destroy(): void {
    try {
      if (this._sourceAudioNode) {
        this._sourceAudioNode.disconnect();
      }

      if (this._audioWorkletNode) {
        this._audioWorkletNode.disconnect();
        // this._audioPeakProcessorWorkletNode.port.postMessage('stop')
        this._audioWorkletNode.port.onmessage = null;
        this._audioWorkletNode.port.close();
        this._audioWorkletNode = void 0;
      }

      completeUnsubscribeSubjects(this.onMessage$, this.onAudioWorkletLoaded$);

      nextCompleteSubject(this._destroyed$);
    } catch (e) {
      console.debug(e);
    }
  }
}
