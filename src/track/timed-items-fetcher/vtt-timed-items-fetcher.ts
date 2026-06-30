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

import {from, map, type Observable} from 'rxjs';
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
