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

import {from, map, type Observable} from 'rxjs';
import {httpGetText} from '../http';
import {AuthConfig, FileFormatType} from '../common';
import {type Thumbnail, TimedItemTemporalUtil} from '../media';
import {TimedItemsParser} from '../track';
import {UrlUtil} from '../util/url-util';
import type {FrameImage} from './frame-image-player-controller';

/**
 * Frame image manifest is VTT file, each cue is one frame image, cue text is frame image url, relative to manifest url.
 */
export class FrameImageManifest {
  static load(url: string): Observable<FrameImage[]> {
    let rootUrl = url.substring(0, url.lastIndexOf('/'));
    return from(httpGetText(url, AuthConfig.createRequestInit(url, AuthConfig.authentication))).pipe(map((content) => FrameImageManifest.parse(content, rootUrl)));
  }

  static parse(content: string, rootUrl: string): FrameImage[] {
    return TimedItemsParser.parse(content, FileFormatType.VTT).timedItems.map((cue) => ({start: cue.temporal.start!, end: cue.temporal.end!, url: UrlUtil.absolutizeUrl(rootUrl, cue.text)}));
  }

  /**
   * Maps thumbnails of fetched thumbnail track to frame images, thumbnails without start or end are skipped.
   * @param thumbnails sorted by start time
   */
  static fromThumbnails(thumbnails: Thumbnail[]): FrameImage[] {
    let frameImages: FrameImage[] = [];
    thumbnails.forEach((thumbnail) => {
      let start = TimedItemTemporalUtil.extractStartTime(thumbnail.temporal);
      let end = TimedItemTemporalUtil.extractEndTime(thumbnail.temporal);
      if (start !== void 0 && end !== void 0) {
        frameImages.push({start, end, url: thumbnail.url});
      }
    });
    return frameImages;
  }

  /** Manifest duration, end of last frame image. */
  static resolveDuration(frameImages: FrameImage[]): number | undefined {
    return frameImages.at(-1)?.end;
  }
}
