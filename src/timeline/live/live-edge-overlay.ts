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

export interface LiveEdgeOverlayStyle {
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

  /** Vertical line marking the start of the locked region (drawn at `startTime`). */
  borderColor: string;
  borderWidth: number;
  borderOpacity: number;
  /** Konva dash array — `[]` for a solid line, e.g. `[4, 4]` for a dashed one. */
  borderDash: number[];
}

export interface LiveEdgeOverlayConfig extends ComponentConfig<LiveEdgeOverlayStyle> {}

export const LIVE_EDGE_OVERLAY_STYLE_DEFAULT: LiveEdgeOverlayStyle = {
  fill: '#eceef1',
  fillOpacity: 0.72,

  hatchStroke: '#b9bcc4',
  hatchOpacity: 0.8,
  hatchLineWidth: 1,
  hatchSpacing: 8,
  hatchMirrored: false,

  borderColor: '#8a8f9c',
  borderWidth: 1.5,
  borderOpacity: 0.9,
  borderDash: [],
};

const configDefault: LiveEdgeOverlayConfig = {
  style: LIVE_EDGE_OVERLAY_STYLE_DEFAULT,
};

export interface LiveEdgeOverlayRange {
  /** Left edge of the reserved/locked region — the live sync position. */
  startTime: number;
  /** Right edge — {@link liveEdgeDuration} when near the live edge, else the reserved extent end. */
  endTime: number;
}

/**
 * Spanning-floating-group component that renders the reserved/locked live-buffer region as a
 * hatched, desaturating overlay from `startTime` to `endTime`, with a border marking its left edge
 * (the live sync position). Purely presentational —
 * {@link TimelineImpl} owns the geometry decisions and only ever calls {@link
 * setVisible} and {@link update} here; all colors/sizes come from {@link LiveEdgeOverlayStyle},
 * threaded through {@link TimelineStyle}'s `liveEdgeOverlay*` fields like every other spanning
 * component's style.
 */
export class LiveEdgeOverlay extends BaseKonvaComponent<LiveEdgeOverlayConfig, LiveEdgeOverlayStyle, Konva.Group> implements OnMeasurementsChange {
  private readonly _timeline: TimelineImpl;

  private readonly _group: Konva.Group;
  private readonly _tintRect: Konva.Rect;
  private readonly _hatchRect: Konva.Rect;
  private readonly _borderLine: Konva.Line;

  private _range: LiveEdgeOverlayRange = {startTime: 0, endTime: 0};

  constructor(config: Partial<ConfigWithOptionalStyle<LiveEdgeOverlayConfig>>, timeline: TimelineImpl) {
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

    // Style-only, not redraw(): at construction time (TimelineImpl.createCanvas()) the scrubber
    // lane redraw() reads for ruler height doesn't exist yet. The first real geometry pass happens
    // later, from update()/onMeasurementsChange().
    this.applyStyle();

    this._styleAdapter.onChange$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
      this.applyStyle();
      this.redraw();
    });

    // zoomByWidth() (every zoom entry point, per animation frame for eased zooms) only touches raw
    // Konva attrs + emits these events — it never runs the umbrella settleLayout() that normally
    // calls onMeasurementsChange(). Without this, the overlay stays frozen mid-zoom/scroll until
    // something else (a live reflow) happens to redraw it. Mirrors Playhead's identical subscription.
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
  update(range: LiveEdgeOverlayRange): void {
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

    this._borderLine.setAttrs({
      x: startX,
      points: [0, 0, 0, height],
    });
  }
}
