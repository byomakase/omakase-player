/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {BaseKonvaComponent, ComponentConfig, ConfigWithOptionalStyle} from '../layout/konva-component';
import Konva from 'konva';
import {Constants} from '../constants';
import {OnMeasurementsChange, Position} from '../common/measurement';
import {Timeline} from './timeline';
import {BufferedTimespan} from '../video/video-controller';
import {BehaviorSubject, combineLatest, filter, Subject, takeUntil} from 'rxjs';
import {VideoControllerApi} from '../video/video-controller-api';
import {KonvaFactory} from '../factory/konva-factory';
import {WindowUtil} from '../util/window-util';
import {PlaybackState} from '../video';
import {KonvaUtil} from '../util/konva-util';
import {nextCompleteVoidSubject} from '../util/observable-util';
import {isNullOrUndefined} from '../util/object-util';
import {PlayheadMoveEvent} from '../types';

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
    textYOffset: 0
  }
}

export class Playhead extends BaseKonvaComponent<PlayheadConfig, PlayheadStyle, Konva.Group> implements OnMeasurementsChange {
  public readonly onMove$: Subject<PlayheadMoveEvent> = new Subject<PlayheadMoveEvent>();
  public readonly onStateChange$: Subject<PlayheadState>;

  protected _timeline: Timeline;
  protected _videoController: VideoControllerApi;
  protected _playbackState?: PlaybackState;

  protected _state: PlayheadState = {
    dragging: false,
    dragmove: false,
    seeking: false,
    positionBeforeDrag: undefined
  };

  protected _dragBreaker$ = new Subject<void>();

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
  protected _requestAnimationFrameId?: number;

  constructor(config: Partial<ConfigWithOptionalStyle<PlayheadConfig>>, timeline: Timeline, videoController: VideoControllerApi) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this.onStateChange$ = new BehaviorSubject(this._state)

    this._timeline = timeline;
    this._videoController = videoController;
    this._playbackState = this._videoController.getPlaybackState();

    this._group = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      listening: true
    });

    this._bgRect = KonvaFactory.createRect({
      ...Constants.POSITION_TOP_LEFT,
      height: this.style.scrubberHeight,
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
      listening: false
    });

    this._playProgressBgRect = KonvaFactory.createRect({
      ...Constants.POSITION_TOP_LEFT,
      height: this.style.scrubberHeight,
      fill: this.style.playProgressFill,
      opacity: this.style.playProgressOpacity,
      listening: false
    })

    this._playheadGroup = KonvaFactory.createGroup({
      ...Constants.POSITION_TOP_LEFT,
      visible: this.style.visible,
      listening: true,
      draggable: true
    });

    this._playheadLine = new Konva.Line({
      points: [0, 0, 0, 0],
      stroke: this.style.fill,
      strokeWidth: this.style.lineWidth,
      listening: true
    })

    this._playheadSymbol = this.createSymbol({
      height: this.style.symbolHeight,
      offsetY: this.style.symbolYOffset,
      fill: this.style.fill,
    });

    this._timecodeLabel = new Konva.Label({
      y: this.style.textYOffset,
      listening: false
    });

    this._timecodeText = new Konva.Text({
      fontSize: this.style.textFontSize,
      fontFamily: this._timeline.style.textFontFamily,
      fill: this.style.textFill,
      ...Constants.POSITION_TOP_LEFT,
      text: ``,
      listening: false
    });

    this._timecodeLabel.add(this._timecodeText);
    this._playheadGroup.add(this._timecodeLabel);

    this._bufferedGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      listening: false
    });

    this._group.add(this._bgRect);
    this._group.add(this._bufferedGroup);
    this._group.add(this._playProgressBgRect);

    this._playheadGroup.add(this._playheadLine)
    this._playheadGroup.add(this._playheadSymbol)

    this._group.add(this._playheadGroup);

    // react on timeline zoom
    this._timeline.onZoom$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.settleLayout();
    })

    this._videoController.onVideoLoading$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this._group.visible(false);
    })

    this._videoController.onVideoLoaded$.pipe(takeUntil(this._destroyed$)).pipe(filter(p => !!p)).subscribe((event) => {
      this._group.visible(true);
      this.doPlayProgress()
      this.doBufferingProgress()
    })

    this._videoController.onVideoTimeChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.doPlayProgress()
    })

    combineLatest([
      this._videoController.onSeeking$,
      this._videoController.onSeeked$
    ]).pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.doPlayProgress()
      this.doBufferingProgress()
    })

    this._videoController.onBuffering$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.doBufferingProgress()
    })

    this._playheadGroup.on('mouseover', () => {
      if (!this._playbackState?.playing) {
        WindowUtil.cursor('ew-resize')
      }
    })

    this._playheadGroup.on('mouseout', (event) => {
      WindowUtil.cursor('default');
    })

    this._playheadGroup.on('dragstart', (event) => {
      if (!this._videoController.isVideoLoaded()) {
        event.target.stopDrag();
        return;
      }

      if (this._playbackState && !this._playbackState.playing) {
        this.dragStart();
      } else {
        event.target.stopDrag();
      }
    })

    this._playheadGroup.on('dragmove', (event) => {
      // playhead is already moved, but UI is not yet refreshed, thus we work directly with _playheadGroup
      this.dragMove(this._playheadGroup.getPosition().x);
    })

    this._playheadGroup.on('dragend', (event) => {
      if (!this._videoController.isVideoLoaded()) {
        return;
      }

      this.dragEnd();
      let time = this._timeline.timelinePositionToTime(this._playheadGroup.getPosition().x);
      this._videoController.seekToTime(time).subscribe();
    })

    this._videoController.onPlaybackState$.pipe(takeUntil(this._destroyed$)).subscribe((state) => {
      this._playbackState = state;
      this.updateState({
        seeking: this._playbackState.seeking
      })
    })

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (style) => {
        this._playheadSymbol.setAttrs({
          fill: this._state.dragging ? this.style.draggingFill : this.style.fill
        })
        this._playheadLine.setAttrs({
          stroke: this._state.dragging ? this.style.draggingFill : this.style.fill
        })
        this._timecodeLabel.setAttrs({
          visible: this._state.dragging
        })
        this._timecodeText.setAttrs({
          fill: this._state.dragging ? this.style.draggingFill : this.style.fill
        })
      }
    })

    this.onStateChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (state) => {
        WindowUtil.cursor(this._state.dragging ? 'ew-resize' : 'default');
        this.style = {}; // trigger style update
      }
    })

    this._animationFrameCallback$.pipe(filter(p => !isNullOrUndefined(p)), takeUntil(this._destroyed$)).subscribe(time => {
      if (!this._state.dragmove) {
        this.playheadMoveRelativePointer();
        this.scrollToRevealPlayhead();
      }
    })
  }

  dragStart() {
    this.updateState({
      dragging: true,
      positionBeforeDrag: this._playheadGroup.getPosition()
    });

    this._dragBreaker$ = new Subject();
    this._dragBreaker$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this.stopAnimationFrameLoop();
    })
    this.startAnimationFrameLoop();
  }

  dragMove(position: number) {
    this.updateState({
      dragmove: true
    })

    let newPlayheadPosition = this._timeline.constrainTimelinePosition(position);
    let relativePointerPosition = this._timeline.getTimecodedFloatingRelativePointerPosition().x;
    let visiblePositionRange = this._timeline.getVisiblePositionRange();

    if (relativePointerPosition >= visiblePositionRange.start && relativePointerPosition <= visiblePositionRange.end) {
      this.repositionPlayhead(newPlayheadPosition);
    } else {
      // this prevents playhead mouse drag
      this.repositionPlayhead(this._state.positionBeforeDrag!.x);
    }

    this.updateState({
      dragmove: false
    })
  }

  dragEnd() {
    nextCompleteVoidSubject(this._dragBreaker$);
    this.updateState({
      dragging: false
    });
    this.scrollToRevealPlayhead();
  }


  private startAnimationFrameLoop() {
    if (isNullOrUndefined(this._requestAnimationFrameId)) {
      this._requestAnimationFrameId = requestAnimationFrame((time) => {
        this.requestAnimationFrameExecutor(time);
      })
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
    this._animationFrameCallback$.next(time)
    this._requestAnimationFrameId = requestAnimationFrame((time) => {
      this.requestAnimationFrameExecutor(time);
    });
  }

  private scrollToRevealPlayhead() {
    let visiblePositionRange = this._timeline.getVisiblePositionRange();
    let relativePointerPosition = this._timeline.getTimecodedFloatingRelativePointerPosition().x;
    let playheadPosition = this._playheadGroup.x();

    if (relativePointerPosition < visiblePositionRange.start) {
      this._timeline.scrollTimeline(-playheadPosition);
    } else if (relativePointerPosition > visiblePositionRange.end) {
      this._timeline.scrollTimeline(-playheadPosition + this._timeline.getTimecodedContainerDimension().width);
    }
  }

  private playheadMoveRelativePointer() {
    let visiblePositionRange = this._timeline.getVisiblePositionRange();
    let relativePointerPosition = this._timeline.getTimecodedFloatingRelativePointerPosition().x;

    let pointerBorderDistance = 0;
    if (relativePointerPosition < visiblePositionRange.start) {
      pointerBorderDistance = Math.abs(visiblePositionRange.start - relativePointerPosition)
    } else if (relativePointerPosition > visiblePositionRange.end) {
      pointerBorderDistance = Math.abs(visiblePositionRange.end - relativePointerPosition)
    }

    let speedPx = this.resolvetimelineScrollSpeed(pointerBorderDistance);

    if (relativePointerPosition < visiblePositionRange.start) {
      this.repositionPlayhead(this._timeline.constrainTimelinePosition(visiblePositionRange.start - speedPx));
    } else if (relativePointerPosition > visiblePositionRange.end) {
      this.repositionPlayhead(this._timeline.constrainTimelinePosition(visiblePositionRange.end + speedPx))
    } else {
      // we're inside visible area, dragmove will do repositioning if needed
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
    let normalizedDistance = distance / (this.config.dragScrollMaxSpeedAfterPx);

    // Calculate the speed using exponential interpolation
    let exponent = 2; // We can adjust this exponent to control the curvature of the exponential function
    let speed = Math.floor(this.config.minScrollSpeedPx + (Math.pow(normalizedDistance, exponent) * (this.config.maxScrollSpeedPx - this.config.minScrollSpeedPx)));
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
      y: 0
    });
    this._state.positionBeforeDrag = this._playheadGroup.getPosition();
    this.settleTimecode(position);
    this.onMove$.next({timecode: this._timeline.timelinePositionToTimecode(this._playheadGroup.getPosition().x)})
  }

  private updateState(partialState: Partial<PlayheadState>) {
    let newState: PlayheadState = {
      ...this._state,
      ...partialState
    };

    let isEqual = (newState.dragging === this._state.dragging
      && newState.dragmove === this._state.dragmove
      && newState.seeking === this._state.seeking
      && newState.positionBeforeDrag === this._state.positionBeforeDrag
    );

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

    [this._group, this._bufferedGroup, this._playheadGroup].forEach(node => {
      node.setAttrs({
        ...timecodedGroupDimension
      })
    });

    [this._bgRect].forEach(node => {
      node.setAttrs({
        width: timecodedGroupDimension.width
      })
    })

    this._playheadLine.setAttrs({
      points: [0, 0, 0, timecodedGroupDimension.height]
    })

    this.doPlayProgress()
    this.doBufferingProgress()
  }

  private doPlayProgress() {
    if (!this._videoController.isVideoLoaded()) {
      return;
    }

    if (this._state.dragging) {
      return;
    }

    let x = this._timeline.timeToTimelinePosition(this._videoController.getCurrentTime());
    this._playProgressBgRect.width(x);
    this._playheadGroup.x(x);

    this.settleTimecode(x);
  }

  private settleTimecode(playheadPosition: number) {
    let text = this._state.dragging ? this._timeline.timelinePositionToTimecode(playheadPosition) : this._videoController.getCurrentTimecode();

    let textRect = this._timecodeText.getSelfRect();
    let textHalfWidth = textRect.width / 2
    let labelPosition = -textHalfWidth;
    let horizontals = this._timeline.getTimecodedFloatingHorizontals();

    if ((horizontals.width - playheadPosition) < (textHalfWidth)) {
      labelPosition = -textRect.width + (horizontals.width - playheadPosition);
    } else if (playheadPosition < textHalfWidth) {
      labelPosition = -textHalfWidth + (textHalfWidth - playheadPosition);
    }

    this._timecodeText.text(text);
    this._timecodeLabel.x(labelPosition)
  }

  private doBufferingProgress() {
    if (!this._videoController.isVideoLoaded()) {
      return;
    }

    let bufferedTimespans = this._videoController.getBufferedTimespans()

    if (bufferedTimespans && bufferedTimespans.length > 0) {
      if (this._bufferedGroup.hasChildren()) {
        let numOfBuffers = bufferedTimespans.length;
        let previousNumOfBuffers = this._bufferedGroup.getChildren().length;

        if (numOfBuffers === previousNumOfBuffers) {
          // move and resize buffers
          this._bufferedGroup.getChildren().forEach((bufferedRect, i) => {
            let bufferedTimespan = bufferedTimespans[i];
            let startX = this._timeline.timeToTimelinePosition(bufferedTimespan.start);
            let endX = this._timeline.timeToTimelinePosition(bufferedTimespan.end);
            bufferedRect.setAttrs({
              x: startX,
              width: endX - startX
            })
          })
        } else {
          // remove old and recreate
          this._bufferedGroup.getChildren().forEach(child => child.destroy());
          this.createBuffers(bufferedTimespans);
        }
      } else {
        this.createBuffers(bufferedTimespans);
      }
    }
  }

  private createBuffers(bufferedTimespans: BufferedTimespan[]) {
    bufferedTimespans.forEach(bufferedTimespan => {
      let startX = this._timeline.timeToTimelinePosition(bufferedTimespan.start);
      let endX = this._timeline.timeToTimelinePosition(bufferedTimespan.end);

      let bufferedRect = KonvaFactory.createRect({
        x: startX,
        y: 0,
        width: endX - startX,
        height: this.style.scrubberHeight,
        fill: this.style.bufferedFill,
        opacity: this.style.bufferedOpacity,
        listening: false
      })
      this._bufferedGroup.add(bufferedRect)
    })
  }

  private createSymbol(config: {
    height: number,
    fill: string,
    offsetY: number
  }): Konva.Line {
    let sideLength = 2 * config.height / Math.sqrt(3);
    let bottom = {x: 0, y: config.height - config.height / 2};
    let right = {x: sideLength / 2, y: 0 - config.height / 2};
    let left = {x: -sideLength / 2, y: 0 - config.height / 2};

    return new Konva.Line({
      points: [
        bottom.x, bottom.y,
        right.x, left.y,
        left.x, left.y,
      ],
      fill: config.fill,
      closed: true,
      listening: true,
      offsetY: config.offsetY
    })
  }

  override destroy() {
    KonvaUtil.unlisten(this._playheadGroup)

    super.destroy();
  }

}
