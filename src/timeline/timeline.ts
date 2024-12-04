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

import Konva from 'konva';
import Decimal from 'decimal.js';
import {ScrollableHorizontally, Scrollbar} from './scrollbar/scrollbar';
import {Dimension, Horizontals, Position, RectMeasurement} from '../common';
import {animate} from '../util/animation-util';
import {BehaviorSubject, debounceTime, filter, fromEvent, map, merge, Observable, sampleTime, Subject, take, takeUntil} from 'rxjs';
import {Destroyable, PlayheadMoveEvent, ScrubberMoveEvent, ThumbnailVttCue, TimecodeClickEvent, TimecodeMouseMoveEvent, TimelineReadyEvent, TimelineScrollEvent, TimelineZoomEvent, VideoLoadedEvent} from '../types';
import {Playhead} from './playhead';
import {Thumbnail} from './thumbnail/thumbnail';
import {ImageUtil} from '../util/image-util';
import {WindowUtil} from '../util/window-util';
import {ScrubberLane} from './scrubber';
import {TimelineApi, TimelineLaneApi} from '../api';
import {z} from 'zod';
import {AxiosRequestConfig} from 'axios';
import {completeUnsubscribeSubjects, nextCompleteObserver, nextCompleteSubject, passiveObservable, simplePassiveObservable} from '../util/rxjs-util';
import {PlaybackState, VideoControllerApi} from '../video';
import {destroyer, nullifier} from '../util/destroy-util';
import {KonvaFlexGroup} from '../layout/konva-flex';
import {StyleAdapter} from '../common/style-adapter';
import {FlexNode, FlexSpacingBuilder} from '../layout/flex-node';
import {MeasurementUtil} from '../util/measurement-util';
import {KonvaFactory} from '../factory/konva-factory';
import {TimelineScrollbar} from './scrollbar';
import {ThumbnailVttFile} from '../vtt';
import {TimelineDomController} from './timeline-dom-controller';
import {konvaUnlistener} from '../util/konva-util';
import {Scrubber} from './scrubber/scrubber';
import {VttAdapter} from '../common/vtt-adapter';
import {ConfigWithOptionalStyle} from '../layout';
import {BaseTimelineLane} from './timeline-lane';

type ZoomDirection = 'zoom_in' | 'zoom_out';

const MAIN_LAYER_CONTENT_GROUPS: number = 9;
const SURFACE_LAYER_CONTENT_GROUPS: number = 1;

const sampleTimeSyncVideoMetadata: number = 100;

export interface TimelineStyle {
  textFontFamily: string;
  textFontStyle: string;

  stageMinWidth: number;
  stageMinHeight: number;

  backgroundFill: string;
  backgroundOpacity: number;

  headerHeight: number;
  headerMarginBottom: number;
  headerBackgroundFill: string;
  headerBackgroundOpacity: number;

  footerHeight: number;
  footerMarginTop: number;
  footerBackgroundFill: string;
  footerBackgroundOpacity: number;

  scrollbarHeight: number;
  scrollbarWidth: number;
  scrollbarBackgroundFill: string;
  scrollbarBackgroundFillOpacity: number;
  scrollbarHandleBarFill: string;
  scrollbarHandleBarOpacity: number;
  scrollbarHandleOpacity: number;

  thumbnailHoverWidth: number;
  thumbnailHoverStroke: string;
  thumbnailHoverStrokeWidth: number;
  thumbnailHoverYOffset: number;

  leftPaneWidth: number;
  rightPaneMarginLeft: number;
  rightPaneMarginRight: number;
  rightPaneClipPadding: number;

  // playhead
  playheadVisible: boolean;
  playheadFill: string;
  playheadLineWidth: number;
  playheadSymbolHeight: number;
  playheadScrubberHeight: number;
  playheadBackgroundFill: string;
  playheadBackgroundOpacity: number;
  playheadTextFill: string;
  playheadTextYOffset: number;
  playheadTextFontSize: number;

  playheadPlayProgressFill: string;
  playheadPlayProgressOpacity: number;

  playheadBufferedFill: string;
  playheadBufferedOpacity: number;

  // playhead hover
  scrubberVisible: boolean;
  scrubberFill: string;
  scrubberSnappedFill: string;

  scrubberNorthLineWidth: number;
  scrubberNorthLineOpacity: number;
  scrubberSouthLineWidth: number;
  scrubberSouthLineOpacity: number;

  scrubberSymbolHeight: number;
  scrubberTextFill: string;
  scrubberTextYOffset: number;
  scrubberTextFontSize: number;

  scrubberMarginBottom: number;
}

export interface TimelineConfig {
  timelineHTMLElementId: string;

  thumbnailVttUrl?: string;
  thumbnailVttFile?: ThumbnailVttFile;
  axiosConfig?: AxiosRequestConfig;

  scrubberSnapArea: number;
  playheadDragScrollMaxSpeedAfterPx: number;

  zoomWheelEnabled: boolean;

  zoomScale: number;
  zoomScaleWheel: number;

  zoomBaseline: number;
  zoomMax: number;

  layoutEasingDuration: number;
  zoomEasingDuration: number;
  scrollEasingDuration: number;

  scrubberClickSeek: boolean;

  style: TimelineStyle;
}

const configDefault: TimelineConfig = {
  timelineHTMLElementId: 'omakase-timeline',

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

  style: {
    stageMinWidth: 700,
    stageMinHeight: 500,

    textFontFamily: 'Arial',
    textFontStyle: 'normal',

    backgroundFill: '#f5f5f5',
    backgroundOpacity: 1,

    headerHeight: 0,
    headerMarginBottom: 10,
    // headerMarginBottom: 0,
    headerBackgroundFill: '#f5f5f5',
    headerBackgroundOpacity: 1,

    footerHeight: 50,
    footerMarginTop: 10,
    // footerMarginTop: 0,
    footerBackgroundFill: '#f5f5f5',
    footerBackgroundOpacity: 1,

    scrollbarHeight: 15,
    scrollbarWidth: 500,
    scrollbarBackgroundFill: '#000000',
    scrollbarBackgroundFillOpacity: 0.3,
    scrollbarHandleBarFill: '#01a6f0',
    scrollbarHandleBarOpacity: 1,
    scrollbarHandleOpacity: 1,

    thumbnailHoverWidth: 200,
    thumbnailHoverStroke: 'rgba(255,73,145,0.9)',
    thumbnailHoverStrokeWidth: 5,
    thumbnailHoverYOffset: 0,

    leftPaneWidth: 200,
    rightPaneMarginLeft: 30,
    rightPaneMarginRight: 30,
    rightPaneClipPadding: 20,

    // playhead
    playheadVisible: true,
    playheadFill: '#f43530',
    scrubberSnappedFill: '#ffd500',
    playheadLineWidth: 2,
    playheadSymbolHeight: 15,
    playheadScrubberHeight: 15,
    playheadTextFill: '#ffffff',
    playheadTextYOffset: 0,
    playheadTextFontSize: 12,

    playheadBackgroundFill: '#ffffff',
    playheadBackgroundOpacity: 0,

    playheadPlayProgressFill: '#008cbc',
    playheadPlayProgressOpacity: 0.5,

    playheadBufferedFill: '#a2a2a2',
    playheadBufferedOpacity: 1,

    // scrubber
    scrubberVisible: false,
    scrubberFill: '#737373',

    scrubberNorthLineWidth: 2,
    scrubberNorthLineOpacity: 1,
    scrubberSouthLineWidth: 2,
    scrubberSouthLineOpacity: 1,

    scrubberSymbolHeight: 15,
    scrubberTextFill: '#ffffff',
    scrubberTextYOffset: 0,
    scrubberTextFontSize: 12,

    scrubberMarginBottom: 15,
  },
};

interface DragConditions {
  positionBeforeDrag: Position | undefined;
  playbackState: PlaybackState | undefined;
  isPlayheadDrag: boolean;
}

export class Timeline implements Destroyable, ScrollableHorizontally, TimelineApi {
  public readonly onReady$: BehaviorSubject<TimelineReadyEvent | undefined> = new BehaviorSubject<TimelineReadyEvent | undefined>(void 0);
  public readonly onScroll$: Subject<TimelineScrollEvent> = new Subject<TimelineScrollEvent>();
  public readonly onZoom$: Subject<TimelineZoomEvent> = new Subject<TimelineZoomEvent>();
  public readonly onStyleChange$: Subject<TimelineStyle> = new Subject<TimelineStyle>();

  public readonly onTimecodeClick$: Subject<TimecodeClickEvent> = new Subject<TimecodeClickEvent>();
  public readonly onTimecodeMouseMove$: Subject<TimecodeMouseMoveEvent> = new Subject<TimecodeMouseMoveEvent>();

  public readonly onScrubberMove$: Subject<ScrubberMoveEvent> = new Subject<ScrubberMoveEvent>();
  public readonly onPlayheadMove$: Subject<PlayheadMoveEvent> = new Subject<PlayheadMoveEvent>();

  protected _dragBreaker$ = new Subject<void>();
  protected _dragConditions?: DragConditions;

  private _config: TimelineConfig;
  private _styleAdapter: StyleAdapter<TimelineStyle>;
  private readonly _vttAdapter: VttAdapter<ThumbnailVttFile> = new VttAdapter(ThumbnailVttFile);

  // region config
  private _videoController: VideoControllerApi;
  private _timelineDomController: TimelineDomController;
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

  // bgs
  private _layoutBg!: Konva.Rect;
  private _headerBg!: Konva.Rect;
  private _footerBg!: Konva.Rect;

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
  private _thumbnailHover!: Thumbnail;
  // endregion

  private _scrollWithPlayhead = true;
  private _syncTimelineWithPlayheadInProgress = false;

  private _descriptionPaneVisible = true;

  private _videoEventBreaker$ = new Subject<void>();
  private readonly _destroyed$ = new Subject<void>();

  constructor(config: Partial<ConfigWithOptionalStyle<TimelineConfig>>, videoController: VideoControllerApi) {
    this._config = {
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    };

    this._videoController = videoController;

    if (!this._videoController) {
      throw new Error(`Video conttroller API invalid`);
    }

    this._timelineDomController = new TimelineDomController(this, this._videoController);
    this._styleAdapter = new StyleAdapter(this._config.style);

    this._vttAdapter.initFromConfig({
      vttUrl: this._config.thumbnailVttUrl,
      vttFile: this._config.thumbnailVttFile,
    });

    this.init();
  }

  protected init() {
    let stageDimensions = this.resolveStageDimension();

    this._konvaStage = KonvaFactory.createStage({
      container: this._timelineDomController.divTimelineCanvas,
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
      margins: FlexSpacingBuilder.instance().spacing(this.style.headerMarginBottom, 'EDGE_BOTTOM').build(),
      paddings: FlexSpacingBuilder.instance().spacing(20, 'EDGE_START').spacing(20, 'EDGE_END').build(),
    });

    this._footerFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._footerBg,
      justifyContent: 'JUSTIFY_FLEX_END',
      alignItems: 'ALIGN_CENTER',
      width: 'auto',
      height: this.style.footerHeight,
      margins: FlexSpacingBuilder.instance().spacing(this.style.footerMarginTop, 'EDGE_TOP').build(),
      paddings: FlexSpacingBuilder.instance().spacing(20, 'EDGE_START').spacing(20, 'EDGE_END').build(),
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
      this._videoController
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

    this._thumbnailHover = new Thumbnail({
      style: {
        visible: false,
        stroke: this.style.thumbnailHoverStroke,
        strokeWidth: this.style.thumbnailHoverStrokeWidth,
      },
    });

    for (const component of [this._playhead, this._scrubber, this._thumbnailHover]) {
      this.addToSurfaceLayerTimecodedFloatingContent(component.konvaNode);
    }

    this._timecodedWrapperFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      // konvaBgNode: KonvaFactory.createRect({
      //   fill: 'yellow',
      //   opacity: 0,
      // }),
      positionType: 'POSITION_TYPE_ABSOLUTE',
      width: '100%',
      height: '100%',
      paddings: FlexSpacingBuilder.instance().spacing(this.style.rightPaneMarginLeft, 'EDGE_START').spacing(this.style.rightPaneMarginRight, 'EDGE_END').build(),
    });

    this._timecodedContainerFlexGroup = KonvaFlexGroup.of({
      konvaNode: this._timecodedContainer,
      // konvaBgNode: KonvaFactory.createRect({
      //   fill: 'teal',
      //   opacity: 0,
      // }),
      flexGrow: 1,
      height: '100%',
    });

    this._timecodedContainerStaticFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      // konvaBgNode: KonvaFactory.createRect({
      //   fill: 'teal',
      //   opacity: 0,
      // }),
      flexGrow: 1,
      height: '100%',
    });

    this._timelineLaneStaticFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      // konvaBgNode: KonvaFactory.createRect({
      //   fill: 'yellow',
      //   opacity: 0,
      // }),
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

    this._footerFlexGroup.addChild(
      new TimelineScrollbar(
        {
          height: this.style.scrollbarHeight,
          width: 500,
        },
        new Scrollbar({
          style: {
            height: this.style.scrollbarHeight,
            backgroundFill: this.style.scrollbarBackgroundFill,
            backgroundFillOpacity: this.style.scrollbarBackgroundFillOpacity,
            handleBarFill: this.style.scrollbarHandleBarFill,
            handleBarOpacity: this.style.scrollbarHandleBarOpacity,
            handleOpacity: this.style.scrollbarHandleOpacity,
          },
        }),
        this
      )
    );

    // adding flex groups to layer
    this._mainLayer.add(...[this._layoutFlexGroup.contentNode.konvaNode]);

    this._scrubberLane = new ScrubberLane({
      style: {
        marginBottom: this.style.scrubberMarginBottom,
      },
    });

    this.addTimelineLane(this._scrubberLane);

    this._videoController!.onVideoLoading$.pipe(
      filter((p) => !(p.isAttaching || p.isDetaching)),
      takeUntil(this._destroyed$)
    ).subscribe({
      next: (event) => {
        this.clearContent();
      },
    });

    this._videoController.onVideoLoaded$
      .pipe(
        filter((p) => !!p),
        takeUntil(this._destroyed$)
      )
      .subscribe({
        next: (event) => {
          this.onVideoLoadedEvent(event!);
        },
      });

    fromEvent(window, 'resize')
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.onWindowResize(event);
        },
      });

    this._timecodedContainer.on('mousemove', (event) => {
      if (!this._videoController.isVideoLoaded()) {
        return;
      }

      this.onTimecodeMouseMove$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
        timecode: this.timelinePositionToTimecode(this._timecodedContainer.getRelativePointerPosition().x),
      });
    });

    let hideScrubber = () => {
      this._scrubber.style = {
        visible: false,
      };
    };

    this._konvaStage.on('mouseleave', (event) => {
      hideScrubber();
    });

    this._timecodedContainer.on('mouseleave', (event) => {
      hideScrubber();
    });

    this._scrubber.onMove$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        this.onScrubberMove$.next(event);
      },
    });

    this._playhead.onMove$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        this.onPlayheadMove$.next(event);
      },
    });

    let isPointerOnScrubberLane: () => boolean = () => {
      let pointerPosition = this._timecodedContainer.getRelativePointerPosition();
      let scrubberRect = this._scrubberLane.getTimecodedRect();
      return MeasurementUtil.isPositionInRect(pointerPosition, scrubberRect);
    };

    if (this._config.zoomWheelEnabled) {
      this._timecodedContainer.on('wheel', (konvaEvent) => {
        if (!this._videoController.isVideoLoaded()) {
          return;
        }

        if (isPointerOnScrubberLane()) {
          let wheelEvent = konvaEvent.evt;
          wheelEvent.preventDefault();

          let direction: ZoomDirection = wheelEvent.deltaY > 0 ? 'zoom_in' : 'zoom_out';
          if (wheelEvent.ctrlKey) {
            direction = direction === 'zoom_in' ? 'zoom_out' : 'zoom_in';
          }

          this.zoomByStep(direction, this._config.zoomScaleWheel, this._timecodedContainer.getRelativePointerPosition().x);

          this.refreshScrollWithPlayhead();
        }
      });
    }

    this._timecodedFloatingGroup.on('dragstart', (event) => {
      let startDrag = () => {
        this._dragBreaker$ = new Subject();
        this.onScroll$.pipe(takeUntil(this._dragBreaker$)).subscribe((event) => {
          this._dragConditions!.positionBeforeDrag = this._timecodedFloatingGroup.getPosition();
        });
      };

      let stopDrag = () => {
        event.target.stopDrag();
      };

      if (!this._videoController.isVideoLoaded()) {
        stopDrag();
        return;
      }

      this._dragConditions = {
        positionBeforeDrag: this._timecodedFloatingGroup.getPosition(),
        isPlayheadDrag: isPointerOnScrubberLane(),
        playbackState: this._videoController.getPlaybackState(),
      };

      if (this._videoController.isVideoLoaded()) {
        if (this._dragConditions.isPlayheadDrag) {
          startDrag();
          if (this._dragConditions.playbackState?.playing) {
            this._videoController.onPause$.pipe(take(1), takeUntil(this._dragBreaker$)).subscribe(() => {
              this._playhead.dragStart();
              this._playhead.dragMove(this._timecodedFloatingGroup.getRelativePointerPosition().x);
            });
            this._videoController.pause();
          } else {
            this._playhead.dragStart();
          }
        } else {
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
        this._timecodedFloatingGroup.setAttrs({
          x: this.constrainTimecodedFloatingPosition(newPosition.x),
          y: 0, // ensures that dragging is only on x-axis
        });
        this.layersSync();
        this.onScroll$.next(this.createScrollEvent());
      };

      let preventDragMove = () => {
        this._timecodedFloatingGroup.setPosition(this._dragConditions!.positionBeforeDrag!);
      };

      if (this._dragConditions!.isPlayheadDrag) {
        preventDragMove();
        this._playhead.dragMove(this._timecodedFloatingGroup.getRelativePointerPosition().x);
        this._dragConditions!.positionBeforeDrag = this._timecodedFloatingGroup.getPosition();
      } else {
        // drag timeline
        doDragMove();
      }
    });

    this._timecodedFloatingGroup.on('dragend', (event) => {
      if (!this._videoController.isVideoLoaded()) {
        return;
      }

      if (this._dragConditions!.isPlayheadDrag) {
        this._playhead.dragEnd();
        let time = this.timelinePositionToTime(this._playhead.getPlayheadPosition());
        this._videoController.seekToTime(time).subscribe((event) => {
          if (event && this._dragConditions?.playbackState?.playing) {
            this._videoController.play();
          }
        });
      } else {
        // drag timeline
        WindowUtil.cursor('default');
        this.scrubberMove();
        this.refreshScrollWithPlayhead();
      }
      nextCompleteSubject(this._dragBreaker$);
    });

    this._scrubberLane.onMouseMove$
      .pipe(debounceTime(20))
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          if (!this._videoController.isVideoLoaded()) {
            return;
          }

          if (this._vttAdapter.vttFile) {
            let x = this._timecodedFloatingGroup.getRelativePointerPosition().x;
            let time = this.timelinePositionToTime(x);
            let thumbnailVttCue = this._vttAdapter.vttFile.findCue(time);
            if (thumbnailVttCue) {
              this.showThumbnailHover(thumbnailVttCue);
            }
          }
        },
      });

    this._scrubberLane.onMouseLeave$
      .pipe(debounceTime(50))
      .pipe(takeUntil(this._destroyed$))
      .subscribe((event) => {
        this.hideThumbnailHover();
      });

    this._timecodedContainer.on('click', (event) => {
      if (!this._videoController.isVideoLoaded()) {
        return;
      }

      this.onTimecodeClick$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
        timecode: this.timelinePositionToTimecode(this._timecodedFloatingGroup.getRelativePointerPosition().x),
      });
    });

    this._surfaceLayer_timecodedContainer.on('click', (event) => {
      if (!this._videoController.isVideoLoaded()) {
        return;
      }

      this.onTimecodeClick$.next({
        mouseEvent: event.evt,
        cancelableEvent: event,
        timecode: this.timelinePositionToTimecode(this._timecodedFloatingGroup.getRelativePointerPosition().x),
      });
    });

    this._playhead.onStateChange$.pipe(takeUntil(this._destroyed$)).subscribe((state) => {
      if (state.dragging) {
        this._scrubber.style = {
          visible: false,
        };
      }
    });

    if (this._config.scrubberClickSeek) {
      this.onTimecodeClick$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        if (isPointerOnScrubberLane()) {
          this.handleTimecodeClick(event.timecode);
        }
      });
    }

    if (this._config.thumbnailVttUrl) {
      this.loadThumbnailVttFileFromUrl(this._config.thumbnailVttUrl).subscribe();
    } else if (this._config.thumbnailVttFile) {
      this.loadThumbnailVttFile(this._config.thumbnailVttFile);
    }

    this.settleLayout();

    this.onReady$.next({});
  }

  private handleTimecodeClick(timecode: string) {
    if (!this._videoController.isVideoLoaded()) {
      return;
    }

    // here we seek to timecode because we don't want frames drift in case of drop frames
    this._videoController.seekToTimecode(timecode).subscribe();
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

    this._timelineDomController.settleDom();
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

  private onWindowResize(event: Event) {
    this.settleLayout();
  }

  private resolveStageDimension(): Dimension {
    let htmlElement = this._timelineDomController.divTimeline;

    let divElementRect: RectMeasurement = {
      x: htmlElement.offsetLeft,
      y: htmlElement.offsetTop,
      width: htmlElement.offsetWidth,
      height: htmlElement.offsetHeight,
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

  private showThumbnailHover(thumbnailVttCue: ThumbnailVttCue) {
    this._thumbnailHover.setVisible(true);
    if (this._thumbnailHover.cue === thumbnailVttCue) {
      this._thumbnailHover.cue = thumbnailVttCue;
      let position = this.resolveThumbnailPosition(this._thumbnailHover);
      this._thumbnailHover.setPosition(position);
      this._thumbnailHover.konvaNode.moveToTop();
    } else {
      ImageUtil.createKonvaImageSizedByWidth(thumbnailVttCue.url, this.style.thumbnailHoverWidth)
        .pipe(takeUntil(this._destroyed$))
        .subscribe({
          next: (image) => {
            this._thumbnailHover.cue = thumbnailVttCue;
            this._thumbnailHover.setDimension(image.getSize());
            this._thumbnailHover.setImage(image);
            this._thumbnailHover.setPosition(this.resolveThumbnailPosition(this._thumbnailHover));
            this._thumbnailHover.konvaNode.moveToTop();
          },
          error: (err) => {
            console.error(err);
          },
        });
    }
  }

  private hideThumbnailHover() {
    if (this._thumbnailHover) {
      this._thumbnailHover.setVisible(false);
    }
  }

  private resolveThumbnailPosition(thumbnail: Thumbnail): Position {
    let pointerPosition = this._timecodedFloatingGroup.getRelativePointerPosition();
    let timecodedGroupDimension = this.getTimecodedFloatingDimension();
    let imageSize = thumbnail.image!.getSize();
    let x = pointerPosition.x - imageSize.width / 2; // center thumbnail
    let halfStroke = thumbnail.style.strokeWidth > 0 ? thumbnail.style.strokeWidth / 2 : 0;
    let xWithStroke = x - halfStroke;
    x = xWithStroke < 0 ? halfStroke : x + imageSize.width + halfStroke > timecodedGroupDimension.width ? timecodedGroupDimension.width - imageSize.width - halfStroke : x;

    let timecodedRect = this._scrubberLane.getTimecodedRect();

    return {
      x: x,
      y: timecodedRect.y + timecodedRect.height + thumbnail.style.strokeWidth / 2 + this.style.thumbnailHoverYOffset,
    };
  }

  private createScrollEvent(): TimelineScrollEvent {
    return {
      scrollPercent: this.getHorizontalScrollPercent(),
    };
  }

  private createZoomEvent(): TimelineZoomEvent {
    return {
      zoomPercent: this.getZoomPercent(),
    };
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
      this.onScroll$.next(this.createScrollEvent());
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
      return simplePassiveObservable<number>(this.getZoomPercent());
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
      this.onZoom$.next(this.createZoomEvent());
      this.onScroll$.next(this.createScrollEvent());
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
    if (this._videoController.isVideoLoaded() && this.isPlayheadInTimecodedView()) {
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
    if (this._videoController.isVideoLoaded() && this._scrubber) {
      let isSnapped = false;
      let pointerPosition = this.getTimecodedFloatingRelativePointerPosition();

      if (pointerPosition) {
        let x = pointerPosition.x;
        if (!this._videoController.isPlaying()) {
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

  private onVideoLoadedEvent(event: VideoLoadedEvent) {
    this.fireVideoEventBreaker();

    this.syncVideoMetadata();

    this._videoController.onVideoTimeChange$
      .pipe(sampleTime(sampleTimeSyncVideoMetadata))
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: (event) => {
          this.syncVideoMetadata();
        },
      });

    this._videoController.onSeeking$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        this.refreshScrollWithPlayhead();
      },
    });

    this._videoController.onSeeked$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        this.scrubberMove();
      },
    });

    this._videoController.onPlay$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        this.refreshScrollWithPlayhead();
      },
    });

    this.onTimecodeMouseMove$.pipe(takeUntil(this._videoEventBreaker$)).subscribe({
      next: (event) => {
        if (!this._scrubber.style.visible) {
          this._scrubber.style = {
            visible: true,
          };
        }

        this.scrubberMove();
      },
    });

    merge(this.onZoom$, this.onScroll$)
      .pipe(takeUntil(this._videoEventBreaker$))
      .subscribe({
        next: (event) => {
          this.scrubberMove();
        },
      });
  }

  private fireVideoEventBreaker() {
    nextCompleteSubject(this._videoEventBreaker$);
    this._videoEventBreaker$ = new Subject<void>();
  }

  private syncVideoMetadata() {
    // follows playhead and scrolls playhead to left if playhead moves out of view
    if (this._scrollWithPlayhead && !this.isPlayheadInTimecodedView() && !this._syncTimelineWithPlayheadInProgress) {
      this._syncTimelineWithPlayheadInProgress = true;
      this.syncTimelineWithPlayhead().subscribe((result) => {
        this._syncTimelineWithPlayheadInProgress = false;
      });
    }
  }

  // endregion

  // region API
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

    timelineLane.prepareForTimeline(this, this._videoController);

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
    return [...this._timelineLanesMap.values()];
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
    // TODO constrain to video duration (and corrected duration) as well
    return x < 0 ? 0 : x > dimension.width ? dimension.width : x;
  }

  timelinePositionToTime(xOnTimeline: number): number {
    return this.convertPositionOnTimelineToTime(xOnTimeline, this.getTimecodedFloatingDimension().width);
  }

  timelineContainerPositionToTime(xOnTimeline: number): number {
    return this.timelinePositionToTime(Math.abs(this.getTimecodedFloatingHorizontals().x) + xOnTimeline);
  }

  timelinePositionToTimecode(x: number): string {
    return this._videoController.formatToTimecode(this.timelinePositionToTime(x));
  }

  timelinePositionToFrame(x: number): number {
    return this._videoController.isVideoLoaded() ? this._videoController.calculateTimeToFrame(this.timelinePositionToTime(x)) : 0;
  }

  timeToTimelinePosition(time: number): number {
    return this.convertTimeToTimelinePosition(time, this.getTimecodedFloatingDimension().width);
  }

  private convertTimeToTimelinePosition(time: number, timecodedWidth: number): number {
    return new Decimal(time).mul(timecodedWidth).div(this._videoController.getDuration()).toNumber();
  }

  private convertPositionOnTimelineToTime(xOnTimeline: number, timecodedWidth: number): number {
    let constrainedX = this.constrainTimelinePosition(xOnTimeline);
    return this._videoController.isVideoLoaded() ? new Decimal(constrainedX).mul(this._videoController.getDuration()).div(timecodedWidth).toNumber() : 0;
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
    return this._konvaStage.getPointersPositions().length > 0 ? this._timecodedFloatingGroup.getRelativePointerPosition() : void 0;
  }

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

  loadThumbnailVttFile(vttFile: ThumbnailVttFile) {
    this._vttAdapter.vttFile = vttFile;
  }

  loadThumbnailVttFileFromUrl(vttUrl: string): Observable<ThumbnailVttFile | undefined> {
    return passiveObservable<ThumbnailVttFile | undefined>((observer) => {
      this._vttAdapter
        .loadVtt(vttUrl, {
          axiosConfig: this._config.axiosConfig,
        })
        .subscribe({
          next: (value) => {
            nextCompleteObserver(observer, value);
          },
        });
    });
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
        timelineLane1.minimizeInternal(refreshLayout);
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
        timelineLane1.maximizeInternal(refreshLayout);
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

  get thumbnailVttFile(): ThumbnailVttFile | undefined {
    return this._vttAdapter.vttFile;
  }

  get style(): TimelineStyle {
    return this._styleAdapter.style;
  }

  set style(value: Partial<TimelineStyle>) {
    this._styleAdapter.style = value;
    this.onStyleChange$.next(this.style);
  }

  private clearContent() {
    this._vttAdapter.vttUrl = void 0;
    this._vttAdapter.vttFile = void 0;
    this.zoomByPercent(this._config.zoomBaseline, this.resolveTimelineContainerZoomFocusPosition());
  }

  get config(): TimelineConfig {
    return this._config;
  }

  get descriptionPaneVisible(): boolean {
    return this._descriptionPaneVisible;
  }

  destroy(): void {
    nextCompleteSubject(this._destroyed$);
    nextCompleteSubject(this._videoEventBreaker$);

    completeUnsubscribeSubjects(this.onScroll$, this.onZoom$, this.onStyleChange$);

    konvaUnlistener(this._timecodedContainer, this._timecodedFloatingGroup, this._surfaceLayer_timecodedContainer, this._surfaceLayer_timecodedFloatingGroup);

    this.getTimelineLanes().forEach((p) => p.destroy());

    destroyer(this._layoutFlexGroup, this._scrubber, this._playhead, ...this._timelineLanes, this._thumbnailHover, this._vttAdapter);
    destroyer(this._timelineDomController);

    nullifier(this._config, this._styleAdapter);
  }
}
