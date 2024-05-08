/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import {BaseComponent, ComponentConfig, ComponentConfigStyleComposed, composeConfigAndDefault} from '../common/component';
import Konva from 'konva';
import Decimal from 'decimal.js';
import {ScrollableHorizontally, Scrollbar} from './scrollbar';
import {Dimension, HasRectMeasurement, HorizontalMeasurement, OnMeasurementsChange, Position, RectMeasurement} from '../common/measurement';
import {PlayheadHover} from './playhead-hover';
import {animate} from '../util/animation-util';
import {catchError, filter, fromEvent, map, Observable, of, Subject, takeUntil} from 'rxjs';
import {ThumbnailVttCue, TimelineScrollEvent, TimelineZoomEvent, VideoLoadedEvent} from '../types';
import {Playhead} from './playhead';
import {ThumbnailVttFile} from '../track';
import {Thumbnail} from './thumbnail/thumbnail';
import {GenericTimelaneLane} from './timeline-lane';
import {Constants} from '../constants';
import {ImageUtil} from '../util/image-util';
import {ShapeUtil} from '../util/shape-util';
import {WindowUtil} from '../util/window-util';
import {ScrubberLane} from './scrubber-lane';
import {TimecodeDisplay} from './timecode-display';
import {TimelineApi} from '../api';
import {z} from 'zod';
import {MarkerLane} from './marker';
import {ThumbnailLane} from './thumbnail';
import {SubtitlesLane} from './subtitles';
import {AudioTrackLane} from './audio-track';
import {MarkerLaneConfig} from './marker/marker-lane';
import {ThumbnailLaneConfig} from './thumbnail/thumbnail-lane';
import {SubtitlesLaneConfig} from './subtitles/subtitles-lane';
import {AxiosRequestConfig} from 'axios';
import {completeSubjects, nextCompleteVoidSubject, nextCompleteVoidSubjects, unsubscribeSubjects} from '../util/observable-util';
import {VideoControllerApi} from '../video/video-controller-api';
import {DestroyUtil} from '../util/destroy-util';

enum ZoomDirection {
  IN = 'IN',
  OUT = 'OUT'
}

export interface TimelineStyle {
  stageMinWidth: number;

  backgroundFill: string;
  headerBackgroundFill: string;
  footerBackgroundFill: string;

  scrollbarHeight: number;
  scrollbarBackgroundFill: string;
  scrollbarBackgroundFillOpacity: number;
  scrollbarHandleBarFill: string;
  scrollbarHandleBarOpacity: number;
  scrollbarHandleOpacity: number;

  thumbnailHoverWidth: number;
  thumbnailHoverStroke: string;
  thumbnailHoverStrokeWidth: number;
  thumbnailHoverYOffset: number;

  headerHeight: number;
  footerHeight: number;
  leftPanelWidth: number;
  // leftPanelLeftGutterWidth: number;
  // leftPanelRightGutterWidth: number;
  rightPanelLeftGutterWidth: number;
  rightPanelRightGutterWidth: number;
  timecodedContainerClipPadding: number;

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
  playheadHoverLineWidth: number;
  playheadHoverSymbolHeight: number
}

export interface TimelineConfig extends ComponentConfig<TimelineStyle> {
  thumbnailVttUrl?: string;
  thumbnailVttFile?: ThumbnailVttFile;
  axiosConfig?: AxiosRequestConfig;

  timelineHTMLElementId: string;
  playheadHoverSnapArea: number;
  zoomScale: number;
  zoomBaseline: number;
  zoomMax: number;
}

const configDefault: TimelineConfig = {
  timelineHTMLElementId: 'omakase-timeline',
  playheadHoverSnapArea: 5,
  zoomScale: 1.02,
  zoomBaseline: 100,
  zoomMax: 1500,
  style: {
    stageMinWidth: 700,

    backgroundFill: '#f5f5f5',
    headerBackgroundFill: '#f5f5f5',
    footerBackgroundFill: '#f5f5f5',

    scrollbarHeight: 15,
    scrollbarBackgroundFill: '#000000',
    scrollbarBackgroundFillOpacity: 0.3,
    scrollbarHandleBarFill: '#01a6f0',
    scrollbarHandleBarOpacity: 1,
    scrollbarHandleOpacity: 1,

    thumbnailHoverWidth: 200,
    thumbnailHoverStroke: 'rgba(255,73,145,0.9)',
    thumbnailHoverStrokeWidth: 5,
    thumbnailHoverYOffset: 0,

    headerHeight: 50,
    footerHeight: 50,
    leftPanelWidth: 200,
    // leftPanelLeftGutterWidth: 50,
    // leftPanelRightGutterWidth: 50,
    rightPanelLeftGutterWidth: 30,
    rightPanelRightGutterWidth: 30,
    timecodedContainerClipPadding: 20,

    // playhead
    playheadVisible: true,
    playheadFill: '#f43530',
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
    playheadHoverSymbolHeight: 15
  }
}

const SCRUBBER_LANE_ID = 'omakase_scrubber_lane';

// noinspection TypeScriptFieldCanBeMadeReadonly
export class Timeline extends BaseComponent<TimelineConfig, TimelineStyle, Konva.Stage> implements OnMeasurementsChange, HasRectMeasurement, ScrollableHorizontally, TimelineApi {
  // region config
  private timelineHTMLElementId: string;

  private _thumbnailVttUrl?: string;
  private _thumbnailVttFile?: ThumbnailVttFile;
  private _axiosConfig: AxiosRequestConfig;

  private width: number;
  private zoomScale: number;
  private zoomBaseline: number;
  private zoomMax: number;
  private playheadHoverSnapArea: number;
  // endregion

  private timelineHTMLElement: HTMLElement;

  // region konva
  private stage: Konva.Stage;
  private layer: Konva.Layer;

  private layoutGroup: Konva.Group;
  private layoutBackground: Konva.Rect;

  private headerGroup: Konva.Group;
  private headerBackground: Konva.Rect;
  private bodyGroup: Konva.Group;
  private footerGroup: Konva.Group;
  private footerBackground: Konva.Rect;
  private bodyContentGroup: Konva.Group;
  private leftPanel: Konva.Group;
  private rightPanel: Konva.Group;

  private timecodedContainer: Konva.Group;
  private timecodedGroup: Konva.Group;
  private timecodedBaseGroup: Konva.Group;
  private timecodedThumbnailsGroup: Konva.Group;
  private timecodedSubtitlesGroup: Konva.Group;
  private timecodedAudioGroup: Konva.Group;
  private timecodedChartGroup: Konva.Group;
  private timecodedMarkersGroup: Konva.Group;
  private timecodedSurfaceGroup: Konva.Group;
  private timecodedBackground: Konva.Rect
  private timecodedEventCatcher: Konva.Rect;
  private timecodedGroupNodes: Konva.Node[];
  // endregion

  // region component declarations
  private videoController: VideoControllerApi;
  private scrollbar: Scrollbar;
  private playheadHover: PlayheadHover;
  private playhead: Playhead;
  private timelineLanes: GenericTimelaneLane[];
  private timelineLanesMap: Map<string, GenericTimelaneLane>;
  private scrubberLane: ScrubberLane;
  private thumbnailHover: Thumbnail;
  private headerTimecodeDisplay: TimecodeDisplay;
  // endregion

  private maxTimecodedGroupWidth: number;

  private scrollWithPlayhead = true;
  private syncTimelineWithPlayheadInProgress = false;

  private mouseWheelEnabled = false
  private leftPanelVisible = true;

  private videoEventBreaker$ = new Subject<void>();

  // region event declarations
  readonly onScroll$: Subject<TimelineScrollEvent> = new Subject<TimelineScrollEvent>();
  readonly onZoom$: Subject<TimelineZoomEvent> = new Subject<TimelineZoomEvent>();

  // endregion

  constructor(config: Partial<ComponentConfigStyleComposed<TimelineConfig>>, videoController: VideoControllerApi) {
    super(composeConfigAndDefault(config, configDefault));

    this.timelineHTMLElementId = this.config.timelineHTMLElementId;
    this._axiosConfig = this.config.axiosConfig;

    this.playheadHoverSnapArea = this.config.playheadHoverSnapArea;
    this.zoomScale = this.config.zoomScale;
    this.zoomBaseline = this.config.zoomBaseline;
    this.zoomMax = this.config.zoomMax;

    this.timecodedGroupNodes = [];
    this.timelineLanes = [];
    this.timelineLanesMap = new Map<string, GenericTimelaneLane>();

    this.timelineHTMLElement = document.getElementById(this.timelineHTMLElementId) as HTMLVideoElement;

    this.videoController = videoController;
  }

  protected createCanvasNode(): Konva.Stage {
    let stageDimensions = this.resolveStageDimension();
    this.width = stageDimensions.width;

    this.stage = new Konva.Stage({
      container: this.timelineHTMLElementId,
      ...stageDimensions
    });
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.layoutGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
    })

    this.layer.add(this.layoutGroup);

    this.layoutBackground = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      fill: this.style.backgroundFill
    });

    this.headerGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT
    })

    this.headerBackground = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      fill: this.style.headerBackgroundFill
    });

    this.footerGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT
    })

    this.footerBackground = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      fill: this.style.footerBackgroundFill,
    });

    this.bodyGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT
    })

    this.bodyContentGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT
    })

    this.leftPanel = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT
    })

    this.rightPanel = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT
    })

    this.timecodedContainer = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
    })

    this.timecodedGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      draggable: true
    });

    this.timecodedBaseGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      name: 'timecodedBaseGroup'
    });

    this.timecodedThumbnailsGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      name: 'timecodedThumbnailsGroup'
    });

    this.timecodedSubtitlesGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      name: 'timecodedSubtitlesGroup'
    });

    this.timecodedAudioGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      name: 'timecodedAudioGroup'
    });

    this.timecodedChartGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      name: 'timecodedChartGroup'
    });

    this.timecodedMarkersGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      name: 'timecodedMarkersGroup'
    });

    this.timecodedSurfaceGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      name: 'timecodedSurfaceGroup'
    });

    this.timecodedBackground = new Konva.Rect({
      ...Constants.POSITION_TOP_LEFT,
      fill: 'yellow',
      opacity: 0,
      listening: false
    });

    this.timecodedEventCatcher = ShapeUtil.createEventCatcher();

    this.thumbnailHover = new Thumbnail({
      style: {
        visible: false,
        stroke: this.style.thumbnailHoverStroke,
        strokeWidth: this.style.thumbnailHoverStrokeWidth
      }
    })

    this.layoutGroup.add(this.layoutBackground)
    this.layoutGroup.add(this.headerGroup);
    this.layoutGroup.add(this.footerGroup);
    this.layoutGroup.add(this.bodyGroup);

    this.headerGroup.add(this.headerBackground);
    this.footerGroup.add(this.footerBackground);

    this.bodyGroup.add(this.bodyContentGroup);
    this.bodyGroup.add(this.leftPanel);
    this.bodyGroup.add(this.rightPanel);

    this.rightPanel.add(this.timecodedContainer);
    this.timecodedContainer.add(this.timecodedGroup);
    [this.timecodedBackground, this.timecodedEventCatcher,
      this.timecodedBaseGroup, this.timecodedThumbnailsGroup, this.timecodedSubtitlesGroup, this.timecodedAudioGroup, this.timecodedChartGroup, this.timecodedMarkersGroup, this.timecodedSurfaceGroup
    ].forEach(node => {
      this.timecodedGroupNodes.push(node);
      this.timecodedGroup.add(node);
    });

    this.scrollbar = new Scrollbar({
      style: {
        height: this.style.scrollbarHeight,
        backgroundFill: this.style.scrollbarBackgroundFill,
        backgroundFillOpacity: this.style.scrollbarBackgroundFillOpacity,
        handleBarFill: this.style.scrollbarHandleBarFill,
        handleBarOpacity: this.style.scrollbarHandleBarOpacity,
        handleOpacity: this.style.scrollbarHandleOpacity,
      }
    });

    this.rightPanel.add(this.scrollbar.initCanvasNode())

    this.playhead = new Playhead({
      style: {
        visible: this.style.playheadVisible,
        fill: this.style.playheadFill,
        lineWidth: this.style.playheadLineWidth,
        symbolHeight: this.style.playheadSymbolHeight,
        backgroundFill: this.style.playheadBackgroundFill,
        backgroundOpacity: this.style.playheadBackgroundOpacity,
        scrubberHeight: this.style.playheadScrubberHeight,
        playProgressFill: this.style.playheadPlayProgressFill,
        playProgressOpacity: this.style.playheadPlayProgressOpacity,
        bufferedFill: this.style.playheadBufferedFill,
        bufferedOpacity: this.style.playheadBufferedOpacity
      }
    }, this, this.videoController)
    this.playheadHover = new PlayheadHover({
      style: {
        visible: this.style.playheadHoverVisible,
        fill: this.style.playheadHoverFill,
        lineWidth: this.style.playheadHoverLineWidth,
        symbolHeight: this.style.playheadHoverSymbolHeight,
      }
    }, this);

    [this.playhead, this.playheadHover].forEach(component => {
      this.addToTimecodedSurfaceGroup(component.initCanvasNode())
    });

    this.headerTimecodeDisplay = new TimecodeDisplay({
      style: {
        x: 10,
        y: 10,
        visible: false
      }
    }, this.videoController);
    this.headerGroup.add(this.headerTimecodeDisplay.initCanvasNode())

    this.settleLayout();

    this.addToTimecodedSurfaceGroup(this.thumbnailHover.initCanvasNode())

    this.scrubberLane = new ScrubberLane({
      id: SCRUBBER_LANE_ID,
      description: ''
    }, this.videoController);

    this.addLanes([
      this.scrubberLane
    ])

    return this.stage;
  }

  protected afterCanvasNodeInit() {
    this.videoController.onVideoLoading$.pipe(filter(p => !!p), takeUntil(this.onDestroy$)).subscribe((event) => {
      this.clearContent();
    })

    this.videoController.onVideoLoaded$.pipe(filter(p => !!p), takeUntil(this.onDestroy$)).subscribe((event) => {
      this.onVideoLoadedEvent(event);
    })

    fromEvent(window, 'resize').pipe(takeUntil(this.onDestroy$)).subscribe((event: UIEvent) => {
      // setTimeout is needed because window resize event fires a bit late
      setTimeout(() => {
        this.onWindowResize(event);
      }, 200)

    })

    this.timecodedGroup.on('mouseenter', (event) => {
      this.playheadHover.toggleVisible(this.videoController.isVideoLoaded());
    })

    this.timecodedGroup.on('mouseleave', (event) => {
      this.playheadHover.toggleVisible(false);
    })

    this.timecodedGroup.on('mousemove', (event) => {
      if (!this.videoController.isVideoLoaded()) {
        return;
      }

      let x = this.timecodedGroup.getRelativePointerPosition().x;
      this.playheadHoverMove(x);
    })

    this.timecodedMarkersGroup.on('mousemove', (event) => {
      if (!this.videoController.isVideoLoaded()) {
        return;
      }

      let x = this.timecodedGroup.getRelativePointerPosition().x;
      this.playheadHoverMove(x);
    })

    /*this.timecodedGroup.on('wheel', (konvaEvent) => {
      if (!this.videoController.isVideoLoaded()) {
        return;
      }

      if (this.mouseWheelEnabled) {
        let event = konvaEvent.evt;
        event.preventDefault();

        let direction = event.deltaY > 0 ? ZoomDirection.IN : ZoomDirection.OUT;
        if (event.ctrlKey) {
          direction = direction === ZoomDirection.IN ? ZoomDirection.OUT : ZoomDirection.IN;
        }

        this.zoomStep(direction, this.timecodedGroup.getRelativePointerPosition().x);
        this.updateScrollWithPlayhead();
      }

      let x = this.timecodedGroup.getRelativePointerPosition().x;
      this.playheadHoverMove(x);
    })
*/
    this.timecodedGroup.on('dragstart dragmove dragend', (event) => {
      if (!this.videoController.isVideoLoaded()) {
        this.timecodedGroup.setAttrs({
          ...Constants.POSITION_TOP_LEFT
        })
        return;
      }

      if (event.target === this.timecodedGroup) {
        let newPosition = this.timecodedGroup.getPosition();
        this.timecodedGroup.setAttrs({
          x: this.getConstrainedTimelineX(newPosition.x),
          y: 0
        })

        this.onScroll$.next(this.createScrollEvent())

        this.scrollbar.updateScrollHandle(this);
      }
      this.updateScrollWithPlayhead();
    })

    this.timecodedGroup.on('dragmove', (event) => {
      WindowUtil.cursor('grabbing')
    })

    this.timecodedGroup.on('dragend', (event) => {
      WindowUtil.cursor('default')
    })

    this.scrubberLane.onMouseMove$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      if (!this.videoController.isVideoLoaded()) {
        return;
      }
      this.mouseWheelEnabled = true;
      let x = this.timecodedGroup.getRelativePointerPosition().x;
      let time = this.timelinePositionToTime(x);
      if (this._thumbnailVttFile) {
        let thumbnailVttCue = this._thumbnailVttFile.findCue(time);
        this.showThumbnailHover(thumbnailVttCue);
      }
    });

    this.scrubberLane.onMouseEnter$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.mouseWheelEnabled = true;
    });

    this.scrubberLane.onMouseLeave$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.hideThumbnailHover();
      this.mouseWheelEnabled = false;
    });

        this.timecodedBaseGroup.on('touchstart', () => {
            let x = this.timecodedGroup.getRelativePointerPosition().x;
            this.playheadHoverMove(x);
            this.playheadHover.toggleVisible(this.videoController.isVideoLoaded());
            if (this._thumbnailVttFile) {
                let time = this.timelinePositionToTime(x);
                let thumbnailVttCue = this._thumbnailVttFile.findCue(time);
                this.showThumbnailHover(thumbnailVttCue);
            }
        });

        this.timecodedGroup.on('touchcancel', () => {
            this.playheadHover.toggleVisible(false);
            if (this._thumbnailVttFile) {
                this.hideThumbnailHover();
            }
        });

        this.canvasNode.on('touchend', () => {
            this.playheadHover.toggleVisible(false);
            if (this._thumbnailVttFile) {
                this.hideThumbnailHover();
            }
        });

    this.scrubberLane.onClick$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      if (!this.videoController.isVideoLoaded()) {
        return;
      }

      this.updateScrollWithPlayhead();

      let x = this.timecodedGroup.getRelativePointerPosition().x;
      this.playheadHoverMove(x);
      if (this.videoController.isVideoLoaded()) {
        this.videoController.seekToTimestamp(this.timelinePositionToTime(x)).subscribe(() => {
        })
      }
    });

    this.scrollbar.onScroll$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      if (!this.videoController.isVideoLoaded()) {
        return;
      }

      this.setHorizontalScrollPercent(this.scrollbar.getScrollHandlePercent()) // we should not use timeline easing scrolling here

      this.updateScrollWithPlayhead();

      this.onScroll$.next(this.createScrollEvent())
    })

    this.scrollbar.onZoom$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      if (!this.videoController.isVideoLoaded()) {
        return;
      }

      this.zoomByPercent(event.zoomPercent, false);
      this.updateScrollWithPlayhead();
    })

    if (this.config.thumbnailVttFile) {
      this._thumbnailVttFile = this.config.thumbnailVttFile;
    } else if (this.config.thumbnailVttUrl) {
      this.loadThumbnailVttFile(this.config.thumbnailVttUrl).subscribe()
    }
  }

  private settleLayout() {
    this.stage.setAttrs({
      ...this.resolveStageDimension()
    })

    let heights = this.calculateHeights();

    this.headerGroup.setAttrs({
      width: this.width,
      height: this.style.headerHeight
    })

    this.bodyGroup.setAttrs({
      y: this.headerGroup.y() + this.headerGroup.height(),
      width: this.layoutGroup.width(),
      height: heights.bodyHeight
    });

    this.footerGroup.setAttrs({
      y: this.bodyGroup.y() + this.bodyGroup.height(),
      width: this.width,
      height: this.style.footerHeight
    })

    this.layoutGroup.setAttrs({
      width: this.width,
      height: heights.layoutHeight
    })

    this.layoutBackground.setAttrs({
      ...this.layoutGroup.getSize()
    });

    this.headerBackground.setAttrs({
      ...this.headerGroup.getSize()
    });

    this.footerBackground.setAttrs({
      ...this.footerGroup.getSize()
    });

    [this.bodyContentGroup].forEach(node => {
      node.setAttrs({
        ...this.bodyGroup.getSize()
      })
    });

    [this.leftPanel, this.rightPanel].forEach(node => {
      node.setAttrs({
        height: this.bodyGroup.getSize().height
      })
    });

    this.leftPanel.setAttrs({
      width: this.leftPanelVisible ? this.style.leftPanelWidth : 0,
      visible: this.leftPanelVisible
    });

    this.rightPanel.setAttrs({
      x: this.leftPanel.x() + this.leftPanel.width() + this.style.rightPanelLeftGutterWidth,
      width: this.layoutGroup.width() - (this.leftPanel.width() + this.style.rightPanelLeftGutterWidth + this.style.rightPanelRightGutterWidth)
    });

    [this.timecodedContainer, this.timecodedGroup, ...this.timecodedGroupNodes].forEach(node => {
      node.setAttrs({
        ...this.rightPanel.getSize()
      })
    });

    this.timecodedContainer.clipFunc((ctx) => {
      ctx.rect(-this.style.timecodedContainerClipPadding, -500, this.timecodedContainer.width() + 2 * this.style.timecodedContainerClipPadding, this.timecodedContainer.height() + 500)
      // ctx.rect(0, -500, this.timecodedContainer.width() , this.timecodedContainer.height() + 500)
    })

    this.timecodedThumbnailsGroup.clipFunc((ctx) => {
      ctx.rect(0, 0, this.timecodedThumbnailsGroup.width(), this.timecodedThumbnailsGroup.height())
    })

    this.scrollbar.setPosition({
      ...this.scrollbar.getPosition(),
      y: this.leftPanel.getSize().height
    })
    this.scrollbar.setWidth(this.timecodedContainer.width());
    this.scrollbar.updateScrollHandle(this);

    this.maxTimecodedGroupWidth = this.calculateWidthFromZoomRatioPercent(this.zoomMax);

    this.playheadHover.style = {
      height: this.timecodedContainer.height()
    }

    this.timelineLanes.forEach(timelineLane => {
      timelineLane.onMeasurementsChange();
    })
    this.playhead.onMeasurementsChange();
  }

  onMeasurementsChange() {
    this.settleLayout();

    let timecodedGroupDimension = this.getTimecodedGroupDimension();

    this.timelineLanes.forEach(timelineLane => {
      timelineLane.onMeasurementsChange()
    });

    this.zoomByWidth(timecodedGroupDimension.width, this.resolveZoomFocus());

    // scrollbar
    this.scrollbar.updateScrollHandle(this);
  }

  private onWindowResize(event: UIEvent) {
    let dimensions = this.resolveStageDimension();
    this.width = dimensions.width;
    this.onMeasurementsChange();
  }

  private calculateHeights(): {
    bodyHeight: number,
    layoutHeight: number
  } {
    let timelineLanesHeight = this.getLanes()
      .map(p => p.getDimension().height)
      .reduce((acc, current) => acc + current, 0);

    let bodyHeight = timelineLanesHeight;

    return {
      bodyHeight: bodyHeight,
      layoutHeight: this.style.headerHeight + bodyHeight + this.style.footerHeight
    }
  }

  private resolveStageDimension(): Dimension {
    let divElementRect = this.getTimelineHTMLElementRect();
    let heights = this.calculateHeights();
    return {
      width: divElementRect.width >= this.style.stageMinWidth ? divElementRect.width : this.style.stageMinWidth,
      height: heights.layoutHeight
    }
  }

  private getTimelineHTMLElementRect(): RectMeasurement {
    return {
      x: this.timelineHTMLElement.offsetLeft,
      y: this.timelineHTMLElement.offsetTop,
      width: this.timelineHTMLElement.offsetWidth,
      height: this.timelineHTMLElement.offsetHeight
    }
  }


  private showThumbnailHover(thumbnailVttCue: ThumbnailVttCue) {
    if (thumbnailVttCue) {
      this.thumbnailHover.setVisible(true);
      if (this.thumbnailHover.getThumbnailVttCue() === thumbnailVttCue) {
        this.thumbnailHover.setThumbnailVttCue(thumbnailVttCue);
        let position = this.resolveThumbnailPosition(this.thumbnailHover);
        this.thumbnailHover.setPosition(position)
        this.thumbnailHover.getCanvasNode().moveToTop();
      } else {
        ImageUtil.createKonvaImageSizedByWidth(thumbnailVttCue.url, this.style.thumbnailHoverWidth).subscribe(image => {
          this.thumbnailHover.setThumbnailVttCue(thumbnailVttCue);
          this.thumbnailHover.setDimension(image.getSize());
          this.thumbnailHover.setImage(image);
          this.thumbnailHover.setPosition(this.resolveThumbnailPosition(this.thumbnailHover))
          this.thumbnailHover.getCanvasNode().moveToTop();
        })
      }
    }
  }

  private hideThumbnailHover() {
    if (this.thumbnailHover) {
      this.thumbnailHover.setVisible(false);
    }
  }

  private resolveThumbnailPosition(thumbnail: Thumbnail): Position {
    let pointerPosition = this.timecodedGroup.getRelativePointerPosition();
    let timecodedGroupDimension = this.getTimecodedGroupDimension();
    let imageSize = thumbnail.getImage().getSize();
    let x = pointerPosition.x - imageSize.width / 2; // center thumbnail
    let halfStroke = thumbnail.style.strokeWidth > 0 ? thumbnail.style.strokeWidth / 2 : 0;
    let xWithStroke = x - halfStroke;
    x = xWithStroke < 0 ? halfStroke : (x + imageSize.width + halfStroke) > timecodedGroupDimension.width ? (timecodedGroupDimension.width - imageSize.width - halfStroke) : x;
    let scrubberLaneRect = this.scrubberLane.getRect();
    return {
      x: x,
      y: scrubberLaneRect.y + scrubberLaneRect.height + thumbnail.style.strokeWidth / 2 + this.style.thumbnailHoverYOffset
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
      let maxScroll = new Decimal(this.getTimecodedContainerDimension().width - this.getTimecodedGroupDimension().width).abs();
      let scrollPercent = new Decimal(this.getTimecodedGroupPosition().x).abs().mul(100).div(maxScroll).toNumber();
      return scrollPercent;
    }
  }

  setHorizontalScrollPercent(percent: number) {
    this.setTimelinePosition(this.calculateTimelineXFromScrollPercent(percent));
  }

  getScrollHandleHorizontalMeasurement(scrollbarWidth: number): HorizontalMeasurement {
    let timelineWidth = this.getTimecodedGroupDimension().width;
    let timelineX = this.getTimecodedGroupPosition().x;

    let measurement: HorizontalMeasurement;

    if (timelineWidth <= scrollbarWidth) {
      measurement = {
        width: scrollbarWidth,
        x: 0
      }
    } else {
      let scrollHandleWidthDecimal = new Decimal(scrollbarWidth).mul(scrollbarWidth).div(timelineWidth).round();
      measurement = {
        width: scrollHandleWidthDecimal.toNumber(),
        x: new Decimal(timelineX).abs().mul(scrollbarWidth).div(timelineWidth).toNumber()
      }
    }

    return measurement;
  }

  scrollTo(percent: number): Observable<number> {
    percent = z.coerce.number()
      .min(0)
      .max(100)
      .parse(percent);

    return this.scrollToPercentEased(percent);
  }

  scrollToPlayhead(): Observable<number> {
    let newTimelineX = -this.playhead.getPlayheadPosition() + this.getTimecodedContainerDimension().width / 2;
    return this.scrollToEased(newTimelineX);
  }

  private scrollToPercent(percent: number) {
    let newX = this.calculateTimelineXFromScrollPercent(percent);
    this.scrollTimeline(newX)
  }

  private scrollToPercentEased(percent: number): Observable<number> {
    let newTimelineX = this.calculateTimelineXFromScrollPercent(percent);
    return this.scrollToEased(newTimelineX);
  }

  private scrollToEased(newTimelineX: number): Observable<number> {
    return new Observable<number>(o$ => {
      let currentTimelineX = this.getTimecodedGroupPosition().x;
      animate({
        layer: this.timecodedGroup.getLayer(),
        duration: Constants.TIMELINE_SCROLL_EASED_DURATION_MS,
        from: currentTimelineX,
        to: newTimelineX,
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
    return this.isInVisiblePositionRange(this.playhead.getPlayheadPosition());
  }

  private updateScrollWithPlayhead() {
    let playheadPosition = this.playhead.getPlayheadPosition();
    let isInBeforeTimecodedView = playheadPosition < this.getVisiblePositionRange().start;
    let isInVisiblePositionRange = this.isInVisiblePositionRange(playheadPosition);
    this.scrollWithPlayhead = isInVisiblePositionRange && !isInBeforeTimecodedView; // we scroll with playhead only if playhed slips to right of timecoded view
  }

  /***
   * Scrolls timecoded group so that playhead is at left most position
   * @private
   */
  private syncTimelineWithPlayhead(): Observable<number> {
    return new Observable<number>(o$ => {
      this.scrollToEased(-this.playhead.getPlayheadPosition()).pipe(map(result => {
        o$.next(this.getHorizontalScrollPercent());
        o$.complete();
      })).subscribe()
    })
  }

  private setTimelinePosition(x: number) {
    let newX = this.getConstrainedTimelineX(x);
    this.timecodedGroup.x(newX);
  }

  private scrollTimeline(x: number) {
    let currentX = this.getTimecodedGroupPosition().x;
    this.setTimelinePosition(x);
    let newX = this.getTimecodedGroupPosition().x
    if (newX !== currentX) {
      this.scrollbar.updateScrollHandle(this);
      this.setHorizontalScrollPercent(this.scrollbar.getScrollHandlePercent()) // we should not use timeline easing scrolling here
      this.onScroll$.next(this.createScrollEvent())
    }
  }

  private calculateTimelineXFromScrollPercent(percent: number): number {
    percent = this.getConstrainedScrollPercent(percent);

    let timecodedGroupDimension = this.getTimecodedGroupDimension();
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
    let timecodedGroupDimension = this.getTimecodedGroupDimension();
    let containerDimension = this.getTimecodedContainerDimension();

    if (timecodedGroupDimension.width > containerDimension.width) {
      return new Decimal(timecodedGroupDimension.width).mul(100).div(containerDimension.width).round().toNumber();
    } else {
      return this.zoomBaseline;
    }
  }

  zoomTo(percent: number): Observable<number> {
    percent = z.coerce.number()
      .min(this.getZoomBaseline())
      .max(this.getZoomMax())
      .parse(percent);

    return this.zoomToEased(percent);
  }

  zoomIn(): Observable<number> {
    return new Observable<number>(o$ => {
      this.zoomStep(ZoomDirection.IN, this.resolveZoomFocus());
      o$.next(this.getZoomPercent());
      o$.complete();
    })
  }

  zoomOut(): Observable<number> {
    return new Observable<number>(o$ => {
      this.zoomStep(ZoomDirection.OUT, this.resolveZoomFocus());
      o$.next(this.getZoomPercent());
      o$.complete();
    })
  }

  zoomToMax(): Observable<number> {
    return this.zoomTo(this.zoomMax);
  }

  private zoomToEased(percent: number): Observable<number> {
    return new Observable<number>(o$ => {
      percent = this.getConstrainedZoomPercent(percent);
      let currentWidth = this.getTimecodedGroupDimension().width;
      let newWidth = this.calculateWidthFromZoomRatioPercent(percent);
      animate({
        layer: this.timecodedGroup.getLayer(),
        duration: Constants.TIMELINE_ZOOM_EASED_DURATION_MS,
        from: currentWidth,
        to: newWidth,
        onUpdateHandler: (frame, value) => {
          this.zoomByWidth(value, this.resolveZoomFocus());
        },
        onCompleteHandler: (frame, value) => {
          o$.next(this.getZoomPercent());
          o$.complete();
        }
      })
    })
  }

  private zoomStep(direction: ZoomDirection, zoomFocus: number) {
    let currentWidthDecimal = new Decimal(this.getTimecodedGroupDimension().width);
    let newWidth = (direction === ZoomDirection.IN ? currentWidthDecimal.mul(this.zoomScale) : currentWidthDecimal.div(this.zoomScale)).round().toNumber();
    this.zoomByWidth(newWidth, zoomFocus);
  }

  private zoomByPercent(percent: number, updateScrollbar = true): number {
    percent = this.getConstrainedZoomPercent(percent);
    let newWidth = this.calculateWidthFromZoomRatioPercent(percent);
    this.zoomByWidth(newWidth, this.resolveZoomFocus(), updateScrollbar);
    return this.getZoomPercent();
  }

  private zoomByWidth(newWidth: number, zoomFocus: number, updateScrollbar = true) {
    let currentX = this.getTimecodedGroupPosition().x;
    let currentWidth = this.getTimecodedGroupDimension().width;

    newWidth = this.getConstrainedWidth(newWidth);
    let newX = this.calculateNewPosition(newWidth, zoomFocus);

    this.hideThumbnailHover();
    this.timecodedGroup.setAttrs({
      width: newWidth,
      x: newX
    })

    this.timecodedGroupNodes.forEach(node => {
      node.width(newWidth);
    })

    let timecodedGroupDimension = this.getTimecodedGroupDimension();
    if (timecodedGroupDimension.width !== currentWidth || this.getTimecodedGroupPosition().x !== currentX) {
      // scrollbar
      if (updateScrollbar) {
        this.scrollbar.updateScrollHandle(this);
      } else {
        // zoom action is most likely coming from scrollbar itself
        this.playheadHover.toggleVisible(false)
      }
      // scroll
      this.setHorizontalScrollPercent(this.scrollbar.getScrollHandlePercent()) // we should not use timeline easing scrolling here

      this.onZoom$.next(this.createZoomEvent())
      this.onScroll$.next(this.createScrollEvent())
    }
  }

  /***
   * Move group proportionally to reposition focus
   *
   * @param newWidth
   * @param repositionFocus
   * @private
   */
  private calculateNewPosition(newWidth: number, repositionFocus: number = 0): number {
    let currentX = this.getTimecodedGroupPosition().x;
    let currentWidth = this.getTimecodedGroupDimension().width;
    let containerRect = this.getTimecodedContainerRect();

    let zoomDirection = newWidth > currentWidth ? ZoomDirection.IN : ZoomDirection.OUT;

    // move group proportionally to zoom focus
    let newX = currentX;

    // snap start or end if needed
    if (newWidth === containerRect.width) {
      newX = 0; // snap start
    } else if (newWidth > containerRect.width) {
      if (repositionFocus > 0) {
        let zoomFocusRationDecimal = new Decimal(repositionFocus).div(currentWidth);
        if (zoomFocusRationDecimal.greaterThanOrEqualTo(0) && zoomFocusRationDecimal.lessThanOrEqualTo(1)) {
          let totalDelta = newWidth - currentWidth;
          let leftSideDelta = zoomFocusRationDecimal.mul(totalDelta).abs().round().toNumber();
          let x = currentX + leftSideDelta * (zoomDirection === ZoomDirection.IN ? -1 : 1)
          newX = x < 0 ? x : 0;
        }
      }

      if (newWidth > containerRect.width) {
        let containerX2 = containerRect.x + containerRect.width;
        let newX2 = newX + newWidth;
        if (newX2 <= containerX2) { // snap end
          newX = containerRect.width - newWidth; // snap end
        }
      }
    }

    return newX;
  }

  private resolveZoomFocus(): number {
    if (this.videoController.isVideoLoaded()) {
      return this.resolvePlayheadSyncPosition();
    } else {
      return this.isSnappedStart() ? 0 : this.isSnappedEnd() ? this.getTimecodedGroupDimension().width : this.getTimecodedGroupDimension().width / 2;
    }
  }

  private calculateWidthFromZoomRatioPercent(zoomRatioPercent): number {
    return new Decimal(this.getTimecodedContainerDimension().width).mul(zoomRatioPercent).div(100).round().toNumber();
  }

  private getConstrainedWidth(newWidth: number): number {
    let containerDimension = this.getTimecodedContainerDimension();
    return newWidth >= containerDimension.width ? newWidth <= this.maxTimecodedGroupWidth ? newWidth : this.maxTimecodedGroupWidth : containerDimension.width;
  }

  private getConstrainedZoomPercent(percent: number): number {
    return percent < this.zoomBaseline ? this.zoomBaseline : percent > this.zoomMax ? this.zoomMax : percent;
  }

  private getConstrainedScrollPercent(scrollPercent: number): number {
    return scrollPercent < 0 ? 0 : scrollPercent > 100 ? 100 : scrollPercent;
  }

  // endregion

  // region playhead

  private playheadHoverMove(x: number) {
    if (this.videoController.isVideoLoaded() && this.playheadHover) {
      let isSnapped = false;

      if (!this.videoController.isPlaying()) {
        // check if we need to snap playheadHover to playhead
        let playheadPosition = this.resolvePlayheadSyncPosition();
        if (x > (playheadPosition - this.playheadHoverSnapArea) && x < (playheadPosition + this.playheadHoverSnapArea)) {
          x = playheadPosition;
          isSnapped = true;
        }
      }

      this.playheadHover.sync(x, isSnapped);
    }
  }

  private resolvePlayheadSyncPosition(): number {
    return this.timeToTimelinePosition(this.videoController.getCurrentTime());
  }

  // endregion

  // region video

  private onVideoLoadedEvent(event: VideoLoadedEvent) {
    this.fireVideoEventBreaker();

    // if video was loaded previously, remove all content associated with it
    this.clearContent();

    this.syncVideoMetadata();

    this.videoController.onVideoTimeChange$.pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.syncVideoMetadata();
    })

    this.videoController.onPlay$.pipe(takeUntil(this.videoEventBreaker$)).subscribe((event) => {
      this.updateScrollWithPlayhead();
    })
  }

  private fireVideoEventBreaker() {
    nextCompleteVoidSubject(this.videoEventBreaker$);
    this.videoEventBreaker$ = new Subject<void>();
  }

  getThumbnailVttFile(): ThumbnailVttFile {
    return this._thumbnailVttFile;
  }

  private syncVideoMetadata() {
    // follows playhead and scrolls playhead to left if playhead moves out of view
    if (this.scrollWithPlayhead && !this.isPlayheadInTimecodedView() && !this.syncTimelineWithPlayheadInProgress) {
      this.syncTimelineWithPlayheadInProgress = true;
      this.syncTimelineWithPlayhead().subscribe(result => {
        this.syncTimelineWithPlayheadInProgress = false;
      })
    }
  }

  // endregion

  // region API
  addLane(timelaneLane: GenericTimelaneLane): void {
    if (this.timelineLanesMap.has(timelaneLane.getId())) {
      throw new Error(`TimelineLane with id=${timelaneLane.getId()} already exist`)
    }

    let isFirstLane = this.timelineLanes.length < 1;
    let position: Position = {
      ...Constants.POSITION_TOP_LEFT
    }

    if (!isFirstLane) {
      position.y = this.timelineLanes
        .map(p => p.getRect().height)
        .reduce((partialSum, height) => partialSum + height, 0);
    }

    timelaneLane.setTimeline(this);
    timelaneLane.setVideoController(this.videoController);

    timelaneLane.setTimelinePosition(position)
    timelaneLane.initCanvasNode();

    this.timelineLanes.push(timelaneLane);
    this.timelineLanesMap.set(timelaneLane.getId(), timelaneLane);

    this.bodyContentGroup.add(timelaneLane.getCanvasNode());

    this.settleLayout();
  }

  removeLane(id: string) {
    if (!this.timelineLanesMap.has(id)) {
      throw new Error(`TimelineLane with id=${id} doesn't exist`)
    }

    let timelineLane = this.timelineLanesMap.get(id);

    this.timelineLanes.splice(this.timelineLanes.findIndex(p => p.getId() === id), 1);
    this.timelineLanesMap.delete(id);
    timelineLane.clearContent();
    timelineLane.destroy();

    // reposition
    let position: Position = {
      ...Constants.POSITION_TOP_LEFT
    }

    this.timelineLanes.forEach(timelineLane => {
      timelineLane.setTimelinePosition({
        ...position
      })
      position.y = position.y + timelineLane.getRect().height;
    })

    this.timelineLanes.forEach(timelineLane => {
      timelineLane.onMeasurementsChange()
    })

    this.settleLayout();
  }

  getScrollbar(): Scrollbar {
    return this.scrollbar;
  }

  addLanes(timelaneLanes: GenericTimelaneLane[]): void {
    timelaneLanes.forEach(p => this.addLane(p));
  }

  getLanes(): GenericTimelaneLane[] {
    return [...this.timelineLanesMap.values()];
  }

  getLane(id: string): GenericTimelaneLane {
    return this.timelineLanesMap.get(id);
  }

  getScrubberLane(): ScrubberLane {
    return this.getLane(SCRUBBER_LANE_ID) as ScrubberLane;
  }

  getMarkerLane(id: string): MarkerLane {
    let lane = this.getLane(id);
    return lane instanceof MarkerLane ? lane : void 0;
  }

  getThumbnailLane(id: string): ThumbnailLane {
    let lane = this.getLane(id);
    return lane instanceof ThumbnailLane ? lane : void 0;
  }

  getSubtitlesLane(id: string): SubtitlesLane {
    let lane = this.getLane(id);
    return lane instanceof SubtitlesLane ? lane : void 0;
  }

  getAudioTrackLane(id: string): AudioTrackLane {
    let lane = this.getLane(id);
    return lane instanceof AudioTrackLane ? lane : void 0;
  }

  createMarkerLane(config: MarkerLaneConfig): MarkerLane {
    let lane = new MarkerLane(config);
    this.addLane(lane);
    return lane;
  }

  createThumbnailLane(config: ThumbnailLaneConfig): ThumbnailLane {
    let lane = new ThumbnailLane(config);
    this.addLane(lane);
    return lane;
  }

  createSubtitlesLane(config: SubtitlesLaneConfig): SubtitlesLane {
    let lane = new SubtitlesLane(config);
    this.addLane(lane);
    return lane;
  }

  // endregion

  isTimelineReady(): boolean {
    return this.videoController.isVideoLoaded();
  }

  addToTimecodedBaseGroup(node: Konva.Group | Konva.Shape) {
    this.timecodedBaseGroup.add(node);
  }

  addToTimecodedSurfaceGroup(node: Konva.Group | Konva.Shape) {
    this.timecodedSurfaceGroup.add(node);
  }

  addToTimecodedMarkersGroup(node: Konva.Group | Konva.Shape) {
    this.timecodedMarkersGroup.add(node);
  }

  addToTimecodedThumbnailsGroup(node: Konva.Group | Konva.Shape) {
    this.timecodedThumbnailsGroup.add(node);
  }

  addToTimecodedSubtitlesGroup(node: Konva.Group | Konva.Shape) {
    this.timecodedSubtitlesGroup.add(node);
  }

  addToTimecodedAudioGroup(node: Konva.Group | Konva.Shape) {
    this.timecodedAudioGroup.add(node);
  }

  addToTimecodedChartGroup(node: Konva.Group | Konva.Shape) {
    this.timecodedChartGroup.add(node);
  }

  constrainTimelinePosition(x: number): number {
    let timecodedGroupDimension = this.getTimecodedGroupDimension();
    return x < 0 ? 0 : x > timecodedGroupDimension.width ? timecodedGroupDimension.width : x;
  }

  timelinePositionToTime(xOnTimeline: number): number {
    let constrainedX = this.constrainTimelinePosition(xOnTimeline);
    return this.videoController.isVideoLoaded() ? new Decimal(constrainedX).mul(this.videoController.getDuration()).div(this.getTimecodedGroupDimension().width).toNumber() : 0;
  }

  timelinePositionToTimeRelativeToTimecoded(xOnTimeline: number): number {
    return this.timelinePositionToTime(Math.abs(this.getTimecodedGroupHorizontalMeasurement().x) + xOnTimeline);
  }

  timelinePositionToTimeFormatted(x: number): string {
    return this.videoController.isVideoLoaded() ? this.videoController.formatTimestamp(this.timelinePositionToTime(x)) : '';
  }

  timelinePositionToFrame(x: number): number {
    return this.videoController.isVideoLoaded() ? this.videoController.calculateTimeToFrame(this.timelinePositionToTime(x)) : 0;
  }

  timeToTimelinePosition(time: number): number {
    return new Decimal(time).mul(this.getTimecodedGroupDimension().width).div(this.videoController.getDuration()).toNumber();
  }

  private getConstrainedTimelineX(x: number): number {
    let timecodedGroupDimension = this.getTimecodedGroupDimension();
    let containerDimension = this.getTimecodedContainerDimension();
    if (timecodedGroupDimension.width <= containerDimension.width) {
      return 0;
    } else {
      let minX = containerDimension.width - timecodedGroupDimension.width;
      return x < minX ? minX : x > 0 ? 0 : x;
    }
  }

  getBodyGroupRect(): RectMeasurement {
    return {
      ...this.bodyGroup.getPosition(),
      ...this.bodyGroup.getSize()
    };
  }

  getLeftPanelRect(): RectMeasurement {
    return {
      ...this.leftPanel.getPosition(),
      ...this.leftPanel.getSize()
    };
  }

  getLeftPanelVisible(): boolean {
    return this.leftPanelVisible;
  }

  getRightPanelRect(): RectMeasurement {
    return {
      ...this.rightPanel.getSize(),
      ...this.rightPanel.getPosition()
    };
  }

  getTimecodedContainerDimension(): Dimension {
    return this.timecodedContainer.getSize()
  }

  getTimecodedContainerPosition(): Position {
    return this.timecodedContainer.getPosition()
  }

  getTimecodedContainerRect(): RectMeasurement {
    return {
      ...this.getTimecodedContainerDimension(),
      ...this.getTimecodedContainerPosition()
    }
  }

  getTimecodedGroupDimension(): Dimension {
    return this.timecodedGroup.getSize()
  }

  getTimecodedGroupPosition(): Position {
    return this.timecodedGroup.getPosition()
  }

  getTimecodedGroupRect(): RectMeasurement {
    return {
      ...this.timecodedGroup.getPosition(),
      ...this.timecodedGroup.getSize()
    };
  }

  getTimecodedGroupHorizontalMeasurement(): HorizontalMeasurement {
    return {
      x: this.timecodedGroup.x(),
      width: this.timecodedGroup.width()
    }
  }

  getRelativePointerPosition(): Position {
    return this.timecodedGroup.getRelativePointerPosition();
  }

  getLayoutGroupDimension(): Dimension {
    return this.layoutGroup.getSize();
  }

  getLayoutGroupPosition(): Position {
    return this.layoutGroup.getPosition();
  }

  getRect(): RectMeasurement {
    return {
      ...this.getLayoutGroupDimension(),
      ...this.getLayoutGroupPosition()
    }
  }

  getVisiblePositionRange(): { start: number, end: number } {
    let start = Math.abs(this.timecodedGroup.x());
    let end = start + this.timecodedContainer.width();
    return {start, end};
  }

  isInVisiblePositionRange(x: number): boolean {
    let visiblePosition = this.getVisiblePositionRange();
    return x >= visiblePosition.start && x <= visiblePosition.end;
  }

  isSnappedStart(): boolean {
    return this.getTimecodedGroupPosition().x === 0;
  }

  isSnappedEnd(): boolean {
    return (this.getTimecodedContainerDimension().width - this.getTimecodedGroupDimension().width) === this.getTimecodedGroupPosition().x;
  }

  getVisibleTimeRange(): { start: number, end: number } {
    let positionRange = this.getVisiblePositionRange();
    let start = this.timelinePositionToTime(positionRange.start);
    let end = this.timelinePositionToTime(positionRange.end);
    return {start, end}
  }

  private getZoomBaseline(): number {
    return this.zoomBaseline;
  }

  private getZoomMax(): number {
    return this.zoomMax;
  }

  private loadThumbnailVttFile(thumbnailVttUrl: string): Observable<boolean> {
    return ThumbnailVttFile.create(thumbnailVttUrl, this._axiosConfig).pipe(map(thumbnailVttFile => {
      this._thumbnailVttUrl = thumbnailVttUrl;
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

  toggleLeftPanelVisible(visible: boolean) {
    this.leftPanelVisible = visible;
    this.leftPanel.visible(visible);
    this.settleLayout();
    this.timelineLanes.forEach(timelineLane => {
      timelineLane.onMeasurementsChange();
    })
    this.headerTimecodeDisplay.setVisible(!visible);
  }

  clearContent() {
    this._thumbnailVttFile = void 0;
    this.timelineLanes.forEach(timelineLane => {
      timelineLane.clearContent();
    })
    this.zoomByPercent(this.zoomBaseline);
  }

  destroy() {
    nextCompleteVoidSubjects(this.videoEventBreaker$);

    let subjects = [this.onScroll$, this.onZoom$];
    completeSubjects(...subjects)
    unsubscribeSubjects(...subjects);

    DestroyUtil.destroy(this.scrollbar, this.playheadHover, this.playhead, ...this.timelineLanes, this.thumbnailHover, this.headerTimecodeDisplay);

    this.timelineHTMLElement = void 0;
    this.videoController = void 0;
    this._thumbnailVttFile = void 0;

    super.destroy();
  }

}
