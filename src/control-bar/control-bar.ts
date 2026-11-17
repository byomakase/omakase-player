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

import type {MediaController} from 'media-chrome';
import 'media-chrome';
import {filter, takeUntil} from 'rxjs';
import '../chroming/components';
import '../segmentation/components';
import './components';
import {MarkerTrack, type MarkerState, ThumbnailTrack, type TimedItemsTrackEvent, TimedItemsTrackEventType, type Track} from '../media';
import {PlayerEventType} from '../player/player-event';
import {ChromingMarkerBarElementEventType, type ChromingMarkerUpdateData} from '../chroming/chroming-marker-bar';
import {ControlBarMarkerBar, type ControlBarMarkerBarApi} from './control-bar-marker-bar';
import type {Ui} from '../ui';
import type {OmakaseControlBarRow} from './components/omakase-control-bar-row';
import {OmakaseTimeRange} from '../chroming/components/omakase-time-range';
import {OmakaseTimeDisplay} from '../chroming/components/omakase-time-display';
import {OmakaseTimeToggle} from '../chroming/components/omakase-time-toggle';
import {OmakaseVuMeterToggle} from '../chroming/components/omakase-vu-meter-toggle';
import {OmakaseSafeZoneToggle} from '../chroming/components/omakase-safe-zone-toggle';
import {OmakaseLiveButton} from '../chroming/components/omakase-live-button';
import {OmakaseDetachToggle} from '../chroming/components/omakase-detach-toggle';
import {LivePlaybackTracker, type UiLiveModel} from '../live/live-model';
import {OmakaseMarkerBars} from '../chroming/components/omakase-marker-bars';
import {OmakasePreviewThumbnail} from '../chroming/components/omakase-preview-thumbnail';
import {ChromingEventType} from '../chroming/chroming-event';
import {OmakaseSegmentationButton} from '../segmentation/components/base-segmentation-button';
import {OmakaseMarkButton} from '../segmentation/components/base-mark-button';
import {ChromingUtil} from '../chroming/chroming-util';
import {ChromingDomClasses} from '../chroming/chroming-dom';
import type {OmakasePlayerApi} from '../omakase-player-api';
import type {PlayerApi, PlayerDetachedApi} from '../player';
import type {PlayerPlayback} from '../player/player';
import {DomUtil} from '../dom/dom-util';
import type {Destroyable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import {ControlBarComponentAttributes, type ControlBarComponentApi, isControlBarComponent} from './control-bar-component';
import {LocalMarkerSymbolResourceResolver, type MarkerSymbolResourceResolver} from '../chroming/marker-symbol-resource-resolver';
import {type ControlBarKeyboardShortcuts, type ControlBarShortcutBindingEntry, ControlBarShortcutRegistry, type ControlBarShortcutTarget, createShortcutBindings} from './control-bar-shortcuts';

/**
 * Public API of a standalone control bar
 * @document ../../docs/static/control-bar/README.md
 */
export interface ControlBarApi {
  /**
   * Gets an HTML element from the control bar DOM
   * @param querySelector HTML query selector
   */
  getControlBarElement<T>(querySelector: string): T;

  /**
   * Shows or hides a component of the control bar
   * @param componentId `id` attribute of the component
   * @param visible
   */
  setVisible(componentId: string, visible: boolean): void;

  /**
   * Enables or disables a component of the control bar
   * @param componentId `id` attribute of the component
   * @param enabled
   */
  setEnabled(componentId: string, enabled: boolean): void;

  /**
   * Sets the key of a component's keyboard shortcut, overriding the key of its action, or restores the action's key when `undefined`
   * @param componentId `id` attribute of the component
   * @param shortcut Key string, e.g. `Shift+J`
   */
  setShortcut(componentId: string, shortcut: string | undefined): void;

  /**
   * Enables or disables a component's keyboard shortcut
   * @param componentId `id` attribute of the component
   * @param enabled
   */
  setShortcutEnabled(componentId: string, enabled: boolean): void;

  /**
   * Sets an attribute of a component of the control bar, or removes it when `value` is `undefined`
   * @param componentId `id` attribute of the component
   * @param attribute Attribute name
   * @param value Attribute value
   */
  setAttribute(componentId: string, attribute: string, value: string | undefined): void;

  /**
   * Marker bars API
   */
  markerBar: ControlBarMarkerBarApi;
}

export enum ControlBarTheme {
  DEFAULT = 'DEFAULT',
  OMAKASE = 'OMAKASE',
}

export interface ControlBarConfig {
  controlBarHTMLElementId: string;
  templateHTMLElementId: string;
  theme?: ControlBarTheme;
  keyboardShortcutsEnabled?: boolean;
  keyboardShortcuts?: ControlBarKeyboardShortcuts;
}

const configDefault: ControlBarConfig = {
  controlBarHTMLElementId: 'omakase-control-bar',
  templateHTMLElementId: 'omakase-control-bar-template',
  keyboardShortcutsEnabled: true,
};

const themeClasses: Record<ControlBarTheme, string> = {
  [ControlBarTheme.DEFAULT]: 'omakase-control-bar-theme-default',
  [ControlBarTheme.OMAKASE]: 'omakase-control-bar-theme-omakase',
};

const TEMPLATE_THEME_ATTRIBUTE = 'theme';

const parseTheme = (value: string | null): ControlBarTheme | undefined => Object.values(ControlBarTheme).find((theme) => theme.toLowerCase() === value?.trim().toLowerCase());

const themeIconSlots: Record<string, [slot: string, className: string][]> = {
  'omakase-play-button': [
    ['play', ChromingDomClasses.mediaChromePlay],
    ['pause', ChromingDomClasses.mediaChromePause],
  ],
  'omakase-mute-button': [
    ['high', ChromingDomClasses.mediaChromeAudioHigh],
    ['medium', ChromingDomClasses.mediaChromeAudioMedium],
    ['low', ChromingDomClasses.mediaChromeAudioLow],
    ['off', ChromingDomClasses.mediaChromeAudioMute],
  ],
  'omakase-fullscreen-button': [
    ['enter', ChromingDomClasses.mediaChromeFullscreenEnter],
    ['exit', ChromingDomClasses.mediaChromeFullscreenExit],
  ],
};

const timedItemsEventTypes = new Set<TimedItemsTrackEventType>([
  TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED,
  TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED,
  TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED,
]);

const MARKER_BARS_PLAYHEAD_CLASS = 'omakase-marker-bars-playhead';
const MARKER_BARS_PLAYHEAD_POSITION = '--_omakase-marker-bars-playhead-position';

const markerBarsPlayheadEventTypes = new Set<PlayerEventType>([
  PlayerEventType.PLAYER_MAIN_MEDIA_LOADED,
  PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED,
  PlayerEventType.PLAYER_PLAYBACK_PROGRESS,
  PlayerEventType.PLAYER_SEEKING,
  PlayerEventType.PLAYER_SEEKED,
]);

interface PlayerAwareElement extends HTMLElement {
  player?: PlayerApi | PlayerDetachedApi;
}

export class ControlBar implements ControlBarApi, Destroyable {
  private _config: ControlBarConfig;
  private _containerElement: HTMLElement;
  private _controlBarElement: HTMLElement;
  private _mediaController: MediaController;
  private _destroyBreaker = new ObserverBreaker();
  private _timeRanges: OmakaseTimeRange[] = [];
  private _markerBarsResizeObserver?: ResizeObserver;
  private _shortcutTarget?: ControlBarShortcutTarget;
  private _livePlaybackTracker?: LivePlaybackTracker;
  private _track: OmakasePlayerApi['track'];
  private _markerBar: ControlBarMarkerBar;
  /** Components disabled by the control bar while no main media is loaded */
  private _disabledWithoutMedia = new Set<Element>();
  private _disabledObserver?: MutationObserver;
  private _liveModel?: UiLiveModel;
  /** Re-reads the playhead time, e.g. when the live window moves */
  private _syncMarkerBarsPlayhead?: () => void;
  private _markerBarsPlayheadFrame = 0;
  private _destroyed = false;

  constructor(config: ControlBarConfig, player: OmakasePlayerApi) {
    this._config = {
      ...configDefault,
      ...config,
    };
    this._config.theme =
      this._config.theme ?? parseTheme(DomUtil.getElementById<HTMLElement>(this._config.templateHTMLElementId)?.getAttribute(TEMPLATE_THEME_ATTRIBUTE) ?? null) ?? ControlBarTheme.DEFAULT;

    this._track = player.track;
    this._containerElement = DomUtil.getElementByIdOrFail<HTMLElement>(this._config.controlBarHTMLElementId);
    // parsed upfront, so that invalid keys fail before anything is rendered
    const shortcutBindings: ControlBarShortcutBindingEntry[] = this._config.keyboardShortcutsEnabled ? createShortcutBindings(this._config.keyboardShortcuts) : [];

    this._controlBarElement = this.createDom();
    this._markerBar = new ControlBarMarkerBar(this._controlBarElement, player.track);

    this._mediaController = player.chroming.getPlayerChromingElement<MediaController>('media-controller');
    this._mediaController.associateElement(this._controlBarElement);

    this.wireElements(player);
    this._markerBar._addDeclaredMarkerBars();
    this.wireMainMediaLoaded(player.player);

    if (this._config.keyboardShortcutsEnabled) {
      this._shortcutTarget = {element: this._controlBarElement, player: player.player, bindings: shortcutBindings};
      ControlBarShortcutRegistry.register(this._shortcutTarget);
    }
  }

  private createDom(): HTMLElement {
    const controlBarElement = document.createElement('media-control-bar');
    controlBarElement.classList.add(themeClasses[this._config.theme ?? ControlBarTheme.DEFAULT]);

    const template = DomUtil.getElementById<HTMLElement>(this._config.templateHTMLElementId);
    if (template instanceof HTMLTemplateElement) {
      controlBarElement.appendChild(document.importNode(template.content, true));
    } else if (template) {
      controlBarElement.innerHTML = template.innerHTML;
    }

    this.addThemeIcons(controlBarElement);

    controlBarElement.querySelectorAll<OmakaseControlBarRow>('omakase-control-bar-row').forEach((row) => row.initializeDom());

    this._containerElement.appendChild(controlBarElement);
    return controlBarElement;
  }

  private addThemeIcons(controlBarElement: HTMLElement) {
    for (const [selector, slots] of Object.entries(themeIconSlots)) {
      controlBarElement.querySelectorAll(selector).forEach((element) => {
        for (const [slot, className] of slots) {
          if (!element.querySelector(`:scope > [slot="${slot}"]`)) {
            const icon = document.createElement('span');
            icon.slot = slot;
            icon.className = className;
            element.appendChild(icon);
          }
        }
      });
    }
  }

  private wireElements(omakasePlayer: OmakasePlayerApi) {
    const {player, chroming, track, ui, localization} = omakasePlayer;
    const elements = [this._controlBarElement, ...Array.from(this._controlBarElement.querySelectorAll<HTMLElement>('*'))] as PlayerAwareElement[];
    const markerBars: OmakaseMarkerBars[] = [];
    const previewThumbnails: OmakasePreviewThumbnail[] = [];
    const liveButtons: OmakaseLiveButton[] = [];

    for (const element of elements) {
      if ('player' in element) {
        element.player = player;
      }

      if (element instanceof OmakaseTimeRange) {
        this._timeRanges.push(element);
        element.setUiOrUiProxy(ui as Ui);
        element.onSeek$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
          next: (time) => {
            player.seekTo(time);
          },
        });
      }

      if (element instanceof OmakaseTimeDisplay) {
        const timeRangeAncestor = element.closest('omakase-time-range');
        if (timeRangeAncestor instanceof OmakaseTimeRange) {
          element.timeRange = timeRangeAncestor;
        }
      }

      if (element instanceof OmakaseMarkerBars) {
        markerBars.push(element);
      }

      if (element instanceof OmakasePreviewThumbnail) {
        const timeRangeAncestor = element.closest('omakase-time-range');
        if (timeRangeAncestor instanceof OmakaseTimeRange) {
          element.timeRange = timeRangeAncestor;
          previewThumbnails.push(element);
        }
      }

      if (element instanceof OmakaseTimeToggle) {
        element.chroming = chroming;
      }

      if (element instanceof OmakaseVuMeterToggle) {
        element.chroming = chroming;
      }

      if (element instanceof OmakaseSafeZoneToggle) {
        element.chroming = chroming;
      }

      if (element instanceof OmakaseDetachToggle) {
        element.omakasePlayer = omakasePlayer;
      }

      if (element instanceof OmakaseSegmentationButton) {
        element.track = track;
        element.ui = ui;
      }

      if (element instanceof OmakaseMarkButton) {
        element.localization = localization;
      }

      if (element instanceof OmakaseLiveButton) {
        element.localization = localization;
        liveButtons.push(element);
      }
    }

    if (previewThumbnails.length > 0) {
      this.wirePreviewThumbnails(previewThumbnails, chroming, track);
    }

    if (markerBars.length > 0) {
      this.wireMarkerBars(player, ui as Ui, new LocalMarkerSymbolResourceResolver(omakasePlayer.resource), markerBars);
      this.wireMarkerBarsPlayhead(player, markerBars);
      this._markerBarsResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const bars = entry.target as OmakaseMarkerBars;
          bars.containerSize = entry.borderBoxSize?.[0]?.inlineSize ?? bars.offsetWidth;
        }
      });
      for (const bars of markerBars) {
        this._markerBarsResizeObserver.observe(bars);
      }
    }

    if (this._timeRanges.length > 0 || markerBars.length > 0) {
      this.wireMarkers(track, this._timeRanges, markerBars);
    }

    if (liveButtons.length > 0 || this._timeRanges.length > 0 || markerBars.length > 0) {
      this.wireLive(player, liveButtons, this._timeRanges, markerBars);
    }
  }

  private wireMainMediaLoaded(player: OmakasePlayerApi['player']) {
    this._disabledObserver = new MutationObserver((records) => this.forgetChangedComponents(records));
    this._disabledObserver.observe(this._controlBarElement, {subtree: true, attributes: true, attributeFilter: [ControlBarComponentAttributes.DISABLED]});

    const setMainMediaLoaded = (loaded: boolean) => {
      this.forgetChangedComponents(this._disabledObserver!.takeRecords());
      if (loaded) {
        this._disabledWithoutMedia.forEach((component) => component.removeAttribute(ControlBarComponentAttributes.DISABLED));
        this._disabledWithoutMedia.clear();
      } else {
        for (const component of Array.from(this._controlBarElement.querySelectorAll('*')).filter(isControlBarComponent)) {
          if (!component.hasAttribute(ControlBarComponentAttributes.DISABLED)) {
            component.setAttribute(ControlBarComponentAttributes.DISABLED, '');
            this._disabledWithoutMedia.add(component);
          }
        }
      }
      this._disabledObserver!.takeRecords();
    };

    setMainMediaLoaded(player.isMainMediaLoaded);
    player.onEvent$
      .pipe(
        filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED || event.type === PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((event) => setMainMediaLoaded(event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED));
  }

  private forgetChangedComponents(records: MutationRecord[]) {
    records.forEach((record) => this._disabledWithoutMedia.delete(record.target as Element));
  }

  private wireMarkerBars(player: OmakasePlayerApi['player'], ui: Ui, symbolResourceResolver: MarkerSymbolResourceResolver, markerBars: OmakaseMarkerBars[]) {
    const setMediaDuration = () => markerBars.forEach((bars) => (bars.duration = player.getDuration()));
    if (player.isMainMediaLoaded) {
      setMediaDuration();
    }
    player.onEvent$
      .pipe(
        filter(
          (event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED || event.type === PlayerEventType.PLAYER_MAIN_MEDIA_UPDATED || event.type === PlayerEventType.PLAYER_SESSION_RESTORED
        ),
        filter(() => player.isMainMediaLoaded),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe(() => setMediaDuration());

    for (const bars of markerBars) {
      bars.setUiOrUiProxy(ui);
      bars.setMarkerSymbolResourceResolver(symbolResourceResolver);
      // markers dragged on a marker bar are moved on their track
      bars.onEvent$
        .pipe(
          filter((event) => event.type === ChromingMarkerBarElementEventType.CHROMING_MARKER_UPDATE),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe((event) => this.updateMarker(bars, event.data as ChromingMarkerUpdateData));
    }
  }

  /**
   * Shows the playhead position on the marker bars, as a fraction of the media duration, or of the live window
   */
  private wireMarkerBarsPlayhead(player: OmakasePlayerApi['player'], markerBars: OmakaseMarkerBars[]) {
    let syncedTime = 0;
    let syncedAt = 0;
    let playback: PlayerPlayback | undefined = player.isMainMediaLoaded ? player.playerSession.playback : undefined;

    const render = (time: number | undefined) => {
      const live = this._liveModel?.isLive;
      const start = live ? this._liveModel!.windowStart : 0;
      const end = live ? this._liveModel!.windowEnd : time !== undefined ? player.getDuration() : 0;
      const position = time !== undefined && end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : undefined;
      for (const bars of markerBars) {
        bars.classList.toggle(MARKER_BARS_PLAYHEAD_CLASS, position !== undefined);
        if (position !== undefined) {
          bars.style.setProperty(MARKER_BARS_PLAYHEAD_POSITION, `${position}`);
        } else {
          bars.style.removeProperty(MARKER_BARS_PLAYHEAD_POSITION);
        }
      }
    };

    const isAdvancing = () =>
      player.isMainMediaLoaded && !!playback && playback.playing && !playback.waiting && !playback.seeking && !playback.waitingSyncedMedia && !playback.ended && playback.playbackRate > 0;

    const animate = () => {
      this._markerBarsPlayheadFrame = requestAnimationFrame(animate);
      render(syncedTime + ((performance.now() - syncedAt) / 1000) * playback!.playbackRate);
    };

    const stopAnimation = () => {
      if (this._markerBarsPlayheadFrame) {
        cancelAnimationFrame(this._markerBarsPlayheadFrame);
        this._markerBarsPlayheadFrame = 0;
      }
    };

    const sync = (time?: number) => {
      const loaded = player.isMainMediaLoaded;
      syncedTime = time ?? (loaded ? player.getCurrentTime() : 0);
      syncedAt = performance.now();
      render(loaded ? syncedTime : undefined);
      if (isAdvancing()) {
        if (!this._markerBarsPlayheadFrame) {
          this._markerBarsPlayheadFrame = requestAnimationFrame(animate);
        }
      } else {
        stopAnimation();
      }
    };

    this._syncMarkerBarsPlayhead = () => sync();
    sync();
    player.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      if (event.type === PlayerEventType.PLAYER_PLAYBACK_CHANGE) {
        playback = event.data.playerPlayback;
        sync();
      } else if (event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED || event.type === PlayerEventType.PLAYER_SESSION_RESTORED) {
        playback = player.isMainMediaLoaded ? player.playerSession.playback : undefined;
        sync();
      } else if (event.type === PlayerEventType.PLAYER_PLAYBACK_RATE_UPDATE) {
        playback = playback ? {...playback, playbackRate: event.data.playbackRate} : playback;
        sync();
      } else if (event.type === PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED) {
        playback = undefined;
        sync();
      } else if (event.type === PlayerEventType.PLAYER_SEEKING) {
        playback = playback ? {...playback, seeking: true} : playback;
        sync(event.data.toTime);
      } else if (markerBarsPlayheadEventTypes.has(event.type)) {
        sync();
      }
    });
  }

  private updateMarker(markerBars: OmakaseMarkerBars, {track, item, attrs}: ChromingMarkerUpdateData) {
    const markerTrack = this._track.get(track.id);
    try {
      if (!(markerTrack instanceof MarkerTrack)) {
        throw new Error(`Marker track ${track.id} not found`);
      }
      markerTrack.updateTimedItem(item.id, attrs);
    } catch (error) {
      // the marker returns to where it was
      markerBars.updateMarker(track.id, item);
      console.error(error);
    }
  }

  private wireLive(player: OmakasePlayerApi['player'], liveButtons: OmakaseLiveButton[], timeRanges: OmakaseTimeRange[], markerBars: OmakaseMarkerBars[]) {
    this._livePlaybackTracker = new LivePlaybackTracker();
    this._livePlaybackTracker.wirePlayer(player);
    this._livePlaybackTracker.onChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((model) => {
      liveButtons.forEach((liveButton) => liveButton.setLiveModel(model));
      timeRanges.forEach((timeRange) => timeRange.setLiveModel(model));
      markerBars.forEach((bars) => bars.setLiveModel(model));
      this._liveModel = model;
      this._syncMarkerBarsPlayhead?.();
    });
  }

  private wireMarkers(track: OmakasePlayerApi['track'], timeRanges: OmakaseTimeRange[], markerBars: OmakaseMarkerBars[]) {
    track.onTrackEvent$
      .pipe(
        filter((event: any) => timedItemsEventTypes.has(event.type)),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((event: TimedItemsTrackEvent) => {
        const trackId = event.data.trackId;
        const items = event.data.updatedTimedItems as MarkerState[];
        const trackTimeRanges = timeRanges.filter((timeRange) => timeRange.hasTrack(trackId));
        switch (event.type) {
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED:
            for (const item of items) {
              markerBars.forEach((bars) => bars.addMarker(trackId, item));
              trackTimeRanges.forEach((timeRange) => timeRange.addMarker(item, trackId));
            }
            break;
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED:
            for (const item of items) {
              markerBars.forEach((bars) => bars.updateMarker(trackId, item));
              trackTimeRanges.forEach((timeRange) => timeRange.updateMarker(item));
            }
            break;
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED:
            for (const item of items) {
              markerBars.forEach((bars) => bars.removeMarker(trackId, item.id));
              trackTimeRanges.forEach((timeRange) => timeRange.removeMarker(item.id));
            }
            break;
        }
      });
  }

  private wirePreviewThumbnails(previewThumbnails: OmakasePreviewThumbnail[], chroming: OmakasePlayerApi['chroming'], track: OmakasePlayerApi['track']) {
    let thumbnailTrackId: Track['id'] | undefined;
    const setThumbnailTrack = (trackId: Track['id'] | undefined) => {
      thumbnailTrackId = trackId;
      const thumbnailTrack = trackId ? track.get(trackId) : undefined;
      for (const previewThumbnail of previewThumbnails) {
        previewThumbnail.thumbnailTrack = thumbnailTrack instanceof ThumbnailTrack ? thumbnailTrack.state : undefined;
      }
    };

    for (const previewThumbnail of previewThumbnails) {
      previewThumbnail.thumbnailFn = (trackId, time) => ChromingUtil.findThumbnail(track, trackId, time);
    }
    setThumbnailTrack(chroming.state.thumbnailTrackId);

    chroming.onEvent$
      .pipe(
        filter((event) => event.type === ChromingEventType.CHROMING_THUMBNAIL_TRACK_CHANGE),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((event) => {
        setThumbnailTrack(event.data.thumbnailTrackId);
      });

    track.onTrackEvent$
      .pipe(
        filter((event: any) => thumbnailTrackId !== undefined && timedItemsEventTypes.has(event.type) && event.data?.trackId === thumbnailTrackId),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe(() => {
        setThumbnailTrack(thumbnailTrackId);
      });
  }

  get markerBar(): ControlBarMarkerBarApi {
    return this._markerBar;
  }

  getControlBarElement<T>(querySelector: string): T {
    return (this._controlBarElement.querySelector(querySelector) ?? this._controlBarElement.shadowRoot?.querySelector(querySelector)) as T;
  }

  setVisible(componentId: string, visible: boolean): void {
    const component = this.getComponentOrFail(componentId);
    if (isControlBarComponent(component)) {
      component.setVisible(visible);
    } else {
      component.hidden = !visible;
    }
  }

  setEnabled(componentId: string, enabled: boolean): void {
    this.getControlBarComponentOrFail(componentId).setEnabled(enabled);
  }

  setShortcut(componentId: string, shortcut: string | undefined): void {
    this.getControlBarComponentOrFail(componentId).setShortcut(shortcut);
  }

  setShortcutEnabled(componentId: string, enabled: boolean): void {
    this.getControlBarComponentOrFail(componentId).setShortcutEnabled(enabled);
  }

  setAttribute(componentId: string, attribute: string, value: string | undefined): void {
    DomUtil.setAttribute(this.getComponentOrFail(componentId), attribute, value);
  }

  private getComponentOrFail(componentId: string): HTMLElement {
    const component = this._controlBarElement.querySelector<HTMLElement>(`#${CSS.escape(componentId)}`);
    if (!component) {
      throw new Error(`Component with id "${componentId}" not found in the control bar`);
    }
    return component;
  }

  private getControlBarComponentOrFail(componentId: string): HTMLElement & ControlBarComponentApi {
    const component = this.getComponentOrFail(componentId);
    if (!isControlBarComponent(component)) {
      throw new Error(`Element with id "${componentId}" is not a control bar component`);
    }
    return component;
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this._destroyBreaker.destroy();
    if (this._markerBarsPlayheadFrame) {
      cancelAnimationFrame(this._markerBarsPlayheadFrame);
      this._markerBarsPlayheadFrame = 0;
    }
    this._livePlaybackTracker?.destroy();
    if (this._shortcutTarget) {
      ControlBarShortcutRegistry.unregister(this._shortcutTarget);
    }
    this._markerBarsResizeObserver?.disconnect();
    this._disabledObserver?.disconnect();
    this._markerBar.destroy();
    for (const timeRange of this._timeRanges) {
      timeRange.destroy();
    }
    this._mediaController.unassociateElement(this._controlBarElement);
    this._controlBarElement.remove();
  }
}
