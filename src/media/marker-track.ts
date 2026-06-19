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
  type BaseTrackLoadOptions,
  type Track,
  TrackEventType,
  type TrackEventTypeDataMap,
  TrackType,
  type TrackUpdateableAttrs
} from './track';
import type {OmpEventGroup} from '../common';
import {
  BaseTimedItem,
  BaseTimedItemsTrack,
  type TimedItem,
  type TimedItemArgs,
  type TimedItemState,
  type TimedItemsTrackArgs,
  type TimedItemsTrackState,
  TimedItemTemporalType,
  type TimedItemUpdateableAttrs,
} from './timed-items-track';

/**
 * Event types specific to marker operations within a {@link MarkerTrack}.
 */
export enum MarkerTrackEventType {
  MARKER_SPECIFIC_EVENT_PLACEHOLDER = 'MARKER_SPECIFIC_EVENT_PLACEHOLDER',
}

/**
 * Union of base {@link TrackEventType} and marker-specific {@link MarkerTrackEventType}.
 */
export type MarkerTrackCommonEventTypes = TrackEventType | MarkerTrackEventType;

/**
 * Payload carried by marker-specific events (added, deleted, updating, updated).
 */
export interface MarkerEventData {
  trackId: Track['id'];
  markerState: MarkerState;
}

/**
 * Maps each marker track event type to its corresponding data payload.
 */
export type MarkerTrackEventTypeDataMap = TrackEventTypeDataMap<MarkerTrackState> & {
  [MarkerTrackEventType.MARKER_SPECIFIC_EVENT_PLACEHOLDER]: MarkerEventData;
};

/**
 * Discriminated union of all events emitted by a marker track.
 */
export type MarkerTrackEvent = OmpEventGroup<MarkerTrackEventType, MarkerTrackEventTypeDataMap>;

/**
 * Serializable snapshot of a marker {@link Track}.
 */
export interface MarkerTrackState extends TimedItemsTrackState<MarkerState> {}

/**
 * Construction arguments for marker track instances.
 */
export interface MarkerTrackArgs extends TimedItemsTrackArgs {}

/**
 * Subset of marker track fields that can be updated at runtime.
 */
export type MarkerTrackUpdateableAttrs = TrackUpdateableAttrs;

export class MarkerTrack extends BaseTimedItemsTrack<Marker, BaseMarker, MarkerTrackState, MarkerTrackEvent> {
  protected _trackType = TrackType.MARKER_TRACK;

  constructor(args?: MarkerTrackArgs) {
    super(args);
  }

  protected getState(): MarkerTrackState {
    return {
      ...this._getState(),
    };
  }

  updateAttrs(attrs: MarkerTrackUpdateableAttrs) {
    super.updateAttrs(attrs);
  }

  addTimedItems(timedItems: BaseMarker | BaseMarker[]): void;
  addTimedItems(timedItems: MarkerArgs | MarkerArgs[]): void;
  addTimedItems(timedItems: BaseMarker | BaseMarker[] | MarkerArgs | MarkerArgs[]): void {
    const items = Array.isArray(timedItems) ? timedItems : [timedItems];
    const markers = items.map((item) => (item instanceof BaseMarker ? item : new DefaultMarker(item as MarkerArgs)));
    super.addTimedItems(markers);
  }
}

/** Load options for marker tracks. */
export interface MarkerTrackLoadOptions extends BaseTrackLoadOptions {}

/**
 * Discriminator for marker variants.
 */
export enum MarkerType {
  /** A marker that references a single point in time. */
  MOMENT_MARKER = 'MOMENT_MARKER',
  /** A marker that spans a time range (start and/or end). */
  SPANNING_MARKER = 'SPANNING_MARKER',
}

/**
 * Serializable snapshot of a {@link Marker}.
 */
export interface MarkerState extends TimedItemState {
  markerType: MarkerType;
  label?: string | undefined;
}

/**
 * Fields that can be updated on any {@link Marker} at runtime.
 */
export interface MarkerUpdateableAttrs extends TimedItemUpdateableAttrs {
  label?: string | undefined;
}

export interface Marker extends TimedItem<MarkerState> {
  /** Whether this is a moment or period marker. */
  markerType: MarkerType;

  label?: string | undefined;
}

/**
 * Construction arguments shared by all marker types.
 */
export interface MarkerArgs extends TimedItemArgs {
  label?: string | undefined;
}

export abstract class BaseMarker extends BaseTimedItem<MarkerState, MarkerUpdateableAttrs> implements Marker {
  protected _label: string | undefined;

  protected constructor(args: MarkerArgs) {
    super(args);
    this._label = args.label;
  }

  update(attrs: MarkerUpdateableAttrs) {
    super.update(attrs);

    if (attrs.hasOwnProperty('label')) {
      this._label = attrs.label;
    }
  }

  protected _getState(): MarkerState {
    return {
      ...super._getState(),
      markerType: this.markerType,
      label: this._label,
    };
  }

  get label(): string | undefined {
    return this._label;
  }

  get markerType(): MarkerType {
    return this._temporal.type === TimedItemTemporalType.MOMENT ? MarkerType.MOMENT_MARKER : MarkerType.SPANNING_MARKER;
  }
}

export class DefaultMarker extends BaseMarker implements Marker {
  constructor(args: MarkerArgs) {
    super(args);
  }
}
