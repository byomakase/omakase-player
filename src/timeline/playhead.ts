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
import {BehaviorSubject, filter, Subject, takeUntil} from 'rxjs';
import {WindowUtil} from '../util/window-util';
import type {OnMeasurementsChange, Position} from './model';
import {BaseKonvaComponent, type ComponentConfig, type ConfigWithOptionalStyle} from './layout/konva-component';
import type {MediaElementPlaybackState} from '../common/media-element-playback';
import {TimelineEventType} from './timeline-api';
import {TIMELINE} from '../constants';
import {KonvaFactory} from './konva/konva-factory';
import {isNullOrUndefined} from '../util/util-functions';
import type {BufferedTimeRange} from '../dom/dom-media-element';
import {KonvaUtil} from './konva/konva-util';
import type {TimelineImpl} from './timeline';
import {type PlayerApi, PlayerEventType} from '../player';
import {MediaTemporalFormat} from '../common';
import {ObserverBreaker} from '../common/observer-breaker';

export interface PlayheadState {
  dragging: boolean;
  dragmove: boolean;
  seeking: boolean;
  positionBeforeDrag: Position | undefined;
}

export interface PlayheadStyle {
  visible: boolean;

  fill: string;
  draggingFill: string;

  lineWidth: number;

  symbolHeight: number;
  symbolYOffset: number;

  textFontSize: number;
  textFill: string;
  textYOffset: number;

  scrubberHeight: number;
  backgroundFill: string;
  backgroundOpacity: number;
  playProgressFill: string;
  playProgressOpacity: number;
  bufferedFill: string;
  bufferedOpacity: number;
}

export interface PlayheadConfig extends ComponentConfig<PlayheadStyle> {
  minScrollSpeedPx: number;
  maxScrollSpeedPx: number;

  /**
   * After this number of pixels we're using constant max scrolling speed
   */
  dragScrollMaxSpeedAfterPx: number;
}

export interface PlayheadMoveEvent {
  timecode: string;
}

const configDefault: PlayheadConfig = {
  minScrollSpeedPx: 2,
  maxScrollSpeedPx: 100,
  dragScrollMaxSpeedAfterPx: 100,

  style: {
    visible: true,

    fill: '#f43530',
    draggingFill: '#f43530',

    lineWidth: 2,

    symbolHeight: 15,
    symbolYOffset: 0,

    scrubberHeight: 15,
    backgroundFill: '#ffffff',
    backgroundOpacity: 0,

    playProgressFill: '#008cbc',
    playProgressOpacity: 0.5,

    bufferedFill: '#a2a2a2',
    bufferedOpacity: 1,

    textFontSize: 12,
    textFill: '#0d0f05',
    textYOffset: 0,
  },
};

export class Playhead extends BaseKonvaComponent<PlayheadConfig, PlayheadStyle, Konva.Group> implements OnMeasurementsChange {
  public readonly onMove$: Subject<PlayheadMoveEvent> = new Subject<PlayheadMoveEvent>();
  public readonly onStateChange$: Subject<PlayheadState>;

  protected _timeline: TimelineImpl;
  protected _player: PlayerApi;
  protected _playbackState?: MediaElementPlaybackState;

  protected _state: PlayheadState = {
    dragging: false,
    dragmove: false,
    seeking: false,
    positionBeforeDrag: undefined,
  };

  protected _dragBreaker = new ObserverBreaker();

  protected _group: Konva.Group;
  protected _bgRect: Konva.Rect;
  protected _playProgressBgRect: Konva.Rect;

  protected _playheadGroup: Konva.Group;
  protected _playheadLine: Konva.Line;
  protected _playheadSymbol: Konva.Line;

  protected _timecodeLabel: Konva.Label;
  protected _timecodeText: Konva.Text;

  protected _bufferedGroup: Konva.Group;

  protected readonly _animationFrameCallback$: Subject<number | undefined> = new BehaviorSubject<number | undefined>(void 0);
  protected _requestAnimationFrameId: number | undefined;

  constructor(config: Partial<ConfigWithOptionalStyle<PlayheadConfig>>, timeline: TimelineImpl, player: PlayerApi) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this.onStateChange$ = new BehaviorSubject(this._state);

    this._timeline = timeline;
    this._player = player;
    this._playbackState = this._player.playerSession.playback;

    this._group = new Konva.Group({
      ...TIMELINE.positionTopLeft,
      listening: true,
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

    this._playheadGroup = KonvaFactory.createGroup({
      ...TIMELINE.positionTopLeft,
      visible: this.style.visible,
      listening: true,
      draggable: true,
    });

    this._playheadLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: this.style.fill,
      strokeWidth: this.style.lineWidth,
      listening: true,
    });

    this._playheadSymbol = this.createSymbol({
      height: this.style.symbolHeight,
      offsetY: this.style.symbolYOffset,
      fill: this.style.fill,
    });

    this._timecodeLabel = new Konva.Label({
      y: this.style.textYOffset,
      listening: false,
    });

    this._timecodeText = new Konva.Text({
      fontSize: this.style.textFontSize,
      fontFamily: this._timeline.style.textFontFamily,
      fill: this.style.textFill,
      ...TIMELINE.positionTopLeft,
      text: ``,
      listening: false,
    });

    this._timecodeLabel.add(this._timecodeText);
    this._playheadGroup.add(this._timecodeLabel);

    this._bufferedGroup = new Konva.Group({
      ...TIMELINE.positionTopLeft,
      listening: false,
    });

    this._group.add(this._bgRect);
    this._group.add(this._bufferedGroup);
    this._group.add(this._playProgressBgRect);

    this._playheadGroup.add(this._playheadLine);
    this._playheadGroup.add(this._playheadSymbol);

    this._group.add(this._playheadGroup);

    this._timeline.onEvent$
      .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_ZOOM || p.type === TimelineEventType.TIMELINE_SCROLL))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.settleLayout();
      });

    this._player.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        switch (event.type) {
          case PlayerEventType.PLAYER_MAIN_MEDIA_LOADING:
            this._group.visible(false);
            break;
          case PlayerEventType.PLAYER_MAIN_MEDIA_LOADED:
            this.doPlayProgress();
            this._group.visible(true);
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
          case PlayerEventType.PLAYER_PLAYBACK_CHANGE:
            this._playbackState = event.data.playerPlayback;
            this.updateState({
              seeking: this._playbackState.seeking,
            });
            break;
        }
      },
    });

    this._playheadGroup.on('mouseover', () => {
      if (!this._playbackState?.playing) {
        WindowUtil.cursor('ew-resize');
      }
    });

    this._playheadGroup.on('mouseout', (event) => {
      WindowUtil.cursor('default');
    });

    this._playheadGroup.on('dragstart', (event) => {
      if (!this._player.isMainMediaLoaded) {
        event.target.stopDrag();
        return;
      }

      if (this._playbackState && !this._playbackState.playing) {
        this.dragStart();
      } else {
        event.target.stopDrag();
      }
    });

    this._playheadGroup.on('dragmove', (event) => {
      // playhead is already moved, but UI is not yet refreshed, thus we work directly with _playheadGroup
      this.dragMove(this._playheadGroup.getPosition().x);
    });

    this._playheadGroup.on('dragend', (event) => {
      if (!this._player.isMainMediaLoaded) {
        return;
      }

      let seconds = this._timeline.timelinePositionToTime(this._playheadGroup.getPosition().x);
      this._player.seekTo(seconds).subscribe({
        next: () => {
          this.dragEnd();
        },
      });
    });

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (style) => {
        this._playheadSymbol.setAttrs({
          fill: this._state.dragging ? this.style.draggingFill : this.style.fill,
        });
        this._playheadLine.setAttrs({
          stroke: this._state.dragging ? this.style.draggingFill : this.style.fill,
        });
        this._timecodeLabel.setAttrs({
          visible: this._state.dragging,
        });
        this._timecodeText.setAttrs({
          fill: this._state.dragging ? this.style.draggingFill : this.style.fill,
        });
      },
    });

    this.onStateChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (state) => {
        WindowUtil.cursor(this._state.dragging ? 'ew-resize' : 'default');
        this.style = {}; // trigger style update
      },
    });

    this._animationFrameCallback$
      .pipe(
        filter((p) => !isNullOrUndefined(p)),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((time) => {
        if (!this._state.dragmove) {
          this.playheadMoveRelativePointer();
          this.scrollToRevealPlayhead();
        }
      });
  }

  dragStart() {
    this.updateState({
      dragging: true,
      positionBeforeDrag: this._playheadGroup.getPosition(),
    });

    this._dragBreaker.break();
    this._dragBreaker.observer.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
      this.stopAnimationFrameLoop();
    });
    this.startAnimationFrameLoop();
  }

  dragMove(position: number) {
    this.updateState({
      dragmove: true,
    });

    let relativePointerPosition = this._timeline.getTimecodedFloatingRelativePointerPosition();
    if (relativePointerPosition) {
      let newPlayheadPosition = this._timeline.constrainTimelinePosition(position);
      let visiblePositionRange = this._timeline.getVisiblePositionRange();

      if (relativePointerPosition.x >= visiblePositionRange.start && relativePointerPosition.x <= visiblePositionRange.end) {
        this.repositionPlayhead(newPlayheadPosition);
      } else {
        // this prevents playhead mouse drag
        this.repositionPlayhead(this._state.positionBeforeDrag!.x);
      }
    }

    this.updateState({
      dragmove: false,
    });
  }

  dragEnd() {
    this._dragBreaker.break();
    this.updateState({
      dragging: false,
    });
    this.scrollToRevealPlayhead();
  }

  private startAnimationFrameLoop() {
    if (isNullOrUndefined(this._requestAnimationFrameId)) {
      this._requestAnimationFrameId = requestAnimationFrame((time) => {
        this.requestAnimationFrameExecutor(time);
      });
    } else {
      console.debug('requestAnimationFrame already initiated');
    }
  }

  private stopAnimationFrameLoop() {
    if (this._requestAnimationFrameId) {
      cancelAnimationFrame(this._requestAnimationFrameId);
      this._requestAnimationFrameId = void 0;
    } else {
      console.debug('cannot stop requestAnimationFrame, _requestAnimationFrameId not set');
    }
  }

  private requestAnimationFrameExecutor(time: number) {
    this._animationFrameCallback$.next(time);
    this._requestAnimationFrameId = requestAnimationFrame((time) => {
      this.requestAnimationFrameExecutor(time);
    });
  }

  private scrollToRevealPlayhead() {
    let relativePointerPosition = this._timeline.getTimecodedFloatingRelativePointerPosition();
    if (relativePointerPosition) {
      let visiblePositionRange = this._timeline.getVisiblePositionRange();

      let playheadPosition = this._playheadGroup.x();

      if (relativePointerPosition.x < visiblePositionRange.start) {
        this._timeline.scrollTimeline(-playheadPosition);
      } else if (relativePointerPosition.x > visiblePositionRange.end) {
        this._timeline.scrollTimeline(-playheadPosition + this._timeline.getTimecodedContainerDimension().width);
      }
    }
  }

  private playheadMoveRelativePointer() {
    let relativePointerPosition = this._timeline.getTimecodedFloatingRelativePointerPosition();
    if (relativePointerPosition) {
      let visiblePositionRange = this._timeline.getVisiblePositionRange();

      let pointerBorderDistance = 0;
      if (relativePointerPosition.x < visiblePositionRange.start) {
        pointerBorderDistance = Math.abs(visiblePositionRange.start - relativePointerPosition.x);
      } else if (relativePointerPosition.x > visiblePositionRange.end) {
        pointerBorderDistance = Math.abs(visiblePositionRange.end - relativePointerPosition.x);
      }

      let speedPx = this.resolvetimelineScrollSpeed(pointerBorderDistance);

      if (relativePointerPosition.x < visiblePositionRange.start) {
        this.repositionPlayhead(this._timeline.constrainTimelinePosition(visiblePositionRange.start - speedPx));
      } else if (relativePointerPosition.x > visiblePositionRange.end) {
        this.repositionPlayhead(this._timeline.constrainTimelinePosition(visiblePositionRange.end + speedPx));
      } else {
        // we're inside visible area, dragmove will do repositioning if needed
      }
    }
  }

  private resolvetimelineScrollSpeed(distance: number): number {
    // Ensure the distance is within the expected range
    if (distance < 0) {
      distance = 0;
    } else if (distance > this.config.dragScrollMaxSpeedAfterPx) {
      distance = this.config.dragScrollMaxSpeedAfterPx;
    }

    // Normalize the distance to a range of 0 to 1
    let normalizedDistance = distance / this.config.dragScrollMaxSpeedAfterPx;

    // Calculate the speed using exponential interpolation
    let exponent = 2; // We can adjust this exponent to control the curvature of the exponential function
    let speed = Math.floor(this.config.minScrollSpeedPx + Math.pow(normalizedDistance, exponent) * (this.config.maxScrollSpeedPx - this.config.minScrollSpeedPx));
    return speed;
  }

  /**
   * Repositions playhead on drag, or on drag with timeline scroll
   *
   * @param position
   * @private
   */
  private repositionPlayhead(position: number) {
    this._playheadGroup.setAttrs({
      x: position,
      y: 0,
    });
    this._state.positionBeforeDrag = this._playheadGroup.getPosition();
    this.settleTimecode(position);
    this.onMove$.next({timecode: this._timeline.timelinePositionToTimecode(this._playheadGroup.getPosition().x)});
  }

  private updateState(partialState: Partial<PlayheadState>) {
    let newState: PlayheadState = {
      ...this._state,
      ...partialState,
    };

    let isEqual =
      newState.dragging === this._state.dragging &&
      newState.dragmove === this._state.dragmove &&
      newState.seeking === this._state.seeking &&
      newState.positionBeforeDrag === this._state.positionBeforeDrag;

    if (!isEqual) {
      this._state = newState;
      this.onStateChange$.next(this._state);
    }
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  onMeasurementsChange() {
    this.settleLayout();
  }

  getPlayheadPosition(): number {
    return this._playheadGroup.x();
  }

  protected settleLayout() {
    let timecodedGroupDimension = this._timeline.getTimecodedFloatingDimension();

    [this._group, this._bufferedGroup, this._playheadGroup].forEach((node) => {
      node.setAttrs({
        ...timecodedGroupDimension,
      });
    });

    [this._bgRect].forEach((node) => {
      node.setAttrs({
        width: timecodedGroupDimension.width,
      });
    });

    this._playheadLine.setAttrs({
      points: [0, 0, 0, timecodedGroupDimension.height],
    });

    this.doPlayProgress();
    this.doBufferingProgress(this._player.playerSession.playback.bufferedTimeRanges);
  }

  private doPlayProgress() {
    if (!this._player.isMainMediaLoaded) {
      return;
    }

    if (this._state.dragging) {
      return;
    }

    let x = this._timeline.timeToTimelinePosition(this._player.getCurrentTime());
    this._playProgressBgRect.width(x);
    this._playheadGroup.x(x);

    this.settleTimecode(x);
  }

  private settleTimecode(playheadPosition: number) {
    let text = this._state.dragging ? this._timeline.timelinePositionToTimecode(playheadPosition) : this._player.getCurrentTime(MediaTemporalFormat.TIMECODE);

    let textRect = this._timecodeText.getSelfRect();
    let textHalfWidth = textRect.width / 2;
    let labelPosition = -textHalfWidth;
    let horizontals = this._timeline.getTimecodedFloatingHorizontals();

    if (horizontals.width - playheadPosition < textHalfWidth) {
      labelPosition = -textRect.width + (horizontals.width - playheadPosition);
    } else if (playheadPosition < textHalfWidth) {
      labelPosition = -textHalfWidth + (textHalfWidth - playheadPosition);
    }

    this._timecodeText.text(text);
    this._timecodeLabel.x(labelPosition);
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

  private createSymbol(config: {height: number; fill: string; offsetY: number}): Konva.Line {
    let sideLength = (2 * config.height) / Math.sqrt(3);
    let bottom = {x: 0, y: config.height - config.height / 2};
    let right = {x: sideLength / 2, y: 0 - config.height / 2};
    let left = {x: -sideLength / 2, y: 0 - config.height / 2};

    return new Konva.Line({
      points: [bottom.x, bottom.y, right.x, left.y, left.x, left.y],
      fill: config.fill,
      closed: true,
      listening: true,
      offsetY: config.offsetY,
    });
  }

  override destroy() {
    KonvaUtil.unlisten(this._playheadGroup);

    super.destroy();
  }
}
