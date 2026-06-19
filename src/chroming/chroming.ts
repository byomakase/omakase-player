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

import {TrackType, type MarkerState} from '../media';
import {
  type ChromingApi,
  type ChromingConfig,
  type ChromingDetachedApi,
  type ChromingInternalApi,
  type ChromingLocalApi,
  type ChromingMarkerBarHandlers,
  ChromingTheme,
  type ChromingThemeConfigTypes,
  ChromingTimeFormat,
  ChromingTrackDestination,
  type ChromingVuMeterConfig,
  ChromingVuMeterPosition,
  type DefaultThemeConfig,
  type HelpMenuGroup,
  HelpMenuGroupInsertPosition,
  type OmakaseThemeConfig,
  type VideoSafeZone,
} from './chroming-api';
import type {Destroyable} from '../common/capabilities';
import {filter, Observable, Subject, takeUntil} from 'rxjs';
import type {PlayerInternalApi} from '../player';
import type {ChromingEvent} from './chroming-event';
import {ChromingLocal} from './chroming-local';
import {ObserverBreaker} from '../common/observer-breaker';
import {WindowPlaybackMode} from '../common';
import {type ChromingSession, SessionStore} from '../session';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import type {ChromingState} from './chroming-state';
import type {Source} from '../source';
import type {ChromingMarkerBarConfig, ChromingMarkerBarHandlerApi} from './chroming-marker-bar';
import type {TrackLoadOptions} from '../track';
import type {OmpProvider} from '../omp-provider';
import {DefaultDomController} from './themes/default-dom';
import {OmakaseDomController} from './themes/omakase-dom';

export class Chroming implements ChromingApi, Destroyable {
  protected readonly _onEvent$: Subject<ChromingEvent> = new Subject<ChromingEvent>();

  protected _config: ChromingConfig;

  protected _sessionStore: SessionStore;

  private _chromingLocal: ChromingLocalApi;
  private _chromingDetached?: ChromingDetachedApi | undefined;

  protected _chromingInternalSwitchBreaker = new ObserverBreaker();

  protected _destroyBreaker = new ObserverBreaker();

  constructor(ompProvider: OmpProvider, config: ChromingConfig) {
    this._sessionStore = ompProvider.sessionStore;
    this._config = config;

    this._chromingLocal = new ChromingLocal(ompProvider, {
      ...config,
    });

    this.wireLocal();
  }

  setPlayerInternal(playerInternal: PlayerInternalApi) {
    this.getChromingInternalOrFail().setPlayerInternal(playerInternal);
  }

  wireLocal() {
    this.wireChromingInternal(this._chromingLocal);
  }

  wireDetached(chromingDetached: ChromingDetachedApi) {
    this._chromingDetached = chromingDetached;
    this.wireChromingInternal(this._chromingDetached);
  }

  protected wireChromingInternal(chromingInternal: ChromingInternalApi) {
    this._chromingInternalSwitchBreaker.break();

    chromingInternal.onEvent$
      .pipe(filter((p) => this.isAttached() || this.isDetached()))
      .pipe(takeUntil(this._chromingInternalSwitchBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event: ChromingEvent) => {
        this._onEvent$.next(event);
      });
  }

  protected isAttached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED;
  }

  protected isAttaching(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.ATTACHING;
  }

  protected isDetaching(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.DETACHING;
  }

  protected isDetached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
  }

  get chromingLocal(): ChromingLocalApi {
    return this._chromingLocal;
  }

  get chromingDetached(): ChromingDetachedApi | undefined {
    return this._chromingDetached;
  }

  protected getChromingInternalOrFail(): ChromingInternalApi {
    if (this.isAttached()) {
      return this._chromingLocal;
    } else if (this.isDetached()) {
      return this._chromingDetached!;
    } else {
      throw new Error(`Chroming is in unstable window playback mode: ${this._sessionStore.state.windowPlayback.mode}`);
    }
  }

  restoreChromingSession(chromingSession: ChromingSession): Observable<void> {
    return passiveObservable((observer) => {
      let chromingInternal = this.isAttaching() ? this._chromingLocal : this.isDetaching() ? this._chromingDetached : void 0;

      if (!chromingInternal) {
        throw new Error(`Player is not in correct window playback mode: ${this._sessionStore.state.windowPlayback.mode}`);
      }

      chromingInternal.restoreChromingSession(chromingSession).subscribe({
        next: (mainMedia) => {
          nextCompleteObserver(observer);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  prepareDomForAttaching() {
    this._chromingLocal.prepareDomForAttaching();
  }

  prepareDomForDetaching() {
    this._chromingLocal.prepareDomForDetaching();
  }

  get chromingSession(): ChromingSession {
    return this.getChromingInternalOrFail().chromingSession;
  }

  get state(): ChromingState {
    return this.getChromingInternalOrFail().state;
  }

  get onEvent$(): Observable<ChromingEvent> {
    return this._onEvent$.asObservable();
  }

  get helpMenuGroups(): HelpMenuGroup[] {
    return this.getChromingInternalOrFail().helpMenuGroups;
  }

  get isFloatingTimeVisible(): boolean | undefined {
    return this.getChromingInternalOrFail().isFloatingTimeVisible;
  }

  get videoSafeZones(): VideoSafeZone[] {
    return this.getChromingInternalOrFail().videoSafeZones;
  }

  get timeFormat(): ChromingTimeFormat | undefined {
    return this.getChromingInternalOrFail().timeFormat;
  }

  addHelpMenuGroup(helpMenuGroup: HelpMenuGroup, insertPosition: HelpMenuGroupInsertPosition): Observable<HelpMenuGroup> {
    return this.getChromingInternalOrFail().addHelpMenuGroup(helpMenuGroup, insertPosition);
  }

  addSafeZone(videoSafeZone: Partial<VideoSafeZone>): Observable<VideoSafeZone> {
    return this.getChromingInternalOrFail().addSafeZone(videoSafeZone);
  }

  clearHelpMenuGroups(): Observable<void> {
    return this.getChromingInternalOrFail().clearHelpMenuGroups();
  }

  removeAllSafeZones(): Observable<void> {
    return this.getChromingInternalOrFail().removeAllSafeZones();
  }

  removeSafeZone(id: string): Observable<void> {
    return this.getChromingInternalOrFail().removeSafeZone(id);
  }

  setFloatingTimeVisible(visible: boolean): Observable<void> {
    return this.getChromingInternalOrFail().setFloatingTimeVisible(visible);
  }

  setFloatingVuMeterVisible(visible: boolean): Observable<void> {
    return this.getChromingInternalOrFail().setFloatingVuMeterVisible(visible);
  }

  toggleFullScreen(): Observable<void> {
    return this.getChromingInternalOrFail().toggleFullScreen();
  }

  setWatermark(watermark: string | undefined): Observable<void> {
    return this.getChromingInternalOrFail().setWatermark(watermark);
  }

  setTimeFormat(timeFormat: ChromingTimeFormat): Observable<void> {
    return this.getChromingInternalOrFail().setTimeFormat(timeFormat);
  }

  setThemeConfig(themeConfig: Partial<ChromingThemeConfigTypes>): Observable<void> {
    return this.getChromingInternalOrFail().setThemeConfig(themeConfig);
  }

  getPlayerChromingElement<T>(querySelector: string): T {
    return this._chromingLocal.getPlayerChromingElement(querySelector);
  }

  addMarkerBar(sourceOrUrl: string | Source, destination: ChromingTrackDestination, options?: TrackLoadOptions, config?: Partial<ChromingMarkerBarConfig>): Observable<ChromingMarkerBarHandlerApi> {
    return passiveObservable((observer) => {
      if (config?.id && this.getMarkerBar(config.id)) {
        errorCompleteObserver(observer, new Error(`Marker track with id ${config.id} already exists`));
        return;
      }
      this._chromingLocal
        .loadTrack(TrackType.MARKER_TRACK, sourceOrUrl, options)
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (markerTrack) => {
            this.getChromingInternalOrFail()
              .addMarkerBar(markerTrack.id, destination, config)
              .pipe(takeUntil(this._destroyBreaker.observer))
              .subscribe({
                next: (id) => {
                  const handler = this.getChromingInternalOrFail().getMarkerBar(id);
                  if (!handler) {
                    errorCompleteObserver(observer, new Error('Marker track could not be created'));
                    return;
                  }
                  nextCompleteObserver(observer, handler);
                },
                error: (error) => {
                  errorCompleteObserver(observer, error);
                },
              });
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  setThumbnailTrack(sourceOrUrl: string | Source | undefined, options?: TrackLoadOptions): Observable<void> {
    return passiveObservable((observer) => {
      if (sourceOrUrl) {
        this._chromingLocal
          .loadTrack(TrackType.THUMBNAIL_TRACK, sourceOrUrl, options)
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: (thumbnailTrack) => {
              this.getChromingInternalOrFail()
                .setThumbnailTrack(thumbnailTrack.id)
                .pipe(takeUntil(this._destroyBreaker.observer))
                .subscribe({
                  next: () => {
                    nextCompleteObserver(observer);
                  },
                  error: (error) => {
                    errorCompleteObserver(observer, error);
                  },
                });
            },
            error: (error) => {
              errorCompleteObserver(observer, error);
            },
          });
      } else {
        this.getChromingInternalOrFail()
          .setThumbnailTrack(undefined)
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
            error: (error) => {
              errorCompleteObserver(observer, error);
            },
          });
      }
    });
  }

  getMarkerBars(): ChromingMarkerBarHandlers {
    return this.getChromingInternalOrFail().getMarkerBars();
  }

  getMarkerBar(id: string): ChromingMarkerBarHandlerApi | undefined {
    return this.getChromingInternalOrFail().getMarkerBar(id);
  }

  deleteMarkerBar(id: string): Observable<void> {
    return this.getChromingInternalOrFail().deleteMarkerBar(id);
  }

  setVuMeterConfig(config: Partial<ChromingVuMeterConfig>, position?: ChromingVuMeterPosition): Observable<void> {
    return this.getChromingInternalOrFail().setVuMeterConfig(config, position);
  }

  getVuMeterConfig(position?: ChromingVuMeterPosition): ChromingVuMeterConfig {
    if (this.state.theme === ChromingTheme.DEFAULT || this.state.theme === ChromingTheme.OMAKASE) {
      return this._chromingLocal.domController.getVuMeterConfig(this.state.themeConfig as DefaultThemeConfig | OmakaseThemeConfig, position);
    } else {
      throw new Error('VU meter is not supported in current theme');
    }
  }

  destroy(): void {
    this._destroyBreaker.destroy();

    this._chromingLocal.destroy();
    this._chromingDetached?.destroy();
  }
}
