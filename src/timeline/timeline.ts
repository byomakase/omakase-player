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

import {debounceTime, filter, fromEvent, map, Observable, sampleTime, Subject, take, takeUntil} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import {type ConfigAndStyle, type TimelineApi, type TimelineConfig, type TimelineEvent, TimelineEventType, type TimelineState, type TimelineStyle} from './timeline-api';
import {omitKeys} from '../util/object-util';
import {freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {CryptoUtil} from '../util/crypto-util';
import {DomUtil} from '../dom/dom-util';
import type {Dimension, Horizontals, Position, RectMeasurement} from './model';
import {KonvaFactory} from './konva/konva-factory';
import Konva from 'konva';
import {KonvaFlexGroup} from './layout/konva-flex';
import {type FlexNode, FlexSpacingBuilder} from './layout/flex-node';
import {ObserverBreaker} from '../common/observer-breaker';
import type {MediaElementPlaybackState} from '../common/media-element-playback';
import {type PlayerApi, PlayerEventType} from '../player';
import {AuthConfig, MediaTemporalFormat} from '../common';
import Decimal from 'decimal.js';
import {animate} from './animation-util';
import {type OmakaseTimecodeEdit} from './timecode';
import {Playhead} from './playhead';
import {Scrubber} from './scrubber/scrubber';
import {MeasurementUtil} from './measurement-util';
import {WindowUtil} from '../util/window-util';
import {z} from 'zod';
import {ScrubberLane} from './scrubber';
import type {TimelineLaneApi} from './timeline-lane-api';
import {BaseTimelineLane} from './timeline-lane';
import {type Thumbnail, ThumbnailTrack} from '../media';
import {TrackRepository} from '../repository';
import {ThumbnailImg} from './thumbnail/thumbnail-img';
import {ImageUtil} from './konva/image-util';
import {type StyledElement, Ui} from '../ui';
import {type OmpProvider} from '../omp-provider';
import type {KonvaEventObject} from 'konva/lib/Node';

const configDefault: TimelineConfig = {
  htmlElementId: 'omakase-timeline',

  scrubberSnapArea: 5,
  playheadDragScrollMaxSpeedAfterPx: 100,

  zoomWheelEnabled: true,

  zoomScale: 1.7,
  zoomScaleWheel: 1.05,

  zoomBaseline: 100,
  zoomMax: 2000,

  layoutEasingDuration: 500,
  zoomEasingDuration: 800,
  scrollEasingDuration: 200,

  scrubberClickSeek: true,
  timecodeClickEdit: true,
};

interface DragConditions {
  positionBeforeDrag: Position | undefined;
  playbackState: MediaElementPlaybackState | undefined;
  isPlayheadDrag: boolean;
}

class ThumbnailHoverWrapper implements Destroyable {
  private _thumbnailImg: ThumbnailImg;
  private _thumbnail?: Thumbnail;

  constructor(thumbnailImg: ThumbnailImg) {
    this._thumbnailImg = thumbnailImg;
  }

  setPosition(position: Position) {
    this._thumbnailImg.setPosition(position);
    this._thumbnailImg.konvaNode.moveToTop();
    this._thumbnailImg.setVisible(true);
  }

  set thumbnail(value: Thumbnail) {
    this._thumbnail = value;
  }

  get thumbnail(): Thumbnail | undefined {
    return this._thumbnail;
  }

  get thumbnailImg(): ThumbnailImg {
    return this._thumbnailImg;
  }

  destroy() {
    this._thumbnailImg.destroy();
  }
}

const domClasses = {
  root: 'omakase-timeline',
  timelineOverlay: 'omakase-timeline-overlay',
  canvas: 'omakase-timeline-canvas',
  timecode: 'omakase-timeline-timecode',
};

type ZoomDirection = 'zoom_in' | 'zoom_out';

const MAIN_LAYER_CONTENT_GROUPS: number = 9;
const SURFACE_LAYER_CONTENT_GROUPS: number = 1;

const playbackProgressThrottle: number = 100;

export class TimelineImpl implements TimelineApi, Destroyable {
  protected _ui: Ui;
  private _ompProvider!: OmpProvider;

  protected readonly _onEvent$: Subject<TimelineEvent> = new Subject<TimelineEvent>();

  private readonly _id: string;
  private readonly _config: TimelineConfig;
  private readonly _styledElement: StyledElement<TimelineStyle>;
  private readonly _style: TimelineStyle;

  private readonly _ready: boolean = false;

  private readonly _player: PlayerApi;

  protected _dragBreaker = new ObserverBreaker();
  protected _dragConditions?: DragConditions;

  // region HTML DOM
  private _rootElement!: HTMLElement;
  private _canvasElement!: HTMLDivElement;
  private _timelineOverlayElement!: HTMLDivElement;
  private _timecodeElement!: HTMLDivElement;
  private _timecodeEdit: OmakaseTimecodeEdit | undefined;
  // endregion

  private _timelineLanes: TimelineLaneApi[] = [];
  private _timelineLanesMap: Map<string, TimelineLaneApi> = new Map<string, TimelineLaneApi>();

  // region konva
  private _konvaStage!: Konva.Stage;
  private _mainLayer!: Konva.Layer;

  private _timecodedContainer!: Konva.Group;
  private _timecodedFloatingGroup!: Konva.Group;
  private _timecodedFloatingBg!: Konva.Rect;
  private _timecodedFloatingEventCatcher!: Konva.Rect;
  private _timecodedFloatingContentGroups = new Map<number, Konva.Group>();

  private _surfaceLayer!: Konva.Layer;
  private _surfaceLayer_timecodedContainer!: Konva.Group;
  private _surfaceLayer_timecodedFloatingGroup!: Konva.Group;
  private _surfaceLayer_timecodedFloatingContentGroups = new Map<number, Konva.Group>();
  // endregion

  // region bg
  private _layoutBg!: Konva.Rect;
  private _headerBg!: Konva.Rect;
  private _footerBg!: Konva.Rect;
  // endregion

  // region flex groups
  private _layoutFlexGroup!: KonvaFlexGroup;
  private _headerFlexGroup!: KonvaFlexGroup;
  private _mainFlexGroup!: KonvaFlexGroup;
  private _mainLeftFlexGroup!: KonvaFlexGroup;
  private _mainRightFlexGroup!: KonvaFlexGroup;

  private _timelineLaneStaticFlexGroup!: KonvaFlexGroup;
  private _timecodedWrapperFlexGroup!: KonvaFlexGroup;
  private _timecodedContainerFlexGroup!: KonvaFlexGroup;
  private _timecodedContainerStaticFlexGroup!: KonvaFlexGroup;

  private _footerFlexGroup!: KonvaFlexGroup;
  // endregion

  // region component declarations
  private _scrubber!: Scrubber;
  private _playhead!: Playhead;
  private _scrubberLane!: ScrubberLane;
  // endregion

  private _scrollWithPlayhead = true;
  private _syncTimelineWithPlayheadInProgress = false;

  private _descriptionPaneVisible = true;

  private readonly _mediaBreaker = new ObserverBreaker();
  private readonly _destroyBreaker = new ObserverBreaker();

  constructor(player: PlayerApi, ompProvider: OmpProvider, configAndStyle?: ConfigAndStyle<TimelineConfig, TimelineStyle>) {
    this._ompProvider = ompProvider;
    this._ui = ompProvider.ui;
    this._trackRepository = ompProvider.trackRepository;
    this._config = {
      ...configDefault,
      ...omitKeys(configAndStyle, 'style'),
    };
    this._player = player;

    this._id = CryptoUtil.uuid();

    this._styledElement = {
      id: this._id,
      classes: [this._ui.resolveStyleClass('Timeline')],
      style: {
        ...configAndStyle?.style,
      },
    };
    this._style = this._ui.resolveStyle(this._styledElement) as TimelineStyle;

    this.createDom();
    this.createCanvas();
    this.settleLayout();

    this._player.onEvent$
      .pipe(filter((p) => p.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADING || p.type === PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.clearContent();
      });

    if (this._player.isMainMediaLoaded) {
      this.onMainMediaLoaded();
      this.settleLayout();
    }

    this._player.onEvent$
      .pipe(filter((p) => p.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.onMainMediaLoaded();
      });

    this._ready = true;
    this._onEvent$.next({
      type: TimelineEventType.TIMELINE_READY,
      data: {
        timeline: this.state,
      },
    });
  }

  private createDom() {
    this._rootElement = DomUtil.getElementByIdOrFail(this._config.htmlElementId);

    DomUtil.setAttributes(this._rootElement, {
      'data-omakase-timeline-id': this._id,
      'class': domClasses.root,
    });

    this._rootElement.innerHTML = `<div class="${domClasses.timelineOverlay}">
    <div class="${domClasses.timecode}"></div>
</div>
<div class="${domClasses.canvas}"></div>
    `;

    this._timelineOverlayElement = this.getElementOrFail<HTMLDivElement>(domClasses.timelineOverlay);
    this._timecodeElement = this.getElementOrFail<HTMLDivElement>(domClasses.timecode);
    this._canvasElement = this.getElementOrFail<HTMLDivElement>(domClasses.canvas);

    if (this._config.timecodeClickEdit) {
      this._timecodeElement.addEventListener('dblclick', () => {
        this.toggleTimecodeEdit();
      });
    }
  }

  private createCanvas() {
    let stageDimensions = this.resolveStageDimension();

    this._konvaStage = KonvaFactory.createStage({
      container: this._canvasElement,
      ...stageDimensions,
    });

    this._mainLayer = KonvaFactory.createLayer();
    this._surfaceLayer = KonvaFactory.createLayer({
      listening: true,
    });

    this._konvaStage.add(this._mainLayer);
    this._konvaStage.add(this._surfaceLayer);

    // region flex

    this._layoutBg = KonvaFactory.createBgRect({
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
    });

    this._headerBg = KonvaFactory.createBgRect({
      fill: this.style.headerBackgroundFill,
      opacity: this.style.headerBackgroundOpacity,
    });

    this._footerBg = KonvaFactory.createBgRect({
      fill: this.style.footerBackgroundFill,
      opacity: this.style.footerBackgroundOpacity,
    });

    this._layoutFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._layoutBg,
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      justifyContent: 'JUSTIFY_FLEX_START',
      width: stageDimensions.width,
      height: stageDimensions.height,
    });

    this._headerFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._headerBg,
      justifyContent: 'JUSTIFY_SPACE_BETWEEN',
      alignItems: 'ALIGN_CENTER',
      width: 'auto',
      height: this.style.headerHeight,
      margins: FlexSpacingBuilder.create().spacing(this.style.headerMarginBottom, 'EDGE_BOTTOM').build(),
      paddings: FlexSpacingBuilder.create().spacing(20, 'EDGE_START').spacing(20, 'EDGE_END').build(),
    });

    this._footerFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._footerBg,
      justifyContent: 'JUSTIFY_FLEX_END',
      alignItems: 'ALIGN_CENTER',
      width: 'auto',
      height: this.style.footerHeight,
      margins: FlexSpacingBuilder.create().spacing(this.style.footerMarginTop, 'EDGE_TOP').build(),
      paddings: FlexSpacingBuilder.create().spacing(20, 'EDGE_START').spacing(20, 'EDGE_END').build(),
    });

    this._mainFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      flexDirection: 'FLEX_DIRECTION_ROW',
      justifyContent: 'JUSTIFY_FLEX_START',
    });

    this._mainLeftFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      justifyContent: 'JUSTIFY_FLEX_START',
      width: this.style.leftPaneWidth,
    });

    this._mainRightFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      justifyContent: 'JUSTIFY_FLEX_START',
      flexGrow: 1,
    });

    // endregion

    this._timecodedContainer = KonvaFactory.createGroup();

    this._timecodedFloatingGroup = KonvaFactory.createGroup({
      name: '_timecodedFloatingGroup',
      draggable: true,
    });
    this._timecodedFloatingBg = KonvaFactory.createBgRect({
      fill: 'yellow',
      opacity: 0,
    });
    this._timecodedFloatingEventCatcher = KonvaFactory.createEventCatcherRect();

    this._timecodedContainer.add(
      this._timecodedFloatingGroup.add(
        ...[
          // this._timecodedFloatingBg,
          this._timecodedFloatingEventCatcher,
        ]
      )
    );

    for (let i = 0; i < MAIN_LAYER_CONTENT_GROUPS; i++) {
      let contentLayer = KonvaFactory.createGroup();
      this._timecodedFloatingGroup.add(contentLayer);
      this._timecodedFloatingContentGroups.set(i, contentLayer);
    }

    this._surfaceLayer_timecodedContainer = KonvaFactory.createGroup();
    this._surfaceLayer_timecodedFloatingGroup = KonvaFactory.createGroup();
    this._surfaceLayer_timecodedContainer.add(this._surfaceLayer_timecodedFloatingGroup);
    for (let i = 0; i < SURFACE_LAYER_CONTENT_GROUPS; i++) {
      let contentLayer = KonvaFactory.createGroup();
      this._surfaceLayer_timecodedFloatingGroup.add(contentLayer);
      this._surfaceLayer_timecodedFloatingContentGroups.set(i, contentLayer);
    }

    this._surfaceLayer.add(...[this._surfaceLayer_timecodedContainer]);

    this._playhead = new Playhead(
      {
        dragScrollMaxSpeedAfterPx: this.config.playheadDragScrollMaxSpeedAfterPx,
        style: {
          visible: this.style.playheadVisible,

          fill: this.style.playheadFill,
          draggingFill: this.style.scrubberSnappedFill,

          lineWidth: this.style.playheadLineWidth,

          symbolHeight: this.style.playheadSymbolHeight,
          symbolYOffset: -this.style.playheadScrubberHeight / 2,

          backgroundFill: this.style.playheadBackgroundFill,
          backgroundOpacity: this.style.playheadBackgroundOpacity,
          scrubberHeight: this.style.playheadScrubberHeight,
          playProgressFill: this.style.playheadPlayProgressFill,
          playProgressOpacity: this.style.playheadPlayProgressOpacity,
          bufferedFill: this.style.playheadBufferedFill,
          bufferedOpacity: this.style.playheadBufferedOpacity,
          textFill: this.style.playheadTextFill,
          textFontSize: this.style.playheadTextFontSize,
          textYOffset: this.style.playheadTextYOffset,
        },
      },
      this,
      this._player
    );

    this._scrubber = new Scrubber(
      {
        style: {
          visible: this.style.scrubberVisible,
          fill: this.style.scrubberFill,
          snappedFill: this.style.scrubberSnappedFill,
          textSnappedFill: this.style.scrubberSnappedFill,

          northLineWidth: this.style.scrubberNorthLineWidth,
          northLineOpacity: this.style.scrubberNorthLineOpacity,
          southLineWidth: this.style.scrubberSouthLineWidth,
          southLineOpacity: this.style.scrubberSouthLineOpacity,

          symbolHeight: this.style.scrubberSymbolHeight,
          symbolYOffset: -this.style.playheadScrubberHeight / 2,
          textFill: this.style.scrubberTextFill,
          textFontSize: this.style.scrubberTextFontSize,
          textYOffset: this.style.scrubberTextYOffset,
        },
      },
      this
    );

    this._thumbnailHoverWrapper = new ThumbnailHoverWrapper(
      new ThumbnailImg({
        style: {
          visible: false,
          stroke: this.style.thumbnailHoverStroke,
          strokeWidth: this.style.thumbnailHoverStrokeWidth,
        },
      })
    );

    for (const component of [this._playhead, this._scrubber, this._thumbnailHoverWrapper.thumbnailImg]) {
      this.addToSurfaceLayerTimecodedFloatingContent(component.konvaNode);
    }

    this._timecodedWrapperFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      positionType: 'POSITION_TYPE_ABSOLUTE',
      width: '100%',
      height: '100%',
      paddings: FlexSpacingBuilder.create().spacing(this.style.rightPaneMarginLeft, 'EDGE_START').spacing(this.style.rightPaneMarginRight, 'EDGE_END').build(),
    });

    this._timecodedContainerFlexGroup = KonvaFlexGroup.of({
      konvaNode: this._timecodedContainer,
      flexGrow: 1,
      height: '100%',
    });

    this._timecodedContainerStaticFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      flexGrow: 1,
      height: '100%',
    });

    this._timelineLaneStaticFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      positionType: 'POSITION_TYPE_ABSOLUTE',
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      width: '100%',
      height: '100%',
    });

    this._layoutFlexGroup
      .addChild(this._headerFlexGroup)
      .addChild(
        this._mainFlexGroup
          .addChild(this._mainLeftFlexGroup)
          .addChild(
            this._mainRightFlexGroup
              .addChild(this._timelineLaneStaticFlexGroup)
              .addChild(this._timecodedWrapperFlexGroup.addChild(this._timecodedContainerFlexGroup.addChild(this._timecodedContainerStaticFlexGroup)))
          )
      )
      .addChild(this._footerFlexGroup);

    // adding flex groups to layer
    this._mainLayer.add(...[this._layoutFlexGroup.contentNode.konvaNode]);

    this._scrubberLane = new ScrubberLane();

    this.addTimelineLane(this._scrubberLane);

    fromEvent(window, 'resize')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (event) => {
          this.onWindowResize();
        },
      });

    this._timecodedContainer.on('mousemove', (event) => {
      if (!this._player.isMainMediaLoaded) {
        return;
      }

      let timecodedContainerRPP = this._timecodedContainer.getRelativePointerPosition();
      this._onEvent$.next({
        type: TimelineEventType.TIMELINE_TIMECODE_MOUSE_MOVE,
        data: {
          mouseEvent: event.evt,
          cancelableEvent: event,
          pointerPosition: timecodedContainerRPP!,
          timecode: this.timelinePositionToTimecode(timecodedContainerRPP ? timecodedContainerRPP.x : 0),
        },
      });
    });

    this._konvaStage.on('mouseleave', (event) => {
      this.hideScrubber();
    });

    this._timecodedContainer.on('mouseleave', (event) => {
      this.hideScrubber();
      this.hideThumbnailHover();
    });

    this._scrubber.onMove$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        this._onEvent$.next({
          type: TimelineEventType.TIMELINE_SCRUBBER_MOVE,
          data: {
            timecode: event.timecode,
            snapped: event.snapped,
          },
        });
      },
    });

    this._playhead.onMove$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
      next: (event) => {
        this._onEvent$.next({
          type: TimelineEventType.TIMELINE_PLAYHEAD_MOVE,
          data: {
            timecode: event.timecode,
          },
        });
      },
    });

    let isPointerOnScrubberLane: () => boolean = () => {
      let pointerPosition = this._timecodedContainer.getRelativePointerPosition();
      let scrubberRect = this._scrubberLane.getTimecodedRect();
      return pointerPosition ? MeasurementUtil.isPositionInRect(pointerPosition, scrubberRect) : false;
    };

    if (this._config.zoomWheelEnabled) {
      this._timecodedContainer.on('wheel', (konvaEvent) => {
        if (!this._player.isMainMediaLoaded) {
          return;
        }

        if (isPointerOnScrubberLane()) {
          let wheelEvent = konvaEvent.evt;
          wheelEvent.preventDefault();

          let direction: ZoomDirection = wheelEvent.deltaY > 0 ? 'zoom_in' : 'zoom_out';
          if (wheelEvent.ctrlKey) {
            direction = direction === 'zoom_in' ? 'zoom_out' : 'zoom_in';
          }

          let timecodedContainerRPP = this._timecodedContainer.getRelativePointerPosition();
          if (timecodedContainerRPP) {
            this.zoomByStep(direction, this._config.zoomScaleWheel, timecodedContainerRPP.x);
          }

          this.refreshScrollWithPlayhead();
        }
      });
    }

    this._timecodedFloatingGroup.on('dragstart', (event) => {
      let startDrag = () => {
        this._dragBreaker.break();

        this.onEvent$
          .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_SCROLL))
          .pipe(takeUntil(this._dragBreaker.observer))
          .subscribe((event) => {
            this._dragConditions!.positionBeforeDrag = this._timecodedFloatingGroup.getPosition();
          });
      };

      let stopDrag = () => {
        event.target.stopDrag();
      };

      if (!this._player.isMainMediaLoaded) {
        stopDrag();
        return;
      }

      this._dragConditions = {
        positionBeforeDrag: this._timecodedFloatingGroup.getPosition(),
        isPlayheadDrag: isPointerOnScrubberLane(),
        playbackState: this._player.playerSession.playback,
      };

      if (this._player.isMainMediaLoaded) {
        if (this._dragConditions.isPlayheadDrag) {
          startDrag();
          if (this._dragConditions.playbackState?.playing) {
            this._player.onEvent$
              .pipe(filter((p) => p.type === PlayerEventType.PLAYER_PAUSE))
              .pipe(take(1))
              .pipe(takeUntil(this._dragBreaker.observer))
              .subscribe(() => {
                this._playhead.dragStart();
                let timecodedFloatingGroupRPP = this._timecodedFloatingGroup.getRelativePointerPosition();
                if (timecodedFloatingGroupRPP) {
                  this._playhead.dragMove(timecodedFloatingGroupRPP.x);
                }
              });
            this._player.pause();
          } else {
            this._playhead.dragStart();
          }
        } else {
          // @ts-ignore
          if (event.target.name === this._timecodedFloatingGroup.getAttrs().name && this.getZoomPercent() === 100) {
            stopDrag();
          } else {
            startDrag();
          }
        }
      } else {
        stopDrag();
      }
    });

    this._timecodedFloatingGroup.on('dragmove', (event) => {
      let doDragMove = () => {
        WindowUtil.cursor('grabbing');
        let newPosition = this._timecodedFloatingGroup.getPosition();
        let newX = newPosition.x;
        let newConstrainedX = this.constrainTimecodedFloatingPosition(newX);
        this._timecodedFloatingGroup.setAttrs({
          x: newConstrainedX,
          y: 0, // ensures that dragging is only on x-axis
        });

        if (this._dragConditions!.positionBeforeDrag!.x !== newConstrainedX) {
          this.layersSync();
          this.emitScrollEvent();
        }
      };

      let preventDragMove = () => {
        this._timecodedFloatingGroup.setPosition(this._dragConditions!.positionBeforeDrag!);
      };

      if (this._dragConditions!.isPlayheadDrag) {
        preventDragMove();
        let timecodedFloatingGroupRPP = this._timecodedFloatingGroup.getRelativePointerPosition();
        if (timecodedFloatingGroupRPP) {
          this._playhead.dragMove(timecodedFloatingGroupRPP.x);
        }
        this._dragConditions!.positionBeforeDrag = this._timecodedFloatingGroup.getPosition();
      } else {
        // drag timeline
        doDragMove();
      }
    });

    this._timecodedFloatingGroup.on('dragend', (event) => {
      if (!this._player.isMainMediaLoaded) {
        return;
      }

      if (this._dragConditions!.isPlayheadDrag) {
        this._playhead.dragEnd();
        let seconds = this.timelinePositionToTime(this._playhead.getPlayheadPosition());
        this._player.seekTo(seconds).subscribe((event) => {
          if (event && this._dragConditions?.playbackState?.playing) {
            this._player.play();
          }
        });
      } else {
        // drag timeline
        WindowUtil.cursor('default');
        this.scrubberMove();
        this.refreshScrollWithPlayhead();
      }
      this._dragBreaker.break();
    });

    this._scrubberLane.onMouseMove$
      .pipe(debounceTime(20))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (event) => {
          if (!this._player.isMainMediaLoaded) {
            return;
          }

          if (this._thumbnailTrack) {
            let x = this._timecodedFloatingGroup.getRelativePointerPosition()?.x;
            if (x) {
              let time = this.timelinePositionToTime(x);
              let thumbnail = this._thumbnailTrack.findFirstTimedItemAtTime(time);
              if (thumbnail) {
                this.showThumbnailHover(thumbnail);
              }
            }
          }
        },
      });

    this._scrubberLane.onMouseLeave$
      .pipe(debounceTime(50))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.hideThumbnailHover();
      });

    let emitTimelineTimecodeClick = (event: KonvaEventObject<PointerEvent, Konva.Group>) => {
      let timecodedFloatingGroupRPP = this._timecodedFloatingGroup.getRelativePointerPosition();

      let seconds = this.timelinePositionToTime(timecodedFloatingGroupRPP ? timecodedFloatingGroupRPP.x : 0);
      let timecode = this._player.convertTime(seconds, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);

      this._player.convertTime(seconds, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);

      this._onEvent$.next({
        type: TimelineEventType.TIMELINE_TIMECODE_CLICK,
        data: {
          mouseEvent: event.evt,
          cancelableEvent: event,
          pointerPosition: timecodedFloatingGroupRPP!,
          seconds: seconds,
          timecode: timecode,
        },
      });
    };

    this._timecodedContainer.on('click touchend', (event) => {
      if (!this._player.isMainMediaLoaded) {
        return;
      }
      emitTimelineTimecodeClick(event);
    });

    this._surfaceLayer_timecodedContainer.on('click touchend', (event) => {
      if (!this._player.isMainMediaLoaded) {
        return;
      }
      emitTimelineTimecodeClick(event);
    });

    this._playhead.onStateChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((state) => {
      if (state.dragging) {
        this._scrubber.style = {
          visible: false,
        };
      }
    });

    if (this._config.scrubberClickSeek) {
      this.onEvent$
        .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_TIMECODE_CLICK))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe((event) => {
          if (isPointerOnScrubberLane()) {
            this.handleTimecodeClick(event.data.timecode);
          }
        });
    }
  }

  private resolveStageDimension(): Dimension {
    let divElementRect: RectMeasurement = {
      x: this._rootElement.offsetLeft,
      y: this._rootElement.offsetTop,
      width: this._rootElement.offsetWidth,
      height: this._rootElement.offsetHeight,
    };

    let header = this.style.headerHeight + this.style.headerMarginBottom;

    let lanes = this.getTimelineLanes()
      .map((p) => {
        let layout = p.mainRightFlexGroup.getLayout();
        return layout.height + layout.bottom;
      })
      .reduce((acc, current) => acc + current, 0);

    let footer = this.style.footerHeight + this.style.footerMarginTop;

    let layout = header + lanes + footer;

    return {
      width: divElementRect.width >= this.style.stageMinWidth ? divElementRect.width : this.style.stageMinWidth,
      height: layout >= this.style.stageMinHeight ? layout : this.style.stageMinHeight,
    };
  }

  private handleTimecodeClick(timecode: string) {
    if (!this._player.isMainMediaLoaded) {
      return;
    }

    // here we seek to timecode because we don't want frames drift in case of drop frames
    this._player.seekTo(timecode, MediaTemporalFormat.TIMECODE);
  }

  private hideScrubber() {
    this._scrubber.style = {
      visible: false,
    };
  }

  private settleDom() {
    this.refreshTimecode();

    if (this.getScrubberLane()) {
      let position: Position = this.getScrubberLane().mainLeftFlexGroup.contentNode.konvaNode.absolutePosition();
      let dimension: Dimension = {
        width: this.getScrubberLane().mainLeftFlexGroup.contentNode.konvaNode.width(),
        height: this.getScrubberLane().mainLeftFlexGroup.contentNode.konvaNode.height(),
      };

      this._timecodeElement.style.top = `${position.y}px`;
      this._timecodeElement.style.left = `${position.x}px`;
      this._timecodeElement.style.width = `${dimension.width}px`;
      this._timecodeElement.style.height = `${dimension.height}px`;

      this._timecodeElement.style.fontStyle = `${this.style.textFontStyle}`;
      this._timecodeElement.style.fontFamily = `${this.style.textFontFamily}`;
    }
  }

  settleLayout(): void {
    this._layoutFlexGroup.refreshLayout(); // make sure all child layouts are refreshed (ie. timeline lane layouts)

    let stageDimensions = this.resolveStageDimension();

    this._konvaStage.setAttrs({
      ...stageDimensions,
    });

    this._layoutFlexGroup.setDimension(stageDimensions.width, stageDimensions.height);

    this.settleTimecodedGroups();

    this._scrubber.onMeasurementsChange();

    this._timelineLanes.forEach((timelineLane) => {
      timelineLane.onMeasurementsChange();
    });

    this._playhead.onMeasurementsChange();

    this.zoomByWidth(this.getTimecodedFloatingDimension().width, this.resolveTimelineContainerZoomFocusPosition());

    this.settleDom();
  }

  private settleTimecodedGroups() {
    let timecodedFlexGroupLayout = this._timecodedContainerFlexGroup.getLayout();

    let newTimecodedWidth = this.calculateTimecodedWidthFromZoomRatioPercent(this.getZoomPercent());

    [this._timecodedFloatingGroup, ...this._timecodedFloatingGroup.getChildren()].forEach((node) => {
      node.setAttrs({
        width: newTimecodedWidth,
        height: timecodedFlexGroupLayout.height,
      });
    });

    this._timecodedContainer.clipFunc((ctx) => {
      ctx.rect(-this.style.rightPaneClipPadding, -500, this._timecodedContainer.width() + 2 * this.style.rightPaneClipPadding, this._timecodedContainer.height() + 500);
    });

    this.layersSync();
  }

  private layersSync() {
    [this._surfaceLayer_timecodedContainer].forEach((timecodedContainer) => {
      timecodedContainer.setAttrs({
        ...this._timecodedContainer.absolutePosition(),
        ...this._timecodedContainer.size(),
      });

      timecodedContainer.clipFunc((ctx) => {
        ctx.rect(-this.style.rightPaneClipPadding, -500, timecodedContainer.width() + 2 * this.style.rightPaneClipPadding, timecodedContainer.height() + 500);
      });
    });

    [this._surfaceLayer_timecodedFloatingGroup].forEach((timecodedGroup) => {
      timecodedGroup.setAttrs({
        ...this._timecodedFloatingGroup.position(),
        ...this._timecodedFloatingGroup.size(),
      });

      [...timecodedGroup.getChildren()].forEach((node) => {
        node.setAttrs({
          ...this._timecodedFloatingGroup.size(),
        });
      });
    });
  }

  private onWindowResize() {
    this.settleLayout();
  }

  private emitScrollEvent() {
    this._onEvent$.next({
      type: TimelineEventType.TIMELINE_SCROLL,
      data: {
        scrollPercent: this.getHorizontalScrollPercent(),
      },
    });
  }

  private emitZoomEvent() {
    this._onEvent$.next({
      type: TimelineEventType.TIMELINE_ZOOM,
      data: {
        zoomPercent: this.getZoomPercent(),
      },
    });
  }

  // region scroll
  getHorizontalScrollPercent(): number {
    if (this.isSnappedStart()) {
      return 0;
    } else if (this.isSnappedEnd()) {
      return 100;
    } else {
      let maxScroll = new Decimal(this.getTimecodedContainerDimension().width - this.getTimecodedFloatingDimension().width).abs();
      let scrollPercent = new Decimal(this.getTimecodedFloatingPosition().x).abs().mul(100).div(maxScroll).toNumber();
      return scrollPercent;
    }
  }

  scrollHorizontallyToPercent(percent: number) {
    this.scrollTimeline(this.calculateTimelineXFromScrollPercent(percent));
    this.refreshScrollWithPlayhead();
  }

  getScrollHandleHorizontals(scrollbarWidth: number): Horizontals {
    let timecodedFloatingDimension = this.getTimecodedFloatingDimension();
    let timecodedContainerDimension = this.getTimecodedContainerDimension();
    let timecodedFloatingPosition = this.getTimecodedFloatingPosition();

    if (!scrollbarWidth || !timecodedContainerDimension || !timecodedFloatingDimension || timecodedFloatingDimension.width < 1) {
      return {
        width: 0,
        x: 0,
      };
    }

    let scrollHandleWidth = new Decimal(scrollbarWidth).mul(timecodedContainerDimension.width).div(timecodedFloatingDimension.width).round().toNumber();

    return {
      width: scrollHandleWidth,
      x: new Decimal(timecodedFloatingPosition.x).abs().mul(scrollbarWidth).div(timecodedFloatingDimension.width).toNumber(),
    };
  }

  scrollToEased(percent: number): Observable<number> {
    percent = z.coerce.number().min(0).max(100).parse(percent);

    return this.scrollToPercentEased(percent);
  }

  scrollToPlayheadEased(): Observable<number> {
    let newTimelineX = -this._playhead.getPlayheadPosition() + this.getTimecodedContainerDimension().width / 2;
    return this.scrollToPositionEased(newTimelineX);
  }

  private scrollToPercent(percent: number) {
    let newX = this.calculateTimelineXFromScrollPercent(percent);
    this.scrollTimeline(newX);
  }

  private scrollToPercentEased(percent: number): Observable<number> {
    let newTimelineX = this.calculateTimelineXFromScrollPercent(percent);
    return this.scrollToPositionEased(newTimelineX);
  }

  private scrollToPositionEased(newTimelineX: number): Observable<number> {
    return passiveObservable((observer) => {
      let currentTimelineX = this.getTimecodedFloatingPosition().x;
      animate({
        duration: this._config.scrollEasingDuration,
        startValue: currentTimelineX,
        endValue: newTimelineX,
        onUpdateHandler: (frame, value) => {
          this.scrollTimeline(value);
        },
        onCompleteHandler: (frame, value) => {
          nextCompleteObserver(observer, this.getHorizontalScrollPercent());
        },
      });
    });
  }

  private isPlayheadInTimecodedView(): boolean {
    return this.isInVisiblePositionRange(this._playhead.getPlayheadPosition());
  }

  private refreshScrollWithPlayhead() {
    let playheadPosition = this._playhead.getPlayheadPosition();
    let isInBeforeTimecodedView = playheadPosition < this.getVisiblePositionRange().start;
    let isInVisiblePositionRange = this.isInVisiblePositionRange(playheadPosition);
    this._scrollWithPlayhead = isInVisiblePositionRange && !isInBeforeTimecodedView; // we scroll with playhead only if playhed slips to right of timecoded view
  }

  /**
   * Scrolls timecoded group so that playhead is at left most position
   * @private
   */
  private syncTimelineWithPlayhead(): Observable<number> {
    return new Observable<number>((o$) => {
      this.scrollToPositionEased(-this._playhead.getPlayheadPosition())
        .pipe(
          map((result) => {
            o$.next(this.getHorizontalScrollPercent());
            o$.complete();
          })
        )
        .subscribe();
    });
  }

  scrollTimeline(x: number) {
    let currentX = this.getTimecodedFloatingPosition().x;
    let newX = this.constrainTimecodedFloatingPosition(x);
    if (newX !== currentX) {
      this._timecodedFloatingGroup.x(newX);
      this.layersSync();
      this.emitScrollEvent();
    }
  }

  private calculateTimelineXFromScrollPercent(percent: number): number {
    percent = this.getConstrainedScrollPercent(percent);

    let timecodedGroupDimension = this.getTimecodedFloatingDimension();
    let containerDimension = this.getTimecodedContainerDimension();

    if (timecodedGroupDimension.width > containerDimension.width) {
      let maxScroll = new Decimal(containerDimension.width - timecodedGroupDimension.width);
      return new Decimal(percent).mul(maxScroll).div(100).toDecimalPlaces(2).toNumber();
    } else {
      return 0;
    }
  }

  // endregion

  // region zoom

  getZoomPercent(): number {
    let floatingDimension = this.getTimecodedFloatingDimension();
    let containerDimension = this.getTimecodedContainerDimension();

    if (floatingDimension.width > containerDimension.width) {
      return new Decimal(floatingDimension.width).mul(100).div(containerDimension.width).round().toNumber();
    } else {
      return this._config.zoomBaseline;
    }
  }

  zoomTo(percent: number, zoomFocusPercent: number | undefined = void 0): number {
    let percentSafeParsed = z.coerce.number().min(this._config.zoomBaseline).max(this._config.zoomMax).safeParse(percent);

    if (percentSafeParsed.success) {
      percent = this.getConstrainedZoomPercent(percentSafeParsed.data);
      let newTimecodedWidth = this.calculateTimecodedWidthFromZoomRatioPercent(percent);
      let timecodedContainerFocus = zoomFocusPercent ? this.resolveTimecodedFloatingPosition(zoomFocusPercent) : this.resolveTimelineContainerZoomFocusPosition();
      this.zoomByWidth(newTimecodedWidth, timecodedContainerFocus);
    }

    return this.getZoomPercent();
  }

  zoomToEased(percent: number, zoomFocusPercent: number | undefined = void 0): Observable<number> {
    let percentSafeParsed = z.coerce.number().min(this._config.zoomBaseline).max(this._config.zoomMax).safeParse(percent);

    if (percentSafeParsed.success) {
      let timecodedContainerFocus = zoomFocusPercent ? this.resolveTimecodedFloatingPosition(zoomFocusPercent) : this.resolveTimelineContainerZoomFocusPosition();
      return this.zoomByPercentEased(percentSafeParsed.data, timecodedContainerFocus);
    } else {
      return passiveObservable((observer) => nextCompleteObserver(observer, this.getZoomPercent()));
    }
  }

  private resolveTimecodedFloatingPosition(percent: number): number {
    let floatingDimension = this.getTimecodedFloatingDimension();
    return new Decimal(floatingDimension.width).mul(percent).div(100).toNumber();
  }

  zoomInEased(): Observable<number> {
    return this.zoomByStepEased('zoom_in', this._config.zoomScale, this.resolveTimelineContainerZoomFocusPosition());
  }

  zoomOutEased(): Observable<number> {
    return this.zoomByStepEased('zoom_out', this._config.zoomScale, this.resolveTimelineContainerZoomFocusPosition());
  }

  zoomToMaxEased(): Observable<number> {
    return this.zoomByPercentEased(this._config.zoomMax, this.resolveTimelineContainerZoomFocusPosition());
  }

  private zoomByStep(direction: ZoomDirection, zoomScale: number, timecodedContainerFocus: number) {
    if ((direction === 'zoom_in' && this.getZoomPercent() === this._config.zoomMax) || (direction === 'zoom_out' && this.getZoomPercent() === 100)) {
      return;
    }

    let currentWidthDecimal = new Decimal(this.getTimecodedFloatingDimension().width);
    let newWidth = (direction === 'zoom_in' ? currentWidthDecimal.mul(zoomScale) : currentWidthDecimal.div(zoomScale)).round().toNumber();
    this.zoomByWidth(newWidth, timecodedContainerFocus);
  }

  private zoomByPercent(percent: number, timelineContainerFocusPosition: number): number {
    percent = this.getConstrainedZoomPercent(percent);
    let newWidth = this.calculateTimecodedWidthFromZoomRatioPercent(percent);
    this.zoomByWidth(newWidth, timelineContainerFocusPosition);
    return this.getZoomPercent();
  }

  private zoomByWidth(newTimecodedWidth: number, timecodedContainerFocus: number) {
    let currentTimecodedX = this.getTimecodedFloatingPosition().x;
    let currentTimecodedWidth = this.getTimecodedFloatingDimension().width;
    let containerDimension = this.getTimecodedContainerDimension();

    newTimecodedWidth = this.getConstrainedTimecodedWidth(newTimecodedWidth);
    let newTimecodedX: number;

    if (newTimecodedWidth === containerDimension.width) {
      newTimecodedX = 0; // snap start
    } else if (newTimecodedWidth === currentTimecodedWidth) {
      newTimecodedX = currentTimecodedX;
    } else {
      newTimecodedX = new Decimal(Math.abs(currentTimecodedX) + timecodedContainerFocus).mul(newTimecodedWidth).div(currentTimecodedWidth).mul(-1).plus(timecodedContainerFocus).toNumber();
    }

    if (newTimecodedX > 0) {
      newTimecodedX = 0; // snap start
    } else if (newTimecodedX + newTimecodedWidth <= containerDimension.width) {
      newTimecodedX = containerDimension.width - newTimecodedWidth; // snap end
    }

    this.hideThumbnailHover();

    this.settleTimecodedFloating({
      width: newTimecodedWidth,
      x: newTimecodedX,
    });

    if (newTimecodedWidth !== currentTimecodedWidth || newTimecodedX !== currentTimecodedX) {
      this.emitZoomEvent();
      this.emitScrollEvent();
    }
  }

  private settleTimecodedFloating(horizontals: Horizontals) {
    this._timecodedFloatingGroup.setAttrs({
      width: horizontals.width,
      x: horizontals.x,
    });

    this._timecodedFloatingGroup.getChildren().forEach((node) => {
      node.setAttrs({
        width: horizontals.width, // just width is enough
      });
    });

    this.layersSync();
  }

  private zoomByStepEased(direction: ZoomDirection, zoomScale: number, timecodedContainerFocus: number): Observable<number> {
    let currentWidthDecimal = new Decimal(this.getTimecodedFloatingDimension().width);
    let newWidth = (direction === 'zoom_in' ? currentWidthDecimal.mul(zoomScale) : currentWidthDecimal.div(zoomScale)).round().toNumber();
    return this.zoomByWidthEased(newWidth, timecodedContainerFocus);
  }

  private zoomByPercentEased(percent: number, timecodedContainerFocus: number): Observable<number> {
    percent = this.getConstrainedZoomPercent(percent);
    let newTimecodedWidth = this.calculateTimecodedWidthFromZoomRatioPercent(percent);
    return this.zoomByWidthEased(newTimecodedWidth, timecodedContainerFocus);
  }

  private zoomByWidthEased(newTimecodedWidth: number, timecodedContainerFocus: number): Observable<number> {
    return passiveObservable((observer) => {
      let currentWidth = this.getTimecodedFloatingDimension().width;

      if (currentWidth !== newTimecodedWidth) {
        animate({
          duration: this._config.zoomEasingDuration,
          startValue: currentWidth,
          endValue: newTimecodedWidth,
          onUpdateHandler: (frame, value) => {
            this.zoomByWidth(value, timecodedContainerFocus);
          },
          onCompleteHandler: (frame, value) => {
            nextCompleteObserver(observer, this.getZoomPercent());
          },
        });
      } else {
        nextCompleteObserver(observer, this.getZoomPercent());
      }
    });
  }

  private resolveTimelineContainerZoomFocusPosition(): number {
    if (this._player.isMainMediaLoaded && this.isPlayheadInTimecodedView()) {
      return this._playhead.getPlayheadPosition() + this.getTimecodedFloatingPosition().x;
    } else {
      return this.isSnappedStart() ? 0 : this.isSnappedEnd() ? this.getTimecodedContainerDimension().width : this.getTimecodedContainerDimension().width / 2;
    }
  }

  private calculateTimecodedWidthFromZoomRatioPercent(zoomRatioPercent: number): number {
    return new Decimal(this.getTimecodedContainerDimension().width).mul(zoomRatioPercent).div(100).round().toNumber();
  }

  private getConstrainedTimecodedWidth(newWidth: number): number {
    let containerDimension = this.getTimecodedContainerDimension();
    if (newWidth >= containerDimension.width) {
      let maxTimecodedGroupWidth = this.calculateTimecodedWidthFromZoomRatioPercent(this._config.zoomMax);
      return newWidth <= maxTimecodedGroupWidth ? newWidth : maxTimecodedGroupWidth;
    } else {
      return containerDimension.width;
    }
  }

  private getConstrainedZoomPercent(percent: number): number {
    return percent < this._config.zoomBaseline ? this._config.zoomBaseline : percent > this._config.zoomMax ? this._config.zoomMax : percent;
  }

  private getConstrainedScrollPercent(scrollPercent: number): number {
    return scrollPercent < 0 ? 0 : scrollPercent > 100 ? 100 : scrollPercent;
  }

  // endregion

  // region playhead

  private scrubberMove() {
    if (this._player.isMainMediaLoaded && this._scrubber) {
      let isSnapped = false;
      let pointerPosition = this.getTimecodedFloatingRelativePointerPosition();

      if (pointerPosition) {
        let x = pointerPosition.x;
        if (!this._player.playerSession.playback.playing) {
          // check if we need to snap scrubber to playhead
          let playheadX = this._playhead.getPlayheadPosition();
          if (x > playheadX - this._config.scrubberSnapArea && x < playheadX + this._config.scrubberSnapArea) {
            x = playheadX;
            isSnapped = true;
          }
        }
        this._scrubber.move(x, isSnapped);
      }
    }
  }

  // endregion

  // region video

  private onMainMediaLoaded() {
    this._mediaBreaker.break();

    this.doPlaybackProgress();

    this._player.onEvent$
      .pipe(filter((p) => p.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS))
      .pipe(sampleTime(playbackProgressThrottle))
      .pipe(takeUntil(this._mediaBreaker.observer))
      .subscribe((event) => {
        this.doPlaybackProgress();
      });

    this._player.onEvent$
      .pipe(
        filter(
          (p) => p.type === PlayerEventType.PLAYER_SEEKING || p.type === PlayerEventType.PLAYER_SEEKED || p.type === PlayerEventType.PLAYER_PLAY || p.type === PlayerEventType.PLAYER_MAIN_MEDIA_UPDATED
        )
      )
      .pipe(takeUntil(this._mediaBreaker.observer))
      .subscribe((event) => {
        switch (event.type) {
          case PlayerEventType.PLAYER_SEEKING:
            this.refreshScrollWithPlayhead();
            break;
          case PlayerEventType.PLAYER_SEEKED:
            this.scrubberMove();
            break;
          case PlayerEventType.PLAYER_PLAY:
            this.refreshScrollWithPlayhead();
            break;
          case PlayerEventType.PLAYER_MAIN_MEDIA_UPDATED:
            // update on media changes - feature live
            break;
        }
      });

    this.onEvent$
      .pipe(filter((e) => e.type === TimelineEventType.TIMELINE_TIMECODE_MOUSE_MOVE))
      .pipe(takeUntil(this._mediaBreaker.observer))
      .subscribe(() => {
        if (!this._scrubber.style.visible) {
          this._scrubber.style = {
            visible: true,
          };
        }

        this.scrubberMove();
      });

    this.onEvent$
      .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_ZOOM || p.type === TimelineEventType.TIMELINE_SCROLL))
      .pipe(takeUntil(this._mediaBreaker.observer))
      .subscribe((event) => {
        this.scrubberMove();
      });
  }

  private doPlaybackProgress() {
    // follows playhead and scrolls playhead to left if playhead moves out of view
    if (this._scrollWithPlayhead && !this.isPlayheadInTimecodedView() && !this._syncTimelineWithPlayheadInProgress) {
      this._syncTimelineWithPlayheadInProgress = true;
      this.syncTimelineWithPlayhead().subscribe((result) => {
        this._syncTimelineWithPlayheadInProgress = false;
      });
    }

    this.refreshTimecode();
  }

  // endregion

  addTimelineLane(timelineLane: TimelineLaneApi): TimelineLaneApi {
    return this._addTimelineLane(timelineLane, true);
  }

  private _addTimelineLane(timelineLane: TimelineLaneApi, settleLayout: boolean): TimelineLaneApi {
    return this._addTimelineLaneAtIndex(timelineLane, this._timelineLanes.length, settleLayout);
  }

  addTimelineLaneAtIndex(timelineLane: TimelineLaneApi, index: number): TimelineLaneApi {
    return this._addTimelineLaneAtIndex(timelineLane, index, true);
  }

  private _addTimelineLaneAtIndex(timelineLane: TimelineLaneApi, index: number, settleLayout: boolean): TimelineLaneApi {
    if (this._timelineLanesMap.has(timelineLane.id)) {
      throw new Error(`TimelineLane with id=${timelineLane.id} already exist`);
    }

    if (index < 0 || index > this._timelineLanes.length) {
      throw new Error(`TimelineLane index must be ${0} >= index <= ${this._timelineLanes.length}, provided ${index}`);
    }

    this._timelineLanes.splice(index, 0, timelineLane);
    this._timelineLanesMap.set(timelineLane.id, timelineLane);

    timelineLane.prepareForTimeline(this, this._player, this._ompProvider);

    this._mainLeftFlexGroup.addChild(timelineLane.mainLeftFlexGroup, index);
    this._timelineLaneStaticFlexGroup.addChild(timelineLane.mainRightFlexGroup, index);

    if (settleLayout) {
      this.settleLayout();
    }

    return timelineLane;
  }

  removeTimelineLane(id: string): void {
    let result = this._removeTimelineLane(id);
    if (result) {
      this.settleLayout();
    }
  }

  removeTimelineLanes(ids: string[]) {
    let isAnyRemoved = false;
    ids.forEach((id) => {
      let result = this._removeTimelineLane(id, false);
      if (result) {
        isAnyRemoved = result;
      }
    });
    if (isAnyRemoved) {
      this._mainLeftFlexGroup.refreshLayoutFromRoot();
      this._timelineLaneStaticFlexGroup.refreshLayoutFromRoot();
      this.settleLayout();
    }
  }

  removeAllTimelineLanes() {
    this.removeTimelineLanes(this.getTimelineLanes().map((p) => p.id));
  }

  private _removeTimelineLane(id: string, refreshLayout: boolean = true): boolean {
    if (!this._timelineLanesMap.has(id)) {
      console.debug(`TimelineLane with id=${id} doesn't exist`);
      return false;
    }

    let timelineLane = this._timelineLanesMap.get(id);

    if (timelineLane instanceof ScrubberLane) {
      // console.debug(`TimelineLane with id=${id} [ScrubberLane] cannot be removed`);
      return false;
    }

    if (timelineLane) {
      this._mainLeftFlexGroup.removeChild(timelineLane!.mainLeftFlexGroup, refreshLayout);
      this._timelineLaneStaticFlexGroup.removeChild(timelineLane!.mainRightFlexGroup, refreshLayout);

      this._timelineLanes.splice(
        this._timelineLanes.findIndex((p) => p.id === id),
        1
      );
      this._timelineLanesMap.delete(id);
      timelineLane!.destroy();

      if (refreshLayout) {
        this.settleLayout();
      }
      return true;
    }

    return false;
  }

  addTimelineLanes(timelineLanes: TimelineLaneApi[]): TimelineLaneApi[] {
    timelineLanes.forEach((p) => this._addTimelineLane(p, false));
    this.settleLayout();
    return timelineLanes;
  }

  getTimelineLanes(): TimelineLaneApi[] {
    return this._timelineLanes;
  }

  getTimelineLane<T extends TimelineLaneApi>(id: string): T | undefined {
    let timelineLane = this._timelineLanesMap.get(id);
    return timelineLane ? (timelineLane as T) : void 0;
  }

  getScrubberLane(): ScrubberLane {
    return this.getTimelineLanes().find((p) => p instanceof ScrubberLane)! as ScrubberLane;
  }

  // endregion

  addToTimecodedFloatingContent(node: Konva.Group | Konva.Shape, zIndex: number = 0) {
    if (this._timecodedFloatingContentGroups.has(zIndex)) {
      this._timecodedFloatingContentGroups.get(zIndex)!.add(node);
    } else {
      console.error(`Main content group with zIndex: ${zIndex} does not exist`);
    }
  }

  addToTimecodedStaticContent(node: Konva.Group | Konva.Shape, zIndex: number = 0) {
    this._timecodedContainerStaticFlexGroup.contentNode.konvaNode.add(node);
  }

  addToSurfaceLayerTimecodedFloatingContent(node: Konva.Group | Konva.Shape, zIndex: number = 0) {
    if (this._surfaceLayer_timecodedFloatingContentGroups.has(zIndex)) {
      this._surfaceLayer_timecodedFloatingContentGroups.get(zIndex)!.add(node);
    } else {
      console.error(`Surface content group with zIndex: ${zIndex} does not exist`);
    }
  }

  addToFooterFlexGroup(flexNode: FlexNode<any>) {
    this._footerFlexGroup.addChild(flexNode);
  }

  constrainTimelinePosition(x: number): number {
    let dimension = this.getTimecodedFloatingDimension();
    return x < 0 ? 0 : x > dimension.width ? dimension.width : x;
  }

  timelinePositionToTime(xOnTimeline: number): number {
    return this.convertPositionOnTimelineToTime(xOnTimeline, this.getTimecodedFloatingDimension().width);
  }

  timelineContainerPositionToTime(xOnTimeline: number): number {
    return this.timelinePositionToTime(Math.abs(this.getTimecodedFloatingHorizontals().x) + xOnTimeline);
  }

  timelinePositionToTimecode(x: number): string {
    let seconds = this.timelinePositionToTime(x);
    return this._player.convertTime(seconds, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
  }

  timeToTimelinePosition(time: number | string): number {
    return this.convertTimeToTimelinePosition(time, this.getTimecodedFloatingDimension().width);
  }

  private convertTimeToTimelinePosition(time: number | string, timecodedWidth: number): number {
    return this._player.isMainMediaLoaded ? new Decimal(time).mul(timecodedWidth).div(this._player.getDuration()).toNumber() : 0;
  }

  private convertPositionOnTimelineToTime(xOnTimeline: number, timecodedWidth: number): number {
    let constrainedX = this.constrainTimelinePosition(xOnTimeline);
    return this._player.isMainMediaLoaded ? new Decimal(constrainedX).mul(this._player.getDuration()).div(timecodedWidth).toNumber() : 0;
  }

  private constrainTimecodedFloatingPosition(x: number): number {
    let timecodedGroupDimension = this.getTimecodedFloatingDimension();
    let containerDimension = this.getTimecodedContainerDimension();
    if (timecodedGroupDimension.width <= containerDimension.width) {
      return 0;
    } else {
      let minX = containerDimension.width - timecodedGroupDimension.width;
      return x < minX ? minX : x > 0 ? 0 : x;
    }
  }

  getTimecodedContainerDimension(): Dimension {
    return this._timecodedContainer.getSize();
  }

  getTimecodedFloatingDimension(): Dimension {
    return this._timecodedFloatingGroup.getSize();
  }

  getTimecodedFloatingPosition(): Position {
    return this._timecodedFloatingGroup.getPosition();
  }

  getTimecodedFloatingRelativePointerPosition(): Position | undefined {
    if (this._konvaStage.getPointersPositions().length > 0) {
      let rpp = this._timecodedFloatingGroup.getRelativePointerPosition();
      return rpp ?? void 0;
    } else {
      return void 0;
    }
  }

  // getTimecodedContainerRelativePointerPosition(): Position | undefined {
  //   return this._timecodedContainer.getRelativePointerPosition() ?? void 0;
  // }

  getTimecodedFloatingRect(): RectMeasurement {
    return {
      ...this._timecodedFloatingGroup.getPosition(),
      ...this._timecodedFloatingGroup.getSize(),
    };
  }

  getTimecodedFloatingHorizontals(): Horizontals {
    return {
      x: this._timecodedFloatingGroup.x(),
      width: this._timecodedFloatingGroup.width(),
    };
  }

  getVisiblePositionRange(): {start: number; end: number} {
    let start = Math.abs(this._timecodedFloatingGroup.x());
    let end = start + this._timecodedContainer.width();
    return {start, end};
  }

  private isInVisiblePositionRange(x: number): boolean {
    let visiblePosition = this.getVisiblePositionRange();
    return x >= visiblePosition.start && x <= visiblePosition.end;
  }

  private isSnappedStart(): boolean {
    return this.getTimecodedFloatingPosition().x === 0;
  }

  private isSnappedEnd(): boolean {
    return this.getTimecodedContainerDimension().width - this.getTimecodedFloatingDimension().width === this.getTimecodedFloatingPosition().x;
  }

  getVisibleTimeRange(): {start: number; end: number} {
    let positionRange = this.getVisiblePositionRange();
    let start = this.timelinePositionToTime(positionRange.start);
    let end = this.timelinePositionToTime(positionRange.end);
    return {start, end};
  }

  setDescriptionPaneVisible(visible: boolean): void {
    this._mainLeftFlexGroup.setWidth(visible ? this.style.leftPaneWidth : 0);
    this.settleLayout();
    this._descriptionPaneVisible = visible;
  }

  toggleDescriptionPaneVisible(): void {
    this.setDescriptionPaneVisible(!this._descriptionPaneVisible);
  }

  setDescriptionPaneVisibleEased(visible: boolean): Observable<void> {
    return passiveObservable((observer) => {
      animate({
        duration: this._config.layoutEasingDuration,
        startValue: visible ? 0 : this._mainLeftFlexGroup.getLayout().width,
        endValue: visible ? this.style.leftPaneWidth : 0,
        onUpdateHandler: (frame, value) => {
          this._mainLeftFlexGroup.setWidth(Math.round(value));
          this.settleLayout();
        },
        onCompleteHandler: (frame, value) => {
          this.setDescriptionPaneVisible(visible);
          nextCompleteObserver(observer);
        },
      });
    });
  }

  toggleDescriptionPaneVisibleEased(): Observable<void> {
    return this.setDescriptionPaneVisibleEased(!this._descriptionPaneVisible);
  }

  protected _minimizeTimelineLane(timelineLane: TimelineLaneApi, refreshLayout = true) {
    let timelineLane1 = this.getTimelineLane(timelineLane.id);
    if (timelineLane1) {
      if (timelineLane1 instanceof BaseTimelineLane) {
        timelineLane1._minimize(refreshLayout);
      }
    } else {
      console.debug(`TimelineLane with id=${timelineLane.id} is not in Timeline`);
    }
  }

  minimizeTimelineLanes(timelineLanes: TimelineLaneApi[]) {
    timelineLanes.forEach((timelineLane) => {
      this._minimizeTimelineLane(timelineLane, false);
    });
    this.settleLayout();
  }

  protected _maximizeTimelineLane(timelineLane: TimelineLaneApi, refreshLayout = true) {
    let timelineLane1 = this.getTimelineLane(timelineLane.id);
    if (timelineLane1) {
      if (timelineLane1 instanceof BaseTimelineLane) {
        timelineLane1._maximize(refreshLayout);
      }
    } else {
      console.debug(`TimelineLane with id=${timelineLane.id} is not in Timeline`);
    }
  }

  maximizeTimelineLanes(timelineLanes: TimelineLaneApi[]) {
    timelineLanes.forEach((timelineLane) => {
      this._maximizeTimelineLane(timelineLane, false);
    });
    this.settleLayout();
  }

  // set style(value: Partial<TimelineStyle>) {
  //   // this._styleAdapter.style = value;
  //   // this._onEvent$.next({
  //   //   type: TimelineEventType.TIMELINE_STYLE_CHANGE,
  //   //   data: {
  //   //     style: this.style,
  //   //   },
  //   // });
  // }

  private clearContent() {
    this.zoomByPercent(this._config.zoomBaseline, this.resolveTimelineContainerZoomFocusPosition());

    this.refreshTimecode();
  }

  get config(): TimelineConfig {
    return this._config;
  }

  get descriptionPaneVisible(): boolean {
    return this._descriptionPaneVisible;
  }

  toggleTimecodeEdit() {
    if (this._player.isMainMediaLoaded) {
      if (this._timecodeEdit) {
        this.refreshTimecode();
      } else {
        this.openTimecodeEdit();
      }
    }
  }

  private openTimecodeEdit() {
    this._player.pause().subscribe(() => {
      this._timecodeEdit = document.createElement('omakase-timecode-edit') as OmakaseTimecodeEdit;

      this._timecodeEdit.player = this._player;
      this._timecodeEdit.value = this._player.convertTime(this._player.getCurrentTime(), MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
      this._timecodeEdit.blurHandler = () => {
        this.refreshTimecode();
      };
      this._timecodeEdit.submitHandler = (timecodeText: string) => {
        this._player.seekTo(timecodeText, MediaTemporalFormat.TIMECODE).subscribe(() => {
          this.refreshTimecode();
        });
      };

      this._timecodeElement.innerHTML = '';
      this._timecodeElement.appendChild(this._timecodeEdit);

      this._timecodeEdit.value = this._player.getCurrentTime(MediaTemporalFormat.TIMECODE);
    });
  }

  private refreshTimecode() {
    if (this._timecodeEdit) {
      try {
        this._timecodeEdit?.remove();
      } catch (e) {
        // nop
      }
      this._timecodeEdit = void 0;
    }
    try {
      let text = this._player.isMainMediaLoaded ? this._player.getCurrentTime(MediaTemporalFormat.TIMECODE) : '';
      this._timecodeElement.innerHTML = `<span style="pointer-events:none">${text}</span>`;
    } catch (e) {
      // if player is in unstable mode
    }
  }

  protected _trackRepository: TrackRepository;
  protected _thumbnailTrack?: ThumbnailTrack | undefined;
  protected _thumbnailHoverWrapper!: ThumbnailHoverWrapper;
  protected _thumbnailTrackBreaker = new ObserverBreaker();

  setThumbnailTrack(track: ThumbnailTrack) {
    this._thumbnailTrack = track;
    this._thumbnailTrackBreaker.break();

    this._trackRepository
      .onTrackDeleted$(this._thumbnailTrack.id)
      .pipe(takeUntil(this._thumbnailTrackBreaker.observer))
      .subscribe((event) => {
        this._thumbnailTrackBreaker.break();
        this._thumbnailTrack = void 0;
      });
  }

  private showThumbnailHover(thumbnail: Thumbnail) {
    let resolveThumbnailHoverPosition = () => {
      let pointerPosition = this._timecodedFloatingGroup.getRelativePointerPosition();
      let imageSize = this._thumbnailHoverWrapper.thumbnailImg.image?.getSize();

      if (pointerPosition && imageSize) {
        let timecodedGroupDimension = this.getTimecodedFloatingDimension();

        let strokeWidth = this._thumbnailHoverWrapper.thumbnailImg.style.strokeWidth;

        let x = pointerPosition.x - imageSize.width / 2; // center thumbnail
        let halfStroke = strokeWidth > 0 ? strokeWidth / 2 : 0;
        let xWithStroke = x - halfStroke;
        x = xWithStroke < 0 ? halfStroke : x + imageSize.width + halfStroke > timecodedGroupDimension.width ? timecodedGroupDimension.width - imageSize.width - halfStroke : x;

        let timecodedRect = this._scrubberLane.getTimecodedRect();
        return {
          x: x,
          y: timecodedRect.y + timecodedRect.height + strokeWidth / 2 + this.style.thumbnailHoverYOffset,
        };
      } else {
        return {
          x: 0,
          y: 0,
        };
      }
    };

    if (this._thumbnailHoverWrapper.thumbnail && (this._thumbnailHoverWrapper.thumbnail?.id === thumbnail.id)) {
      let position = resolveThumbnailHoverPosition();
      if (position) {
        this._thumbnailHoverWrapper.setPosition(position);
      }
    } else {
      this.hideThumbnailHover();
      let targetWidth = this.style.thumbnailHoverWidth;
      this._thumbnailHoverWrapper.thumbnail = thumbnail;
      this._thumbnailHoverWrapper.thumbnailImg?.loadImage(ImageUtil.createKonvaImageSizedByWidth(thumbnail.url, targetWidth, AuthConfig.authentication)).subscribe((event) => {
        let position = resolveThumbnailHoverPosition();
        if (position) {
          this._thumbnailHoverWrapper.setPosition(position);
        }
      });
    }
  }

  private hideThumbnailHover() {
    if (this._thumbnailHoverWrapper.thumbnailImg?.style.visible) {
      this._thumbnailHoverWrapper.thumbnailImg.setVisible(false);
    }
  }

  private getElementOrFail<T>(className: string): T {
    let all = Array.from(this._rootElement.querySelectorAll(`.${className}`)) as T[];
    return all[0]!;
  }

  get onEvent$(): Observable<TimelineEvent> {
    return this._onEvent$.asObservable();
  }

  get id(): string {
    return this._id;
  }

  get timecodedFloatingGroup(): Konva.Group {
    return this._timecodedFloatingGroup;
  }

  get ready(): boolean {
    return this._ready;
  }

  get style(): TimelineStyle {
    return this._style;
  }

  get state(): TimelineState {
    return {};
  }

  destroy(): void {
    this._destroyBreaker.destroy();
    this._dragBreaker.destroy();
    this._mediaBreaker.destroy();

    this._playhead.destroy();
    this._scrubber.destroy();
    this._thumbnailHoverWrapper.destroy();

    this._timelineLanes.forEach((lane) => lane.destroy());
    this._timelineLanes = [];
    this._timelineLanesMap.clear();

    this._layoutFlexGroup.destroy();
    this._konvaStage.destroy();

    if (this._timecodeEdit) {
      this._timecodeEdit.remove();
      this._timecodeEdit = void 0;
    }

    this._rootElement.innerHTML = '';

    freeObserver(this._onEvent$);
  }
}
