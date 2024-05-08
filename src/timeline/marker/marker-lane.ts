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
import {BaseTimelineLane, TIMELINE_LANE_CONFIG_DEFAULT, timelineLaneComposeConfig, TimelineLaneConfig, TimelineLaneConfigDefaultsExcluded, TimelineLaneStyle} from '../timeline-lane';
import {MarkerLaneApi} from '../../api';
import {ConfigWithOptionalStyle} from '../../common';
import {PeriodMarker, PeriodMarkerConfig} from './period-marker';
import {MomentMarker, MomentMarkerConfig} from './moment-marker';
import {catchError, filter, map, Observable, of, Subject, take, takeUntil} from 'rxjs';
import {MarkerFocusEvent, MarkerVttCue} from '../../types';
import {Timeline} from '../timeline';
import {Marker} from './marker';
import {MarkerVttFile} from '../../track/marker-vtt-file';
import {destroyer} from '../../util/destroy-util';
import {AxiosRequestConfig} from 'axios';
import Decimal from 'decimal.js';
import {MARKER_STYLE_DEFAULT, MarkerStyle} from './marker-types';
import {VideoControllerApi} from '../../video/video-controller-api';

export interface MarkerLaneConfig extends TimelineLaneConfig<MarkerLaneStyle> {
  vttUrl?: string;
  axiosConfig?: AxiosRequestConfig;
  markerCreateFn?: (marker: MarkerVttCue, index: number) => Marker;
  markerProcessFn?: (marker: Marker, index: number) => void;
}

export interface MarkerLaneStyle extends TimelineLaneStyle {
  markerStyle: Partial<MarkerStyle>
}

const configDefault: MarkerLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    markerStyle: MARKER_STYLE_DEFAULT
  }
}

export class MarkerLane extends BaseTimelineLane<MarkerLaneConfig, MarkerLaneStyle> implements MarkerLaneApi {
  public readonly onMarkerFocus$: Subject<MarkerFocusEvent> = new Subject<MarkerFocusEvent>();

  protected _vttUrl?: string;
  protected _vttFile?: MarkerVttFile;
  protected _markerCreateFn?: (cue: MarkerVttCue, index: number) => Marker;
  protected _markerProcessFn?: (marker: Marker, index: number) => void;

  protected _timecodedSpanningGroup?: Konva.Group;

  protected _markers: Marker[] = [];
  protected _markersById: Map<string, Marker> = new Map<string, Marker>();

  protected _markerInFocus?: Marker;

  constructor(config: TimelineLaneConfigDefaultsExcluded<MarkerLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));

    this._vttUrl = this._config.vttUrl;
    this._markerCreateFn = this._config.markerCreateFn;
    this._markerProcessFn = this._config.markerProcessFn;
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    let timecodedDimension = this._timeline!.getTimecodedFloatingDimension();

    this._timecodedSpanningGroup = new Konva.Group({
      ...timecodedDimension
    });

    this._timeline!.addToTimecodedFloatingContent(this._timecodedSpanningGroup, 5);

    this._videoController!.onVideoLoaded$.pipe(filter(p => !!p), takeUntil(this._destroyed$)).subscribe((event) => {
      this.clearContent();
    })

    if (this._vttUrl) {
      this.loadVtt(this._vttUrl, this._config.axiosConfig).subscribe();
    }
  }

  protected settleLayout() {
    let timelineTimecodedDimension = this._timeline!.getTimecodedFloatingDimension();
    let timecodedRect = this.getTimecodedRect();

    [this._timecodedSpanningGroup].forEach(node => {
      node!.width(timelineTimecodedDimension.width)
    })

    this._markers.forEach(marker => {
      marker.refreshTimelinePosition();
    })

    // clip proportionally timecodedSpanningGroup, if lane is minimized this ensures that clip rectange follows lane dimensions
    let clipFactorHeightDecimal = new Decimal(timelineTimecodedDimension.height).div(this.style.height);
    let clipFactorYDecimal = new Decimal(timecodedRect.height).div(this.style.height);

    let clipX = -this._timeline!.style.rightPaneClipPadding;
    let clipY = timecodedRect.y - timecodedRect.y * clipFactorYDecimal.toNumber();
    let clipWidth = timecodedRect.width + (this._timeline!.style.rightPaneClipPadding * 2);
    let clipHeight = clipFactorHeightDecimal.mul(timecodedRect.height).toNumber();

    this._timecodedSpanningGroup!.clipFunc((ctx) => {
      ctx.rect(clipX, clipY, clipWidth, clipHeight)
    });
  }

  override clearContent() {
    this.removeAllMarkers();
    this._markers = [];
    this._markersById = new Map<string, Marker>();
    this._timecodedSpanningGroup?.destroyChildren();
  }

  createMomentMarker(config: ConfigWithOptionalStyle<MomentMarkerConfig>): MomentMarker {
    return this.addMarker(new MomentMarker(config)) as MomentMarker;
  }

  createPeriodMarker(config: ConfigWithOptionalStyle<PeriodMarkerConfig>): PeriodMarker {
    return this.addMarker(new PeriodMarker(config)) as PeriodMarker;
  }

  addMarker(marker: Marker): Marker {
    if (!this._timeline) {
      throw new Error('MarkerLane not initalized. Maybe you forgot to add MarkerLane to Timeline?')
    }

    if (this._markersById.has(marker.id)) {
      throw new Error(`Marker with id=${marker.id} already exists`)
    }

    if (marker instanceof MomentMarker || marker instanceof PeriodMarker) {
      marker.attachToTimeline(this._timeline, this);
    } else {
      throw new Error(`Marker invalid`)
    }

    marker.onClick$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.focusMarker(marker.id);
    })

    marker.onMouseEnter$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.focusMarker(marker.id);
    })

    this._markers.push(marker);
    this._markersById.set(marker.id, marker);

    this._timecodedSpanningGroup!.add(marker.konvaNode)

    return marker;
  }

  removeAllMarkers() {
    if (!this._timeline) {
      throw new Error('MarkerLane not initalized. Maybe you forgot to add MarkerLane to Timeline?')
    }

    if (this._markers) {
      this._markers.forEach(marker => {
        this.removeMarker(marker.id);
      })
    }
  }

  removeMarker(id: string) {
    if (!this._timeline) {
      throw new Error('MarkerLane not initalized. Maybe you forgot to add MarkerLane to Timeline?')
    }

    let marker = this.getMarker(id);
    if (marker) {
      this._markers.splice(this._markers.findIndex(p => p.id === marker!.id), 1);
      this._markersById.delete(marker.id);
      marker.destroy();
    }
  }

  getMarker(id: string): Marker | undefined {
    if (!this._timeline) {
      throw new Error('MarkerLane not initalized. Maybe you forgot to add MarkerLane to Timeline?')
    }

    return this._markersById.get(id);
  }

  getMarkers(): Marker[] {
    if (!this._timeline) {
      throw new Error('MarkerLane not initalized. Maybe you forgot to add MarkerLane to Timeline?')
    }

    return this._markers;
  }

  focusMarker(id: string) {
    if (!this._timeline) {
      throw new Error('MarkerLane not initalized. Maybe you forgot to add MarkerLane to Timeline?')
    }

    let marker = this.getMarker(id);
    if (marker) {
      this.moveToTop(marker);
      this._markerInFocus = marker;
      this.onMarkerFocus$.next({
        marker: marker
      })
    }
  }

  getMarkerInFocus(): Marker | undefined {
    if (!this._timeline) {
      throw new Error('MarkerLane not initalized. Maybe you forgot to add MarkerLane to Timeline?')
    }

    return this._markerInFocus;
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

  loadVtt(vttUrl: string, axiosConfig?: AxiosRequestConfig): Observable<MarkerVttFile | undefined> {
    this._vttUrl = vttUrl;
    return this.fetchVttFile(this._vttUrl, axiosConfig).pipe(take(1))
  }

  private fetchVttFile(vttUrl: string, axiosConfig?: AxiosRequestConfig): Observable<MarkerVttFile | undefined> {
    return MarkerVttFile.create(vttUrl, axiosConfig).pipe(map(vttFile => {
      this._vttFile = vttFile;
      this.createFromVttFile(this._vttFile);
      return vttFile;
    }), catchError((err, caught) => {
      return of(void 0);
    }))
  }

  private createFromVttFile(vttFile: MarkerVttFile) {
    this.clearItems();

    if (vttFile) {
      vttFile.cues.forEach((cue, index) => {
        let marker: Marker;
        if (this._markerCreateFn) {
          marker = this._markerCreateFn(cue, index);
        } else {
          // TODO temporary default behaviour for creating markers from VTT
          if ((cue.endTime - cue.endTime) <= 0.010) {
            marker = new MomentMarker({
              timeObservation: {
                time: cue.startTime
              },
              text: cue.text,
              editable: false,
              style: this.style.markerStyle
            })
          } else {
            marker = new PeriodMarker({
              timeObservation: {
                start: cue.startTime,
                end: cue.endTime
              },
              text: cue.text,
              editable: false,
              style: this.style.markerStyle
            })
          }
        }

        if (marker) {
          this.addMarker(marker);

          if (this._markerProcessFn) {
            this._markerProcessFn(marker, index);
          }
        }
      })
    } else {
      console.error(`Could not create entities, VTT file not loaded yet`)
    }
  }

  override destroy() {
    super.destroy();

    destroyer(
      this._timecodedSpanningGroup
    )
  }
}
