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

import {TimedItemsTrackEventType, type TimedItemsTrackEvent, type TimedItemsTrackEventData} from './../media/timed-items-track';
import {
  type ChromingInternalApi,
  type ChromingInternalConfig,
  ChromingTheme,
  type ChromingThemeConfigTypes,
  ChromingTrackDestination,
  type HelpMenuGroup,
  HelpMenuGroupInsertPosition,
  ChromingTimeFormat,
  type VideoSafeZone,
  type VideoSafeZoneCreate,
  type ChromingThemeTypes,
  type ChromingVuMeterConfig,
  ChromingVuMeterPosition,
  type ChromingMarkerBarHandlers,
} from './chroming-api';
import type {Destroyable} from '../common/capabilities';
import {concat, filter, map, Observable, Subject, take, takeUntil} from 'rxjs';
import {type ChromingEvent, ChromingEventType} from './chroming-event';
import {ObserverBreaker} from '../common/observer-breaker';
import {PlayerAudioEventType, PlayerAudioMode, PlayerAudioType, PlayerEventType, PlayerTextEventType, type PlayerInternalApi} from '../player';
import {ChromingDomController, type ChromingAudioTrack} from './chroming-dom';
import {ChromingDomFactory} from './chroming-factory';
import {DefaultDomController} from './themes/default-dom';
import type {ChromingSession} from '../session';
import {describedObservable, errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable, wrapObservable} from '../util/rxjs-util';
import type {ChromingState} from './chroming-state';
import {AudioDomController} from './themes/audio-dom';
import {ChromelessDomController} from './themes/chromeless-dom';
import {
  type ChromingMarkerBarConfig,
  ChromingMarkerBarElementEventType,
  ChromingMarkerBarEventType,
  ChromingMarkerBarHandler,
  type ChromingMarkerBarHandlerApi,
  type ChromingMarkerBarState,
} from './chroming-marker-bar';
import {MarkerTrack, type MarkerState, type MarkerTrackState, type MarkerUpdateableAttrs} from '../media/marker-track';
import type {TrackRepositoryEvent} from '../repository';
import {ThumbnailTrack, type Track, TrackType} from '../media';
import {StampDomController} from './themes/stamp-dom';
import {OmakaseDomController} from './themes/omakase-dom';
import type {Ui} from '../ui';
import type {UiProxy} from '../remoting/impl/ui-proxy';

export abstract class BaseChroming implements ChromingInternalApi, Destroyable {
  protected readonly _onEvent$: Subject<ChromingEvent> = new Subject<ChromingEvent>();

  protected _destroyBreaker = new ObserverBreaker();

  protected _config: ChromingInternalConfig;
  protected _playerInternal: PlayerInternalApi | undefined;
  protected _alertDuration = 3000;

  private _watermark: string | undefined;
  private _helpMenuGroups: HelpMenuGroup[] = [];
  private _videoSafeZones: VideoSafeZone[] = [];

  protected _thumbnailTrackId: Track['id'] | undefined;
  protected _markerTrackHandlers: {
    [ChromingTrackDestination.PROGRESS_BAR]: ChromingMarkerBarHandler | undefined;
    [ChromingTrackDestination.MARKER_BARS]: ChromingMarkerBarHandler[];
  };

  protected _domController: ChromingDomController<ChromingThemeTypes>;

  protected constructor(config: ChromingInternalConfig) {
    this._config = config;
    this._domController = ChromingDomFactory.createDomController({
      mediaElement: {
        crossOrigin: 'anonymous',
      },
      ...this._config,
    });
    this._watermark = this._config.watermark;

    this._markerTrackHandlers = {
      [ChromingTrackDestination.PROGRESS_BAR]: void 0,
      [ChromingTrackDestination.MARKER_BARS]: [],
    };

    this._onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type !== ChromingEventType.CHROMING_CHANGE))
      .subscribe((event) => {
        this.emitChromingChange();
      });

    this._domController.themeConfigChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
      this._config.themeConfig = this._domController.themeConfig;
      this.emitThemeConfigChange();
    });
  }

  abstract addMarkerBar(trackId: Track['id'], destination: ChromingTrackDestination, config?: Partial<ChromingMarkerBarConfig>): Observable<ChromingMarkerBarState['id']>;

  abstract setMarkerBars(markerBars: ChromingMarkerBarState[], progressBarMarkerBar?: ChromingMarkerBarState): Observable<void>;

  abstract updateMarker(markerTrack: MarkerTrackState, marker: MarkerState, attrs: MarkerUpdateableAttrs): void;

  abstract setThumbnailTrack(trackId: Track['id'] | undefined): Observable<void>;

  abstract restoreAlerts(): Observable<void>;

  protected abstract addAudioTrackObserver(trackId: Track['id'], breaker$: Observable<any>, audioType: PlayerAudioType.MAIN | PlayerAudioType.SIDECAR): void;

  protected abstract addTextTrackObserver(trackId: Track['id'], breaker$: Observable<any>): void;

  protected abstract getMarkerTrackState(trackId: Track['id']): Observable<MarkerTrackState | undefined>;

  protected handleTrackRepositoryDeleteEvent(event: TrackRepositoryEvent) {
    if (event.data.trackState.trackType === TrackType.MARKER_TRACK) {
      const markerTracks = this.state.markerBars.filter((track) => track.tracks.length === 1 && track.tracks.includes(event.data.trackState.id));
      for (const track of markerTracks) {
        this.deleteMarkerBar(track.id);
      }
      if (this.state.progressBarMarkerBar?.id === event.data.trackState.id) {
        this.deleteMarkerBar(ChromingTrackDestination.PROGRESS_BAR);
      }
    } else if (event.data.trackState.trackType === TrackType.THUMBNAIL_TRACK) {
      if (this._thumbnailTrackId === event.data.trackState.id) {
        this.setThumbnailTrack(undefined);
      }
    }
  }

  protected handleMarkerTrackEvent(event: TimedItemsTrackEvent) {
    switch (event.type) {
      case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED:
        event.data.updatedTimedItems.forEach((item) => {
          this._domController.addMarker(event.data.trackId, item as MarkerState);
        });
        this.emitMarkerTrackChange();
        break;
      case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED:
        event.data.updatedTimedItems.forEach((item) => {
          this._domController.updateMarker(event.data.trackId, item as MarkerState);
        });
        break;
      case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED:
        event.data.updatedTimedItems.forEach((item) => {
          this._domController.removeMarker(event.data.trackId, item as MarkerState);
        });
        this.emitMarkerTrackChange();
        break;
    }
  }

  protected handleThumbnailTrackEvent(event: TimedItemsTrackEvent, track: ThumbnailTrack) {
    if (event.data.trackId === this._thumbnailTrackId) {
      if (event.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED) {
        this._domController.setThumbnailTrack(track.state);
      } else if (event.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED) {
        this._domController.setThumbnailTrack(undefined);
      }
    }
  }

  setPlayerInternal(playerInternal: PlayerInternalApi) {
    this._playerInternal = playerInternal;
    this._domController.setPlayer(playerInternal);
    this._playerInternal.onEvent$
      .pipe(
        takeUntil(this._destroyBreaker.observer),
        filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADING)
      )
      .subscribe((event) => {
        this._domController.setMainMediaType(event.data.mainMediaState.mainMediaType);
      });
    this._playerInternal.audioInternal.onEvent$
      .pipe(
        takeUntil(this._destroyBreaker.observer),
        filter(
          (event) =>
            event.type === PlayerAudioEventType.PLAYER_AUDIO_LOADED ||
            event.type === PlayerAudioEventType.PLAYER_AUDIO_UNLOADED ||
            event.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED ||
            event.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED ||
            event.type === PlayerAudioEventType.PLAYER_AUDIO_CHANGE
        )
      )
      .subscribe((event) => {
        switch (event.type) {
          case PlayerAudioEventType.PLAYER_AUDIO_LOADED:
            const mainTracks: ChromingAudioTrack[] = event.data.playerAudio.tracks[PlayerAudioType.MAIN].map((playerTrack) => ({
              type: PlayerAudioType.MAIN,
              playerTrack,
              audioTrack: this._playerInternal!.audioInternal.getTracks().find((track) => track.id === playerTrack.trackId)!,
            }));
            const mainTrackBreaker$ = this._playerInternal!.audioInternal.onEvent$.pipe(
              filter((event) => event.type === PlayerAudioEventType.PLAYER_AUDIO_UNLOADED),
              takeUntil(this._destroyBreaker.observer)
            );
            for (const track of mainTracks) {
              this.addAudioTrackObserver(track.playerTrack.trackId, mainTrackBreaker$, PlayerAudioType.MAIN);
            }
            this._domController.setAudioTracks(PlayerAudioType.MAIN, mainTracks);
            break;
          case PlayerAudioEventType.PLAYER_AUDIO_UNLOADED:
            this._domController.setAudioTracks(PlayerAudioType.MAIN, []);
            this._domController.setAudioTracks(PlayerAudioType.SIDECAR, []);
            break;
          case PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED:
            if (this._playerInternal!.audioInternal.state.audioMode === PlayerAudioMode.SINGLE) {
              this._domController.addAudioTrack(PlayerAudioType.MAIN, {
                type: PlayerAudioType.SIDECAR,
                playerTrack: event.data.playerAudioTrack,
                audioTrack: this._playerInternal!.audioInternal.getTracks().find((track) => track.id === event.data.playerAudioTrack.trackId)!,
              });
            } else {
              this._domController.addAudioTrack(PlayerAudioType.SIDECAR, {
                type: PlayerAudioType.SIDECAR,
                playerTrack: event.data.playerAudioTrack,
                audioTrack: this._playerInternal!.audioInternal.getTracks().find((track) => track.id === event.data.playerAudioTrack.trackId)!,
              });
            }
            const sidecarTrackBreaker$ = this._playerInternal!.audioInternal.onEvent$.pipe(
              filter(
                (e) =>
                  e.type === PlayerAudioEventType.PLAYER_AUDIO_UNLOADED ||
                  (e.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED && e.data.playerAudioTrack.trackId === event.data.playerAudioTrack.trackId)
              ),
              takeUntil(this._destroyBreaker.observer)
            );
            this.addAudioTrackObserver(event.data.playerAudioTrack.trackId, sidecarTrackBreaker$, PlayerAudioType.SIDECAR);
            break;
          case PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED:
            if (this._playerInternal!.audioInternal.state.audioMode === PlayerAudioMode.SINGLE) {
              this._domController.removeAudioTrack(PlayerAudioType.MAIN, event.data.playerAudioTrack.trackId);
            } else {
              this._domController.removeAudioTrack(PlayerAudioType.SIDECAR, event.data.playerAudioTrack.trackId);
            }
            break;
          case PlayerAudioEventType.PLAYER_AUDIO_CHANGE:
            if (this._playerInternal!.audioInternal.state.audioMode === PlayerAudioMode.SINGLE) {
              this._domController.updateAudioTracks(PlayerAudioType.MAIN, [
                ...event.data.playerAudio.tracks[PlayerAudioType.MAIN].map((playerTrack) => ({type: PlayerAudioType.MAIN, playerTrack})),
                ...event.data.playerAudio.tracks[PlayerAudioType.SIDECAR].map((playerTrack) => ({type: PlayerAudioType.SIDECAR, playerTrack})),
              ]);
            } else {
              this._domController.updateAudioTracks(
                PlayerAudioType.MAIN,
                event.data.playerAudio.tracks[PlayerAudioType.MAIN].map((playerTrack) => ({type: PlayerAudioType.MAIN, playerTrack}))
              );
              this._domController.updateAudioTracks(
                PlayerAudioType.SIDECAR,
                event.data.playerAudio.tracks[PlayerAudioType.SIDECAR].map((playerTrack) => ({type: PlayerAudioType.SIDECAR, playerTrack}))
              );
            }
            break;
        }
      });
    this._playerInternal.textInternal.onEvent$
      .pipe(
        takeUntil(this._destroyBreaker.observer),
        filter(
          (event) =>
            event.type === PlayerTextEventType.PLAYER_TEXT_LOADED ||
            event.type === PlayerTextEventType.PLAYER_TEXT_UNLOADED ||
            event.type === PlayerTextEventType.PLAYER_TEXT_TRACK_LOADED ||
            event.type === PlayerTextEventType.PLAYER_TEXT_TRACK_UNLOADED ||
            event.type === PlayerTextEventType.PLAYER_TEXT_CHANGE
        )
      )
      .subscribe((event) => {
        switch (event.type) {
          case PlayerTextEventType.PLAYER_TEXT_LOADED:
            const mainTracks = event.data.playerText.tracks[PlayerAudioType.MAIN].map((playerTrack) => ({
              playerTrack,
              textTrack: this._playerInternal!.textInternal.getTracks().find((track) => track.id === playerTrack.trackId)!,
            }));
            for (const track of mainTracks) {
              const mainTrackBreaker$ = this._playerInternal!.textInternal.onEvent$.pipe(
                filter((event) => event.type === PlayerTextEventType.PLAYER_TEXT_UNLOADED),
                takeUntil(this._destroyBreaker.observer)
              );
              this.addTextTrackObserver(track.playerTrack.trackId, mainTrackBreaker$);
            }
            this._domController.setTextTracks(mainTracks);
            break;
          case PlayerTextEventType.PLAYER_TEXT_UNLOADED:
            this._domController.setTextTracks([]);
            break;
          case PlayerTextEventType.PLAYER_TEXT_TRACK_LOADED:
            this._domController.addTextTrack({
              playerTrack: event.data.playerTextTrack,
              textTrack: this._playerInternal!.textInternal.getTracks().find((track) => track.id === event.data.playerTextTrack.trackId)!,
            });
            const sidecarTrackBreaker$ = this._playerInternal!.textInternal.onEvent$.pipe(
              filter(
                (e) =>
                  e.type === PlayerTextEventType.PLAYER_TEXT_UNLOADED ||
                  (e.type === PlayerTextEventType.PLAYER_TEXT_TRACK_UNLOADED && e.data.playerTextTrack.trackId === event.data.playerTextTrack.trackId)
              ),
              takeUntil(this._destroyBreaker.observer)
            );
            this.addTextTrackObserver(event.data.playerTextTrack.trackId, sidecarTrackBreaker$);
            break;
          case PlayerTextEventType.PLAYER_TEXT_TRACK_UNLOADED:
            this._domController.removeTextTrack(event.data.playerTextTrack.trackId);
            break;
          case PlayerTextEventType.PLAYER_TEXT_CHANGE:
            this._domController.updateTextTracks([...event.data.playerText.tracks[PlayerAudioType.MAIN], ...event.data.playerText.tracks[PlayerAudioType.SIDECAR]]);
            break;
        }
      });
  }

  get onEvent$(): Observable<ChromingEvent> {
    return this._onEvent$.asObservable();
  }

  restoreChromingSession(chromingSession: ChromingSession): Observable<void> {
    let oCount = 0;
    let describeMe = (title: string, source$: Observable<void>) => {
      return describedObservable(`${++oCount} | ${title}`, source$, 1);
    };

    let os$: Observable<any>[] = [];

    let addObservable = (observable: Observable<any>) => {
      os$.push(observable);
    };

    return new Observable((observer) => {
      addObservable(describeMe(`Watermark`, wrapObservable(this.setWatermark(chromingSession.watermark))));
      addObservable(describeMe(`Safe zones`, wrapObservable(this.setSafeZones(chromingSession.safeZones))));
      addObservable(describeMe(`Help menu groups`, wrapObservable(this.setHelpMenuGroups(chromingSession.helpMenuGroups))));
      addObservable(
        describeMe(
          `Theme config`,
          wrapObservable(
            new Observable((o) => {
              if (chromingSession.themeConfig && chromingSession.theme === this._domController.theme) {
                this.setThemeConfig(chromingSession.themeConfig).subscribe({
                  next: () => {
                    nextCompleteObserver(o);
                  },
                  error: (error) => {
                    errorCompleteObserver(o, error);
                  },
                });
              } else {
                nextCompleteObserver(o);
              }
            })
          )
        )
      );
      addObservable(describeMe(`Marker tracks`, wrapObservable(this.setMarkerBars(chromingSession.markerBars, chromingSession.progressBarMarkerBar))));
      addObservable(describeMe(`Thumbnail track`, wrapObservable(this.setThumbnailTrack(chromingSession.thumbnailTrackId))));
      addObservable(describeMe(`Alerts`, wrapObservable(this.restoreAlerts())));

      describedObservable(
        `Restore chroming session`,
        new Observable((o) => {
          if (os$.length > 0) {
            concat(...os$).subscribe({
              complete: () => {
                this._onEvent$.next({
                  type: ChromingEventType.CHROMING_SESSION_RESTORED,
                  data: {
                    chromingSession: this.chromingSession,
                  },
                });
                nextCompleteObserver(o);
              },
            });
          } else {
            nextCompleteObserver(o);
          }
        })
      ).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  protected resolveTheme(): ChromingTheme {
    return this._domController.theme;
  }

  protected resolveThemeConfig() {
    return this._domController.themeConfig;
  }

  get state(): ChromingState {
    return {
      helpMenuGroups: this._helpMenuGroups,
      safeZones: this._videoSafeZones,
      watermark: this._watermark,
      themeConfig: this.resolveThemeConfig(),
      theme: this.resolveTheme(),
      progressBarMarkerBar: this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR]?.state,
      markerBars: this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS].map((track) => track.state),
      thumbnailTrackId: this._thumbnailTrackId,
    };
  }

  get chromingSession(): ChromingSession {
    return this.state;
  }

  emitChromingChange() {
    this._onEvent$.next({
      type: ChromingEventType.CHROMING_CHANGE,
      data: {chroming: this.state},
    });
  }

  emitSafeZonesChange() {
    this._onEvent$.next({
      type: ChromingEventType.CHROMING_SAFE_ZONES_CHANGE,
      data: {safeZones: this._videoSafeZones},
    });
  }

  emitHelpMenuChange() {
    this._onEvent$.next({
      type: ChromingEventType.CHROMING_HELP_MENU_CHANGE,
      data: {helpMenuGroups: this._helpMenuGroups},
    });
  }

  emitMarkerTrackChange() {
    this._onEvent$.next({
      type: ChromingEventType.CHROMING_MARKER_BAR_CHANGE,
      data: {
        progressBarMarkerBar: this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR]?.state,
        markerBars: this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS].map((track) => track.state),
      },
    });
  }

  emitThumbnailTrackChange() {
    this._onEvent$.next({
      type: ChromingEventType.CHROMING_THUMBNAIL_TRACK_CHANGE,
      data: {thumbnailTrackId: this._thumbnailTrackId},
    });
  }

  emitThemeConfigChange() {
    this._onEvent$.next({
      type: ChromingEventType.CHROMING_THEME_CONFIG_CHANGE,
      data: {
        theme: this.resolveTheme(),
        themeConfig: this.resolveThemeConfig(),
      },
    });
  }

  emitWatermarkChange(watermark: string | undefined) {
    this._onEvent$.next({
      type: ChromingEventType.CHROMING_WATERMARK_UPDATE,
      data: {watermark},
    });
  }

  setWatermark(watermark: string | undefined): Observable<void> {
    return passiveObservable((observer) => {
      this._watermark = watermark;
      this._domController.setWatermark(this._watermark);
      this.emitWatermarkChange(watermark);
      nextCompleteObserver(observer);
    });
  }

  get videoSafeZones(): VideoSafeZone[] {
    return this._videoSafeZones;
  }

  setSafeZones(videoSafeZones: VideoSafeZone[]): Observable<void> {
    return passiveObservable((observer) => {
      this._videoSafeZones = videoSafeZones;
      this._domController.clearSafeZones();
      for (const safeZone of this._videoSafeZones) {
        this._domController.addSafeZone(safeZone, this._videoSafeZones);
      }
      this.emitSafeZonesChange();
      nextCompleteObserver(observer);
    });
  }

  addSafeZone(videoSafeZone: VideoSafeZoneCreate): Observable<VideoSafeZone> {
    return passiveObservable((observer) => {
      if (this._videoSafeZones.find((p) => p.id === videoSafeZone.id)) {
        errorCompleteObserver(observer, `Safe zone with id ${videoSafeZone.id} already exists`);
      } else {
        let newVideoSafeZone = this._domController.addSafeZone(videoSafeZone, this._videoSafeZones);

        this._videoSafeZones.push(newVideoSafeZone);

        this.emitSafeZonesChange();

        nextCompleteObserver(observer, newVideoSafeZone);
      }
    });
  }

  removeSafeZone(id: string): Observable<void> {
    return passiveObservable((observer) => {
      let videoSafeZone = this._videoSafeZones.find((p) => p.id === id);
      if (videoSafeZone) {
        this._videoSafeZones.splice(this._videoSafeZones.indexOf(videoSafeZone), 1);
        this._domController.removeSafeZone(videoSafeZone);
        this.emitSafeZonesChange();
        nextCompleteObserver(observer);
      }
    });
  }

  removeAllSafeZones(): Observable<void> {
    return passiveObservable((observer) => {
      this._videoSafeZones = [];
      this._domController.clearSafeZones();
      this.emitSafeZonesChange();
      nextCompleteObserver(observer);
    });
  }

  get helpMenuGroups(): HelpMenuGroup[] {
    return this._helpMenuGroups;
  }

  setHelpMenuGroups(helpMenuGroups: HelpMenuGroup[]): Observable<void> {
    return passiveObservable((observer) => {
      this._helpMenuGroups = helpMenuGroups;
      this._domController.updateHelpMenu(this._helpMenuGroups);
      this.emitHelpMenuChange();
      nextCompleteObserver(observer);
    });
  }

  addHelpMenuGroup(helpMenuGroup: HelpMenuGroup, insertPosition: HelpMenuGroupInsertPosition = HelpMenuGroupInsertPosition.APPEND): Observable<HelpMenuGroup> {
    return passiveObservable((observer) => {
      this._helpMenuGroups = insertPosition === HelpMenuGroupInsertPosition.APPEND ? [...this._helpMenuGroups, helpMenuGroup] : [helpMenuGroup, ...this._helpMenuGroups];
      this._domController.updateHelpMenu(this._helpMenuGroups);
      this.emitHelpMenuChange();
      nextCompleteObserver(observer, helpMenuGroup);
    });
  }

  clearHelpMenuGroups(): Observable<void> {
    return passiveObservable((observer) => {
      this._helpMenuGroups = [];
      this._domController.updateHelpMenu(this._helpMenuGroups);
      this.emitHelpMenuChange();
      nextCompleteObserver(observer);
    });
  }

  setFloatingTimeVisible(visible: boolean): Observable<void> {
    return passiveObservable((observer) => {
      if (
        this._domController instanceof DefaultDomController ||
        this._domController instanceof ChromelessDomController ||
        this._domController instanceof StampDomController ||
        this._domController instanceof OmakaseDomController
      ) {
        this._domController.setFloatingTimeVisible(visible);
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, `Current theme doesn't support invoked method`);
      }
    });
  }

  setFloatingVuMeterVisible(visible: boolean): Observable<void> {
    return passiveObservable((observer) => {
      if (this._domController instanceof DefaultDomController || this._domController instanceof OmakaseDomController) {
        this._domController.setFloatingVuMeterVisible(visible);
        this.emitThemeConfigChange();
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, `Current theme doesn't support invoked method`);
      }
    });
  }

  setTimeFormat(timeFormat: ChromingTimeFormat): Observable<void> {
    return passiveObservable((observer) => {
      if (
        this._domController instanceof DefaultDomController ||
        this._domController instanceof ChromelessDomController ||
        this._domController instanceof StampDomController ||
        this._domController instanceof OmakaseDomController ||
        this._domController instanceof AudioDomController
      ) {
        this._domController.setTimeFormat(timeFormat);
        this.emitThemeConfigChange();
        nextCompleteObserver(observer);
      } else {
        errorCompleteObserver(observer, `Current theme doesn't support invoked method`);
      }
    });
  }

  setThemeConfig(themeConfig: Partial<ChromingThemeConfigTypes>): Observable<void> {
    return passiveObservable((observer) => {
      this._domController.setThemeConfig(themeConfig);
      this.emitThemeConfigChange();
      nextCompleteObserver(observer);
    });
  }

  setVuMeterConfig(vuMeterConfig: Partial<ChromingVuMeterConfig>, position?: ChromingVuMeterPosition): Observable<void> {
    return passiveObservable((observer) => {
      if (position === ChromingVuMeterPosition.FLOATING) {
        this._domController.setThemeConfig({floatingVuMeterConfig: vuMeterConfig});
      } else if (position === ChromingVuMeterPosition.CONTROL_BAR) {
        this._domController.setThemeConfig({controlBarVuMeterConfig: vuMeterConfig});
      } else {
        this._domController.setThemeConfig({vuMeterConfig, floatingVuMeterConfig: void 0, controlBarVuMeterConfig: void 0});
      }
      this.emitThemeConfigChange();
      nextCompleteObserver(observer);
    });
  }

  toggleFullScreen(): Observable<void> {
    return this._domController.toggleFullScreen();
  }

  getPlayerChromingElement<T>(querySelector: string): T {
    return this._domController.getPlayerChromingElement(querySelector);
  }

  getMarkerBars(): ChromingMarkerBarHandlers {
    return this._markerTrackHandlers;
  }

  getMarkerBar(id: string): ChromingMarkerBarHandlerApi | undefined {
    if (id === this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR]?.id) {
      return this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR];
    } else {
      return this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS].find((track) => track.state.id === id);
    }
  }

  deleteMarkerBar(id: string): Observable<void> {
    return passiveObservable((observer) => {
      if (id === this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR]?.id) {
        this._domController.deleteMarkerTrack(ChromingTrackDestination.PROGRESS_BAR);
        const markerTrackHandler = this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR];
        if (markerTrackHandler) {
          markerTrackHandler.destroy();
          this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR] = void 0;
        }
      } else {
        this._domController.deleteMarkerTrack(id);
        const markerTrackHandler = this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS].find((track) => track.id === id);
        if (markerTrackHandler) {
          markerTrackHandler.destroy();
          this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS].splice(this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS].indexOf(markerTrackHandler), 1);
        }
      }
      this.emitMarkerTrackChange();
      nextCompleteObserver(observer);
    });
  }

  protected createMarkerElementAndHandler(
    markerTracks: MarkerTrackState[],
    destination: ChromingTrackDestination,
    config?: Partial<ChromingMarkerBarConfig>,
    trackState?: ChromingMarkerBarState,
    ui?: Ui | UiProxy
  ): ChromingMarkerBarHandlerApi {
    const markerBarElement = this._domController.addMarkerTrack(destination);
    if (config) {
      markerBarElement.config = config;
    }
    if (ui) {
      markerBarElement.setUiOrUiProxy(ui);
    }
    if (destination === ChromingTrackDestination.PROGRESS_BAR && this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR]) {
      this.deleteMarkerBar(ChromingTrackDestination.PROGRESS_BAR);
    }
    markerBarElement.onEvent$
      .pipe(
        takeUntil(this._destroyBreaker.observer),
        takeUntil(markerBarElement.destroy$),
        filter((event) => event.type === ChromingMarkerBarElementEventType.CHROMING_MARKER_UPDATE)
      )
      .subscribe((event) => {
        this.updateMarker(event.data.track, event.data.item, event.data.attrs);
      });
    if (!trackState) {
      markerBarElement.markerTracks = markerTracks;
    }
    const markerBarHandler = new ChromingMarkerBarHandler(
      markerBarElement.config.id,
      markerTracks.map((track) => track.id),
      markerBarElement.config.visible
    );
    markerBarHandler.wireElement(markerBarElement);
    markerBarHandler.onEvent$
      .pipe(
        filter(
          (event) =>
            event.type === ChromingMarkerBarEventType.CHROMING_MARKER_BAR_CHANGE ||
            event.type === ChromingMarkerBarEventType.CHROMING_MARKER_BAR_TRACK_ADDED ||
            event.type === ChromingMarkerBarEventType.CHROMING_MARKER_BAR_TRACK_REMOVED
        ),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((event) => {
        switch (event.type) {
          case ChromingMarkerBarEventType.CHROMING_MARKER_BAR_CHANGE:
            this._domController.setMarkerTrackVisible(markerBarElement, event.data.state.visible);
            this.emitMarkerTrackChange();
            break;
          case ChromingMarkerBarEventType.CHROMING_MARKER_BAR_TRACK_ADDED:
            this.getMarkerTrackState(event.data.trackId)
              .pipe(takeUntil(this._destroyBreaker.observer))
              .subscribe((markerTrack) => {
                if (markerTrack) {
                  markerBarElement.addTrack(markerTrack);
                }
              });
            break;
          case ChromingMarkerBarEventType.CHROMING_MARKER_BAR_TRACK_REMOVED:
            this.getMarkerTrackState(event.data.trackId)
              .pipe(takeUntil(this._destroyBreaker.observer))
              .subscribe((markerTrack) => {
                if (markerTrack) {
                  markerBarElement.removeTrack(markerTrack);
                }
              });
            break;
        }
      });
    if (destination === ChromingTrackDestination.PROGRESS_BAR) {
      this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR] = markerBarHandler;
    } else {
      this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS].push(markerBarHandler);
    }
    if (trackState) {
      markerBarHandler.restoreState(trackState);
      markerBarElement.markerTracks = markerTracks;
    }
    return markerBarHandler;
  }

  get isFloatingTimeVisible(): boolean | undefined {
    if (
      this._domController instanceof DefaultDomController ||
      this._domController instanceof ChromelessDomController ||
      this._domController instanceof StampDomController ||
      this._domController instanceof OmakaseDomController
    ) {
      return this._domController.isFloatingTimeVisible();
    } else {
      return void 0;
    }
  }

  get timeFormat(): ChromingTimeFormat | undefined {
    if (
      this._domController instanceof DefaultDomController ||
      this._domController instanceof ChromelessDomController ||
      this._domController instanceof StampDomController ||
      this._domController instanceof OmakaseDomController ||
      this._domController instanceof AudioDomController
    ) {
      return this._domController.themeConfig?.timeFormat;
    } else {
      return void 0;
    }
  }

  get domController(): ChromingDomController<ChromingThemeTypes> {
    return this._domController;
  }

  destroy(): void {
    this._destroyBreaker.destroy();

    if (this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR]) {
      this._markerTrackHandlers[ChromingTrackDestination.PROGRESS_BAR].destroy();
    }
    this._markerTrackHandlers[ChromingTrackDestination.MARKER_BARS].forEach((handler) => handler.destroy());

    this._domController.destroy();

    freeObserver(this._onEvent$);
  }
}
