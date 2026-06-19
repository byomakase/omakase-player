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

import {TrackUtils} from './track-utils';
import {map, Observable, of, switchMap, takeUntil} from 'rxjs';
import {
  type MarkerTrack,
  type MarkerTrackLoadOptions,
  MediaEntityType,
  type ObservationTrack,
  type ObservationTrackLoadOptions,
  Relation,
  RelationType,
  type TextTrack,
  type TextTrackLoadOptions,
  type ThumbnailTrack,
  type ThumbnailTrackLoadOptions,
  type Track,
  TrackType,
} from '../media';
import {type Source, SourceType, TrackSource, UrlSource} from '../source';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {MarkerTrackLoader, ObservationTrackLoader, TextTrackLoader, ThumbnailTrackLoader, TrackLoaderFactory} from './track-loader';
import {MediaFactory} from '../media/media-factory';
import {isString} from '../util/util-functions';
import {OpStageStatus} from '../common/op-stage';
import {TrackRepository} from '../repository';
import type {OmakaseTrackApi} from './omakase-track-api';
import type {TrackLoadOptions} from './track-load-options';
import type {Destroyable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import type {PlayerInternalApi} from '../player';
import {PlayerAudioType, PlayerTextType} from '../player';

export class OmakaseTrackApiImpl implements OmakaseTrackApi, Destroyable {
  protected _trackRepository: TrackRepository;
  protected _trackUtils: TrackUtils;
  protected _playerInternal: PlayerInternalApi | undefined;

  protected _destroyBreaker = new ObserverBreaker();

  constructor(trackRepository: TrackRepository, trackUtils: TrackUtils) {
    this._trackRepository = trackRepository;
    this._trackUtils = trackUtils;
  }

  /**
   * @internal
   * Used to guard against destructive actions that could affect player playback
   * @param player
   */
  setPlayerInternal(player: PlayerInternalApi | undefined) {
    this._playerInternal = player;
  }

  get utils() {
    return this._trackUtils;
  }

  get(id: Track['id']): Track | undefined {
    return this._trackRepository.get(id);
  }

  delete(id: Track['id']): boolean {
    if (this._playerInternal) {
      const loadedSidecarTracks = [
        ...this._playerInternal.audioInternal.getTracks(PlayerAudioType.SIDECAR).map((t) => t.id),
        ...this._playerInternal.textInternal.getTracks(PlayerTextType.SIDECAR).map((t) => t.id),
      ];
      if (loadedSidecarTracks.includes(id)) {
        throw new Error(`Cannot delete track '${id}'. It is currently loaded in the player as a sidecar track.`);
      }

      const mainMediaId = this._playerInternal.playerSession.mainMediaId;
      const track = this._trackRepository.get(id);

      if (mainMediaId && track && track.hasRelation(Relation.of(RelationType.PART_OF, mainMediaId, MediaEntityType.MAIN_MEDIA))) {
        throw new Error(`Cannot delete track '${id}'. It is currently loaded in the player as a main media track.`);
      }
    }

    return this._trackRepository.delete(id);
  }

  find(predicate?: (value: Track, index: number, array: Track[]) => unknown): Track[] {
    return this._trackRepository.find(predicate);
  }

  findFirst(predicate?: (value: Track, index: number, array: Track[]) => unknown): Track | undefined {
    return this._trackRepository.findFirst(predicate);
  }

  add(track: Track): Track {
    return this._trackRepository.add(track);
  }

  load(source: Source, loadOptions?: TrackLoadOptions | undefined): Observable<Track>;
  load(url: string, loadOptions?: TrackLoadOptions | undefined): Observable<Track>;
  load(sourceOrUrl: Source | string, loadOptions?: TrackLoadOptions | undefined): Observable<Track> {
    let track$: Observable<Track>;

    if (isString(sourceOrUrl)) {
      track$ = MediaFactory.createTrack(new UrlSource(sourceOrUrl), loadOptions).pipe(map((t) => this.add(t)));
    } else if (sourceOrUrl.type === SourceType.URL) {
      track$ = MediaFactory.createTrack(sourceOrUrl, loadOptions).pipe(map((t) => this.add(t)));
    } else if (sourceOrUrl.type === SourceType.TRACK) {
      track$ = of(this._trackRepository.getOrFail((sourceOrUrl as TrackSource).trackId));
    } else {
      throw new Error(`Error loading track`);
    }

    return passiveObservable((observer) => {
      track$
        .pipe(
          switchMap((track) => {
            if (track.loadStage.status !== OpStageStatus.NOT_STARTED) {
              throw new Error(`Cannot load track in load status: ${track.loadStage.status}`);
            }
            return TrackLoaderFactory.create(track, this._trackUtils).load(track, loadOptions);
          })
        )
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (track) => {
            nextCompleteObserver(observer, track);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
    });
  }

  loadMarkerTrack(track: MarkerTrack, loadOptions?: MarkerTrackLoadOptions): Observable<MarkerTrack> {
    return new MarkerTrackLoader(this._trackUtils).load(track, loadOptions);
  }

  loadThumbnailTrack(track: ThumbnailTrack, loadOptions?: ThumbnailTrackLoadOptions): Observable<ThumbnailTrack> {
    return new ThumbnailTrackLoader(this._trackUtils).load(track, loadOptions);
  }

  loadTextTrack(track: TextTrack, loadOptions?: TextTrackLoadOptions): Observable<TextTrack> {
    return new TextTrackLoader(this._trackUtils).load(track, loadOptions);
  }

  loadObservationTrack(track: ObservationTrack, loadOptions?: ObservationTrackLoadOptions): Observable<ObservationTrack> {
    return new ObservationTrackLoader(this._trackUtils).load(track, loadOptions);
  }

  destroy() {
    this._destroyBreaker.destroy();
  }
}


