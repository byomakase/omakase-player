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
import {BaseKonvaComponent, type ComponentConfig, type ConfigWithOptionalStyle} from '../layout/konva-component';
import type {OnMeasurementsChange} from '../model';
import type {TimelineImpl} from '../timeline';
import {TimelineEventType} from '../timeline-api';
import {TIMELINE} from '../../constants';
import {KonvaFactory} from '../konva/konva-factory';
import {createHatchTile} from './hatch-tile';

export interface EvictedRegionOverlayStyle {
  /** Solid wash under the hatch, desaturating whatever lane content it sits over. */
  fill: string;
  fillOpacity: number;

  hatchStroke: string;
  hatchOpacity: number;
  hatchLineWidth: number;
  /** Tile size (px) of the repeating diagonal hatch pattern — one line per tile. */
  hatchSpacing: number;
  /** Mirrors the diagonal direction: `false` draws "/", `true` draws "\". */
  hatchMirrored: boolean;

  /** Vertical line marking the end of the evicted region (drawn at `endTime`, the true live start). */
  borderColor: string;
  borderWidth: number;
  borderOpacity: number;
  /** Konva dash array — `[]` for a solid line, e.g. `[4, 4]` for a dashed one. */
  borderDash: number[];
}

export interface EvictedRegionOverlayConfig extends ComponentConfig<EvictedRegionOverlayStyle> {}

export const EVICTED_REGION_OVERLAY_STYLE_DEFAULT: EvictedRegionOverlayStyle = {
  fill: '#2b1f1f',
  fillOpacity: 0.45,

  hatchStroke: '#8a6a6a',
  hatchOpacity: 0.7,
  hatchLineWidth: 1,
  hatchSpacing: 8,
  // Mirrored (opposite of LiveEdgeOverlay's default "/") so the two hatched regions read as
  // visually distinct at a glance, even with identical geometry.
  hatchMirrored: true,

  borderColor: '#a97b7b',
  borderWidth: 1.5,
  borderOpacity: 0.9,
  borderDash: [4, 4],
};

const configDefault: EvictedRegionOverlayConfig = {
  style: EVICTED_REGION_OVERLAY_STYLE_DEFAULT,
};

export interface EvictedRegionOverlayRange {
  /** Left edge of the rendered timeline — {@link TimelineImpl}'s `_liveDisplayOrigin`. */
  startTime: number;
  /** Right edge — the true, current `liveStartTime`; where genuinely seekable content begins. */
  endTime: number;
}

/**
 * Spanning-floating-group component that marks the region between the rendered timeline's left
 * edge and the true, current live start — content still shown (thumbnails, markers, ticks) whose
 * underlying segments have already been evicted upstream, so it's no longer actually seekable.
 * Only ever non-empty under {@link TimelineConfig.liveHistoryRetention}; otherwise the rendered
 * edge always tracks the true live start exactly, leaving nothing to mark.
 *
 * Purely presentational, same as {@link LiveEdgeOverlay} — {@link TimelineImpl} owns the geometry
 * decisions and only ever calls {@link setVisible} and {@link update} here. It does not block
 * clicks/drags itself (nothing in this spanning group does — see {@link LiveEdgeOverlay}'s class
 * comment); seeking into this region is instead clamped forward at the source, in {@link
 * TimelineImpl.clampSeekTarget}.
 */
export class EvictedRegionOverlay extends BaseKonvaComponent<EvictedRegionOverlayConfig, EvictedRegionOverlayStyle, Konva.Group> implements OnMeasurementsChange {
  private readonly _timeline: TimelineImpl;

  private readonly _group: Konva.Group;
  private readonly _tintRect: Konva.Rect;
  private readonly _hatchRect: Konva.Rect;
  private readonly _borderLine: Konva.Line;

  private _range: EvictedRegionOverlayRange = {startTime: 0, endTime: 0};

  constructor(config: Partial<ConfigWithOptionalStyle<EvictedRegionOverlayConfig>>, timeline: TimelineImpl) {
    super({
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      },
    });

    this._timeline = timeline;

    this._group = KonvaFactory.createGroup({
      ...TIMELINE.positionTopLeft,
      visible: false,
      listening: false,
    });

    this._tintRect = KonvaFactory.createRect({
      ...TIMELINE.positionTopLeft,
      listening: false,
    });

    this._hatchRect = KonvaFactory.createRect({
      ...TIMELINE.positionTopLeft,
      fillPatternRepeat: 'repeat',
      listening: false,
    });

    this._borderLine = new Konva.Line({
      points: [0, 0, 0, 0],
      listening: false,
    });

    this._group.add(this._tintRect, this._hatchRect, this._borderLine);

    // Style-only, not redraw(): mirrors LiveEdgeOverlay — the first real geometry pass happens
    // later, from update()/onMeasurementsChange().
    this.applyStyle();

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
      this.applyStyle();
      this.redraw();
    });

    // Same rationale as LiveEdgeOverlay's identical subscription: zoomByWidth() never runs the
    // umbrella settleLayout() that would otherwise call onMeasurementsChange(), so without this the
    // overlay stays frozen mid-zoom/scroll.
    this._timeline.onEvent$
      .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_ZOOM || p.type === TimelineEventType.TIMELINE_SCROLL))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.redraw();
      });
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  setVisible(visible: boolean): void {
    this._group.visible(visible);
  }

  /** Times, not pixels — converted to the current zoom/scroll on every call, and again on {@link onMeasurementsChange}. */
  update(range: EvictedRegionOverlayRange): void {
    this._range = range;
    this.redraw();
  }

  onMeasurementsChange(): void {
    this.redraw();
  }

  private applyStyle(): void {
    this._tintRect.setAttrs({
      fill: this.style.fill,
      opacity: this.style.fillOpacity,
    });

    this._hatchRect.fillPatternImage(createHatchTile(this.style));

    this._borderLine.setAttrs({
      stroke: this.style.borderColor,
      strokeWidth: this.style.borderWidth,
      opacity: this.style.borderOpacity,
      dash: this.style.borderDash,
    });
  }

  private redraw(): void {
    const startX = this._timeline.timeToTimelinePosition(this._range.startTime);
    const endX = Math.max(startX, this._timeline.timeToTimelinePosition(this._range.endTime));
    const width = endX - startX;
    const height = this._timeline.getSpanningContentHeight();

    [this._tintRect, this._hatchRect].forEach((rect) => {
      rect.setAttrs({x: startX, width, height});
    });

    // Border marks the *right* edge (endTime) — where genuinely seekable content begins — the
    // mirror image of LiveEdgeOverlay's border marking its region's left edge.
    this._borderLine.setAttrs({
      x: endX,
      points: [0, 0, 0, height],
    });
  }
}
