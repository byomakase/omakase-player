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
import {type Color, type Size, type StyledElement, type StyledElementWithId, Ui} from '../../ui';
import {KonvaFactory} from '../konva/konva-factory';
import Konva from 'konva';
import {ObserverBreaker} from '../../common/observer-breaker';
import {debounceTime, filter, Observable, Subject, takeUntil} from 'rxjs';
import {BaseKonvaComponent2} from '../layout/konva-component';
import type {Position} from '../model';
import {freeObserver} from '../../util/rxjs-util';
import type {InterpolationStrategy} from '../../track';
import {ObservationTrackDownsampler, ObservationTrackInterpolator} from '../../track';
import Decimal from 'decimal.js';
import type {WithRequired} from '../../types/ts-types';
import {TIMELINE} from '../../constants';

export interface BarChartLaneConfig extends ObservationTrackLaneConfig {}

export interface BarChartLaneLaneStyle extends ObservationTrackLaneStyle {}

type BarChartLaneTrackScale = {
  min: number;
  max: number;
};

const PERFORMANCE_CULLING_VIEWS_NUM = 100;
const PERFORMANCE_CULLING_RATIO = 0.9;
const MINIMUM_BAR_PX = 1;

/**
 * Per-track configuration for {@link BarChartLane}.
 * Each track added via `addTrack()` can carry its own scale, baseline, interpolation
 * settings, and visual style that override lane-level defaults.
 */
export interface BarChartLaneTrackConfig extends ObservationTrackLaneTrackConfig {
  /** Value domain for this track. Auto-derived from data when omitted. */
  scale?: BarChartLaneTrackScale;
  /** Value that maps to the bar baseline (zero-crossing). Defaults to 0. */
  scaleBaseline?: number;
  /** Aggregation strategy used when multiple samples fall in the same interpolation bucket. */
  interpolationStrategy?: InterpolationStrategy;
  /** Width in pixels of a single interpolation bucket. Smaller = more detail */
  interpolationWidth?: number;

  style?: BarChartLaneTrackStyle;
}

export interface BarChartLaneTrackStyle {
  paddingTop?: number;
  paddingBottom?: number;
  baselineFill?: Color;
  baselineThickness?: Size;
  baselineDash?: Size[];
  measurements?: Partial<BarChartLaneTrackMeasurementStyle>[];
}

const BAR_CHART_LANE_TRACK_CONFIG_DEFAULT: WithRequired<BarChartLaneTrackConfig, 'interpolationWidth' | 'interpolationStrategy' | 'scaleBaseline'> = {
  interpolationWidth: 20,
  scaleBaseline: 0,
  interpolationStrategy: 'avg',
};

const BAR_CHART_LANE_TRACK_MEASUREMENT_STYLE_DEFAULT: Pick<BarChartLaneTrackMeasurementStyle, 'barType' | 'fill'> = {
  barType: 'default',
  fill: TIMELINE.defaultColor,
};

/**
 * Visual style for a single measurement series within a bar-chart track.
 * Matched to data by `measurement`; unmatched measurements use defaults.
 */
export interface BarChartLaneTrackMeasurementStyle {
  /** Measurement this style applies to (matches {@link ObservationItem.measurement}). */
  measurement: ObservationItem['measurement'];
  /** Bar rendering mode: `'default'` draws rectangles, `'og'` draws a column of stacked circles. */
  barType: 'default' | 'og';
  /** Solid fill color. Mutually exclusive with `fillLinearGradientColorStops`. */
  fill: Color;
  /** Gradient color stops (Konva format). Used when `fill` is not set. */
  fillLinearGradientColorStops: (number | string)[];
  /** Overall bar opacity (0–1). */
  opacity: Size;
  /** Corner radius for `'default'` bars. */
  cornerRadius: Size | [Size, Size, Size, Size];
  /** Stroke color drawn around each bar. */
  strokeColor: Color;
  /** Stroke width in pixels. */
  strokeWidth: Size;
  /** Horizontal padding inside the bar's allocated width. Single value = symmetric; tuple = [left, right]. */
  paddingX: Size | [Size, Size];
}

const configDefault: BarChartLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
};

export class BarChartLane extends BaseObservationTrackLane<BarChartLaneConfig, BarChartLaneLaneStyle, BarChartLaneTrackConfig> {
  protected _downsamplers: Map<ObservationTrack['id'], ObservationTrackDownsampler> = new Map();
  private _typedTrackViews: Map<ObservationTrack['id'], TrackView> = new Map();

  constructor(configAndStyle?: ConfigAndStyle<BarChartLaneConfig, BarChartLaneLaneStyle>) {
    super(
      {
        ...configDefault,
        ...omitKeys(configAndStyle, 'style'),
      },
      configAndStyle?.style
    );
  }

  // TBD
  // protected createStyledElement(): StyledElementWithId<BarChartLaneLaneStyle> {
  //   return {
  //     id: this._id,
  //     classes: [this._ui!.resolveStyleClass('TimelineLane'), this._ui!.resolveStyleClass('ObservationTrackLane')],
  //   };
  // }

  override addTrack(track: ObservationTrack, config?: BarChartLaneTrackConfig): void;
  override addTrack(id: ObservationTrack['id'], config?: BarChartLaneTrackConfig): void;
  override addTrack(trackOrId: ObservationTrack | ObservationTrack['id'], config?: BarChartLaneTrackConfig): void {
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

  protected renderTrack(track: ObservationTrack, config: BarChartLaneTrackConfig | undefined): ObservationTrackView {
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

  protected override updatePositions() {
    const timeRange = this._timeline!.getVisibleTimeRange();
    const total = [...this._typedTrackViews.values()].reduce((sum, v) => sum + v.viewCount, 0);
    this._typedTrackViews.forEach((trackView) => {
      const budget = total > 0 ? Math.max(1, Math.round((PERFORMANCE_CULLING_VIEWS_NUM * trackView.viewCount) / total)) : PERFORMANCE_CULLING_VIEWS_NUM;
      trackView.updatePositions(timeRange, budget);
    });
  }

  protected override createLoadingGroupContent(width: number, height: number): Konva.Animation {
    const firstConfig = this._trackConfigs.values().next().value as BarChartLaneTrackConfig | undefined;
    const interpolationWidth = firstConfig?.interpolationWidth ?? BAR_CHART_LANE_TRACK_CONFIG_DEFAULT.interpolationWidth;
    const rawPaddingX = firstConfig?.style?.measurements?.[0]?.paddingX ?? 0;
    const paddingLeft = Array.isArray(rawPaddingX) ? rawPaddingX[0] : rawPaddingX;
    const paddingRight = Array.isArray(rawPaddingX) ? rawPaddingX[1] : rawPaddingX;
    const barType = firstConfig?.style?.measurements?.[0]?.barType ?? BAR_CHART_LANE_TRACK_MEASUREMENT_STYLE_DEFAULT.barType;
    const gap = 2;
    const step = interpolationWidth + gap;
    const count = Math.max(1, Math.floor(width / step));

    const speed = this.style.loadingAnimationSpeed ?? 1600;
    const colParams = Array.from({length: count}, (_, i) => ({
      period: speed * 0.25 + ((i * 137) % Math.round(speed * 0.375)),
      phase: (i * 2.3999632) % (2 * Math.PI),
      periodH: speed * 0.2 + ((i * 97 + 31) % Math.round(speed * 0.3)),
      phaseH: (i * 1.6180339) % (2 * Math.PI),
    }));

    const fill = this.style.loadingAnimationFill;

    if (barType === 'og') {
      return this._createOgLoadingAnimation(count, step, paddingLeft, paddingRight, interpolationWidth, height, fill, colParams);
    }
    return this._createDefaultLoadingAnimation(count, step, paddingLeft, paddingRight, interpolationWidth, height, fill, colParams);
  }

  private _createDefaultLoadingAnimation(
    count: number,
    step: number,
    paddingLeft: number,
    paddingRight: number,
    interpolationWidth: number,
    height: number,
    fill: string | undefined,
    colParams: {period: number; phase: number; periodH: number; phaseH: number}[]
  ): Konva.Animation {
    const barHmin = height * 0.25;
    const barHmax = height * 0.75;
    const barHmid = (barHmin + barHmax) / 2;
    const barHamp = barHmid - barHmin;
    const posAmplitude = height * 0.1;
    const rectWidth = Math.max(1, interpolationWidth - paddingLeft - paddingRight);

    const bars: Konva.Rect[] = [];
    for (let i = 0; i < count; i++) {
      const rect = KonvaFactory.createRect({
        x: i * step + paddingLeft,
        y: (height - barHmid) / 2,
        width: rectWidth,
        height: barHmid,
        fill,
        listening: false,
      });
      this._loadingGroup!.add(rect);
      bars.push(rect);
    }

    const anim = new Konva.Animation((frame) => {
      bars.forEach((bar, i) => {
        const {period, phase, periodH, phaseH} = colParams[i]!;
        const barH = barHmid + barHamp * Math.sin((frame!.time * 2 * Math.PI) / periodH + phaseH);
        const centerY = (height - barH) / 2;
        const posOffset = posAmplitude * Math.sin((frame!.time * 2 * Math.PI) / period + phase);
        bar.setAttrs({y: centerY + posOffset, height: barH});
      });
    }, this._loadingGroup!.getLayer());
    anim.start();
    return anim;
  }

  private _createOgLoadingAnimation(
    count: number,
    step: number,
    paddingLeft: number,
    paddingRight: number,
    interpolationWidth: number,
    height: number,
    fill: string | undefined,
    colParams: {period: number; phase: number; periodH: number; phaseH: number}[]
  ): Konva.Animation {
    const circleRadius = Math.max(1, (interpolationWidth - paddingLeft - paddingRight) / 2);
    const circleDiameter = circleRadius * 2;
    const circleGap = paddingLeft + paddingRight;
    const numCircles = Math.max(1, Math.floor((height * 0.6) / (circleDiameter + circleGap)));
    const stackHeight = numCircles * (circleDiameter + circleGap);
    const midY = (height - stackHeight) / 2;
    const posAmplitude = Math.min(midY, height * 0.25);
    const clipHmin = stackHeight * 0.35;
    const clipHmax = stackHeight;
    const clipHmid = (clipHmin + clipHmax) / 2;
    const clipHamp = clipHmid - clipHmin;

    const columns: Konva.Group[] = [];
    for (let i = 0; i < count; i++) {
      const colX = i * step + paddingLeft;
      const colGroup = new Konva.Group({
        x: colX,
        y: midY,
        listening: false,
        clipX: 0,
        clipY: stackHeight - clipHmid,
        clipWidth: circleDiameter + 1,
        clipHeight: clipHmid,
      });
      for (let c = 0; c < numCircles; c++) {
        const circle = new Konva.Circle({
          x: circleRadius,
          y: c * (circleDiameter + circleGap) + circleRadius,
          radius: circleRadius,
          ...(fill !== undefined && {fill}),
          listening: false,
        });
        colGroup.add(circle);
      }
      this._loadingGroup!.add(colGroup);
      columns.push(colGroup);
    }

    const anim = new Konva.Animation((frame) => {
      columns.forEach((col, i) => {
        const {period, phase, periodH, phaseH} = colParams[i]!;
        const clipH = clipHmid + clipHamp * Math.sin((frame!.time * 2 * Math.PI) / periodH + phaseH);
        const centerY = midY + (stackHeight - clipH) / 2;
        const posOffset = posAmplitude * Math.sin((frame!.time * 2 * Math.PI) / period + phase);
        col.setAttrs({
          y: centerY + posOffset,
          clipY: stackHeight - clipH,
          clipHeight: clipH,
        });
      });
    }, this._loadingGroup!.getLayer());
    anim.start();
    return anim;
  }

  override destroy(): void {
    super.destroy();

    this._downsamplers.forEach((downsampler) => downsampler.destroy());
    this._downsamplers.clear();
    this._typedTrackViews.clear();
  }
}

class TrackView extends BaseKonvaComponent2<Konva.Group> implements ObservationTrackView {
  protected _config: BarChartLaneTrackConfig | undefined;
  protected _downsampler: ObservationTrackDownsampler;
  protected _timeline: TimelineImpl;
  protected _timelineLane: BarChartLane;
  protected _ui: Ui;

  protected _group: Konva.Group;

  private _baselineLine?: Konva.Line | undefined;
  private _baselineY?: number;

  protected _measurementViews: TrackMeasurementsView[] = [];

  constructor(args: {config: BarChartLaneTrackConfig | undefined; downsampler: ObservationTrackDownsampler; timelineLane: BarChartLane; timeline: TimelineImpl; ui: Ui}) {
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

  get viewCount(): number {
    return this._measurementViews.reduce((sum, v) => sum + v.viewCount, 0);
  }

  updatePositions(timeRange: {start: number; end: number}, maxViews = PERFORMANCE_CULLING_VIEWS_NUM) {
    if (this._baselineLine && this._baselineY !== undefined) {
      const x1 = this._timeline.timeToTimelinePosition(timeRange.start);
      const x2 = this._timeline.timeToTimelinePosition(timeRange.end);
      this._baselineLine.points([x1, this._baselineY, x2, this._baselineY]);
    }
    const total = this.viewCount;
    this._measurementViews.forEach((p) => {
      const budget = total > 0 ? Math.max(1, Math.round((maxViews * p.viewCount) / total)) : maxViews;
      p.updatePositions(timeRange, budget);
    });
  }

  private computeBaselineY(): number | undefined {
    const scale = this._config?.scale;
    if (!scale) return undefined;
    const scaleBaseline = this._config?.scaleBaseline ?? BAR_CHART_LANE_TRACK_CONFIG_DEFAULT.scaleBaseline;
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
  protected _config?: BarChartLaneTrackConfig | undefined;

  protected _timeline: TimelineImpl;
  protected _timelineLane: BarChartLane;
  protected _ui: Ui;

  private _interpolator?: ObservationTrackInterpolator | undefined;

  protected readonly _measurementItemViews: Map<Observation['id'], MeasurementItemView> = new Map<Observation['id'], MeasurementItemView>();

  protected _group: Konva.Group;

  constructor(args: {
    measurement: ObservationItem['measurement'];
    config?: BarChartLaneTrackConfig | undefined;
    downsampler: ObservationTrackDownsampler;
    timelineLane: BarChartLane;
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
    this._measurementItemViews.forEach((view) => view.destroy());
    this._measurementItemViews.clear();
  }

  render(timeRange: {start: number; end: number}) {
    if (this._interpolator) {
      this._interpolator.destroy();
      this._interpolator = void 0;
    }

    this.clearContent();

    let interpolationWidth = this._config?.interpolationWidth ? this._config.interpolationWidth : BAR_CHART_LANE_TRACK_CONFIG_DEFAULT.interpolationWidth;
    let interpolationStrategy: InterpolationStrategy = this._config?.interpolationStrategy ? this._config?.interpolationStrategy : BAR_CHART_LANE_TRACK_CONFIG_DEFAULT.interpolationStrategy;

    const visiblePx = this._timeline.timeToTimelinePosition(timeRange.end) - this._timeline.timeToTimelinePosition(timeRange.start);
    const numberOfInterpolations = Math.ceil(visiblePx / interpolationWidth);
    const viewWidth = visiblePx / numberOfInterpolations;
    let interpolationPeriod = new Decimal(timeRange.end - timeRange.start).mul(1000).div(numberOfInterpolations).toNumber();

    this._interpolator = new ObservationTrackInterpolator(this._downsampler.downsampledTrack, {
      timeRange: timeRange,
      interpolationStrategy: interpolationStrategy,
      interpolationPeriod: interpolationPeriod,
    });

    let scale: BarChartLaneTrackScale = this._config?.scale
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

    let scaleBaseline = this._config?.scaleBaseline ? this._config.scaleBaseline : BAR_CHART_LANE_TRACK_CONFIG_DEFAULT.scaleBaseline;

    const sortedItems = this._interpolator.interpolatedTrack.timedItemsSorted;
    const periodSeconds = interpolationPeriod / 1000;
    const pps = visiblePx / (timeRange.end - timeRange.start);
    const measurementStyle = this._config?.style?.measurements?.find((p) => p.measurement === this._measurement);

    // Pass 1: compute barCount per item from midpoint region widths
    const itemRegions = sortedItems.map((timedItem, index) => {
      const t = TimedItemTemporalUtil.extractStartTime(timedItem.temporal)!;
      const prevItem = sortedItems[index - 1];
      const nextItem = sortedItems[index + 1];
      const prevT = prevItem !== undefined ? TimedItemTemporalUtil.extractStartTime(prevItem.temporal)! : undefined;
      const nextT = nextItem !== undefined ? TimedItemTemporalUtil.extractStartTime(nextItem.temporal)! : undefined;
      const regionStartSec = prevT !== undefined ? (prevT + periodSeconds + t) / 2 : timeRange.start;
      const regionEndSec = nextT !== undefined ? (t + periodSeconds + nextT) / 2 : timeRange.end;
      const regionPx = (regionEndSec - regionStartSec) * pps;
      const barCount = Math.max(1, Math.floor(regionPx / viewWidth));
      return {timedItem, barCount};
    });

    // Pass 2: compute global gap and assign positions
    const T = itemRegions.reduce((sum, r) => sum + r.barCount, 0);
    const gap = T > 1 ? (visiblePx - T * viewWidth) / (T - 1) : 0;
    const viewWidthSeconds = viewWidth / pps;
    const gapSeconds = gap > 0 ? gap / pps : 0;

    let cumBarIndex = 0;
    itemRegions.forEach(({timedItem, barCount}) => {
      const regionStart = timeRange.start + (cumBarIndex * (viewWidth + gap)) / pps;
      this.createView(timedItem, {
        measurement: this._measurement,
        scale,
        scaleBaseline,
        viewWidth,
        regionStart,
        barCount,
        gap,
        viewWidthSeconds,
        gapSeconds,
        style: measurementStyle,
      });
      cumBarIndex += barCount;
    });
  }

  protected createView(observation: Observation, config: MeasurementItemViewConfig) {
    let styledElement: StyledElement<BarChartLaneTrackStyle> = {
      id: `${this._timelineLane.id}.${this._downsampler.sourceTrack.id}`,
    };

    let measurementItemView = new MeasurementItemView({
      observationState: observation.state,
      styledElement: styledElement,
      timelineLane: this._timelineLane,
      timeline: this._timeline!,
      ui: this._ui!,
      config: config,
    });

    this._measurementItemViews.set(observation.id, measurementItemView);
    this._group?.add(measurementItemView.konvaNode);
  }

  get viewCount(): number {
    return this._measurementItemViews.size;
  }

  updatePositions(timeRange: {start: number; end: number}, maxViews: number) {
    if (this._measurementItemViews.size > maxViews) {
      this.cullViews(PERFORMANCE_CULLING_RATIO);
    }

    this._measurementItemViews.forEach((view, id) => {
      const startTime = TimedItemTemporalUtil.extractStartTime(view.observationState.temporal);
      if (startTime !== undefined && startTime >= timeRange.start && startTime <= timeRange.end) {
        view.updatePosition();
      } else {
        this._measurementItemViews.delete(id);
        view.destroy();
      }
    });
  }

  private cullViews(ratio: number): void {
    const entries = [...this._measurementItemViews.entries()];
    const N = entries.length;
    const keepCount = Math.max(1, Math.floor(N * (1 - ratio)));

    const keepIndices = new Set<number>();
    for (let i = 0; i < keepCount; i++) {
      keepIndices.add(Math.round((i * (N - 1)) / (keepCount - 1)));
    }
    entries.forEach(([id, view], index) => {
      if (!keepIndices.has(index)) {
        view.destroy();
        this._measurementItemViews.delete(id);
      }
    });
  }

  destroy() {
    this._interpolator?.destroy();
    this._interpolator = undefined;
    this._measurementItemViews.forEach((view) => view.destroy());
    this._measurementItemViews.clear();
    this._group.destroy();
    this._group = null!;
  }
}

export enum BarChartViewComponentEventType {
  CLICK = 'CLICK',
  MOUSE_MOVE = 'MOUSE_MOVE',
  MOUSE_ENTER = 'MOUSE_ENTER',
  MOUSE_LEAVE = 'MOUSE_LEAVE',
}

export interface BarChartViewComponentEventData {
  item: ObservationState;
  pointerPosition: Position;
}

export type BarChartViewComponentEventTypeDataMap = {
  [BarChartViewComponentEventType.CLICK]: BarChartViewComponentEventData;
  [BarChartViewComponentEventType.MOUSE_MOVE]: BarChartViewComponentEventData;
  [BarChartViewComponentEventType.MOUSE_ENTER]: BarChartViewComponentEventData;
  [BarChartViewComponentEventType.MOUSE_LEAVE]: BarChartViewComponentEventData;
};

export type BarChartViewComponentEvent = {
  [K in BarChartViewComponentEventType]: {
    type: K;
    data: BarChartViewComponentEventTypeDataMap[K];
  };
}[keyof BarChartViewComponentEventTypeDataMap];

interface MeasurementItemViewConfig {
  measurement: ObservationItem['measurement'];
  scale: BarChartLaneTrackScale;
  scaleBaseline: number;
  viewWidth: number;
  regionStart: number;
  barCount: number;
  gap: number;
  viewWidthSeconds: number;
  gapSeconds: number;
  style?: Partial<BarChartLaneTrackMeasurementStyle> | undefined;
}

class MeasurementItemView extends BaseKonvaComponent2<Konva.Group> {
  private readonly _onEvent$: Subject<BarChartViewComponentEvent> = new Subject<BarChartViewComponentEvent>();

  protected _config: MeasurementItemViewConfig;
  protected _ui: Ui;

  protected _styledElement: StyledElement<BarChartLaneTrackStyle>;
  protected _style!: BarChartLaneTrackStyle;

  protected _observationState: ObservationState;
  protected _observationItem: ObservationItem;

  protected _timeline: TimelineImpl;
  protected _timelineLane: BarChartLane;

  protected _group: Konva.Group;

  protected _renderBreaker = new ObserverBreaker();
  private lastRenderedViewWidth = -1;

  constructor(args: {
    config: MeasurementItemViewConfig;
    observationState: ObservationState;
    styledElement: StyledElement<BarChartLaneTrackStyle>;
    timeline: TimelineImpl;
    ui: Ui;
    timelineLane: BarChartLane;
  }) {
    super();

    this._config = args.config;
    this._observationState = args.observationState;
    this._timeline = args.timeline;
    this._timelineLane = args.timelineLane;
    this._ui = args.ui;

    let observationItem = this._observationState.items.find((p) => p.measurement === this._config.measurement);
    if (!observationItem) {
      throw new Error('This is strange..');
    }

    this._observationItem = observationItem;

    this._styledElement = args.styledElement;
    this._style = {
      ...this._config.style,
      ...this._ui.resolveStyle(this._styledElement) as BarChartLaneTrackStyle
    };

    this._group = KonvaFactory.createGroup({
      height: this._timelineLane.style.height,
    });

    let isMouseOver = false;
    let handleMouseOver = (pointerPosition: Position) => {
      isMouseOver = true;
      this._onEvent$.next({
        type: BarChartViewComponentEventType.MOUSE_ENTER,
        data: {
          item: this._observationState,
          pointerPosition: pointerPosition,
        },
      });
    };
    let handleMouseOut = (pointerPosition: Position) => {
      isMouseOver = false;
      this._onEvent$.next({
        type: BarChartViewComponentEventType.MOUSE_LEAVE,
        data: {
          item: this._observationState,
          pointerPosition: pointerPosition,
        },
      });
    };

    this._group.on('mouseover mouseenter touchstart', () => {
      if (!isMouseOver) {
        let rpp = this.getRelativePointerPosition();
        if (rpp) {
          handleMouseOver(rpp);
        }
      }
    });

    this._group.on('mouseleave mouseout touchend', () => {
      if (isMouseOver) {
        let rpp = this.getRelativePointerPosition();
        if (rpp) {
          handleMouseOut(rpp);
        }
      }
    });

    this._group.on('mousemove', () => {
      let rpp = this.getRelativePointerPosition();
      if (rpp) {
        this._onEvent$.next({
          type: BarChartViewComponentEventType.MOUSE_MOVE,
          data: {
            item: this._observationState,
            pointerPosition: rpp,
          },
        });
      }
    });

    this.update(this._observationState);
  }

  get onEvent$(): Observable<BarChartViewComponentEvent> {
    return this._onEvent$.asObservable();
  }

  private getRelativePointerPosition() {
    return this.konvaNode.getRelativePointerPosition();
  }

  update(observationState: ObservationState) {
    this._observationState = observationState;
    this.render();
  }

  updatePosition() {
    const currentViewWidth = this._timeline.timeToTimelinePosition(this._config.regionStart + this._config.viewWidthSeconds) - this._timeline.timeToTimelinePosition(this._config.regionStart);
    const currentGap =
      this._config.gapSeconds > 0 ? this._timeline.timeToTimelinePosition(this._config.regionStart + this._config.gapSeconds) - this._timeline.timeToTimelinePosition(this._config.regionStart) : 0;

    const cappedViewWidth = Math.min(currentViewWidth, this._config.viewWidth);
    const cappedGap = cappedViewWidth < this._config.viewWidth ? currentGap : this._config.gap;

    const atFloor = cappedViewWidth <= MINIMUM_BAR_PX;
    const wasAtFloor = this.lastRenderedViewWidth <= MINIMUM_BAR_PX;
    if (!atFloor || !wasAtFloor) {
      if (Math.abs(cappedViewWidth - this.lastRenderedViewWidth) > 0.5) {
        this.redrawBars(cappedViewWidth, cappedGap);
      }
    }

    this._group.setAttrs({
      x: this._timeline.timeToTimelinePosition(this._config.regionStart),
    });
  }

  redrawBars(viewWidth: number, gap: number) {
    this._group.destroyChildren();

    const containerHeight = this._group.height();
    const scaleSize = this._config.scale.max - this._config.scale.min;
    const calculateY = (value: number) => ((this._config.scale.max - value) / scaleSize) * containerHeight;
    const clamp = (v: number) => Math.max(0, Math.min(containerHeight, v));

    const baselineInContainer = clamp(calculateY(this._config.scaleBaseline));
    const valueInContainer = clamp(calculateY(Number(this._observationItem.value)));
    const y = Math.min(baselineInContainer, valueInContainer);
    const rectHeight = Math.abs(baselineInContainer - valueInContainer);

    const effectiveViewWidth = Math.max(MINIMUM_BAR_PX, viewWidth);
    const paddingScale = this._config.viewWidth > 0 ? effectiveViewWidth / this._config.viewWidth : 1;
    const paddingX = this._config.style?.paddingX;
    const paddingLeft = (Array.isArray(paddingX) ? paddingX[0] : (paddingX ?? 0)) * paddingScale;
    const paddingRight = (Array.isArray(paddingX) ? paddingX[1] : (paddingX ?? 0)) * paddingScale;
    const rectWidth = Math.max(0, effectiveViewWidth - paddingLeft - paddingRight);

    const isAboveBaseline = valueInContainer < baselineInContainer;

    for (let i = 0; i < this._config.barCount; i++) {
      const barX = i * (effectiveViewWidth + gap) + paddingLeft;

      if (this._config.style?.barType === 'og') {
        this.drawOgBar(barX, y, rectWidth, rectHeight, paddingLeft, paddingRight, isAboveBaseline, valueInContainer, baselineInContainer, containerHeight);
      } else {
        this.drawDefaultBar(barX, y, rectWidth, rectHeight, isAboveBaseline, valueInContainer, baselineInContainer, containerHeight);
      }
    }

    this.lastRenderedViewWidth = viewWidth;
  }

  private drawOgBar(
    barX: number,
    y: number,
    rectWidth: number,
    rectHeight: number,
    paddingLeft: number,
    paddingRight: number,
    isAboveBaseline: boolean,
    valueInContainer: number,
    baselineInContainer: number,
    containerHeight: number
  ) {
    const circleRadius = rectWidth / 2;
    const circleGap = paddingLeft + paddingRight;
    const circleDiameter = rectWidth;
    const numCircles = rectHeight > 0 ? Math.floor(rectHeight / (circleDiameter + circleGap)) : 0;

    if (numCircles === 0) {
      return;
    }

    const clipGroup = new Konva.Group({
      x: barX,
      y,
      width: rectWidth,
      height: rectHeight,
      clipFunc: (ctx) => {
        const twoPi = Math.PI * 2;
        for (let c = 0; c < numCircles; c++) {
          const offset = c * (circleDiameter + circleGap) + circleRadius + circleGap / 2;
          const yFromTop = isAboveBaseline ? rectHeight - offset : offset;
          ctx.arc(circleRadius, yFromTop, circleRadius, 0, twoPi, false);
        }
      },
    });

    clipGroup.add(this.createFillRect(0, 0, rectWidth, rectHeight, isAboveBaseline, valueInContainer, baselineInContainer, containerHeight));
    this._group.add(clipGroup);
  }

  private drawDefaultBar(barX: number, y: number, rectWidth: number, rectHeight: number, isAboveBaseline: boolean, valueInContainer: number, baselineInContainer: number, containerHeight: number) {
    if (rectHeight > 0) {
      const rect = this.createFillRect(barX, y, rectWidth, rectHeight, isAboveBaseline, valueInContainer, baselineInContainer, containerHeight);
      if (this._config.style?.cornerRadius) {
        rect.cornerRadius(this._config.style.cornerRadius);
      }
      this._group.add(rect);
    } else {
      this._group.add(
        KonvaFactory.createLine({
          points: [barX, y, barX + rectWidth, y],
          opacity: this._config.style?.opacity ?? 1,
          stroke: this._config.style?.strokeColor ?? void 0,
          strokeWidth: this._config.style?.strokeWidth ?? void 0,
        })
      );
    }
  }

  private createFillRect(x: number, y: number, width: number, height: number, isAboveBaseline: boolean, valueInContainer: number, baselineInContainer: number, containerHeight: number): Konva.Rect {
    const gradientStartY = isAboveBaseline ? height : 0;
    const gradientEndY = isAboveBaseline ? -valueInContainer : containerHeight - baselineInContainer;

    return KonvaFactory.createRect({
      x,
      y,
      width,
      height,
      opacity: this._config.style?.opacity ?? 1,
      ...(this._config.style?.fill
        ? {fill: this._config.style.fill}
        : this._config.style?.fillLinearGradientColorStops
          ? {
              fillPriority: 'linear-gradient',
              fillLinearGradientColorStops: this._config.style.fillLinearGradientColorStops,
              fillLinearGradientStartPoint: {x: 0, y: gradientStartY},
              fillLinearGradientEndPoint: {x: 0, y: gradientEndY},
            }
          : {fill: BAR_CHART_LANE_TRACK_MEASUREMENT_STYLE_DEFAULT.fill}),
      stroke: this._config.style?.strokeColor ?? void 0,
      strokeWidth: this._config.style?.strokeColor ? (this._config.style?.strokeWidth ?? 1) : void 0,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      hitStrokeWidth: 0,
    });
  }

  protected render() {
    this._renderBreaker.break();

    const currentViewWidth = this._timeline.timeToTimelinePosition(this._config.regionStart + this._config.viewWidthSeconds) - this._timeline.timeToTimelinePosition(this._config.regionStart);
    const currentGap =
      this._config.gapSeconds > 0 ? this._timeline.timeToTimelinePosition(this._config.regionStart + this._config.gapSeconds) - this._timeline.timeToTimelinePosition(this._config.regionStart) : 0;

    this.redrawBars(currentViewWidth, currentGap);
    this.updatePosition();
  }

  protected provideKonvaNode(): Konva.Group {
    return this._group;
  }

  get observationState(): ObservationState {
    return this._observationState;
  }

  destroy() {
    super.destroy();
    this._renderBreaker.destroy();
    freeObserver(this._onEvent$);
  }
}
