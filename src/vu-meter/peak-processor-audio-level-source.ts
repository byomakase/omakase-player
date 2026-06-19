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

import {filter, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../common/observer-breaker';
import {AudioLevelEventType, AudioLevelSource} from './audio-level-source';
import {AudioPeakProcessorEventType, type AudioHandlerApi, type AudioPeakProcessorPeaksMessage} from '../audio';
import {PlayerAudioEventType, PlayerAudioType, PlayerEventType} from '../player';
import type {Track} from '../media';
import type {OmakasePlayerApi, OmakasePlayerDetachedApi} from '../omakase-player-api';
import {SessionEventType} from '../session';
import {WindowPlaybackMode} from '../common';

export class PeakProcessorAudioLevelSource extends AudioLevelSource {
  protected _handlerBreaker = new ObserverBreaker();

  protected _player?: OmakasePlayerApi | undefined;
  protected _audioType?: PlayerAudioType | undefined;
  protected _trackId?: Track['id'] | undefined;

  constructor(player?: OmakasePlayerApi, audioType?: PlayerAudioType, trackId?: Track['id']) {
    super();
    this._player = player;
    this._audioType = audioType;
    this._trackId = trackId;
    this.wireEvents();
  }

  setHandler(handler: AudioHandlerApi): void {
    this._handlerBreaker.break();
    handler
      .createPeakProcessor()
      .pipe(takeUntil(this._destroyBreaker.observer), takeUntil(this._handlerBreaker.observer))
      .subscribe({
        next: () => {
          handler.onPeakProcessorEvent$
            .pipe(
              filter((e) => e.type === AudioPeakProcessorEventType.AUDIO_PEAK_PROCESSOR_MESSAGE && e.data.type === 'peaks'),
              takeUntil(this._destroyBreaker.observer),
              takeUntil(this._handlerBreaker.observer)
            )
            .subscribe((e) => {
              const peaks = (e.data as AudioPeakProcessorPeaksMessage).peaks;
              this._onEvent$.next({
                type: AudioLevelEventType.AUDIO_LEVEL_CHANGE,
                data: {
                  dbValues: peaks.map((peak) => this.dbFromFloat(peak)),
                },
              });
            });
        },
        error: (err) => {
          console.error(err);
          this._handlerBreaker.break();
        },
      });
  }

  destroy(): void {
    super.destroy();
    this._handlerBreaker.destroy();
  }

  private resetHandler() {
    if (this._player && this._audioType) {
      const handler = this._audioType === PlayerAudioType.SIDECAR ? this._player?.player.audio.getHandler(this._audioType, this._trackId!) : this._player?.player.audio.getHandler(this._audioType);
      if (handler) {
        this.setHandler(handler);
      }
    }
  }

  private wireEvents() {
    if (this._player) {
      this.resetHandler();
      this._player.session.onEvent$
        .pipe(
          filter((event) => event.type === SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe((event) => {
          if (event.data.windowPlayback.mode === WindowPlaybackMode.ATTACHED || event.data.windowPlayback.mode === WindowPlaybackMode.DETACHED) {
            this.resetHandler();
          } else {
            this._handlerBreaker.break();
          }
        });
      if (this._audioType === PlayerAudioType.MAIN) {
        this._player.player.audio.onEvent$
          .pipe(
            filter((event) => event.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED),
            takeUntil(this._destroyBreaker.observer)
          )
          .subscribe(() => {
            const activeMainTrackId = this._player?.player.audio.state.tracks[PlayerAudioType.MAIN].find((track) => track.active)?.trackId;
            let channelCount = this._player?.player.audio.getTracks().find((track) => track.id === activeMainTrackId)?.channels;
            if (channelCount) {
              this._onEvent$.next({
                type: AudioLevelEventType.CHANNEL_COUNT_CHANGE,
                data: {
                  channelCount: channelCount,
                },
              });
            }
          });
      }
      if (this._audioType === PlayerAudioType.MAIN || this._audioType === PlayerAudioType.OUTPUT) {
        this._player.player.onEvent$
          .pipe(
            filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING || event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED),
            takeUntil(this._destroyBreaker.observer)
          )
          .subscribe((event) => {
            switch (event.type) {
              case PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADING:
                this._handlerBreaker.break();
                break;
              case PlayerEventType.PLAYER_MAIN_MEDIA_LOADED:
                this.resetHandler();
                break;
            }
          });
      }
      if (this._trackId) {
        this._player.player.audio.onEvent$
          .pipe(
            filter(
              (event) =>
                (event.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED || event.type === PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED) &&
                event.data.playerAudioTrack.trackId === this._trackId
            ),
            takeUntil(this._destroyBreaker.observer)
          )
          .subscribe((event) => {
            switch (event.type) {
              case PlayerAudioEventType.PLAYER_AUDIO_TRACK_UNLOADED:
                this.destroy();
                break;
              case PlayerAudioEventType.PLAYER_AUDIO_TRACK_LOADED:
                this.resetHandler();
                break;
            }
          });
      }
    }
  }
}
