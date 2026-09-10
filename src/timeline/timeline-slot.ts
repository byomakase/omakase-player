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
import {Observable, Subject} from 'rxjs';
import {KonvaFlexGroup} from './layout/konva-flex';
import {KonvaFactory} from './konva/konva-factory';
import {FlexSpacingBuilder} from './layout/flex-node';
import type {TimelineLaneApi} from './timeline-lane-api';
import type {TimelineStyle} from './timeline-api';
import {TimelineSlotType} from './timeline-slot-type';

export class TimelineSlot {
  private readonly _type: TimelineSlotType;

  // Fires whenever this slot's effective (viewport) or content height may have changed
  // (lane minimize/maximize, add/remove, track updates, zoom, window resize, etc.) — see
  // TimelineImpl.settleLayout(), the single place all of those funnel through.
  private readonly _resize$ = new Subject<void>();

  // region flex groups
  _mainFlexGroup!: KonvaFlexGroup;
  _leftFlexGroup!: KonvaFlexGroup;
  _rightFlexGroup!: KonvaFlexGroup;
  _staticFlexGroup!: KonvaFlexGroup;
  _timecodedWrapperFlexGroup!: KonvaFlexGroup;
  _timecodedContainerFlexGroup!: KonvaFlexGroup;
  _timecodedContainerStaticFlexGroup!: KonvaFlexGroup;
  // Third sibling of _leftFlexGroup/_rightFlexGroup (not nested inside either): those two get
  // their own Konva node y-shifted on every vertical scroll (see _applyVerticalScroll below), so
  // anything that must stay fixed regardless of scroll (e.g. a vertical scrollbar) needs to live
  // here instead.
  _rightGutterFlexGroup!: KonvaFlexGroup;
  // endregion

  // region main layer konva groups
  _timecodedContainer!: Konva.Group;
  _timecodedFloatingGroup!: Konva.Group;
  _timecodedFloatingEventCatcher!: Konva.Rect;
  _timecodedFloatingContentGroups = new Map<number, Konva.Group>();
  // endregion

  // region surface layer konva groups
  _surfaceLayer_timecodedContainer!: Konva.Group;
  _surfaceLayer_timecodedFloatingGroup!: Konva.Group;
  _surfaceLayer_timecodedFloatingContentGroups = new Map<number, Konva.Group>();
  // Sibling of _surfaceLayer_timecodedContainer (NOT nested inside it): the clipFunc that
  // confines _surfaceLayer_timecodedContainer to this slot's bounds would otherwise be
  // inherited by any descendant, so content that must spread beyond this slot (e.g. thumbnail
  // hover previews) is anchored to its own top-level, unclipped container instead.
  _surfaceLayer_timecodedSpreadContainer!: Konva.Group;
  _surfaceLayer_timecodedSpreadGroup!: Konva.Group;
  _surfaceLayer_timecodedSpreadContentGroups = new Map<number, Konva.Group>();
  // endregion

  private _lanes: TimelineLaneApi[] = [];
  private _scrollY: number = 0;
  private _fixedHeight: number | undefined;
  private _rightPaneClipPadding: number = 0;

  private _leftBgRect: Konva.Rect;
  private _rightBgRect: Konva.Rect;

  constructor(type: TimelineSlotType) {
    this._type = type;
    this._leftBgRect = KonvaFactory.createRect();
    this._rightBgRect = KonvaFactory.createRect();
  }

  /**
   * Creates all Konva and flex groups for this slot.
   */
  createGroups(
    style: TimelineStyle,
    surfaceLayer: Konva.Layer,
    mainContentGroups: number,
    surfaceContentGroups: number,
    fixedHeight?: number
  ): void {
    this._fixedHeight = fixedHeight;

    this._mainFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      flexDirection: 'FLEX_DIRECTION_ROW',
      justifyContent: 'JUSTIFY_FLEX_START',
      width: 'auto',
      ...(fixedHeight != null ? {height: fixedHeight} : {}),
    });

    this._leftFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._leftBgRect,
      // This slot's content can be taller than the flex group's own (viewport-clamped) box
      // when scrollable — settleLayout() below is the sole owner of this rect's height.
      bgSyncHeight: false,
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      justifyContent: 'JUSTIFY_FLEX_START',
      width: style.leftPaneWidth,
    });

    this._rightFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      konvaBgNode: this._rightBgRect,
      bgSyncHeight: false,
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      justifyContent: 'JUSTIFY_FLEX_START',
      flexGrow: 1,
    });

    this.setLeftPaneBackground(style.leftPaneBackgroundFill ?? style.backgroundFill, style.leftPaneBackgroundOpacity ?? style.backgroundOpacity);
    this.setRightPaneBackground(style.rightPaneBackgroundFill ?? style.backgroundFill, style.rightPaneBackgroundOpacity ?? style.backgroundOpacity);

    this._timecodedContainer = KonvaFactory.createGroup();

    this._timecodedFloatingGroup = KonvaFactory.createGroup({
      name: `_timecodedFloatingGroup_${this._type}`,
      draggable: true,
    });

    this._timecodedFloatingEventCatcher = KonvaFactory.createEventCatcherRect();
    this._timecodedContainer.add(this._timecodedFloatingGroup.add(this._timecodedFloatingEventCatcher));

    for (let i = 0; i < mainContentGroups; i++) {
      const group = KonvaFactory.createGroup();
      this._timecodedFloatingGroup.add(group);
      this._timecodedFloatingContentGroups.set(i, group);
    }

    this._surfaceLayer_timecodedContainer = KonvaFactory.createGroup();
    this._surfaceLayer_timecodedFloatingGroup = KonvaFactory.createGroup();
    this._surfaceLayer_timecodedContainer.add(this._surfaceLayer_timecodedFloatingGroup);

    this._surfaceLayer_timecodedSpreadContainer = KonvaFactory.createGroup();
    this._surfaceLayer_timecodedSpreadGroup = KonvaFactory.createGroup();
    this._surfaceLayer_timecodedSpreadContainer.add(this._surfaceLayer_timecodedSpreadGroup);

    for (let i = 0; i < surfaceContentGroups; i++) {
      const group = KonvaFactory.createGroup();
      this._surfaceLayer_timecodedFloatingGroup.add(group);
      this._surfaceLayer_timecodedFloatingContentGroups.set(i, group);

      const spreadGroup = KonvaFactory.createGroup();
      this._surfaceLayer_timecodedSpreadGroup.add(spreadGroup);
      this._surfaceLayer_timecodedSpreadContentGroups.set(i, spreadGroup);
    }

    surfaceLayer.add(this._surfaceLayer_timecodedContainer);
    surfaceLayer.add(this._surfaceLayer_timecodedSpreadContainer);

    this._timecodedWrapperFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      positionType: 'POSITION_TYPE_ABSOLUTE',
      width: '100%',
      height: '100%',
      paddings: FlexSpacingBuilder.create().spacing(style.rightPaneMarginLeft, 'EDGE_START').spacing(style.rightPaneMarginRight, 'EDGE_END').build(),
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

    this._staticFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      positionType: 'POSITION_TYPE_ABSOLUTE',
      flexDirection: 'FLEX_DIRECTION_COLUMN',
      width: '100%',
      height: '100%',
    });

    this._rightGutterFlexGroup = KonvaFlexGroup.of({
      konvaNode: KonvaFactory.createGroup(),
      positionType: 'POSITION_TYPE_ABSOLUTE',
      width: '100%',
      height: '100%',
    });

    this._mainFlexGroup
      .addChild(this._leftFlexGroup)
      .addChild(
        this._rightFlexGroup
          .addChild(this._staticFlexGroup)
          .addChild(this._timecodedWrapperFlexGroup.addChild(this._timecodedContainerFlexGroup.addChild(this._timecodedContainerStaticFlexGroup)))
      )
      .addChild(this._rightGutterFlexGroup);
  }

  addLane(lane: TimelineLaneApi, index: number): void {
    this._lanes.splice(index, 0, lane);
    this._leftFlexGroup.addChild(lane.mainLeftFlexGroup, index);
    this._staticFlexGroup.addChild(lane.mainRightFlexGroup, index);
  }

  removeLane(lane: TimelineLaneApi, refreshLayout: boolean = true): void {
    this._leftFlexGroup.removeChild(lane.mainLeftFlexGroup, refreshLayout);
    this._staticFlexGroup.removeChild(lane.mainRightFlexGroup, refreshLayout);
    this._lanes = this._lanes.filter((l) => l.id !== lane.id);
  }

  refreshLaneLayout(): void {
    this._leftFlexGroup.refreshLayoutFromRoot();
    this._staticFlexGroup.refreshLayoutFromRoot();
  }

  setTimecodedScrollX(x: number): void {
    this._timecodedFloatingGroup.x(x);
  }

  setTimecodedWidth(width: number): void {
    this._timecodedFloatingGroup.setAttrs({width});
    this._timecodedFloatingGroup.getChildren().forEach((node) => {
      node.setAttrs({width});
    });
  }

  setLeftPaneWidth(width: number): void {
    this._leftFlexGroup.setWidth(width);
  }

  setRightPaneMargins(marginLeft: number, marginRight: number): void {
    this._timecodedWrapperFlexGroup.setPaddings(FlexSpacingBuilder.create().spacing(marginLeft, 'EDGE_START').spacing(marginRight, 'EDGE_END').build());
  }

  setLeftPaneBackground(fill: string, opacity: number): void {
    this._leftBgRect.setAttrs({fill, opacity});
  }

  setRightPaneBackground(fill: string, opacity: number): void {
    this._rightBgRect.setAttrs({fill, opacity});
  }

  /**
   * Set the slot's fixed outer height. Pass undefined to go back to adaptive.
   */
  setHeight(height: number | undefined): void {
    this._fixedHeight = height;
    if (height != null) {
      this._mainFlexGroup.setHeight(height);
    } else {
      this._mainFlexGroup.setHeight('auto');
    }
  }

  /**
   * Maximum vertical scroll distance for a fixed-height slot.
   * Returns 0 for adaptive slots.
   */
  getScrollRange(): number {
    if (this._fixedHeight == null) return 0;
    return Math.max(0, this.getAdaptiveHeight() - this._fixedHeight);
  }

  /** Current vertical scroll position in pixels, clamped to [0, getScrollRange()]. */
  getScrollY(): number {
    return this._scrollY;
  }

  /**
   * Scrolls a fixed-height slot vertically. Clamped to [0, getScrollRange()].
   * No-op on adaptive slots.
   */
  setVerticalScroll(y: number): void {
    if (this._fixedHeight == null) return;
    this._scrollY = Math.max(0, Math.min(y, this.getScrollRange()));
    this._applyVerticalScroll();
    // Re-sync surface layer so floating overlays (e.g. thumbnail hover) follow the scroll.
    this.syncSurfaceLayer(this._rightPaneClipPadding);
  }

  private _applyVerticalScroll(): void {
    const leftLayout = this._leftFlexGroup.getLayout();
    const rightLayout = this._rightFlexGroup.getLayout();
    this._leftFlexGroup.contentNode.konvaNode.y(leftLayout.top - this._scrollY);
    this._rightFlexGroup.contentNode.konvaNode.y(rightLayout.top - this._scrollY);
  }

  /**
   * Sum of all lane heights (including margins) — the natural/adaptive height of this slot.
   *
   * Reads the *last* lane's own computed layout rather than summing every lane's height/margins:
   * Yoga's `top` for a normal (non-absolute) flex child is already the cumulative position from
   * the parent's start edge — i.e. it already includes every earlier lane's marginTop + height +
   * marginBottom, plus this lane's own marginTop. Its own `height` and `bottom` (verified to equal
   * this lane's own marginBottom, not "space to the parent's edge") complete the stack. So
   * `top + height + bottom` on the last lane alone is exactly the total stacked content height —
   * summing `height + bottom` across every lane (the previous approach) silently dropped every
   * lane's marginTop, undercounting the real content height by their sum and leaving the scroll
   * range short by the same amount.
   */
  getAdaptiveHeight(): number {
    if (this._lanes.length === 0) {
      return 0;
    }
    const layout = this._lanes[this._lanes.length - 1]!.mainRightFlexGroup.getLayout();
    return layout.top + layout.height + layout.bottom;
  }

  /**
   * Returns fixedHeight if set, otherwise adaptive height.
   */
  getEffectiveHeight(): number {
    return this._fixedHeight ?? this.getAdaptiveHeight();
  }

  get onResize$(): Observable<void> {
    return this._resize$.asObservable();
  }

  /**
   * Called by TimelineImpl.settleLayout() after this slot's height has been recomputed.
   */
  notifyResize(): void {
    this._resize$.next();
  }

  /**
   * Recalculates timecoded group sizes and applies clip functions.
   * Called from timeline.settleLayout() after flex layout is done.
   */
  settleLayout(timecodedWidth: number, rightPaneClipPadding: number): void {
    const containerLayout = this._timecodedContainerFlexGroup.getLayout();
    // Use adaptive height so all lane timecoded content fits the floating group even when
    // the slot has a fixedHeight and lanes overflow below it (scrollable MAIN slot).
    const contentHeight = Math.max(containerLayout.height, this.getAdaptiveHeight());

    [this._timecodedFloatingGroup, ...this._timecodedFloatingGroup.getChildren()].forEach((node) => {
      node.setAttrs({
        width: timecodedWidth,
        height: contentHeight,
      });
    });

    // Left/right pane background rects are otherwise sized by their own flex group's Yoga layout
    // (see createGroups()), which — with no explicit height set — stretches only to _mainFlexGroup's
    // fixed/viewport height for a scrollable (fixedHeight) slot, not the full adaptive content
    // height. Force them to match the timecoded content height above, same reasoning, so scrolling
    // doesn't reveal unstyled background behind lanes further down than the initial viewport.
    this._leftBgRect.height(contentHeight);
    this._rightBgRect.height(contentHeight);

    this._timecodedContainer.clipFunc((ctx) => {
      ctx.rect(-rightPaneClipPadding, -500, this._timecodedContainer.width() + 2 * rightPaneClipPadding, contentHeight + 500);
    });

    if (this._fixedHeight != null) {
      const fixedHeight = this._fixedHeight;
      this._mainFlexGroup.contentNode.konvaNode.clipFunc((ctx) => {
        ctx.rect(0, 0, this._mainFlexGroup.contentNode.konvaNode.width(), fixedHeight);
      });
      // Content height may have shrunk/grown since the last scroll (a lane was hidden/shown, or
      // maxHeight/minHeight changed), leaving _scrollY stale and out of [0, getScrollRange()].
      // Re-clamp it here so the settled layout never renders with dangling empty space at the
      // bottom until the next real scroll happens to re-clamp it via setVerticalScroll().
      this._scrollY = Math.max(0, Math.min(this._scrollY, this.getScrollRange()));
      this._applyVerticalScroll();
    }
  }

  /**
   * Mirrors position and size from main layer timecoded groups to surface layer groups.
   */
  syncSurfaceLayer(rightPaneClipPadding: number): void {
    this._rightPaneClipPadding = rightPaneClipPadding;

    const containerAbsPosition = this._timecodedContainer.absolutePosition();
    const containerSize = this._timecodedContainer.size();

    this._surfaceLayer_timecodedContainer.setAttrs({
      ...containerAbsPosition,
      ...containerSize,
    });

    // _surfaceLayer_timecodedSpreadContainer is a sibling anchored to the same fixed canvas
    // position, not a child of _surfaceLayer_timecodedContainer: clipFunc is inherited by all
    // descendants, so content that must spread vertically beyond this slot's bounds needs its
    // own, separately-anchored container rather than living under the clipped one. It gets its
    // own (horizontal-only) clipFunc below.
    this._surfaceLayer_timecodedSpreadContainer.setAttrs({
      ...containerAbsPosition,
      ...containerSize,
    });

    const w = this._surfaceLayer_timecodedContainer.width();

    // Clip _surfaceLayer_timecodedContainer exactly to this slot's visible window, the same way
    // for every slot type. This container's own position is fixed (does not carry the horizontal
    // pan offset — that's on its child _surfaceLayer_timecodedFloatingGroup), so the clip rect's
    // local coordinates correctly represent the viewport regardless of zoom/scroll. After
    // syncSurfaceLayer the surface container sits at canvas-y = (slotTop − _scrollY), so the
    // visible slot area in local coords is [_scrollY, _scrollY + slotH]. Using this exact range
    // (zero buffer) prevents surface content from leaking into adjacent slots at any scroll position.
    const clipY = this._scrollY;
    const slotH = this._fixedHeight ?? this._surfaceLayer_timecodedContainer.height();
    this._surfaceLayer_timecodedContainer.clipFunc((ctx) => {
      ctx.rect(-rightPaneClipPadding, clipY, w + 2 * rightPaneClipPadding, slotH);
    });

    // _surfaceLayer_timecodedSpreadContainer is meant to be unclipped VERTICALLY (so content like
    // spanning markers can spread beyond this slot's own bounds) but must still be bounded
    // HORIZONTALLY to the timecoded area, same as the clipped container above — otherwise it can
    // bleed into the left panel. This container's own position is fixed (doesn't carry the pan
    // offset — that's on its child _surfaceLayer_timecodedSpreadGroup), so, like the clip above,
    // this clip's local coordinates correctly represent the horizontal viewport regardless of
    // scroll/zoom. A per-lane clipFunc on the content itself (e.g. MarkerTrackLane) can't do this
    // job on its own: it lives inside the panned frame, so it pans right along with the content
    // instead of acting as a fixed boundary.
    const V_UNBOUNDED = 1_000_000;
    this._surfaceLayer_timecodedSpreadContainer.clipFunc((ctx) => {
      ctx.rect(-rightPaneClipPadding, -V_UNBOUNDED, w + 2 * rightPaneClipPadding, 2 * V_UNBOUNDED);
    });

    this._surfaceLayer_timecodedFloatingGroup.setAttrs({
      ...this._timecodedFloatingGroup.position(),
      ...this._timecodedFloatingGroup.size(),
    });

    [...this._surfaceLayer_timecodedFloatingGroup.getChildren()].forEach((node) => {
      node.setAttrs({...this._timecodedFloatingGroup.size()});
    });

    // _surfaceLayer_timecodedSpreadGroup itself carries no clip — its container above already
    // bounds it horizontally while leaving it vertically free, so content added here (e.g.
    // thumbnail hover previews, spanning markers) can render beyond this slot's own vertical
    // bounds but never past the timecoded area's left/right edges.
    this._surfaceLayer_timecodedSpreadGroup.setAttrs({
      ...this._timecodedFloatingGroup.position(),
      ...this._timecodedFloatingGroup.size(),
    });

    [...this._surfaceLayer_timecodedSpreadGroup.getChildren()].forEach((node) => {
      node.setAttrs({...this._timecodedFloatingGroup.size()});
    });
  }

  addToTimecodedFloatingContent(node: Konva.Group | Konva.Shape, zIndex: number = 0): void {
    if (this._timecodedFloatingContentGroups.has(zIndex)) {
      this._timecodedFloatingContentGroups.get(zIndex)!.add(node);
    } else {
      console.error(`Main content group with zIndex: ${zIndex} does not exist in slot '${this._type}'`);
    }
  }

  addToTimecodedStaticContent(node: Konva.Group | Konva.Shape): void {
    this._timecodedContainerStaticFlexGroup.contentNode.konvaNode.add(node);
  }

  addToSurfaceLayerTimecodedFloatingContent(node: Konva.Group | Konva.Shape, zIndex: number = 0): void {
    if (this._surfaceLayer_timecodedFloatingContentGroups.has(zIndex)) {
      this._surfaceLayer_timecodedFloatingContentGroups.get(zIndex)!.add(node);
    } else {
      console.error(`Surface content group with zIndex: ${zIndex} does not exist in slot '${this._type}'`);
    }
  }

  /**
   * Like addToSurfaceLayerTimecodedFloatingContent, but the content is added to a group that's
   * unclipped VERTICALLY: it can render beyond this slot's own vertical bounds, spreading over
   * the whole timeline canvas. It's still bounded horizontally to the timecoded area (won't bleed
   * into the left panel). Intended for popup-style overlays (e.g. thumbnail hover previews,
   * spanning markers) rather than regular lane content.
   */
  addToSurfaceLayerSpreadContent(node: Konva.Group | Konva.Shape, zIndex: number = 0): void {
    if (this._surfaceLayer_timecodedSpreadContentGroups.has(zIndex)) {
      this._surfaceLayer_timecodedSpreadContentGroups.get(zIndex)!.add(node);
    } else {
      console.error(`Surface spread content group with zIndex: ${zIndex} does not exist in slot '${this._type}'`);
    }
  }

  get type(): TimelineSlotType {
    return this._type;
  }

  get lanes(): TimelineLaneApi[] {
    return this._lanes;
  }

  /** Scroll-exempt overlay spanning this slot's full bounds — see _rightGutterFlexGroup above. */
  get rightGutterGroup(): Konva.Group {
    return this._rightGutterFlexGroup.contentNode.konvaNode;
  }

  destroy(): void {
    this._resize$.complete();

    this._mainFlexGroup.destroy();
    // @ts-ignore
    this._mainFlexGroup = void 0;

    this._leftFlexGroup.destroy();
    // @ts-ignore
    this._leftFlexGroup = void 0;

    this._rightFlexGroup.destroy();
    // @ts-ignore
    this._rightFlexGroup = void 0;

    this._staticFlexGroup.destroy();
    // @ts-ignore
    this._staticFlexGroup = void 0;

    this._timecodedWrapperFlexGroup.destroy();
    // @ts-ignore
    this._timecodedWrapperFlexGroup = void 0;

    this._timecodedContainerFlexGroup.destroy();
    // @ts-ignore
    this._timecodedContainerFlexGroup = void 0;

    this._timecodedContainerStaticFlexGroup.destroy();
    // @ts-ignore
    this._timecodedContainerStaticFlexGroup = void 0;

    this._rightGutterFlexGroup.destroy();
    // @ts-ignore
    this._rightGutterFlexGroup = void 0;

    this._surfaceLayer_timecodedContainer.destroy();
    this._surfaceLayer_timecodedSpreadContainer.destroy();
  }
}
