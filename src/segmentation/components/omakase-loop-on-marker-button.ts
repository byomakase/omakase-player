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
import {type MarkerTrack, MarkerType, TimedItemTemporalUtil} from '../../media';
import {PlayerEventType} from '../../player/player-event';
import {ObserverBreaker} from '../../common/observer-breaker';
import {SegmentationDomClasses} from '../segmentation-dom';
import {OmakaseSegmentationButton} from './base-segmentation-button';

export const OmakaseLoopOnMarkerButtonAttributes = {
  DISPLACEMENT: 'displacement',
};

const DEFAULT_DISPLACEMENT_SECONDS = 5;

export class OmakaseLoopOnMarkerButton extends OmakaseSegmentationButton {
  static get observedAttributes() {
    return [...super.observedAttributes, OmakaseLoopOnMarkerButtonAttributes.DISPLACEMENT];
  }

  protected _watchBreaker = new ObserverBreaker();

  protected get iconClass(): string {
    return SegmentationDomClasses.mediaChromeLoopOnMarker;
  }

  protected get tooltipText(): string {
    return 'Loop on marker';
  }

  /**
   * Maximum distance, in seconds, played on either side of an active Moment Marker. Defaults to 5
   * when unset.
   */
  get displacement(): number {
    const value = Number(this.getAttribute(OmakaseLoopOnMarkerButtonAttributes.DISPLACEMENT));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_DISPLACEMENT_SECONDS;
  }

  set displacement(value: number) {
    this.setAttribute(OmakaseLoopOnMarkerButtonAttributes.DISPLACEMENT, `${value}`);
  }

  protected isCapabilityActive(track: MarkerTrack): boolean {
    return this.resolveActiveMarkers(track).length === 1;
  }

  protected activate(track: MarkerTrack): void {
    const markers = this.resolveActiveMarkers(track);
    const player = this.player;
    if (markers.length !== 1 || !player) {
      return;
    }
    const marker = markers[0]!;

    let loopStart: number;
    let loopEnd: number;
    let returnTo: number;
    if (marker.markerType === MarkerType.MOMENT_MARKER) {
      const time = TimedItemTemporalUtil.extractStartTime(marker.temporal);
      if (time === undefined) {
        return;
      }
      const duration = player.getDuration();
      loopStart = Math.max(0, time - this.displacement);
      loopEnd = Math.min(duration, time + this.displacement);
      returnTo = time;
    } else {
      const start = TimedItemTemporalUtil.extractStartTime(marker.temporal);
      const end = TimedItemTemporalUtil.extractEndTime(marker.temporal);
      if (start === undefined || end === undefined) {
        return;
      }
      loopStart = start;
      loopEnd = end;
      returnTo = start;
    }

    this._watchBreaker.break();
    player.pause().subscribe(() => {
      player.seekTo(loopStart).subscribe(() => {
        player.play().subscribe(() => {
          player.onEvent$
            .pipe(
              filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS),
              takeUntil(this._watchBreaker.observer),
              takeUntil(this._destroyBreaker.observer)
            )
            .subscribe(() => {
              if (player.getCurrentTime() >= loopEnd) {
                this._watchBreaker.break();
                player.pause().subscribe(() => {
                  player.seekTo(returnTo).subscribe();
                });
              }
            });
        });
      });
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._watchBreaker.destroy();
  }
}
