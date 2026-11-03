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

import {type Marker, MarkerType, type MarkerTrack, TimedItemTemporalType, TimedItemTemporalUtil} from '../../media';
import {SegmentationDomClasses} from '../segmentation-dom';
import {OmakaseMarkButton} from './base-mark-button';

export type OmakaseMarkInFn = (track: MarkerTrack, currentTime: number, marker: Marker | undefined) => void;

export class OmakaseMarkInButton extends OmakaseMarkButton {
  private _onMarkIn: OmakaseMarkInFn | undefined;

  protected get iconClass(): string {
    return SegmentationDomClasses.mediaChromeMarkIn;
  }

  protected get tooltipText(): string {
    return 'Mark in';
  }

  protected get defaultLabel(): string {
    return this.localization?.get('markIn') ?? 'MARK IN';
  }

  get onMarkIn(): OmakaseMarkInFn | undefined {
    return this._onMarkIn;
  }

  set onMarkIn(fn: OmakaseMarkInFn | undefined) {
    this._onMarkIn = fn;
  }

  protected resolveDisplayTime(marker: Marker): number | undefined {
    return TimedItemTemporalUtil.extractStartTime(marker.temporal);
  }

  protected isCapabilityActive(track: MarkerTrack): boolean {
    if (track.areTimedItemsLocked) {
      return false;
    }
    const markers = this.resolveActiveMarkers(track);
    if (markers.length > 1) {
      return false;
    }
    if (markers.length === 0) {
      return true;
    }
    const marker = markers[0]!;
    if (marker.markerType === MarkerType.MOMENT_MARKER) {
      return true;
    }
    const player = this.player;
    if (!player) {
      return false;
    }
    const end = TimedItemTemporalUtil.extractEndTime(marker.temporal);
    return end === undefined || player.getCurrentTime() < end;
  }

  protected activate(track: MarkerTrack): void {
    const player = this.player;
    if (!player) {
      return;
    }
    const currentTime = player.getCurrentTime();
    const markers = this.resolveActiveMarkers(track);
    if (markers.length > 1) {
      return;
    }
    const marker = markers.length === 1 ? markers[0] : undefined;

    if (this._onMarkIn) {
      this._onMarkIn(track, currentTime, marker);
      return;
    }

    if (!marker) {
      track.addTimedItems({temporal: {type: TimedItemTemporalType.SPAN_START, start: `${currentTime}`}});
      // Selected so a subsequent Mark-Out (or any other segmentation capability) acts on it.
      const newMarker = track.timedItems[track.timedItems.length - 1];
      if (newMarker) {
        this.ui?.updateElement({id: newMarker.id, props: {focused: true}});
      }
      return;
    }

    if (marker.markerType === MarkerType.MOMENT_MARKER) {
      track.updateTimedItem(marker.id, {temporal: {type: TimedItemTemporalType.MOMENT, time: `${currentTime}`}});
      return;
    }

    const end = TimedItemTemporalUtil.extractEndTime(marker.temporal);
    if (end === undefined) {
      track.updateTimedItem(marker.id, {temporal: {type: TimedItemTemporalType.SPAN_START, start: `${currentTime}`}});
    } else if (currentTime < end) {
      track.updateTimedItem(marker.id, {temporal: {type: TimedItemTemporalType.SPAN, start: `${currentTime}`, end: `${end}`}});
    }
  }
}
