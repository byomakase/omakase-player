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

import {type BaseTrackLoadOptions, type Track, TrackType, type TrackUpdateableAttrs} from './track';
import {
  BaseTimedItem,
  BaseTimedItemsTrack,
  type TimedItem,
  type TimedItemArgs,
  type TimedItemState,
  type TimedItemsTrack,
  type TimedItemsTrackArgs,
  type TimedItemsTrackState,
  type TimedItemUpdateableAttrs,
} from './timed-items-track';
import type {OmpEventGroup} from '../common';

/**
 * Discriminator for the origin of an observation track.
 */
export enum ObservationTrackType {
  /** Standalone observation track file loaded as a sidecar. */
  OBSERVATION_TRACK_FILE = 'OBSERVATION_TRACK_FILE',
}

/**
 * Load options for an observation track.
 */
export interface ObservationTrackLoadOptions extends BaseTrackLoadOptions {
  args?: ObservationTrackArgs;
}

/**
 * Serializable snapshot of an observation {@link Track}.
 */
export interface ObservationTrackState extends TimedItemsTrackState<ObservationState> {
  observationTrackType: ObservationTrackType;
}

/**
 * An observation track — a timed-items track carrying {@link Observation} entries.
 */
export interface ObservationTrack<S extends ObservationTrackState = ObservationTrackState, E extends OmpEventGroup<any, any> = never> extends TimedItemsTrack<
  Observation,
  S,
  ObservationUpdateableAttrs,
  E
> {
  observationTrackType: ObservationTrackType;
}

export enum ObservationTrackEventType {
  OBSERVATION_TRACK_SPECIFIC_EVENT_PLACEHOLDER = 'OBSERVATION_TRACK_SPECIFIC_EVENT_PLACEHOLDER',
}

export interface ObservationTrackEventData {}

export type ObservationTrackEventTypeDataMap = {
  [ObservationTrackEventType.OBSERVATION_TRACK_SPECIFIC_EVENT_PLACEHOLDER]: ObservationTrackEventData;
};

export type ObservationTrackEvent = OmpEventGroup<ObservationTrackEventType, ObservationTrackEventTypeDataMap>;

/**
 * Construction arguments for observation track instances.
 */
export interface ObservationTrackArgs extends TimedItemsTrackArgs {}

/**
 * Subset of observation track fields that can be updated at runtime.
 */
export type ObservationTrackUpdateableAttrs = TrackUpdateableAttrs;

/**
 * Serializable snapshot of an {@link Observation}.
 */
export interface ObservationState extends TimedItemState {
  label: string | undefined;
  items: ObservationItem[];
}

export interface ObservationItem {
  value?: string | undefined;
  measurement?: string | undefined;
  comment?: string | undefined;
}

/**
 * A single observation entry within an {@link ObservationTrack}.
 */
export interface Observation extends TimedItem<ObservationState> {
  label: string | undefined;
  items: ObservationItem[];
}

/**
 * Fields that can be updated on an {@link Observation} at runtime.
 */
export interface ObservationUpdateableAttrs extends TimedItemUpdateableAttrs {
  label?: string | undefined;
}

/**
 * Construction arguments for {@link Observation} instances.
 */
export interface ObservationArgs extends TimedItemArgs {
  label?: string | undefined;
  items: ObservationItem[];
}

/**
 * Abstract base for all observation track implementations.
 */
export abstract class BaseObservationTrack<
  T extends Observation,
  TM extends T & BaseObservation,
  S extends ObservationTrackState,
  E extends OmpEventGroup<any, any> = never,
> extends BaseTimedItemsTrack<T, TM, S, E> {
  protected _trackType = TrackType.OBSERVATION_TRACK;

  protected abstract _observationTrackType: ObservationTrackType;

  protected constructor(args?: ObservationTrackArgs) {
    super(args);
  }

  protected _getState(): ObservationTrackState {
    return {
      ...super._getState(),
      observationTrackType: this._observationTrackType,
    };
  }

  get observationTrackType(): ObservationTrackType {
    return this._observationTrackType;
  }

  updateAttrs(attrs: ObservationTrackUpdateableAttrs) {
    super.updateAttrs(attrs);
  }
}

export class ObservationTrackFile extends BaseObservationTrack<Observation, BaseObservation, ObservationTrackState, ObservationTrackEvent> {
  protected _observationTrackType: ObservationTrackType = ObservationTrackType.OBSERVATION_TRACK_FILE;

  constructor(args?: ObservationTrackArgs) {
    super(args);
  }

  protected getState(): ObservationTrackState {
    return {
      ...super._getState(),
    };
  }
}

/**
 * Abstract base for all observation item implementations.
 */
export abstract class BaseObservation extends BaseTimedItem<ObservationState, ObservationUpdateableAttrs> implements Observation {
  protected _label: string | undefined;
  protected _items: ObservationItem[];

  protected constructor(args: ObservationArgs) {
    super(args);
    this._label = args.label;
    this._items = args.items;
  }

  update(attrs: ObservationUpdateableAttrs) {
    super.update(attrs);

    if (attrs.hasOwnProperty('label')) {
      this._label = attrs.label;
    }
  }

  protected _getState(): ObservationState {
    return {
      ...super._getState(),
      label: this._label,
      items: this._items,
    };
  }

  get label(): string | undefined {
    return this._label;
  }

  get items(): ObservationItem[] {
    return this._items;
  }
}

export class DefaultObservation extends BaseObservation implements Observation {
  constructor(args: ObservationArgs) {
    super(args);
  }
}
