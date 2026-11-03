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

import {type MarkerTrack, TimedItemTemporalType} from '../../media';
import {SegmentationDomClasses} from '../segmentation-dom';
import {OmakaseSegmentationButton} from './base-segmentation-button';

export type OmakaseCreateMarkerFn = (track: MarkerTrack, currentTime: number) => void;

export class OmakaseCreateMarkerButton extends OmakaseSegmentationButton {
  private _onCreateMarker: OmakaseCreateMarkerFn | undefined;

  protected get iconClass(): string {
    return SegmentationDomClasses.mediaChromeCreateMarker;
  }

  protected get tooltipText(): string {
    return 'Create marker';
  }

  get onCreateMarker(): OmakaseCreateMarkerFn | undefined {
    return this._onCreateMarker;
  }

  set onCreateMarker(fn: OmakaseCreateMarkerFn | undefined) {
    this._onCreateMarker = fn;
  }

  protected isCapabilityActive(track: MarkerTrack): boolean {
    return !track.areTimedItemsLocked;
  }

  protected activate(track: MarkerTrack): void {
    const player = this.player;
    if (!player) {
      return;
    }
    const currentTime = player.getCurrentTime();
    if (this._onCreateMarker) {
      this._onCreateMarker(track, currentTime);
      return;
    }
    track.addTimedItems({temporal: {type: TimedItemTemporalType.MOMENT, time: `${currentTime}`}});
  }
}
