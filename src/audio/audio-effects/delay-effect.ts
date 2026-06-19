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

import {ReplaySubject} from 'rxjs';
import {OmpError} from '../../types';
import {hasProperty} from '../../util/object-util';
import {AudioEffectDef} from './audio-effect';
import {type AudioEffect, AudioEffectParam, type AudioEffectParamType, type AudioEffectState, AudioNodeValueParam} from './model';
import {OmakaseAudioContextProvider} from '../../omakase-audio-context-provider';

export class AudioEffectDelayTimeParam extends AudioEffectParam {
  protected readonly _valueParam: AudioNodeValueParam;

  constructor(delayTime?: number) {
    super('delayTime');
    this._valueParam = new AudioNodeValueParam(delayTime === void 0 ? 1 : delayTime);
    this.addProp(this._valueParam);
  }

  setDelayTime(delayTime: number) {
    this._valueParam.setValue(delayTime);
  }
}
/**
 * Delay effect
 */
export class DelayEffect implements AudioEffect {
  private _delayNode;
  private _def: AudioEffectState;
  public readonly id: string;
  public readonly effectType: string;
  public attrs = new Map<string, any>();
  public onReady$ = new ReplaySubject<void>(1);

  constructor(def: AudioEffectState) {
    this._def = def;
    this._delayNode = new DelayNode(OmakaseAudioContextProvider.audioContext, {delayTime: this.extractDelayTimeParamFromDef()});
    this.id = def.id;
    this.effectType = def.effectType;

    if (def.attrs) {
      for (const [key, value] of Object.entries(def.attrs)) {
        this.attrs.set(key, value);
      }
    }

    this.onReady$.next();
  }

  private extractDelayTimeParamFromDef(): number {
    return this._def.audioParams?.find((param) => param.name === 'delayTime')?.props[0]?.value ?? 0;
  }

  getInputNodes(): AudioNode[] {
    return [this._delayNode];
  }

  getOutputNode(): AudioNode {
    return this._delayNode;
  }

  getNodes(): AudioNode[] {
    return [this._delayNode];
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
    let audioParam: AudioParam = this._delayNode[param.name] as AudioParam;
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

  private updateDefParam(param: AudioEffectParam) {
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
    this._delayNode.disconnect();
  }

  public static createDef(id: string, delayTime: number): AudioEffectDef {
    return new AudioEffectDef(id, 'delay').addParam({
      name: 'delayTime',
      props: [
        {
          name: 'value',
          value: delayTime,
        },
      ],
    });
  }
}
