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

import { ReplaySubject } from "rxjs";
import { AudioEffectDef } from "./audio-effect";
import { AudioEffectParam, AudioNodeValueParam, type AudioEffect, type AudioEffectParamType, type AudioEffectState } from "./model";
import { OmpError } from "../../types";
import { hasProperty } from "../../util/object-util";
import {OmakaseAudioContextProvider} from '../../omakase-audio-context-provider';


export class AudioEffectGainParam extends AudioEffectParam {
  protected readonly _valueParam: AudioNodeValueParam;

  constructor(gain?: number) {
    super('gain');
    this._valueParam = new AudioNodeValueParam(gain === void 0 ? 1 : gain);
    this.addProp(this._valueParam);
  }

  setGain(gain: number) {
    this._valueParam.setValue(gain);
  }
}
/**
 * Gain effect
 */
export class GainEffect implements AudioEffect {
  private _gainNode;
  private _def: AudioEffectState;
  public readonly id: string;
  public readonly effectType: string;
  public attrs = new Map<string, any>();
  public onReady$ = new ReplaySubject<void>(1);
  constructor(def: AudioEffectState) {
    this._def = def;
    this._gainNode = new GainNode(OmakaseAudioContextProvider.audioContext, {gain: this.extractGainParamFromDef()});
    this.id = def.id;
    this.effectType = def.effectType;

    if (def.attrs) {
      for (const [key, value] of Object.entries(def.attrs)) {
        this.attrs.set(key, value);
      }
    }

    this.onReady$.next();
  }

  private extractGainParamFromDef(): number {
    return this._def.audioParams?.find((param) => param.name === 'gain')?.props[0]?.value ?? 1;
  }

  getInputNodes(): AudioNode[] {
    return [this._gainNode];
  }

  getOutputNode(): AudioNode {
    return this._gainNode;
  }

  getNodes(): AudioNode[] {
    return [this._gainNode];
  }

  getParams(): AudioEffectParamType[] | undefined {
    return this._def.audioParams;
  }

  toState(): AudioEffectState {
    return {
      ...this._def,
    };
  }

  setParam(param: AudioEffectParam): void {
    // @ts-ignore
    let audioParam: AudioParam = this._gainNode[param.name] as AudioParam;
    if (!audioParam) {
      throw new OmpError('AudioParam not found:' + param.name);
    }
    param.props.forEach((prop) => {
      if (hasProperty(audioParam, prop.name)) {
        // @ts-ignore
        audioParam[prop.name] = prop.value;
      }
    });
    this.updateDefParam(param);
  }

  private updateDefParam(param: AudioEffectParamType) {
    if (!this._def.audioParams) {
      this._def.audioParams = [param];
    } else {
      const oldParam = this._def.audioParams.find((oldParam) => oldParam.name === param.name);

      if (!oldParam) {
        this._def.audioParams.push(param);
      } else {
        oldParam.props = param.props;
      }
    }
  }

  destroy(): void {
    this._gainNode.disconnect();
  }

  public static createDef(id: string, gain: number): AudioEffectDef {
    return new AudioEffectDef(id, 'gain').addParam({
      name: 'gain',
      props: [
        {
          name: 'value',
          value: gain,
        },

        
      ],
    });
  }
}