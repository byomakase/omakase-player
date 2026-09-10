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

import {BehaviorSubject, type Observable, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../common/observer-breaker';
import type {Destroyable} from '../common/capabilities';
import type {PlayerCommonApi, PlayerLiveState, PlayerPlayback} from '../player';
import {type PlayerEvent, PlayerEventType} from '../player';
import {PLAYER_CONTROLLER_DEFAULTS} from '../constants';

export interface UiLiveModel {
  /** Live media loaded. When false the other fields are meaningless (VOD). */
  isLive: boolean;
  /** Pinned to the live edge — indicates that the UI can currently treat the playhead position as live/end of the media */
  pinnedToLive: boolean;
  /** Start time for components refreshed on media update and playback interruptions */
  windowStart: number;
  /** End time for components refreshed on media update and playback interruptions */
  windowEnd: number;
  /** Latest safe seek position, can be larger than windowEnd */
  syncPosition: number;
}

export class LivePlaybackTrackerUtil {
  /**
   * Whether a live playhead should be considered "pinned to live" at a given moment — playing, live,
   * and within edge. Shared by {@link LivePlaybackTracker} (deriving
   * the live pin instant, live state) and {@link PlayerInternalUtil.wasPinnedToLive} (recomputing the
   * same predicate from a saved {@link PlayerSession} snapshot, after the fact) so both agree on
   * exactly what "pinned to live" means.
   */
  static resolvePinnedToLive(isLive: boolean, playing: boolean, currentTime: number, edgeTime: number): boolean {
    return isLive && playing && edgeTime - currentTime <= PLAYER_CONTROLLER_DEFAULTS.liveEdgeThreshold / 1000;
  }
}

/** Neutral model, ie. before any live state is known or once the view is no longer showing playback. */
export const UI_LIVE_MODEL_NOT_LIVE: UiLiveModel = {
  isLive: false,
  pinnedToLive: false,
  windowStart: 0,
  windowEnd: 0,
  syncPosition: 0,
};

export interface LivePlaybackTrackerApi {
  onChange$: Observable<UiLiveModel>;
  model: UiLiveModel;
}

/**
 * Tracks the current live-playback UI state as a single source of truth, shared by any UI element
 * that needs it (chroming, and others).
 *
 * Pinned-to-live is a MODE: it latches on (an actual go-to-live/scrub-to-edge seek while playing, or
 * catching back up to the edge during playback) and only breaks on an explicit interruption (pause,
 * or a seek that lands behind live).
 */
export class LivePlaybackTracker implements LivePlaybackTrackerApi, Destroyable {
  private readonly _onChange$: BehaviorSubject<UiLiveModel> = new BehaviorSubject<UiLiveModel>(UI_LIVE_MODEL_NOT_LIVE);
  private _playerBreaker = new ObserverBreaker();
  private _destroyBreaker = new ObserverBreaker();

  private _live = false;
  private _windowStart = 0;
  private _windowEnd = 0;
  private _committedEdge = 0;
  private _pinnedToLive = false;
  private _playerPlayback: PlayerPlayback | undefined;
  private _latestLiveState: PlayerLiveState | undefined;
  private _lastCurrentTime = 0; // freshest playhead (from progress ticks); the pinned window end at reload

  private _player: PlayerCommonApi | undefined;

  wirePlayer(player: PlayerCommonApi): void {
    if (this._player === player) {
      return;
    }

    this._playerBreaker.break();
    this._player = player;
    this._lastCurrentTime = 0;

    player.onEvent$
      .pipe(takeUntil(this._playerBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => this._handle(event));

    this._emitIfChanged();
  }

  get onChange$(): Observable<UiLiveModel> {
    return this._onChange$.asObservable();
  }

  get model(): UiLiveModel {
    return this._buildModel();
  }

  private resolvePinnedToLiveValue(time: number): boolean {
    return LivePlaybackTrackerUtil.resolvePinnedToLive(this._live, !!this._playerPlayback?.playing, time, this._latestLiveState?.liveSyncPosition ?? this._windowEnd);
  }

  private _handle(event: PlayerEvent): void {
    switch (event.type) {
      case PlayerEventType.PLAYER_SEEKING: {
        if (this._live) {
          // Seeking away from the edge always breaks the pin, playing or not; landing on the edge
          // only latches it while actually playing — otherwise an automatic initial seek (e.g. the
          // HLS controller's own seek-to-sync-position on first live transition) would look
          // identical to a deliberate "go live" action and pin before anything has played.
          this._pinnedToLive = this.resolvePinnedToLiveValue(event.data.toTime);
          this._lastCurrentTime = event.data.toTime;
          this._windowEnd = this._resolveWindowEnd(event.data.toTime);
        }
        break;
      }
      case PlayerEventType.PLAYER_MAIN_MEDIA_LOADING: {
        this.reset();
        break;
      }
      case PlayerEventType.PLAYER_LIVE_STATE_UPDATE: {
        const liveState: PlayerLiveState | undefined = event.data.liveState;
        this._latestLiveState = liveState;
        this._live = !!liveState?.isLive;
        // Commit a fresh snapshot only on a manifest reload (edge moved) — ignore liveSyncPosition drift.
        if (liveState && liveState.liveEdgeDuration !== this._committedEdge) {
          this._windowStart = liveState.liveStartTime;
          this._committedEdge = liveState.liveEdgeDuration;
          this._windowEnd = this._resolveWindowEnd(this._lastCurrentTime);
        }
        if (this._live) {
          // paused playback reports no progress, so the pin has to be re-derived here or a window
          // resumed behind live keeps the edge pin it inherited until something seeks
          this._pinnedToLive = this.resolvePinnedToLiveValue(this._currentTime());
        }
        break;
      }
      case PlayerEventType.PLAYER_PLAYBACK_PROGRESS: {
        this._lastCurrentTime = event.data.currentTime;
        this._pinnedToLive = this.resolvePinnedToLiveValue(event.data.currentTime);
        break;
      }
      case PlayerEventType.PLAYER_PLAYBACK_CHANGE: {
        this._playerPlayback = event.data.playerPlayback;
        this._pinnedToLive = this.resolvePinnedToLiveValue(this._currentTime());
        break;
      }
      default:
        return;
    }
    this._emitIfChanged();
  }

  /** Freshest playhead this instance can report; progress ticks are silent while paused. */
  private _currentTime(): number {
    try {
      return this._player ? this._player.getCurrentTime() : this._lastCurrentTime;
    } catch {
      return this._lastCurrentTime;
    }
  }

  /**
   * While pinned to live, the window end anchors to the playhead rather than to the sync position, so the
   * pinned thumb sits at the actual playback position. Derive the pin before calling this - it reads
   * {@link _pinnedToLive}, and the pin is derived against the previous window end.
   */
  private _resolveWindowEnd(playhead: number): number {
    const syncPosition = this._latestLiveState?.liveSyncPosition ?? this._windowEnd;
    return this._pinnedToLive && playhead > this._windowStart ? Math.min(playhead, syncPosition) : syncPosition;
  }

  private _buildModel(): UiLiveModel {
    return {
      isLive: this._live,
      pinnedToLive: this._pinnedToLive,
      windowStart: this._windowStart,
      windowEnd: this._windowEnd,
      syncPosition: this._latestLiveState?.liveSyncPosition ?? this._windowEnd,
    };
  }

  private _emitIfChanged(): void {
    this._onChange$.next(this._buildModel());
  }

  private reset() {
    this._live = false;
    this._latestLiveState = undefined;
    this._committedEdge = 0;
    this._pinnedToLive = false;
    this._playerPlayback = void 0;
  }

  destroy(): void {
    this._playerBreaker.destroy();
    this._destroyBreaker.destroy();
    this._onChange$.complete();
  }
}
