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

import {debounceTime, filter, fromEvent, map, merge, Observable, sampleTime, Subject, take, takeUntil} from 'rxjs';
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
import {type FlexNode, FlexSpacingBuilder, type FlexSpacing} from './layout/flex-node';
import {ObserverBreaker} from '../common/observer-breaker';
import type {MediaElementPlaybackState} from '../common/media-element-playback';
import {type PlayerApi, PlayerEventType, type PlayerLiveState} from '../player';
import {AuthConfig, MediaTemporalFormat} from '../common';
import Decimal from 'decimal.js';
import {animate} from './animation-util';
import {type OmakaseTimeEdit} from './time';
import {Playhead, type PlayheadStyle} from './playhead';
import {PlayheadBuffer, type PlayheadBufferStyle} from './playhead-buffer';
import {LiveEdgeOverlay, type LiveEdgeOverlayStyle} from './live/live-edge-overlay';
import {EvictedRegionOverlay, type EvictedRegionOverlayStyle} from './live/evicted-region-overlay';
import {Scrubber, type ScrubberStyle} from './scrubber/scrubber';
import {TimelineSlotVerticalScrollAdapter, VerticalScrollbar, VerticalScrollbarEventType, type VerticalScrollbarStyle} from './scrollbar/vertical-scrollbar';
import {MeasurementUtil} from './measurement-util';
import {WindowUtil} from '../util/window-util';
import {z} from 'zod';
import {ScrubberLane} from './scrubber';
import type {TimelineLaneApi} from './timeline-lane-api';
import {BaseTimelineLane} from './timeline-lane';
import {LiveMode, type Thumbnail, ThumbnailTrack} from '../media';
import {TrackRepository} from '../repository';
import {ThumbnailImg} from './thumbnail/thumbnail-img';
import {ImageUtil} from './konva/image-util';
import {affectsStyledElement, type StyledElement, Ui} from '../ui';
import {type OmpProvider} from '../omp-provider';
import type {KonvaEventObject} from 'konva/lib/Node';
import {TimelineSlot} from './timeline-slot';
import {TimelineSlotType} from './timeline-slot-type';
import {type TimelineSlotApi, type TimelineSlotEvent, TimelineSlotEventType} from './timeline-slot-api';
import type {VerticalScrollApi, VerticalScrollEvent, VerticalScrollOptions} from './vertical-scroll';
import {NoopVerticalScrollAdapter, VerticalScrollAdapter} from './vertical-scroll';
import {isNullOrUndefined} from '../util/util-functions';
import {PLAYER_CONTROLLER_DEFAULTS} from '../constants';

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

/** Implements TimelineSlotApi */
class TimelineSlotImpl implements TimelineSlotApi {
  constructor(
    private readonly _slot: TimelineSlot,
    private readonly _timeline: TimelineImpl,
    private readonly _scroll: VerticalScrollApi
  ) {}

  get type(): TimelineSlotType {
    return this._slot.type;
  }

  get scroll(): VerticalScrollApi {
    return this._scroll;
  }

  addTimelineLane(lane: TimelineLaneApi, index?: number): TimelineLaneApi {
    return this._timeline.addTimelineLane(lane, {index, slot: this._slot.type});
  }

  removeTimelineLane(id: string): void {
    this._timeline.removeTimelineLane(id);
  }

  getTimelineLanes(): TimelineLaneApi[] {
    return this._slot.lanes.slice();
  }

  getEffectiveHeight(): number {
    return this._slot.getEffectiveHeight();
  }

  getContentHeight(): number {
    return this._slot.getAdaptiveHeight();
  }

  get onEvent$(): Observable<TimelineSlotEvent> {
    return merge(
      this._slot.onResize$.pipe(map((): TimelineSlotEvent => ({type: TimelineSlotEventType.TIMELINE_SLOT_RESIZE, data: {}}))),
      this._scroll.onScroll$.pipe(map((event): TimelineSlotEvent => ({type: TimelineSlotEventType.TIMELINE_SLOT_SCROLL, data: event})))
    );
  }

  setVerticalScrollbarVisible(visible: boolean): void {
    this._timeline.setSlotVerticalScrollbarVisible(this._slot.type, visible);
  }

  scrollToLane(laneId: TimelineLaneApi['id'], options?: VerticalScrollOptions): Observable<number> {
    const lane = this._slot.lanes.find((l) => l.id === laneId);
    if (!lane) {
      console.debug(`TimelineLane with id=${laneId} doesn't exist`);
      return passiveObservable((observer) => nextCompleteObserver(observer, this._scroll.scrollPercent));
    }

    const targetPx = lane.mainRightFlexGroup.getLayout().top;
    const range = this._slot.getScrollRange();
    const targetPercent = range > 0 ? (targetPx / range) * 100 : 0;

    return this._scroll.scrollTo(targetPercent, options);
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
  private _style: TimelineStyle;

  private readonly _ready: boolean = false;

  private readonly _player: PlayerApi;

  protected _dragBreaker = new ObserverBreaker();
  protected _dragConditions?: DragConditions;

  // region HTML DOM
  private _rootElement!: HTMLElement;
  private _canvasElement!: HTMLDivElement;
  private _timelineOverlayElement!: HTMLDivElement;
  private _timecodeElement!: HTMLDivElement;
  private _timecodeEdit: OmakaseTimeEdit | undefined;
  // endregion

  // region slots
  private _headerSlot!: TimelineSlot;
  private _mainSlot!: TimelineSlot;
  private _footerSlot!: TimelineSlot;
  // endregion

  // region slot APIs
  private _headerSlotApi!: TimelineSlotImpl;
  private _mainSlotApi!: TimelineSlotImpl;
  private _footerSlotApi!: TimelineSlotImpl;
  private _mainVScrollAdapter?: VerticalScrollAdapter;
  // endregion

  // region lane tracking
  /** All lanes across all slots, keyed by lane id. */
  private _allLanesMap = new Map<string, TimelineLaneApi>();
  /** Tracks which slot each lane belongs to. */
  private _laneSlotMap = new Map<string, TimelineSlot>();
  /** Set during prepareForTimeline so content-routing calls go to the right slot. */
  private _preparingToSlot: TimelineSlot | undefined;
  // endregion

  // region konva
  private _konvaStage!: Konva.Stage;
  private _mainLayer!: Konva.Layer;
  private _surfaceLayer!: Konva.Layer;

  // Spanning container/floating pair for Playhead, Scrubber, and ThumbnailHover.
  // Mirrors the per-slot container/floating pattern so the same right-pane clip
  // applies across all three slots at full stage height.
  private _spanningContainer!: Konva.Group;
  private _spanningFloatingGroup!: Konva.Group;
  // endregion

  // region bg
  private _layoutBg!: Konva.Rect;
  // endregion

  // region flex groups
  private _layoutFlexGroup!: KonvaFlexGroup;
  // endregion

  // region component declarations
  private _scrubber!: Scrubber;
  private _playhead!: Playhead;
  private _playheadBuffer!: PlayheadBuffer;
  private _scrubberLane!: ScrubberLane;
  private _verticalScrollbar!: VerticalScrollbar;
  private _verticalScrollAdapter!: TimelineSlotVerticalScrollAdapter;
  // endregion

  private _scrollWithPlayhead = true;
  private _syncTimelineWithPlayheadInProgress = false;

  private _descriptionPaneVisible = true;

  /** Duration as of the last time it was processed — used to detect and scale for growth. */
  private _lastKnownDuration?: number | undefined;

  // region live
  private _isLive = false;
  private _liveState: PlayerLiveState | undefined;
  /** Right edge of the live coordinate domain (media-element-absolute time), including any reserved locked region. */
  private _liveExtentEnd = 0;
  /**
   * Left edge of the live coordinate domain (media-element-absolute time) that {@link
   * resolveTimeDomain} actually renders. Together with {@link _liveExtentEnd} it forms the
   * coordinate domain — both are only ever mutated together, inside {@link reconcileLiveGeometry}
   * (or {@link evictLiveHistory}), at the exact moment a reflow (Konva width/x change) commits.
   * Normally tracks the true `liveStartTime` exactly, one reflow behind — see {@link
   * TimelineConfig.liveHistoryRetention} for the case where it deliberately trails the true live
   * start by up to a configured number of seconds at all times, rather than tracking it exactly.
   */
  private _liveDisplayOrigin = 0;
  /**
   * True current `liveStartTime`, refreshed unconditionally on every live-state tick regardless of
   * the reflow-cadence/slack bookkeeping below — {@link reconcileLiveGeometry}'s eviction-threshold
   * check, and {@link evictLiveHistory}, both need an always-fresh bound on how far {@link
   * _liveDisplayOrigin} is ever allowed to catch up to, independent of whether a geometry reflow
   * actually committed this tick.
   */
  private _liveTrueStartTime = 0;
  /** Playhead within edge of liveSyncPosition — locked region recedes to its automatic minimum. */
  private _liveNearEdge = false;
  private _liveEdgeOverlay!: LiveEdgeOverlay;
  private _evictedRegionOverlay!: EvictedRegionOverlay;
  /**
   * PlayerLiveState as of the last *committed* geometry reflow (not the last tick). Serves as the
   * `previous` baseline for {@link reconcileLiveGeometry}'s growth/slack math, so accumulated growth
   * across several cadence-skipped ticks (see {@link TimelineConfig.liveReflowCadence}) is measured
   * against the last reflow, not the immediately-prior tick. `undefined` only before the first live
   * observation.
   */
  private _liveReflowBaseline: PlayerLiveState | undefined;
  /**
   * Latches like {@link LivePlaybackTracker}'s `pinnedToLive`: true by default while live, broken by
   * a manual scroll-drag away from the live edge, re-engaged by a manual drag back to it. Gates
   * the automatic scroll-to-live-edge snap in {@link reconcileLiveGeometry} — without this, the
   * snap would undo a deliberate scroll-back the moment the next reflow becomes cadence-eligible,
   * making it impossible to actually stay looking at earlier content while still playing.
   */
  private _pinnedToLiveEdge = true;
  // endregion

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

    this._ui.onEvent$
      .pipe(filter((event) => affectsStyledElement(event, this._styledElement)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.handleStyleUpdate();
      });

    // Registered before createCanvas() (and thus before Playhead's own PLAYER_MAIN_MEDIA_LOADED
    // subscription, wired up inside its constructor) so this always runs first for any given event.
    // Playhead.doPlayProgress() gates on `this.state.isLive` and, being constructed inside
    // createCanvas() below, would otherwise see this event before Timeline's own onMainMediaLoaded()
    // (registered further down) gets a chance to seed it - hiding the playhead for one extra tick on
    // every live load. Seeding here directly, ahead of Playhead's subscription, closes that gap.
    this._player.onEvent$
      .pipe(filter((p) => p.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.handleLiveStateUpdate(this._player.playerSession.liveState);
      });

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
      class: domClasses.root,
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

    // region layout background
    this._layoutBg = KonvaFactory.createBgRect({
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
    });

    this._layoutFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._layoutBg,
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      justifyContent: 'JUSTIFY_FLEX_START',
      width: stageDimensions.width,
      height: stageDimensions.height,
    });
    this._layoutFlexGroup.setPaddings(this.resolveLayoutPaddings(), false);
    // endregion

    // region slots
    this._headerSlot = new TimelineSlot(TimelineSlotType.HEADER);
    this._mainSlot = new TimelineSlot(TimelineSlotType.MAIN);
    this._footerSlot = new TimelineSlot(TimelineSlotType.FOOTER);

    this._headerSlot.createGroups(this.style, this._surfaceLayer, MAIN_LAYER_CONTENT_GROUPS, SURFACE_LAYER_CONTENT_GROUPS);
    this._mainSlot.createGroups(this.style, this._surfaceLayer, MAIN_LAYER_CONTENT_GROUPS, SURFACE_LAYER_CONTENT_GROUPS);
    this._footerSlot.createGroups(this.style, this._surfaceLayer, MAIN_LAYER_CONTENT_GROUPS, SURFACE_LAYER_CONTENT_GROUPS);
    // endregion

    // region spanning container/floating — Playhead, Scrubber, ThumbnailHover live here.
    // _spanningContainer sits directly on surfaceLayer at a fixed x (the timecoded
    // container's absolute canvas position). It carries the right-pane clipFunc so
    // content never leaks outside the timecoded area when zoomed in.
    // _spanningFloatingGroup is its child and moves horizontally with the scroll offset,
    // matching the behaviour of the per-slot _surfaceLayer_timecodedFloatingGroup.
    this._spanningContainer = KonvaFactory.createGroup({
      name: '_spanningContainer',
    });
    this._spanningFloatingGroup = KonvaFactory.createGroup({
      name: '_spanningFloatingGroup',
    });
    this._spanningContainer.add(this._spanningFloatingGroup);
    this._surfaceLayer.add(this._spanningContainer);
    // endregion

    // region build layout flex tree
    this._layoutFlexGroup.addChild(this._headerSlot._mainFlexGroup).addChild(this._mainSlot._mainFlexGroup).addChild(this._footerSlot._mainFlexGroup);

    this._mainLayer.add(this._layoutFlexGroup.contentNode.konvaNode);
    // endregion

    // region playhead + scrubber
    this._playhead = new Playhead(
      {
        dragScrollMaxSpeedAfterPx: this.config.playheadDragScrollMaxSpeedAfterPx,
        style: this.resolvePlayheadStyle(),
      },
      this,
      this._player
    );

    // Depends on _playhead (mirrors its dragging state — see PlayheadBuffer's constructor) so must
    // be constructed after it.
    this._playheadBuffer = new PlayheadBuffer(
      {
        style: this.resolvePlayheadBufferStyle(),
      },
      this,
      this._player,
      this._playhead
    );

    this._scrubber = new Scrubber(
      {
        style: this.resolveScrubberStyle(),
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

    this._liveEdgeOverlay = new LiveEdgeOverlay({style: this.resolveLiveEdgeOverlayStyle()}, this);
    this._evictedRegionOverlay = new EvictedRegionOverlay({style: this.resolveEvictedRegionOverlayStyle()}, this);

    // Add spanning components to the spanning group, in z-order (later .add() calls render on top):
    // PlayheadBuffer (progress/buffered bar) at the bottom, below both region overlays, so their
    // hatching visibly covers it — Playhead (the marker) goes back in above both, so it always
    // stays visible on top regardless of which region it's currently over.
    for (const component of [this._playheadBuffer, this._liveEdgeOverlay, this._evictedRegionOverlay, this._playhead, this._scrubber, this._thumbnailHoverWrapper.thumbnailImg]) {
      this._spanningFloatingGroup.add(component.konvaNode);
    }
    // endregion

    // region vertical scrollbar (MAIN) — MAIN is the only slot with real vertical scroll
    this._verticalScrollAdapter = new TimelineSlotVerticalScrollAdapter(this.getSlot(TimelineSlotType.MAIN));
    this._verticalScrollbar = new VerticalScrollbar(this._ompProvider, {
      style: this.resolveVerticalScrollbarStyle(),
    });
    this._mainSlot.rightGutterGroup.add(this._verticalScrollbar.konvaNode);

    this.getSlot(TimelineSlotType.MAIN)
      .scroll.onScroll$.pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this._verticalScrollbar.updateScrollHandle(this._verticalScrollAdapter);
        this.emitSlotScrollEvent(TimelineSlotType.MAIN, event);
      });

    this._verticalScrollbar.onEvent$
      .pipe(filter((p) => p.type === VerticalScrollbarEventType.VERTICAL_SCROLLBAR_SCROLL))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.getSlot(TimelineSlotType.MAIN).scroll.scrollTo(event.data.scrollPercent);
      });

    this.getSlot(TimelineSlotType.MAIN)
      .onEvent$.pipe(
        filter((p) => p.type === TimelineSlotEventType.TIMELINE_SLOT_RESIZE),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe(() => {
        this.settleVerticalScrollbar();
      });
    // endregion

    // region ScrubberLane — goes into HEADER slot
    this._scrubberLane = new ScrubberLane();
    this._addTimelineLaneToSlotInternal(this._scrubberLane, this._headerSlot);
    // endregion

    // region event handlers
    // isPointerOnScrubberLane uses the HEADER slot's timecoded container
    // since the ScrubberLane lives in HEADER
    let isPointerOnScrubberLane: () => boolean = () => {
      let pointerPosition = this._headerSlot._timecodedContainer.getRelativePointerPosition();
      let scrubberRect = this._scrubberLane.getTimecodedRect();
      return pointerPosition ? MeasurementUtil.isPositionInRect(pointerPosition, scrubberRect) : false;
    };

    fromEvent(window, 'resize')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (_event) => {
          this.onWindowResize();
        },
      });

    // timecoded mouse move — on MAIN's container (primary content area)
    this._mainSlot._timecodedContainer.on('mousemove', (event) => {
      if (!this._player.isMainMediaLoaded) {
        return;
      }
      let timecodedContainerRPP = this._mainSlot._timecodedContainer.getRelativePointerPosition();
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

    // also emit on HEADER container (for scrubber lane interaction)
    this._headerSlot._timecodedContainer.on('mousemove', (event) => {
      if (!this._player.isMainMediaLoaded) {
        return;
      }
      let timecodedContainerRPP = this._headerSlot._timecodedContainer.getRelativePointerPosition();
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

    this._konvaStage.on('mouseleave', (_event) => {
      this.hideScrubber();
    });

    this._mainSlot._timecodedContainer.on('mouseleave', (_event) => {
      this.hideScrubber();
      this.hideThumbnailHover();
    });

    this._headerSlot._timecodedContainer.on('mouseleave', (_event) => {
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

    // Zoom wheel — on HEADER (scrubber area) and MAIN containers
    const addWheelHandler = (container: Konva.Group) => {
      if (this._config.zoomWheelEnabled) {
        container.on('wheel', (konvaEvent) => {
          if (!this._player.isMainMediaLoaded) {
            return;
          }
          if (isPointerOnScrubberLane() || container === this._mainSlot._timecodedContainer) {
            let wheelEvent = konvaEvent.evt;
            wheelEvent.preventDefault();

            let direction: ZoomDirection = wheelEvent.deltaY > 0 ? 'zoom_in' : 'zoom_out';
            if (wheelEvent.ctrlKey) {
              direction = direction === 'zoom_in' ? 'zoom_out' : 'zoom_in';
            }

            let timecodedContainerRPP = this._mainSlot._timecodedContainer.getRelativePointerPosition();
            if (timecodedContainerRPP) {
              this.zoomByStep(direction, this._config.zoomScaleWheel, timecodedContainerRPP.x);
            }

            this.refreshScrollWithPlayhead();
          }
        });
      }
    };
    addWheelHandler(this._headerSlot._timecodedContainer);
    addWheelHandler(this._mainSlot._timecodedContainer);

    // Drag on any slot's floating group — for horizontal timeline scroll and playhead drag.
    // All three slots' floating groups are kept at identical width/x (see layersSync()), so
    // this works identically regardless of which slot's group is actually being dragged.
    const attachTimecodedDragHandlers = (floatingGroup: Konva.Group) => {
      floatingGroup.on('dragstart', (event) => {
        let startDrag = () => {
          this._dragBreaker.break();

          this.onEvent$
            .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_SCROLL))
            .pipe(takeUntil(this._dragBreaker.observer))
            .subscribe(() => {
              this._dragConditions!.positionBeforeDrag = floatingGroup.getPosition();
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
          positionBeforeDrag: floatingGroup.getPosition(),
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
                  let timecodedFloatingGroupRPP = floatingGroup.getRelativePointerPosition();
                  if (timecodedFloatingGroupRPP) {
                    this._playhead.dragMove(timecodedFloatingGroupRPP.x);
                  }
                });
              this._player.pause();
            } else {
              this._playhead.dragStart();
            }
          } else {
            if (this.getZoomPercent() === 100) {
              stopDrag();
            } else {
              startDrag();
            }
          }
        } else {
          stopDrag();
        }
      });

      floatingGroup.on('dragmove', () => {
        let doDragMove = () => {
          WindowUtil.cursor('grabbing');
          floatingGroup.y(0);
          this.scrollTimeline(floatingGroup.x());
          // Pin the dragged node itself to the constrained position too. Konva's native drag
          // tracks the pointer unconditionally, so past the start/end boundary (where
          // scrollTimeline stops applying changes) the node would otherwise keep drifting with
          // the pointer, unbounded. That slack then has to be "walked back" before reversing
          // the drag direction does anything, which is exactly what feels broken/stuck.
          floatingGroup.x(this.constrainTimecodedFloatingPosition(floatingGroup.x()));
        };

        let preventDragMove = () => {
          floatingGroup.setPosition(this._dragConditions!.positionBeforeDrag!);
        };

        if (this._dragConditions!.isPlayheadDrag) {
          preventDragMove();
          let timecodedFloatingGroupRPP = floatingGroup.getRelativePointerPosition();
          if (timecodedFloatingGroupRPP) {
            this._playhead.dragMove(timecodedFloatingGroupRPP.x);
          }
          this._dragConditions!.positionBeforeDrag = floatingGroup.getPosition();
        } else {
          doDragMove();
        }
      });

      floatingGroup.on('dragend', () => {
        if (!this._player.isMainMediaLoaded) {
          return;
        }

        if (this._dragConditions!.isPlayheadDrag) {
          this._playhead.dragEnd();
          let seconds = this.clampSeekTarget(this.timelinePositionToTime(this._playhead.getPlayheadPosition()));
          this._player.seekTo(seconds).subscribe((event) => {
            if (event && this._dragConditions?.playbackState?.playing) {
              this._player.play();
            }
          });
        } else {
          WindowUtil.cursor('default');
          this.scrubberMove();
          this.refreshScrollWithPlayhead();
          if (this._isLive) {
            // A manual pan away from the live edge breaks the pin; panning back to it re-engages
            // — same latch semantics as LivePlaybackTracker.pinnedToLive, just driven by scroll
            // position instead of seek/currentTime.
            this._pinnedToLiveEdge = this.isSnappedEnd();
          }
        }
        this._dragBreaker.break();
      });
    };

    [this._headerSlot, this._mainSlot, this._footerSlot].forEach((slot) => attachTimecodedDragHandlers(slot._timecodedFloatingGroup));

    // scrubber lane hover events
    this._scrubberLane.onMouseMove$
      .pipe(debounceTime(20))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (_event) => {
          if (!this._player.isMainMediaLoaded) {
            return;
          }

          if (this._thumbnailTrack) {
            let x = this._mainSlot._timecodedFloatingGroup.getRelativePointerPosition()?.x ?? this._headerSlot._timecodedFloatingGroup.getRelativePointerPosition()?.x;
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
      .subscribe((_event) => {
        this.hideThumbnailHover();
      });

    let emitTimelineTimecodeClick = (event: KonvaEventObject<PointerEvent, Konva.Group>, container: Konva.Group) => {
      let timecodedFloatingGroupRPP = this._mainSlot._timecodedFloatingGroup.getRelativePointerPosition();

      let seconds = this.timelinePositionToTime(timecodedFloatingGroupRPP ? timecodedFloatingGroupRPP.x : 0);
      let timecode = this._player.convertTime(seconds, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);

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

    for (const container of [this._mainSlot._timecodedContainer, this._headerSlot._timecodedContainer]) {
      container.on('click touchend', (event) => {
        if (!this._player.isMainMediaLoaded) {
          return;
        }
        emitTimelineTimecodeClick(event, container);
      });
    }

    // also from surface layer containers
    for (const slot of [this._mainSlot, this._headerSlot]) {
      slot._surfaceLayer_timecodedContainer.on('click touchend', (event) => {
        if (!this._player.isMainMediaLoaded) {
          return;
        }
        emitTimelineTimecodeClick(event, slot._timecodedContainer);
      });
    }

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
    // endregion
  }

  private resolvePlayheadStyle(): PlayheadStyle {
    return {
      draggingFill: this.style.scrubberSnappedFill,
      symbolYOffset: -this.style.playheadScrubberHeight / 2,

      visible: this.style.playheadVisible,
      fill: this.style.playheadFill,
      lineWidth: this.style.playheadLineWidth,
      symbolHeight: this.style.playheadSymbolHeight,
      textFill: this.style.playheadTextFill,
      textFontSize: this.style.playheadTextFontSize,
      textYOffset: this.style.playheadTextYOffset,
    };
  }

  private resolvePlayheadBufferStyle(): PlayheadBufferStyle {
    return {
      scrubberHeight: this.style.playheadScrubberHeight,
      backgroundFill: this.style.playheadBackgroundFill,
      backgroundOpacity: this.style.playheadBackgroundOpacity,
      playProgressFill: this.style.playheadPlayProgressFill,
      playProgressOpacity: this.style.playheadPlayProgressOpacity,
      bufferedFill: this.style.playheadBufferedFill,
      bufferedOpacity: this.style.playheadBufferedOpacity,
    };
  }

  private resolveScrubberStyle(): Partial<ScrubberStyle> {
    return {
      textSnappedFill: this.style.scrubberSnappedFill,
      symbolYOffset: -this.style.playheadScrubberHeight / 2,

      visible: this.style.scrubberVisible,
      fill: this.style.scrubberFill,
      snappedFill: this.style.scrubberSnappedFill,
      northLineWidth: this.style.scrubberNorthLineWidth,
      northLineOpacity: this.style.scrubberNorthLineOpacity,
      southLineWidth: this.style.scrubberSouthLineWidth,
      southLineOpacity: this.style.scrubberSouthLineOpacity,
      symbolHeight: this.style.scrubberSymbolHeight,
      textFill: this.style.scrubberTextFill,
      textYOffset: this.style.scrubberTextYOffset,
      textFontSize: this.style.scrubberTextFontSize,
    };
  }

  private resolveVerticalScrollbarStyle(): VerticalScrollbarStyle {
    return {
      width: this.style.verticalScrollbarWidth,
      backgroundFill: this.style.verticalScrollbarBackgroundFill,
      backgroundFillOpacity: this.style.verticalScrollbarBackgroundFillOpacity,
      handleBarFill: this.style.verticalScrollbarHandleBarFill,
      handleBarOpacity: this.style.verticalScrollbarHandleBarOpacity,
      handleBarBorderRadius: this.style.verticalScrollbarHandleBarBorderRadius ?? 0,
    };
  }

  private resolveLiveEdgeOverlayStyle(): LiveEdgeOverlayStyle {
    return {
      fill: this.style.liveEdgeOverlayFill,
      fillOpacity: this.style.liveEdgeOverlayFillOpacity,

      hatchStroke: this.style.liveEdgeOverlayHatchStroke,
      hatchOpacity: this.style.liveEdgeOverlayHatchOpacity,
      hatchLineWidth: this.style.liveEdgeOverlayHatchLineWidth,
      hatchSpacing: this.style.liveEdgeOverlayHatchSpacing,
      hatchMirrored: this.style.liveEdgeOverlayHatchMirrored,

      borderColor: this.style.liveEdgeOverlayBorderColor,
      borderWidth: this.style.liveEdgeOverlayBorderWidth,
      borderOpacity: this.style.liveEdgeOverlayBorderOpacity,
      borderDash: this.style.liveEdgeOverlayBorderDash,
    };
  }

  private resolveEvictedRegionOverlayStyle(): EvictedRegionOverlayStyle {
    return {
      fill: this.style.evictedRegionOverlayFill,
      fillOpacity: this.style.evictedRegionOverlayFillOpacity,

      hatchStroke: this.style.evictedRegionOverlayHatchStroke,
      hatchOpacity: this.style.evictedRegionOverlayHatchOpacity,
      hatchLineWidth: this.style.evictedRegionOverlayHatchLineWidth,
      hatchSpacing: this.style.evictedRegionOverlayHatchSpacing,
      hatchMirrored: this.style.evictedRegionOverlayHatchMirrored,

      borderColor: this.style.evictedRegionOverlayBorderColor,
      borderWidth: this.style.evictedRegionOverlayBorderWidth,
      borderOpacity: this.style.evictedRegionOverlayBorderOpacity,
      borderDash: this.style.evictedRegionOverlayBorderDash,
    };
  }

  /** Resolves {@link TimelineStyle.padding}'s CSS-shorthand form into explicit per-edge values. */
  private resolvePaddingEdges(): {top: number; right: number; bottom: number; left: number} {
    const padding = this.style.padding;
    if (isNullOrUndefined(padding)) {
      return {top: 0, right: 0, bottom: 0, left: 0};
    }
    if (typeof padding === 'number') {
      return {top: padding, right: padding, bottom: padding, left: padding};
    }
    if (padding.length === 2) {
      const vertical = padding[0] ?? 0;
      const horizontal = padding[1] ?? 0;
      return {top: vertical, right: horizontal, bottom: vertical, left: horizontal};
    }
    if (padding.length >= 4) {
      return {top: padding[0] ?? 0, right: padding[1] ?? 0, bottom: padding[2] ?? 0, left: padding[3] ?? 0};
    }
    const uniform = padding[0] ?? 0;
    return {top: uniform, right: uniform, bottom: uniform, left: uniform};
  }

  private resolveLayoutPaddings(): FlexSpacing[] {
    const {top, right, bottom, left} = this.resolvePaddingEdges();
    return FlexSpacingBuilder.create().topRightBottomLeft([top, right, bottom, left]).build();
  }

  setStyle(style: Partial<TimelineStyle>): void {
    this._ui.updateStyleRule({
      id: this._id,
      style: {
        ...style,
      },
    });
    this.handleStyleUpdate();
  }

  private handleStyleUpdate(): void {
    this._style = this._ui.resolveStyle(this._styledElement) as TimelineStyle;

    this._layoutBg.setAttrs({
      fill: this.style.backgroundFill,
      opacity: this.style.backgroundOpacity,
    });

    this._layoutFlexGroup.setPaddings(this.resolveLayoutPaddings(), false);

    this._playhead.style = this.resolvePlayheadStyle();
    this._playheadBuffer.style = this.resolvePlayheadBufferStyle();
    this._scrubber.style = this.resolveScrubberStyle();
    this._liveEdgeOverlay.style = this.resolveLiveEdgeOverlayStyle();
    this._evictedRegionOverlay.style = this.resolveEvictedRegionOverlayStyle();
    this._verticalScrollbar.setStyle(this.resolveVerticalScrollbarStyle());
    this._thumbnailHoverWrapper.thumbnailImg.style = {
      stroke: this.style.thumbnailHoverStroke,
      strokeWidth: this.style.thumbnailHoverStrokeWidth,
    };

    const leftPaneBgFill = this.style.leftPaneBackgroundFill ?? this.style.backgroundFill;
    const leftPaneBgOpacity = this.style.leftPaneBackgroundOpacity ?? this.style.backgroundOpacity;
    const rightPaneBgFill = this.style.rightPaneBackgroundFill ?? this.style.backgroundFill;
    const rightPaneBgOpacity = this.style.rightPaneBackgroundOpacity ?? this.style.backgroundOpacity;

    for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
      slot.setLeftPaneWidth(this._descriptionPaneVisible ? this.style.leftPaneWidth : 0);
      slot.setRightPaneMargins(this.style.rightPaneMarginLeft, this.style.rightPaneMarginRight);
      slot.setLeftPaneBackground(leftPaneBgFill, leftPaneBgOpacity);
      slot.setRightPaneBackground(rightPaneBgFill, rightPaneBgOpacity);
    }

    this.settleLayout();

    this._onEvent$.next({
      type: TimelineEventType.TIMELINE_STYLE_CHANGE,
      data: {
        style: this._style,
      },
    });
  }

  private resolveStageDimension(): Dimension {
    let divElementRect: RectMeasurement = {
      x: this._rootElement.offsetLeft,
      y: this._rootElement.offsetTop,
      width: this._rootElement.offsetWidth,
      height: this._rootElement.offsetHeight,
    };

    const {top: paddingTop, bottom: paddingBottom} = this.resolvePaddingEdges();

    // Sum adaptive heights of all three slots
    const headerH = this._headerSlot ? this._headerSlot.getAdaptiveHeight() : 0;
    const footerH = this._footerSlot ? this._footerSlot.getAdaptiveHeight() : 0;
    const adaptiveMainH = this._mainSlot ? this._mainSlot.getAdaptiveHeight() : 0;

    let mainH: number;
    if (!isNullOrUndefined(this.style.maxHeight)) {
      const maxMainH = Math.max(0, this.style.maxHeight - headerH - footerH - paddingTop - paddingBottom);
      const minMainH = Math.max(0, this.style.minHeight - headerH - footerH - paddingTop - paddingBottom);
      mainH = Math.min(maxMainH, Math.max(adaptiveMainH, minMainH));
    } else {
      mainH = adaptiveMainH;
    }

    const totalHeight = paddingTop + headerH + mainH + footerH + paddingBottom;

    return {
      width: divElementRect.width >= this.style.minWidth ? divElementRect.width : this.style.minWidth,
      height: totalHeight >= this.style.minHeight ? totalHeight : this.style.minHeight,
    };
  }

  private handleTimecodeClick(timecode: string) {
    if (!this._player.isMainMediaLoaded) {
      return;
    }
    const seconds = this._player.convertTime(timecode, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS);
    this._player.seekTo(this.clampSeekTarget(seconds));
  }

  private hideScrubber() {
    this._scrubber.style = {
      visible: false,
    };
  }

  private settleDom() {
    this.refreshTimecode();

    if (this.scrubberLane) {
      let position: Position = this.scrubberLane.mainLeftFlexGroup.contentNode.konvaNode.absolutePosition();
      let dimension: Dimension = {
        width: this.scrubberLane.mainLeftFlexGroup.contentNode.konvaNode.width(),
        height: this.scrubberLane.mainLeftFlexGroup.contentNode.konvaNode.height(),
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
    // Refresh all slot layouts so lane heights are up-to-date
    for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
      if (slot) slot._mainFlexGroup.refreshLayout();
    }

    // Compute slot heights
    const headerH = this._headerSlot ? this._headerSlot.getAdaptiveHeight() : 0;
    const footerH = this._footerSlot ? this._footerSlot.getAdaptiveHeight() : 0;

    // Update MAIN slot height
    if (this._mainSlot) {
      if (isNullOrUndefined(this.style.maxHeight)) {
        // No maxHeight means MAIN is genuinely unconstrained/adaptive — not "fixed to whatever
        // its current content height happens to be", which would leave a fixedHeight clip
        // applied (harmless in steady state, but stale mid-animation, e.g. lane minimize/maximize).
        this._mainSlot.setHeight(undefined);
      } else {
        const {top: paddingTop, bottom: paddingBottom} = this.resolvePaddingEdges();
        const adaptiveMainH = this._mainSlot.getAdaptiveHeight();
        const maxMainH = Math.max(0, this.style.maxHeight - headerH - footerH - paddingTop - paddingBottom);
        const minMainH = Math.max(0, this.style.minHeight - headerH - footerH - paddingTop - paddingBottom);
        const clampedMainH = Math.min(maxMainH, Math.max(adaptiveMainH, minMainH));
        this._mainSlot.setHeight(clampedMainH > 0 ? clampedMainH : undefined);
      }
    }

    // Refresh layout from root after height changes
    this._layoutFlexGroup.refreshLayout();

    let stageDimensions = this.resolveStageDimension();

    this._konvaStage.setAttrs({
      ...stageDimensions,
    });

    this._layoutFlexGroup.setDimension(stageDimensions.width, stageDimensions.height);

    this.settleTimecodedGroups();

    this._liveEdgeOverlay.onMeasurementsChange();
    this._evictedRegionOverlay.onMeasurementsChange();
    this._scrubber.onMeasurementsChange();

    for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
      if (slot) {
        slot.lanes.forEach((lane) => lane.onMeasurementsChange());
      }
    }

    this._playhead.onMeasurementsChange();
    this._playheadBuffer.onMeasurementsChange();

    this.zoomByWidth(this.getTimecodedFloatingDimension().width, this.resolveTimelineContainerZoomFocusPosition());

    this.settleDom();

    // The scroll position itself never changes here — only the scrollable range does. Refresh
    // MAIN's reported offset percentage against that new range (without moving _scrollY), so it
    // doesn't stay stale (e.g. still reporting 100% after a lane is added below the fold).
    this._mainVScrollAdapter?.refreshOffset();

    // Notify after everything above has settled, so getEffectiveHeight()/getContentHeight()
    // return fresh values to anyone reacting synchronously (e.g. resizing a scrollbar thumb).
    for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
      if (slot) slot.notifyResize();
    }
  }

  /**
   * Repositions/resizes the MAIN vertical scrollbar to track the slot's current width/viewport
   * height. Always flush against the slot's right edge — not centered within
   * rightPaneMarginRight — so it stays correctly aligned regardless of how the margin compares
   * to the scrollbar's own width. Triggered by main.onEvent$'s TIMELINE_SLOT_RESIZE (see the
   * subscription set up alongside construction).
   */
  private settleVerticalScrollbar() {
    const fullWidth = this._mainSlot._mainFlexGroup.getLayout().width;
    const scrollbarWidth = this._verticalScrollbar.getRect().width;
    const x = fullWidth - scrollbarWidth;
    const height = this._mainSlot.getEffectiveHeight();

    this._verticalScrollbar.konvaNode.setAttrs({x, y: 0, height});
    this._verticalScrollbar.onMeasurementsChange();
    this._verticalScrollbar.updateScrollHandle(this._verticalScrollAdapter);
  }

  /**
   * Explicit user-controlled visibility toggle for a slot's vertical scrollbar. Only MAIN
   * has a mounted scrollbar today — no-op for HEADER/FOOTER.
   */
  setSlotVerticalScrollbarVisible(slotType: TimelineSlotType, visible: boolean): void {
    if (slotType !== TimelineSlotType.MAIN) return;
    this._verticalScrollbar.setVisible(visible);
  }

  private settleTimecodedGroups() {
    let newTimecodedWidth = this.calculateTimecodedWidthFromZoomRatioPercent(this.getZoomPercent());

    for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
      if (!slot) continue;
      slot.setTimecodedWidth(newTimecodedWidth);
      slot.settleLayout(newTimecodedWidth, this.style.rightPaneClipPadding);
    }

    this.layersSync();
  }

  private layersSync() {
    for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
      if (!slot) continue;
      slot.syncSurfaceLayer(this.style.rightPaneClipPadding);
    }

    // Sync HEADER and FOOTER floating groups to follow MAIN's x
    const mainX = this._mainSlot._timecodedFloatingGroup.x();
    this._headerSlot._timecodedFloatingGroup.x(mainX);
    this._footerSlot._timecodedFloatingGroup.x(mainX);

    // _spanningContainer: fixed at the timecoded container's absolute canvas x.
    // Carries the right-pane clipFunc (same geometry as the per-slot containers).
    // _spanningFloatingGroup inside it receives only the scroll offset, matching
    // the per-slot _surfaceLayer_timecodedFloatingGroup behaviour.
    const containerAbsX = this._mainSlot._surfaceLayer_timecodedContainer.x();
    const containerW = this._mainSlot._timecodedContainer.width();
    const floatingW = this._mainSlot._timecodedFloatingGroup.width();
    const {top: paddingTop} = this.resolvePaddingEdges();
    const contentH = this.getSpanningContentHeight();
    const pad = this.style.rightPaneClipPadding;

    // y is offset by paddingTop (not 0) and height is the HEADER+MAIN+FOOTER content height (not
    // the raw stage height) so spanning components — playhead, scrubber, live edge overlay —
    // start at HEADER's top edge instead of bleeding into the outer padding above/below them.
    this._spanningContainer.setAttrs({
      x: containerAbsX,
      y: paddingTop,
      width: containerW,
      height: contentH,
    });
    this._spanningContainer.clipFunc((ctx) => {
      ctx.rect(-pad, -500, containerW + 2 * pad, contentH + 500);
    });

    this._spanningFloatingGroup.setAttrs({
      x: mainX,
      y: 0,
      width: floatingW,
      height: contentH,
    });

    // Keep HEADER/FOOTER surface floating groups in sync with their main groups.
    // These are children of their own containers (already abs-positioned), so
    // only the local scroll offset needs to be applied.
    this._headerSlot._surfaceLayer_timecodedFloatingGroup.x(mainX);
    this._footerSlot._surfaceLayer_timecodedFloatingGroup.x(mainX);
    this._headerSlot._surfaceLayer_timecodedSpreadGroup.x(mainX);
    this._footerSlot._surfaceLayer_timecodedSpreadGroup.x(mainX);
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

  private emitSlotScrollEvent(slot: TimelineSlotType, event: VerticalScrollEvent) {
    this._onEvent$.next({
      type: TimelineEventType.TIMELINE_SLOT_SCROLL,
      data: {
        slot,
        scrollPercent: event.scrollPercent,
        deltaPercent: event.deltaPercent,
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
    this._scrollWithPlayhead = isInVisiblePositionRange && !isInBeforeTimecodedView;
  }

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
    // Read "current" x from a slot that isn't the one actively being Konva-dragged: when MAIN
    // itself is being dragged, Konva has already moved MAIN's own node to track the pointer
    // before this runs, so reading _mainSlot here would compare a node against itself and
    // always see "no change" — silently skipping the sync that keeps HEADER/FOOTER aligned.
    let referenceGroup =
      [this._headerSlot, this._mainSlot, this._footerSlot].map((slot) => slot._timecodedFloatingGroup).find((group) => !group.isDragging()) ?? this._mainSlot._timecodedFloatingGroup;
    let currentX = referenceGroup.x();
    let newX = this.constrainTimecodedFloatingPosition(x);
    if (newX !== currentX) {
      // Update all slots to same horizontal position
      for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
        slot._timecodedFloatingGroup.x(newX);
      }
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
      newTimecodedX = 0;
    } else if (newTimecodedWidth === currentTimecodedWidth) {
      newTimecodedX = currentTimecodedX;
    } else {
      newTimecodedX = new Decimal(Math.abs(currentTimecodedX) + timecodedContainerFocus).mul(newTimecodedWidth).div(currentTimecodedWidth).mul(-1).plus(timecodedContainerFocus).toNumber();
    }

    if (newTimecodedX > 0) {
      newTimecodedX = 0;
    } else if (newTimecodedX + newTimecodedWidth <= containerDimension.width) {
      newTimecodedX = containerDimension.width - newTimecodedWidth;
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
    // Update all slots' floating groups to same x and width
    for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
      slot._timecodedFloatingGroup.setAttrs({
        width: horizontals.width,
        x: horizontals.x,
      });
      slot._timecodedFloatingGroup.getChildren().forEach((node) => {
        node.setAttrs({width: horizontals.width});
      });
    }

    this.layersSync();
  }

  /**
   * Grows/shrinks the timecoded floating width in lockstep with a duration change, preserving the
   * current pixels-per-second ratio (and therefore every already-laid-out element's screen
   * position) instead of visibly resizing/repositioning them. VOD case of {@link
   * adjustLiveTimecodedTransform} — origin is always 0 for VOD, so the compensation term cancels
   * out and this reduces to a pure proportional rescale.
   */
  private adjustTimecodedWidthForDuration(oldDuration: number, newDuration: number): void {
    this.adjustLiveTimecodedTransform(0, oldDuration, 0, newDuration);
  }

  /**
   * General coordinate-domain transform: rescales width to preserve px/sec across an
   * (oldOrigin, oldExtent) → (newOrigin, newExtent) change, AND compensates the scroll offset for
   * any origin shift, so every point on the timeline — playhead, viewport-left-edge, every lane
   * element — stays pixel-stable simultaneously (not just one anchor). Verified: when px/sec
   * (width/extent) is held constant, a pure origin shift is exactly cancelled by
   * `x += slope · Δorigin`; combined with the existing proportional width rescale, this keeps the
   * whole visible timeline steady across a live reflow, not just non-distorting in isolation.
   *
   * Live mode needs this (not just the VOD-style rescale) because `liveStartTime` (origin) drifts
   * on its own for a sliding-window (CONTINUOUS) stream — every manifest reload evicts from the
   * front as it appends at the back — independently of whether `_liveExtentEnd` also grew.
   *
   * `snapToRightEdge`: an already-resolved caller decision (playing state, cadence — see {@link
   * reconcileLiveGeometry}) to pin the view to the live edge (right-aligned) instead of preserving
   * the pre-reflow scroll position. VOD's call site never sets this, so VOD is unaffected.
   */
  private adjustLiveTimecodedTransform(oldOrigin: number, oldExtent: number, newOrigin: number, newExtent: number, snapToRightEdge = false, preserveScrollPercent = false): void {
    let currentWidth = this.getTimecodedFloatingDimension().width;
    let currentX = this.getTimecodedFloatingPosition().x;
    let containerDimension = this.getTimecodedContainerDimension();
    let currentScrollPercent = this.getHorizontalScrollPercent();

    let newWidth = this.getConstrainedTimecodedWidth(new Decimal(currentWidth).mul(newExtent).div(oldExtent).round().toNumber());

    let slope = currentWidth / oldExtent;
    let compensatedX = currentX + slope * (newOrigin - oldOrigin);

    let newX: number;
    if (newWidth <= containerDimension.width) {
      newX = 0;
    } else {
      let minX = containerDimension.width - newWidth;
      newX = snapToRightEdge
        ? minX
        : preserveScrollPercent
          ? new Decimal(currentScrollPercent).mul(minX).div(100).toDecimalPlaces(2).toNumber()
          : compensatedX < minX
            ? minX
            : compensatedX > 0
              ? 0
              : compensatedX;
    }

    // No "nothing changed" early-return here: both callers (reconcileLiveGeometry's geometryChanged
    // check, adjustTimecodedWidthForDuration's newDuration !== _lastKnownDuration check) already
    // guarantee the extent/duration actually changed before calling this function — so newWidth/newX
    // coinciding with the current values only happens when the zoom-max clamp pins pixels in place
    // while the domain still moved underneath (see getConstrainedTimecodedWidth). That's exactly the
    // case settleLayout() below still needs to run for — e.g. ScrubberLane's ruler ticks only
    // refresh through it, and would otherwise silently stop updating once pinned at max zoom.

    if ((snapToRightEdge || preserveScrollPercent) && this._config.liveScrollSmoothing && newX !== currentX) {
      // Width (and everything it drives — lanes, overlay range, etc.) settles immediately, same as
      // below; only the scroll itself (live-edge-follow, or the percent-preserving hold while paused
      // in CONTINUOUS mode) eases via scrollToPositionEased(), reusing scrollEasingDuration like every
      // other animated scroll instead of jumping straight to the target. Settling width first at the
      // still-current x isn't guaranteed valid for the just-set newWidth (that's only guaranteed for
      // snapToRightEdge, where extent only ever grows) — but settleTimecodedFloating() sets raw Konva
      // attrs with no clamping, so a momentarily-invalid x just renders as one harmless frame, instantly
      // corrected once the ease reaches the real (valid) newX.
      this.settleTimecodedFloating({
        width: newWidth,
        x: currentX,
      });
      this.emitZoomEvent();
      this.settleLayout();
      this.scrollToPositionEased(newX).subscribe();
      return;
    }

    this.settleTimecodedFloating({
      width: newWidth,
      x: newX,
    });
    this.emitZoomEvent();
    this.emitScrollEvent();
    this.settleLayout();
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

    this._lastKnownDuration = this._player.getDuration();

    // Covers the case where media was already loaded before this Timeline was constructed (no
    // PLAYER_MAIN_MEDIA_LOADED event to catch) - the constructor's early subscription above handles
    // every other, event-driven load. Calling this again here for that event-driven case is a
    // harmless no-op reconciliation against the same, already-seeded state.
    this.handleLiveStateUpdate(this._player.playerSession.liveState);

    this.doPlaybackProgress();

    this._player.onEvent$
      .pipe(filter((p) => p.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS))
      .pipe(sampleTime(playbackProgressThrottle))
      .pipe(takeUntil(this._mediaBreaker.observer))
      .subscribe((event) => {
        this.doPlaybackProgress();
      });

    this._player.onEvent$
      .pipe(filter((p) => p.type === PlayerEventType.PLAYER_LIVE_STATE_UPDATE))
      .pipe(takeUntil(this._mediaBreaker.observer))
      .subscribe((event) => {
        this.handleLiveStateUpdate(event.data.liveState);
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
          case PlayerEventType.PLAYER_MAIN_MEDIA_UPDATED: {
            // Live mode's width/scroll is fully owned by reconcileLiveGeometry (driven by
            // PLAYER_LIVE_STATE_UPDATE). This VOD-style rescale must not also run while live —
            // PLAYER_MAIN_MEDIA_UPDATED fires on essentially every segment arrival too (duration
            // mirrors liveSyncPosition), and it always rescales with snapToRightEdge defaulted to
            // false — an uncoordinated second rescale here would leave x short of the true right
            // edge the live-aware call just snapped to. _lastKnownDuration still gets refreshed
            // unconditionally so it's not stale for the next genuine VOD duration change once the
            // stream ends.
            //
            // Guards on mainMediaState.isLive rather than this._isLive: the latter only flips once
            // Timeline's own PLAYER_LIVE_STATE_UPDATE subscription has processed its first event,
            // which lags behind mainMediaState.isLive by several seconds at startup — it's set
            // synchronously off the manifest at initial load, independent of that periodic tick.
            // Guarding on the slower flag left a multi-second window where a duration correction
            // (native durationchange vs. HLS's own manifest-parsed timing race, no ordering
            // guarantee between them) would still trigger this VOD-style rescale.
            let newDuration = event.data.mainMediaState.duration;
            if (!isNullOrUndefined(newDuration)) {
              if (!event.data.mainMediaState.isLive && !isNullOrUndefined(this._lastKnownDuration) && newDuration !== this._lastKnownDuration) {
                this.adjustTimecodedWidthForDuration(this._lastKnownDuration, newDuration);
              }
              this._lastKnownDuration = newDuration;
            }
            break;
          }
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
    if (this._scrollWithPlayhead && !this.isPlayheadInTimecodedView() && !this._syncTimelineWithPlayheadInProgress) {
      this._syncTimelineWithPlayheadInProgress = true;
      this.syncTimelineWithPlayhead().subscribe((result) => {
        this._syncTimelineWithPlayheadInProgress = false;
      });
    }

    this.refreshLiveEdgeProximity();
    if (!this._timecodeEdit) {
      this.refreshTimecode();
    }
  }

  // endregion

  // region live

  /**
   * Entry point for every manifest reload and sync-position tick. Seeds/grows
   * {@link _liveExtentEnd} and refreshes the locked-region overlay.
   */
  private handleLiveStateUpdate(liveState: PlayerLiveState | undefined): void {
    const wasLive = this._isLive;
    this._isLive = !!liveState?.isLive;
    this._liveState = liveState;

    if (!this._isLive) {
      if (wasLive) {
        this._liveExtentEnd = 0;
        this._liveDisplayOrigin = 0;
        this._liveTrueStartTime = 0;
        this._liveNearEdge = false;
        this._liveReflowBaseline = void 0;
        this._pinnedToLiveEdge = true;
        this._liveEdgeOverlay.setVisible(false);
        this._evictedRegionOverlay.setVisible(false);
      }
      return;
    }

    // Kept fresh every tick regardless of the reflow-cadence gating below — see the field comment.
    this._liveTrueStartTime = liveState!.liveStartTime;

    if (!wasLive || !this._liveReflowBaseline) {
      // First observation while live — seed the extent and reflow baseline together.
      this._liveExtentEnd = isNullOrUndefined(this._config.liveEdgeBufferSpace) ? liveState!.liveEdgeDuration : liveState!.liveEdgeDuration + this._config.liveEdgeBufferSpace;
      this._liveDisplayOrigin = liveState!.liveStartTime;
      this._liveReflowBaseline = liveState!;
      this._pinnedToLiveEdge = true;
      // Refresh stage/lane dimensions first: by this point the caller has usually already added
      // every lane, but nothing has re-measured the stage since Timeline construction (before any
      // lane existed) or the last settleLayout() call — without this, getSpanningContentHeight()
      // (read by LiveEdgeOverlay/EvictedRegionOverlay's very first redraw, via
      // updateLiveEdgeOverlay()/updateEvictedRegionOverlay() below) stays wrong until whatever next
      // calls settleLayout(), normally the *second* live-state tick's reconcileLiveGeometry() /
      // adjustLiveTimecodedTransform() — one whole manifest reload later than it should be.
      this.settleLayout();
      // Width is also force-reset to 100% (exactly fitting the container) as a defensive fallback —
      // the PLAYER_MAIN_MEDIA_UPDATED handler above is the primary fix for the VOD-style rescale that
      // used to race ahead of this event, but resetting here too means any other stale-width path
      // can't leave a wrong zoom baked in once live geometry actually takes over. Runs after
      // settleLayout() above so its own internal zoomByWidth (using whatever width was already
      // current) doesn't undo this explicit 100% reset.
      this.zoomByWidth(this.getTimecodedContainerDimension().width, 0);
    } else {
      this.reconcileLiveGeometry(this._liveReflowBaseline, liveState!);
    }

    this.refreshLiveEdgeProximity();
    this.updateLiveEdgeOverlay();
    this.updateEvictedRegionOverlay();
  }

  /**
   * Runs on every live-state update, not just ones where `liveEdgeDuration` grew — `liveStartTime`
   * can drift on its own for a sliding-window (CONTINUOUS) live stream, since every manifest reload
   * evicts from the front as it appends at the back. Keeps the reserved-allocation decision (OMP-
   * LIVE-TML-5's absorb-vs-reflow slack check) and the positional-stability transform (OMP-LIVE-
   * TML-3/4) as two separate, correctly-ordered steps: decide the new `_liveExtentEnd` first, then
   * reconcile the whole (origin, extent) pair against what was actually rendered a moment ago —
   * using `previous`/`current`'s own `liveStartTime`, never mixing an old extent with a new origin
   * (that mismatch is what made reflows overstate the expansion for a sliding window).
   */
  private reconcileLiveGeometry(baseline: PlayerLiveState, current: PlayerLiveState): void {
    const oldOrigin = this._liveDisplayOrigin;
    const oldExtentEnd = this._liveExtentEnd;

    let candidateExtentEnd = oldExtentEnd;
    if (current.liveEdgeDuration > baseline.liveEdgeDuration) {
      const buffer = this._config.liveEdgeBufferSpace;
      const slack = oldExtentEnd - baseline.liveEdgeDuration;
      const delta = current.liveEdgeDuration - baseline.liveEdgeDuration;
      const fitsInSlack = !isNullOrUndefined(buffer) && delta <= slack;

      if (!fitsInSlack) {
        candidateExtentEnd = isNullOrUndefined(buffer) ? current.liveEdgeDuration : current.liveEdgeDuration + buffer;
      }
      // else: absorbed into the existing locked space — extentEnd unchanged, the overlay's
      // left edge just advances with liveSyncPosition (handled by updateLiveEdgeOverlay()).
    }

    const oldExtent = oldExtentEnd - oldOrigin;
    // liveHistoryRetention (CONTINUOUS only): the rendered left edge continuously trails the true,
    // current liveStartTime by at most the configured retention — Math.max(oldOrigin, liveStartTime
    // - retention) — rather than tracking it exactly or jumping in one batch. Every other case (no
    // retention configured, or EVENT mode, which never evicts) keeps today's behavior of tracking
    // liveStartTime exactly on every reflow. A manual TimelineImpl.evictLiveHistory() call fully
    // closes the gap on demand, independent of this cap.
    const historyRetention = this._config.liveHistoryRetention;
    const deferOrigin = !isNullOrUndefined(historyRetention) && current.liveMode === LiveMode.CONTINUOUS;
    const newOrigin = deferOrigin ? Math.max(oldOrigin, current.liveStartTime - historyRetention!) : current.liveStartTime;
    const newExtent = candidateExtentEnd - newOrigin;

    // Only the deferred (retention-configured) branch ever needs to force a commit past the
    // cadence gate below — in the undeferred branch newOrigin already equals current.liveStartTime
    // unconditionally, so bypassing here too would silently defeat TimelineConfig.liveReflowCadence
    // for every CONTINUOUS stream, retention or not. Scoping it to `deferOrigin` keeps the two
    // configs independent: the cap is a hard ceiling (forces a commit whenever holding back would
    // let the dead region exceed it), while liveReflowCadence still throttles ordinary
    // extent-only growth exactly as before.
    const capForcesAdvance = deferOrigin && newOrigin > oldOrigin;
    const geometryChanged = oldExtent > 0 && (newExtent !== oldExtent || newOrigin !== oldOrigin);
    if (!geometryChanged || (!capForcesAdvance && !this.shouldReflowLiveGeometry(baseline, current))) {
      // Nothing to do yet, or geometrically eligible but cadence not reached — hold everything.
      // _liveExtentEnd and _liveReflowBaseline stay untouched, so the next tick's `baseline` is
      // still this same last-reflowed state and growth keeps accumulating correctly.
      return;
    }

    this._liveExtentEnd = candidateExtentEnd;
    // Committed together with _liveExtentEnd, and before adjustLiveTimecodedTransform below —
    // that call synchronously triggers emitZoomEvent()/settleLayout(), which lanes (e.g.
    // ThumbnailTrackLane) use to reposition via resolveTimeDomain(). Reading a new extentEnd
    // against a stale (pre-reflow) origin there would mis-position anything keyed off timeToTimelinePosition()
    // until the next reflow happened to reconcile it — see resolveTimeDomain's class comment.
    this._liveDisplayOrigin = newOrigin;
    this._liveReflowBaseline = current;

    const playing = this._player.playerSession.playback.playing;
    const snapToRightEdge = this._pinnedToLiveEdge && playing;
    // While paused on a CONTINUOUS (sliding-window) stream, the window keeps sliding under a static
    // view regardless of playback — pixel-compensating (the default, below) would slowly creep the
    // scroll toward the live edge and eventually snap there outright once the paused-on content ages
    // out, with no interaction from the user. Holding the *relative* scroll position steady instead
    // keeps them looking at "the same place in the window" rather than chasing a doomed absolute time.
    const preserveScrollPercent = !playing && current.liveMode === LiveMode.CONTINUOUS;
    this.adjustLiveTimecodedTransform(oldOrigin, oldExtent, newOrigin, newExtent, snapToRightEdge, preserveScrollPercent);
    this.updateEvictedRegionOverlay();

    if (newOrigin > oldOrigin) {
      // Fires on every origin advance, not just a threshold-capped advance — including the default
      // (no threshold configured) case, where the origin advances immediately every reflow. Lanes
      // that hold onto items never pruned upstream (e.g. ThumbnailTrackLane) rely on this to
      // release anything now permanently before the new origin, regardless of which path moved it.
      this._onEvent$.next({
        type: TimelineEventType.TIMELINE_LIVE_ORIGIN_ADVANCED,
        data: {origin: newOrigin},
      });
    }
  }

  /**
   * Forces a full catch-up of the rendered left bound to the true, current `liveStartTime` —
   * closing the gap completely, unlike {@link TimelineConfig.liveHistoryRetention}'s automatic
   * behavior, which only ever maintains a bounded (at-most-threshold) trailing gap and never fully
   * closes it on its own. A no-op if there's nothing to evict (including whenever no threshold is
   * configured, since the left bound already tracks `liveStartTime` exactly in that case).
   */
  evictLiveHistory(): void {
    if (!this._isLive || !this._liveReflowBaseline || this._liveTrueStartTime <= this._liveDisplayOrigin) {
      return;
    }

    const oldOrigin = this._liveDisplayOrigin;
    const newOrigin = this._liveTrueStartTime;
    const oldExtent = this._liveExtentEnd - oldOrigin;
    const newExtent = this._liveExtentEnd - newOrigin;

    this._liveDisplayOrigin = newOrigin;
    this.adjustLiveTimecodedTransform(oldOrigin, oldExtent, newOrigin, newExtent, false, false);
    this.updateEvictedRegionOverlay();

    this._onEvent$.next({
      type: TimelineEventType.TIMELINE_LIVE_ORIGIN_ADVANCED,
      data: {origin: newOrigin},
    });
  }

  /**
   * Live mode only. Clamps a seek target to both edges of what's actually reachable right now —
   * mirroring the same bounds the player itself already enforces on every seek (see
   * `HlsPlayerController.constrainSeekTime`'s `[liveStartTime, liveSyncPosition]` clamp), so the
   * timeline UI never visually promises a position the player would silently redirect away from:
   *
   * - Below `_liveTrueStartTime`: inside `[_liveDisplayOrigin, _liveTrueStartTime)` — genuinely only
   *   a non-empty range under {@link TimelineConfig.liveHistoryRetention} — content is still
   *   rendered (thumbnails, markers, ticks) but no longer actually reachable: its segments are
   *   already evicted upstream, exactly like {@link EvictedRegionOverlay} marks.
   * - Above `liveSyncPosition`: inside {@link LiveEdgeOverlay}'s reserved/locked region — not
   *   evicted, just not live *yet*.
   *
   * Called from every seek entry point that originates from a user interaction with the timeline
   * (scrubber/timecode click, playhead drag, timecode edit) — see call sites.
   */
  clampSeekTarget(seconds: number): number {
    if (!this._isLive) {
      return seconds;
    }
    if (seconds < this._liveTrueStartTime) {
      return this._liveTrueStartTime;
    }
    if (this._liveState && seconds > this._liveState.liveSyncPosition) {
      return this._liveState.liveSyncPosition;
    }
    return seconds;
  }

  /**
   * Whether accumulated `liveEdgeDuration` growth since the last *committed* reflow has reached
   * {@link TimelineConfig.liveReflowCadence}. No cadence configured means every geometrically-
   * eligible tick reflows immediately (the previous default behavior).
   */
  private shouldReflowLiveGeometry(baseline: PlayerLiveState, current: PlayerLiveState): boolean {
    const cadence = this._config.liveReflowCadence;
    if (isNullOrUndefined(cadence)) {
      return true;
    }
    return current.liveEdgeDuration - baseline.liveEdgeDuration >= cadence;
  }

  /**
   * Tracks whether the playhead is within edge threshold of
   * liveSyncPosition. This only governs the locked region's *rendered* boundary (receding to the
   * automatic minimum) — {@link _liveExtentEnd} itself, and the timeline's width, are untouched by
   * playback proximity; reflow stays exclusively an manifest-growth concern. The
   * playhead itself needs no special handling here: it already renders at
   * `timeToTimelinePosition(player.getCurrentTime())` (see {@link Playhead}), which converges on
   * liveSyncPosition as playback catches up, now that the coordinate mapping is live-aware.
   */
  private refreshLiveEdgeProximity(): void {
    if (!this._isLive || !this._liveState) {
      return;
    }
    const distance = this._liveState.liveSyncPosition - this._player.getCurrentTime();
    this._liveNearEdge = distance <= PLAYER_CONTROLLER_DEFAULTS.liveEdgeThreshold / 1000;
    this.updateLiveEdgeOverlay();
  }

  private updateLiveEdgeOverlay(): void {
    if (!this._isLive || !this._liveState) {
      return;
    }
    const start = this._liveState.liveSyncPosition;
    const end = this._liveNearEdge ? this._liveState.liveEdgeDuration : this._liveExtentEnd;
    this._liveEdgeOverlay.setVisible(true);
    this._liveEdgeOverlay.update({startTime: start, endTime: Math.max(start, end)});
  }

  /**
   * {@link TimelineConfig.liveHistoryRetention} only — marks the region between the rendered
   * timeline's left edge and the true, current live start (see {@link EvictedRegionOverlay}).
   * Empty (and hidden) whenever the two coincide, which is always true with the config off.
   */
  private updateEvictedRegionOverlay(): void {
    if (!this._isLive || this._liveTrueStartTime <= this._liveDisplayOrigin) {
      this._evictedRegionOverlay.setVisible(false);
      return;
    }
    this._evictedRegionOverlay.setVisible(true);
    this._evictedRegionOverlay.update({startTime: this._liveDisplayOrigin, endTime: this._liveTrueStartTime});
  }

  // endregion

  // region lane management

  addTimelineLane(timelineLane: TimelineLaneApi, options?: {index?: number | undefined; slot?: TimelineSlotType | undefined}): TimelineLaneApi {
    const slot = this._slotForType(options?.slot ?? TimelineSlotType.MAIN);
    const resolvedIndex = options?.index !== undefined ? options.index : slot.lanes.length;
    this._addTimelineLaneToSlotInternal(timelineLane, slot, resolvedIndex);
    this.settleLayout();
    return timelineLane;
  }

  /**
   * Internal: adds a lane to a slot without calling settleLayout().
   * Callers are responsible for calling settleLayout() when appropriate.
   */
  private _addTimelineLaneToSlotInternal(timelineLane: TimelineLaneApi, slot: TimelineSlot, index?: number): void {
    if (this._allLanesMap.has(timelineLane.id)) {
      throw new Error(`TimelineLane with id=${timelineLane.id} already exists`);
    }

    const resolvedIndex = index !== undefined ? index : slot.lanes.length;

    if (resolvedIndex < 0 || resolvedIndex > slot.lanes.length) {
      throw new Error(`Index must be 0 ≤ index ≤ ${slot.lanes.length}, got ${resolvedIndex}`);
    }

    this._allLanesMap.set(timelineLane.id, timelineLane);
    this._laneSlotMap.set(timelineLane.id, slot);

    this._preparingToSlot = slot;
    timelineLane.prepareForTimeline(this, this._player, this._ompProvider);
    this._preparingToSlot = undefined;

    slot.addLane(timelineLane, resolvedIndex);
  }

  removeTimelineLane(id: string): void {
    const result = this._removeTimelineLane(id);
    if (result) {
      this.settleLayout();
    }
  }

  removeTimelineLanes(ids: string[]) {
    let isAnyRemoved = false;
    ids.forEach((id) => {
      if (this._removeTimelineLane(id, false)) {
        isAnyRemoved = true;
      }
    });
    if (isAnyRemoved) {
      // Refresh layout for all slots
      for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
        slot.refreshLaneLayout();
      }
      this.settleLayout();
    }
  }

  removeAllTimelineLanes() {
    this.removeTimelineLanes(Array.from(this._allLanesMap.keys()));
  }

  private _removeTimelineLane(id: string, refreshLayout: boolean = true): boolean {
    if (!this._allLanesMap.has(id)) {
      console.debug(`TimelineLane with id=${id} doesn't exist`);
      return false;
    }

    const timelineLane = this._allLanesMap.get(id)!;
    const slot = this._laneSlotMap.get(id);

    if (timelineLane instanceof ScrubberLane) {
      return false;
    }

    if (slot && timelineLane) {
      slot.removeLane(timelineLane, refreshLayout);
      this._allLanesMap.delete(id);
      this._laneSlotMap.delete(id);
      timelineLane.destroy();

      if (refreshLayout) {
        this.settleLayout();
      }
      return true;
    }

    return false;
  }

  addTimelineLanes(timelineLanes: TimelineLaneApi[], options?: {index?: number | undefined; slot?: TimelineSlotType | undefined}): TimelineLaneApi[] {
    const slot = this._slotForType(options?.slot ?? TimelineSlotType.MAIN);
    const baseIndex = options?.index !== undefined ? options.index : slot.lanes.length;
    timelineLanes.forEach((lane, i) => {
      this._addTimelineLaneToSlotInternal(lane, slot, baseIndex + i);
    });
    this.settleLayout();
    return timelineLanes;
  }

  /** Returns lanes in the given slot, defaulting to MAIN (backward-compatible). */
  getTimelineLanes(slot?: TimelineSlotType): TimelineLaneApi[] {
    return this._slotForType(slot ?? TimelineSlotType.MAIN).lanes.slice();
  }

  getTimelineLane<T extends TimelineLaneApi>(id: string): T | undefined {
    const lane = this._allLanesMap.get(id);
    return lane ? (lane as T) : void 0;
  }

  get scrubberLane(): ScrubberLane {
    return this._scrubberLane;
  }

  // endregion

  // region content routing

  addToTimecodedFloatingContent(node: Konva.Group | Konva.Shape, zIndex: number = 0) {
    const slot = this._preparingToSlot ?? this._mainSlot;
    slot.addToTimecodedFloatingContent(node, zIndex);
  }

  addToTimecodedStaticContent(node: Konva.Group | Konva.Shape, zIndex: number = 0) {
    const slot = this._preparingToSlot ?? this._mainSlot;
    slot.addToTimecodedStaticContent(node);
  }

  addToSurfaceLayerTimecodedFloatingContent(node: Konva.Group | Konva.Shape, zIndex: number = 0) {
    // Route per-slot surface content: use the slot being prepared, else MAIN
    const slot = this._preparingToSlot ?? this._mainSlot;
    slot.addToSurfaceLayerTimecodedFloatingContent(node, zIndex);
  }

  addToSurfaceLayerSpreadContent(node: Konva.Group | Konva.Shape, zIndex: number = 0) {
    // Route per-slot surface content: use the slot being prepared, else MAIN
    const slot = this._preparingToSlot ?? this._mainSlot;
    slot.addToSurfaceLayerSpreadContent(node, zIndex);
  }

  addToFooterFlexGroup(flexNode: FlexNode<any>) {
    // Keep backward-compat: add to footer slot's layout group
    this._footerSlot._mainFlexGroup.addChild(flexNode);
  }

  // endregion

  // region measurements — delegate to MAIN slot for backward compat

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
    if (!this._player.isMainMediaLoaded) {
      return 0;
    }
    let [origin, extent] = this.resolveTimeDomain();
    return new Decimal(time).minus(origin).mul(timecodedWidth).div(extent).toNumber();
  }

  private convertPositionOnTimelineToTime(xOnTimeline: number, timecodedWidth: number): number {
    let constrainedX = this.constrainTimelinePosition(xOnTimeline);
    if (!this._player.isMainMediaLoaded) {
      return 0;
    }
    let [origin, extent] = this.resolveTimeDomain();
    return new Decimal(constrainedX).mul(extent).div(timecodedWidth).plus(origin).toNumber();
  }

  /**
   * The timeline's coordinate origin/extent: `0..duration` for VOD, or in live mode
   * `_liveDisplayOrigin.._liveDisplayOrigin+extent` where extent reaches out to {@link
   * _liveExtentEnd} (which includes the locked region). `_liveDisplayOrigin` tracks `liveStartTime`
   * exactly (one reflow behind) except under {@link TimelineConfig.liveHistoryRetention}, where it
   * deliberately trails the true, current `liveStartTime` by up to that many seconds at all times (a
   * continuously-maintained cap), or fully catches up on demand via {@link evictLiveHistory}.
   */
  private resolveTimeDomain(): [origin: number, extent: number] {
    if (this._isLive && this._liveReflowBaseline) {
      return [this._liveDisplayOrigin, this._liveExtentEnd - this._liveDisplayOrigin];
    }
    return [0, this._player.getDuration()];
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
    return this._mainSlot._timecodedContainer.getSize();
  }

  getStageHeight(): number {
    return this._konvaStage.height();
  }

  /**
   * Height of the HEADER + MAIN + FOOTER content, i.e. {@link getStageHeight} minus the outer
   * vertical {@link TimelineStyle.padding}. Components anchored inside `_spanningContainer` (the
   * playhead, scrubber, live edge overlay) span exactly this content region — not the raw stage,
   * which would bleed into the padding above HEADER and below FOOTER.
   */
  getSpanningContentHeight(): number {
    const {top, bottom} = this.resolvePaddingEdges();
    return Math.max(0, this.getStageHeight() - top - bottom);
  }

  /**
   * Absolute canvas y where the HEADER + MAIN + FOOTER content begins, i.e. the outer top
   * {@link TimelineStyle.padding} edge. Pairs with {@link getSpanningContentHeight} for anything
   * that needs to span that same content region in absolute/canvas coordinates.
   */
  getSpanningContentTop(): number {
    return this.resolvePaddingEdges().top;
  }

  getTimecodedFloatingDimension(): Dimension {
    return this._mainSlot._timecodedFloatingGroup.getSize();
  }

  /**
   * Same as getTimecodedFloatingDimension(), but scoped to the slot that owns the given lane
   * (HEADER/FOOTER lanes have their own content height, distinct from MAIN's).
   */
  getTimecodedFloatingDimensionForLane(laneId: string): Dimension {
    const slot = this._laneSlotMap.get(laneId) ?? this._mainSlot;
    return slot._timecodedFloatingGroup.getSize();
  }

  /** Which slot a lane currently lives in. Falls back to MAIN if the lane isn't attached. */
  getLaneSlotType(laneId: string): TimelineSlotType {
    return (this._laneSlotMap.get(laneId) ?? this._mainSlot).type;
  }

  /**
   * Absolute canvas Y of a lane's own slot's top-left, accounting for HEADER/MAIN/FOOTER vertical
   * stacking. Used to translate a "spans the whole timeline" geometry into a slot's own local
   * coordinate space (HEADER is 0, FOOTER is header+main height, etc.).
   */
  getLaneSlotAbsoluteTop(laneId: string): number {
    const slot = this._laneSlotMap.get(laneId) ?? this._mainSlot;
    return slot._timecodedContainer.absolutePosition().y;
  }

  getTimecodedFloatingPosition(): Position {
    return this._mainSlot._timecodedFloatingGroup.getPosition();
  }

  getTimecodedFloatingRelativePointerPosition(): Position | undefined {
    if (this._konvaStage.getPointersPositions().length > 0) {
      // Try MAIN first, then HEADER
      let rpp = this._mainSlot._timecodedFloatingGroup.getRelativePointerPosition() ?? this._headerSlot._timecodedFloatingGroup.getRelativePointerPosition();
      return rpp ?? void 0;
    } else {
      return void 0;
    }
  }

  getTimecodedFloatingRect(): RectMeasurement {
    return {
      ...this._mainSlot._timecodedFloatingGroup.getPosition(),
      ...this._mainSlot._timecodedFloatingGroup.getSize(),
    };
  }

  getTimecodedFloatingHorizontals(): Horizontals {
    return {
      x: this._mainSlot._timecodedFloatingGroup.x(),
      width: this._mainSlot._timecodedFloatingGroup.width(),
    };
  }

  getVisiblePositionRange(): {start: number; end: number} {
    let start = Math.abs(this._mainSlot._timecodedFloatingGroup.x());
    let end = start + this._mainSlot._timecodedContainer.width();
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

  // endregion

  setDescriptionPaneVisible(visible: boolean): void {
    for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
      slot.setLeftPaneWidth(visible ? this.style.leftPaneWidth : 0);
    }
    this.settleLayout();
    this._descriptionPaneVisible = visible;
  }

  toggleDescriptionPaneVisible(): void {
    this.setDescriptionPaneVisible(!this._descriptionPaneVisible);
  }

  setDescriptionPaneVisibleEased(visible: boolean): Observable<void> {
    return passiveObservable((observer) => {
      const currentWidth = this._mainSlot._leftFlexGroup.getLayout().width;
      animate({
        duration: this._config.layoutEasingDuration,
        startValue: visible ? 0 : currentWidth,
        endValue: visible ? this.style.leftPaneWidth : 0,
        onUpdateHandler: (frame, value) => {
          const w = Math.round(value);
          for (const slot of [this._headerSlot, this._mainSlot, this._footerSlot]) {
            slot.setLeftPaneWidth(w);
          }
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

  scrollToLane(laneId: TimelineLaneApi['id'], options?: VerticalScrollOptions): Observable<number> {
    return this.getSlot(this.getLaneSlotType(laneId)).scrollToLane(laneId, options);
  }

  private clearContent() {
    this._lastKnownDuration = void 0;
    this._isLive = false;
    this._liveState = void 0;
    this._liveExtentEnd = 0;
    this._liveDisplayOrigin = 0;
    this._liveTrueStartTime = 0;
    this._liveNearEdge = false;
    this._liveReflowBaseline = void 0;
    this._pinnedToLiveEdge = true;
    this._liveEdgeOverlay.setVisible(false);
    this._evictedRegionOverlay.setVisible(false);
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
      this._timecodeEdit = document.createElement('omakase-time-edit') as OmakaseTimeEdit;

      this._timecodeEdit.player = this._player;
      this._timecodeEdit.value = this._player.convertTime(this._player.getCurrentTime(), MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
      this._timecodeEdit.blurHandler = () => {
        this.refreshTimecode();
      };
      this._timecodeEdit.submitHandler = (timecodeText: string) => {
        const seconds = this._player.convertTime(timecodeText, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS);
        this._player.seekTo(this.clampSeekTarget(seconds)).subscribe(() => {
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
      // player in unstable state
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
      let pointerPosition = this._mainSlot._timecodedFloatingGroup.getRelativePointerPosition() ?? this._headerSlot._timecodedFloatingGroup.getRelativePointerPosition();
      let imageSize = this._thumbnailHoverWrapper.thumbnailImg.image?.getSize();

      if (pointerPosition && imageSize) {
        let timecodedGroupDimension = this.getTimecodedFloatingDimension();
        let strokeWidth = this._thumbnailHoverWrapper.thumbnailImg.style.strokeWidth;
        let x = pointerPosition.x - imageSize.width / 2;
        let halfStroke = strokeWidth > 0 ? strokeWidth / 2 : 0;
        let xWithStroke = x - halfStroke;
        x = xWithStroke < 0 ? halfStroke : x + imageSize.width + halfStroke > timecodedGroupDimension.width ? timecodedGroupDimension.width - imageSize.width - halfStroke : x;

        let timecodedRect = this._scrubberLane.getTimecodedRect();
        return {
          x: x,
          y: timecodedRect.y + timecodedRect.height + strokeWidth / 2 + this.style.thumbnailHoverYOffset,
        };
      } else {
        return {x: 0, y: 0};
      }
    };

    if (this._thumbnailHoverWrapper.thumbnail && this._thumbnailHoverWrapper.thumbnail?.id === thumbnail.id) {
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

  private _slotForType(type: TimelineSlotType): TimelineSlot {
    switch (type) {
      case TimelineSlotType.HEADER:
        return this._headerSlot;
      case TimelineSlotType.MAIN:
        return this._mainSlot;
      case TimelineSlotType.FOOTER:
        return this._footerSlot;
    }
  }

  // region public slot API

  getSlot(type: TimelineSlotType): TimelineSlotApi {
    switch (type) {
      case TimelineSlotType.HEADER:
        if (!this._headerSlotApi) {
          this._headerSlotApi = new TimelineSlotImpl(this._headerSlot, this, new NoopVerticalScrollAdapter());
        }
        return this._headerSlotApi;
      case TimelineSlotType.MAIN:
        if (!this._mainSlotApi) {
          this._mainVScrollAdapter = new VerticalScrollAdapter(this._mainSlot);
          this._mainSlotApi = new TimelineSlotImpl(this._mainSlot, this, this._mainVScrollAdapter);
        }
        return this._mainSlotApi;
      case TimelineSlotType.FOOTER:
        if (!this._footerSlotApi) {
          this._footerSlotApi = new TimelineSlotImpl(this._footerSlot, this, new NoopVerticalScrollAdapter());
        }
        return this._footerSlotApi;
    }
  }

  // endregion

  get onEvent$(): Observable<TimelineEvent> {
    return this._onEvent$.asObservable();
  }

  get id(): string {
    return this._id;
  }

  get timecodedFloatingGroup(): Konva.Group {
    return this._mainSlot._timecodedFloatingGroup;
  }

  get ready(): boolean {
    return this._ready;
  }

  get style(): TimelineStyle {
    return this._style;
  }

  get state(): TimelineState {
    return {
      isLive: this._isLive,
      liveExtentEnd: this._liveExtentEnd,
    };
  }

  destroy(): void {
    this._destroyBreaker.destroy();
    this._dragBreaker.destroy();
    this._mediaBreaker.destroy();

    this._playhead.destroy();
    this._playheadBuffer.destroy();
    this._scrubber.destroy();
    this._thumbnailHoverWrapper.destroy();
    this._liveEdgeOverlay.destroy();
    this._evictedRegionOverlay.destroy();
    this._verticalScrollbar.destroy();

    this._destroySlots([this._headerSlot, this._mainSlot, this._footerSlot]);
    this._allLanesMap.clear();
    this._laneSlotMap.clear();

    this._layoutFlexGroup.destroy();
    // @ts-ignore
    this._layoutFlexGroup = void 0;

    this._spanningContainer.destroy();
    this._konvaStage.destroy();

    if (this._timecodeEdit) {
      this._timecodeEdit.remove();
      this._timecodeEdit = void 0;
    }

    this._rootElement.innerHTML = '';

    freeObserver(this._onEvent$);
  }

  private _destroySlots(slots: (TimelineSlot | undefined)[]): void {
    for (const slot of slots) {
      if (!slot) {
        continue;
      }
      // Remove lanes from slot's yoga/flex tree first so yoga C++ parent pointers
      // are cleared before the yoga nodes are freed in lane.destroy().
      const lanes = slot.lanes.slice();
      lanes.forEach((lane) => {
        slot.removeLane(lane, false);
        lane.destroy();
      });
      slot.destroy();
    }
  }
}
