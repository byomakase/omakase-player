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

import {filter, merge, Observable, Subject, takeUntil} from 'rxjs';
import {
  BaseMarker,
  MarkerTrack,
  ThumbnailTrack,
  TimedItemsTrackEventType,
  TimedItemTemporalType,
  TimedItemTemporalUtil,
  TrackType,
  type MarkerState,
  type MarkerUpdateableAttrs,
  type TimedItemsTrackEventData,
  type Track,
} from '../media';
import type {TrackLoadOptions} from '../track';
import type {MarkerListComponent, MarkerListMode} from './components/marker-list-component';
import {MarkerListItem} from './marker-list-item';
import {MarkerListEventType, type MarkerListEvent} from './marker-list-event';
import {MarkerListDomController} from './marker-list-dom';
import type {Destroyable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import type {OmakasePlayerApi} from '../omakase-player-api';
import type {MarkerListApi} from './marker-list-api';
import {TrackSource, UrlSource, type Source} from '../source';
import {errorCompleteObserver, freeObserver, nextCompleteObserver} from '../util/rxjs-util';
import {affectsStyledElement, type MarkerStyle} from '../ui';

export interface MarkerListSource {
  url?: string;
  source?: Source;
  loadOptions?: TrackLoadOptions | undefined;
}

export interface MarkerOnMarkerListStyle extends MarkerStyle {
  highlightMarker: boolean;
  canDeleteMarker: boolean;
}

export interface MarkerListConfig {
  markerListHTMLElementId: string;
  templateHTMLElementId?: string;
  headerHTMLElementId?: string;
  emptyHTMLElementId?: string;
  loadingHTMLElementId?: string;
  styleUrl?: string | string[];
  timeEditable?: boolean;
  labelEditable?: boolean;
  labelOptions?: string[];
  labelValidationFn?: (name: string | undefined) => boolean;
  markerTrack?: MarkerListSource | MarkerListSource[] | undefined;
  thumbnailTrack?: MarkerListSource | undefined;
  mode?: MarkerListMode;
}

const configDefault: MarkerListConfig = {
  markerListHTMLElementId: 'omakase-marker-list',
};

export class MarkerList implements Destroyable, MarkerListApi {
  protected _onEvent$ = new Subject<MarkerListEvent>();

  private _markerListDomController: MarkerListDomController;
  private _markerListComponent: MarkerListComponent;
  private _config: MarkerListConfig;
  private _markerTracks: Map<string, MarkerTrack> = new Map();
  private _thumbnailTrack?: ThumbnailTrack | undefined;
  private _player: OmakasePlayerApi;
  private readonly _destroyBreaker = new ObserverBreaker();

  private _trackRemove$ = new Subject<MarkerTrack['id']>();
  private _markerRemove$ = new Subject<MarkerState['id']>();

  constructor(config: MarkerListConfig, player: OmakasePlayerApi) {
    this._player = player;
    this._config = {
      ...configDefault,
      ...config,
    };
    this._markerListDomController = new MarkerListDomController(this);
    this._markerListComponent = this._markerListDomController.markerListComponent;
    this._markerListComponent.player = player;
    this._markerListComponent.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      if (event.type === MarkerListEventType.MARKER_LIST_ITEM_DELETE && event.data.source) {
        event.data.source.deleteTimedItems(event.data.item.id);
      }
      this._onEvent$.next(event);
    });
    if (this._config.thumbnailTrack) {
      this.resolveTrackSource(this._config.thumbnailTrack, TrackType.THUMBNAIL_TRACK)
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe((track) => {
          if (track instanceof ThumbnailTrack) {
            this.thumbnailTrack = track;
          } else {
            throw new Error('Wrong track type used for thumbnailTrack');
          }
        });
    }
    if (this.config.markerTrack) {
      const sources = Array.isArray(this.config.markerTrack) ? this.config.markerTrack : [this.config.markerTrack];
      merge(...sources.map((source) => this.resolveTrackSource(source, TrackType.MARKER_TRACK)))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe((...tracks) => {
          for (const track of tracks.filter((t) => t && t.trackType === TrackType.MARKER_TRACK)) {
            this.addTrack(track as MarkerTrack);
          }
          this._onEvent$.next({
            type: MarkerListEventType.MARKER_LIST_TRACKS_LOADED,
            data: {
              tracks: this.getTracks(),
            },
          });
        });
    }

    if (this.config.mode) {
      this._markerListComponent.mode = this.config.mode;
    }
  }

  get onEvent$(): Observable<MarkerListEvent> {
    return this._onEvent$.asObservable();
  }

  get markers(): MarkerState[] {
    return this._markerListComponent.markers.map((marker) => marker.track.getTimedItem(marker.markerId)!);
  }

  get config(): MarkerListConfig {
    return this._config;
  }

  get thumbnailTrack(): ThumbnailTrack | undefined {
    return this._thumbnailTrack;
  }

  set thumbnailTrack(thumbnailTrack: ThumbnailTrack | undefined) {
    this._thumbnailTrack = thumbnailTrack;
    if (this._thumbnailTrack) {
      for (const marker of this._markerListComponent.markers) {
        this.resolveThumbnail(marker).subscribe((thumbnail) => {
          this._markerListComponent.updateMarker(marker.markerId, {
            thumbnailUrl: thumbnail,
          });
        });
      }
    }
  }

  addTrack(trackOrId: MarkerTrack | MarkerTrack['id']): void {
    const track = typeof trackOrId === 'string' ? (this._player.track.get(trackOrId) as MarkerTrack) : trackOrId;
    if (!track || track.trackType !== TrackType.MARKER_TRACK) {
      throw new Error(`The provided track is invalid`);
    }
    this._markerTracks.set(track.id, track as MarkerTrack);
    for (const marker of track.timedItems) {
      this.addMarkerToComponent(marker, track);
    }
    this.wireMarkerTrack(track);
  }

  removeTrack(trackId: MarkerTrack['id']): void {
    const track = this._markerTracks.get(trackId);
    if (track) {
      for (const marker of track.timedItems) {
        this.removeMarkerFromDom(marker.id);
      }
      this._trackRemove$.next(trackId);
      this._markerTracks.delete(trackId);
    }
  }

  getTracks(): MarkerTrack[] {
    return [...this._markerTracks.values()];
  }

  reorderMarker(id: string, index: number) {
    this._markerListComponent.reorderMarker(id, index);
  }

  destroy(): void {
    this._destroyBreaker.destroy();
    this._markerListDomController.destroy();
    freeObserver(this._onEvent$);
  }

  protected removeMarkerFromDom(markerId: string) {
    this._markerRemove$.next(markerId);
    this._markerListComponent.removeMarker(markerId);
  }

  private getMarkerItem(id: string): MarkerListItem {
    const markerItem = this._markerListComponent.getMarkerItem(id);
    if (!markerItem) {
      throw Error(`Marker List error: Marker with id ${id} does not exist`);
    }
    return markerItem;
  }

  private resolveTrackSource(trackSource: MarkerListSource, trackType: TrackType.MARKER_TRACK | TrackType.THUMBNAIL_TRACK): Observable<Track | undefined> {
    return new Observable((observer) => {
      if (trackSource.url) {
        trackSource.source = UrlSource.of(trackSource.url);
      }
      if (trackSource.source instanceof TrackSource) {
        nextCompleteObserver(observer, this._player.track.get(trackSource.source.trackId));
      } else if (trackSource.source instanceof UrlSource) {
        this._player.track
          .load(trackSource.source.url, trackSource.loadOptions ?? {trackType})
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: (track) => {
              if (track.trackType === trackType) {
                nextCompleteObserver(observer, track);
              } else {
                errorCompleteObserver(observer, new Error(`Provided track must have track type ${trackType}`));
              }
            },
            error: (error) => {
              errorCompleteObserver(observer, error);
            },
          });
      } else {
        errorCompleteObserver(observer, new Error('Source type is not supported'));
      }
    });
  }

  private wireMarkerTrack(markerTrack: MarkerTrack) {
    markerTrack.onEvent$
      .pipe(
        filter((event) =>
          [TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED, TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED, TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED].includes(
            event.type as TimedItemsTrackEventType
          )
        ),
        takeUntil(this._destroyBreaker.observer),
        takeUntil(this._trackRemove$.pipe(filter((trackId) => trackId === markerTrack.id)))
      )
      .subscribe((event) => {
        const eventData = event.data as TimedItemsTrackEventData;
        switch (event.type) {
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED:
            for (const marker of eventData.updatedTimedItems) {
              this.addMarkerToComponent(marker as MarkerState, this._markerTracks.get(eventData.trackId)!);
            }
            break;
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED:
            for (const marker of eventData.updatedTimedItems) {
              this.removeMarkerFromDom(marker.id);
            }
            break;
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED:
            for (const marker of eventData.updatedTimedItems as MarkerState[]) {
              const markerListItem = this._markerListComponent.markers.find((m) => m.markerId === marker.id);
              if (markerListItem) {
                this.resolveThumbnail(markerListItem)
                  .pipe(takeUntil(this._destroyBreaker.observer))
                  .subscribe((thumbnail) => {
                    if (marker.temporal.type === TimedItemTemporalType.MOMENT) {
                      this._markerListComponent.updateMarker(marker.id, {
                        start: marker.temporal.time,
                        thumbnailUrl: thumbnail,
                        label: marker.label,
                      });
                    } else {
                      this._markerListComponent.updateMarker(marker.id, {
                        start: TimedItemTemporalUtil.extractStartTime(marker.temporal)?.toString(),
                        end: TimedItemTemporalUtil.extractEndTime(marker.temporal)?.toString(),
                        thumbnailUrl: thumbnail,
                        label: marker.label,
                      });
                    }
                  });
              }
            }
            break;
        }
      });
  }

  private addMarkerToComponent(marker: MarkerState, track: MarkerTrack) {
    const markerItem = new MarkerListItem(marker, track, this._player.ui);
    this._player.ui.onEvent$
      .pipe(
        filter((event) => affectsStyledElement(event, markerItem.styledElement)),
        takeUntil(this._destroyBreaker.observer),
        takeUntil(this._markerRemove$.pipe(filter((markerId) => markerId === marker.id)))
      )
      .subscribe(() => {
        this._markerListComponent.updateMarkerStyle(markerItem.markerId);
      });
    this.resolveThumbnail(markerItem)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((thumbnail) => {
        markerItem.thumbnailUrl = thumbnail;
        this._markerListComponent.updateMarker(markerItem.markerId, {thumbnailUrl: thumbnail});
      });
    this._markerListComponent.addMarker(markerItem);
  }

  private resolveThumbnail(marker: MarkerListItem): Observable<string | undefined> {
    return new Observable<string | undefined>((observer) => {
      const time = marker.numStart ?? marker.numEnd;
      if (time === undefined || !this._thumbnailTrack) {
        nextCompleteObserver(observer, undefined);
      } else {
        const thumbnail = this._thumbnailTrack.findNearestTimedItem(time);
        nextCompleteObserver(observer, thumbnail?.url);
      }
    });
  }
}
