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

import {Observable} from 'rxjs';
import {type MarkerTrack, type MarkerTrackLoadOptions, type ObservationTrack, type ObservationTrackLoadOptions, type TextTrack, type TextTrackLoadOptions, type ThumbnailTrack, type ThumbnailTrackLoadOptions, type Track, TrackType} from '../media';
import {type BaseTrackLoadOptions, type TimedItemsTrack} from '../media';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {TrackUtils} from './track-utils';

export abstract class BaseTrackLoader<T extends Track, O = any> {
  abstract load(track: T, loadOptions?: O): Observable<T>;
}

export abstract class BaseTimedItemsTrackLoader<T extends TimedItemsTrack, O extends BaseTrackLoadOptions = BaseTrackLoadOptions> extends BaseTrackLoader<T, O> {
  constructor(protected _trackUtils: TrackUtils) {
    super();
  }

  load(track: T, loadOptions?: O): Observable<T> {
    return passiveObservable((observer) => {
      track.loadStart();
      this._trackUtils.fetchTimedItems(track.id, loadOptions).subscribe({
        next: () => {
          track.loadSuccess();
          nextCompleteObserver(observer, track);
        },
        error: (err) => {
          track.loadError(err);
          errorCompleteObserver(observer, err);
        },
      });
    });
  }
}

export class MarkerTrackLoader extends BaseTimedItemsTrackLoader<MarkerTrack, MarkerTrackLoadOptions> {}

export class ThumbnailTrackLoader extends BaseTimedItemsTrackLoader<ThumbnailTrack, ThumbnailTrackLoadOptions> {}

export class TextTrackLoader extends BaseTimedItemsTrackLoader<TextTrack, TextTrackLoadOptions> {}

export class ObservationTrackLoader extends BaseTimedItemsTrackLoader<ObservationTrack, ObservationTrackLoadOptions> {}

export class TrackLoaderFactory {
  static create(track: Track, trackUtils: TrackUtils): BaseTrackLoader<Track, BaseTrackLoadOptions> {
    switch (track.trackType) {
      case TrackType.MARKER_TRACK:
        return new MarkerTrackLoader(trackUtils);
      case TrackType.THUMBNAIL_TRACK:
        return new ThumbnailTrackLoader(trackUtils);
      case TrackType.TEXT_TRACK:
        return new TextTrackLoader(trackUtils);
      case TrackType.OBSERVATION_TRACK:
        return new ObservationTrackLoader(trackUtils);
      default:
        throw new Error(`No loader available for track type: ${track.trackType}`);
    }
  }
}
