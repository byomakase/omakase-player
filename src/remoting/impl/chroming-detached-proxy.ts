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

import {BaseMessageChannelProxy} from '../message-channel-proxy';
import type {ChromingDetachedMessageChannel} from './chroming-detached-message-channel';
import {
  type AudioThemeConfig,
  type ChromelessThemeConfig,
  ChromelessThemeFloatingControl,
  type ChromingDetachedApi,
  type ChromingMarkerBarHandlers,
  ChromingTheme,
  type ChromingThemeConfigTypes,
  type ChromingThemeTypes,
  ChromingTimeFormat,
  ChromingTrackDestination,
  type ChromingVuMeterConfig,
  ChromingVuMeterPosition,
  type DefaultThemeConfig,
  DefaultThemeFloatingControl,
  type HelpMenuGroup,
  HelpMenuGroupInsertPosition,
  type OmakaseThemeConfig,
  OmakaseThemeFloatingControl,
  type StampThemeConfig,
  StampThemeFloatingControl,
  type VideoSafeZone,
} from '../../chroming';
import type {Destroyable} from '../../common/capabilities';
import {type ChromingSession, SessionStore} from '../../session';
import type {ChromingDomController} from '../../chroming/chroming-dom';
import {filter, Observable, takeUntil} from 'rxjs';
import {type ChromingEvent, ChromingEventType} from '../../chroming/chroming-event';
import type {ChromingState} from '../../chroming/chroming-state';
import {type PlayerInternalApi} from '../../player';
import {UnsupportedMethodInDetachedError} from '../../types';
import type {RemoteNode} from '../remote-node';
import {type ChromingMarkerBarConfig, type ChromingMarkerBarHandlerApi, type ChromingMarkerBarState} from '../../chroming/chroming-marker-bar';
import {ObserverBreaker} from '../../common/observer-breaker';
import type {ChromingMarkerBarHandlerProxy} from './chroming-marker-bar-handler-proxy';
import type {Track} from '../../media';
import type {OmpProvider} from '../../omp-provider';

export class ChromingDetachedProxy extends BaseMessageChannelProxy<ChromingDetachedMessageChannel> implements ChromingDetachedApi, Destroyable {
  protected _sessionStore: SessionStore;

  private _state?: ChromingState;
  private _remoteNode: RemoteNode;

  private _destroyBreaker = new ObserverBreaker();

  constructor(remoteNode: RemoteNode, ompProvider: OmpProvider) {
    super(remoteNode.getRemoteChannelOrFail('ChromingDetached'));

    this._sessionStore = ompProvider!.sessionStore;
    this._remoteNode = remoteNode;

    this.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type === ChromingEventType.CHROMING_CHANGE))
      .subscribe((event) => {
        this.updateFromState(event.data.chroming);
      });

    this.initialize();
  }

  protected initialize() {
    this.messageChannel
      .sendAndWaitForResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((chromingState) => {
        this.updateFromState(chromingState);
        this._onInitialized$.next(true);
      });
  }

  protected updateFromState(chromingState: ChromingState) {
    this._state = chromingState;
    this.updateChromingMarkerBarHandlerProxies();
  }

  protected updateChromingMarkerBarHandlerProxies() {
    let allTracks = [...this._state!.markerBars, this._state!.progressBarMarkerBar].filter((p) => p) as ChromingMarkerBarState[];
    allTracks.forEach((state) => {
      let proxy: ChromingMarkerBarHandlerProxy = this._remoteNode.getOrCreateProxy('ChromingMarkerBarHandler', state);
      proxy.updateFromState(state);
    });
  }

  get onEvent$(): Observable<ChromingEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  private checkLateInitialization() {
    if (!this._state) {
      throw new Error('Late to initialize chromingState');
    }
  }

  get chromingSession(): ChromingSession {
    return this._sessionStore.state.chroming;
  }

  get state(): ChromingState {
    this.checkLateInitialization();
    return this._state!;
  }

  get helpMenuGroups(): HelpMenuGroup[] {
    return this.state.helpMenuGroups;
  }

  get isFloatingTimeVisible(): boolean | undefined {
    switch (this.state.theme) {
      case ChromingTheme.DEFAULT:
        return (this.state.themeConfig as DefaultThemeConfig).floatingControls.includes(DefaultThemeFloatingControl.TIME);
      case ChromingTheme.CHROMELESS:
        return (this.state.themeConfig as ChromelessThemeConfig).floatingControls.includes(ChromelessThemeFloatingControl.TIME);
      case ChromingTheme.OMAKASE:
        return (this.state.themeConfig as OmakaseThemeConfig).floatingControls.includes(OmakaseThemeFloatingControl.TIME);
      case ChromingTheme.STAMP:
        return (this.state.themeConfig as StampThemeConfig).floatingControls.includes(StampThemeFloatingControl.TIME);
      default:
        return undefined;
    }
  }

  get timeFormat(): ChromingTimeFormat | undefined {
    if (
      this.state.theme === ChromingTheme.DEFAULT ||
      this.state.theme === ChromingTheme.AUDIO ||
      this.state.theme === ChromingTheme.CHROMELESS ||
      this.state.theme === ChromingTheme.OMAKASE ||
      this.state.theme === ChromingTheme.STAMP
    ) {
      return (this.state.themeConfig as DefaultThemeConfig | AudioThemeConfig | ChromelessThemeConfig | OmakaseThemeConfig | StampThemeConfig)?.timeFormat;
    } else {
      return void 0;
    }
  }

  get videoSafeZones(): VideoSafeZone[] {
    return this.state.safeZones;
  }

  addHelpMenuGroup(helpMenuGroup: HelpMenuGroup, insertPosition: HelpMenuGroupInsertPosition): Observable<HelpMenuGroup> {
    return this.messageChannel.sendAndWaitForResponse('addHelpMenuGroup', [helpMenuGroup, insertPosition]);
  }

  addSafeZone(videoSafeZone: Partial<VideoSafeZone>): Observable<VideoSafeZone> {
    return this.messageChannel.sendAndWaitForResponse('addSafeZone', [videoSafeZone]);
  }

  clearHelpMenuGroups(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('clearHelpMenuGroups');
  }

  removeAllSafeZones(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeAllSafeZones');
  }

  removeSafeZone(id: string): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeSafeZone', [id]);
  }

  restoreChromingSession(chromingSession: ChromingSession): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('restoreChromingSession', [chromingSession]);
  }

  setFloatingTimeVisible(visible: boolean): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setFloatingTimeVisible', [visible]);
  }

  setFloatingVuMeterVisible(visible: boolean): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setFloatingVuMeterVisible', [visible]);
  }

  setWatermark(watermark: string | undefined): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setWatermark', [watermark]);
  }

  addMarkerBar(trackId: Track['id'], destination: ChromingTrackDestination, config?: Partial<ChromingMarkerBarConfig>): Observable<ChromingMarkerBarState['id']> {
    return this.messageChannel.sendAndWaitForResponse('addMarkerBar', [trackId, destination, config]);
  }

  deleteMarkerBar(id: string): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('deleteMarkerBar', [id]);
  }

  getMarkerBars(): ChromingMarkerBarHandlers {
    return {
      [ChromingTrackDestination.PROGRESS_BAR]: this.state?.progressBarMarkerBar ? this._remoteNode.getOrCreateProxy('ChromingMarkerBarHandler', this.state.progressBarMarkerBar) : undefined,
      [ChromingTrackDestination.MARKER_BARS]: this.state?.markerBars.map((markerBarState) => this._remoteNode.getOrCreateProxy('ChromingMarkerBarHandler', markerBarState)) ?? [],
    };
  }

  getMarkerBar(id: string): ChromingMarkerBarHandlerApi | undefined {
    let state: ChromingMarkerBarState | undefined;
    if (id === this._state?.progressBarMarkerBar?.id) {
      state = this._state?.progressBarMarkerBar;
    } else {
      state = this._state?.markerBars.find((p) => p.id === id);
    }
    return state ? this._remoteNode.getOrCreateProxy('ChromingMarkerBarHandler', state) : void 0;
  }

  setThumbnailTrack(trackId: Track['id'] | undefined): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setThumbnailTrack', [trackId]);
  }

  setTimeFormat(timeFormat: ChromingTimeFormat): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setTimeFormat', [timeFormat]);
  }

  setThemeConfig(themeConfig: Partial<ChromingThemeConfigTypes>): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setThemeConfig', [themeConfig]);
  }

  setVuMeterConfig(config: Partial<ChromingVuMeterConfig>, position?: ChromingVuMeterPosition): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setVuMeterConfig', [config, position]);
  }

  toggleFullScreen(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('toggleFullScreen');
  }

  get domController(): ChromingDomController<ChromingThemeTypes> {
    throw new UnsupportedMethodInDetachedError();
  }

  setPlayerInternal(playerInternal: PlayerInternalApi): void {
    throw new UnsupportedMethodInDetachedError();
  }

  destroy() {
    super.destroy();
    this._destroyBreaker.destroy();
  }
}
