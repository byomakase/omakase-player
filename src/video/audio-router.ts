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

import {Destroyable, OmpAudioRouterChangeEvent} from '../types';
import {Observable, Subject} from 'rxjs';
import {AudioInputOutputNode, OmpAudioRouterState} from './model';
import {Validators} from '../validators';
import {AudioUtil} from '../util/audio-util';
import {completeUnsubscribeSubjects, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {AudioRouterApi} from '../api/audio-router-api';

export class OmpAudioRouter implements AudioRouterApi, Destroyable {
  public readonly onChange$: Subject<OmpAudioRouterChangeEvent> = new Subject<OmpAudioRouterChangeEvent>();

  protected _inputsNumber: number;
  protected _outputsNumber: number;
  protected _sourceAudioNode?: AudioNode;
  protected _channelSplitterNode: ChannelSplitterNode;
  protected _channelMergerNode: ChannelMergerNode;
  /**
   * Mapped by inputNumber, then by outputNumber
   * @protected
   */
  protected _audioInputOutputNodes: Map<number, Map<number, AudioInputOutputNode>>;

  protected _destroyed$ = new Subject<void>();

  protected static readonly defaultAudioOutputsResolver: (maxChannelCount: number) => number = (maxChannelCount: number) => {
    if (maxChannelCount <= 1) {
      return 1;
    } else if (maxChannelCount >= 2 && maxChannelCount <= 5) {
      return 2;
    } else if (maxChannelCount >= 6) {
      return 6;
    } else {
      return maxChannelCount;
    }
  };

  constructor(audioContext: AudioContext, inputsNumber: number, outputsNumberResolver?: (maxChannelCount: number) => number) {
    let audioDestinationNode: AudioDestinationNode = audioContext.destination;
    let maxChannelCount = audioDestinationNode.maxChannelCount; // the maximum number of channels that this hardware is capable of supporting

    inputsNumber = Validators.audioChannelsNumber()(inputsNumber);

    this._inputsNumber = inputsNumber;
    if (outputsNumberResolver) {
      this._outputsNumber = outputsNumberResolver(maxChannelCount);
    } else {
      this._outputsNumber = OmpAudioRouter.defaultAudioOutputsResolver(maxChannelCount);
    }

    this._channelSplitterNode = audioContext.createChannelSplitter(this._inputsNumber);
    this._channelMergerNode = audioContext.createChannelMerger(this._inputsNumber);

    this._audioInputOutputNodes = new Map<number, Map<number, AudioInputOutputNode>>();

    for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
      let inputAudioInputOutputNodesByOutput: Map<number, AudioInputOutputNode> = new Map<number, AudioInputOutputNode>();
      this._audioInputOutputNodes.set(inputNumber, inputAudioInputOutputNodesByOutput);
      for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
        inputAudioInputOutputNodesByOutput.set(outputNumber, {
          inputNumber: inputNumber,
          outputNumber: outputNumber,
          connected: false,
        });
      }
    }

    this.routeAudioInputOutputNodes(AudioUtil.resolveDefaultAudioRouting(this._inputsNumber, this._outputsNumber));

    // connect silent gain node to prevent buffer overflows and stalls when audio isn't routed to destination
    let silentGainNode = audioContext.createGain();
    silentGainNode.gain.value = 0; // Set gain to 0 (silent)
    silentGainNode.connect(audioContext.destination);
    this._channelSplitterNode.connect(silentGainNode);

    this._channelMergerNode.connect(audioContext.destination);

    this.dispatchOnChange();
  }

  get isSourceConnected(): boolean {
    return !!this._sourceAudioNode;
  }

  disconnectSource() {
    if (this.isSourceConnected) {
      try {
        this._sourceAudioNode!.disconnect(this._channelSplitterNode);
      } catch (e) {
        console.debug();
      }
    }
  }

  connectSource(audioNode: AudioNode) {
    this.disconnectSource();
    this._sourceAudioNode = audioNode;
    this._sourceAudioNode.channelCountMode = 'max';
    this._sourceAudioNode.channelCount = this._inputsNumber;
    this._sourceAudioNode.connect(this._channelSplitterNode);
  }

  routeAudioInputOutputNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void> {
    return passiveObservable((observer) => {
      newAudioInputOutputNodes.forEach((p) => this._routeAudioInputOutputNode(p, false));
      this.dispatchOnChange();
      nextCompleteObserver(observer);
    });
  }

  routeAudioInputOutputNode(newAudioInputOutputNode: AudioInputOutputNode): Observable<void> {
    return passiveObservable((observer) => {
      this._routeAudioInputOutputNode(newAudioInputOutputNode);
      nextCompleteObserver(observer);
    });
  }

  getAudioInputOutputNodes(): AudioInputOutputNode[][] {
    return [...this._audioInputOutputNodes.values()].map((p) => [...p.values()]);
  }

  get sourceAudioNode(): AudioNode | undefined {
    return this._sourceAudioNode;
  }

  get inputsNumber(): number {
    return this._inputsNumber;
  }

  get outputsNumber(): number {
    return this._outputsNumber;
  }

  getAudioRouterState(): OmpAudioRouterState {
    return {
      inputsNumber: this._inputsNumber,
      outputsNumber: this._outputsNumber,
      audioInputOutputNodes: this.getAudioInputOutputNodes(),
    };
  }

  protected dispatchOnChange() {
    this.onChange$.next({
      audioRouterState: this.getAudioRouterState(),
    });
  }

  protected _routeAudioInputOutputNode(newNode: AudioInputOutputNode, emitEvent = true) {
    if (!this._audioInputOutputNodes.has(newNode.inputNumber)) {
      console.debug(`Unknown audioInputOutputNode: ${JSON.stringify(newNode)}`);
      return;
    }

    if (this._channelSplitterNode && this._channelMergerNode) {
      let byOutput = this._audioInputOutputNodes.get(newNode.inputNumber)!;
      let existingNode = byOutput.get(newNode.outputNumber);

      // change is required only if newNode doesn't exist already and is connected, or if it exists and new connected state differs from existing
      let changeRequired = (!existingNode && newNode.connected) || (existingNode && existingNode.connected !== newNode.connected);

      if (changeRequired) {
        try {
          if (newNode.connected) {
            this._channelSplitterNode.connect(this._channelMergerNode, newNode.inputNumber, newNode.outputNumber);
          } else {
            this._channelSplitterNode.disconnect(this._channelMergerNode, newNode.inputNumber, newNode.outputNumber);
          }

          byOutput.set(newNode.outputNumber, newNode);
          if (emitEvent) {
            this.dispatchOnChange();
          }
        } catch (e) {
          console.warn(e);
        }
      }
    }
  }

  destroy(): void {
    try {
      if (this._sourceAudioNode) {
        this._sourceAudioNode.disconnect();
      }

      this._channelSplitterNode.disconnect();
      this._channelMergerNode.disconnect();

      completeUnsubscribeSubjects(this.onChange$);

      nextCompleteSubject(this._destroyed$);

      this._audioInputOutputNodes.clear();
    } catch (e) {
      console.debug(e);
    }
  }
}
