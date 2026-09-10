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
  TAMS = 'TAMS',
}

/**
 * Live stream mode.
 *
 * `EVENT` — Start-Over live: a fixed start that grows towards the live edge; full history is seekable.
 * `CONTINUOUS` — a continuously sliding live window (no fixed start; earliest segments are evicted).
 */
export enum LiveMode {
  CONTINUOUS = 'CONTINUOUS',
  EVENT = 'EVENT',
}

/**
 * Live details for a {@link MainMedia} whose source is a live stream.
 *
 * `liveStartTime`/`liveEdgeDuration` describe the currently seekable window and slide forward as the
 * manifest is reloaded (segments dropped from the front, appended at the edge). They mirror
 * the range hls.js would hand to `MediaSource.setLiveSeekableRange`, derived from the playlist.
 * All values are in the media element timeline (comparable to `currentTime`).
 */
export interface MediaLiveState {
  /** Earliest seekable position — start of the first fragment still in the playlist. */
  liveStartTime: number;
  /** Live edge — end of the last fragment/part in the playlist. */
  liveEdgeDuration: number;
  /** Duration of all segments (including evicted ones) up to the live sync point. */
  duration: number;
  /** Target segment duration; useful as seek headroom above {@link liveStartTime}. */
  targetDuration: number;
  /**
   * Durations of the segments at the front of the window, oldest first - the ones eviction consumes.
   * Real durations rather than {@link targetDuration}, which a manifest is free not to honour.
   */
  leadingSegmentDurations: number[];
  /** Media sequence number of the first segment in the window; identifies content across instances. */
  startSN: number;
  /** Continuous (sliding window) or Event (start-over) live. */
  liveMode: LiveMode;
  /** Wall-clock time (ms since epoch) of the last manifest reload; for stale-manifest detection. */
  manifestUpdatedTime: number;
}

/**
 * Lifecycle event types emitted by a {@link MainMedia} instance.
 */
export enum MainMediaEventType {
  MAIN_MEDIA_LOADING = 'MAIN_MEDIA_LOADING',
  MAIN_MEDIA_LOADED = 'MAIN_MEDIA_LOADED',
  MAIN_MEDIA_LOAD_ERROR = 'MAIN_MEDIA_LOAD_ERROR',
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

  duration?: number | undefined;
  initialDuration?: number | undefined;
  frameRateModel?: FrameRateModel | undefined;
  ffomTimecodeModel?: TimecodeModel | undefined;
  initSegmentTimeOffset?: number | undefined;
  hasDrm?: boolean | undefined;
  hasVideo?: boolean | undefined;
  hasAudio?: boolean | undefined;
  isLive?: boolean | undefined;
  liveState?: MediaLiveState | undefined;
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

  /** Whether the media source is DRM-protected. */
  get hasDrm(): boolean | undefined;

  /** Indicates whether media has video tracks. */
  get hasVideo(): boolean | undefined;

  /** Indicates whether media has audio tracks. */
  get hasAudio(): boolean | undefined;

  /** Whether the media source is a live stream. */
  get isLive(): boolean;

  /** Live details, present when {@link isLive} is `true`. */
  get liveState(): MediaLiveState | undefined;

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
export type MainMediaUpdateableAttrs = Pick<
  MainMediaState,
  'duration' | 'frameRateModel' | 'ffomTimecodeModel' | 'initSegmentTimeOffset' | 'hasDrm' | 'hasVideo' | 'hasAudio' | 'isLive' | 'liveState'
>;

export type MediaRotationValue = 0 | 90 | 180 | 270;

/**
 * Configuration provided when loading a main media source via
 * {@link OmakasePlayerApi.loadMainMedia} or {@link PlayerApi.loadMainMedia}.
 */
export interface BaseMainMediaLoadOptions extends Serializable {
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

  /** Number of degrees by which the video should be rotated (0, 90, 180 or 270) */
  mediaRotation?: MediaRotationValue;

  /**
   * When `true`, disables all automatic media probing / metadata HTTP requests (file format
   * detection, HLS init segment time offset, audio channel count/codec, etc.). `mainMediaType`
   * and/or `fileFormatType` must be provided explicitly, or loading fails — anything else that
   * would normally be probed falls back to a default value instead.
   */
  forceSkipMetadataResolution?: boolean;
}

export interface HlsMainMediaLoadOptions extends BaseMainMediaLoadOptions {}

export interface Mp4MainMediaLoadOptions extends BaseMainMediaLoadOptions {}

export interface AudioFileMainMediaLoadOptions extends BaseMainMediaLoadOptions {}

/**
 * Load options for TAMS media.
 *
 * {@link timerange} and {@link BaseMainMediaLoadOptions.duration} select the playback mode:
 *
 * - `timerange` with start and end — VOD over that range.
 * - `timerange` with start only (ie. `"[3600:0_"`) — start-over live ({@link LiveMode.EVENT}): a fixed
 *   start that grows towards the flow head, which is polled for new segments.
 * - `duration` only — sliding-window live ({@link LiveMode.CONTINUOUS}): a `duration` seconds long window
 *   that follows the flow head, with back buffer eviction.
 * - neither — VOD over a default window resolved from the flow timerange.
 *
 * `timerange` takes precedence over `duration`.
 */
export interface TamsMainMediaLoadOptions extends BaseMainMediaLoadOptions {
  /**
   * TAMS timerange to load, in TAMS timerange notation (ie. `"[0:0_600:0)"`, `"[3600:0_"`).
   * Open bounds are resolved from the flow timerange. Takes precedence over
   * {@link BaseMainMediaLoadOptions.duration}.
   */
  timerange?: string;

  /**
   * Whole hours to shift the derived FFOM timecode by, `-23` to `23`.
   */
  ffomTimeZoneOffset?: number;

  /**
   * Flow URLs to play alongside the flow being loaded. Allows on the fly multi flow creation as long as additional
   * flows are compatible. This is incompatible if the main TAMS resource provided is muxed, source or a multiflow.
   */
  additionalFlowUrls?: string[];

  /**
   * Keeps the flows and segments the manifest was built from on the loaded media, readable through
   * `TamsMainMedia.tamsMediaData`. Defaults to false.
   */
  returnTamsMediaData?: boolean;
}

export type MainMediaLoadOptionsMap = {
  [MainMediaType.HLS]: HlsMainMediaLoadOptions;
  [MainMediaType.MP4]: Mp4MainMediaLoadOptions;
  [MainMediaType.AUDIO_FILE]: AudioFileMainMediaLoadOptions;
  [MainMediaType.TAMS]: TamsMainMediaLoadOptions;
};

/**
 * Configuration provided when loading a main media source via
 * {@link OmakasePlayerApi.loadMainMedia} or {@link PlayerApi.loadMainMedia}.
 */
export type MainMediaLoadOptions = {
  [T in keyof MainMediaLoadOptionsMap]: {
    mainMediaType?: T;
  } & MainMediaLoadOptionsMap[T];
}[keyof MainMediaLoadOptionsMap];

export type MainMediaLoadOptionsFor<T extends MainMediaType> = {
  mainMediaType: T;
} & MainMediaLoadOptionsMap[T];

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
  /** Initial media duration in seconds. */
  duration?: number | undefined;
  /** Frame rate model for frame-accurate operations. */
  frameRateModel?: FrameRateModel | undefined;
  /** FFOM timecode model for time offset display. */
  ffomTimecodeModel?: TimecodeModel | undefined;
  /** Initialization segment time offset. */
  initSegmentTimeOffset?: number | undefined;
  /** Whether the media source is DRM-protected. */
  hasDrm?: boolean | undefined;
  /** Whether media has video. */
  hasVideo?: boolean | undefined;
  /** Whether media has audio. */
  hasAudio?: boolean | undefined;
  /** Whether the media source is a live stream. */
  isLive?: boolean | undefined;
  /** Live details, present for live streams. */
  liveState?: MediaLiveState | undefined;
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

  protected _initialDuration?: number | undefined;
  protected _duration?: number | undefined;
  protected _frameRateModel?: FrameRateModel | undefined;
  protected _ffomTimecodeModel?: TimecodeModel | undefined;
  protected _initSegmentTimeOffset?: number | undefined;
  protected _hasDrm?: boolean | undefined;
  protected _hasVideo?: boolean | undefined;
  protected _hasAudio?: boolean | undefined;
  protected _isLive: boolean = false;
  protected _liveState?: MediaLiveState | undefined;

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

    this._initialDuration = args.duration;
    this._duration = args.duration;
    this._frameRateModel = args.frameRateModel;
    this._ffomTimecodeModel = args.ffomTimecodeModel;
    this._initSegmentTimeOffset = args.initSegmentTimeOffset;
    this._hasDrm = !!args?.hasDrm;
    this._hasVideo = args.hasVideo;
    this._hasAudio = args.hasAudio;
    this._isLive = !!args.isLive;
    this._liveState = args.liveState;
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

  get hasDrm(): boolean | undefined {
    return this._hasDrm;
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

  get hasVideo(): boolean | undefined {
    return this._hasVideo;
  }

  get hasAudio(): boolean | undefined {
    return this._hasAudio;
  }

  get isLive(): boolean {
    return this._isLive;
  }

  get liveState(): MediaLiveState | undefined {
    return this._liveState;
  }

  get sourceFileFormatType(): FileFormatType | undefined {
    return this._sourceFileFormatType;
  }

  updateAttrs(attrs: MainMediaUpdateableAttrs) {
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

    if (objectHasOwnProperty(attrs, 'hasDrm')) {
      this._hasDrm = attrs.hasDrm;
    }

    if (objectHasOwnProperty(attrs, 'hasVideo')) {
      this._hasVideo = attrs.hasVideo;
    }

    if (objectHasOwnProperty(attrs, 'hasAudio')) {
      this._hasAudio = attrs.hasAudio;
    }

    if (objectHasOwnProperty(attrs, 'isLive')) {
      this._isLive = !!attrs.isLive;
    }

    if (objectHasOwnProperty(attrs, 'liveState')) {
      this._liveState = attrs.liveState;
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

      duration: this._duration,
      initialDuration: this._initialDuration,
      frameRateModel: this._frameRateModel,
      ffomTimecodeModel: this._ffomTimecodeModel,
      initSegmentTimeOffset: this._initSegmentTimeOffset,
      hasDrm: this._hasDrm,
      hasVideo: this._hasVideo,
      hasAudio: this._hasAudio,
      isLive: this._isLive,
      liveState: this._liveState,
    };
  }
}
