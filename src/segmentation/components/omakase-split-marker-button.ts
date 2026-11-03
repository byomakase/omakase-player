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

import {filter, takeUntil} from 'rxjs';
import {MediaTemporalFormat} from '../../common';
import {type MarkerTrack, MarkerType, TimedItemTemporalType, TimedItemTemporalUtil} from '../../media';
import type {PlayerApi, PlayerDetachedApi} from '../../player';
import {PlayerEventType} from '../../player/player-event';
import type {MarkerStyle} from '../../ui';
import {ObserverBreaker} from '../../common/observer-breaker';
import {DomUtil} from '../../dom/dom-util';
import {SegmentationDomClasses} from '../segmentation-dom';
import {OmakaseSegmentationButton} from './base-segmentation-button';

export const OmakaseSplitMarkerButtonAttributes = {
  SPLIT_COLOR: 'split-color',
};

const DEFAULT_SPLIT_COLOR = '#EE7A76';

export class OmakaseSplitMarkerButton extends OmakaseSegmentationButton {
  protected _playerBreaker = new ObserverBreaker();

  protected get iconClass(): string {
    return SegmentationDomClasses.mediaChromeSplitMarker;
  }

  protected get tooltipText(): string {
    return 'Split marker';
  }

  /**
   * Color assigned to the right-most marker resulting from a split. Defaults to `#EE7A76` when
   * unset.
   */
  get splitColor(): string {
    return DomUtil.getAttribute(this, OmakaseSplitMarkerButtonAttributes.SPLIT_COLOR, DEFAULT_SPLIT_COLOR);
  }

  set splitColor(value: string | undefined) {
    DomUtil.setAttribute(this, OmakaseSplitMarkerButtonAttributes.SPLIT_COLOR, value);
  }

  override get player() {
    return super.player;
  }

  override set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    super.player = player;
    // Activity also depends on the playhead position (see isCapabilityActive), which the base
    // class has no reason to watch on its own.
    this._playerBreaker.break();
    this.updateActiveState();
    if (player) {
      player.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS || event.type === PlayerEventType.PLAYER_SEEKED),
          takeUntil(this._playerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: () => this.updateActiveState(),
        });
    }
  }

  protected isCapabilityActive(track: MarkerTrack): boolean {
    if (track.areTimedItemsLocked) {
      return false;
    }
    const markers = this.resolveActiveMarkers(track);
    if (markers.length !== 1 || markers[0]!.markerType !== MarkerType.SPANNING_MARKER) {
      return false;
    }
    const player = this.player;
    if (!player) {
      return false;
    }
    const start = TimedItemTemporalUtil.extractStartTime(markers[0]!.temporal);
    const end = TimedItemTemporalUtil.extractEndTime(markers[0]!.temporal);
    if (start === undefined || end === undefined) {
      return false;
    }
    const playhead = player.getCurrentTime();
    return playhead > start && playhead < end;
  }

  protected activate(track: MarkerTrack): void {
    const player = this.player;
    const markers = this.resolveActiveMarkers(track);
    if (!player || markers.length !== 1 || markers[0]!.markerType !== MarkerType.SPANNING_MARKER) {
      return;
    }
    const marker = markers[0]!;
    const start = TimedItemTemporalUtil.extractStartTime(marker.temporal);
    const end = TimedItemTemporalUtil.extractEndTime(marker.temporal);
    if (start === undefined || end === undefined) {
      return;
    }
    const playhead = player.getCurrentTime();
    if (!(playhead > start && playhead < end)) {
      return;
    }
    const playheadFrame = player.getCurrentTime(MediaTemporalFormat.FRAME_COUNT);
    const secondStart = player.convertTime(playheadFrame + 1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
    if (secondStart > end) {
      return;
    }

    track.updateTimedItem(marker.id, {temporal: {type: TimedItemTemporalType.SPAN, start: `${start}`, end: `${playhead}`}});
    track.addTimedItems({
      temporal: {type: TimedItemTemporalType.SPAN, start: `${secondStart}`, end: `${end}`},
      label: marker.label,
      data: marker.data,
    });

    const secondMarker = track.timedItems[track.timedItems.length - 1]!;
    this.ui?.updateStyleRule<MarkerStyle>({id: secondMarker.id, style: {markerColor: this.splitColor}});
    this.ui?.updateElement({id: marker.id, props: {focused: undefined}});
    this.ui?.updateElement({id: secondMarker.id, props: {focused: true}});
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._playerBreaker.destroy();
  }
}
