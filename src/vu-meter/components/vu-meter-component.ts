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

import {BehaviorSubject, filter, interval, scan, skip, switchMap, takeUntil, takeWhile, tap, throttleTime, timer} from 'rxjs';
import {ObserverBreaker} from '../../common/observer-breaker';
import {DomUtil} from '../../dom/dom-util';
import {AudioLevelEventType, type AudioLevelSourceApi} from '../audio-level-source';
import {DEFAULT_VU_METER_CONFIG, DEFAULT_VU_METER_STYLE, VuMeterScale, VuMeterTheme, type VuMeterColor} from '../vu-meter-api';

export const OmakaseVuMeterAttributes = {
  THEME: 'theme',
  CHANNELS: 'channels',
  VERTICAL: 'vertical',
  NO_CHANNEL_LABELS: 'no-channel-labels',
  NO_SCALE_MARKS: 'no-scale-marks',
  NO_SCALE_LABELS: 'no-scale-labels',
  RANGE_MIN: 'range-min',
  RANGE_MAX: 'range-max',
  SCALE: 'scale',
  SCALE_STEP: 'scale-step',
  SCALE_OFFSET: 'scale-offset',
  LEVEL_BACKGROUND: 'level-background',
  LEVEL_HOLD_DURATION: 'level-hold-duration',
  LABELS: 'labels',
};

export const OmakaseVuMeterDomClasses = {
  THEME_PREFIX: 'omakase-vu-meter-theme',
  SCALE_PREFIX: 'omakase-vu-meter-scale',
  SCALE_BACKGROUND: 'omakase-vu-meter-scale-background',
  SCALE_CONTAINER: 'omakase-vu-meter-scale-container',
  SCALE: 'omakase-vu-meter-scale',
  SCALE_LABELS: 'omakase-vu-meter-scale-labels',
  SCALE_LABEL: 'omakase-vu-meter-scale-label',
  SCALE_DIVISION: 'omakase-vu-meter-scale-division',
  SCALE_SUBDIVISION: 'omakase-vu-meter-scale-subdivision',
  CHANNEL: 'omakase-vu-meter-channel',
  BAR_REGION: 'omakase-vu-meter-bar-region',
  BAR_CONTAINER: 'omakase-vu-meter-bar-container',
  BAR: 'omakase-vu-meter-bar',
  BAR_LABEL_CONTAINER: 'omakase-vu-meter-bar-label-container',
  BAR_LABEL: 'omakase-vu-meter-bar-label',
  VERTICAL: 'vertical',
  HORIZONTAL: 'horizontal',
  WITH_LABELS: 'with-labels',
};

export interface VuMeterScaleLabel {
  value: number;
  label: string;
}

export class VuMeterComponent extends HTMLElement {
  private _channels: HTMLElement[] = [];
  private _barRegion: HTMLElement | undefined;
  private _barContainers: HTMLElement[] = [];
  private _scaleLabelsContainer: HTMLElement | undefined;
  private _scaleLabels: HTMLElement[] = [];
  private _barLevels: HTMLElement[] = [];
  private _heldLevels: HTMLElement[] = [];
  private _barSegments?: SVGRectElement[][];

  private _sampleTime = 50;
  private _maxChannelCount = 6;
  private _defaultChannelCount = 2;

  private _dbValues: number[] = new Array(this._maxChannelCount).fill(-Infinity);
  private _heldDbValues: BehaviorSubject<number | undefined>[] = Array.from({length: this._maxChannelCount}, () => new BehaviorSubject<number | undefined>(undefined));

  private _levelColors: VuMeterColor[] = DEFAULT_VU_METER_STYLE.levelColors;
  private _isNewFrame = true;

  private _destroyBreaker = new ObserverBreaker();
  private _sourceBreaker = new ObserverBreaker();
  private _resizeObserver = new ResizeObserver(() => {
    if (this.theme === VuMeterTheme.LED) {
      this._barSegments = this._barContainers.map((bar) => this.createBarSegments(bar));
    }
    this.updateScaleLabelsDom();
  });

  get theme(): VuMeterTheme {
    if (this.getAttribute(OmakaseVuMeterAttributes.THEME)?.toLowerCase() === VuMeterTheme.LED.toLowerCase()) {
      return VuMeterTheme.LED;
    } else {
      return VuMeterTheme.DEFAULT;
    }
  }

  get scale(): VuMeterScale {
    if (this.getAttribute(OmakaseVuMeterAttributes.SCALE)?.toLowerCase() === VuMeterScale.NORDIC.toLowerCase()) {
      return VuMeterScale.NORDIC;
    } else if (this.getAttribute(OmakaseVuMeterAttributes.SCALE)?.toLowerCase() === VuMeterScale.NONE.toLowerCase()) {
      return VuMeterScale.NONE;
    } else {
      return VuMeterScale.DEFAULT;
    }
  }

  get channelCount() {
    if (this.hasAttribute(OmakaseVuMeterAttributes.CHANNELS)) {
      return parseInt(this.getAttribute(OmakaseVuMeterAttributes.CHANNELS)!, 10);
    }
    return this._defaultChannelCount;
  }

  set channelCount(channelCount: number) {
    this.setAttribute(OmakaseVuMeterAttributes.CHANNELS, channelCount.toString());
    if (this._barRegion) {
      this.createChannelsDom(this._barRegion);
    }
  }

  get isVertical() {
    return this.hasAttribute(OmakaseVuMeterAttributes.VERTICAL);
  }

  get showScaleMarks() {
    return !this.hasAttribute(OmakaseVuMeterAttributes.NO_SCALE_MARKS);
  }

  get showScaleLabels() {
    return !this.hasAttribute(OmakaseVuMeterAttributes.NO_SCALE_LABELS);
  }

  get showLevelLabels() {
    return !this.hasAttribute(OmakaseVuMeterAttributes.NO_CHANNEL_LABELS);
  }

  get rangeMinDb() {
    if (this.hasAttribute(OmakaseVuMeterAttributes.RANGE_MIN)) {
      return parseInt(this.getAttribute(OmakaseVuMeterAttributes.RANGE_MIN)!, 10);
    } else {
      return DEFAULT_VU_METER_CONFIG.rangeMinDb;
    }
  }

  get rangeMaxDb() {
    if (this.hasAttribute(OmakaseVuMeterAttributes.RANGE_MAX)) {
      return parseInt(this.getAttribute(OmakaseVuMeterAttributes.RANGE_MAX)!, 10);
    } else {
      return 0;
    }
  }

  get scaleStepDb() {
    if (this.hasAttribute(OmakaseVuMeterAttributes.SCALE_STEP)) {
      return parseInt(this.getAttribute(OmakaseVuMeterAttributes.SCALE_STEP)!, 10);
    } else {
      return DEFAULT_VU_METER_CONFIG.scaleStepDb;
    }
  }

  get scaleOffsetDb() {
    if (this.hasAttribute(OmakaseVuMeterAttributes.SCALE_OFFSET)) {
      return parseInt(this.getAttribute(OmakaseVuMeterAttributes.SCALE_OFFSET)!, 10);
    } else {
      return DEFAULT_VU_METER_CONFIG.scaleOffsetDb;
    }
  }

  get labels() {
    if (this.hasAttribute(OmakaseVuMeterAttributes.LABELS)) {
      return this.getAttribute(OmakaseVuMeterAttributes.LABELS)!.split(' ');
    } else {
      return DEFAULT_VU_METER_CONFIG.labels;
    }
  }

  get colors() {
    return this._levelColors;
  }

  set colors(colors: VuMeterColor[]) {
    this._levelColors = colors.sort((a, b) => a.maxValueDb - b.maxValueDb);
    if (this._barLevels) {
      const linearGradient = this.getLinearGradient('color');
      this._barLevels.forEach((level) => {
        level.style.backgroundImage = this.isVertical ? `linear-gradient(to bottom, ${linearGradient})` : `linear-gradient(to left, ${linearGradient})`;
      });
    }
    if (this._heldLevels) {
      const linearGradient = this.getLinearGradient('holdColor');
      this._heldLevels.forEach((level) => {
        level.style.backgroundImage = this.isVertical ? `linear-gradient(to bottom, ${linearGradient})` : `linear-gradient(to left, ${linearGradient})`;
      });
    }
  }

  get levelBackground() {
    if (this.hasAttribute(OmakaseVuMeterAttributes.LEVEL_BACKGROUND)) {
      return this.getAttribute(OmakaseVuMeterAttributes.LEVEL_BACKGROUND)!;
    } else {
      return DEFAULT_VU_METER_STYLE.levelBackground;
    }
  }

  set levelBackground(color: string) {
    this.setAttribute(OmakaseVuMeterAttributes.LEVEL_BACKGROUND, color);
  }

  get levelHoldDuration(): number {
    if (this.hasAttribute(OmakaseVuMeterAttributes.LEVEL_HOLD_DURATION)) {
      return parseInt(this.getAttribute(OmakaseVuMeterAttributes.LEVEL_HOLD_DURATION)!, 10);
    } else {
      return DEFAULT_VU_METER_CONFIG.levelHoldDuration;
    }
  }

  connectedCallback() {
    this.createDom();
    this.initHoldTimers();
    this._resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this._sourceBreaker.destroy();
    this._destroyBreaker.destroy();
    this._resizeObserver.disconnect();
  }

  setSource(source: AudioLevelSourceApi) {
    this._sourceBreaker.break();
    source.onEvent$
      .pipe(
        filter((event) => event.type === AudioLevelEventType.AUDIO_LEVEL_CHANGE),
        takeUntil(this._sourceBreaker.observer),
        takeUntil(this._destroyBreaker.observer),
        tap((event) => this.handleDbValues(event.data.dbValues)),
        throttleTime(this._sampleTime)
      )
      .subscribe({
        next: () => {
          this.updateBars();
        },
        error: (err) => {
          console.error(err);
        },
        complete: () => {
          this._dbValues = new Array(this._maxChannelCount).fill(-Infinity);
          for (const heldDbValue of this._heldDbValues) {
            heldDbValue.next(-Infinity);
          }
          this.updateBars();
        },
      });
  }

  private initHoldTimers() {
    for (let i = 0; i < this._maxChannelCount; i++) {
      this._heldDbValues[i]!.pipe(
        skip(1),
        // take current and previous value
        scan((acc, curr) => [acc[1], curr] as [number | undefined, number | undefined], [undefined, undefined] as [number | undefined, number | undefined]),
        // hold if current value is greater than previous
        filter(([prev, curr]) => curr !== undefined && (prev === undefined || curr > prev!)),
        // hold for levelHoldDuration seconds and then initiate interval to gradually reduce value
        switchMap(() => timer(this.levelHoldDuration).pipe(switchMap(() => interval(this._sampleTime).pipe(takeWhile(() => this._heldDbValues[i]!.value !== undefined))))),
        takeUntil(this._destroyBreaker.observer)
      ).subscribe(() => {
        const current = this._heldDbValues[i]!.value;
        if (current === undefined) return;
        const reduced = current - this.scaleStepDb;
        if (reduced <= this._dbValues[i]!) {
          this._heldDbValues[i]!.next(undefined);
        } else {
          this._heldDbValues[i]!.next(reduced);
        }
      });
    }
  }

  private handleDbValues(dbValues: number[]) {
    for (let i = 0; i < this.channelCount; i++) {
      const dbValue = this.getDbValue(i, dbValues);
      this._dbValues[i] = this._isNewFrame ? dbValue : Math.max(dbValue, this._dbValues[i] ?? -Infinity);
      if (this.levelHoldDuration > 0 && (this._heldDbValues[i]!.value === undefined || dbValue > this._heldDbValues[i]!.value!)) {
        this._heldDbValues[i]!.next(dbValue);
      }
    }
    this._isNewFrame = false;
  }

  private getDbValue(index: number, dbValues: number[]): number {
    if (this.channelCount === 1 && dbValues.length > 1) {
      return Math.max(...dbValues, -Infinity);
    } else if (this.channelCount === 2 && dbValues.length === 6) {
      return Math.max(dbValues[index]!, dbValues[2]!, dbValues[4 + index]!, -Infinity);
    }
    return dbValues[index] ?? -Infinity;
  }

  private updateBars() {
    if (this._barLevels) {
      this._barLevels.forEach((barDiv, i) => {
        const dbValue = this._dbValues[i] ?? -Infinity;
        const clipPath = this.getClipPath(dbValue);
        barDiv.style.clipPath = clipPath;
      });
    }
    if (this._heldLevels) {
      this._heldLevels.forEach((barDiv, i) => {
        const heldValue = this._heldDbValues[i]?.value ?? -Infinity;
        const clipPath = this.getClipPath(heldValue);
        barDiv.style.clipPath = clipPath;
      });
    }
    if (this._barSegments) {
      this._barSegments.forEach((barSegments, i) => {
        const dbValue = this._dbValues[i] ?? -Infinity;
        const heldValue = this._heldDbValues[i]?.value;
        this.colorBarSegments(barSegments, dbValue, heldValue);
      });
    }
    this._isNewFrame = true;
  }

  private createDom() {
    this.classList.add(this.isVertical ? OmakaseVuMeterDomClasses.VERTICAL : OmakaseVuMeterDomClasses.HORIZONTAL);
    this.classList.add(`${OmakaseVuMeterDomClasses.THEME_PREFIX}-${this.theme.toLowerCase()}`);
    this.classList.add(`${OmakaseVuMeterDomClasses.SCALE_PREFIX}-${this.scale.toLowerCase()}`);
    if (this.showLevelLabels) {
      this.classList.add(OmakaseVuMeterDomClasses.WITH_LABELS);
    }
    this._barRegion = DomUtil.createElement('div');
    this._barRegion.classList = OmakaseVuMeterDomClasses.BAR_REGION;
    this.appendChild(this._barRegion);
    this.createChannelsDom(this._barRegion);
    if (this.scale !== VuMeterScale.NONE && (this.showScaleLabels || this.showScaleMarks)) {
      this.createScaleContainer();
    }
  }

  private createScaleContainer() {
    const scaleContainer = DomUtil.createElement('div');
    scaleContainer.classList.add(OmakaseVuMeterDomClasses.SCALE_CONTAINER);
    if (this.showScaleLabels) {
      this.createScaleLabelsDom(scaleContainer);
    }
    if (this.showScaleMarks) {
      this.createScaleMarksDom(scaleContainer);
    }
    this.insertAdjacentElement(this.isVertical ? 'afterbegin' : 'beforeend', scaleContainer);
  }

  private createScaleLabelsDom(parent: HTMLElement) {
    this._scaleLabelsContainer = DomUtil.createElement('div');
    this._scaleLabels = [];
    this._scaleLabelsContainer.classList.add(OmakaseVuMeterDomClasses.SCALE_LABELS);
    const scaleLabels = this.getScaleLabels();
    for (const scaleLabel of scaleLabels) {
      const scaleLabelElement = DomUtil.createElement('div');
      scaleLabelElement.classList.add(OmakaseVuMeterDomClasses.SCALE_LABEL);
      scaleLabelElement.innerText = scaleLabel.label.toString();
      const scaleLabelPosition = DomUtil.getPercentValue((scaleLabel.value - this.rangeMinDb) / (this.rangeMaxDb - this.rangeMinDb));
      if (this.isVertical) {
        scaleLabelElement.style.bottom = scaleLabelPosition;
      } else {
        scaleLabelElement.style.left = scaleLabelPosition;
      }
      this._scaleLabelsContainer.appendChild(scaleLabelElement);
      this._scaleLabels.push(scaleLabelElement);
    }
    parent.appendChild(this._scaleLabelsContainer);
  }

  private updateScaleLabelsDom() {
    if (this._scaleLabelsContainer) {
      const totalSize = this.isVertical ? this.offsetHeight : this.offsetWidth;
      if (totalSize) {
        const labelSize = this.isVertical ? this._scaleLabels[0]!.offsetHeight : this._scaleLabels[0]!.offsetWidth;
        const maxNumLabels = Math.floor(totalSize / labelSize);
        const numLabels = this._scaleLabels.length;
        this._scaleLabels.forEach((scaleLabel, index) => {
          if (numLabels <= maxNumLabels) {
            DomUtil.showElements(scaleLabel);
          } else {
            const shownRatio = Math.ceil(numLabels / maxNumLabels);
            if (index % shownRatio) {
              DomUtil.hideElements(scaleLabel);
            } else {
              DomUtil.showElements(scaleLabel);
            }
          }
        });
      }
    }
  }

  private createScaleMarksDom(parent: HTMLElement) {
    const scaleContainer = DomUtil.createElement('div');
    scaleContainer.classList.add(OmakaseVuMeterDomClasses.SCALE);
    for (let i = this.rangeMaxDb; i >= this.rangeMinDb; i -= this.scale === VuMeterScale.NORDIC ? 1.5 : 1) {
      const markElement = DomUtil.createElement('div');
      if (i % this.scaleStepDb) {
        markElement.classList.add(OmakaseVuMeterDomClasses.SCALE_SUBDIVISION);
      } else {
        markElement.classList.add(OmakaseVuMeterDomClasses.SCALE_DIVISION);
      }
      const markPosition = DomUtil.getPercentValue((i - this.rangeMinDb) / (this.rangeMaxDb - this.rangeMinDb));
      if (this.isVertical) {
        markElement.style.bottom = markPosition;
      } else {
        markElement.style.left = markPosition;
      }
      scaleContainer.appendChild(markElement);
    }
    parent.appendChild(scaleContainer);
  }

  private createChannelsDom(parent: HTMLElement) {
    parent.innerHTML = '';
    this._channels = [];
    this._barContainers = [];
    this._barLevels = [];
    this._heldLevels = [];
    for (let i = 0; i < this.channelCount; i++) {
      const channelDiv = DomUtil.createElement('div');
      channelDiv.classList.add(OmakaseVuMeterDomClasses.CHANNEL);
      parent.appendChild(channelDiv);
      this._channels.push(channelDiv);
      this.createBarDom(channelDiv);
      if (this.showLevelLabels) {
        this.createBarLabelDom(channelDiv, i);
      }
    }
    if (this.theme === VuMeterTheme.LED) {
      this._barSegments = this._barContainers.map((bar) => this.createBarSegments(bar));
    }
  }

  private createBarDom(channelDiv: HTMLElement) {
    const barContainer = DomUtil.createElement('div');
    barContainer.classList.add(OmakaseVuMeterDomClasses.BAR_CONTAINER);
    if (this.theme === VuMeterTheme.DEFAULT) {
      barContainer.style.backgroundColor = this.levelBackground;

      const barDiv = DomUtil.createElement('div');
      barDiv.classList.add(OmakaseVuMeterDomClasses.BAR);
      const barLinearGradient = this.getLinearGradient('color');
      barDiv.style.backgroundImage = this.isVertical ? `linear-gradient(to bottom, ${barLinearGradient})` : `linear-gradient(to left, ${barLinearGradient})`;
      barDiv.style.clipPath = this.getClipPath(-Infinity);
      barContainer.appendChild(barDiv);
      this._barLevels.push(barDiv);

      const heldDiv = DomUtil.createElement('div');
      heldDiv.classList.add(OmakaseVuMeterDomClasses.BAR);
      const heldLinearGradient = this.getLinearGradient('holdColor');
      heldDiv.style.backgroundImage = this.isVertical ? `linear-gradient(to bottom, ${heldLinearGradient})` : `linear-gradient(to left, ${heldLinearGradient})`;
      heldDiv.style.clipPath = this.getClipPath(-Infinity);
      barContainer.appendChild(heldDiv);
      this._heldLevels.push(heldDiv);
    }
    channelDiv.appendChild(barContainer);
    this._barContainers.push(barContainer);
  }

  private createBarLabelDom(channelDiv: HTMLElement, index: number) {
    const barLabelContainer = DomUtil.createElement('div');
    barLabelContainer.classList.add(OmakaseVuMeterDomClasses.BAR_LABEL_CONTAINER);
    const barLabel = DomUtil.createElement('div');
    barLabel.classList.add(OmakaseVuMeterDomClasses.BAR_LABEL);
    barLabel.innerText = this.labels[index] ?? '';
    barLabelContainer.appendChild(barLabel);
    channelDiv.appendChild(barLabelContainer);
  }

  private getBarSegmentCount(size: number, segmentSizeWithGap: number): number {
    const rangeStepCount = Math.floor(-this.rangeMinDb / this.scaleStepDb);
    return 1 + Math.max(1, Math.floor(size / (rangeStepCount * segmentSizeWithGap))) * rangeStepCount;
  }

  private getMaxSegmentSizeWithGap(totalSize: number): number {
    if (totalSize < 150) {
      return 100 / 14; // maximum of 14 segments per every 100px
    } else if (totalSize < 250) {
      return 100 / 10;
    } else if (totalSize < 400) {
      return 100 / 8;
    } else {
      return 100 / 6;
    }
  }

  private createBarSegment(svg: SVGSVGElement, x: string, y: string, width: string, height: string, color: string) {
    const segment = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    segment.setAttribute('x', x);
    segment.setAttribute('y', y);
    segment.setAttribute('width', width);
    segment.setAttribute('height', height);
    segment.setAttribute('fill', color);
    svg.appendChild(segment);
    return segment;
  }

  private createBarSegments(parent: HTMLElement): SVGRectElement[] {
    parent.innerHTML = '';

    const width = parent.offsetWidth || 100;
    const height = parent.offsetHeight || 100;
    const rects = [];

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';

    if (this.isVertical) {
      const totalSize = this.getMaxSegmentSizeWithGap(height);
      const segmentCount = this.getBarSegmentCount(height, totalSize);
      const segmentSize = height / segmentCount;
      const gap = Math.min(segmentSize / 3, 4);
      const rectHeight = (height - gap * (segmentCount - 1)) / segmentCount;
      this.style.setProperty('--bar-segment-size', DomUtil.getPixelValue(rectHeight));

      for (let i = 0; i < segmentCount; i++) {
        this.createBarSegment(svg, '0', String(i * (rectHeight + gap)), String(width), String(rectHeight), this.levelBackground);
        rects.push(this.createBarSegment(svg, '0', String(i * (rectHeight + gap)), String(width), String(rectHeight), 'transparent'));
      }
    } else {
      const totalSize = this.getMaxSegmentSizeWithGap(width);
      const segmentCount = this.getBarSegmentCount(width, totalSize);
      const segmentSize = width / segmentCount;
      const gap = Math.min(segmentSize / 3, 4);
      const rectWidth = (width - gap * (segmentCount - 1)) / segmentCount;
      this.style.setProperty('--bar-segment-size', DomUtil.getPixelValue(rectWidth));

      for (let i = 0; i < segmentCount; i++) {
        this.createBarSegment(svg, String(i * (rectWidth + gap)), '0', String(rectWidth), String(height), this.levelBackground);
        rects.push(this.createBarSegment(svg, String(i * (rectWidth + gap)), '0', String(rectWidth), String(height), 'transparent'));
      }
    }

    parent.appendChild(svg);
    return rects;
  }

  private colorBarSegments(barSegments: SVGRectElement[], db: number, heldDb?: number) {
    const len = barSegments.length;
    const idx = (i: number) => (this.isVertical ? len - 1 - i : i);
    for (let i = 0; i < len; i++) {
      const barSegment = barSegments[idx(i)]!;
      const ledTreshold = this.rangeMinDb + (i * (this.rangeMaxDb - this.rangeMinDb)) / (len - 1);
      const currentColor = barSegment.getAttribute('fill');
      if (db >= ledTreshold) {
        const color = this.getSegmentColor(ledTreshold, 'color');
        if (currentColor !== color) {
          barSegment.setAttribute('fill', color);
        }
      } else if (heldDb !== undefined && heldDb >= ledTreshold) {
        const color = this.getSegmentColor(ledTreshold, 'holdColor');
        if (currentColor !== color) {
          barSegment.setAttribute('fill', color);
        }
      } else if (currentColor !== 'transparent') {
        barSegment.setAttribute('fill', 'transparent');
      }
    }
  }

  private getSegmentColor(db: number, type: 'color' | 'holdColor'): string {
    let segmentColor = 'transparent';
    if (db < this.rangeMinDb) {
      return segmentColor;
    } else {
      const color = this._levelColors.find((color) => db <= color.maxValueDb);
      return color ? color[type] : segmentColor;
    }
  }

  private getClipPath(db: number): string {
    let clipPercent = Math.min(Math.max(Math.floor(((this.rangeMaxDb - db) * 100) / (this.rangeMaxDb - this.rangeMinDb)), 0), 100);
    return this.isVertical ? `inset(${clipPercent}% 0 0)` : `inset(0 ${clipPercent}% 0 0)`;
  }

  private getLinearGradient(type: 'color' | 'holdColor'): string {
    return this.colors
      .map(
        (color, index) => `${color[type]} ${Math.round((100 * (this.rangeMaxDb - (index === 0 ? this.rangeMinDb : this._levelColors[index - 1]!.maxValueDb))) / (this.rangeMaxDb - this.rangeMinDb))}%`
      )
      .reverse()
      .join(', ');
  }

  private getScaleLabels(): VuMeterScaleLabel[] {
    const scaleLabels = [];
    for (let i = 0; i >= this.rangeMinDb; i -= this.scaleStepDb) {
      if (this.scale === VuMeterScale.NORDIC && i === -this.scaleOffsetDb) {
        scaleLabels.unshift({label: 'TEST', value: i});
      } else {
        const scaleLabel = i + this.scaleOffsetDb;
        scaleLabels.unshift({label: scaleLabel > 0 ? `+${scaleLabel}` : scaleLabel.toString(), value: i});
      }
    }
    return scaleLabels;
  }
}
