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

import {catchError, forkJoin, from, map, type Observable, of, switchMap} from 'rxjs';
import {
  DefaultMarker,
  DefaultObservation,
  DefaultTextCue,
  DefaultThumbnail,
  MarkerTrack,
  type ObservationItem,
  type ObservationTrack,
  SpriteThumbnail,
  type TextTrack,
  ThumbnailTrack,
  type TimedItemsTrack,
  type TimedItemTemporal,
  TimedItemTemporalType,
} from '../../media';
import {BaseTimedItemsFetcher} from './timed-items-fetcher';
import {SourceUtil} from '../../source';
import {httpGetArrayBuffer, httpGetText} from '../../http';
import {AuthConfig, FileFormatType} from '../../common';
import {OmpError} from '../../types';
import {UrlUtil} from '../../util/url-util';
import type {TrackLoadOptions} from '../track-load-options';
import {StringUtil} from '../../util/string-util';
import {BlobUtil} from '../../util/blob-util';
import {OMAKASE_VTT_CUE_DATA_KEY_MAPPING, OmakaseVttVersion} from '../../vtt';
import {isNullOrUndefined} from '../../util/util-functions';
import {type ParsedTimedItem, TimedItemsParser} from '../timed-items-parser';

function parseXywh(url: string): {x: number; y: number; w: number; h: number} | null {
  const match = url.match(/#xywh=(\d+),(\d+),(\d+),(\d+)$/);
  if (!match) return null;
  return {x: +match[1]!, y: +match[2]!, w: +match[3]!, h: +match[4]!};
}

function loadSpriteImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load spritesheet image: ${imageUrl}`));
    img.src = imageUrl;
  });
}

function extractSpriteRegion(img: HTMLImageElement, xywh: {x: number; y: number; w: number; h: number}): Promise<string> {
  return new Promise((resolve, reject) => {
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
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) {
        reject(new Error('Failed to extract sprite region to blob'));
        return;
      }
      resolve(BlobUtil.createObjectURL(blob));
    });
  });
}

type TimedItemOf<T> = T extends TimedItemsTrack<infer I, any> ? I : never;

export abstract class DefaultTimedItemsFetcher<T extends TimedItemsTrack> extends BaseTimedItemsFetcher<T> {
  protected _url: string | undefined;
  protected _omakaseVttVersion: OmakaseVttVersion | undefined;

  constructor(track: T, loadOptions: TrackLoadOptions | undefined) {
    super(track, loadOptions);
  }

  abstract map(index: number, timedItem: ParsedTimedItem): TimedItemOf<T>;

  fetchTimedItems(): Observable<void> {
    if (!this._track.source) {
      throw new OmpError(`Source not set`);
    }

    this._url = SourceUtil.resolveUrlFromSourceOrFail(this._track.source);

    const authentication = AuthConfig.createRequestInit(this._url, AuthConfig.authentication);
    const fileFormatType = this._track.sourceFileFormatType ?? this._loadOptions?.fileFormatType;

    const o$ = from(fileFormatType === FileFormatType.STL ? httpGetArrayBuffer(this._url, {...authentication}) : httpGetText(this._url, {...authentication}));

    return o$.pipe(
      map((content) => {
        const parsed = TimedItemsParser.parse(content, fileFormatType!);

        this._omakaseVttVersion = parsed.omakaseVttVersion;

        let timedItems = parsed.timedItems
          .filter((timedItem) => !isNullOrUndefined(timedItem.temporal.start) || !isNullOrUndefined(timedItem.temporal.end))
          .map((timedItem, index) => this.map(index, timedItem));

        this._track.addTimedItems(timedItems);
        this._track.areTimedItemsFetched = true;
      })
    );
  }

  protected resolveTimedItemTemporal(parsedTemporal: {start: number | undefined; end: number | undefined}): TimedItemTemporal {
    const {start, end} = parsedTemporal;

    if (!isNullOrUndefined(start) && !isNullOrUndefined(end)) {
      return {
        type: TimedItemTemporalType.SPAN,
        start: `${start}`,
        end: `${end}`,
      };
    } else if (!isNullOrUndefined(start) && isNullOrUndefined(end)) {
      return {
        type: TimedItemTemporalType.SPAN_START,
        start: `${start}`,
      };
    }
    return {
      type: TimedItemTemporalType.SPAN_END,
      end: `${end}`,
    };
  }
}

export class TextTrackFetcher extends DefaultTimedItemsFetcher<TextTrack> {
  map(index: number, timedItem: ParsedTimedItem): TimedItemOf<TextTrack> {
    return new DefaultTextCue({
      text: timedItem.text,
      temporal: this.resolveTimedItemTemporal(timedItem.temporal),
      data: {
        index: index,
      },
    });
  }
}

export class ThumbnailTrackFetcher extends DefaultTimedItemsFetcher<ThumbnailTrack> {
  map(index: number, timedItem: ParsedTimedItem): TimedItemOf<ThumbnailTrack> {
    let rootUrl = this._url?.substring(0, this._url?.lastIndexOf('/'));
    let thumbnailUrl: string | undefined;
    if (rootUrl) {
      thumbnailUrl = UrlUtil.absolutizeUrl(rootUrl, timedItem.text);
    }
    return new DefaultThumbnail({
      url: `${thumbnailUrl ? thumbnailUrl : timedItem.text}`,
      temporal: this.resolveTimedItemTemporal(timedItem.temporal),
      data: {
        index: index,
      },
    });
  }

  override fetchTimedItems(): Observable<void> {
    if (!this._track.source) {
      throw new OmpError(`Source not set`);
    }

    this._url = SourceUtil.resolveUrlFromSourceOrFail(this._track.source);
    const url = this._url;

    const authentication = AuthConfig.createRequestInit(this._url, AuthConfig.authentication);
    const fileFormatType = this._track.sourceFileFormatType ?? this._loadOptions?.fileFormatType;

    const o$ = from(fileFormatType === FileFormatType.STL ? httpGetArrayBuffer(this._url, {...authentication}) : httpGetText(this._url, {...authentication}));

    return o$.pipe(
      switchMap((content) => {
        const parsed = TimedItemsParser.parse(content, fileFormatType!);
        this._omakaseVttVersion = parsed.omakaseVttVersion;

        if (parsed.timedItems.length === 0) {
          this._track.areTimedItemsFetched = true;
          return of(void 0);
        }

        const rootUrl = url.substring(0, url.lastIndexOf('/'));

        const spriteImages = new Map<string, Promise<HTMLImageElement>>();
        const loadSprite = (spriteUrl: string) => {
          let image = spriteImages.get(spriteUrl);
          if (!image) {
            image = loadSpriteImage(spriteUrl);
            spriteImages.set(spriteUrl, image);
          }
          return image;
        };

        const thumbnailObservables = parsed.timedItems
          .filter((timedItem) => !isNullOrUndefined(timedItem.temporal.start) || !isNullOrUndefined(timedItem.temporal.end))
          .map((timedItem, index) => {
            const fullUrl = rootUrl ? UrlUtil.absolutizeUrl(rootUrl, timedItem.text) : timedItem.text;
            const xywh = parseXywh(fullUrl);

            const temporal = this.resolveTimedItemTemporal(timedItem.temporal);
            const data = {index};

            if (!xywh) {
              return of<DefaultThumbnail | null>(new DefaultThumbnail({url: fullUrl, temporal, data}));
            }

            const baseUrl = fullUrl.substring(0, fullUrl.indexOf('#xywh='));
            return from(loadSprite(baseUrl).then((img) => extractSpriteRegion(img, xywh))).pipe(
              map((blobUrl) => {
                const thumbnail = new SpriteThumbnail({url: blobUrl, temporal, data});
                return thumbnail as SpriteThumbnail | null;
              }),
              catchError((err) => {
                console.error(`ThumbnailTrackFetcher: failed to extract sprite region for cue ${index}:`, err);
                return of<SpriteThumbnail | null>(null);
              })
            );
          });

        return forkJoin(thumbnailObservables).pipe(
          map((thumbnails) => {
            spriteImages.clear();
            this._track.addTimedItems(thumbnails.filter((t): t is DefaultThumbnail | SpriteThumbnail => t !== null));
            this._track.areTimedItemsFetched = true;
          })
        );
      })
    );
  }
}

export class MarkerTrackFetcher extends DefaultTimedItemsFetcher<MarkerTrack> {
  map(index: number, timedItem: ParsedTimedItem): TimedItemOf<MarkerTrack> {
    const duration = !isNullOrUndefined(timedItem.temporal.end) && !isNullOrUndefined(timedItem.temporal.start) ? timedItem.temporal.end - timedItem.temporal.start : void 0;
    let temporal: TimedItemTemporal;
    if (!isNullOrUndefined(duration) && duration <= 0) {
      temporal = {
        type: TimedItemTemporalType.MOMENT,
        time: `${timedItem.temporal.start}`,
      };
    } else {
      temporal = this.resolveTimedItemTemporal(timedItem.temporal);
    }

    let omakaseVttData =
      this._omakaseVttVersion && timedItem.data ? {[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[this._omakaseVttVersion]]: timedItem.data[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[this._omakaseVttVersion]]} : void 0;

    let fetchLabel = (): string | undefined => {
      switch (this._omakaseVttVersion) {
        case OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0:
          return omakaseVttData?.[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0]]?.find((p) => StringUtil.isNonEmpty(p.comment))?.comment;
        default:
          return timedItem.text;
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

export class ObservationTrackFetcher extends DefaultTimedItemsFetcher<ObservationTrack> {
  map(index: number, timedItem: ParsedTimedItem): TimedItemOf<ObservationTrack> {
    const duration = !isNullOrUndefined(timedItem.temporal.end) && !isNullOrUndefined(timedItem.temporal.start) ? timedItem.temporal.end - timedItem.temporal.start : void 0;
    let temporal = this.resolveTimedItemTemporal(timedItem.temporal);

    let items = this.fetchItems(timedItem);
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

  private fetchItems(timedItem: ParsedTimedItem): ObservationItem[] {
    let omakaseVttData =
      this._omakaseVttVersion && timedItem.data ? {[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[this._omakaseVttVersion]]: timedItem.data[OMAKASE_VTT_CUE_DATA_KEY_MAPPING[this._omakaseVttVersion]]} : void 0;

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
    } else if (/^-?[\d.]+,\s*-?[\d.]+$/.test(timedItem.text)) {
      const [min, max] = timedItem.text.split(',').map((s) => s.trim());
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
  }
}
