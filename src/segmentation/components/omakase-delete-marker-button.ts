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

import {type Marker, type MarkerTrack} from '../../media';
import {SegmentationDomClasses} from '../segmentation-dom';
import {OmakaseSegmentationButton} from './base-segmentation-button';

export type OmakaseDeleteMarkerFn = (track: MarkerTrack, markers: Marker[]) => void;

export class OmakaseDeleteMarkerButton extends OmakaseSegmentationButton {
  private _onDeleteMarker: OmakaseDeleteMarkerFn | undefined;

  protected get iconClass(): string {
    return SegmentationDomClasses.mediaChromeDeleteMarker;
  }

  protected get tooltipText(): string {
    return 'Delete marker';
  }

  get onDeleteMarker(): OmakaseDeleteMarkerFn | undefined {
    return this._onDeleteMarker;
  }

  set onDeleteMarker(fn: OmakaseDeleteMarkerFn | undefined) {
    this._onDeleteMarker = fn;
  }

  protected isCapabilityActive(track: MarkerTrack): boolean {
    return !track.areTimedItemsLocked && this.resolveActiveMarkers(track).length > 0;
  }

  protected activate(track: MarkerTrack): void {
    const markers = this.resolveActiveMarkers(track);
    if (markers.length === 0) {
      return;
    }
    if (this._onDeleteMarker) {
      this._onDeleteMarker(track, markers);
      return;
    }
    track.deleteTimedItems(markers.map((marker) => marker.id));
    for (const marker of markers) {
      this.ui?.updateElement({id: marker.id, props: {focused: undefined}});
    }
  }
}
