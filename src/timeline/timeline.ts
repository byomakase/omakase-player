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

import {ConfigWithOptionalStyle} from '../common';
import Konva from 'konva';
import Decimal from 'decimal.js';
import {ScrollableHorizontally, Scrollbar} from './scrollbar/scrollbar';
import {Dimension, Horizontals, Position, RectMeasurement} from '../common/measurement';
import {PlayheadHover} from './playhead-hover';
import {animate} from '../util/animation-util';
import {catchError, filter, fromEvent, map, Observable, of, Subject, takeUntil} from 'rxjs';
import {Destroyable, ThumbnailVttCue, TimelineScrollEvent, TimelineZoomEvent, VideoLoadedEvent, VideoLoadingEvent} from '../types';
import {Playhead} from './playhead';
import {ThumbnailVttFile} from '../track';
import {Thumbnail} from './thumbnail/thumbnail';
import {ImageUtil} from '../util/image-util';
import {WindowUtil} from '../util/window-util';
import {ScrubberLane} from './scrubber';
import {TimecodeDisplay} from './timecode-display';
import {TimelineApi, TimelineLaneApi} from '../api';
import {undefined, z} from 'zod';
import {AxiosRequestConfig} from 'axios';
import {completeUnsubscribeSubjects, nextCompleteVoidSubject, nextCompleteVoidSubjects} from '../util/observable-util';
import {VideoControllerApi} from '../video/video-controller-api';
import {destroyer, nullifier} from '../util/destroy-util';
import {KonvaFlexGroup, KonvaFlexItem} from '../layout/konva-flex';
import {StyleAdapter} from '../common/style-adapter';
import {FlexNode, FlexSpacingBuilder} from '../layout/flex-node';
import {MesurmentUtil} from '../util/mesurment-util';
import {KonvaFactory} from '../factory/konva-factory';
import {TimelineScrollbar} from './scrollbar';

type ZoomDirection = 'zoom_in' | 'zoom_out';

const MAIN_LAYER_CONTENT_GROUPS: number = 9;
const SURFACE_LAYER_CONTENT_GROUPS: number = 1;

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

  headerTimecodeDisplayTextFontSize: number,
  headerTimecodeDisplayTextFill: string,

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

  playheadPlayProgressFill: string;
  playheadPlayProgressOpacity: number;

  playheadBufferedFill: string;
  playheadBufferedOpacity: number;

  // playhead hover
  playheadHoverVisible: boolean;
  playheadHoverFill: string;
  playheadHoverSnappedFill: string;
  playheadHoverLineWidth: number;
  playheadHoverSymbolHeight: number
  playheadHoverTextFill: string
  playheadHoverTextYOffset: number;
  playheadHoverTextFontSize: number;

  scrubberMarginBottom: number,
}

export interface TimelineConfig {
  timelineHTMLElementId: string;
  style: TimelineStyle;

  thumbnailVttUrl?: string;
  thumbnailVttFile?: ThumbnailVttFile;
  axiosConfig?: AxiosRequestConfig;

  playheadHoverSnapArea: number;

  zoomWheelEnabled: boolean;

  zoomScale: number;
  zoomScaleWheel: number;

  zoomBaseline: number;
  zoomMax: number;

  layoutEasingDuration: number;
  zoomEasingDuration: number;
  scrollEasingDuration: number;
}

const configDefault: TimelineConfig = {
  timelineHTMLElementId: 'omakase-timeline',
  playheadHoverSnapArea: 5,

  zoomWheelEnabled: true,

  zoomScale: 1.70,
  zoomScaleWheel: 1.05,

  zoomBaseline: 100,
  zoomMax: 2000,

  layoutEasingDuration: 500,
  zoomEasingDuration: 800,
  scrollEasingDuration: 200,

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

    headerTimecodeDisplayTextFontSize: 20,
    headerTimecodeDisplayTextFill: '#9291D2',

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
    playheadHoverSnappedFill: '#ffd500',
    playheadLineWidth: 2,
    playheadSymbolHeight: 15,
    playheadScrubberHeight: 15,

    playheadBackgroundFill: '#ffffff',
    playheadBackgroundOpacity: 0,

    playheadPlayProgressFill: '#008cbc',
    playheadPlayProgressOpacity: 0.5,

    playheadBufferedFill: '#a2a2a2',
    playheadBufferedOpacity: 1,

    // playhead hover
    playheadHoverVisible: false,
    playheadHoverFill: '#737373',
    playheadHoverLineWidth: 2,
    playheadHoverSymbolHeight: 15,
    playheadHoverTextFill: '#ffffff',
    playheadHoverTextYOffset: 0,
    playheadHoverTextFontSize: 12,

    scrubberMarginBottom: 15
  }
}

export class Timeline implements Destroyable, ScrollableHorizontally, TimelineApi {
  readonly onScroll$: Subject<TimelineScrollEvent> = new Subject<TimelineScrollEvent>();
  readonly onZoom$: Subject<TimelineZoomEvent> = new Subject<TimelineZoomEvent>();
  readonly onStyleChange$: Subject<TimelineStyle> = new Subject<TimelineStyle>();

  private _config: TimelineConfig;
  private _styleAdapter: StyleAdapter<TimelineStyle>;

  // region config
  private _timelineHTMLElementId: string;
  private _videoController: VideoControllerApi;
  private _thumbnailVttFile?: ThumbnailVttFile;
  // endregion

  private _timelineHTMLElement: HTMLElement;
  private _timelineLanes: TimelineLaneApi[] = [];
  private _timelineLanesMap: Map<string, TimelineLaneApi> = new Map<string, TimelineLaneApi>();

  // region konva
  private _konvaStage!: Konva.Stage;

  private _mainLayer!: Konva.Layer;

  private _timecodedContainer!: Konva.Group;
  private _timecodedFloatingGroup!: Konva.Group;
  private _timecodedFloatingBg!: Konva.Rect
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

  // private _scrollbar!: Scrollbar;
  private _playheadHover!: PlayheadHover;
  private _playhead!: Playhead;
  private _scrubberLane!: ScrubberLane;
  private _thumbnailHover!: Thumbnail;
  private _headerTimecodeDisplay!: TimecodeDisplay;
  // endregion

  private _maxTimecodedGroupWidth!: number;

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
    this._styleAdapter = new StyleAdapter(this._config.style);

    this._timelineHTMLElementId = this._config.timelineHTMLElementId;
    this._timelineHTMLElement = document.getElementById(this._timelineHTMLElementId) as HTMLVideoElement;

    if (!this._timelineHTMLElement) {
      throw new Error(`Could not find HTML element id=${this._timelineHTMLElementId}`)
    }

    this._videoController = videoController;

    if (!this._videoController) {
      throw new Error(`Video conttroller API invalid`)
    }

    this.init();

    this.onZoom$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: () => {
        this.playheadHoverMove()
      }
    })
  }

  protected init() {
    let stageDimensions = this.resolveStageDimension();

    this._konvaStage = KonvaFactory.createStage({
      container: this._timelineHTMLElementId,
      ...stageDimensions
    });

    this._mainLayer = KonvaFactory.createLayer();
    this._surfaceLayer = KonvaFactory.createLayer();

    this._konvaStage.add(this._mainLayer);
    this._konvaStage.add(this._surfaceLayer);


    // region flex

    this._layoutBg = KonvaFactory.createBgRect({
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
    })

    this._headerBg = KonvaFactory.createBgRect({
      fill: this.style.headerBackgroundFill,
      opacity: this.style.headerBackgroundOpacity
    })

    this._footerBg = KonvaFactory.createBgRect({
      fill: this.style.footerBackgroundFill,
      opacity: this.style.footerBackgroundOpacity
    })

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
      margins: FlexSpacingBuilder.instance()
        .spacing(this.style.headerMarginBottom, 'EDGE_BOTTOM')
        .build(),
      paddings:
        FlexSpacingBuilder.instance()
          .spacing(20, 'EDGE_START')
          .spacing(20, 'EDGE_END')
          .build()
    })

    this._footerFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._footerBg,
      justifyContent: 'JUSTIFY_FLEX_END',
      alignItems: 'ALIGN_CENTER',
      width: 'auto',
      height: this.style.footerHeight,
      margins: FlexSpacingBuilder.instance()
        .spacing(this.style.footerMarginTop, 'EDGE_TOP')
        .build(),
      paddings: FlexSpacingBuilder.instance()
        .spacing(20, 'EDGE_START')
        .spacing(20, 'EDGE_END')
        .build()
    })

    this._mainFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      flexDirection: 'FLEX_DIRECTION_ROW',
      justifyContent: 'JUSTIFY_FLEX_START',
    })

    this._mainLeftFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      justifyContent: 'JUSTIFY_FLEX_START',
      width: this.style.leftPaneWidth,
    })

    this._mainRightFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      justifyContent: 'JUSTIFY_FLEX_START',
      flexGrow: 1,
    })

    // endregion

    this._timecodedContainer = KonvaFactory.createGroup();

    this._timecodedFloatingGroup = KonvaFactory.createGroup({
      draggable: true
    });
    this._timecodedFloatingBg = KonvaFactory.createBgRect({
      fill: 'yellow',
      opacity: 0,
    });
    this._timecodedFloatingEventCatcher = KonvaFactory.createEventCatcherRect();

    this._timecodedContainer.add(
      this._timecodedFloatingGroup.add(...[
        this._timecodedFloatingBg,
        this._timecodedFloatingEventCatcher,
      ])
    );


    for (let i = 0; i < MAIN_LAYER_CONTENT_GROUPS; i++) {
      let contentLayer = KonvaFactory.createGroup();
      this._timecodedFloatingGroup.add(contentLayer);
      this._timecodedFloatingContentGroups.set(i, contentLayer);
    }

    this._surfaceLayer_timecodedContainer = KonvaFactory.createGroup();
    this._surfaceLayer_timecodedFloatingGroup = KonvaFactory.createGroup();
    this._surfaceLayer_timecodedContainer.add(
      this._surfaceLayer_timecodedFloatingGroup
    );
    for (let i = 0; i < SURFACE_LAYER_CONTENT_GROUPS; i++) {
      let contentLayer = KonvaFactory.createGroup();
      this._surfaceLayer_timecodedFloatingGroup.add(contentLayer);
      this._surfaceLayer_timecodedFloatingContentGroups.set(i, contentLayer);
    }

    this._surfaceLayer.add(...[
      this._surfaceLayer_timecodedContainer
    ]);

    this._playhead = new Playhead({
      style: {
        visible: this.style.playheadVisible,
        fill: this.style.playheadFill,
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
      }
    }, this, this._videoController)

    this._playheadHover = new PlayheadHover({
      style: {
        visible: this.style.playheadHoverVisible,
        fill: this.style.playheadHoverFill,
        snappedFill: this.style.playheadHoverSnappedFill,
        textSnappedFill: this.style.playheadHoverSnappedFill,
        lineWidth: this.style.playheadHoverLineWidth,
        symbolHeight: this.style.playheadHoverSymbolHeight,
        symbolYOffset: -this.style.playheadScrubberHeight / 2,
        textFill: this.style.playheadHoverTextFill,
        textFontSize: this.style.playheadHoverTextFontSize,
        textYOffset: this.style.playheadHoverTextYOffset
      }
    }, this);

    this._thumbnailHover = new Thumbnail({
      style: {
        visible: false,
        stroke: this.style.thumbnailHoverStroke,
        strokeWidth: this.style.thumbnailHoverStrokeWidth
      }
    });

    for (const component of [this._playhead, this._playheadHover, this._thumbnailHover]) {
      this.addToSurfaceLayerTimecodedFloatingContent(component.konvaNode)
    }

    this._headerTimecodeDisplay = new TimecodeDisplay({
      style: {
        visible: false,
        fontSize: this.style.headerTimecodeDisplayTextFontSize,
        fill: this.style.headerTimecodeDisplayTextFill
      },
    }, this, this._videoController);

    let headerTimecodeFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      width: this._headerTimecodeDisplay.style.width,
      height: this._headerTimecodeDisplay.style.height
    })

    let timecodeDisplayFlexItem = KonvaFlexItem.of({
      width: this._headerTimecodeDisplay.style.width,
      height: this._headerTimecodeDisplay.style.height
    }, this._headerTimecodeDisplay.konvaNode)

    this._timecodedWrapperFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: new Konva.Rect({
        fill: 'yellow',
        opacity: 0,
      }),
      positionType: 'POSITION_TYPE_ABSOLUTE',
      width: '100%',
      height: '100%',
      paddings: FlexSpacingBuilder.instance()
        .spacing(this.style.rightPaneMarginLeft, 'EDGE_START')
        .spacing(this.style.rightPaneMarginRight, 'EDGE_END')
        .build()
    })

    this._timecodedContainerFlexGroup = KonvaFlexGroup.of({
      konvaNode: this._timecodedContainer,
      konvaBgNode: new Konva.Rect({
        fill: 'teal',
        opacity: 0,
      }),
      flexGrow: 1,
      height: '100%'
    })

    this._timecodedContainerStaticFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: new Konva.Rect({
        fill: 'teal',
        opacity: 0,
      }),
      flexGrow: 1,
      height: '100%'
    })

    this._timelineLaneStaticFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: new Konva.Rect({
        fill: 'yellow',
        opacity: 0,
      }),
      positionType: 'POSITION_TYPE_ABSOLUTE',
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      width: '100%',
      height: '100%',
    });

    this._layoutFlexGroup
      .addChild(this._headerFlexGroup
        .addChild(headerTimecodeFlexGroup
          .addChild(timecodeDisplayFlexItem)
        )
      )
      .addChild(this._mainFlexGroup
        .addChild(this._mainLeftFlexGroup)
        .addChild(this._mainRightFlexGroup
          .addChild(this._timelineLaneStaticFlexGroup)
          .addChild(this._timecodedWrapperFlexGroup
            .addChild(this._timecodedContainerFlexGroup
              .addChild(this._timecodedContainerStaticFlexGroup)
            )
          )
        )
      )
      .addChild(this._footerFlexGroup);

    this._footerFlexGroup.addChild(new TimelineScrollbar({
      height: this.style.scrollbarHeight,
      width: 500,
    }, new Scrollbar({
      style: {
        height: this.style.scrollbarHeight,
        backgroundFill: this.style.scrollbarBackgroundFill,
        backgroundFillOpacity: this.style.scrollbarBackgroundFillOpacity,
        handleBarFill: this.style.scrollbarHandleBarFill,
        handleBarOpacity: this.style.scrollbarHandleBarOpacity,
        handleOpacity: this.style.scrollbarHandleOpacity,
      }
    }), this));

    // adding flex groups to layer
    this._mainLayer.add(...[
      this._layoutFlexGroup.contentNode.konvaNode
    ]);

    this._scrubberLane = new ScrubberLane({
      style: {
        marginBottom: this.style.scrubberMarginBottom
      }
    });

    this._maxTimecodedGroupWidth = this.calculateTimecodedWidthFromZoomRatioPercent(this._config.zoomMax);

    this.addTimelineLanes([
      this._scrubberLane
    ])

    this._videoController.onVideoLoading$.pipe(filter(p => !!p), takeUntil(this._destroyed$)).subscribe((event) => {
      this.onVideoLoadingEvent(event!);
    })

    this._videoController.onVideoLoaded$.pipe(filter(p => !!p), takeUntil(this._destroyed$)).subscribe((event) => {
      this.onVideoLoadedEvent(event!);
    })

    fromEvent(window, 'resize').pipe(takeUntil(this._destroyed$)).subscribe({
      next: (event) => {
        this.onWindowResize(event);
      }
    });

    this._timecodedContainer.on('mouseenter', (event) => {
      this._playheadHover.toggleVisible(this._videoController.isVideoLoaded());
    })

    this._timecodedContainer.on('mouseleave', (event) => {
      this._playheadHover.toggleVisible(false);
    });

    [this._timecodedContainer].forEach(group => {
      group.on('mousemove', (event) => {
        if (!this._videoController.isVideoLoaded()) {
          return;
        }

        this.playheadHoverMove();
      })
    });

    if (this._config.zoomWheelEnabled) {
      this._timecodedContainer.on('wheel', (konvaEvent) => {

        if (!this._videoController.isVideoLoaded()) {
          return;
        }

        let pointerPosition = this._timecodedContainer.getRelativePointerPosition();
        let scrubberRect = this._scrubberLane.getTimecodedRect();

        if (MesurmentUtil.isPositionInRect(pointerPosition, scrubberRect)) {
          let event = konvaEvent.evt;
          event.preventDefault();

          let direction: ZoomDirection = event.deltaY > 0 ? 'zoom_in' : 'zoom_out';
          if (event.ctrlKey) {
            direction = direction === 'zoom_in' ? 'zoom_out' : 'zoom_in';
          }

          this.zoomByStep(direction, this._config.zoomScaleWheel, this._timecodedContainer.getRelativePointerPosition().x);

          this.updateScrollWithPlayhead();
        }

        this.playheadHoverMove();
      })
    }

    this._timecodedContainer.on('dragstart', (event) => {
      if (!this._videoController.isVideoLoaded()) {
        event.target.stopDrag();
        return;
      }
    })

    this._timecodedContainer.on('dragmove dragend', (event) => {
      // @ts-ignore
      if (event.target === this._timecodedFloatingGroup) {
        let newPosition = (this._timecodedFloatingGroup as Konva.Group).getPosition();

        (this._timecodedFloatingGroup as Konva.Group).setAttrs({
          x: this.getConstrainedTimelineX(newPosition.x),
          y: 0 // ensures that dragging is only on x-axis
        });

        this.onScroll$.next(this.createScrollEvent())
      } else {
        // update playheadHover if something else is dragged
        this.playheadHoverMove();
      }
      this.updateScrollWithPlayhead();
      this.layersSync();
    })

    this._timecodedContainer.on('dragmove', (event) => {
      WindowUtil.cursor('grabbing')
    })

    this._timecodedContainer.on('dragend', (event) => {
      WindowUtil.cursor('default')
    })

    this._scrubberLane.onMouseMove$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      if (!this._videoController.isVideoLoaded()) {
        return;
      }
      if (this._thumbnailVttFile) {
        let x = this._timecodedFloatingGroup.getRelativePointerPosition().x;
        let time = this.timelinePositionToTime(x);
        let thumbnailVttCue = this._thumbnailVttFile.findCue(time);
        if (thumbnailVttCue) {
          this.showThumbnailHover(thumbnailVttCue);
        }
      }
    });

    this._scrubberLane.onMouseLeave$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.hideThumbnailHover();
    });

    this._scrubberLane.onClick$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      if (!this._videoController.isVideoLoaded()) {
        return;
      }

      this.updateScrollWithPlayhead();

      let x = this._timecodedFloatingGroup.getRelativePointerPosition().x;
      this._videoController.seekToTime(this.timelinePositionToTime(x)).subscribe();

      this.playheadHoverMove();
    });

    if (this._config.thumbnailVttFile) {
      this._thumbnailVttFile = this._config.thumbnailVttFile;
    } else if (this._config.thumbnailVttUrl) {
      this.loadThumbnailVttFile(this._config.thumbnailVttUrl).subscribe()
    }

    this.settleLayout();
  }

  settleLayout(): void {
    this._layoutFlexGroup.refreshLayout(); // make sure all child layouts are refreshed (ie. timeline lane layouts)

    let stageDimensions = this.resolveStageDimension();

    this._konvaStage.setAttrs({
      ...stageDimensions
    })

    this._layoutFlexGroup.setDimension(stageDimensions.width, stageDimensions.height);

    this.settleTimecodedGroups();

    this._maxTimecodedGroupWidth = this.calculateTimecodedWidthFromZoomRatioPercent(this._config.zoomMax);

    this._playheadHover.style = {
      height: this._timecodedContainer.height()
    }

    this._timelineLanes.forEach(timelineLane => {
      timelineLane.onMeasurementsChange();
    })

    this._playhead.onMeasurementsChange();
  }

  private settleTimecodedGroups() {
    let timecodedFlexGroupLayout = this._timecodedContainerFlexGroup.getLayout();

    let newTimecodedWidth = this.calculateTimecodedWidthFromZoomRatioPercent(this.getZoomPercent());

    [this._timecodedFloatingGroup, ...this._timecodedFloatingGroup.getChildren()].forEach(node => {
      node.setAttrs({
        width: newTimecodedWidth,
        height: timecodedFlexGroupLayout.height
      })
    });

    this._timecodedContainer.clipFunc((ctx) => {
      ctx.rect(-this.style.rightPaneClipPadding, -500, this._timecodedContainer.width() + 2 * this.style.rightPaneClipPadding, this._timecodedContainer.height() + 500)
    });

    this.layersSync();
  }

  private layersSync() {
    [this._surfaceLayer_timecodedContainer].forEach(timecodedContainer => {
      timecodedContainer.setAttrs({
        ...this._timecodedContainer.absolutePosition(),
        ...this._timecodedContainer.size(),
      });

      timecodedContainer.clipFunc((ctx) => {
        ctx.rect(-this.style.rightPaneClipPadding, -500, timecodedContainer.width() + 2 * this.style.rightPaneClipPadding, timecodedContainer.height() + 500)
      });
    });

    [this._surfaceLayer_timecodedFloatingGroup].forEach(timecodedGroup => {
      timecodedGroup.setAttrs({
        ...this._timecodedFloatingGroup.position(),
        ...this._timecodedFloatingGroup.size(),
      });

      [...timecodedGroup.getChildren()].forEach(node => {
        node.setAttrs({
          ...this._timecodedFloatingGroup.size(),
        })
      });
    })
  }

  private onWindowResize(event: Event) {
    this.settleLayout();
    this.zoomByWidth(this.getTimecodedFloatingDimension().width, this.resolveTimelineContainerZoomFocusPosition());
  }

  private resolveStageDimension(): Dimension {
    let divElementRect = this.getTimelineHTMLElementRect();

    let header = this.style.headerHeight + this.style.headerMarginBottom;

    let lanes = this.getTimelineLanes()
      .map(p => {
        let layout = p.mainRightFlexGroup.getLayout();
        return layout.height + layout.bottom
      })
      .reduce((acc, current) => acc + current, 0);

    let footer = this.style.footerHeight + this.style.footerMarginTop;

    let layout = header + lanes + footer;

    return {
      width: divElementRect.width >= this.style.stageMinWidth ? divElementRect.width : this.style.stageMinWidth,
      height: layout >= this.style.stageMinHeight ? layout : this.style.stageMinHeight,
    }
  }

  private getTimelineHTMLElementRect(): RectMeasurement {
    return {
      x: this._timelineHTMLElement.offsetLeft,
      y: this._timelineHTMLElement.offsetTop,
      width: this._timelineHTMLElement.offsetWidth,
      height: this._timelineHTMLElement.offsetHeight
    }
  }

  private showThumbnailHover(thumbnailVttCue: ThumbnailVttCue) {
    this._thumbnailHover.setVisible(true);
    if (this._thumbnailHover.cue === thumbnailVttCue) {
      this._thumbnailHover.cue = thumbnailVttCue;
      let position = this.resolveThumbnailPosition(this._thumbnailHover);
      this._thumbnailHover.setPosition(position)
      this._thumbnailHover.konvaNode.moveToTop();
    } else {
      ImageUtil.createKonvaImageSizedByWidth(thumbnailVttCue.url, this.style.thumbnailHoverWidth).pipe(takeUntil(this._destroyed$)).subscribe({
        next: (image) => {
          this._thumbnailHover.cue = thumbnailVttCue;
          this._thumbnailHover.setDimension(image.getSize());
          this._thumbnailHover.setImage(image);
          this._thumbnailHover.setPosition(this.resolveThumbnailPosition(this._thumbnailHover))
          this._thumbnailHover.konvaNode.moveToTop();
        },
        error: (err) => {
          console.error(err)
        }
      })
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
    x = xWithStroke < 0 ? halfStroke : (x + imageSize.width + halfStroke) > timecodedGroupDimension.width ? (timecodedGroupDimension.width - imageSize.width - halfStroke) : x;

    let timecodedRect = this._scrubberLane.getTimecodedRect();

    return {
      x: x,
      y: timecodedRect.y + timecodedRect.height + thumbnail.style.strokeWidth / 2 + this.style.thumbnailHoverYOffset
    }
  }

  private createScrollEvent(): TimelineScrollEvent {
    return {
      scrollPercent: this.getHorizontalScrollPercent()
    }
  }

  private createZoomEvent(): TimelineZoomEvent {
    return {
      zoomPercent: this.getZoomPercent()
    }
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

  scrollHorizontally(percent: number) {
    this.setTimelinePosition(this.calculateTimelineXFromScrollPercent(percent));
    this.updateScrollWithPlayhead();
    this.onScroll$.next(this.createScrollEvent());
  }

  getScrollHandleHorizontals(scrollbarWidth: number): Horizontals {
    let timecodedFloatingDimension = this.getTimecodedFloatingDimension();
    let timecodedContainerDimension = this.getTimecodedContainerDimension();
    let timecodedFloatingPosition = this.getTimecodedFloatingPosition();

    if (!scrollbarWidth || !timecodedContainerDimension || !timecodedFloatingDimension || timecodedFloatingDimension.width < 1) {
      return {
        width: 0,
        x: 0
      }
    }

    let scrollHandleWidth = new Decimal(scrollbarWidth).mul(timecodedContainerDimension.width).div(timecodedFloatingDimension.width).round().toNumber();

    return {
      width: scrollHandleWidth,
      x: new Decimal(timecodedFloatingPosition.x).abs().mul(scrollbarWidth).div(timecodedFloatingDimension.width).toNumber()
    }
  }

  scrollToEased(percent: number): Observable<number> {
    percent = z.coerce.number()
      .min(0)
      .max(100)
      .parse(percent);

    return this.scrollToPercentEased(percent);
  }

  scrollToPlayheadEased(): Observable<number> {
    let newTimelineX = -this._playhead.getPlayheadPosition() + this.getTimecodedContainerDimension().width / 2;
    return this.scrollToPositionEased(newTimelineX);
  }

  private scrollToPercent(percent: number) {
    let newX = this.calculateTimelineXFromScrollPercent(percent);
    this.scrollTimeline(newX)
  }

  private scrollToPercentEased(percent: number): Observable<number> {
    let newTimelineX = this.calculateTimelineXFromScrollPercent(percent);
    return this.scrollToPositionEased(newTimelineX);
  }

  private scrollToPositionEased(newTimelineX: number): Observable<number> {
    return new Observable<number>(o$ => {
      let currentTimelineX = this.getTimecodedFloatingPosition().x;
      animate({
        duration: this._config.scrollEasingDuration,
        startValue: currentTimelineX,
        endValue: newTimelineX,
        onUpdateHandler: (frame, value) => {
          this.scrollTimeline(value)
        },
        onCompleteHandler: (frame, value) => {
          o$.next(this.getHorizontalScrollPercent());
          o$.complete();
        }
      })
    })
  }

  private isPlayheadInTimecodedView(): boolean {
    return this.isInVisiblePositionRange(this._playhead.getPlayheadPosition());
  }

  private updateScrollWithPlayhead() {
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
    return new Observable<number>(o$ => {
      this.scrollToPositionEased(-this._playhead.getPlayheadPosition()).pipe(map(result => {
        o$.next(this.getHorizontalScrollPercent());
        o$.complete();
      })).subscribe()
    })
  }

  private setTimelinePosition(x: number) {
    let newX = this.getConstrainedTimelineX(x);
    this._timecodedFloatingGroup.x(newX);
    this.layersSync();
  }

  private scrollTimeline(x: number) {
    let currentX = this.getTimecodedFloatingPosition().x;
    this.setTimelinePosition(x);
    let newX = this.getTimecodedFloatingPosition().x
    if (newX !== currentX) {
      this.onScroll$.next(this.createScrollEvent())
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
    let percentSafeParsed = z.coerce.number()
      .min(this._config.zoomBaseline)
      .max(this._config.zoomMax)
      .safeParse(percent);

    if (percentSafeParsed.success) {
      percent = this.getConstrainedZoomPercent(percentSafeParsed.data);
      let newTimecodedWidth = this.calculateTimecodedWidthFromZoomRatioPercent(percent);
      let timecodedContainerFocus = zoomFocusPercent ? this.resolveTimecodedFloatingPosition(zoomFocusPercent) : this.resolveTimelineContainerZoomFocusPosition();
      this.zoomByWidth(newTimecodedWidth, timecodedContainerFocus);
    }

    return this.getZoomPercent();
  }

  zoomToEased(percent: number, zoomFocusPercent: number | undefined = void 0): Observable<number> {
    let percentSafeParsed = z.coerce.number()
      .min(this._config.zoomBaseline)
      .max(this._config.zoomMax)
      .safeParse(percent);

    if (percentSafeParsed.success) {
      let timecodedContainerFocus = zoomFocusPercent ? this.resolveTimecodedFloatingPosition(zoomFocusPercent) : this.resolveTimelineContainerZoomFocusPosition();
      return this.zoomByPercentEased(percentSafeParsed.data, timecodedContainerFocus);
    } else {
      return of(this.getZoomPercent());
    }
  }

  private resolveTimecodedFloatingPosition(percent: number): number {
    let floatingDimension = this.getTimecodedFloatingDimension();
    return new Decimal(floatingDimension.width).mul(percent).div(100).toNumber()
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
    let containerRect = this.getTimecodedContainerRect();

    newTimecodedWidth = this.getConstrainedTimecodedWidth(newTimecodedWidth);
    let newTimecodedX: number;

    if (newTimecodedWidth === containerRect.width) {
      newTimecodedX = 0; // snap start
    } else if (newTimecodedWidth === currentTimecodedWidth) {
      newTimecodedX = currentTimecodedX;
    } else {
      newTimecodedX = new Decimal(Math.abs(currentTimecodedX) + timecodedContainerFocus).mul(newTimecodedWidth).div(currentTimecodedWidth).mul(-1).plus(timecodedContainerFocus).toNumber();
    }

    if (newTimecodedX > 0) {
      newTimecodedX = 0;  // snap start
    } else if ((newTimecodedX + newTimecodedWidth) <= (containerRect.width)) {
      newTimecodedX = containerRect.width - newTimecodedWidth; // snap end
    }

    this.hideThumbnailHover();

    this.settleTimecodedFloating({
      width: newTimecodedWidth,
      x: newTimecodedX
    })

    if (newTimecodedWidth !== currentTimecodedWidth || newTimecodedX !== currentTimecodedX) {
      this.onZoom$.next(this.createZoomEvent())
      this.onScroll$.next(this.createScrollEvent())
    }
  }

  private settleTimecodedFloating(horizontals: Horizontals) {
    this._timecodedFloatingGroup.setAttrs({
      width: horizontals.width,
      x: horizontals.x
    });

    this._timecodedFloatingGroup.getChildren().forEach((node) => {
      node.setAttrs({
        width: horizontals.width // just width is enough
      })
    })

    this.layersSync()
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
    return new Observable<number>(o$ => {
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
            o$.next(this.getZoomPercent());
            o$.complete();
          }
        })
      } else {
        o$.next(this.getZoomPercent());
        o$.complete();
      }
    })
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
      return newWidth <= this._maxTimecodedGroupWidth ? newWidth : this._maxTimecodedGroupWidth;
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

  private playheadHoverMove() {
    if (this._videoController.isVideoLoaded() && this._playheadHover) {
      let isSnapped = false;

      if (this._timecodedFloatingGroup.getRelativePointerPosition()) {
        let pointerPosition = this._timecodedFloatingGroup.getRelativePointerPosition().x;

        if (!this._videoController.isPlaying()) {
          // check if we need to snap playheadHover to playhead
          let playheadPosition = this.timeToTimelinePosition(this._videoController.getCurrentTime());
          if (pointerPosition > (playheadPosition - this._config.playheadHoverSnapArea) && pointerPosition < (playheadPosition + this._config.playheadHoverSnapArea)) {
            pointerPosition = playheadPosition;
            isSnapped = true;
          }
        }

        this._playheadHover.sync(pointerPosition, isSnapped);
      }
    }
  }

  // endregion

  // region video

  private onVideoLoadingEvent(event: VideoLoadingEvent) {
    this.clearContent();
  }

  private onVideoLoadedEvent(event: VideoLoadedEvent) {
    this.fireVideoEventBreaker();

    // if video was loaded previously, remove all content associated with it
    this.clearContent();

    this.syncVideoMetadata();

    this._videoController.onVideoTimeChange$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.syncVideoMetadata();
    })

    this._videoController.onPlay$.pipe(takeUntil(this._videoEventBreaker$)).subscribe((event) => {
      this.updateScrollWithPlayhead();
    })
  }

  private fireVideoEventBreaker() {
    nextCompleteVoidSubject(this._videoEventBreaker$);
    this._videoEventBreaker$ = new Subject<void>();
  }

  private syncVideoMetadata() {
    // follows playhead and scrolls playhead to left if playhead moves out of view
    if (this._scrollWithPlayhead && !this.isPlayheadInTimecodedView() && !this._syncTimelineWithPlayheadInProgress) {
      this._syncTimelineWithPlayheadInProgress = true;
      this.syncTimelineWithPlayhead().subscribe(result => {
        this._syncTimelineWithPlayheadInProgress = false;
      })
    }
  }

  // endregion

  // region API
  addTimelineLane(timelineLane: TimelineLaneApi): TimelineLaneApi {
    return this.addTimelineLaneAtIndex(timelineLane, this._timelineLanes.length);
  }

  addTimelineLaneAtIndex(timelineLane: TimelineLaneApi, index: number): TimelineLaneApi {
    if (this._timelineLanesMap.has(timelineLane.id)) {
      throw new Error(`TimelineLane with id=${timelineLane.id} already exist`)
    }

    if (index < 0 || index > this._timelineLanes.length) {
      throw new Error(`TimelineLane index must be ${0} >= index <= ${this._timelineLanes.length}, provided ${index}`);
    }

    this._timelineLanes.splice(index, 0, timelineLane);
    this._timelineLanesMap.set(timelineLane.id, timelineLane);

    timelineLane.prepareForTimeline(this, this._videoController);

    this._mainLeftFlexGroup
      .addChild(timelineLane.mainLeftFlexGroup, index)
    this._timelineLaneStaticFlexGroup
      .addChild(timelineLane.mainRightFlexGroup, index)

    this.settleLayout();

    return timelineLane;
  }

  removeTimelineLane(id: string): void {
    if (!this._timelineLanesMap.has(id)) {
      console.debug(`TimelineLane with id=${id} doesn't exist`);
      return;
    }

    let timelineLane = this._timelineLanesMap.get(id);

    if (timelineLane) {
      this._mainLeftFlexGroup
        .removeChild(timelineLane!.mainLeftFlexGroup)
      this._timelineLaneStaticFlexGroup
        .removeChild(timelineLane!.mainRightFlexGroup)

      this._timelineLanes.splice(this._timelineLanes.findIndex(p => p.id === id), 1);
      this._timelineLanesMap.delete(id);
      timelineLane!.destroy();

      this.settleLayout();
    }
  }

  addTimelineLanes(timelineLanes: TimelineLaneApi[]): void {
    timelineLanes.forEach(p => this.addTimelineLane(p));
  }

  getTimelineLanes(): TimelineLaneApi[] {
    return [...this._timelineLanesMap.values()];
  }

  getTimelineLane<T extends TimelineLaneApi>(id: string): T | undefined {
    let timelineLane = this._timelineLanesMap.get(id);
    return timelineLane ? timelineLane as T : void 0;
  }

  getScrubberLane(): ScrubberLane {
    return this.getTimelineLanes().find(p => p instanceof ScrubberLane)! as ScrubberLane;
  }

  // endregion

  isTimelineReady(): boolean {
    return this._videoController.isVideoLoaded();
  }

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
    let timecodedGroupDimension = this.getTimecodedFloatingDimension();
    return x < 0 ? 0 : x > timecodedGroupDimension.width ? timecodedGroupDimension.width : x;
  }

  timelinePositionToTime(xOnTimeline: number): number {
    return this.convertPositionOnTimelineToTime(xOnTimeline, this.getTimecodedFloatingDimension().width);
  }

  timelineContainerPositionToTime(xOnTimeline: number): number {
    return this.timelinePositionToTime(Math.abs(this.getTimecodedFloatingHorizontals().x) + xOnTimeline);
  }

  timelinePositionToTimeFormatted(x: number): string {
    return this._videoController.isVideoLoaded() ? this._videoController.formatToTimecode(this.timelinePositionToTime(x)) : '';
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

  private getConstrainedTimelineX(x: number): number {
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
    return this._timecodedContainer.getSize()
  }

  getTimecodedContainerPosition(): Position {
    return this._timecodedContainer.getPosition()
  }

  getTimecodedContainerRect(): RectMeasurement {
    return {
      ...this.getTimecodedContainerDimension(),
      ...this.getTimecodedContainerPosition()
    }
  }

  getTimecodedFloatingDimension(): Dimension {
    return this._timecodedFloatingGroup.getSize()
  }

  getTimecodedFloatingPosition(): Position {
    return this._timecodedFloatingGroup.getPosition()
  }

  getTimecodedFloatingRect(): RectMeasurement {
    return {
      ...this._timecodedFloatingGroup.getPosition(),
      ...this._timecodedFloatingGroup.getSize()
    };
  }

  getTimecodedFloatingHorizontals(): Horizontals {
    return {
      x: this._timecodedFloatingGroup.x(),
      width: this._timecodedFloatingGroup.width()
    }
  }

  private getVisiblePositionRange(): { start: number, end: number } {
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
    return (this.getTimecodedContainerDimension().width - this.getTimecodedFloatingDimension().width) === this.getTimecodedFloatingPosition().x;
  }

  getVisibleTimeRange(): { start: number, end: number } {
    let positionRange = this.getVisiblePositionRange();
    let start = this.timelinePositionToTime(positionRange.start);
    let end = this.timelinePositionToTime(positionRange.end);
    return {start, end}
  }

  private loadThumbnailVttFile(thumbnailVttUrl: string): Observable<boolean> {
    return ThumbnailVttFile.create(thumbnailVttUrl, this._config.axiosConfig).pipe(map(thumbnailVttFile => {
      this._thumbnailVttFile = thumbnailVttFile;
      return true;
    }), catchError(err => {
      return of(false);
    }))
  }

  loadThumbnailsFromUrl(thumbnailVttUrl: string): Observable<boolean> {
    if (thumbnailVttUrl) {
      return this.loadThumbnailVttFile(thumbnailVttUrl);
    } else {
      return of(false);
    }
  }

  setDescriptionPaneVisible(visible: boolean): void {
    this._mainLeftFlexGroup.setWidth(visible ? this.style.leftPaneWidth : 0)
    this.settleLayout();
    this._timelineLanes.forEach(timelineLane => {
      timelineLane.onMeasurementsChange();
    })

    this._descriptionPaneVisible = visible;
    this._headerTimecodeDisplay.setVisible(!visible);
  }

  toggleDescriptionPaneVisible(): void {
    this.setDescriptionPaneVisible(!this._descriptionPaneVisible)
  }

  setDescriptionPaneVisibleEased(visible: boolean): Observable<void> {
    return new Observable(o$ => {
      animate({
        duration: this._config.layoutEasingDuration,
        startValue: visible ? 0 : this._mainLeftFlexGroup.getLayout().width,
        endValue: visible ? this.style.leftPaneWidth : 0,
        onUpdateHandler: (frame, value) => {
          this._mainLeftFlexGroup.setWidth(Math.round(value))

          this.settleTimecodedGroups();

          this._timelineLanes.forEach(timelineLane => {
            timelineLane.onMeasurementsChange();
          })

        },
        onCompleteHandler: (frame, value) => {
          this.setDescriptionPaneVisible(visible);
          o$.next();
          o$.complete();
        }
      })
    })
  }

  toggleDescriptionPaneVisibleEased(): Observable<void> {
    return this.setDescriptionPaneVisibleEased(!this._descriptionPaneVisible);
  }

  get thumbnailVttFile(): ThumbnailVttFile | undefined {
    return this._thumbnailVttFile;
  }

  get style(): TimelineStyle {
    return this._styleAdapter.style;
  }

  set style(value: Partial<TimelineStyle>) {
    this._styleAdapter.style = value;
    this.onStyleChange$.next(this.style);
  }

  private clearContent() {
    this._thumbnailVttFile = void 0;
    this.zoomByPercent(this._config.zoomBaseline, this.resolveTimelineContainerZoomFocusPosition());
  }

  destroy(): void {
    nextCompleteVoidSubjects(this._videoEventBreaker$);

    completeUnsubscribeSubjects(
      this.onScroll$,
      this.onZoom$,
      this.onStyleChange$
    );

    destroyer(this._layoutFlexGroup);

    destroyer(this._playheadHover, this._playhead, ...this._timelineLanes, this._thumbnailHover, this._headerTimecodeDisplay);

    nullifier(
      this._timelineHTMLElement,
      this._videoController,
      this._thumbnailVttFile
    );
  }

}
