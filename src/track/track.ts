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

import {OmakaseTextTrack, OmakaseTextTrackCue, OmakaseTrackConfig} from '../types';

export abstract class BaseOmakaseTrack<T extends OmakaseTextTrackCue> implements OmakaseTextTrack<T> {
  id: string;
  src: string;
  default: boolean;
  label: string;
  language: string;
  kind: string;
  cues: T[];
  hidden: boolean = true;
  element?: HTMLTrackElement;

  protected constructor(config: OmakaseTrackConfig) {
    this.id = config.id;
    this.src = config.src;
    this.default = config.default;
    this.label = config.label;
    this.language = config.language;
    this.kind = config.kind;
    this.cues = [];
  }
}
