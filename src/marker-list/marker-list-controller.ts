/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import { Subject } from 'rxjs';
import { MarkerApi } from '../api/marker-api';
import { MarkerAwareApi } from '../api/marker-aware-api';
import { MarkerInitEvent, MarkerCreateEvent, MarkerDeleteEvent, MarkerUpdateEvent } from '../types';
import { MarkerListItem } from './marker-list-item';

export class MarkerListController implements MarkerAwareApi {

  onMarkerInit$: Subject<MarkerInitEvent> = new Subject();
  onMarkerCreate$: Subject<MarkerCreateEvent> = new Subject();
  onMarkerDelete$: Subject<MarkerDeleteEvent> = new Subject();
  onMarkerUpdate$: Subject<MarkerUpdateEvent> = new Subject();

  private _markers: MarkerListItem[] = [];

  get name(): string {
    return '';
  }

  set markers(markers: MarkerApi[]) {
    this._markers = markers.map(marker => this.createMarker(marker));
    this.onMarkerInit$.next({ markers: this._markers });
  }

  getMarkers(): MarkerApi[] {
    return this._markers;
  }

  addMarker(markerData: Partial<MarkerApi>): MarkerApi {
    const marker = this.createMarker(markerData);
    this._markers.push(marker);
    this.onMarkerCreate$.next({ marker });
    return marker;
  }

  removeMarker(id: string): void {
    const marker = this._markers.find(m => m.id === id);
    if (!marker) {
      return;
    }
    this._markers.splice(this._markers.indexOf(marker), 1);
    this.onMarkerDelete$.next({ marker })
  }

  updateMarker(id: string, data: Partial<MarkerApi>): void {
    const marker = this._markers.find(m => m.id === id);
    if (!marker) {
      return;
    }
    Object.assign(marker, data);
    this.onMarkerUpdate$.next({ marker });
  }

  toggleMarker(id: string): void {
    return;
  }

  private createMarker(marker: Partial<MarkerApi>): MarkerListItem {
    return marker instanceof MarkerListItem ? marker : new MarkerListItem(marker, this);
  }


}