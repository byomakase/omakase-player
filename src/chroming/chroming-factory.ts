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

import {DefaultDomController} from './themes/default-dom';
import type {ChromingDomConfig} from './chroming-dom';
import {ChromingTheme, type ChromingThemeTypes} from './chroming-api';
import {AudioDomController} from './themes/audio-dom';
import {ChromelessDomController} from './themes/chromeless-dom';
import {StampDomController} from './themes/stamp-dom';
import {OmakaseDomController} from './themes/omakase-dom';
import {CustomDomController} from './themes/custom-dom';

export class ChromingDomFactory {
  static createDomController(config: ChromingDomConfig<ChromingThemeTypes>) {
    switch (config.theme) {
      case ChromingTheme.DEFAULT:
        return new DefaultDomController(config as ChromingDomConfig<ChromingTheme.DEFAULT>);
      case ChromingTheme.AUDIO:
        return new AudioDomController(config as ChromingDomConfig<ChromingTheme.AUDIO>);
      case ChromingTheme.STAMP:
        return new StampDomController(config as ChromingDomConfig<ChromingTheme.STAMP>);
      case ChromingTheme.OMAKASE:
        return new OmakaseDomController(config as ChromingDomConfig<ChromingTheme.OMAKASE>);
      case ChromingTheme.CHROMELESS:
        return new ChromelessDomController(config as ChromingDomConfig<ChromingTheme.CHROMELESS>);
      case ChromingTheme.CUSTOM:
        return new CustomDomController(config as ChromingDomConfig<ChromingTheme.CUSTOM>);
      default:
        console.warn('Provided chroming theme is not recognized. Fallback to default chroming theme.');
        return new DefaultDomController(config as ChromingDomConfig<ChromingTheme.DEFAULT>);
    }
  }
}
