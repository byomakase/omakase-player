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

import {
  BaseObservationTrackLane,
  type ObservationTrackLaneConfig,
  type ObservationTrackLaneStyle,
  type ObservationTrackLaneTrackConfig,
} from './observation-track-lane';
import {TIMELINE_LANE_CONFIG_DEFAULT} from '../timeline-lane';
import type {ConfigAndStyle} from '../timeline-api';
import {omitKeys} from '../../util/object-util';
import {
  type Observation,
  type ObservationItem,
  type ObservationState,
  type ObservationTrack,
  TimedItemsTrackEventType,
  TimedItemTemporalUtil
} from '../../media';
import {type ObservationTrackView} from './observation-track-view';
import {type TimelineImpl} from '../timeline';
import {type Color, type Size, type StyledElement, Ui} from '../../ui';
import {KonvaFactory} from '../konva/konva-factory';
import Konva from 'konva';
import {debounceTime, filter, Observable, Subject, takeUntil} from 'rxjs';
import {BaseKonvaComponent2} from '../layout/konva-component';
import type {Position} from '../model';
import {freeObserver} from '../../util/rxjs-util';
import type {InterpolationStrategy} from '../../track';
import {ObservationTrackDownsampler, ObservationTrackInterpolator} from '../../track';
import Decimal from 'decimal.js';
import type {WithRequired} from '../../types/ts-types';
import {TIMELINE} from '../../constants';

export interface LineChartLaneConfig extends ObservationTrackLaneConfig {}

export interface LineChartLaneLaneStyle extends ObservationTrackLaneStyle {}

type LineChartLaneTrackScale = {
  min: number;
  max: number;
};

/**
 * Per-track configuration for {@link LineChartLane}.
 * Each track added via `addTrack()` can carry its own scale, baseline, interpolation
 * settings, and visual style that override lane-level defaults.
 */
export interface LineChartLaneTrackConfig extends ObservationTrackLaneTrackConfig {
  /** Value domain for this track. Auto-derived from data when omitted. */
  scale?: LineChartLaneTrackScale;
  /** Value that maps to the line baseline (zero-crossing). Defaults to 0. */
  scaleBaseline?: number;
  /** Aggregation strategy used when multiple samples fall in the same interpolation bucket. */
  interpolationStrategy?: InterpolationStrategy;
  /** Width in pixels of a single interpolation bucket. Smaller = more detail */
  interpolationWidth?: number;

  style?: LineChartLaneTrackStyle;
}

export interface LineChartLaneTrackStyle {
  paddingTop?: number;
  paddingBottom?: number;
  baselineFill?: Color;
  baselineThickness?: Size;
  baselineDash?: Size[];
  measurements?: Partial<LineChartLaneTrackMeasurementStyle>[];
}

const LINE_CHART_LANE_TRACK_CONFIG_DEFAULT: WithRequired<LineChartLaneTrackConfig, 'interpolationWidth' | 'interpolationStrategy' | 'scaleBaseline'> = {
  interpolationWidth: 20,
  scaleBaseline: 0,
  interpolationStrategy: 'avg',
};

const LINE_CHART_LANE_TRACK_MEASUREMENT_STYLE_DEFAULT: Pick<LineChartLaneTrackMeasurementStyle, 'lineStrokeWidth' | 'lineStroke' | 'lineOpacity'> = {
  lineStrokeWidth: 1,
  lineStroke: TIMELINE.defaultColor,
  lineOpacity: 1,
};

/**
 * Visual style for a single measurement series within a line-chart track.
 * Matched to data by `measurement`; unmatched measurements use defaults.
 */
export interface LineChartLaneTrackMeasurementStyle {
  /** Measurement this style applies to (matches {@link ObservationItem.measurement}). When omitted, acts as a wildcard fallback for any measurement that has no specific entry. */
  measurement?: ObservationItem['measurement'];
  /** Radius of each data-point circle in pixels. */
  pointRadius: Size;
  /** Fill color of data-point circles. */
  pointFill: Color;
  /** Opacity of data-point circles (0–1). */
  pointOpacity: Size;
  /** Stroke color of data-point circles. */
  pointStroke: Color;
  /** Stroke width of data-point circles in pixels. */
  pointStrokeWidth: Size;
  /** Color of the connecting polyline. */
  lineStroke: Color;
  /** Width of the connecting polyline in pixels. */
  lineStrokeWidth: Size;
  /** Dash pattern for the connecting polyline (Konva format). */
  lineDash: Size[];
  /** Opacity of the connecting polyline (0–1). */
  lineOpacity: Size;
  /** Solid fill color for the area below the line. Mutually exclusive with `fillBelowLinearGradientColorStops`. */
  fillBelow: Color;
  /** Gradient color stops (Konva format, top→bottom) for the area below the line. */
  fillBelowLinearGradientColorStops: (number | string)[];
  /** Solid fill color for the area above the line. Mutually exclusive with `fillAboveLinearGradientColorStops`. */
  fillAbove: Color;
  /** Gradient color stops (Konva format, bottom→top) for the area above the line. */
  fillAboveLinearGradientColorStops: (number | string)[];
}

const configDefault: LineChartLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
};

export class LineChartLane extends BaseObservationTrackLane<LineChartLaneConfig, LineChartLaneLaneStyle, LineChartLaneTrackConfig> {
  protected _downsamplers: Map<ObservationTrack['id'], ObservationTrackDownsampler> = new Map();
  private _typedTrackViews: Map<ObservationTrack['id'], TrackView> = new Map();

  constructor(configAndStyle?: ConfigAndStyle<LineChartLaneConfig, LineChartLaneLaneStyle>) {
    super(
      {
        ...configDefault,
        ...omitKeys(configAndStyle, 'style'),
      },
      configAndStyle?.style
    );
  }

  override addTrack(track: ObservationTrack, config?: LineChartLaneTrackConfig): void;
  override addTrack(id: ObservationTrack['id'], config?: LineChartLaneTrackConfig): void;
  override addTrack(trackOrId: ObservationTrack | ObservationTrack['id'], config?: LineChartLaneTrackConfig): void {
    const track: ObservationTrack = typeof trackOrId === 'string' ? (this._trackRepository!.getOrFail(trackOrId) as ObservationTrack) : trackOrId;
    const downsampler = new ObservationTrackDownsampler(track, {
      ...this._config.downsampleOptions,
    });
    this._downsamplers.set(track.id, downsampler);

    super.addTrack(track, config);

    const trackBreaker = this._trackBreakers.get(track.id)!;

    downsampler.downsampledTrack.onEvent$
      .pipe(
        filter(
          (e) =>
            e.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED ||
            e.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED ||
            e.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED
        )
      )
      .pipe(debounceTime(0))
      .pipe(takeUntil(trackBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        if (this._canRender) {
          this._trackViews.get(track.id)?.render(this._timeline!.getVisibleTimeRange());
        }
      });
  }

  protected renderTrack(track: ObservationTrack, config: LineChartLaneTrackConfig | undefined): ObservationTrackView {
    const view = new TrackView({
      config: config,
      timeline: this._timeline!,
      timelineLane: this,
      ui: this._ui!,
      downsampler: this._downsamplers.get(track.id)!,
    });
    this._typedTrackViews.set(track.id, view);
    return view;
  }

  protected override onTrackRemoved(trackId: ObservationTrack['id']): void {
    super.onTrackRemoved(trackId);

    const downsampler = this._downsamplers.get(trackId);
    downsampler?.destroy();
    this._downsamplers.delete(trackId);
    this._typedTrackViews.delete(trackId);
  }

  protected override hasVisualElements(): boolean {
    return [...this._typedTrackViews.values()].some((v) => v.viewCount > 0);
  }

  protected override createLoadingGroupContent(width: number, height: number): Konva.Animation {
    const firstConfig = this._trackConfigs.values().next().value as LineChartLaneTrackConfig | undefined;
    const interpolationWidth = firstConfig?.interpolationWidth ?? LINE_CHART_LANE_TRACK_CONFIG_DEFAULT.interpolationWidth;
    const lineStrokeWidth = firstConfig?.style?.measurements?.[0]?.lineStrokeWidth ?? LINE_CHART_LANE_TRACK_MEASUREMENT_STYLE_DEFAULT.lineStrokeWidth;
    const fill = this.style.loadingAnimationFill;
    const speed = this.style.loadingAnimationSpeed ?? 1600;

    const step = interpolationWidth;
    const count = Math.max(2, Math.floor(width / step) + 1);
    const midY = height * 0.5;
    const amplitude = height * 0.35;

    const TAU = 2 * Math.PI;
    const pointParams = Array.from({length: count}, (_, i) => [
      {period: speed * 0.22 + ((i * 137) % Math.round(speed * 0.31)), phase: (i * 2.3999632) % TAU},
      {period: speed * 0.41 + ((i * 89) % Math.round(speed * 0.19)), phase: (i * 5.7114) % TAU},
      {period: speed * 0.67 + ((i * 53) % Math.round(speed * 0.13)), phase: (i * 3.9269) % TAU},
    ]);

    const buildWavePoints = (t: number): number[] => {
      const pts: number[] = [];
      for (let i = 0; i < count; i++) {
        const [p0, p1, p2] = pointParams[i]!;
        const y = Math.sin((t * TAU) / p0!.period + p0!.phase) + 0.5 * Math.sin((t * TAU) / p1!.period + p1!.phase) + 0.25 * Math.sin((t * TAU) / p2!.period + p2!.phase);
        pts.push(i * step, midY + amplitude * (y / 1.75));
      }
      return pts;
    };

    const initialWave = buildWavePoints(0);

    const edgeLine = KonvaFactory.createLine({
      points: initialWave,
      stroke: fill,
      strokeWidth: lineStrokeWidth,
      tension: 0.1,
      listening: false,
      perfectDrawEnabled: false,
    });

    this._loadingGroup!.add(edgeLine);

    const anim = new Konva.Animation((frame) => {
      edgeLine.points(buildWavePoints(frame!.time));
    }, this._loadingGroup!.getLayer());

    anim.start();
    return anim;
  }

  override destroy(): void {
    super.destroy();

    this._downsamplers.forEach((downsampler) => downsampler.destroy());
    this._downsamplers.clear();
  }
}

class TrackView extends BaseKonvaComponent2<Konva.Group> implements ObservationTrackView {
  protected _config: LineChartLaneTrackConfig | undefined;
  protected _downsampler: ObservationTrackDownsampler;
  protected _timeline: TimelineImpl;
  protected _timelineLane: LineChartLane;
  protected _ui: Ui;

  protected _group: Konva.Group;

  private _baselineLine?: Konva.Line | undefined;
  private _baselineY?: number;

  protected _measurementViews: TrackMeasurementsView[] = [];

  constructor(args: {config: LineChartLaneTrackConfig | undefined; downsampler: ObservationTrackDownsampler; timelineLane: LineChartLane; timeline: TimelineImpl; ui: Ui}) {
    super();
    this._config = args.config;
    this._downsampler = args.downsampler;
    this._timeline = args.timeline;
    this._timelineLane = args.timelineLane;
    this._ui = args.ui;

    this._group = KonvaFactory.createGroup();
  }

  private _knownMeasurements = new Set<ObservationItem['measurement']>();

  private ensureMeasurementViews() {
    const measurements = new Set(this._downsampler.downsampledTrack.timedItemsSorted.flatMap((obs) => obs.items.map((item) => item.measurement)));
    measurements.forEach((measurement) => {
      if (!this._knownMeasurements.has(measurement)) {
        this._knownMeasurements.add(measurement);
        const measurementView = new TrackMeasurementsView({
          measurement,
          config: this._config,
          timeline: this._timeline,
          timelineLane: this._timelineLane,
          ui: this._ui,
          downsampler: this._downsampler,
        });
        this._measurementViews.push(measurementView);
        this._group.add(measurementView.konvaNode);
      }
    });
  }

  get viewCount(): number {
    return this._measurementViews.reduce((sum, v) => sum + v.viewCount, 0);
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  clearContent() {
    this._measurementViews.forEach((p) => p.clearContent());
  }

  render(timeRange: {start: number; end: number}) {
    this.ensureMeasurementViews();
    this.updateBaseline(timeRange);
    this._measurementViews.forEach((p) => p.render(timeRange));
  }

  updatePositions(timeRange: {start: number; end: number}) {
    if (this._baselineLine && this._baselineY !== undefined) {
      const x1 = this._timeline.timeToTimelinePosition(timeRange.start);
      const x2 = this._timeline.timeToTimelinePosition(timeRange.end);
      this._baselineLine.points([x1, this._baselineY, x2, this._baselineY]);
    }
    this._measurementViews.forEach((p) => p.updatePositions(timeRange));
  }

  private computeBaselineY(): number | undefined {
    const scale = this._config?.scale;
    if (!scale) return undefined;
    const scaleBaseline = this._config?.scaleBaseline ?? LINE_CHART_LANE_TRACK_CONFIG_DEFAULT.scaleBaseline;
    const height = this._timelineLane.style.height;
    const scaleSize = scale.max - scale.min;
    const clamp = (v: number) => Math.max(0, Math.min(height, v));
    this._baselineY = clamp(((scale.max - scaleBaseline) / scaleSize) * height);
    return this._baselineY;
  }

  private updateBaseline(timeRange: {start: number; end: number}) {
    const style = this._config?.style;
    if (!style?.baselineFill || !this._config?.scale) {
      this._baselineLine?.destroy();
      this._baselineLine = undefined;
      return;
    }

    const baselineY = this.computeBaselineY()!;
    const x1 = this._timeline.timeToTimelinePosition(timeRange.start);
    const x2 = this._timeline.timeToTimelinePosition(timeRange.end);

    if (!this._baselineLine) {
      this._baselineLine = new Konva.Line({
        points: [x1, baselineY, x2, baselineY],
        stroke: style.baselineFill,
        strokeWidth: style.baselineThickness ?? 1,
        dash: style.baselineDash ?? [],
        listening: false,
        perfectDrawEnabled: false,
      });
      this._group.add(this._baselineLine);
      this._baselineLine.moveToBottom();
    } else {
      this._baselineLine.setAttrs({
        points: [x1, baselineY, x2, baselineY],
        stroke: style.baselineFill,
        strokeWidth: style.baselineThickness ?? 1,
        dash: style.baselineDash ?? [],
      });
    }
  }

  destroy() {
    this._baselineLine?.destroy();
    this._baselineLine = undefined;
    this._measurementViews.forEach((p) => p.destroy());
    this._measurementViews = [];
    this._group.destroy();
    this._group = null!;
  }
}

class TrackMeasurementsView extends BaseKonvaComponent2<Konva.Group> {
  protected _downsampler: ObservationTrackDownsampler;

  protected _measurement: ObservationItem['measurement'];
  protected _config?: LineChartLaneTrackConfig | undefined;

  protected _timeline: TimelineImpl;
  protected _timelineLane: LineChartLane;
  protected _ui: Ui;

  private _interpolator?: ObservationTrackInterpolator | undefined;
  private _polyline?: Konva.Line | undefined;
  private _fillBelowShape?: Konva.Line | undefined;
  private _fillAboveShape?: Konva.Line | undefined;

  protected readonly _measurementItemViews: Map<Observation['id'], MeasurementItemView> = new Map<Observation['id'], MeasurementItemView>();

  get viewCount(): number {
    return this._measurementItemViews.size;
  }

  protected _group: Konva.Group;

  constructor(args: {
    measurement: ObservationItem['measurement'];
    config?: LineChartLaneTrackConfig | undefined;
    downsampler: ObservationTrackDownsampler;
    timelineLane: LineChartLane;
    timeline: TimelineImpl;
    ui: Ui;
  }) {
    super();
    this._measurement = args.measurement;
    this._downsampler = args.downsampler;
    this._config = args.config;
    this._timeline = args.timeline;
    this._timelineLane = args.timelineLane;
    this._ui = args.ui;

    this._group = KonvaFactory.createGroup({
      height: this._timelineLane.style.height,
    });
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  clearContent() {
    this._polyline?.destroy();
    this._polyline = undefined;
    this._fillBelowShape?.destroy();
    this._fillBelowShape = undefined;
    this._fillAboveShape?.destroy();
    this._fillAboveShape = undefined;
    this._measurementItemViews.forEach((view) => view.destroy());
    this._measurementItemViews.clear();
  }

  private getStyle(): Partial<LineChartLaneTrackMeasurementStyle> | undefined {
    const entries = this._config?.style?.measurements;
    if (!entries) return undefined;
    return entries.find((p) => p.measurement === this._measurement) ?? entries.find((p) => p.measurement === undefined);
  }

  render(timeRange: {start: number; end: number}) {
    if (this._interpolator) {
      this._interpolator.destroy();
      this._interpolator = void 0;
    }

    this.clearContent();

    const interpolationWidth = this._config?.interpolationWidth ?? LINE_CHART_LANE_TRACK_CONFIG_DEFAULT.interpolationWidth;
    const interpolationStrategy: InterpolationStrategy = this._config?.interpolationStrategy ?? LINE_CHART_LANE_TRACK_CONFIG_DEFAULT.interpolationStrategy;

    const visiblePx = this._timeline.timeToTimelinePosition(timeRange.end) - this._timeline.timeToTimelinePosition(timeRange.start);
    const numberOfInterpolations = Math.ceil(visiblePx / interpolationWidth);
    const interpolationPeriod = new Decimal(timeRange.end - timeRange.start).mul(1000).div(numberOfInterpolations).toNumber();
    const interpolationPeriodSec = interpolationPeriod / 1000;

    // Expand by one bucket-width on each side for line continuity at viewport edges.
    // Additionally include the nearest neighbor observation outside the visible range so
    // that a single isolated dot is never drawn when zoomed far in on sparse data.
    const downsampledItems = this._downsampler.downsampledTrack.timedItemsSorted;
    let expandStart = timeRange.start - interpolationPeriodSec;
    let expandEnd = timeRange.end + interpolationPeriodSec;

    for (let i = downsampledItems.length - 1; i >= 0; i--) {
      const t = TimedItemTemporalUtil.extractStartTime(downsampledItems[i]!.temporal);
      if (t !== undefined && t < timeRange.start) {
        expandStart = Math.min(expandStart, t);
        break;
      }
    }

    for (let i = 0; i < downsampledItems.length; i++) {
      const t = TimedItemTemporalUtil.extractStartTime(downsampledItems[i]!.temporal);
      if (t !== undefined && t > timeRange.end) {
        expandEnd = Math.max(expandEnd, t);
        break;
      }
    }

    const expandedTimeRange = {start: expandStart, end: expandEnd};

    this._interpolator = new ObservationTrackInterpolator(this._downsampler.downsampledTrack, {
      timeRange: expandedTimeRange,
      interpolationStrategy: interpolationStrategy,
      interpolationPeriod: interpolationPeriod,
    });

    const scale: LineChartLaneTrackScale = this._config?.scale
      ? this._config.scale
      : this._downsampler.downsampledTrack.timedItemsSorted
          .flatMap((obs) => obs.items)
          .filter((item) => item.measurement === this._measurement && item.value !== undefined)
          .reduce(
            (acc, item) => {
              const v = parseFloat(item.value!);
              if (isNaN(v)) return acc;
              return {min: Math.min(acc.min, v), max: Math.max(acc.max, v)};
            },
            {min: Infinity, max: -Infinity}
          );

    const scaleBaseline = this._config?.scaleBaseline ?? LINE_CHART_LANE_TRACK_CONFIG_DEFAULT.scaleBaseline;
    const measurementStyle = this.getStyle();

    const polylinePoints: number[] = [];

    this._interpolator.interpolatedTrack.timedItemsSorted.forEach((timedItem) => {
      const startTime = TimedItemTemporalUtil.extractStartTime(timedItem.temporal);
      if (startTime === undefined) return;

      const view = this.createView(timedItem, {
        measurement: this._measurement,
        scale,
        scaleBaseline,
        startTime,
        style: measurementStyle,
      });

      const pos = view.computePosition();
      polylinePoints.push(pos.x, pos.y);
    });

    if (polylinePoints.length >= 4) {
      const containerHeight = this._timelineLane.style.height;
      const firstX: number = polylinePoints[0]!;
      const lastX: number = polylinePoints[polylinePoints.length - 2]!;

      const fillBelowColor = measurementStyle?.fillBelow;
      const fillBelowGradient = measurementStyle?.fillBelowLinearGradientColorStops;
      if (fillBelowColor || fillBelowGradient) {
        this._fillBelowShape = KonvaFactory.createLine({
          points: [...polylinePoints, lastX, containerHeight, firstX, containerHeight],
          closed: true,
          strokeWidth: 0,
          listening: false,
          perfectDrawEnabled: false,
          ...(fillBelowColor
            ? {fill: fillBelowColor}
            : {
                fillPriority: 'linear-gradient',
                fillLinearGradientColorStops: fillBelowGradient,
                fillLinearGradientStartPoint: {x: 0, y: 0},
                fillLinearGradientEndPoint: {x: 0, y: containerHeight},
              }),
        });
        this._group.add(this._fillBelowShape);
        this._fillBelowShape.moveToBottom();
      }

      const fillAboveColor = measurementStyle?.fillAbove;
      const fillAboveGradient = measurementStyle?.fillAboveLinearGradientColorStops;
      if (fillAboveColor || fillAboveGradient) {
        this._fillAboveShape = KonvaFactory.createLine({
          points: [...polylinePoints, lastX, 0, firstX, 0],
          closed: true,
          strokeWidth: 0,
          listening: false,
          perfectDrawEnabled: false,
          ...(fillAboveColor
            ? {fill: fillAboveColor}
            : {
                fillPriority: 'linear-gradient',
                fillLinearGradientColorStops: fillAboveGradient,
                fillLinearGradientStartPoint: {x: 0, y: containerHeight},
                fillLinearGradientEndPoint: {x: 0, y: 0},
              }),
        });
        this._group.add(this._fillAboveShape);
        this._fillAboveShape.moveToBottom();
      }

      this._polyline = KonvaFactory.createLine({
        points: polylinePoints,
        stroke: measurementStyle?.lineStroke ?? LINE_CHART_LANE_TRACK_MEASUREMENT_STYLE_DEFAULT.lineStroke,
        strokeWidth: measurementStyle?.lineStrokeWidth ?? LINE_CHART_LANE_TRACK_MEASUREMENT_STYLE_DEFAULT.lineStrokeWidth,
        ...(measurementStyle?.lineDash ? {dash: measurementStyle.lineDash} : {}),
        opacity: measurementStyle?.lineOpacity ?? LINE_CHART_LANE_TRACK_MEASUREMENT_STYLE_DEFAULT.lineOpacity,
        listening: false,
        perfectDrawEnabled: false,
      });
      this._group.add(this._polyline);
      this._polyline.moveToBottom();
    }
  }

  protected createView(observation: Observation, config: MeasurementItemViewConfig): MeasurementItemView {
    const styledElement: StyledElement<LineChartLaneTrackStyle> = {
      id: `${this._timelineLane.id}.${this._downsampler.sourceTrack.id}`,
    };

    const measurementItemView = new MeasurementItemView({
      observationState: observation.state,
      styledElement: styledElement,
      timelineLane: this._timelineLane,
      timeline: this._timeline!,
      ui: this._ui!,
      config: config,
    });

    this._measurementItemViews.set(observation.id, measurementItemView);
    this._group.add(measurementItemView.konvaNode);

    return measurementItemView;
  }

  updatePositions(timeRange: {start: number; end: number}) {
    const xMin = this._timeline.timeToTimelinePosition(timeRange.start);
    const xMax = this._timeline.timeToTimelinePosition(timeRange.end);
    const pointRadius = this.getStyle()?.pointRadius ?? 0;

    const polylinePoints: number[] = [];
    this._measurementItemViews.forEach((view) => {
      const pos = view.updatePosition();
      polylinePoints.push(pos.x, pos.y);
      view.setPointVisible(pos.x >= xMin - pointRadius && pos.x <= xMax + pointRadius);
    });
    this._polyline?.points(polylinePoints);

    if (polylinePoints.length >= 4) {
      const containerHeight = this._timelineLane.style.height;
      const firstX: number = polylinePoints[0]!;
      const lastX: number = polylinePoints[polylinePoints.length - 2]!;
      this._fillBelowShape?.points([...polylinePoints, lastX, containerHeight, firstX, containerHeight]);
      this._fillAboveShape?.points([...polylinePoints, lastX, 0, firstX, 0]);
    }
  }

  destroy() {
    this._interpolator?.destroy();
    this._interpolator = undefined;
    this._polyline?.destroy();
    this._polyline = undefined;
    this._fillBelowShape?.destroy();
    this._fillBelowShape = undefined;
    this._fillAboveShape?.destroy();
    this._fillAboveShape = undefined;
    this._measurementItemViews.forEach((view) => view.destroy());
    this._measurementItemViews.clear();
    this._group.destroy();
    this._group = null!;
  }
}

export enum LineChartViewComponentEventType {
  CLICK = 'CLICK',
  MOUSE_MOVE = 'MOUSE_MOVE',
  MOUSE_ENTER = 'MOUSE_ENTER',
  MOUSE_LEAVE = 'MOUSE_LEAVE',
}

export interface LineChartViewComponentEventData {
  item: ObservationState;
  pointerPosition: Position;
}

export type LineChartViewComponentEventTypeDataMap = {
  [LineChartViewComponentEventType.CLICK]: LineChartViewComponentEventData;
  [LineChartViewComponentEventType.MOUSE_MOVE]: LineChartViewComponentEventData;
  [LineChartViewComponentEventType.MOUSE_ENTER]: LineChartViewComponentEventData;
  [LineChartViewComponentEventType.MOUSE_LEAVE]: LineChartViewComponentEventData;
};

export type LineChartViewComponentEvent = {
  [K in LineChartViewComponentEventType]: {
    type: K;
    data: LineChartViewComponentEventTypeDataMap[K];
  };
}[keyof LineChartViewComponentEventTypeDataMap];

interface MeasurementItemViewConfig {
  measurement: ObservationItem['measurement'];
  scale: LineChartLaneTrackScale;
  scaleBaseline: number;
  startTime: number;
  style?: Partial<LineChartLaneTrackMeasurementStyle> | undefined;
}

class MeasurementItemView extends BaseKonvaComponent2<Konva.Group> {
  private readonly _onEvent$: Subject<LineChartViewComponentEvent> = new Subject<LineChartViewComponentEvent>();

  protected _config: MeasurementItemViewConfig;
  protected _ui: Ui;

  protected _styledElement: StyledElement<LineChartLaneTrackStyle>;
  protected _style!: LineChartLaneTrackStyle;

  protected _observationState: ObservationState;
  protected _observationItem: ObservationItem;

  protected _timeline: TimelineImpl;
  protected _timelineLane: LineChartLane;

  protected _group: Konva.Group;
  private _circle?: Konva.Circle | undefined;

  constructor(args: {
    config: MeasurementItemViewConfig;
    observationState: ObservationState;
    styledElement: StyledElement<LineChartLaneTrackStyle>;
    timeline: TimelineImpl;
    ui: Ui;
    timelineLane: LineChartLane;
  }) {
    super();

    this._config = args.config;
    this._observationState = args.observationState;
    this._timeline = args.timeline;
    this._timelineLane = args.timelineLane;
    this._ui = args.ui;

    const observationItem = this._observationState.items.find((p) => p.measurement === this._config.measurement);
    if (!observationItem) {
      throw new Error('This is strange..');
    }

    this._observationItem = observationItem;
    this._styledElement = args.styledElement;

    this._group = KonvaFactory.createGroup();

    let isMouseOver = false;
    const handleMouseOver = (pointerPosition: Position) => {
      isMouseOver = true;
      this._onEvent$.next({
        type: LineChartViewComponentEventType.MOUSE_ENTER,
        data: {item: this._observationState, pointerPosition},
      });
    };
    const handleMouseOut = (pointerPosition: Position) => {
      isMouseOver = false;
      this._onEvent$.next({
        type: LineChartViewComponentEventType.MOUSE_LEAVE,
        data: {item: this._observationState, pointerPosition},
      });
    };

    this._group.on('mouseover mouseenter touchstart', () => {
      if (!isMouseOver) {
        const rpp = this.getRelativePointerPosition();
        if (rpp) handleMouseOver(rpp);
      }
    });

    this._group.on('mouseleave mouseout touchend', () => {
      if (isMouseOver) {
        const rpp = this.getRelativePointerPosition();
        if (rpp) handleMouseOut(rpp);
      }
    });

    this._group.on('mousemove', () => {
      const rpp = this.getRelativePointerPosition();
      if (rpp) {
        this._onEvent$.next({
          type: LineChartViewComponentEventType.MOUSE_MOVE,
          data: {item: this._observationState, pointerPosition: rpp},
        });
      }
    });

    this.update(this._observationState);
  }

  get onEvent$(): Observable<LineChartViewComponentEvent> {
    return this._onEvent$.asObservable();
  }

  private getRelativePointerPosition() {
    return this.konvaNode.getRelativePointerPosition();
  }

  update(observationState: ObservationState) {
    this._observationState = observationState;
    this.render();
  }

  computePosition(): {x: number; y: number} {
    const x = this._timeline.timeToTimelinePosition(this._config.startTime);
    const containerHeight = this._timelineLane.style.height;
    const scale = this._config.scale;
    const scaleSize = scale.max - scale.min;
    const clamp = (v: number) => Math.max(0, Math.min(containerHeight, v));
    const y = clamp(((scale.max - Number(this._observationItem.value)) / scaleSize) * containerHeight);
    return {x, y};
  }

  updatePosition(): {x: number; y: number} {
    const pos = this.computePosition();
    this._group.setAttrs({x: pos.x, y: pos.y});
    return pos;
  }

  setPointVisible(visible: boolean) {
    this._circle?.visible(visible);
  }

  protected render() {
    this._group.destroyChildren();
    this._circle = undefined;

    const pos = this.computePosition();
    this._group.setAttrs({x: pos.x, y: pos.y});

    const radius = this._config.style?.pointRadius ?? 0;

    this._circle = KonvaFactory.createCircle({
      x: 0,
      y: 0,
      radius,
      fill: this._config.style?.pointFill ?? '#ffffff',
      opacity: this._config.style?.pointOpacity ?? 1,
      ...(this._config.style?.pointStroke ? {stroke: this._config.style.pointStroke, strokeWidth: this._config.style.pointStrokeWidth ?? 1} : {}),
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
    });

    this._group.add(this._circle);
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  get observationState(): ObservationState {
    return this._observationState;
  }

  destroy() {
    super.destroy();
    freeObserver(this._onEvent$);
  }
}
