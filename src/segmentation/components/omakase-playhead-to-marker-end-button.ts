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

import type {MarkerTrack} from '../../media';
import {TimedItemTemporalUtil} from '../../media';
import {SegmentationDomClasses} from '../segmentation-dom';
import {OmakaseSegmentationButton} from './base-segmentation-button';

export class OmakasePlayheadToMarkerEndButton extends OmakaseSegmentationButton {
  protected get iconClass(): string {
    return SegmentationDomClasses.mediaChromePlayheadToMarkerEnd;
  }

  protected get tooltipText(): string {
    return 'Align playhead to marker end';
  }

  protected isCapabilityActive(track: MarkerTrack): boolean {
    return !!this.resolveActiveMarker(track);
  }

  protected activate(track: MarkerTrack): void {
    const marker = this.resolveActiveMarker(track);
    const player = this.player;
    if (!marker || !player) {
      return;
    }
    const time = TimedItemTemporalUtil.extractEndTime(marker.temporal);
    if (time !== undefined) {
      player.pause().subscribe(() => {
        player.seekTo(time).subscribe();
      });
    }
  }
}
