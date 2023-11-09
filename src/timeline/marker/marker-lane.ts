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

import {GenericMarker} from "./marker";
import Konva from "konva";
import {BaseTimelineLane, TimelaneLaneConfig, TIMELINE_LANE_STYLE_DEFAULT, TimelineLaneStyle} from "../timeline-lane";
import {Constants} from "../../constants";
import {MarkerLaneApi} from "../../api/marker-lane-api";
import {ComponentConfigStyleComposed} from "../../common/component";
import {PeriodMarker, PeriodMarkerConfig} from "./period-marker";
import {MomentMarker, MomentMarkerConfig} from "./moment-marker";
import {Subject, takeUntil} from "rxjs";
import {MarkerFocusEvent} from "../../types";

export interface HasMarkerLane {
  setMarkerLane(markerLane: MarkerLane): void;
}

export interface MarkerLaneStyle extends TimelineLaneStyle {

}

const styleDefault: MarkerLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT
}

export interface MarkerLaneConfig extends TimelaneLaneConfig<MarkerLaneStyle> {

}

export class MarkerLane extends BaseTimelineLane<MarkerLaneConfig, MarkerLaneStyle> implements MarkerLaneApi {
  // region konva
  protected markersGroup: Konva.Group;
  // endregion

  private markers: GenericMarker[];
  private markersMap: Map<string, GenericMarker>;

  private markerInFocus: GenericMarker;

  public readonly onMarkerFocus$: Subject<MarkerFocusEvent> = new Subject<MarkerFocusEvent>();

  constructor(config: ComponentConfigStyleComposed<MarkerLaneConfig>) {
    super({
      ...config,
      style: {
        ...styleDefault,
        ...config.style
      }
    });

    this.markers = [];
    this.markersMap = new Map<string, GenericMarker>();
  }

  protected createCanvasNode(): Konva.Group {
    super.createCanvasNode();

    // set position and dimension to whole timecoded timeline
    this.markersGroup = new Konva.Group({
      ...Constants.POSITION_TOP_LEFT,
      ...this.timeline.getTimecodedGroupDimension(),
    });

    this.timeline.addToTimecodedMarkersGroup(this.markersGroup);

    return this.bodyGroup;
  }

  protected settleLayout() {
    super.settleLayout();

    let horizontalMeasurement = this.timeline.getTimecodedGroupHorizontalMeasurement();

    [this.markersGroup].forEach(node => {
      node.width(horizontalMeasurement.width)
    })

    if (this.markers) {
      this.markers.forEach(marker => {
        marker.onMeasurementsChange();
      })
    }
  }

  destroy() {
    super.destroy();
    this.markersGroup.destroy();
  }

  clearContent() {
    this.removeAllMarkers();
    this.markers = [];
    this.markersMap = new Map<string, GenericMarker>();
    this.markersGroup.destroyChildren();
  }

  createMomentMarker(config: MomentMarkerConfig): MomentMarker {
    return this.addMarker(new MomentMarker(config)) as MomentMarker;
  }

  createPeriodMarker(config: PeriodMarkerConfig): PeriodMarker {
    return this.addMarker(new PeriodMarker(config)) as PeriodMarker;
  }

  addMarker(marker: GenericMarker): GenericMarker {
    if (!this.isInitialized()) {
      throw new Error('MarkerLane not initalized. Maybe you forgot to add MarkerLane to Timeline?')
    }

    if (this.markersMap.has(marker.getId())) {
      throw new Error(`Marker with id=${marker.getId()} already exists`)
    }

    marker.setMarkerLane(this);
    marker.setTimeline(this.timeline);

    marker.onClick$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.focusMarker(marker.getId());
    })

    marker.onMouseEnter$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.focusMarker(marker.getId());
    })

    // marker.onMouseLeave$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
    //     this.focusMarker(marker.getId());
    // })

    this.markers.push(marker);
    this.markersMap.set(marker.getId(), marker);
    this.markersGroup.add(marker.initCanvasNode())

    return marker;
  }

  removeAllMarkers() {
    if (this.markers) {
      this.markers.forEach(marker => {
        this.removeMarker(marker.getId());
      })
    }
  }

  removeMarker(id: string) {
    let marker = this.getMarker(id);
    if (marker) {
      this.markers.splice(this.markers.findIndex(p => p.getId() === marker.getId()), 1);
      this.markersMap.delete(marker.getId());
      marker.destroy();
    }
  }

  getMarker(id: string): GenericMarker {
    return this.markersMap.get(id);
  }

  getMarkers(): GenericMarker[] {
    return this.markers;
  }

  focusMarker(id: string) {
    let marker = this.getMarker(id);
    if (marker) {
      this.moveToTop(marker);
      this.markerInFocus = marker;
      this.onMarkerFocus$.next({
        marker: marker
      })
    }
  }

  getMarkerInFocus(): GenericMarker {
    return this.markerInFocus;
  }

  private moveToTop(marker: GenericMarker) {
    if (marker) {
      this.markersGroup.moveToTop();
      marker.getCanvasNode().moveToTop();
    }
  }

}
