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

import {MarkerListItem} from '../marker-list-item';
import {type MarkerListComponentModeController} from './marker-list-component-mode-controller';

export class TimelineMarkerListComponentModeController implements MarkerListComponentModeController {
  public isReorderingEnabled(): boolean {
    return false;
  }

  public sortMarkers(markers: MarkerListItem[]): MarkerListItem[] {
    return markers.sort((a, b) => {
      if (a.numStart !== undefined && b.numStart !== undefined && a.numStart !== b.numStart) {
        return a.numStart - b.numStart;
      } else if (a.numEnd !== undefined && b.numEnd !== undefined && a.numEnd !== b.numEnd) {
        return a.numEnd - b.numEnd;
      } else {
        return 0;
      }
    });
  }

  public getNextMarker(markers: MarkerListItem[], marker: MarkerListItem): MarkerListItem | undefined {
    const sortedMarkers = this.sortMarkers(markers);
    return sortedMarkers.find(
      (m) =>
        m.numStart !== undefined &&
        marker.numStart !== undefined &&
        (m.numStart > marker.numStart || (m.numStart === marker.numStart && m.numEnd !== undefined && marker.numEnd !== undefined && m.numEnd > marker.numEnd))
    );
  }
}
