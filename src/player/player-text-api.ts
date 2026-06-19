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

import type {Serializable} from '../common/capabilities';
import {Observable} from 'rxjs';
import type {TextTrack, TextTrackState, TextTrackUpdateableAttrs, TrackState} from '../media';
import type {PlayerTextTrackHandlerState, TextTrackHandlerApi} from '../text';
import {type PlayerTextTrackLoadOptions, type PlayerTextTrackState} from './player-text-track';
import {PlayerTextType} from './player-text';

/**
 * Defines the text track playback mode for the player.
 *
 * - `SINGLE`: Only one text track can be active at a time.
 */
export enum PlayerTextMode {
  SINGLE = 'SINGLE',
  // MULTIPLE = 'MULTIPLE',
}

export interface PlayerTextState {
  textMode: PlayerTextMode;
  tracks: {
    [PlayerTextType.MAIN]: PlayerTextTrackState[];
    [PlayerTextType.SIDECAR]: PlayerTextTrackState[];
  };
  handlers: {
    [PlayerTextType.MAIN]: PlayerTextTrackHandlerState[];
    [PlayerTextType.SIDECAR]: PlayerTextTrackHandlerState[];
  };
  shown: boolean;
}

export enum PlayerTextEventType {
  PLAYER_TEXT_LOADING = 'PLAYER_TEXT_LOADING',
  PLAYER_TEXT_LOADED = 'PLAYER_TEXT_LOADED',
  PLAYER_TEXT_LOAD_ERROR = 'PLAYER_TEXT_LOAD_ERROR',
  PLAYER_TEXT_UNLOADED = 'PLAYER_TEXT_UNLOADED',

  PLAYER_TEXT_CHANGE = 'PLAYER_TEXT_CHANGE',
  PLAYER_TEXT_TRACK_SWITCHED = 'PLAYER_TEXT_TRACK_SWITCHED',

  PLAYER_TEXT_TRACK_LOADING = 'PLAYER_TEXT_TRACK_LOADING',
  PLAYER_TEXT_TRACK_LOADED = 'PLAYER_TEXT_TRACK_LOADED',
  PLAYER_TEXT_TRACK_LOAD_ERROR = 'PLAYER_TEXT_TRACK_LOAD_ERROR',
  PLAYER_TEXT_TRACK_UNLOADED = 'PLAYER_TEXT_TRACK_UNLOADED',
}

export interface PlayerTextEventData extends Serializable {
  playerText: PlayerTextState;
}

export interface PlayerTextErrorEventData extends PlayerTextEventData {
  error: string | undefined;
}

export interface PlayerTextTrackEventData extends Serializable {
  playerTextTrack: PlayerTextTrackState;
}

export interface PlayerTextTrackSwitchedEventData extends Serializable {
  playerText: PlayerTextState;
  playerTextTrack: PlayerTextTrackState;
}

export interface PlayerTextTrackErrorEventData extends PlayerTextTrackEventData {
  error: string | undefined;
}

export type PlayerTextEventTypeDataMap = {
  [PlayerTextEventType.PLAYER_TEXT_CHANGE]: PlayerTextEventData;
  [PlayerTextEventType.PLAYER_TEXT_LOADING]: PlayerTextEventData;
  [PlayerTextEventType.PLAYER_TEXT_LOADED]: PlayerTextEventData;
  [PlayerTextEventType.PLAYER_TEXT_LOAD_ERROR]: PlayerTextErrorEventData;
  [PlayerTextEventType.PLAYER_TEXT_UNLOADED]: PlayerTextEventData;

  [PlayerTextEventType.PLAYER_TEXT_TRACK_SWITCHED]: PlayerTextTrackSwitchedEventData;
  [PlayerTextEventType.PLAYER_TEXT_TRACK_LOADING]: PlayerTextTrackEventData;
  [PlayerTextEventType.PLAYER_TEXT_TRACK_LOADED]: PlayerTextTrackEventData;
  [PlayerTextEventType.PLAYER_TEXT_TRACK_LOAD_ERROR]: PlayerTextTrackErrorEventData;
  [PlayerTextEventType.PLAYER_TEXT_TRACK_UNLOADED]: PlayerTextTrackEventData;
};

export type PlayerTextEvent = {
  [K in PlayerTextEventType]: {
    type: K;
    data: PlayerTextEventTypeDataMap[K];
  };
}[keyof PlayerTextEventTypeDataMap];

export interface PlayerTextApi extends PlayerTextCommonApi {
  /**
   * Returns tracks loaded by player
   */
  getTracks(): TextTrack[];
  getTracks(playerTextTrackType: PlayerTextType.MAIN): TextTrack[];
  getTracks(playerTextTrackType: PlayerTextType.SIDECAR): TextTrack[];
}

export interface PlayerTextInternalApi extends PlayerTextCommonApi {
  loadSidecarTrack(
    trackState: TextTrackState,
    trackUpdater: (attrs: TextTrackUpdateableAttrs) => Observable<TextTrackState>,
    loadOptions?: PlayerTextTrackLoadOptions | undefined
  ): Observable<TextTrackState>;
  removeSidecarTrack(id: TrackState['id']): Observable<void>;
  removeAllSidecarTracks(): Observable<void>;

  updateTrack(trackState: TextTrackState): void;

  getTracks(): TextTrackState[];
  getTracks(playerTextTrackType: PlayerTextType.MAIN): TextTrackState[];
  getTracks(playerTextTrackType: PlayerTextType.SIDECAR): TextTrackState[];
}

export interface PlayerTextCommonApi {
  /**
   * Observable that emits text events as they occur.
   */
  onEvent$: Observable<PlayerTextEvent>;

  /**
   * Current text state snapshot.
   */
  state: PlayerTextState;

  /**
   * Switches the active text track.
   * @param trackId - ID of the track to switch to.
   * @param show - Whether to show the track after switching. Defaults to `true`.
   */
  switchTrack(trackId: TextTrack['id'], show?: boolean): Observable<void>;

  /**
   * Returns the handler for a specific text track.
   * @param trackId - ID of the text track.
   */
  getHandler(trackId: TextTrack['id']): TextTrackHandlerApi | undefined;

  /**
   * Whether active text tracks are currently visible.
   */
  shown: boolean;

  /**
   * Shows text tracks.
   */
  show(): Observable<void>;

  /**
   * Hides text tracks.
   */
  hide(): Observable<void>;

  /**
   * Toggles show and hide.
   */
  toggleShowHide(): Observable<void>;
}
