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

import {type MainMedia, type MainMediaEvent, type MainMediaState} from '../media/main-media';
import {BaseRepository} from './repository';
import {filter, map, type Observable, Subject, take, takeUntil} from 'rxjs';
import type {Destroyable, Serializable} from '../common/capabilities';
import {TrackRepository} from './track-repository';
import {freeObserver} from '../util/rxjs-util';

export enum MainMediaRepositoryEventType {
  MAIN_MEDIA_ADDED = 'MAIN_MEDIA_ADDED',
  MAIN_MEDIA_DELETED = 'MAIN_MEDIA_DELETED',
}

export interface MainMediaRepositoryEventData extends Serializable {
  mainMediaState: MainMediaState;
}

export type MainMediaRepositoryEventTypeDataMap = {
  [MainMediaRepositoryEventType.MAIN_MEDIA_ADDED]: MainMediaRepositoryEventData;
  [MainMediaRepositoryEventType.MAIN_MEDIA_DELETED]: MainMediaRepositoryEventData;
};

export interface MainMediaRepositoryEvent<T extends MainMediaRepositoryEventType = MainMediaRepositoryEventType> extends Serializable {
  type: T;
  data: MainMediaRepositoryEventTypeDataMap[T];
}

export class MainMediaRepository extends BaseRepository<MainMedia> implements Destroyable {
  private readonly _trackRepository: TrackRepository;

  private readonly _onEvent$: Subject<MainMediaRepositoryEvent> = new Subject<MainMediaRepositoryEvent>();
  private readonly _onMainMediaEvent$: Subject<MainMediaEvent> = new Subject<MainMediaEvent>();

  constructor(trackRepository: TrackRepository) {
    super();
    this._trackRepository = trackRepository;
  }

  get onEvent$(): Observable<MainMediaRepositoryEvent> {
    return this._onEvent$.asObservable();
  }

  get onMainMediaEvent$(): Observable<MainMediaEvent> {
    return this._onMainMediaEvent$.asObservable();
  }

  onMainMediaDeleted$(mainMediaId: MainMedia['id']): Observable<MainMediaRepositoryEvent<MainMediaRepositoryEventType.MAIN_MEDIA_DELETED>> {
    return this.onEvent$
      .pipe(
        filter((p) => p.type === MainMediaRepositoryEventType.MAIN_MEDIA_DELETED && p.data.mainMediaState.id === mainMediaId),
        take(1)
      )
      .pipe(map((p) => p as MainMediaRepositoryEvent<MainMediaRepositoryEventType.MAIN_MEDIA_DELETED>));
  }

  add(mainMedia: MainMedia): MainMedia {
    let track = super.add(mainMedia);
    this._onEvent$.next({
      type: MainMediaRepositoryEventType.MAIN_MEDIA_ADDED,
      data: {
        mainMediaState: mainMedia.state,
      },
    });
    return track;
  }

  _add(mediaEntity: MainMedia): MainMedia {
    let result = super._add(mediaEntity);

    result.onEvent$
      .pipe(takeUntil(this.onMainMediaDeleted$(mediaEntity.id))) // propagate events until deleted
      .subscribe({
        next: (event) => {
          this._onMainMediaEvent$.next(event);
        },
      });

    return result;
  }

  getFirstOrFail(): MainMedia {
    let mainMedias = this.find();
    if (mainMedias && mainMedias[0]) {
      return mainMedias[0];
    } else {
      if (mainMedias.length < 1) {
        throw new Error('Main media not found');
      } else {
        throw new Error('Multiple main media found');
      }
    }
  }

  addAll(entities: MainMedia[]): MainMedia[] {
    let mainMedias = super.addAll(entities);
    mainMedias.forEach((mainMedia) => {
      this._onEvent$.next({
        type: MainMediaRepositoryEventType.MAIN_MEDIA_ADDED,
        data: {
          mainMediaState: mainMedia.state,
        },
      });
    });
    return mainMedias;
  }

  delete(id: MainMedia['id']): boolean {
    let mainMedia = this.get(id);
    let result = false;
    if (mainMedia) {
      let state = mainMedia.state;
      this._trackRepository.deleteAll(mainMedia.tracks.map((p) => p.id));
      result = super.delete(id);
      if (result) {
        this._onEvent$.next({
          type: MainMediaRepositoryEventType.MAIN_MEDIA_DELETED,
          data: {
            mainMediaState: state,
          },
        });
      }
    }
    return result;
  }

  deleteAll(ids: MainMedia['id'][]): boolean {
    let mainMedias = ids.map((id) => this.get(id)).filter((p) => !!p);
    let result = false;
    if (mainMedias.length > 0) {
      result = super.deleteAll(ids);
      mainMedias.forEach((mainMedia: MainMedia) => {
        this._onEvent$.next({
          type: MainMediaRepositoryEventType.MAIN_MEDIA_DELETED,
          data: {
            mainMediaState: mainMedia.state,
          },
        });
      });
    }
    return result;
  }

  destroy() {
    this.clear();
    freeObserver(this._onEvent$);
    freeObserver(this._onMainMediaEvent$);
  }
}
