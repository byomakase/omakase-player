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

import { MarkerListApi } from '../api/marker-list-api';
import { VideoControllerApi } from '../video/video-controller-api';
import { MarkerListComponent } from './marker-list-component';
import { MarkerListDomController } from './marker-list-dom-controller';
import { MarkerVttFile, ThumbnailVttFile } from '../vtt';
import { MarkerAwareApi } from '../api/marker-aware-api';
import { map, merge, Subject, takeUntil } from 'rxjs';
import { VttAdapter } from '../common/vtt-adapter';
import { VttLoadOptions } from '../api/vtt-aware-api';
import { ColorUtil } from '../util/color-util';
import { Destroyable, MarkerCreateEvent, MarkerDeleteEvent, MarkerInitEvent, MarkerListActionEvent, MarkerListClickEvent, MarkerUpdateEvent, MarkerVttCue, MomentObservation, PeriodObservation } from '../types';
import { nullifier } from '../util/destroy-util';
import { MarkerListItem } from './marker-list-item';
import { MarkerApi } from '../api/marker-api';
import { MarkerListController } from './marker-list-controller';
import { completeUnsubscribeSubjects, nextCompleteSubject } from '../util/rxjs-util';

export interface MarkerListConfig {
  markerListHTMLElementId: string;
  templateHTMLElementId?: string;
  headerHTMLElementId?: string;
  emptyHTMLElementId?: string;
  loadingHTMLElementId?: string;
  styleUrl?: string | string[];
  thumbnailVttFile?: ThumbnailVttFile;
  vttUrl?: string;
  vttLoadOptions?: VttLoadOptions;
  vttMarkerCreateFn?: (marker: MarkerVttCue, index: number) => MarkerListItem;
  thumbnailFn?: (time: number) => string | undefined;
  source?: MarkerAwareApi | MarkerAwareApi[];
}

const configDefault: MarkerListConfig = {
  markerListHTMLElementId: 'omakase-marker-list',
};

export class MarkerList implements Destroyable, MarkerListApi {
  onVttLoaded$ = new Subject<MarkerVttFile | undefined>();

  onMarkerAction$ = new Subject<MarkerListActionEvent>();
  onMarkerClick$ = new Subject<MarkerListClickEvent>();
  onMarkerInit$ = new Subject<MarkerInitEvent>();
  onMarkerCreate$ = new Subject<MarkerCreateEvent>();
  onMarkerDelete$ = new Subject<MarkerDeleteEvent>();
  onMarkerUpdate$ = new Subject<MarkerUpdateEvent>();

  private _markerListDomController: MarkerListDomController;
  private _markerListComponent: MarkerListComponent;
  private _config: MarkerListConfig;
  private _sources: MarkerAwareApi[];
  private _thumbnailVttFile?: ThumbnailVttFile;
  private _vttAdapter = new VttAdapter(MarkerVttFile);
  private _lastActiveMarker?: MarkerListItem;
  private readonly _destroyed$ = new Subject<void>();

  constructor(config: MarkerListConfig, videoController: VideoControllerApi) {
    this._config = {
      ...configDefault,
      ...config,
    };
    this._markerListDomController = new MarkerListDomController(this);
    this._markerListComponent = this._markerListDomController.markerListComponent;
    this._markerListComponent.videoController = videoController;
    this._markerListComponent.onAction$.pipe(takeUntil(this._destroyed$)).subscribe(({ marker, action }) => {
      this.onMarkerAction$.next({ marker, action });
    });
    this._markerListComponent.onRemove$.pipe(takeUntil(this._destroyed$)).subscribe((marker) => {
      marker.source.removeMarker(marker.id);
      this.onMarkerDelete$.next({ marker });
    });
    this._thumbnailVttFile = this._config.thumbnailVttFile;
    this._markerListComponent.onClick$.pipe(takeUntil(this._destroyed$)).subscribe((marker) => {
      this.onMarkerClick$.next({ marker });
    });
    if (this.config.source && this.config.vttUrl) {
      throw new Error(`Marker list misconfiguration: source and vttUrl can not be defined at the same time`);
    }
    if (this.config.source) {
      this._sources = Array.isArray(this.config.source) ? this.config.source : [this.config.source];
      for (const source of this._sources) {
        for (const marker of source.getMarkers()) {
          this.addMarkerToComponent(marker, source);
        }
      }
      this.onMarkerInit$.next({ markers: this.getMarkers() });
    } else {
      this._sources = [new MarkerListController()];
    }
    if (this.config.vttUrl) {
      this._markerListComponent.isLoading = true;
      this._vttAdapter
        .loadVtt(this.config.vttUrl, { ...this.config.vttLoadOptions })
        .pipe(takeUntil(this._destroyed$))
        .subscribe((vttFile) => {
          this._markerListComponent.isLoading = false;
          const markers = vttFile?.cues.map((cue, index) => (this._config.vttMarkerCreateFn ? this._config.vttMarkerCreateFn(cue, index) : this.createDefaultMarker(cue)));
          if (markers) {
            (this._sources[0] as MarkerListController).markers = markers;
            this.onMarkerInit$.next({ markers });
          }
          this.onVttLoaded$.next(vttFile);
        });
    }
    this.addSourceListeners();
  }

  get name(): string {
    return '';
  }

  getMarkers(): MarkerApi[] {
    return this._markerListComponent.markers;
  }

  get config(): MarkerListConfig {
    return this._config;
  }

  set thumbnailVttFile(thumbnailVttFile: ThumbnailVttFile) {
    this._thumbnailVttFile = thumbnailVttFile;
    for (const marker of this._markerListComponent.markers) {
      this._markerListComponent.updateMarker(marker.id, {
        thumbnail: marker.start ? thumbnailVttFile?.findNearestCue(marker.start)?.url : undefined,
      });
    }
  }

  addMarker(createData: Partial<MarkerApi>, source?: MarkerAwareApi): MarkerApi {
    if (!source) {
      if (this._sources.length > 1) {
        throw new Error('Add marker error: Must specify source for marker list with more than one source');
      } else {
        source = this._sources[0];
      }
    } else if (!this._sources.includes(source)) {
      throw new Error('Add marker error: Unknown source provided');
    }
    return source.addMarker(createData);
  }

  updateMarker(id: string, updateValue: Partial<MarkerListItem>) {
    const marker = this.getMarkerItem(id);
    marker.source.updateMarker(id, updateValue);
    this.onMarkerUpdate$.next({ marker });
  }

  removeMarker(id: string) {
    const marker = this.getMarkerItem(id);
    marker.source.removeMarker(id);
    this.onMarkerDelete$.next({ marker });
  }

  toggleMarker(id: string) {
    const markerItem = this.getMarkerItem(id);
    if (this._lastActiveMarker?.source && this._lastActiveMarker.source !== markerItem.source) {
      this._lastActiveMarker.source.toggleMarker(this._lastActiveMarker.id!);
    }
    if (markerItem.source) {
      markerItem.source.toggleMarker(markerItem.id!);
    }
    this._markerListComponent.toggleActiveClass(markerItem.id);
    this._lastActiveMarker = this._lastActiveMarker !== markerItem ? markerItem : undefined;
  }

  getSelectedMarker(): MarkerApi | undefined {
    return this._lastActiveMarker;
  }

  destroy(): void {
    nextCompleteSubject(this._destroyed$);

    completeUnsubscribeSubjects(this.onVttLoaded$, this.onMarkerAction$, this.onMarkerClick$, this.onMarkerCreate$, this.onMarkerDelete$, this.onMarkerUpdate$, this.onMarkerInit$);

    this._markerListDomController.destroy();

    nullifier(this._config);
  }

  private getMarkerItem(id: string): MarkerListItem {
    const markerItem = this._markerListComponent.markers.find((marker) => marker.id === id);
    if (!markerItem) {
      throw Error(`Marker List error: Marker with id ${id} does not exist`);
    }
    return markerItem;
  }

  private addSourceListeners() {
    merge(...this._sources.map((source) => source.onMarkerInit$.pipe(map((event) => ({ markers: event.markers, source })))))
      .pipe(takeUntil(this._destroyed$))
      .subscribe(({ markers, source }) => {
        for (const marker of markers) {
          this.addMarkerToComponent(marker, source);
        }
      });
    merge(...this._sources.map((source) => source.onMarkerCreate$.pipe(map((event) => ({ marker: event.marker, source })))))
      .pipe(takeUntil(this._destroyed$))
      .subscribe(({ marker, source }) => {
        this.addMarkerToComponent(marker, source);
      });
    merge(...this._sources.map((source) => source.onMarkerDelete$))
      .pipe(takeUntil(this._destroyed$))
      .subscribe(({ marker }) => {
        this._markerListComponent.removeMarker(marker.id);
      });
    merge(...this._sources.map((source) => source.onMarkerUpdate$))
      .pipe(takeUntil(this._destroyed$))
      .subscribe(({ marker }) => {
        this._markerListComponent.updateMarker(marker.id, {
          ...marker,
          name: marker.name,
          style: marker.style,
          thumbnail: this.findThumbnail(marker),
        });
      });
  }

  private addMarkerToComponent(marker: MarkerApi, source: MarkerAwareApi) {
    const markerItem = marker instanceof MarkerListItem ? marker : new MarkerListItem(marker, source);
    markerItem.thumbnail = this.findThumbnail(marker);
    this._markerListComponent.addMarker(markerItem);
  }

  private findThumbnail(marker: MarkerApi): string | undefined {
    const time = (marker.timeObservation as PeriodObservation).start ?? (marker.timeObservation as MomentObservation).time;
    if (time === undefined) {
      return;
    }
    if (this._config.thumbnailFn) {
      return this._config.thumbnailFn(time);
    } else {
      const thumbnailVttCue = this._thumbnailVttFile?.findNearestCue(time);
      return thumbnailVttCue?.url;
    }
  }

  private createDefaultMarker(cue: MarkerVttCue): MarkerListItem {
    const markerItem = new MarkerListItem(
      {
        timeObservation: {
          start: cue.startTime,
          end: cue.endTime,
        },
        style: {
          color: ColorUtil.randomHexColor(),
        },
      },
      this._sources[0] as MarkerListController
    );
    return markerItem;
  }
}
