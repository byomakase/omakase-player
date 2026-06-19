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

import {type ChromingDetachedApi, type ChromingDetachedConfig, ChromingTrackDestination} from './chroming-api';
import {BaseChroming} from './base-chroming';
import {WindowPlaybackMode} from '../common';
import {concat, filter, forkJoin, map, Observable, of, takeUntil} from 'rxjs';
import {ChromingEventType} from './chroming-event';
import {SessionStoreProxy} from '../remoting/impl/session-store-proxy';
import type {TrackRepositoryProxy} from '../remoting/impl/track-repository-proxy';
import type {OmakaseTrackApiProxy} from '../remoting/impl/omakase-track-api-proxy';
import {
  type AudioState,
  type Marker,
  type MarkerState,
  MarkerTrack,
  type MarkerTrackState,
  type MarkerUpdateableAttrs,
  type TextTrackState,
  type ThumbnailState,
  ThumbnailTrack,
  type ThumbnailTrackState,
  type TimedItemsTrackEvent,
  type TimedItemsTrackEventData,
  TimedItemsTrackEventType,
  type Track,
  type TrackEventData,
  TrackEventType,
  type TrackState,
  TrackType,
} from '../media';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import type {RemoteNode} from '../remoting/remote-node';
import {TrackRepositoryEventType} from '../repository';
import type {ChromingMarkerBarConfig, ChromingMarkerBarState} from './chroming-marker-bar';
import type {AlertsManagerProxy} from '../remoting/impl/alerts-manager-proxy';
import {AlertEventType} from '../session';
import type {MainMediaRepositoryProxy} from '../remoting/impl/main-media-repository-proxy';
import type {UiProxy} from '../remoting/impl/ui-proxy';
import type {PlayerAudioType} from '../player';

export class ChromingDetached extends BaseChroming implements ChromingDetachedApi {
  private _remoteNode?: RemoteNode;
  private _sessionStore?: SessionStoreProxy;
  private _trackRepository?: TrackRepositoryProxy;
  private _omakaseTrackApiProxy?: OmakaseTrackApiProxy;
  private _alertsManagerProxy?: AlertsManagerProxy;
  private _mainMediaRepositoryProxy?: MainMediaRepositoryProxy;
  private _uiProxy?: UiProxy;

  constructor(config: ChromingDetachedConfig) {
    super({
      ...config,
      playerWindowPlaybackMode: WindowPlaybackMode.DETACHED,
      findThumbnailFn: (trackId: string, time: number) => {
        return this.findThumbnailFn(trackId, time);
      },
    });
  }

  setRemoteProxies(remoteNode: RemoteNode) {
    // from this point on remote proxies should be available
    this._remoteNode = remoteNode;
    this._sessionStore = remoteNode.getProxyByName('SessionStore');
    this._trackRepository = remoteNode.getProxyByName('TrackRepository');
    this._omakaseTrackApiProxy = remoteNode.getProxyByName('OmakaseTrackApi');
    this._alertsManagerProxy = remoteNode.getProxyByName('AlertsManager');
    this._mainMediaRepositoryProxy = remoteNode.getProxyByName('MainMediaRepository');
    this._uiProxy = remoteNode.getProxyByName('Ui');

    this._trackRepository.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((event) => event.type === TrackRepositoryEventType.TRACK_DELETED))
      .subscribe((event) => {
        this.handleTrackRepositoryDeleteEvent(event);
      });

    this._trackRepository.onTrackEvent$;

    this._trackRepository.onTrackEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
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
        const eventData = event.data as TimedItemsTrackEventData;
        if (this._omakaseTrackApiProxy) {
          this._omakaseTrackApiProxy
            .get(eventData.trackId)
            .pipe(takeUntil(this._destroyBreaker.observer))
            .subscribe((track) => {
              if (track?.trackType === TrackType.MARKER_TRACK) {
                this.handleMarkerTrackEvent(event);
              } else if (track?.trackType === TrackType.THUMBNAIL_TRACK) {
                this.handleThumbnailTrackEvent(event, track as ThumbnailTrack);
              }
            });
        }
      });

    this._omakaseTrackApiProxy
      ?.find()
      .pipe(map((p) => p.filter((k) => k.trackType === TrackType.MARKER_TRACK)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((trackStates) => {
        // trackStates.forEach((trackState) => {});
      });

    this._omakaseTrackApiProxy
      ?.find()
      .pipe(map((p) => p.filter((k) => k.trackType === TrackType.THUMBNAIL_TRACK)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((trackStates) => {
        // console.log('These are thumbnail tracks', trackStates);
      });

    this._alertsManagerProxy.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
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
      this._alertsManagerProxy?.dismiss(alertId);
    });

    this._sessionStore
      .state()
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((sessionState) => {
        if (sessionState.player.mainMediaId) {
          this._mainMediaRepositoryProxy
            ?.get(sessionState.player.mainMediaId)
            .pipe(takeUntil(this._destroyBreaker.observer))
            .subscribe((mainMediaState) => {
              if (mainMediaState) {
                this._domController.setMainMediaType(mainMediaState.mainMediaType);
              }
            });
        }
      });

    this.wireEvents();
  }

  protected handleMarkerTrackEvent(event: TimedItemsTrackEvent): void {
    super.handleMarkerTrackEvent(event);
    this._omakaseTrackApiProxy
      ?.get(event.data.trackId)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((track) => {
        if (track) {
          this._domController.updateMarkerTrackState(event.data.trackId, track as MarkerTrackState);
        }
      });
  }

  addAudioTrackObserver(trackId: Track['id'], breaker$: Observable<any>, audioType: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR): void {
    this._remoteNode
      ?.getOrCreateProxy('Track', trackId)
      ?.onEvent$.pipe(
        filter((event) => event.type === TrackEventType.TRACK_UPDATED && event.data.trackState.id === trackId),
        takeUntil(this._destroyBreaker.observer),
        takeUntil(breaker$)
      )
      .subscribe((event) => {
        const data = event.data as TrackEventData;
        this._domController.updateAudioTrackLabel(audioType, data.trackState as AudioState);
      });
  }

  addTextTrackObserver(trackId: Track['id'], breaker$: Observable<any>): void {
    this._remoteNode
      ?.getOrCreateProxy('Track', trackId)
      ?.onEvent$.pipe(
        filter((event) => event.type === TrackEventType.TRACK_UPDATED && event.data.trackState.id === trackId),
        takeUntil(this._destroyBreaker.observer),
        takeUntil(breaker$)
      )
      .subscribe((event) => {
        const data = event.data as TrackEventData;
        this._domController.updateTextTrackLabel(data.trackState as TextTrackState);
      });
  }

  protected getMarkerTrackState(trackId: Track['id']): Observable<MarkerTrackState | undefined> {
    if (!this._trackRepository) {
      return of(undefined);
    }
    return this._trackRepository.get(trackId).pipe(
      map((trackState) => {
        if (trackState?.trackType === TrackType.MARKER_TRACK) {
          return trackState as MarkerTrackState;
        } else {
          return undefined;
        }
      })
    );
  }

  updateMarker(markerTrack: MarkerTrackState, marker: MarkerState, attrs: MarkerUpdateableAttrs): void {
    let markerTrackProxy = this._remoteNode!.getOrCreateProxy('MarkerTrack', markerTrack.id);
    markerTrackProxy
      .updateTimedItem(marker.id, attrs)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        error: (err) => {
          this._domController.updateMarker(markerTrack.id, marker);
          this._alertsManagerProxy?.error((err as Error).message, {duration: this._alertDuration});
          console.error(err);
        },
      });
  }

  addMarkerBar(trackId: Track['id'], destination: ChromingTrackDestination, config?: Partial<ChromingMarkerBarConfig>): Observable<ChromingMarkerBarState['id']> {
    return passiveObservable((observer) => {
      if (!this._omakaseTrackApiProxy) {
        errorCompleteObserver(observer, new Error('Track proxy is not initialized'));
        return;
      }
      this._omakaseTrackApiProxy
        .get(trackId)
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (markerTrack) => {
            if (!markerTrack || markerTrack.trackType !== TrackType.MARKER_TRACK) {
              errorCompleteObserver(observer, new Error(`Marker track with id ${trackId} not found`));
              return;
            }
            const handler = this.createMarkerElementAndHandler([markerTrack as MarkerTrackState], destination, config, undefined, this._uiProxy);
            this.emitMarkerTrackChange();
            nextCompleteObserver(observer, handler.id);
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  setMarkerBars(chromingMarkerBars: ChromingMarkerBarState[], progressBarMarkerBar?: ChromingMarkerBarState): Observable<void> {
    return passiveObservable((observer) => {
      if (!this._omakaseTrackApiProxy) {
        errorCompleteObserver(observer, new Error('Track proxy is not initialized'));
      } else {
        for (const handler of this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS]) {
          handler.destroy();
        }
        if (this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR]) {
          this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR].destroy();
        }
        this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS] = [];
        this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR] = void 0;
        const progressBarMarkerBar$ = progressBarMarkerBar?.tracks.length ? forkJoin(progressBarMarkerBar.tracks.map((trackId) => this._omakaseTrackApiProxy!.get(trackId))) : of([] as TrackState[]);
        progressBarMarkerBar$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
          next: (tracks) => {
            const progressBarMarkerBars = tracks.filter((track) => track?.trackType === TrackType.MARKER_TRACK).map((track) => track!) as MarkerTrackState[];
            if (progressBarMarkerBars.length) {
              this.createMarkerElementAndHandler(progressBarMarkerBars, ChromingTrackDestination.PROGRESS_BAR, {id: progressBarMarkerBar!.id}, progressBarMarkerBar, this._uiProxy);
            }
            concat(
              ...chromingMarkerBars.flatMap((chromingTrackState) =>
                chromingTrackState.tracks.map((trackId) => this._omakaseTrackApiProxy!.get(trackId).pipe(map((markerTrack) => ({markerTrack, chromingTrackState}))))
              )
            )
              .pipe(takeUntil(this._destroyBreaker.observer))
              .subscribe({
                next: ({markerTrack, chromingTrackState}) => {
                  if (markerTrack && markerTrack.trackType === TrackType.MARKER_TRACK) {
                    const existingHandler = this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS].find((h) => h.id === chromingTrackState.id);
                    if (existingHandler) {
                      existingHandler
                        .addTrack(markerTrack as MarkerTrack)
                        .pipe(takeUntil(this._destroyBreaker.observer))
                        .subscribe();
                    } else {
                      this.createMarkerElementAndHandler([markerTrack as MarkerTrackState], ChromingTrackDestination.MARKER_BARS, {id: chromingTrackState.id}, chromingTrackState, this._uiProxy);
                    }
                  }
                },
                error: (error) => {
                  errorCompleteObserver(observer, error);
                },
                complete: () => {
                  this.emitMarkerTrackChange();
                  nextCompleteObserver(observer);
                },
              });
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
      }
    });
  }

  setThumbnailTrack(trackId: Track['id'] | undefined): Observable<void> {
    return passiveObservable((observer) => {
      if (!this._omakaseTrackApiProxy) {
        errorCompleteObserver(observer, new Error('Track proxy is not initialized'));
      } else {
        (trackId ? this._omakaseTrackApiProxy!.get(trackId) : of(undefined)).pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
          next: (thumbnailTrack) => {
            if (thumbnailTrack && thumbnailTrack.trackType === TrackType.THUMBNAIL_TRACK) {
              this._thumbnailTrackId = trackId;
              this._domController.setThumbnailTrack(thumbnailTrack as ThumbnailTrackState);
            } else {
              this._thumbnailTrackId = void 0;
              this._domController.setThumbnailTrack(undefined);
            }
            this.emitThumbnailTrackChange();
            nextCompleteObserver(observer);
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
      }
    });
  }

  findThumbnailFn(trackId: string, time: number): Observable<ThumbnailState | undefined> {
    return new Observable((observer) => {
      const thumbnailTrackProxy = this._remoteNode?.getOrCreateProxy('ThumbnailTrack', trackId);
      if (!thumbnailTrackProxy) {
        errorCompleteObserver(observer, new Error('Unable to get thumbnail track proxy'));
        return;
      }
      thumbnailTrackProxy
        .findNearestThumbnail(time)
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (thumbnail) => {
            nextCompleteObserver(observer, thumbnail);
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  restoreAlerts(): Observable<void> {
    return passiveObservable((observer) => {
      if (this._sessionStore) {
        this._sessionStore
          .state()
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: (sessionState) => {
              const alerts = sessionState.alerts;
              this._domController.setAlerts(alerts);
              nextCompleteObserver(observer);
            },
            error: (error) => {
              errorCompleteObserver(observer, error);
            },
          });
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  protected wireEvents() {
    this._onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      switch (event.type) {
        case ChromingEventType.CHROMING_WATERMARK_UPDATE:
          this._sessionStore!.updateChroming({
            watermark: event.data.watermark,
          });
          break;
        case ChromingEventType.CHROMING_SAFE_ZONES_CHANGE:
          this._sessionStore!.updateChroming({
            safeZones: event.data.safeZones,
          });
          break;
        case ChromingEventType.CHROMING_HELP_MENU_CHANGE:
          this._sessionStore!.updateChroming({
            helpMenuGroups: event.data.helpMenuGroups,
          });
          break;
        case ChromingEventType.CHROMING_MARKER_BAR_CHANGE:
          this._sessionStore!.updateChroming({
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
          this._sessionStore!.state()
            .pipe(takeUntil(this._destroyBreaker.observer))
            .subscribe((sessionState) => {
              if (sessionState.chroming.theme === event.data.theme) {
                this._sessionStore!.updateChroming({
                  themeConfig: event.data.themeConfig,
                });
              }
            });
          break;
      }
    });
  }
}
