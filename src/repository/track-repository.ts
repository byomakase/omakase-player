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

import {type Track, type TrackEvent, type TrackState} from '../media';
import {BaseRepository} from './repository';
import {filter, map, type Observable, Subject, takeUntil} from 'rxjs';

import type {Destroyable, Serializable} from '../common/capabilities';
import {freeObserver} from '../util/rxjs-util';

export enum TrackRepositoryEventType {
  TRACK_ADDED = 'TRACK_ADDED',
  TRACK_DELETED = 'TRACK_DELETED',
}

export interface TrackRepositoryEventData extends Serializable {
  trackState: TrackState;
}

export type TrackRepositoryEventTypeDataMap = {
  [TrackRepositoryEventType.TRACK_ADDED]: TrackRepositoryEventData;
  [TrackRepositoryEventType.TRACK_DELETED]: TrackRepositoryEventData;
};

export interface TrackRepositoryEvent<T extends TrackRepositoryEventType = TrackRepositoryEventType> extends Serializable {
  type: T;
  data: TrackRepositoryEventTypeDataMap[T];
}

export class TrackRepository extends BaseRepository<Track> implements Destroyable {
  protected readonly _onEvent$: Subject<TrackRepositoryEvent> = new Subject<TrackRepositoryEvent>();
  protected readonly _onTrackEvent$: Subject<TrackEvent> = new Subject<TrackEvent>();

  constructor() {
    super();
  }

  get onEvent$(): Observable<TrackRepositoryEvent> {
    return this._onEvent$.asObservable();
  }

  get onTrackEvent$(): Observable<TrackEvent> {
    return this._onTrackEvent$.asObservable();
  }


  add(entity: Track): Track {
    let track = super.add(entity);
    this._onEvent$.next({
      type: TrackRepositoryEventType.TRACK_ADDED,
      data: {
        trackState: track.state,
      },
    });
    return track;
  }

  addAll(entities: Track[]): Track[] {
    let tracks = super.addAll(entities);
    tracks.forEach((track) => {
      this._onEvent$.next({
        type: TrackRepositoryEventType.TRACK_ADDED,
        data: {
          trackState: track.state,
        },
      });
    });
    return tracks;
  }

  _add(mediaEntity: Track): Track {
    let result = super._add(mediaEntity);

    // propagate events until deleted
    let deleted$ = this.onTrackDeleted$(mediaEntity.id);

    result.onEvent$.pipe(takeUntil(deleted$)).subscribe({
      next: (event) => {
        this._onTrackEvent$.next(event);
      },
    });

    return result;
  }

  delete(id: Track['id']): boolean {
    let track = this.get(id);

    if (track) {
      let result = super.delete(track.id);
      if (result && track) {
        this._onEvent$.next({
          type: TrackRepositoryEventType.TRACK_DELETED,
          data: {
            trackState: track.state,
          },
        });
      }
      return result;
    } else {
      return false;
    }
  }

  deleteAll(ids: Track['id'][]): boolean {
    let tracks = ids.map((id) => this.get(id)).filter((p) => !!p);
    let result = false;
    if (tracks.length > 0) {
      result = super.deleteAll(tracks.map((p) => p.id));
      tracks.forEach((track) => {
        this._onEvent$.next({
          type: TrackRepositoryEventType.TRACK_DELETED,
          data: {
            trackState: track.state,
          },
        });
      });
    }
    return result;
  }

  onTrackDeleted$(trackId: Track['id']): Observable<TrackRepositoryEvent<TrackRepositoryEventType.TRACK_DELETED>> {
    return this.onEvent$
      .pipe(filter((p) => p.type === TrackRepositoryEventType.TRACK_DELETED && p.data.trackState.id === trackId))
      .pipe(map((p) => p as TrackRepositoryEvent<TrackRepositoryEventType.TRACK_DELETED>));
  }

  destroy() {
    this.clear();
    freeObserver(this._onEvent$);
    freeObserver(this._onTrackEvent$);
  }
}
