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

import {Audio, type AudioState, type AudioUpdateableAttrs, type TrackState} from '../media';
import type {AudioEffectsRegistry} from '../audio';
import type {Serializable} from '../common/capabilities';
import {Observable} from 'rxjs';
import {PlayerAudioType} from './player-audio';
import type {AudioHandlerApi, PlayerAudioHandlerState} from '../audio/audio-handler';
import type {PlayerAudioLoadOptions, PlayerAudioTrackState} from './player-audio-track';

/**
 * Defines the audio playback mode for the player.
 *
 * - `SINGLE`: Only one audio track can be active at a time.
 * - `MULTIPLE`: Multiple audio tracks can play simultaneously.
 */
export enum PlayerAudioMode {
  SINGLE = 'SINGLE',
  MULTIPLE = 'MULTIPLE',
}

export interface PlayerAudioState {
  audioMode: PlayerAudioMode;
  tracks: {
    [PlayerAudioType.MAIN]: PlayerAudioTrackState[];
    [PlayerAudioType.SIDECAR]: PlayerAudioTrackState[];
  };
  handlers: {
    [PlayerAudioType.OUTPUT]: PlayerAudioHandlerState | undefined;
    [PlayerAudioType.MAIN]: PlayerAudioHandlerState | undefined;
    [PlayerAudioType.SIDECAR]: PlayerAudioHandlerState[];
  };
}

export enum PlayerAudioEventType {
  PLAYER_AUDIO_LOADING = 'PLAYER_AUDIO_LOADING',
  PLAYER_AUDIO_LOADED = 'PLAYER_AUDIO_LOADED',
  PLAYER_AUDIO_LOAD_ERROR = 'PLAYER_AUDIO_LOAD_ERROR',
  PLAYER_AUDIO_UNLOADED = 'PLAYER_AUDIO_UNLOADED',

  PLAYER_AUDIO_CHANGE = 'PLAYER_AUDIO_CHANGE',
  PLAYER_AUDIO_TRACK_SWITCHED = 'PLAYER_AUDIO_TRACK_SWITCHED',

  PLAYER_AUDIO_TRACK_LOADING = 'PLAYER_AUDIO_TRACK_LOADING',
  PLAYER_AUDIO_TRACK_LOADED = 'PLAYER_AUDIO_TRACK_LOADED',
  PLAYER_AUDIO_TRACK_LOAD_ERROR = 'PLAYER_AUDIO_TRACK_LOAD_ERROR',
  PLAYER_AUDIO_TRACK_UNLOADED = 'PLAYER_AUDIO_TRACK_UNLOADED',

  PLAYER_AUDIO_TRACKS_REQUESTING_BUFFERING_CHANGE = 'PLAYER_AUDIO_TRACKS_REQUESTING_BUFFERING_CHANGE',
}

export interface PlayerAudioEventData extends Serializable {
  playerAudio: PlayerAudioState;
}

export interface PlayerAudioErrorEventData extends PlayerAudioEventData {
  error: string | undefined;
}

export interface PlayerAudioTrackEventData extends Serializable {
  playerAudioTrack: PlayerAudioTrackState;
}

export interface PlayerAudioTrackSwitchedEventData extends Serializable {
  playerAudio: PlayerAudioState;
  playerAudioTrack: PlayerAudioTrackState;
}

export interface PlayerAudioTrackErrorEventData extends PlayerAudioTrackEventData {
  error: string | undefined;
}

export type PlayerAudioEventTypeDataMap = {
  [PlayerAudioEventType.PLAYER_AUDIO_CHANGE]: PlayerAudioEventData;
  [PlayerAudioEventType.PLAYER_AUDIO_LOADING]: PlayerAudioEventData;
  [PlayerAudioEventType.PLAYER_AUDIO_LOADED]: PlayerAudioEventData;
  [PlayerAudioEventType.PLAYER_AUDIO_LOAD_ERROR]: PlayerAudioErrorEventData;
  [PlayerAudioEventType.PLAYER_AUDIO_UNLOADED]: PlayerAudioEventData;

  [PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED]: PlayerAudioTrackSwitchedEventData;
  [PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADING]: PlayerAudioTrackEventData;
  [PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED]: PlayerAudioTrackEventData;
  [PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOAD_ERROR]: PlayerAudioTrackErrorEventData;
  [PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED]: PlayerAudioTrackEventData;

  [PlayerAudioEventType.PLAYER_AUDIO_TRACKS_REQUESTING_BUFFERING_CHANGE]: {
    playerAudioTracks: PlayerAudioTrackState[];
  };
};

export type PlayerAudioEvent = {
  [K in PlayerAudioEventType]: {
    type: K;
    data: PlayerAudioEventTypeDataMap[K];
  };
}[keyof PlayerAudioEventTypeDataMap];

export interface PlayerAudioApi extends PlayerAudioCommonApi {
  /**
   * Returns tracks loaded by player
   */
  getTracks(): Audio[];
  getTracks(playerAudioType: PlayerAudioType.MAIN): Audio[];
  getTracks(playerAudioType: PlayerAudioType.SIDECAR): Audio[];

  audioContext: AudioContext;

  /**
   * Audio effects registry — use to register custom audio effect implementations.
   */
  audioEffects: AudioEffectsRegistry;
}

export interface PlayerAudioInternalApi extends PlayerAudioCommonApi {
  loadSidecarTrack(audioState: AudioState, trackUpdater: (attrs: AudioUpdateableAttrs) => Observable<AudioState>, loadOptions?: PlayerAudioLoadOptions | undefined): Observable<AudioState>;

  removeSidecarTrack(id: TrackState['id']): Observable<void>;
  removeAllSidecarTracks(): Observable<void>;

  updateTrack(trackState: AudioState): void;

  getTracks(): AudioState[];
  getTracks(playerAudioType: PlayerAudioType.MAIN): AudioState[];
  getTracks(playerAudioType: PlayerAudioType.SIDECAR): AudioState[];
}

export interface PlayerAudioCommonApi {
  /**
   * Observable that emits audio events as they occur.
   */
  onEvent$: Observable<PlayerAudioEvent>;

  /**
   * Current audio state snapshot.
   */
  state: PlayerAudioState;

  /**
   * Switches the active audio track.
   * @param trackId - ID of the track to switch to.
   * @param activate - Whether to immediately activate the track. Defaults to `true`.
   */
  switchTrack(trackId: Audio['id'], activate?: boolean): Observable<void>;

  /**
   * Returns the audio handler for the given OUTPUT or MAIN audio type.
   * @param playerAudioType - The audio type (`OUTPUT` or `MAIN`).
   */
  getHandler(playerAudioType: PlayerAudioType.OUTPUT | PlayerAudioType.MAIN): AudioHandlerApi | undefined;
  /**
   * Returns the audio handler for a specific SIDECAR track.
   * @param playerAudioType - Must be `SIDECAR`.
   * @param id - ID of the sidecar audio track.
   */
  getHandler(playerAudioType: PlayerAudioType.SIDECAR, id: Audio['id']): AudioHandlerApi | undefined;

  /**
   * Current volume level, in the range `[0, 1]`.
   */
  volume: number;

  /**
   * Whether audio is currently muted.
   */
  muted: boolean;

  /**
   * Mutes audio output.
   */
  mute(): Observable<void>;

  /**
   * Unmutes audio output.
   */
  unmute(): Observable<void>;

  /**
   * Toggles mute and unmute.
   */
  toggleMuted(): Observable<void>;

  /**
   * Mutes or unmutes audio output.
   * @param muted - `true` to mute, `false` to unmute.
   */
  setMuted(muted: boolean): Observable<void>;

  /**
   * Sets the volume level.
   * @param volume - A value in the range `[0, 1]`.
   */
  setVolume(volume: number): Observable<void>;
}
