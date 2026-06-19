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

import {type BaseTrackArgs, type BaseTrackLoadOptions, type Track, TrackType, type TrackUpdateableAttrs} from './track';
import {UrlSource} from '../source';
import {
  BaseTimedItem,
  BaseTimedItemsTrack,
  type TimedItem,
  type TimedItemArgs,
  type TimedItemState,
  type TimedItemsTrackState,
  type TimedItemUpdateableAttrs,
} from './timed-items-track';
import {type OmpEventGroup} from '../common';

/**
 * Event types specific to thumbnail operations within a {@link ThumbnailTrack}.
 */
export enum ThumbnailTrackEventType {
  THUMBNAIL_SPECIFIC_EVENT_PLACEHOLDER = 'THUMBNAIL_SPECIFIC_EVENT_PLACEHOLDER',
}

/**
 * Payload carried by thumbnail-specific events (added, deleted, updating, updated).
 */
export interface ThumbnailEventData {
  trackId: Track['id'];
  thumbnailState: ThumbnailState;
}

/**
 * Maps each thumbnail track event type to its corresponding data payload.
 */
export type ThumbnailTrackEventTypeDataMap = {
  [ThumbnailTrackEventType.THUMBNAIL_SPECIFIC_EVENT_PLACEHOLDER]: ThumbnailEventData;
};

/**
 * Discriminated union of all events emitted by a thumbnail track.
 */
export type ThumbnailTrackEvent = OmpEventGroup<ThumbnailTrackEventType, ThumbnailTrackEventTypeDataMap>;

/**
 * Serializable snapshot of a thumbnail {@link Track}.
 */
export interface ThumbnailTrackState extends TimedItemsTrackState<ThumbnailState> {

}

/**
 * Construction arguments for thumbnail track instances.
 */
export interface ThumbnailTrackArgs extends BaseTrackArgs {
  /** URL of the thumbnail data source. Overridden by `source` when a {@link UrlSource} is provided. */
  url?: string | undefined;
}

/**
 * Subset of thumbnail track fields that can be updated at runtime.
 */
export type ThumbnailTrackUpdateableAttrs = TrackUpdateableAttrs;

export class ThumbnailTrack extends BaseTimedItemsTrack<Thumbnail, BaseThumbnail, ThumbnailTrackState, ThumbnailTrackEvent> {
  protected _trackType = TrackType.THUMBNAIL_TRACK;

  constructor(args?: ThumbnailTrackArgs) {
    super(args);
  }

  protected getState(): ThumbnailTrackState {
    return {
      ...this._getState(),
    };
  }

  updateAttrs(attrs: ThumbnailTrackUpdateableAttrs) {
    super.updateAttrs(attrs);
  }

  addTimedItems(timedItems: BaseThumbnail | BaseThumbnail[]): void;
  addTimedItems(timedItems: ThumbnailArgs | ThumbnailArgs[]): void;
  addTimedItems(timedItems: BaseThumbnail | BaseThumbnail[] | ThumbnailArgs | ThumbnailArgs[]): void {
    const items = Array.isArray(timedItems) ? timedItems : [timedItems];
    const thumbnails = items.map((item) => (item instanceof BaseThumbnail ? item : new DefaultThumbnail(item as ThumbnailArgs)));
    super.addTimedItems(thumbnails);
  }
}

/** Load options for thumbnail tracks. */
export interface ThumbnailTrackLoadOptions extends BaseTrackLoadOptions {}

/**
 * Serializable snapshot of a {@link Thumbnail}.
 */
export interface ThumbnailState extends TimedItemState {
  label?: string | undefined;
  /** URL of the thumbnail image. */
  url: string;
}

/**
 * Serializable snapshot of a default thumbnail with a URL and time range.
 */
export interface DefaultThumbnailState extends ThumbnailState {}

/**
 * Fields that can be updated on any {@link Thumbnail} at runtime.
 */
export interface ThumbnailUpdateableAttrs extends TimedItemUpdateableAttrs {
  label?: string | undefined;
  url?: string;
}

/**
 * Public interface for a thumbnail within a {@link ThumbnailTrack}.
 *
 * @typeParam S - The concrete {@link ThumbnailState} subtype.
 */
export interface Thumbnail extends TimedItem<ThumbnailState> {
  /** Label **/
  label?: string | undefined;
  /** URL of the thumbnail image. */
  url: string;
}

/**
 * Construction arguments shared by all thumbnail types.
 */
export interface ThumbnailArgs extends TimedItemArgs {
  label?: string | undefined;
  /** URL of the thumbnail image. */
  url: string;
}

export abstract class BaseThumbnail extends BaseTimedItem<ThumbnailState, ThumbnailUpdateableAttrs> implements Thumbnail {
  protected _label: string | undefined;
  protected _url: string;

  protected constructor(args: ThumbnailArgs) {
    super(args);
    this._label = args.label;
    this._url = args.url;
  }

  update(attrs: ThumbnailUpdateableAttrs) {
    super.update(attrs);

    if (attrs.hasOwnProperty('label')) {
      this._label = attrs.label;
    }

    if (attrs.hasOwnProperty('url') && attrs.url) {
      this._url = attrs.url;
    }
  }

  protected _getState(): ThumbnailState {
    return {
      ...super._getState(),
      label: this._label,
      url: this._url,
    };
  }

  get label(): string | undefined {
    return this._label;
  }

  get url(): string {
    return this._url;
  }
}

export class DefaultThumbnail extends BaseThumbnail implements Thumbnail {
  constructor(args: ThumbnailArgs) {
    super(args);
  }
}
