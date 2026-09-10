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
import {auditTime, BehaviorSubject, debounceTime, distinctUntilChanged, filter, Subject, takeUntil} from 'rxjs';
import {WindowUtil} from '../util/window-util';
import type {OnMeasurementsChange, Position} from './model';
import {BaseKonvaComponent, type ComponentConfig, type ConfigWithOptionalStyle} from './layout/konva-component';
import type {MediaElementPlaybackState} from '../common/media-element-playback';
import {TimelineEventType} from './timeline-api';
import {TIMELINE} from '../constants';
import {KonvaFactory} from './konva/konva-factory';
import {isNullOrUndefined} from '../util/util-functions';
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

    textFontSize: 12,
    textFill: '#0d0f05',
    textYOffset: 0,
  },
};

/**
 * The playhead marker: the vertical line, symbol, and timecode label. Deliberately its own
 * component, separate from {@link PlayheadBuffer} (the play-progress bar + buffered-ranges
 * background), so {@link TimelineImpl} can place other spanning content — e.g. LiveEdgeOverlay —
 * between the two in z-order: the marker always renders above whatever sits between it and the
 * buffer.
 */
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

  protected _playheadGroup: Konva.Group;
  protected _playheadLine: Konva.Line;
  protected _playheadSymbol: Konva.Line;

  protected _timecodeLabel: Konva.Label;
  protected _timecodeText: Konva.Text;

  /** True while media is loading or the timeline hasn't caught up to a fresh live-state yet — see {@link refreshVisibility}. */
  protected _hiddenUntilReady = false;

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

    this._playheadGroup.add(this._playheadLine);
    this._playheadGroup.add(this._playheadSymbol);

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
            this._hiddenUntilReady = true;
            this.refreshVisibility();
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

    let lastSeek: number | undefined;
    let dragMoveWatcher$ = new Subject<number>();

    let trySeek = () => {
      let position = this._playheadGroup.getPosition().x;
      let seconds = this._timeline.clampSeekTarget(this._timeline.timelinePositionToTime(position));
      if (lastSeek !== seconds) {
        this._player.seekTo(seconds);
        lastSeek = seconds;
      }
    };

    dragMoveWatcher$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(auditTime(50), distinctUntilChanged())
      .subscribe((position) => {
        trySeek();
      });

    this._playheadGroup.on('dragmove', (event) => {
      let position = this._playheadGroup.getPosition().x;
      dragMoveWatcher$.next(position);
      // playhead is already moved, but UI is not yet refreshed, thus we work directly with _playheadGroup
      this.dragMove(position);
    });

    this._playheadGroup.on('dragend', (event) => {
      if (!this._player.isMainMediaLoaded || !this._state.dragging) {
        return;
      }
      trySeek();
      this.dragEnd();
    });

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (style) => {
        this.refreshVisibility();

        this._playheadSymbol.setAttrs({
          points: Playhead.symbolPoints(this.style.symbolHeight),
          offsetY: this.style.symbolYOffset,
          fill: this._state.dragging ? this.style.draggingFill : this.style.fill,
        });
        this._playheadLine.setAttrs({
          strokeWidth: this.style.lineWidth,
          stroke: this._state.dragging ? this.style.draggingFill : this.style.fill,
        });
        this._timecodeLabel.setAttrs({
          y: this.style.textYOffset,
          visible: this._state.dragging,
        });
        this._timecodeText.setAttrs({
          fontSize: this.style.textFontSize,
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
    // Same clamp seeking already applies (see clampSeekTarget) — the marker itself must never be
    // draggable past it into the retained-but-no-longer-seekable history region either, not just
    // have its eventual seek target silently redirected out from under the pointer.
    let clampedPosition = this._timeline.timeToTimelinePosition(this._timeline.clampSeekTarget(this._timeline.timelinePositionToTime(position)));

    this._playheadGroup.setAttrs({
      x: clampedPosition,
      y: this._timeline.scrubberLane.getTimecodedRect().y,
    });
    this._state.positionBeforeDrag = this._playheadGroup.getPosition();
    this.settleTimecode(clampedPosition);
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
    return this._playheadGroup;
  }

  onMeasurementsChange() {
    this.settleLayout();
  }

  getPlayheadPosition(): number {
    return this._playheadGroup.x();
  }

  protected settleLayout() {
    let timecodedGroupDimension = this._timeline.getTimecodedFloatingDimension();

    // Start at the scrubber lane's own (margin-aware) top, same reasoning as PlayheadBuffer: without
    // this, setting marginTop on the scrubber lane leaves the line/symbol/timecode starting above
    // the ruler, in the margin gap, instead of right at it.
    const scrubberTop = this._timeline.scrubberLane.getTimecodedRect().y;
    this._playheadGroup.setAttrs({
      ...timecodedGroupDimension,
      y: scrubberTop,
    });

    // Spans from the scrubber lane's top down through HEADER + MAIN + FOOTER content, excluding the
    // outer vertical padding around it (and, now, the margin gap above the scrubber lane).
    const lineHeight = this._timeline.getSpanningContentHeight() - scrubberTop;
    this._playheadLine.setAttrs({
      points: [0, 0, 0, lineHeight],
    });

    this.doPlayProgress();
  }

  /** Combines the persistent style.visible setting with the transient hidden-until-ready gate below. */
  private refreshVisibility() {
    this._playheadGroup.visible(!this._hiddenUntilReady && this.style.visible);
  }

  private doPlayProgress() {
    if (!this._player.isMainMediaLoaded) {
      return;
    }

    if (this._state.dragging) {
      return;
    }

    if (this._player.mainMedia?.isLive && !this._timeline.state.isLive) {
      // Main media is live, but the timeline hasn't processed its first live-state update yet —
      // timeToTimelinePosition() would still resolve against the VOD fallback domain (origin 0),
      // not the true live origin. Stay hidden rather than flashing a wrong position; the next
      // progress tick re-checks and reveals/positions correctly once the timeline catches up.
      this._hiddenUntilReady = true;
      this.refreshVisibility();
      return;
    }
    this._hiddenUntilReady = false;
    this.refreshVisibility();

    let x = this._timeline.timeToTimelinePosition(this._player.getCurrentTime());
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

  private static symbolPoints(height: number): number[] {
    let sideLength = (2 * height) / Math.sqrt(3);
    let bottom = {x: 0, y: height - height / 2};
    let right = {x: sideLength / 2, y: 0 - height / 2};
    let left = {x: -sideLength / 2, y: 0 - height / 2};

    return [bottom.x, bottom.y, right.x, left.y, left.x, left.y];
  }

  private createSymbol(config: {height: number; fill: string; offsetY: number}): Konva.Line {
    return new Konva.Line({
      points: Playhead.symbolPoints(config.height),
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
