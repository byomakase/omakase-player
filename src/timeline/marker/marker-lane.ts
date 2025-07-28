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
import {TIMELINE_LANE_CONFIG_DEFAULT, timelineLaneComposeConfig, TimelineLaneConfigDefaultsExcluded, TimelineLaneStyle, VTT_DOWNSAMPLE_CONFIG_DEFAULT} from '../timeline-lane';
import {MarkerLaneApi} from '../../api';
import {PeriodMarker, PeriodMarkerConfig} from './period-marker';
import {MomentMarker, MomentMarkerConfig} from './moment-marker';
import {MarkerCreateEvent, MarkerDeleteEvent, MarkerFocusEvent, MarkerInitEvent, MarkerSelectedEvent, MarkerUpdateEvent, MarkerVttCue} from '../../types';
import {filter, Subject, take, takeUntil, zip} from 'rxjs';
import {Timeline} from '../timeline';
import {Marker} from './marker';
import {MarkerVttFile} from '../../vtt';
import {destroyer} from '../../util/destroy-util';
import {AxiosRequestConfig} from 'axios';
import Decimal from 'decimal.js';
import {MARKER_STYLE_DEFAULT, MarkerStyle} from './marker-types';
import {VideoControllerApi} from '../../video';
import {VttAdapter, VttAdapterConfig} from '../../common/vtt-adapter';
import {VttTimelineLane, VttTimelineLaneConfig} from '../vtt-timeline-lane';
import {KonvaFactory} from '../../konva/konva-factory';
import {ConfigWithOptionalStyle} from '../../layout';

export interface MarkerLaneConfig extends VttTimelineLaneConfig<MarkerLaneStyle>, VttAdapterConfig<MarkerVttFile> {
  axiosConfig?: AxiosRequestConfig;
  markerCreateFn?: (marker: MarkerVttCue, index: number) => Marker;
  markerProcessFn?: (marker: Marker, index: number) => void;
}

export interface MarkerLaneStyle extends TimelineLaneStyle {
  markerStyle: Partial<MarkerStyle>;
}

const configDefault: MarkerLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  ...VTT_DOWNSAMPLE_CONFIG_DEFAULT,
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    markerStyle: MARKER_STYLE_DEFAULT,
  },
};

export class MarkerLane extends VttTimelineLane<MarkerLaneConfig, MarkerLaneStyle, MarkerVttCue, MarkerVttFile> implements MarkerLaneApi {
  public readonly onMarkerFocus$: Subject<MarkerFocusEvent> = new Subject<MarkerFocusEvent>();
  public readonly onMarkerCreate$: Subject<MarkerCreateEvent> = new Subject<MarkerCreateEvent>();
  public readonly onMarkerDelete$: Subject<MarkerDeleteEvent> = new Subject<MarkerDeleteEvent>();
  public readonly onMarkerUpdate$: Subject<MarkerUpdateEvent> = new Subject<MarkerUpdateEvent>();
  public readonly onMarkerSelected$: Subject<MarkerSelectedEvent> = new Subject<MarkerSelectedEvent>();
  public readonly onMarkerInit$: Subject<MarkerInitEvent> = new Subject<MarkerInitEvent>();

  protected readonly _vttAdapter: VttAdapter<MarkerVttFile> = new VttAdapter(MarkerVttFile);

  protected _markerCreateFn?: (cue: MarkerVttCue, index: number) => Marker;
  protected _markerProcessFn?: (marker: Marker, index: number) => void;

  protected _timecodedSpanningGroup?: Konva.Group;

  protected _markers: Marker[] = [];
  protected _markersById: Map<string, Marker> = new Map<string, Marker>();

  protected _markerInFocus?: Marker;

  constructor(config: TimelineLaneConfigDefaultsExcluded<MarkerLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));

    this._vttAdapter.initFromConfig(this._config);

    this._markerCreateFn = this._config.markerCreateFn;
    this._markerProcessFn = this._config.markerProcessFn;
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    let timecodedDimension = this._timeline!.getTimecodedFloatingDimension();

    this._timecodedSpanningGroup = KonvaFactory.createGroup({
      ...timecodedDimension,
    });

    this._timeline!.addToTimecodedFloatingContent(this._timecodedSpanningGroup, 5);

    this._vttAdapter.vttFileLoaded$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (vttFile) => {
        this._videoController!.onVideoLoaded$.pipe(
          filter((p) => !!p),
          take(1),
          takeUntil(this._destroyed$)
        ).subscribe({
          next: (event) => {
            this.createEntities();
          },
        });
      },
    });

    zip([this._videoController!.onVideoLoaded$.pipe(filter((p) => !!p && !(p.isAttaching || p.isDetaching))), this._vttAdapter.vttFileLoaded$])
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: () => {
          this.createEntities();
        },
      });

    this._videoController!.onVideoLoading$.pipe(
      filter((p) => !(p.isAttaching || p.isDetaching)),
      takeUntil(this._destroyed$)
    ).subscribe({
      next: (event) => {
        this.clearContent();
      },
    });

    if (this.vttUrl) {
      this.loadVtt(this.vttUrl, this.getVttLoadOptions(this._config.axiosConfig));
    }
  }

  protected settleLayout() {
    let timelineTimecodedDimension = this._timeline!.getTimecodedFloatingDimension();
    let timecodedRect = this.getTimecodedRect();

    [this._timecodedSpanningGroup].forEach((node) => {
      node!.width(timelineTimecodedDimension.width);
    });

    if (this._videoController!.isVideoLoaded()) {
      this._markers.forEach((marker) => {
        marker.refreshTimelinePosition();
      });
    }

    // clip proportionally timecodedSpanningGroup, if lane is minimized this ensures that clip rectange follows lane dimensions
    let clipFactorHeightDecimal = new Decimal(timelineTimecodedDimension.height).div(this.style.height);
    let clipFactorYDecimal = new Decimal(timecodedRect.height).div(this.style.height);

    let clipX = -this._timeline!.style.rightPaneClipPadding;
    let clipY = timecodedRect.y - timecodedRect.y * clipFactorYDecimal.toNumber();
    let clipWidth = timecodedRect.width + this._timeline!.style.rightPaneClipPadding * 2;
    let clipHeight = clipFactorHeightDecimal.mul(timecodedRect.height).toNumber();

    this._timecodedSpanningGroup!.clipFunc((ctx) => {
      ctx.rect(clipX, clipY, clipWidth, clipHeight);
    });
  }

  override clearContent() {
    this.removeAllMarkers();
    this._markers = [];
    this._markersById = new Map<string, Marker>();
    this._timecodedSpanningGroup?.destroyChildren();
  }

  get name(): string {
    return this._description ?? '';
  }

  createMomentMarker(config: ConfigWithOptionalStyle<MomentMarkerConfig>): MomentMarker {
    return this.addMarker(new MomentMarker(config)) as MomentMarker;
  }

  createPeriodMarker(config: ConfigWithOptionalStyle<PeriodMarkerConfig>): PeriodMarker {
    return this.addMarker(new PeriodMarker(config)) as PeriodMarker;
  }

  addMarker(marker: Marker): Marker {
    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?');
    }

    if (this._markersById.has(marker.id)) {
      throw new Error(`Marker with id=${marker.id} already exists`);
    }

    if (marker instanceof MomentMarker || marker instanceof PeriodMarker) {
      marker.attachToTimeline(this._timeline, this);
    } else {
      throw new Error(`Marker invalid`);
    }

    marker.onClick$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.focusMarker(marker.id);
    });

    marker.onMouseEnter$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.focusMarker(marker.id);
    });

    marker.onDestroy$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.onMarkerDelete$.next({marker});
    });

    (marker as PeriodMarker).onChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      const oldConfig = {...marker.config, timeObservation: event.oldTimeObservation};
      const oldValue = 'start' in oldConfig.timeObservation ? new PeriodMarker(oldConfig) : new MomentMarker(oldConfig as MomentMarkerConfig);
      this.onMarkerUpdate$.next({marker, oldValue});
    });

    this._markers.push(marker);
    this._markersById.set(marker.id, marker);

    this._timecodedSpanningGroup!.add(marker.konvaNode);

    this.onMarkerCreate$.next({marker});

    return marker;
  }

  removeAllMarkers() {
    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?');
    }

    if (this._markers) {
      this.removeMarkers([...this._markersById.keys()]);
    }
  }

  removeMarker(id: string) {
    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?');
    }

    let marker = this.getMarker(id);
    if (marker) {
      this._markers.splice(
        this._markers.findIndex((p) => p.id === marker!.id),
        1
      );
      this._markersById.delete(marker.id);
      marker.destroy();
    }
  }

  protected removeMarkers(ids: string[]): void {
    ids.forEach((id) => {
      this.removeMarker(id);
    })
  }

  getMarker(id: string): Marker | undefined {
    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?');
    }

    return this._markersById.get(id);
  }

  getMarkers(): Marker[] {
    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?');
    }

    return this._markers;
  }

  focusMarker(id: string) {
    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?');
    }

    let marker = this.getMarker(id);
    if (marker) {
      this.moveToTop(marker);
      this._markerInFocus = marker;
      this.onMarkerFocus$.next({
        marker: marker,
      });
    }
  }

  getMarkerInFocus(): Marker | undefined {
    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?');
    }

    return this._markerInFocus;
  }

  toggleMarker(markerId: string) {
    const marker = this._markers.find((m) => m.id === markerId);
    if (!marker) {
      return;
    }
    const activeMarker = this._markers.find((marker) => marker.style.renderType === 'spanning');
    if (activeMarker) {
      activeMarker.style = {
        ...activeMarker.style,
        renderType: 'lane',
        lineOpacity: activeMarker instanceof MomentMarker ? 0 : activeMarker.style.lineOpacity,
      };
    }
    if (activeMarker?.id !== markerId) {
      marker.style = {
        ...marker.style,
        renderType: 'spanning',
        lineOpacity: marker instanceof MomentMarker ? (marker.maxOpacity ?? 1) : marker.style.lineOpacity,
      };
      this.onMarkerSelected$.next({marker});
    } else {
      this.onMarkerSelected$.next({});
    }
  }

  getSelectedMarker(): Marker | undefined {
    return this._markers.find((marker) => marker.style.renderType === 'spanning');
  }

  updateMarker(markerId: string, updateData: Partial<Marker>) {
    const marker = this._markers.find((marker) => marker.id === markerId);
    if (!marker) {
      return;
    }
    const oldValue = {...marker};
    const {timeObservation, ...otherData} = updateData;
    Object.assign(marker, otherData);
    if (timeObservation !== undefined) {
      marker.timeObservation = timeObservation;
      marker.refreshTimelinePosition();
    }
    this.onMarkerUpdate$.next({marker, oldValue});
  }

  private moveToTop(marker: Marker) {
    if (marker) {
      this._timecodedSpanningGroup!.moveToTop();
      marker.konvaNode.moveToTop();
    }
  }

  private clearItems() {
    this.removeAllMarkers();
  }

  private createEntities() {
    if (!this.vttFile) {
      throw new Error('VTT file not loaded');
    }

    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?');
    }

    this.clearItems();

    this.vttFile.cues.forEach((cue, index) => {
      let marker: Marker;
      if (this._markerCreateFn) {
        marker = this._markerCreateFn(cue, index);
      } else {
        // TODO temporary default behaviour for creating markers from VTT
        if (cue.endTime - cue.endTime <= 0.01) {
          marker = new MomentMarker({
            timeObservation: {
              time: cue.startTime,
            },
            text: cue.text,
            editable: false,
            style: this.style.markerStyle,
          });
        } else {
          marker = new PeriodMarker({
            timeObservation: {
              start: cue.startTime,
              end: cue.endTime,
            },
            text: cue.text,
            editable: false,
            style: this.style.markerStyle,
          });
        }
      }

      if (marker) {
        this.addMarker(marker);

        if (this._markerProcessFn) {
          this._markerProcessFn(marker, index);
        }
      }
    });

    this.onMarkerInit$.next({markers: this._markers});
  }

  override destroy() {
    super.destroy();

    destroyer(this._timecodedSpanningGroup);
  }
}
