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

// @ts-ignore
import blackMp4Base64 from './../../assets/black.mp4.base64.txt?raw';
import {Mp4MainMedia} from '../mp4';
import {UrlSource} from '../source';
import {UrlUtil} from '../util/url-util';
import type {MainMedia} from './main-media';
import type {Destroyable} from '../common/capabilities';

export enum SlateType {
  BLACK = 'BLACK',
}

export class SlateProvider implements Destroyable {
  private _slates: Map<SlateType, Mp4MainMedia> = new Map();

  constructor() {
    this._slates.set(SlateType.BLACK, this.createSlate(UrlUtil.formatBase64Url('video/mp4', blackMp4Base64)));
  }

  getMainMedia(slateType: SlateType): MainMedia {
    if (this._slates.has(slateType)) {
      return this._slates.get(slateType)!;
    } else {
      throw new Error(`Slate ${slateType} not found`);
    }
  }

  private createSlate(url: string): Mp4MainMedia {
    return new Mp4MainMedia({
      source: UrlSource.of(url),
      loadOptions: {
        frameRate: 30,
      },
    });
  }

  destroy() {
    this._slates.clear();

    // @ts-ignore
    SlateProvider._instance = void 0;
  }
}
