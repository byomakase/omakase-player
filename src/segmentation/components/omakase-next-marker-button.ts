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

import {type MarkerTrack} from '../../media';
import {SegmentationDomClasses} from '../segmentation-dom';
import {OmakaseSegmentationButton} from './base-segmentation-button';

export class OmakaseNextMarkerButton extends OmakaseSegmentationButton {
  protected get iconClass(): string {
    return SegmentationDomClasses.mediaChromeNextMarker;
  }

  protected get tooltipText(): string {
    return 'Select next marker';
  }

  protected isCapabilityActive(track: MarkerTrack): boolean {
    return track.timedItems.length > 0;
  }

  protected activate(track: MarkerTrack): void {
    const sorted = track.timedItemsSorted;
    if (sorted.length === 0) {
      return;
    }

    const activeMarkers = this.resolveActiveMarkers(track);
    const ui = this.ui;
    for (const marker of activeMarkers) {
      ui?.updateElement({id: marker.id, props: {focused: undefined}});
    }

    let next = sorted[0];
    if (activeMarkers.length > 0) {
      const rightMostIndex = sorted.indexOf(activeMarkers[activeMarkers.length - 1]!);
      next = rightMostIndex >= 0 && rightMostIndex < sorted.length - 1 ? sorted[rightMostIndex + 1] : undefined;
    }

    if (next) {
      ui?.updateElement({id: next.id, props: {focused: true}});
    }
  }
}
