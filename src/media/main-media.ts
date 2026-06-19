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

import {type Track, type TrackState} from './track';
import {Observable, Subject} from 'rxjs';
import type {Source, SourceState} from '../source';
import {BaseMediaEntity, type BaseMediaEntityArgs, type MediaEntity, type MediaEntityState, MediaEntityType} from './media-entity';
import {OpStage, type OpStageState} from '../common/op-stage';
import type {Serializable} from '../common/capabilities';
import type {FrameRateModel} from '../common/frame-rate';
import type {TimecodeModel} from '../common/timecode';
import {objectHasOwnProperty} from '../util/util-functions';
import {type FileFormatType} from '../common';

/**
 * Supported main media source types.
 */
export enum MainMediaType {
  HLS = 'HLS',
  MP4 = 'MP4',
  AUDIO_FILE = 'AUDIO_FILE',
}

/**
 * Lifecycle event types emitted by a {@link MainMedia} instance.
 */
export enum MainMediaEventType {
  MAIN_MEDIA_LOADING = 'MAIN_MEDIA_LOADING',
  MAIN_MEDIA_LOADED = 'MAIN_MEDIA_LOADED',
  MAIN_MEDIA_LOAD_ERROR = 'MAIN_MEDIA_LOAD_ERROR',
  // MAIN_MEDIA_UPDATING = 'MAIN_MEDIA_UPDATING',
  MAIN_MEDIA_UPDATED = 'MAIN_MEDIA_UPDATED',
}

/**
 * Serializable snapshot of a {@link MainMedia} instance.
 *
 * Extends {@link MediaEntityState} with media-specific fields such as source,
 * tracks, DRM flag, duration, frame rate, FFOM timecode, and init segment offset.
 * Used for cross-boundary transfer (e.g. attached ↔ detached mode) and session persistence.
 */
export interface MainMediaState extends MediaEntityState {
  mainMediaType: MainMedia['mainMediaType'];
  source: SourceState;
  sourceFileFormatType?: FileFormatType | undefined;

  loadOptions: MainMediaLoadOptions | undefined;
  loadStage: OpStageState;

  tracks: TrackState[];

  isDrm?: boolean | undefined;
  duration?: number | undefined;
  initialDuration?: number | undefined;
  frameRateModel?: FrameRateModel | undefined;
  ffomTimecodeModel?: TimecodeModel | undefined;
  initSegmentTimeOffset?: number | undefined;
}

/**
 * Payload carried by {@link MainMediaEvent} for non-error lifecycle events.
 */
export interface MainMediaEventData extends Serializable {
  mainMediaState: MainMediaState;
}

/**
 * Payload carried by the {@link MainMediaEventType.MAIN_MEDIA_LOAD_ERROR} event.
 */
export interface MainMediaErrorEventData extends MainMediaEventData {
  error: string | undefined;
}

/**
 * Maps each {@link MainMediaEventType} to its corresponding event data type.
 */
export type MainMediaEventTypeDataMap = {
  [MainMediaEventType.MAIN_MEDIA_LOADING]: MainMediaEventData;
  [MainMediaEventType.MAIN_MEDIA_LOADED]: MainMediaEventData;
  [MainMediaEventType.MAIN_MEDIA_LOAD_ERROR]: MainMediaErrorEventData;
  // [MainMediaEventType.MAIN_MEDIA_UPDATING]: MainMediaEventData;
  [MainMediaEventType.MAIN_MEDIA_UPDATED]: MainMediaEventData;
};

/**
 * Discriminated union of all main media lifecycle events.
 * Subscribe via {@link MainMedia.onEvent$}.
 */
export type MainMediaEvent = {
  [K in MainMediaEventType]: {
    type: K;
    data: MainMediaEventTypeDataMap[K];
  };
}[keyof MainMediaEventTypeDataMap];

/**
 * Primary media entity representing the loaded video or audio source.
 *
 * A `MainMedia` holds the media source, its associated tracks, load lifecycle
 * state, and runtime attributes (DRM, duration, frame rate, timecode model).
 * Extends {@link MediaEntity} with `mediaType` always set to {@link MediaEntityType.MAIN_MEDIA}.
 */
export interface MainMedia extends MediaEntity {
  /** Observable stream of lifecycle events (loading, loaded, error, updated). */
  onEvent$: Observable<MainMediaEvent>;

  /** The format of the media source (HLS, MP4, or AUDIO_FILE). */
  mainMediaType: MainMediaType;

  /** Serializable state snapshot. */
  state: MainMediaState;

  /** The resolved media source. */
  source: Source;

  /** The resolved file format type of the source. */
  sourceFileFormatType: FileFormatType | undefined;

  /** Tracks associated with this media (video, audio, text, markers, etc.). */
  tracks: Track[];

  /** Current load lifecycle stage (idle → loading → success / failure). */
  loadStage: OpStage;

  /** Transition the load stage to "loading" and emit a {@link MainMediaEventType.MAIN_MEDIA_LOADING} event. */
  loadStart(): void;

  /** Transition the load stage to "success" and emit a {@link MainMediaEventType.MAIN_MEDIA_LOADED} event. */
  loadSuccess(): void;

  /** Transition the load stage to "failure" and emit a {@link MainMediaEventType.MAIN_MEDIA_LOAD_ERROR} event. */
  loadError(error: string | undefined): void;

  /** Register a single track with this media. */
  addTrack(track: Track): void;

  /** Register multiple tracks with this media. */
  addTracks(tracks: Track[]): void;

  /** Whether the media source is DRM-protected. */
  get isDrm(): boolean | undefined;

  /** The duration originally reported at load time, before any runtime updates. */
  get initialDuration(): number | undefined;

  /** Current media duration in seconds. May be updated at runtime. */
  get duration(): number | undefined;

  /** Frame rate model derived from load options or the media source. */
  get frameRateModel(): FrameRateModel | undefined;

  /** FFOM (First Frame of Media) timecode model derived from load options. */
  get ffomTimecodeModel(): TimecodeModel | undefined;

  /** Time offset of the initialization segment, if applicable. */
  get initSegmentTimeOffset(): number | undefined;

  /**
   * Partially update mutable media attributes and emit a
   * {@link MainMediaEventType.MAIN_MEDIA_UPDATED} event.
   */
  updateAttrs(attrs: MainMediaUpdateableAttrs): void;
}

/**
 * Subset of {@link MainMediaState} fields that can be updated at runtime
 * via {@link MainMedia.updateAttrs}.
 */
export type MainMediaUpdateableAttrs = Pick<MainMediaState, 'isDrm' | 'duration' | 'frameRateModel' | 'ffomTimecodeModel' | 'initSegmentTimeOffset'>;

/**
 * Configuration provided when loading a main media source via
 * {@link OmakasePlayerApi.loadMainMedia} or {@link PlayerApi.loadMainMedia}.
 */
export interface MainMediaLoadOptions extends Serializable {
  /**
   * Media frame rate. Can be a numeric value or a fraction string in the form `"numerator/denominator"`.
   */
  frameRate?: number | string;

  /**
   * Whether the frame rate uses drop-frame counting.
   */
  dropFrame?: boolean;

  /**
   * Explicit media duration in seconds. Overrides the duration reported by the source.
   */
  duration?: number;

  /**
   * FFOM (First Frame of Media) timecode string used to offset time display.
   */
  ffom?: string;

  /**
   * Arbitrary key-value data provided on media load. Can be used to store values such as DRM tokens.
   */
  data?: Record<string, any>;

  /**
   * Explicitly set the media type instead of auto-detecting from the source URL.
   */
  mainMediaType?: MainMediaType;

  /**
   * Explicitly set the file format instead of auto-detecting from the source URL.
   * Takes precedence over {@link mainMediaType} for resolving both format and media type.
   */
  fileFormatType?: FileFormatType;

  /**
   * URL for a poster image displayed before the video starts playing.
   */
  poster?: string;
}

/**
 * Construction arguments for {@link BaseMainMedia} and its subclasses.
 */
export interface BaseMainMediaArgs extends BaseMediaEntityArgs {
  /** The resolved media source. */
  source: Source;
  /** The resolved file format type of the source. */
  sourceFileFormatType?: FileFormatType | undefined;
  /** Load options used when the media was requested. */
  loadOptions?: MainMediaLoadOptions | undefined;
  /** Pre-existing tracks to associate with the media. */
  tracks?: Track[];
  /** Whether the media source is DRM-protected. */
  isDrm?: boolean | undefined;
  /** Initial media duration in seconds. */
  duration?: number | undefined;
  /** Frame rate model for frame-accurate operations. */
  frameRateModel?: FrameRateModel | undefined;
  /** FFOM timecode model for time offset display. */
  ffomTimecodeModel?: TimecodeModel | undefined;
  /** Initialization segment time offset. */
  initSegmentTimeOffset?: number | undefined;
}

export abstract class BaseMainMedia<S extends MainMediaState> extends BaseMediaEntity<S> implements MainMedia {
  protected readonly _onEvent$: Subject<MainMediaEvent> = new Subject<MainMediaEvent>();

  protected readonly _mediaType = MediaEntityType.MAIN_MEDIA;

  protected abstract _mainMediaType: MainMediaType;

  protected readonly _source: Source;
  protected _sourceFileFormatType?: FileFormatType | undefined;

  protected readonly _loadOptions: MainMediaLoadOptions | undefined;

  protected readonly _loadStage: OpStage;

  protected readonly _tracks: Track[];
  protected readonly _tracksMap: Map<Track['id'], Track>;

  protected _isDrm?: boolean | undefined;
  protected _initialDuration?: number | undefined;
  protected _duration?: number | undefined;
  protected _frameRateModel?: FrameRateModel | undefined;
  protected _ffomTimecodeModel?: TimecodeModel | undefined;
  protected _initSegmentTimeOffset?: number | undefined;

  protected constructor(args: BaseMainMediaArgs) {
    super(args);

    this._source = args.source;

    this._loadOptions = args.loadOptions;
    this._sourceFileFormatType = args.sourceFileFormatType;
    this._tracks = [];
    this._tracksMap = new Map();
    this._loadStage = new OpStage();

    if (args.tracks) {
      args.tracks.forEach((track: Track) => {
        this.addTrack(track);
      });
    }

    this._isDrm = !!args?.isDrm;
    this._initialDuration = args.duration;
    this._duration = args.duration;
    this._frameRateModel = args.frameRateModel;
    this._ffomTimecodeModel = args.ffomTimecodeModel;
    this._initSegmentTimeOffset = args.initSegmentTimeOffset;
  }

  loadStart() {
    this._loadStage.start();
    this._onEvent$.next({
      type: MainMediaEventType.MAIN_MEDIA_LOADING,
      data: {
        mainMediaState: this.state,
      },
    });
  }

  loadSuccess() {
    this._loadStage.success();
    this._onEvent$.next({
      type: MainMediaEventType.MAIN_MEDIA_LOADED,
      data: {
        mainMediaState: this.state,
      },
    });
  }

  loadError(error: string | undefined) {
    this._loadStage.failure(error);
    this._onEvent$.next({
      type: MainMediaEventType.MAIN_MEDIA_LOAD_ERROR,
      data: {
        mainMediaState: this.state,
        error: error,
      },
    });
  }

  addTrack(track: Track): void {
    this._tracks.push(track);
    this._tracksMap.set(track.id, track);
  }

  addTracks(tracks: Track[]) {
    tracks.forEach((track) => {
      this.addTrack(track);
    });
  }

  get source(): Source {
    return this._source;
  }

  get mainMediaType(): MainMediaType {
    return this._mainMediaType;
  }

  get tracks(): Track[] {
    return this._tracks;
  }

  get loadStage(): OpStage {
    return this._loadStage;
  }

  get isDrm(): boolean | undefined {
    return this._isDrm;
  }

  get initialDuration(): number | undefined {
    return this._initialDuration;
  }

  get duration(): number | undefined {
    return this._duration;
  }

  get frameRateModel(): FrameRateModel | undefined {
    return this._frameRateModel;
  }

  get ffomTimecodeModel(): TimecodeModel | undefined {
    return this._ffomTimecodeModel;
  }

  get initSegmentTimeOffset(): number | undefined {
    return this._initSegmentTimeOffset;
  }

  get sourceFileFormatType(): FileFormatType | undefined {
    return this._sourceFileFormatType;
  }

  updateAttrs(attrs: MainMediaUpdateableAttrs) {
    if (objectHasOwnProperty(attrs, 'isDrm')) {
      this._isDrm = attrs.isDrm;
    }

    if (objectHasOwnProperty(attrs, 'duration')) {
      this._duration = attrs.duration;
      if (!this._initialDuration) {
        this._initialDuration = attrs.duration;
      }
    }

    if (objectHasOwnProperty(attrs, 'frameRateModel')) {
      this._frameRateModel = attrs.frameRateModel;
    }

    if (objectHasOwnProperty(attrs, 'ffomTimecodeModel')) {
      this._ffomTimecodeModel = attrs.ffomTimecodeModel;
    }

    if (objectHasOwnProperty(attrs, 'initSegmentTimeOffset')) {
      this._initSegmentTimeOffset = attrs.initSegmentTimeOffset;
    }

    this._onEvent$.next({
      type: MainMediaEventType.MAIN_MEDIA_UPDATED,
      data: {
        mainMediaState: this.state,
      },
    });
  }

  get onEvent$(): Observable<MainMediaEvent> {
    return this._onEvent$.asObservable();
  }

  protected _getState(): MainMediaState {
    return {
      ...super._getState(),
      mainMediaType: this._mainMediaType,
      source: this.source.state,
      sourceFileFormatType: this._sourceFileFormatType,
      loadOptions: this._loadOptions,
      tracks: this.tracks.map((p) => p.state),
      loadStage: this.loadStage.state,

      isDrm: this._isDrm,
      duration: this._duration,
      initialDuration: this._initialDuration,
      frameRateModel: this._frameRateModel,
      ffomTimecodeModel: this._ffomTimecodeModel,
      initSegmentTimeOffset: this._initSegmentTimeOffset,
    };
  }
}
