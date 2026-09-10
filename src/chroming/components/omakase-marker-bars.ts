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

import type {MarkerState, MarkerTrackState} from '../../media/marker-track';
import type {UiLiveModel} from '../../live/live-model';
import {OmakaseMarkerTrackAttributes, type OmakaseMarkerBar} from './omakase-marker-bar';

export class OmakaseMarkerBars extends HTMLElement {
  private _markerBars: OmakaseMarkerBar[] = [];
  private _mediaDuration?: number;
  private _containerSize?: number;

  private _liveModel?: UiLiveModel | undefined;

  set mediaDuration(mediaDuration: number) {
    this._mediaDuration = mediaDuration;
    for (const markerTrack of this._markerBars) {
      markerTrack.mediaDuration = this._mediaDuration;
    }
  }

  set containerSize(containerSize: number) {
    this._containerSize = containerSize;
    for (const markerTrack of this._markerBars) {
      markerTrack.containerSize = this._containerSize;
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
    if (this.isOmakase) {
      markerBar.isOmakase = true;
    }
    if (this._liveModel) {
      markerBar.setLiveModel(this._liveModel);
    }
    this.appendChild(markerBar);
    markerBar.mediaDuration = this._mediaDuration ?? 0;
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
