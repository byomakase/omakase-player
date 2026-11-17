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

import {Subject, takeUntil, type Observable} from 'rxjs';
import type {MarkerState, MarkerTrackState} from '../../media/marker-track';
import type {Ui} from '../../ui';
import type {UiProxy} from '../../remoting/impl/ui-proxy';
import type {ChromingMarkerBarElementEvent} from '../chroming-marker-bar';
import type {UiLiveModel} from '../../live/live-model';
import {OmakaseMarkerTrackAttributes, type OmakaseMarkerBar} from './omakase-marker-bar';
import {ControlBarComponent} from '../../control-bar/control-bar-component';
import type {MarkerSymbolResourceResolver} from '../marker-symbol-resource-resolver';

export class OmakaseMarkerBars extends ControlBarComponent(HTMLElement) {
  protected readonly _onEvent$ = new Subject<ChromingMarkerBarElementEvent>();

  private _markerBars: OmakaseMarkerBar[] = [];
  private _duration?: number;
  private _containerSize?: number;
  private _uiOrUiProxy?: Ui | UiProxy | undefined;
  private _symbolResourceResolver?: MarkerSymbolResourceResolver | undefined;

  private _liveModel?: UiLiveModel | undefined;

  set duration(duration: number) {
    this._duration = duration;
    for (const markerTrack of this._markerBars) {
      markerTrack.duration = this._duration;
    }
  }

  set containerSize(containerSize: number) {
    this._containerSize = containerSize;
    for (const markerTrack of this._markerBars) {
      markerTrack.containerSize = this._containerSize;
    }
  }

  /**
   * Events of all the marker bars
   */
  get onEvent$(): Observable<ChromingMarkerBarElementEvent> {
    return this._onEvent$.asObservable();
  }

  /**
   * Sets the UI used by the marker bars, also for the ones added later
   * @param ui
   */
  setUiOrUiProxy(ui: Ui | UiProxy) {
    this._uiOrUiProxy = ui;
    for (const markerTrack of this._markerBars) {
      markerTrack.setUiOrUiProxy(ui);
    }
  }

  setMarkerSymbolResourceResolver(resolver: MarkerSymbolResourceResolver) {
    this._symbolResourceResolver = resolver;
    for (const markerTrack of this._markerBars) {
      markerTrack.setMarkerSymbolResourceResolver(resolver);
    }
  }

  get markerBars(): OmakaseMarkerBar[] {
    return this._markerBars;
  }

  get isOmakase() {
    return this.hasAttribute(OmakaseMarkerTrackAttributes.OMAKASE);
  }

  set isOmakase(isOmakase: boolean) {
    if (isOmakase) {
      this.setAttribute(OmakaseMarkerTrackAttributes.OMAKASE, '');
    } else {
      this.removeAttribute(OmakaseMarkerTrackAttributes.OMAKASE);
    }
  }

  setLiveModel(model: UiLiveModel) {
    this._liveModel = model;
    for (const markerTrack of this._markerBars) {
      markerTrack.setLiveModel(model);
    }
  }

  addMarkerBar() {
    const markerBar = document.createElement('omakase-marker-bar') as OmakaseMarkerBar;
    this.appendChild(markerBar);
    return this.registerMarkerBar(markerBar);
  }

  /**
   * Registers the `<omakase-marker-bar>` children that weren't added with {@link addMarkerBar}, e.g. the ones declared in HTML
   * @returns The registered marker bars
   */
  adoptMarkerBars(): OmakaseMarkerBar[] {
    return Array.from(this.querySelectorAll<OmakaseMarkerBar>(':scope > omakase-marker-bar'))
      .filter((markerBar) => !this._markerBars.includes(markerBar))
      .map((markerBar) => this.registerMarkerBar(markerBar));
  }

  private registerMarkerBar(markerBar: OmakaseMarkerBar): OmakaseMarkerBar {
    if (this.isOmakase) {
      markerBar.isOmakase = true;
    }
    if (this._liveModel) {
      markerBar.setLiveModel(this._liveModel);
    }
    if (this._uiOrUiProxy) {
      markerBar.setUiOrUiProxy(this._uiOrUiProxy);
    }
    if (this._symbolResourceResolver) {
      markerBar.setMarkerSymbolResourceResolver(this._symbolResourceResolver);
    }
    markerBar.onEvent$.pipe(takeUntil(markerBar.destroy$)).subscribe((event) => this._onEvent$.next(event));
    markerBar.duration = this._duration ?? 0;
    markerBar.containerSize = this._containerSize;
    this.markerBars.push(markerBar);
    return markerBar;
  }

  deleteMarkerBar(barId: string) {
    const markerTrack = this._markerBars.find((track) => track.config.id === barId);
    if (markerTrack) {
      this._markerBars.splice(this._markerBars.indexOf(markerTrack), 1);
      markerTrack.remove();
    }
  }

  addMarker(trackId: string, marker: MarkerState) {
    const affectedMarkerTracks = this.findAffectedMarkerTracks(trackId);
    affectedMarkerTracks.forEach((markerTrack) => {
      markerTrack.addMarker(marker, trackId);
    });
  }

  updateMarker(trackId: string, marker: MarkerState) {
    const affectedMarkerTracks = this.findAffectedMarkerTracks(trackId);
    affectedMarkerTracks.forEach((markerTrack) => {
      markerTrack.updateMarker(marker);
    });
  }

  removeMarker(trackId: string, markerId: string) {
    const affectedMarkerTracks = this.findAffectedMarkerTracks(trackId);
    affectedMarkerTracks.forEach((markerTrack) => {
      markerTrack.removeMarker(markerId);
    });
  }

  updateMarkerTrackState(trackId: string, markerTrackState: MarkerTrackState) {
    const affectedMarkerTracks = this.findAffectedMarkerTracks(trackId);
    affectedMarkerTracks.forEach((markerTrack) => {
      markerTrack.updateTrack(markerTrackState);
    });
  }

  clearMarkerTracks() {
    this._markerBars = [];
    this.innerHTML = '';
  }

  protected findAffectedMarkerTracks(trackId: string): OmakaseMarkerBar[] {
    return this._markerBars.filter((track) => track.hasTrack(trackId));
  }
}
