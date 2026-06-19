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

import {Observable, Subject} from 'rxjs';
import {type Relation, type RelationState} from './relation';
import {BaseMediaEntity, type BaseMediaEntityArgs, type MediaEntity, type MediaEntityState, MediaEntityType} from './media-entity';
import {OpStage, type OpStageState} from '../common/op-stage';

import type {Destroyable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import type {Source, SourceState} from '../source';
import type {FileFormatType, OmpEventGroup} from '../common';
import {objectHasOwnProperty} from '../util/util-functions';

/**
 * Discriminator for the different kinds of tracks that can be associated with a {@link MainMedia}.
 */
export enum TrackType {
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  TEXT_TRACK = 'TEXT_TRACK',
  MARKER_TRACK = 'MARKER_TRACK',
  OBSERVATION_TRACK = 'OBSERVATION_TRACK',
  THUMBNAIL_TRACK = 'THUMBNAIL_TRACK',
}

/**
 * Lifecycle event types emitted by a {@link Track} instance.
 */
export enum TrackEventType {
  TRACK_LOADING = 'TRACK_LOADING',
  TRACK_LOADED = 'TRACK_LOADED',
  TRACK_LOAD_ERROR = 'TRACK_LOAD_ERROR',
  TRACK_UPDATING = 'TRACK_UPDATING',
  TRACK_UPDATED = 'TRACK_UPDATED',
}

/**
 * Serializable snapshot of a {@link Track} instance.
 *
 * Extends {@link MediaEntityState} with track-specific fields such as track type,
 * source, load stage, relations, and label.
 */
export interface TrackState extends MediaEntityState {
  trackType: Track['trackType'];
  source: SourceState | undefined;
  loadStage: OpStageState;
  relations: RelationState[];

  sourceFileFormatType?: FileFormatType | undefined;
  label: string | undefined;
}

/**
 * Payload carried by non-error {@link TrackEvent}s.
 */
export interface TrackEventData<S extends TrackState = TrackState> {
  trackState: S;
}

/**
 * Payload carried by the {@link TrackEventType.TRACK_LOAD_ERROR} event.
 */
export interface TrackErrorEventData<S extends TrackState = TrackState> extends TrackEventData<S> {
  error: string | undefined;
}

/**
 * Maps each {@link TrackEventType} to its corresponding event data type.
 */
export type TrackEventTypeDataMap<S extends TrackState = TrackState> = {
  [TrackEventType.TRACK_LOADING]: TrackEventData<S>;
  [TrackEventType.TRACK_LOADED]: TrackEventData<S>;
  [TrackEventType.TRACK_LOAD_ERROR]: TrackErrorEventData<S>;

  [TrackEventType.TRACK_UPDATING]: {};
  [TrackEventType.TRACK_UPDATED]: TrackEventData<S>;
};

export type TrackEvent<S extends TrackState = TrackState> = OmpEventGroup<TrackEventType, TrackEventTypeDataMap<S>>;

/**
 * A track associated with a {@link MainMedia} (video, audio, text, markers, thumbnails, etc.).
 *
 * Tracks carry their own source, load lifecycle, and inter-track relations.
 * Extends {@link MediaEntity} with `mediaType` always set to {@link MediaEntityType.TRACK}.
 *
 * @typeParam S - The concrete {@link TrackState} subtype.
 * @typeParam E - The concrete {@link TrackEvent} subtype.
 */
export interface Track<S extends TrackState = TrackState, E extends OmpEventGroup<any, any> = OmpEventGroup<any, any>> extends MediaEntity {
  /** Observable stream of track lifecycle events. */
  onEvent$: Observable<E | TrackEvent<S>>;

  /** The kind of track (VIDEO, AUDIO, TEXT_TRACK, MARKER_TRACK, etc.). */
  trackType: TrackType;

  /** Serializable state snapshot. */
  state: S;

  /** The data source backing this track, if any. */
  source: Source | undefined;

  /** The resolved file format type of the source. */
  sourceFileFormatType: FileFormatType | undefined;

  /** Directed relations to other {@link MediaEntity} instances (e.g. {@link RelationType.PART_OF}, {@link RelationType.DERIVED_FROM}). */
  relations: Relation[];

  /** Current load lifecycle stage (idle → loading → success / failure). */
  loadStage: OpStage;

  /** Human-readable label for this track. */
  label: string | undefined;

  /** Transition the load stage to "loading" and emit a {@link TrackEventType.TRACK_LOADING} event. */
  loadStart(): void;

  /** Transition the load stage to "success" and emit a {@link TrackEventType.TRACK_LOADED} event. */
  loadSuccess(): void;

  /** Transition the load stage to "failure" and emit a {@link TrackEventType.TRACK_LOAD_ERROR} event. */
  loadError(error: string | undefined): void;

  /** Add an inter-track relation. Duplicates are silently ignored. */
  addRelation(relation: Relation): void;

  /** Check whether this track already has the given relation. */
  hasRelation(relation: Relation): boolean;

  /**
   * Partially update mutable track attributes and emit a
   * {@link TrackEventType.TRACK_UPDATED} event.
   */
  updateAttrs(attrs: TrackUpdateableAttrs): void;
}

/**
 * Construction arguments for {@link BaseTrack} and its subclasses.
 */
export interface BaseTrackArgs extends BaseMediaEntityArgs {
  /** Data source backing this track. */
  source?: Source | undefined;
  /** Initial set of inter-track relations. */
  relations?: Relation[] | undefined;
  /** The resolved file format of the source. */
  sourceFileFormatType?: FileFormatType | undefined;
  /** Human-readable label for this track. */
  label?: string | undefined;
  /** Track load status **/
  loadStage?: OpStage | undefined;
}

/** Base load options shared by all track types. */
export interface BaseTrackLoadOptions {
  fileFormatType?: FileFormatType | undefined;
}

/**
 * Subset of {@link BaseTrackArgs} fields that can be updated at runtime
 */
export type TrackUpdateableAttrs = Pick<BaseTrackArgs, 'label'>;

export abstract class BaseTrack<S extends TrackState, E extends OmpEventGroup<any, any>> extends BaseMediaEntity<S> implements Track<S, E>, Destroyable {
  protected readonly _onEvent$: Subject<E | TrackEvent<S>> = new Subject<E | TrackEvent<S>>();

  protected abstract _trackType: TrackType;

  protected readonly _source: Source | undefined;
  protected _sourceFileFormatType?: FileFormatType | undefined;

  protected readonly _relations: Relation[];

  protected _label: string | undefined;

  protected _mediaType = MediaEntityType.TRACK;

  protected _loadStage: OpStage;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(args?: BaseTrackArgs) {
    super(args);

    this._source = args?.source;
    this._loadStage = args?.loadStage ? args.loadStage : new OpStage();
    this._relations = [];

    this._sourceFileFormatType = args?.sourceFileFormatType;
    this._label = args?.label;

    if (args?.relations) {
      args.relations.forEach((relation: Relation) => {
        this.addRelation(relation);
      });
    }
  }

  updateAttrs(attrs: TrackUpdateableAttrs): void {
    this._updateAttrs(attrs);
  }

  protected _updateAttrs(attrs: TrackUpdateableAttrs, emitEvent = true): void {
    if (emitEvent) {
      this._onEvent$.next({
        type: TrackEventType.TRACK_UPDATING,
        data: {},
      });
    }

    if (objectHasOwnProperty(attrs, 'label')) {
      this._label = attrs.label;
    }

    if (emitEvent) {
      this._onEvent$.next({
        type: TrackEventType.TRACK_UPDATED,
        data: {
          trackState: this.state,
        },
      });
    }
  }

  protected _getState(): TrackState {
    return {
      ...super._getState(),
      source: this.source?.state,
      sourceFileFormatType: this._sourceFileFormatType,
      trackType: this._trackType,
      relations: this.relations.map((p) => p.state),
      loadStage: this.loadStage.state,
      label: this._label,
    };
  }

  loadStart() {
    this._loadStage.start();
    this._onEvent$.next({
      type: TrackEventType.TRACK_LOADING,
      data: {
        trackState: this.state,
      },
    });
  }

  loadSuccess() {
    this._loadStage.success();
    this._onEvent$.next({
      type: TrackEventType.TRACK_LOADED,
      data: {
        trackState: this.state,
      },
    });
  }

  loadError(error: string | undefined) {
    this._loadStage.failure(error);
    this._onEvent$.next({
      type: TrackEventType.TRACK_LOAD_ERROR,
      data: {
        trackState: this.state,
        error: error,
      },
    });
  }

  addRelation(relation: Relation) {
    if (this.hasRelation(relation)) {
      console.debug(`Relation already exists: `, relation);
    } else {
      this._relations.push(relation);
    }
  }

  hasRelation(relation: Relation): boolean {
    return !!this._relations.find((p) => p.isEqualTo(relation));
  }

  get onEvent$(): Observable<E | TrackEvent<S>> {
    return this._onEvent$.asObservable();
  }

  get trackType(): TrackType {
    return this._trackType;
  }

  get source(): Source | undefined {
    return this._source;
  }

  get sourceFileFormatType(): FileFormatType | undefined {
    return this._sourceFileFormatType;
  }

  get relations(): Relation[] {
    return this._relations;
  }

  get loadStage(): OpStage {
    return this._loadStage;
  }

  get label(): string | undefined {
    return this._label;
  }

  destroy() {
    this._destroyBreaker.destroy();
  }
}
