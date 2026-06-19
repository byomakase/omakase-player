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

import {MediaTemporalConverter, MediaTemporalFormat, type MediaTemporalFormatValueMap, type MediaTemporalSeconds} from '../common';
import {MediaElementPlayback, type MediaElementPlaybackState} from '../common/media-element-playback';
import {type AudioState, type MainMediaLoadOptions, type MainMediaState, type MainMediaUpdateableAttrs, type TextTrackState, type Track} from '../media';
import {Observable} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import type {AudioTrackIdentifier, TextTrackIdentifier} from './player-controller';
import type {BufferedTimeRange} from '../dom/dom-media-element';
import type {Alert} from '../session/alerts-api';
import type {VideoKeyframe, VideoKeyframeOptions} from '../tools/keyframe-extractor';

export enum PlayerControllerEventType {
  PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE = 'PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE',

  PLAYER_CONTROLLER_PLAYBACK_PROGRESS = 'PLAYER_CONTROLLER_PLAYBACK_PROGRESS',
  PLAYER_CONTROLLER_PLAY = 'PLAYER_CONTROLLER_PLAY',
  PLAYER_CONTROLLER_PAUSE = 'PLAYER_CONTROLLER_PAUSE',
  PLAYER_CONTROLLER_ENDED = 'PLAYER_CONTROLLER_ENDED',
  PLAYER_CONTROLLER_BUFFERING = 'PLAYER_CONTROLLER_BUFFERING',
  PLAYER_CONTROLLER_SEEKING = 'PLAYER_CONTROLLER_SEEKING',
  PLAYER_CONTROLLER_SEEKED = 'PLAYER_CONTROLLER_SEEKED',

  PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE = 'PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE',
  PLAYER_CONTROLLER_DURATION_UPDATE = 'PLAYER_CONTROLLER_DURATION_UPDATE',

  PLAYER_CONTROLLER_AUDIO_SWITCHED = 'PLAYER_CONTROLLER_AUDIO_SWITCHED',
  PLAYER_CONTROLLER_TEXT_TRACK_SWITCHED = 'PLAYER_CONTROLLER_TEXT_TRACK_SWITCHED',
}

export interface PlayerControllerPlaybackProgressEventData {
  currentTime: MediaTemporalSeconds['value'];
}

export interface PlayerControllerSeekingEventData {
  /**
   * Seek from
   */
  fromTime: MediaTemporalSeconds['value'];

  /**
   * Seek to
   */
  toTime: MediaTemporalSeconds['value'];
}

export interface PlayerControllerSeekedEventData {
  /**
   * Current time
   */
  currentTime: MediaTemporalSeconds['value'];

  /**
   * Previous time
   */
  previousTime: MediaTemporalSeconds['value'];
}

export interface PlayerControllerBufferingEventData {
  bufferedTimeRanges: BufferedTimeRange[];
}

export interface PlayerControllerPlaybackRateUpdateEventData {
  /**
   * Playback rate
   */
  playbackRate: number;
}

export interface PlayerControllerDurationUpdateEventData {
  /**
   * Duration
   */
  duration: number;
}

export interface PlayerControllerAudioSwitchedEventData {
  activeAudioIdentifiers: AudioTrackIdentifier[];
}

export interface PlayerControllerTextTrackSwitchedEventData {
  activeTextTrackIdentifiers: TextTrackIdentifier[];
  textTracksDisplayed: boolean;
}

export interface PlayerControllerMediaElementPlaybackChangeEventData {
  mediaElementPlaybackState: MediaElementPlaybackState;
  currentTime: MediaTemporalSeconds['value'];
}

export type PlayerControllerEventTypeDataMap = {
  [PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE]: PlayerControllerPlaybackRateUpdateEventData;
  [PlayerControllerEventType.PLAYER_CONTROLLER_DURATION_UPDATE]: PlayerControllerDurationUpdateEventData;

  [PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE]: PlayerControllerMediaElementPlaybackChangeEventData;

  [PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS]: PlayerControllerPlaybackProgressEventData;
  [PlayerControllerEventType.PLAYER_CONTROLLER_PLAY]: PlayerControllerPlaybackProgressEventData;
  [PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE]: PlayerControllerPlaybackProgressEventData;
  [PlayerControllerEventType.PLAYER_CONTROLLER_ENDED]: PlayerControllerPlaybackProgressEventData;
  [PlayerControllerEventType.PLAYER_CONTROLLER_BUFFERING]: PlayerControllerBufferingEventData;
  [PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING]: PlayerControllerSeekingEventData;
  [PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED]: PlayerControllerSeekedEventData;

  [PlayerControllerEventType.PLAYER_CONTROLLER_AUDIO_SWITCHED]: PlayerControllerAudioSwitchedEventData;
  [PlayerControllerEventType.PLAYER_CONTROLLER_TEXT_TRACK_SWITCHED]: PlayerControllerTextTrackSwitchedEventData;
};
export type PlayerControllerEvent = {
  [K in PlayerControllerEventType]: {
    type: K;
    data: PlayerControllerEventTypeDataMap[K];
  };
}[keyof PlayerControllerEventTypeDataMap];

export type TypedMediaControllerEvent<T extends PlayerControllerEventType> = Extract<PlayerControllerEvent, {type: T}>;

export type MainMediaEssentialArgsHookType = (args: MainMediaUpdateableAttrs) => Observable<void>;
export type LoadMainMediaArgsType = {
  url: string;
  loadOptions?: MainMediaLoadOptions | undefined;
  mainMediaEssentialArgsHook: MainMediaEssentialArgsHookType;
  tracksCreatedHook: (tracks: Track[]) => Observable<void>;
  /**
   * If provided it will be used to identify possible known properties which we can take automatically instead of resolving them (ie. initSegmentTimeOffset etc.)
   */
  providedMainMedia?: MainMediaState;
};

export type RestoreMainMediaSessionArgsType = {
  mainMedia: MainMediaState;
  mainMediaLoadedHook: () => Observable<void>;
};

export interface PlayerController extends Destroyable {
  onEvent$: Observable<PlayerControllerEvent>;

  mediaElementPlayback: MediaElementPlayback | undefined;

  mediaTemporalConverter: MediaTemporalConverter | undefined;

  videoElement: HTMLVideoElement;

  textMediaCaptionsElement: HTMLElement;

  textImscElement: HTMLElement;

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean>;

  /**
   * Sets up media time converters and wires {@link onEvent$} events
   * @param mainMediaState
   */
  wireEvents(mainMediaState: MainMediaState): void;

  unwireEvents(): void;

  restoreMainMediaSession(args: RestoreMainMediaSessionArgsType): Observable<void>;

  play(): Observable<void>;
  pause(): Observable<void>;

  getCurrentTime(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getCurrentTime<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];

  getDuration(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getDuration<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];

  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS]): Observable<boolean>;
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS], format: MediaTemporalFormat.SECONDS): Observable<boolean>;
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.FRAME_COUNT], format: MediaTemporalFormat.FRAME_COUNT): Observable<boolean>;
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.PERCENT], format: MediaTemporalFormat.PERCENT): Observable<boolean>;
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.TIMECODE], format: MediaTemporalFormat.TIMECODE): Observable<boolean>;
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.MEDIA_TIME], format: MediaTemporalFormat.MEDIA_TIME): Observable<boolean>;
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat.COUNTDOWN_MEDIA_TIME], format: MediaTemporalFormat.COUNTDOWN_MEDIA_TIME): Observable<boolean>;
  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat): Observable<boolean>;

  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS]): Observable<boolean>;
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS], format: MediaTemporalFormat.SECONDS): Observable<boolean>;
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.FRAME_COUNT], format: MediaTemporalFormat.FRAME_COUNT): Observable<boolean>;
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.PERCENT], format: MediaTemporalFormat.PERCENT): Observable<boolean>;
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.TIMECODE], format: MediaTemporalFormat.TIMECODE): Observable<boolean>;
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.MEDIA_TIME], format: MediaTemporalFormat.MEDIA_TIME): Observable<boolean>;
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat.COUNTDOWN_MEDIA_TIME], format: MediaTemporalFormat.COUNTDOWN_MEDIA_TIME): Observable<boolean>;
  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat): Observable<boolean>;

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe>;

  // endregion

  // region convertTime()
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.SECONDS
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.FRAME_COUNT
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.FRAME_COUNT];
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.PERCENT
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.PERCENT];
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.TIMECODE
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.TIMECODE];
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.MEDIA_TIME
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.MEDIA_TIME];
  convertTime<S extends MediaTemporalFormat>(
    value: MediaTemporalFormatValueMap[S],
    valueFormat: S,
    destinationFormat: MediaTemporalFormat.COUNTDOWN_MEDIA_TIME
  ): MediaTemporalFormatValueMap[MediaTemporalFormat.COUNTDOWN_MEDIA_TIME];
  convertTime<S extends MediaTemporalFormat, D extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[S], valueFormat: S, destinationFormat: D): MediaTemporalFormatValueMap[D];
  // endregion

  playbackRate: number;
  setPlaybackRate(playbackRate: number): Observable<void>;

  // region audio
  createMediaElementSourceEnabled: boolean;

  resolveAudioTrackIdentifier(track: AudioState): AudioTrackIdentifier;
  resolveActiveAudioTracks(tracks: AudioState[]): AudioState[];
  isAudioTrackActive(track: AudioState): boolean;
  switchAudioTrack(track: AudioState, activate: boolean): Observable<void>;

  setWaitingForSyncedMedia(syncedMediaWaiting: boolean): void;

  // endregion

  // region text tracks
  textTracksDisplayed: boolean;
  setTextTracksDisplayed(textTracksDisplayed: boolean): void;

  resolveTextTrackIdentifier(track: TextTrackState): TextTrackIdentifier;
  resolveActiveTextTracks(track: TextTrackState[]): TextTrackState[];
  isTextTrackActive(track: TextTrackState): boolean;
  switchTextTrack(track: TextTrackState, activate: boolean): Observable<void>;
  // endregion
}

export interface PlayerDomController {
  mainMediaVideoElement: HTMLVideoElement;

  textMediaCaptionsElement: HTMLElement;

  textImscElement: HTMLElement;

  resetMainMediaVideoElement(): void;

  prepareForAttaching(): void;
  prepareForDetaching(): void;

  setAttachDetachButtonEnabled(enabled: true): void;

  setVideoPoster(poster: string): void;

  addAlert(alert: Alert): void;
  removeAlert(alertId: Alert['id']): void;

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe>;
}
