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

import {Observable} from 'rxjs';
import {type MainMedia, type MainMediaLoadOptions, type MainMediaState, MainMediaType, SlateType, type Track} from '../media';
import type {PlayerEvent} from './player-event';
import {MediaTemporalFormat, type MediaTemporalFormatValueMap} from '../common';
import {type PlayerAudioApi, type PlayerAudioInternalApi, PlayerAudioMode} from './player-audio-api';
import type {PlayerSession} from '../session';
import type {Destroyable} from '../common/capabilities';
import type {PlayerPlaybackEngineMapping} from './player-playback-engine';
import type {Source} from '../source';
import {type PlayerTextApi, type PlayerTextInternalApi, PlayerTextMode} from './player-text-api';
import {PlayerTextHandlerType} from './player-text-track';
import type {ChromingInternalApi} from '../chroming';
import type {HlsPlayerControllerConfig} from '../hls';
import type {Mp4PlayerControllerConfig} from '../mp4';
import type {AudioFilePlayerControllerConfig} from '../audio/audio-file-player-controller';
import type {PlayerTextType} from './player-text';
import type {TrackLoadOptions} from '../track';
import type {VideoKeyframe, VideoKeyframeOptions} from '../tools/keyframe-extractor';

/**
 * Default player configuration values.
 */
export const COMMON_PLAYER_CONFIG_DEFAULT: PlayerCommonConfig = {
  htmlElementId: 'omakase-player',
  audioMode: PlayerAudioMode.SINGLE,
  textMode: PlayerTextMode.SINGLE,
  textMainTracksHandler: [PlayerTextHandlerType.MEDIA_CAPTIONS],
};

/**
 * Configuration for the player.
 */
export interface PlayerConfig extends PlayerCommonConfig {
  /**
   * Optional function that resolves the URL used when the player transitions to detached mode.
   * Receives the current {@link MainMedia} and returns the URL for the detached player endpoint.
   */
  playerDetachedUrlFn?: (mainMedia: MainMedia) => string | undefined;
}

/**
 * Player API.
 */
export interface PlayerApi extends PlayerCommonApi {
  /**
   * Audio API.
   */
  audio: PlayerAudioApi;

  /**
   * Text API.
   */
  text: PlayerTextApi;

  /**
   * The currently loaded main media, or `undefined` if nothing is loaded.
   */
  mainMedia: MainMedia | undefined;

  /**
   * The underlying HTML element, or `undefined` if not yet created.
   */
  htmlMediaElement: HTMLMediaElement | undefined;

  /**
   * Loads the primary media source.
   *
   * @param url - URL of the media source.
   * @param loadOptions - Optional load configuration (frame rate, DRM data, poster, etc.).
   * @returns Observable that emits the {@link MainMedia} once its load stage reaches success.
   */
  loadMainMedia(url: string, loadOptions?: MainMediaLoadOptions | undefined): Observable<MainMedia>;

  /**
   * Loads a sidecar track (audio or text) from a {@link Source} object or URL string.
   *
   * @param source - A {@link Source} object or URL string pointing to the sidecar data.
   * @param loadOptions - Optional configuration specifying track type, text, or audio options.
   * @returns Observable that emits the loaded {@link Track}.
   */
  loadSidecarTrack(source: Source, loadOptions?: TrackLoadOptions | undefined): Observable<Track>;
  loadSidecarTrack(url: string, loadOptions?: TrackLoadOptions | undefined): Observable<Track>;

  /**
   * Replaces the current media with a slate (e.g. a black frame placeholder).
   *
   * @param slateType - The type of slate to load.
   * @returns Observable that emits the slate as a {@link MainMedia} instance.
   */
  loadSlate(slateType: SlateType): Observable<MainMedia>;

  /** Removes a single sidecar track by its id. */
  removeSidecarTrack(id: Track['id']): Observable<void>;
  /** Removes all sidecar tracks. */
  removeAllSidecarTracks(): Observable<void>;

  /**
   * Restores a previously persisted player session (playback position, audio/text state, etc.).
   */
  restorePlayerSession(playerSession: PlayerSession): Observable<void>;

  /** @ignore */
  getPlaybackEngine(mainMediaType: MainMediaType.HLS): PlayerPlaybackEngineMapping[MainMediaType.HLS];
  /** @ignore */
  getPlaybackEngine(mainMediaType: MainMediaType.MP4): PlayerPlaybackEngineMapping[MainMediaType.MP4];
  /** @ignore */
  getPlaybackEngine(mainMediaType: MainMediaType.AUDIO_FILE): PlayerPlaybackEngineMapping[MainMediaType.AUDIO_FILE];
  /**
   * Returns the playback engine instance for the given media type, providing
   * access to engine-specific configuration (e.g. HLS.js internals).
   */
  getPlaybackEngine<T extends MainMediaType>(mainMediaType: T): PlayerPlaybackEngineMapping[T];

  /** Whether the player is currently in fullscreen mode. */
  isFullScreen(): boolean;

  /**
   * Extracts video frame from current playhead position
   * @param options
   */
  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe>;
}

export interface PlayerLocalConfig extends PlayerInternalConfig {}

export interface PlayerLocalApi extends PlayerInternalApi, Destroyable {
  htmlMediaElement: HTMLMediaElement | undefined;

  setChromingInternal(chroming: ChromingInternalApi): void;

  loadMainMedia(mainMediaId: MainMedia['id']): Observable<MainMedia>;

  clearPlayerSession(): void;

  getPlaybackEngine(mainMediaType: MainMediaType.HLS): PlayerPlaybackEngineMapping[MainMediaType.HLS];
  getPlaybackEngine(mainMediaType: MainMediaType.MP4): PlayerPlaybackEngineMapping[MainMediaType.MP4];
  getPlaybackEngine(mainMediaType: MainMediaType.AUDIO_FILE): PlayerPlaybackEngineMapping[MainMediaType.AUDIO_FILE];
  getPlaybackEngine<T extends MainMediaType>(mainMediaType: T): PlayerPlaybackEngineMapping[T];
}

export interface PlayerDetachedConfig extends PlayerInternalConfig {}

export interface PlayerDetachedApi extends PlayerInternalApi, Destroyable {
  loadMainMedia(mainMediaId: MainMedia['id']): Observable<MainMediaState>;
}

export interface PlayerInternalConfig extends PlayerCommonConfig {}

export interface PlayerInternalApi extends PlayerCommonApi {
  audioInternal: PlayerAudioInternalApi;

  textInternal: PlayerTextInternalApi;

  restorePlayerSession(playerSession: PlayerSession): Observable<void>;

  loadSidecarTrack(trackId: Track['id'], loadOptions?: TrackLoadOptions | undefined): Observable<void>;
  removeSidecarTrack(trackId: Track['id']): Observable<void>;
  removeAllSidecarTracks(): Observable<void>;
  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe>;
}

/**
 * Maps each {@link MainMediaType} to its corresponding player controller config type.
 */
export type PlayerControllerConfigMap = {
  [MainMediaType.HLS]: HlsPlayerControllerConfig;
  [MainMediaType.MP4]: Mp4PlayerControllerConfig;
  [MainMediaType.AUDIO_FILE]: AudioFilePlayerControllerConfig;
};

/**
 * Shared configuration options for all player variants.
 */
interface PlayerCommonConfig {
  /** DOM element id of the container that hosts the `<video>` element. */
  htmlElementId: string;

  /** Audio track handling mode (single vs. multiple simultaneous tracks). */
  audioMode: PlayerAudioMode;
  /** Text track handling mode (single vs. multiple simultaneous tracks). */
  textMode: PlayerTextMode;

  /**
   * List of handlers used to render {@link PlayerTextType.MAIN} text tracks in the player:
   * - {@link PlayerTextHandlerType.EMBEDDED}: text tracks rendered natively through hls.js text handler
   * - {@link PlayerTextHandlerType.NATIVE}: text tracks rendered natively via the browser's native track element
   * - {@link PlayerTextHandlerType.MEDIA_CAPTIONS}: text tracks rendered natively with the media-captions handler
   *
   * An empty array disables in-player rendering of {@link PlayerTextType.MAIN} text tracks.
   */
  textMainTracksHandler: Exclude<PlayerTextHandlerType, PlayerTextHandlerType.IMSC>[];

  /**
   * Optional per-media-type player controller configuration.
   * Each key corresponds to a {@link MainMediaType} and its value is a partial config
   * for the matching controller (e.g. HLS, MP4, AudioFile).
   */
  controllerConfig?:
    | {
        [T in MainMediaType]?: Partial<PlayerControllerConfigMap[T]>;
      }
    | undefined;
}

/**
 * Shared API surface inherited by all player variants ({@link PlayerApi},
 * {@link PlayerInternalApi}, {@link PlayerLocalApi}, {@link PlayerDetachedApi}).
 *
 * Provides playback control, seeking (supporting multiple temporal formats),
 * time conversion, playback rate, and fullscreen toggling.
 */
interface PlayerCommonApi {
  /**
   * Observable stream of player lifecycle and playback events.
   */
  onEvent$: Observable<PlayerEvent>;

  /**
   * Current player session state (playback position, audio/text selection, etc.).
   */
  playerSession: PlayerSession;

  /**
   * Whether a main media source is currently loaded and ready.
   */
  isMainMediaLoaded: boolean;

  /**
   * Unloads the current main media and releases associated resources.
   */
  unloadMainMedia(): Observable<void>;

  /**
   * Starts or resumes playback.
   */
  play(): Observable<void>;

  /**
   * Pauses playback.
   */
  pause(): Observable<void>;

  /** @ignore */
  getCurrentTime(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  /**
   * Returns the current playback time. Defaults to seconds; pass a {@link MediaTemporalFormat}
   * to get the value in another format (frame count, percent, timecode, media time, countdown).
   */
  getCurrentTime<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];

  /** @ignore */
  getDuration(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  /**
   * Returns the media duration. Defaults to seconds; pass a {@link MediaTemporalFormat}
   * to get the value in another format.
   */
  getDuration<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];

  /** @ignore */
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS]): Observable<boolean>;
  /** @ignore */
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS], format: MediaTemporalFormat.SECONDS): Observable<boolean>;
  /** @ignore */
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.FRAME_COUNT], format: MediaTemporalFormat.FRAME_COUNT): Observable<boolean>;
  /** @ignore */
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.PERCENT], format: MediaTemporalFormat.PERCENT): Observable<boolean>;
  /** @ignore */
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.TIMECODE], format: MediaTemporalFormat.TIMECODE): Observable<boolean>;
  /** @ignore */
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.MEDIA_TIME], format: MediaTemporalFormat.MEDIA_TIME): Observable<boolean>;
  /** @ignore */
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.COUNTDOWN_MEDIA_TIME], format: MediaTemporalFormat.COUNTDOWN_MEDIA_TIME): Observable<boolean>;
  /**
   * Seeks to an absolute position. The value is interpreted according to the given
   * {@link MediaTemporalFormat} (defaults to seconds).
   *
   * @returns Observable that emits `true` if the seek succeeded.
   */
  seekTo<F extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[F], format: F): Observable<boolean>;

  /** @ignore */
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS]): Observable<boolean>;
  /** @ignore */
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS], format: MediaTemporalFormat.SECONDS): Observable<boolean>;
  /** @ignore */
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.FRAME_COUNT], format: MediaTemporalFormat.FRAME_COUNT): Observable<boolean>;
  /** @ignore */
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.PERCENT], format: MediaTemporalFormat.PERCENT): Observable<boolean>;
  /** @ignore */
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.TIMECODE], format: MediaTemporalFormat.TIMECODE): Observable<boolean>;
  /** @ignore */
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.MEDIA_TIME], format: MediaTemporalFormat.MEDIA_TIME): Observable<boolean>;
  /** @ignore */
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.COUNTDOWN_MEDIA_TIME], format: MediaTemporalFormat.COUNTDOWN_MEDIA_TIME): Observable<boolean>;
  /**
   * Seeks by a relative offset from the current playback position. The value is
   * interpreted according to the given {@link MediaTemporalFormat} (defaults to seconds).
   *
   * @returns Observable that emits `true` if the seek succeeded.
   */
  seekFromCurrentTime<F extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[F], format: F): Observable<boolean>;

  /** @ignore */
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.SECONDS
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  /** @ignore */
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.FRAME_COUNT
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.FRAME_COUNT];
  /** @ignore */
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.PERCENT
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.PERCENT];
  /** @ignore */
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.TIMECODE
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.TIMECODE];
  /** @ignore */
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.MEDIA_TIME
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.MEDIA_TIME];
  /** @ignore */
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.COUNTDOWN_MEDIA_TIME
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.COUNTDOWN_MEDIA_TIME];
  /**
   * Converts a time value from one {@link MediaTemporalFormat} to another
   * (e.g. seconds → timecode, frame count → percent).
   *
   * @param value - The time value to convert.
   * @param valueFormat - The format of the input value.
   * @param destinationFormat - The desired output format.
   */
  convertTime<S extends MediaTemporalFormat, D extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[S], valueFormat: S, destinationFormat: D): MediaTemporalFormatValueMap[D];

  /**
   * Sets the playback rate.
   * @param playbackRate - Decimal value in the range [0.1, 16]. For example, `2` plays at 2x speed.
   */
  setPlaybackRate(playbackRate: number): Observable<void>;

  /**
   * Toggles between fullscreen and windowed display.
   */
  toggleFullScreen(): Observable<void>;
}
