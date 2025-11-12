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

import {OmpAudioNodeParamPropType, OmpAudioNodeParamType} from '../video/model';

/**
 * Wrapper for {@link AudioParam} attributes
 */
export class OmpAudioNodeValueParam implements OmpAudioNodeParamPropType {
  name: string = 'value';
  value: any;

  constructor(value: any) {
    this.value = value;
  }

  setValue(value: any) {
    this.value = value;
  }
}

/**
 * Wrapper for {@link AudioParam}
 */
export class OmpAudioNodeParam implements OmpAudioNodeParamType {
  name: string;
  props: OmpAudioNodeParamPropType[] = [];

  constructor(name: string) {
    this.name = name;
  }

  protected addProp(prop: OmpAudioNodeParamPropType) {
    this.props.push(prop);
  }
}

export class OmpAudioNodeUtil {
  static extractAudioParamProps(audioParam: AudioParam): OmpAudioNodeParamPropType[] {
    return [
      {
        name: 'value',
        value: audioParam.value,
      },
      {
        name: 'automationRate',
        value: audioParam.automationRate,
      },
    ];
  }
}
