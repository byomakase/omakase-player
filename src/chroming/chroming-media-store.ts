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

import type {MediaState, MediaStore} from 'media-chrome/media-store/media-store';
import {MediaUIEvents} from 'media-chrome/constants';
import {filter, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../common/observer-breaker';
import type {Destroyable} from '../common/capabilities';
import {PlayerEventType} from '../player/player-event';
import type {PlayerApi, PlayerDetachedApi, PlayerPlayback} from '../player';

type ChromingMediaState = Pick<MediaState, 'mediaPaused' | 'mediaEnded'>;

/**
 * media-chrome {@link MediaStore} that takes playback state from the player instead of media element in media slot.
 *
 * Wraps media-controller's default store, which provides the rest of media state (ie. fullscreen). Playback state is propagated by media-controller
 * as any other media state, ie. as `mediapaused` attribute on media-controller itself, which media-chrome autohide and chroming styles depend on.
 * Media element doesn't play during detached playback, and there's no media element in media slot during virtual playback.
 */
export class ChromingMediaStore implements MediaStore, Destroyable {
  protected _mediaStore: MediaStore;
  protected _mediaStoreUnsubscribe: () => void;

  protected _player: PlayerApi | PlayerDetachedApi | undefined;
  protected _chromingMediaState: ChromingMediaState | undefined;

  protected _handlers: Set<(state: Partial<MediaState>) => void> = new Set();

  protected _playerBreaker = new ObserverBreaker();

  /**
   * Subscribes to wrapped store right away, so that wrapped store keeps monitoring its state owners (ie. fullscreen element) once media-controller
   * unsubscribes from it and subscribes to this store instead.
   */
  constructor(mediaStore: MediaStore) {
    this._mediaStore = mediaStore;
    this._mediaStoreUnsubscribe = this._mediaStore.subscribe(() => this.notifyHandlers());
  }

  set player(player: PlayerApi | PlayerDetachedApi) {
    this._playerBreaker.break();
    this._player = player;

    this.updateChromingMediaState(player.isMainMediaLoaded ? player.playerSession.playback : void 0);

    player.onEvent$
      .pipe(
        filter(
          (event) =>
            event.type === PlayerEventType.PLAYER_PLAYBACK_CHANGE ||
            event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED ||
            event.type === PlayerEventType.PLAYER_SESSION_RESTORED ||
            event.type === PlayerEventType.PLAYER_MAIN_MEDIA_UNLOADED
        ),
        takeUntil(this._playerBreaker.observer)
      )
      .subscribe((event) => {
        if (event.type === PlayerEventType.PLAYER_PLAYBACK_CHANGE) {
          this.updateChromingMediaState(event.data.playerPlayback);
        } else {
          this.updateChromingMediaState(player.isMainMediaLoaded ? player.playerSession.playback : void 0);
        }
      });
  }

  protected updateChromingMediaState(playback: PlayerPlayback | undefined) {
    this._chromingMediaState = {
      mediaPaused: !playback?.playing,
      mediaEnded: !!playback?.ended,
    };
    this.notifyHandlers();
  }

  protected notifyHandlers() {
    let state = this.getState();
    this._handlers.forEach((handler) => handler(state));
  }

  getState(): Partial<MediaState> {
    return {
      ...this._mediaStore.getState(),
      ...this._chromingMediaState,
    };
  }

  dispatch(eventOrAction: Parameters<MediaStore['dispatch']>[0]): void {
    // playback requests are played by the player, there's no media element to play them on during virtual playback
    if (eventOrAction.type === MediaUIEvents.MEDIA_PLAY_REQUEST || eventOrAction.type === MediaUIEvents.MEDIA_PAUSE_REQUEST) {
      if (this._player?.isMainMediaLoaded) {
        eventOrAction.type === MediaUIEvents.MEDIA_PLAY_REQUEST ? this._player.play() : this._player.pause();
      }
    } else {
      this._mediaStore.dispatch(eventOrAction);
    }
  }

  subscribe(handler: (state: Partial<MediaState>) => void): () => void {
    this._handlers.add(handler);
    handler(this.getState());
    return () => {
      this._handlers.delete(handler);
    };
  }

  destroy(): void {
    this._playerBreaker.destroy();
    this._handlers.clear();
    this._mediaStoreUnsubscribe();
  }
}
