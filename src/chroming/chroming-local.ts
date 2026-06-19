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

import {type ChromingLocalApi, type ChromingLocalConfig, ChromingTrackDestination} from './chroming-api';
import {BaseChroming} from './base-chroming';
import {WindowPlaybackMode} from '../common';
import {filter, Observable, of, takeUntil} from 'rxjs';
import {AlertEventType, SessionStore} from '../session';
import {ChromingEventType} from './chroming-event';
import {
  type AudioState,
  type Marker,
  type MarkerState,
  type MarkerTrack,
  type MarkerTrackState,
  type MarkerUpdateableAttrs,
  type TextTrackState,
  type ThumbnailState,
  ThumbnailTrack,
  type TimedItemsTrackEvent,
  TimedItemsTrackEventType,
  type Track,
  type TrackEventData,
  TrackEventType,
  TrackType,
} from '../media';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import type {OmakaseTrackApi, TrackLoadOptions} from '../track';
import {type Source, SourceType, TrackSource} from '../source';
import {TrackRepository, TrackRepositoryEventType} from '../repository';
import type {ChromingMarkerBarConfig, ChromingMarkerBarState} from './chroming-marker-bar';
import {AlertsManager} from '../session/alert';
import type {OmpProvider} from '../omp-provider';
import {Ui} from '../ui';
import {ObserverBreaker} from '../common/observer-breaker';
import {PlayerAudioType} from '../player';

export class ChromingLocal extends BaseChroming implements ChromingLocalApi {
  private _sessionStore: SessionStore;
  private _trackApi: OmakaseTrackApi;
  private _trackRepository: TrackRepository;
  private _alertsManager: AlertsManager;
  private _ui: Ui;

  constructor(ompProvider: OmpProvider, config: ChromingLocalConfig) {
    super({
      ...config,
      playerWindowPlaybackMode: WindowPlaybackMode.ATTACHED,
      findThumbnailFn: (trackId: string, time: number) => {
        return this.findThumbnailFn(trackId, time);
      },
    });

    this._sessionStore = ompProvider.sessionStore;
    this._trackApi = ompProvider.omakaseTrack;
    this._trackRepository = ompProvider.trackRepository;
    this._alertsManager = ompProvider.alertsManager;
    this._ui = ompProvider.ui;

    this.wireEvents();
  }

  protected wireEvents() {
    this._onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      switch (event.type) {
        case ChromingEventType.CHROMING_WATERMARK_UPDATE:
          this._sessionStore.updateChroming({
            watermark: event.data.watermark,
          });
          break;
        case ChromingEventType.CHROMING_SAFE_ZONES_CHANGE:
          this._sessionStore.updateChroming({
            safeZones: event.data.safeZones,
          });
          break;
        case ChromingEventType.CHROMING_HELP_MENU_CHANGE:
          this._sessionStore.updateChroming({
            helpMenuGroups: event.data.helpMenuGroups,
          });
          break;
        case ChromingEventType.CHROMING_MARKER_BAR_CHANGE:
          this._sessionStore.updateChroming({
            progressBarMarkerBar: event.data.progressBarMarkerBar,
            markerBars: event.data.markerBars,
          });
          break;
        case ChromingEventType.CHROMING_THUMBNAIL_TRACK_CHANGE:
          this._sessionStore!.updateChroming({
            thumbnailTrackId: event.data.thumbnailTrackId,
          });
          break;
        case ChromingEventType.CHROMING_THEME_CONFIG_CHANGE:
          this._sessionStore!.updateChroming({
            theme: event.data.theme,
            themeConfig: event.data.themeConfig,
          });
          break;
      }
    });

    this._trackRepository.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((event) => event.type === TrackRepositoryEventType.TRACK_DELETED))
      .subscribe((event) => {
        this.handleTrackRepositoryDeleteEvent(event);
      });

    this._trackRepository.onTrackEvent$
      .pipe(
        filter((event: any) =>
          [TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED, TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED, TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED].includes(
            event.type
          )
        ),
        filter((event: TimedItemsTrackEvent) => {
          return (
            event.data.trackId === this._thumbnailTrackId ||
            this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR]?.getTrackIds().includes(event.data.trackId) ||
            !!this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS]?.find((handler) => handler.getTrackIds().includes(event.data.trackId))
          );
        }),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((event) => {
        const track = this._trackApi.get(event.data.trackId);
        if (track?.trackType === TrackType.MARKER_TRACK) {
          this.handleMarkerTrackEvent(event);
        } else if (track?.trackType === TrackType.THUMBNAIL_TRACK) {
          this.handleThumbnailTrackEvent(event, track as ThumbnailTrack);
        }
      });

    this._alertsManager.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      switch (event.type) {
        case AlertEventType.ALERT_RAISED:
          this._domController.addAlert(event.data.alert);
          break;
        case AlertEventType.ALERT_DISMISSED:
          this._domController.removeAlert(event.data.alert.id);
          break;
      }
    });

    this._domController.alertClosed$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((alertId) => {
      this._alertsManager.dismiss(alertId);
    });

    this.emitThemeConfigChange();

    if (this._config.watermark) {
      this.emitWatermarkChange(this._config.watermark);
    }
  }

  protected handleMarkerTrackEvent(event: TimedItemsTrackEvent): void {
    super.handleMarkerTrackEvent(event);
    const track = this._trackApi.get(event.data.trackId) as MarkerTrack;
    if (track) {
      this._domController.updateMarkerTrackState(event.data.trackId, track.state);
    }
  }

  addAudioTrackObserver(trackId: Track['id'], breaker$: Observable<any>, audioType: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR): void {
    const track = this._trackApi.get(trackId);
    if (track) {
      track.onEvent$
        .pipe(
          filter((event) => event.type === TrackEventType.TRACK_UPDATED),
          takeUntil(this._destroyBreaker.observer),
          takeUntil(breaker$)
        )
        .subscribe((event) => {
          const data = event.data as TrackEventData;
          this._domController.updateAudioTrackLabel(audioType, data.trackState as AudioState);
        });
    }
  }

  addTextTrackObserver(trackId: Track['id'], breaker$: Observable<any>): void {
    const track = this._trackApi.get(trackId);
    if (track) {
      track.onEvent$
        .pipe(
          filter((event) => event.type === TrackEventType.TRACK_UPDATED),
          takeUntil(this._destroyBreaker.observer),
          takeUntil(breaker$)
        )
        .subscribe((event) => {
          const data = event.data as TrackEventData;
          this._domController.updateTextTrackLabel(data.trackState as TextTrackState);
        });
    }
  }

  protected getMarkerTrackState(trackId: Track['id']): Observable<MarkerTrackState | undefined> {
    const track = this._trackRepository.get(trackId);
    if (track?.trackType === TrackType.MARKER_TRACK) {
      return of(track.state as MarkerTrackState);
    } else {
      return of(undefined);
    }
  }

  prepareDomForAttaching(): void {
    this._domController.prepareForAttaching();
  }

  prepareDomForDetaching(): void {
    this._domController.prepareForDetaching();
  }

  loadTrack(trackType: TrackType.MARKER_TRACK, urlOrSource: string | Source, options?: TrackLoadOptions): Observable<MarkerTrack>;
  loadTrack(trackType: TrackType.THUMBNAIL_TRACK, urlOrSource: string | Source, options?: TrackLoadOptions): Observable<ThumbnailTrack>;
  loadTrack(trackType: TrackType, urlOrSource: string | Source, options?: TrackLoadOptions): Observable<Track> {
    return passiveObservable((observer) => {
      if (!options) {
        options = this.resolveDefaultTrackLoadOptions(trackType);
      }
      let track$: Observable<Track | undefined>;
      if (options.trackType !== trackType) {
        errorCompleteObserver(observer, new Error(`Track type in TrackLoadOptions must be ${trackType}`));
        return;
      } else if (typeof urlOrSource === 'string') {
        track$ = this._trackApi.load(urlOrSource, options);
      } else if (urlOrSource.type === SourceType.URL) {
        track$ = this._trackApi.load(urlOrSource, options);
      } else if (urlOrSource instanceof TrackSource) {
        track$ = of(this._trackApi.get(urlOrSource.trackId));
      } else {
        errorCompleteObserver(observer, new Error('Track source not recognized'));
        return;
      }
      track$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (track) => {
          if (trackType === TrackType.MARKER_TRACK && track?.trackType === TrackType.MARKER_TRACK) {
            nextCompleteObserver(observer, track as MarkerTrack);
          } else if (trackType === TrackType.THUMBNAIL_TRACK && track?.trackType === TrackType.THUMBNAIL_TRACK) {
            nextCompleteObserver(observer, track as ThumbnailTrack);
          } else {
            errorCompleteObserver(observer, new Error('Track with matching track type not found'));
          }
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  protected resolveDefaultTrackLoadOptions(trackType: TrackType): TrackLoadOptions {
    switch (trackType) {
      case TrackType.MARKER_TRACK:
        return {trackType};
      case TrackType.THUMBNAIL_TRACK:
        return {trackType};
      default:
        throw new Error(`Track type ${trackType} is not supported`);
    }
  }

  updateMarker(markerTrackState: MarkerTrackState, marker: MarkerState, attrs: MarkerUpdateableAttrs): void {
    const markerTrack = this._trackApi.get(markerTrackState.id) as MarkerTrack;
    try {
      markerTrack.updateTimedItem(marker.id, attrs);
    } catch (err) {
      this._domController.updateMarker(markerTrackState.id, marker);
      this._alertsManager.error((err as Error).message, {duration: this._alertDuration});
      console.error(err);
    }
  }

  addMarkerBar(trackId: Track['id'], destination: ChromingTrackDestination, config?: Partial<ChromingMarkerBarConfig>): Observable<ChromingMarkerBarState['id']> {
    return passiveObservable((observer) => {
      const markerTrack = this._trackApi.get(trackId) as MarkerTrack;
      const handler = this.createMarkerElementAndHandler([markerTrack.state], destination, config, void 0, this._ui);
      this.emitMarkerTrackChange();
      nextCompleteObserver(observer, handler.id);
    });
  }

  setMarkerBars(chromingMarkerBars: ChromingMarkerBarState[], progressBarMarkerBar?: ChromingMarkerBarState): Observable<void> {
    return passiveObservable((observer) => {
      for (const handler of this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS]) {
        handler.destroy();
      }
      if (this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR]) {
        this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR].destroy();
      }
      this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS] = [];
      this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR] = void 0;
      if (progressBarMarkerBar) {
        const markerBars = progressBarMarkerBar.tracks
          .map((trackId) => this._trackApi.get(trackId))
          .filter((track) => track?.trackType === TrackType.MARKER_TRACK)
          .map((track) => track!.state) as MarkerTrackState[];

        if (markerBars.length) {
          this.createMarkerElementAndHandler(markerBars, ChromingTrackDestination.PROGRESS_BAR, {id: progressBarMarkerBar.id}, progressBarMarkerBar, this._ui);
        }
      }
      for (const trackState of chromingMarkerBars) {
        const markerTracks = trackState.tracks
          .map((trackId) => this._trackApi.get(trackId))
          .filter((track) => track?.trackType === TrackType.MARKER_TRACK)
          .map((track) => track!.state) as MarkerTrackState[];
        if (markerTracks.length) {
          this.createMarkerElementAndHandler(markerTracks, ChromingTrackDestination.MARKER_BARS, {id: trackState.id}, trackState, this._ui);
        }
      }
      this.emitMarkerTrackChange();
      nextCompleteObserver(observer);
    });
  }

  setThumbnailTrack(trackId: Track['id'] | undefined): Observable<void> {
    return passiveObservable((observer) => {
      const thumbnailTrack = trackId ? (this._trackApi.get(trackId) as ThumbnailTrack) : undefined;
      this._thumbnailTrackId = trackId;
      this._domController.setThumbnailTrack(thumbnailTrack?.state);
      this.emitThumbnailTrackChange();
      nextCompleteObserver(observer);
    });
  }

  findThumbnailFn(trackId: Track['id'], time: number): Observable<ThumbnailState | undefined> {
    return new Observable((observer) => {
      const track = this._trackApi.get(trackId);
      if (track && track instanceof ThumbnailTrack) {
        const thumbnail = track.findNearestTimedItem(time);
        nextCompleteObserver(observer, thumbnail);
      } else {
        nextCompleteObserver(observer, undefined);
      }
    });
  }

  restoreAlerts(): Observable<void> {
    return passiveObservable((observer) => {
      const alerts = this._sessionStore.state.alerts;
      this._domController.setAlerts(alerts);
      nextCompleteObserver(observer);
    });
  }
}
