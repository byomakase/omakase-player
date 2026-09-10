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

import Konva from 'konva';
import {filter, takeUntil} from 'rxjs';
import type {OnMeasurementsChange} from './model';
import {BaseKonvaComponent, type ComponentConfig, type ConfigWithOptionalStyle} from './layout/konva-component';
import {TimelineEventType} from './timeline-api';
import {TIMELINE} from '../constants';
import {KonvaFactory} from './konva/konva-factory';
import type {BufferedTimeRange} from '../dom/dom-media-element';
import type {TimelineImpl} from './timeline';
import {type PlayerApi, PlayerEventType} from '../player';
import type {Playhead} from './playhead';

export interface PlayheadBufferStyle {
  scrubberHeight: number;
  backgroundFill: string;
  backgroundOpacity: number;
  playProgressFill: string;
  playProgressOpacity: number;
  bufferedFill: string;
  bufferedOpacity: number;
}

export interface PlayheadBufferConfig extends ComponentConfig<PlayheadBufferStyle> {}

const configDefault: PlayheadBufferConfig = {
  style: {
    scrubberHeight: 15,
    backgroundFill: '#ffffff',
    backgroundOpacity: 0,

    playProgressFill: '#008cbc',
    playProgressOpacity: 0.5,

    bufferedFill: '#a2a2a2',
    bufferedOpacity: 1,
  },
};

/**
 * The playhead's background: the play-progress bar and buffered-ranges stripe, as a component
 * separate from {@link Playhead} (the marker line/symbol/timecode) so {@link TimelineImpl} can
 * place other spanning content — e.g. LiveEdgeOverlay — between the two in z-order. The marker
 * always renders above whatever sits between it and this background.
 */
export class PlayheadBuffer extends BaseKonvaComponent<PlayheadBufferConfig, PlayheadBufferStyle, Konva.Group> implements OnMeasurementsChange {
  protected _timeline: TimelineImpl;
  protected _player: PlayerApi;
  protected _playhead: Playhead;

  protected _group: Konva.Group;
  protected _bgRect: Konva.Rect;
  protected _playProgressBgRect: Konva.Rect;
  protected _bufferedGroup: Konva.Group;

  /** Mirrors {@link Playhead.onStateChange$}'s `dragging` — see {@link doPlayProgress}'s guard. */
  protected _playheadDragging = false;

  constructor(config: Partial<ConfigWithOptionalStyle<PlayheadBufferConfig>>, timeline: TimelineImpl, player: PlayerApi, playhead: Playhead) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._timeline = timeline;
    this._player = player;
    this._playhead = playhead;

    this._group = new Konva.Group({
      ...TIMELINE.positionTopLeft,
      listening: false,
    });

    this._bgRect = KonvaFactory.createRect({
      ...TIMELINE.positionTopLeft,
      height: this.style.scrubberHeight,
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
      listening: false,
    });

    this._playProgressBgRect = KonvaFactory.createRect({
      ...TIMELINE.positionTopLeft,
      height: this.style.scrubberHeight,
      fill: this.style.playProgressFill,
      opacity: this.style.playProgressOpacity,
      listening: false,
    });

    this._bufferedGroup = new Konva.Group({
      ...TIMELINE.positionTopLeft,
      listening: false,
    });

    this._group.add(this._bgRect);
    this._group.add(this._bufferedGroup);
    this._group.add(this._playProgressBgRect);

    this._timeline.onEvent$
      .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_ZOOM || p.type === TimelineEventType.TIMELINE_SCROLL))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.settleLayout();
      });

    // While the marker is being dragged, the underlying player seeks periodically (audited, see
    // Playhead's trySeek()) but lags the pointer — recomputing this bar's width off that lagging
    // currentTime would make it visibly fight the marker's own, immediately-pointer-driven position.
    // Freezing it for the duration of the drag (same as the marker's own timecode label does)
    // avoids that; it catches up to the final position once the drag commits.
    this._playhead.onStateChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((state) => {
      this._playheadDragging = state.dragging;
      if (!state.dragging) {
        this.doPlayProgress();
      }
    });

    this._player.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        switch (event.type) {
          case PlayerEventType.PLAYER_MAIN_MEDIA_LOADING:
            this._group.visible(false);
            break;
          case PlayerEventType.PLAYER_MAIN_MEDIA_LOADED:
            this.doPlayProgress();
            break;
          case PlayerEventType.PLAYER_PLAYBACK_PROGRESS:
            this.doPlayProgress();
            break;
          case PlayerEventType.PLAYER_SEEKING:
          case PlayerEventType.PLAYER_SEEKED:
            this.doPlayProgress();
            break;
          case PlayerEventType.PLAYER_BUFFERING:
            this.doBufferingProgress(event.data.bufferedTimeRanges);
            break;
        }
      },
    });

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (style) => {
        this._bgRect.setAttrs({
          height: this.style.scrubberHeight,
          fill: this.style.backgroundFill,
          opacity: this.style.backgroundOpacity,
        });

        this._playProgressBgRect.setAttrs({
          height: this.style.scrubberHeight,
          fill: this.style.playProgressFill,
          opacity: this.style.playProgressOpacity,
        });

        this._bufferedGroup.getChildren().forEach((node) => {
          node.setAttrs({
            height: this.style.scrubberHeight,
            fill: this.style.bufferedFill,
            opacity: this.style.bufferedOpacity,
          });
        });
      },
    });
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this.settleLayout();
  }

  protected settleLayout() {
    let timecodedGroupDimension = this._timeline.getTimecodedFloatingDimension();

    // Align with the scrubber lane's own (margin-aware) top rather than the padded content's top —
    // getTimecodedRect().y is the lane's Yoga-computed position, which already accounts for its
    // marginTop. Without this, setting marginTop on the scrubber lane leaves this bar floating
    // above the ruler it's meant to sit on, since _bgRect/_bufferedGroup/_playProgressBgRect all
    // stay at their construction-time local (0,0) within _group and only ever move with it.
    this._group.y(this._timeline.scrubberLane.getTimecodedRect().y);

    [this._group, this._bufferedGroup].forEach((node) => {
      node.setAttrs({
        ...timecodedGroupDimension,
      });
    });

    this._bgRect.setAttrs({
      width: timecodedGroupDimension.width,
    });

    this.doPlayProgress();
    this.doBufferingProgress(this._player.playerSession.playback.bufferedTimeRanges);
  }

  private doPlayProgress() {
    if (!this._player.isMainMediaLoaded) {
      return;
    }

    if (this._playheadDragging) {
      return;
    }

    if (this._player.mainMedia?.isLive && !this._timeline.state.isLive) {
      // Main media is live, but the timeline hasn't processed its first live-state update yet —
      // timeToTimelinePosition() would still resolve against the VOD fallback domain (origin 0),
      // not the true live origin. Stay hidden rather than flashing a wrong position; the next
      // progress tick re-checks and reveals/positions correctly once the timeline catches up.
      this._group.visible(false);
      return;
    }
    this._group.visible(true);

    let x = this._timeline.timeToTimelinePosition(this._player.getCurrentTime());
    this._playProgressBgRect.width(x);
  }

  private doBufferingProgress(bufferedTimeRanges: BufferedTimeRange[]) {
    if (!this._player.isMainMediaLoaded) {
      return;
    }

    if (bufferedTimeRanges && bufferedTimeRanges.length > 0) {
      if (this._bufferedGroup.hasChildren()) {
        let numOfBuffers = bufferedTimeRanges.length;
        let previousNumOfBuffers = this._bufferedGroup.getChildren().length;

        if (numOfBuffers === previousNumOfBuffers) {
          // move and resize buffers
          this._bufferedGroup.getChildren().forEach((bufferedRect, i) => {
            let bufferedTimeRange = bufferedTimeRanges[i]!;
            let startX = this._timeline.timeToTimelinePosition(bufferedTimeRange.start);
            let endX = this._timeline.timeToTimelinePosition(bufferedTimeRange.end);
            bufferedRect.setAttrs({
              x: startX,
              width: endX - startX,
            });
          });
        } else {
          // remove old and recreate
          this._bufferedGroup.getChildren().forEach((child) => child.destroy());
          this.createBuffers(bufferedTimeRanges);
        }
      } else {
        this.createBuffers(bufferedTimeRanges);
      }
    }
  }

  private createBuffers(bufferedTimeRanges: BufferedTimeRange[]) {
    bufferedTimeRanges.forEach((bufferedTimespan) => {
      let startX = this._timeline.timeToTimelinePosition(bufferedTimespan.start);
      let endX = this._timeline.timeToTimelinePosition(bufferedTimespan.end);

      let bufferedRect = KonvaFactory.createRect({
        x: startX,
        y: 0,
        width: endX - startX,
        height: this.style.scrubberHeight,
        fill: this.style.bufferedFill,
        opacity: this.style.bufferedOpacity,
        listening: false,
      });
      this._bufferedGroup.add(bufferedRect);
    });
  }
}
