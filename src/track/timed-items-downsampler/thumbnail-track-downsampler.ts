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

import {DefaultThumbnail, type Thumbnail, ThumbnailTrack, TimedItemTemporalType, type TrackTimedItem} from '../../media';
import {type DownsampleOptions, TimedItemsTrackDownsampler} from './timed-items-downsampler';

export class ThumbnailTrackDownsampler extends TimedItemsTrackDownsampler<ThumbnailTrack> {
  constructor(sourceTrack: ThumbnailTrack, options: DownsampleOptions) {
    super(sourceTrack, options);
  }

  protected createDownsampledTrack(): ThumbnailTrack {
    return new ThumbnailTrack();
  }

  protected resolveDownsampledTimedItem(_index: number, start: number, end: number, timedItems: TrackTimedItem<ThumbnailTrack>[]): TrackTimedItem<ThumbnailTrack> {
    if (this._options.downsampleStrategy !== 'drop' && this._options.downsampleStrategy !== 'none') {
      throw new Error(`ThumbnailTrackDownsampler only supports the 'drop' strategy, got: ${this._options.downsampleStrategy}`);
    }

    const first = timedItems[0] as Thumbnail;
    return new DefaultThumbnail({
      temporal: {type: TimedItemTemporalType.SPAN, start: String(start), end: String(end)},
      url: first.url,
      label: first.label,
    });
  }
}
