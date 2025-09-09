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

import {OmakaseVttCueExtension, ThumbnailVttCue} from '../types';
import {map, Observable} from 'rxjs';
import Decimal from 'decimal.js';
import {VttCueParsed} from './model';
import {DownsampleStrategy, VttLoadOptions} from '../api/vtt-aware-api';
import {DownsampledVttFile} from './downsampled-vtt-file';

const isUrlAbsouteRegex = /^(http(s):\/\/.)[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/;

export class ThumbnailVttFile extends DownsampledVttFile<ThumbnailVttCue> {
  protected override _supportedDownsampleStrategies: DownsampleStrategy[] = ['none', 'drop'];

  protected constructor(url: string, options: VttLoadOptions) {
    super(url, options);
  }

  protected override resolveDownsampledCue(index: number, startTime: number, endTime: number, cues: ThumbnailVttCue[]): ThumbnailVttCue {
    return {
      index: index,
      id: `SAMPLED_${index}`,
      startTime: startTime,
      endTime: endTime,
      text: `SAMPLED`,
      url: cues[0].url,
    };
  }

  protected override prepareCue(cue: ThumbnailVttCue) {
    if (cue.text.indexOf('#xywh=') >= 0) {
      const [_, xywh] = cue.text.split('#xywh=');
      const [x, y, w, h] = xywh.split(',').map(Number);
      cue.xywh = {x, y, w, h};
    }
  }

  static create(url: string, options: VttLoadOptions): Observable<ThumbnailVttFile> {
    let instance = new ThumbnailVttFile(url, options);
    return instance.fetch().pipe(
      map((result) => {
        return instance;
      })
    );
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): ThumbnailVttCue {
    return {
      index: index,
      id: vttCueParsed.identifier,
      startTime: new Decimal(vttCueParsed.start).toDecimalPlaces(3).toNumber(),
      endTime: new Decimal(vttCueParsed.end).toDecimalPlaces(3).toNumber(),
      text: vttCueParsed.text,
      url: this.resolveThumbnailUrl(vttCueParsed),
      extension: cueExtension,
    };
  }

  private resolveThumbnailUrl(vttCueParsed: VttCueParsed): string {
    return this.isUrlAbsolute(vttCueParsed.text) ? vttCueParsed.text : this.createThumbnailUrlFromRelativeUrl(vttCueParsed.text);
  }

  private createThumbnailUrlFromRelativeUrl(relativePath: string) {
    if (this.url.lastIndexOf('/') > 2) {
      return `${this.url.substring(0, this.url.lastIndexOf('/'))}/${relativePath}`;
    } else {
      // cannot resolve absolute url :(
      return relativePath;
    }
  }

  private isUrlAbsolute(url: string) {
    return isUrlAbsouteRegex.test(url);
  }
}
