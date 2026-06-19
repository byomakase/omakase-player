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
import {type MainMediaState} from '../media';
import type {
  PlayerControllerBufferingEventData,
  PlayerControllerPlaybackProgressEventData,
  PlayerControllerPlaybackRateUpdateEventData,
  PlayerControllerSeekedEventData,
  PlayerControllerSeekingEventData,
} from './player-controller-api';
import type {PlayerAudioState} from './player-audio-api';
import type {PlayerSession} from '../session';
import type {PlayerPlayback} from './player';
import type {ChromingState} from '../chroming';
import type {PlayerTextState} from './player-text-api';

export enum PlayerEventType {
  PLAYER_SESSION_RESTORED = 'PLAYER_SESSION_RESTORED',

  PLAYER_MAIN_MEDIA_LOADING = 'PLAYER_MAIN_MEDIA_LOADING',
  PLAYER_MAIN_MEDIA_LOADED = 'PLAYER_MAIN_MEDIA_LOADED',
  PLAYER_MAIN_MEDIA_LOAD_ERROR = 'PLAYER_MAIN_MEDIA_LOAD_ERROR',
  PLAYER_MAIN_MEDIA_UNLOADING = 'PLAYER_MAIN_MEDIA_UNLOADING',
  PLAYER_MAIN_MEDIA_UNLOADED = 'PLAYER_MAIN_MEDIA_UNLOADED',
  PLAYER_MAIN_MEDIA_UPDATED = 'PLAYER_MAIN_MEDIA_UPDATED',

  PLAYER_AUDIO_CHANGE = 'PLAYER_AUDIO_CHANGE',
  PLAYER_CHROMING_CHANGE = 'PLAYER_CHROMING_CHANGE',
  PLAYER_TEXT_CHANGE = 'PLAYER_TEXT_CHANGE',

  PLAYER_PLAYBACK_CHANGE = 'PLAYER_PLAYBACK_CHANGE',

  PLAYER_PLAY = 'PLAYER_PLAY',
  PLAYER_PAUSE = 'PLAYER_PAUSE',
  PLAYER_ENDED = 'PLAYER_ENDED',
  PLAYER_BUFFERING = 'PLAYER_BUFFERING',
  PLAYER_SEEKING = 'PLAYER_SEEKING',
  PLAYER_SEEKED = 'PLAYER_SEEKED',
  PLAYER_PLAYBACK_PROGRESS = 'PLAYER_PLAYBACK_PROGRESS',

  PLAYER_PLAYBACK_RATE_UPDATE = 'PLAYER_PLAYBACK_RATE_UPDATE',
}

export interface PlayerSessionRestoredEventData extends Serializable {
  playerSession: PlayerSession;
}

export interface PlayerMainMediaEventData extends Serializable {
  mainMediaState: MainMediaState;
}

export interface PlayerMainMediaUnloadedEventData extends Serializable {
  mainMediaId: MainMediaState['id'];
}

export interface PlayerMainMediaErrorEventData extends PlayerMainMediaEventData {
  error: string | undefined;
}

export interface PlayerPlaybackChangeEventData extends Serializable {
  playerPlayback: PlayerPlayback;
}

export interface PlayerAudioChangeEventData extends Serializable {
  playerAudio: PlayerAudioState;
}

export interface PlayerChromingChangeEventData extends Serializable {
  chroming: ChromingState;
}

export interface PlayerTextChangeEventData extends Serializable {
  playerText: PlayerTextState;
}

export interface PlayerPlaybackProgressEventData extends PlayerControllerPlaybackProgressEventData {}

export interface PlayerPlaybackRateUpdateEventData extends PlayerControllerPlaybackRateUpdateEventData {}

export interface PlayerPlayEventData extends PlayerControllerPlaybackProgressEventData {}

export interface PlayerPauseEventData extends PlayerPlayEventData {}

export interface PlayerEndedEventData extends PlayerPlayEventData {}

export interface PlayerBufferingEventData extends PlayerControllerBufferingEventData {}

export interface PlayerSeekingEventData extends PlayerControllerSeekingEventData {}

export interface PlayerSeekedEventData extends PlayerControllerSeekedEventData {}

export type PlayerEventTypeDataMap = {
  [PlayerEventType.PLAYER_SESSION_RESTORED]: PlayerSessionRestoredEventData;

  [PlayerEventType.PLAYER_MAIN_MEDIA_LOADING]: PlayerMainMediaEventData;
  [PlayerEventType.PLAYER_MAIN_MEDIA_LOADED]: PlayerMainMediaEventData;
  [PlayerEventType.PLAYER_MAIN_MEDIA_LOAD_ERROR]: PlayerMainMediaErrorEventData;
  [PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING]: PlayerMainMediaUnloadedEventData;
  [PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED]: PlayerMainMediaUnloadedEventData;
  [PlayerEventType.PLAYER_MAIN_MEDIA_UPDATED]: PlayerMainMediaEventData;

  [PlayerEventType.PLAYER_AUDIO_CHANGE]: PlayerAudioChangeEventData;
  [PlayerEventType.PLAYER_CHROMING_CHANGE]: PlayerChromingChangeEventData;
  [PlayerEventType.PLAYER_TEXT_CHANGE]: PlayerTextChangeEventData;

  [PlayerEventType.PLAYER_PLAYBACK_CHANGE]: PlayerPlaybackChangeEventData;

  [PlayerEventType.PLAYER_PLAYBACK_PROGRESS]: PlayerPlaybackProgressEventData;
  [PlayerEventType.PLAYER_PLAY]: PlayerPlayEventData;
  [PlayerEventType.PLAYER_PAUSE]: PlayerPauseEventData;
  [PlayerEventType.PLAYER_ENDED]: PlayerEndedEventData;
  [PlayerEventType.PLAYER_BUFFERING]: PlayerBufferingEventData;
  [PlayerEventType.PLAYER_SEEKING]: PlayerSeekingEventData;
  [PlayerEventType.PLAYER_SEEKED]: PlayerSeekedEventData;

  [PlayerEventType.PLAYER_PLAYBACK_RATE_UPDATE]: PlayerPlaybackRateUpdateEventData;
};

export type PlayerEvent = {
  [K in PlayerEventType]: {
    type: K;
    data: PlayerEventTypeDataMap[K];
  };
}[keyof PlayerEventTypeDataMap];
