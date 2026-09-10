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

import {takeUntil} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import type {MainMedia} from '../media/main-media';
import {TextTrackUtil} from '../text/text-track-util';
import {RelationType} from '../media/relation';
import {type Track, TrackType} from '../media/track';
import {type TrackRepository, TrackRepositoryEventType} from '../repository/track-repository';
import {LiveTextCueReader} from './live-text-cue-reader';
import type {LiveTextCueFetcher, ReadableTextTrack} from './timed-items-fetcher';

export interface TextTrackCueReadersArgs {
  mainMedia: MainMedia;
  trackRepository: TrackRepository;
}

/**
 * Reads the cues of a media's text renditions into their tracks, for as long as the media is loaded.
 *
 * Which tracks are read, and for how long, is the same wherever the renditions come from. How a
 * rendition's cue times reach the media timeline is not, so {@link createFetcher} is left to a subclass
 * per media type - along with whatever that type needs to answer it.
 */
export abstract class TextTrackCueReaders implements Destroyable {
  protected readonly _mainMedia: MainMedia;
  protected readonly _trackRepository: TrackRepository;

  private readonly _readers: Map<Track['id'], LiveTextCueReader> = new Map<Track['id'], LiveTextCueReader>();

  private _started = false;
  private _destroyed = false;
  private _destroyBreaker = new ObserverBreaker();

  constructor(args: TextTrackCueReadersArgs) {
    this._mainMedia = args.mainMedia;
    this._trackRepository = args.trackRepository;
  }

  /** A fetcher that reads this rendition onto the media timeline. */
  protected abstract createFetcher(track: ReadableTextTrack): LiveTextCueFetcher;

  start(): void {
    if (this._started || this._destroyed) {
      return;
    }
    this._started = true;

    this._trackRepository.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      switch (event.type) {
        case TrackRepositoryEventType.TRACK_ADDED:
          this.readTrack(event.data.trackState.id);
          break;

        case TrackRepositoryEventType.TRACK_DELETED:
          this.stopReading(event.data.trackState.id);
          break;
      }
    });

    this._trackRepository.find().forEach((track) => this.readTrack(track.id));
  }

  private stopReading(trackId: Track['id']): void {
    this._readers.get(trackId)?.destroy();
    this._readers.delete(trackId);
  }

  private readTrack(trackId: Track['id']): void {
    if (this._destroyed || this._readers.has(trackId)) {
      return;
    }

    const track = this._trackRepository.get(trackId);
    if (!track || track.trackType !== TrackType.TEXT_TRACK) {
      return;
    }

    if (!TextTrackUtil.rendersTextNatively(this._mainMedia)) {
      return;
    }

    if (!this.isOwnTextTrack(track)) {
      console.debug(`TextTrackCueReaders: not reading ${trackId}, not part of ${this._mainMedia.id}`, track.relations);
      return;
    }

    console.debug(`TextTrackCueReaders: reading cues for ${trackId}`, track.label);

    const reader = new LiveTextCueReader({fetcher: this.createFetcher(track as ReadableTextTrack)});
    this._readers.set(trackId, reader);
    reader.start();
  }

  private isOwnTextTrack(track: Track): boolean {
    return track.trackType === TrackType.TEXT_TRACK && track.relations.some((relation) => relation.relationType === RelationType.PART_OF && relation.entityId === this._mainMedia.id);
  }

  destroy(): void {
    this._destroyed = true;
    this._destroyBreaker.destroy();

    this._readers.forEach((reader) => reader.destroy());
    this._readers.clear();
  }
}
