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

import {catchError, forkJoin, from, map, of, switchMap, type Observable} from 'rxjs';
import {
  DefaultMarker,
  DefaultObservation,
  DefaultTextCue,
  DefaultThumbnail,
  MarkerTrack,
  type ObservationItem,
  type ObservationTrack,
  type TextTrack,
  ThumbnailTrack,
  type TimedItemsTrack,
  type TimedItemTemporal,
  TimedItemTemporalType,
} from '../../media';
import {BaseTimedItemsFetcher} from './timed-items-fetcher';
import {OMAKASE_VTT_CUE_DATA_KEY_MAPPING, OmakaseVttVersion, type ParsedVttCue, VttUtil} from '../../vtt';
import {SourceUtil} from '../../source';
import {httpGetText} from '../../http';
import {AuthConfig} from '../../common';
import {OmpError} from '../../types';
import {UrlUtil} from '../../util/url-util';
import type {TrackLoadOptions} from '../track-load-options';
import {StringUtil} from '../../util/string-util';
import {BlobUtil} from '../../util/blob-util';

function parseXywh(url: string): {x: number; y: number; w: number; h: number} | null {
  const match = url.match(/#xywh=(\d+),(\d+),(\d+),(\d+)$/);
  if (!match) return null;
  return {x: +match[1]!, y: +match[2]!, w: +match[3]!, h: +match[4]!};
}

function extractSpriteRegion(imageUrl: string, xywh: {x: number; y: number; w: number; h: number}): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = xywh.w;
      canvas.height = xywh.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas 2D context'));
        return;
      }
      ctx.drawImage(img, xywh.x, xywh.y, xywh.w, xywh.h, 0, 0, xywh.w, xywh.h);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to extract sprite region to blob'));
          return;
        }
        resolve(BlobUtil.createObjectURL(blob));
      });
    };
    img.onerror = () => reject(new Error(`Failed to load spritesheet image: ${imageUrl}`));
    img.src = imageUrl;
  });
}

type TimedItemOf<T> = T extends TimedItemsTrack<infer I, any> ? I : never;

export abstract class VttTimedItemsFetcher<T extends TimedItemsTrack> extends BaseTimedItemsFetcher<T> {
  protected _vttUrl: string | undefined;
  protected _omakaseVttVersion: OmakaseVttVersion | undefined;

  constructor(track: T, loadOptions: TrackLoadOptions | undefined) {
    super(track, loadOptions);
  }

  abstract map(index: number, cue: ParsedVttCue): TimedItemOf<T>;

  fetchTimedItems(): Observable<void> {
    if (!this._track.source) {
      throw new OmpError(`Source not set`);
    }

    this._vttUrl = SourceUtil.resolveUrlFromSource(this._track.source);

    return from(httpGetText(this._vttUrl, AuthConfig.createRequestInit(this._vttUrl, AuthConfig.authentication))).pipe(
      map((vttText) => {
        const parsed = VttUtil.parseVtt(vttText);

        this._omakaseVttVersion = parsed.omakaseVttVersion;

        let timedItems = parsed.cues.map((cue, index) => this.map(index, cue));

        this._track.addTimedItems(timedItems);
        this._track.areTimedItemsFetched = true;
      })
    );
  }
}

export class TextTrackVttFetcher extends VttTimedItemsFetcher<TextTrack> {
  map(index: number, cue: ParsedVttCue): TimedItemOf<TextTrack> {
    return new DefaultTextCue({
      text: cue.text,
      temporal: {
        type: TimedItemTemporalType.SPAN,
        start: `${cue.start}`,
        end: `${cue.end}`,
      },
      data: {
        index: index,
      },
    });
  }
}

export class ThumbnailTrackVttFetcher extends VttTimedItemsFetcher<ThumbnailTrack> {
  map(index: number, cue: ParsedVttCue): TimedItemOf<ThumbnailTrack> {
    let vttRootUrl = this._vttUrl?.substring(0, this._vttUrl?.lastIndexOf('/'));
    let thumbnailUrl: string | undefined;
    if (vttRootUrl) {
      thumbnailUrl = UrlUtil.absolutizeUrl(vttRootUrl, cue.text);
    }
    return new DefaultThumbnail({
      url: `${thumbnailUrl ? thumbnailUrl : cue.text}`,
      temporal: {
        type: TimedItemTemporalType.SPAN,
        start: `${cue.start}`,
        end: `${cue.end}`,
      },
      data: {
        index: index,
      },
    });
  }

  override fetchTimedItems(): Observable<void> {
    if (!this._track.source) {
      throw new OmpError(`Source not set`);
    }

    this._vttUrl = SourceUtil.resolveUrlFromSource(this._track.source);
    const vttUrl = this._vttUrl;

    return from(httpGetText(vttUrl, AuthConfig.createRequestInit(vttUrl, AuthConfig.authentication))).pipe(
      switchMap((vttText) => {
        const parsed = VttUtil.parseVtt(vttText);
        this._omakaseVttVersion = parsed.omakaseVttVersion;

        if (parsed.cues.length === 0) {
          this._track.areTimedItemsFetched = true;
          return of(void 0);
        }

        const vttRootUrl = vttUrl.substring(0, vttUrl.lastIndexOf('/'));

        const thumbnailObservables = parsed.cues.map((cue, index) => {
          const fullUrl = vttRootUrl ? UrlUtil.absolutizeUrl(vttRootUrl, cue.text) : cue.text;
          const xywh = parseXywh(fullUrl);

          const temporal: TimedItemTemporal = {
            type: TimedItemTemporalType.SPAN,
            start: `${cue.start}`,
            end: `${cue.end}`,
          };
          const data = {index};

          if (!xywh) {
            return of<DefaultThumbnail | null>(new DefaultThumbnail({url: fullUrl, temporal, data}));
          }

          const baseUrl = fullUrl.substring(0, fullUrl.indexOf('#xywh='));
          return from(extractSpriteRegion(baseUrl, xywh)).pipe(
            map((blobUrl) => new DefaultThumbnail({url: blobUrl, temporal, data}) as DefaultThumbnail | null),
            catchError((err) => {
              console.error(`ThumbnailTrackVttFetcher: failed to extract sprite region for cue ${index}:`, err);
              return of<DefaultThumbnail | null>(null);
            })
          );
        });

        return forkJoin(thumbnailObservables).pipe(
          map((thumbnails) => {
            this._track.addTimedItems(thumbnails.filter((t): t is DefaultThumbnail => t !== null));
            this._track.areTimedItemsFetched = true;
          })
        );
      })
    );
  }
}

export class MarkerTrackVttFetcher extends VttTimedItemsFetcher<MarkerTrack> {
  map(index: number, cue: ParsedVttCue): TimedItemOf<MarkerTrack> {
    const duration = cue.end - cue.start;
    let temporal: TimedItemTemporal;
    if (duration <= 0) {
      temporal = {
        type: TimedItemTemporalType.MOMENT,
        time: `${cue.start}`,
      };
    } else {
      temporal = {
        type: TimedItemTemporalType.SPAN,
        start: `${cue.start}`,
        end: `${cue.end}`,
      };
    }

    let omakaseVttData =
      this._omakaseVttVersion && cue.data ? {[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[this._omakaseVttVersion]]: cue.data[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[this._omakaseVttVersion]]} : void 0;

    let fetchLabel = (): string | undefined => {
      switch (this._omakaseVttVersion) {
        case OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0:
          return omakaseVttData?.[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0]]?.find((p) => StringUtil.isNonEmpty(p.comment))?.comment;
        default:
          return cue.text;
      }
    };

    return new DefaultMarker({
      temporal: temporal,
      label: fetchLabel(),
      data: {
        index: index,
        duration: duration, // not automatically updated
        ...omakaseVttData,
      },
    });
  }
}

export class ObservationTrackVttFetcher extends VttTimedItemsFetcher<ObservationTrack> {

  map(index: number, cue: ParsedVttCue): TimedItemOf<ObservationTrack> {
    const duration = cue.end - cue.start;
    let temporal: TimedItemTemporal = {
      type: TimedItemTemporalType.SPAN,
      start: `${cue.start}`,
      end: `${cue.end}`,
    };

    let items = this.fetchItems(cue);
    let label = this.fetchLabel(items);

    return new DefaultObservation({
      temporal: temporal,
      label: label,
      items: items,
      data: {
        index: index,
        duration: duration, // not automatically updated
      },
    });
  }

  private fetchItems(cue: ParsedVttCue): ObservationItem[] {
    let omakaseVttData =
      this._omakaseVttVersion && cue.data ? {[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[this._omakaseVttVersion]]: cue.data[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[this._omakaseVttVersion]]} : void 0;

    if (omakaseVttData && omakaseVttData[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0]]) {
      switch (this._omakaseVttVersion) {
        case OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0:
          return omakaseVttData[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0]]!.map((p) => ({
            value: p.value,
            comment: p.comment,
            measurement: p.measurement,
          }));
        default:
          return [];
      }
    } else if (/^-?[\d.]+,\s*-?[\d.]+$/.test(cue.text)) {
      const [min, max] = cue.text.split(',').map((s) => s.trim());
      return [
        {value: min?.trim(), measurement: 'min'},
        {value: max?.trim(), measurement: 'max'},
      ];
    } else {
      return [];
    }
  }

  private fetchLabel(items: ObservationItem[]): string | undefined {
    if (items.length === 1 && items.filter((p) => StringUtil.isNonEmpty(p.value) || StringUtil.isNonEmpty(p.comment)).length > 0) {
      let item = items.find((p) => StringUtil.isNonEmpty(p.value) || StringUtil.isNonEmpty(p.comment));
      return item ? (item.comment ? item.comment : item.value) : void 0;
    } else if (items.length > 1) {
      let commentOnlyItem = items.find((p) => StringUtil.isEmpty(p.value) && StringUtil.isEmpty(p.measurement) && StringUtil.isNonEmpty(p.comment));
      return commentOnlyItem ? commentOnlyItem.comment : void 0;
    }
  };
}
