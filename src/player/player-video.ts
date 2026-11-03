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

import {filter, Observable, observeOn, queueScheduler, Subject, take, takeUntil} from 'rxjs';
import type {Destroyable, Serializable} from '../common/capabilities';
import {type MediaContainerTrack, type MediaContainerTrackState, type MediaContainerTrackUpdateableAttrs, type TrackState, TrackType} from '../media';
import type {PlayerController} from './player-controller-api';
import {OpStageStatus} from '../common/op-stage';
import {ObserverBreaker} from '../common/observer-breaker';
import {errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import type {PlayerVideoApi, PlayerVideoInternalApi} from './player-video-api';
import type {PlayerInternalApi} from './player-api';
import type {OmpProvider} from '../omp-provider';
import {SessionStore} from '../session';
import {TrackRepository} from '../repository';
import {checkSidecarVideoTrackTypeEnabled} from '../media/media-container-track';
import {WindowPlaybackMode} from '../common';
import {PlayerTrackEventType} from './player-track';
import {PlayerSidecarVideoTrack, type PlayerVideoLoadOptions, type PlayerVideoTrackState} from './player-video-track';
import {SidecarVideoAwakeBudget, SidecarVideoLoadQueue} from '../video';
import {SEEK_STEP_PLAYBACK_DEFAULTS, SIDECAR_VIDEO_DEFAULTS} from '../constants';
import type {FrameImageConfig} from '../frame-image/frame-image-window';

export enum PlayerVideoEventType {
  PLAYER_VIDEO_CHANGE = 'PLAYER_VIDEO_CHANGE',
  /** Active sidecar video track has changed. */
  PLAYER_VIDEO_TRACK_SWITCHED = 'PLAYER_VIDEO_TRACK_SWITCHED',

  PLAYER_VIDEO_TRACK_LOADING = 'PLAYER_VIDEO_TRACK_LOADING',
  PLAYER_VIDEO_TRACK_LOADED = 'PLAYER_VIDEO_TRACK_LOADED',
  PLAYER_VIDEO_TRACK_LOAD_ERROR = 'PLAYER_VIDEO_TRACK_LOAD_ERROR',
  PLAYER_VIDEO_TRACK_UNLOADED = 'PLAYER_VIDEO_TRACK_UNLOADED',

  PLAYER_VIDEO_TRACKS_REQUESTING_BUFFERING_CHANGE = 'PLAYER_VIDEO_TRACKS_REQUESTING_BUFFERING_CHANGE',
  /** Sidecar video started or stopped covering main media, main media audio is silenced while it does. */
  PLAYER_VIDEO_TRACKS_VISIBLE_CHANGE = 'PLAYER_VIDEO_TRACKS_VISIBLE_CHANGE',
}

export interface PlayerVideoState extends Serializable {
  tracks: PlayerVideoTrackState[];
}

export interface PlayerVideoTrackEventData extends Serializable {
  playerVideoTrack: PlayerVideoTrackState;
}

export interface PlayerVideoTrackSwitchedEventData extends PlayerVideoTrackEventData {
  playerVideo: PlayerVideoState;
}

export interface PlayerVideoTrackErrorEventData extends PlayerVideoTrackEventData {
  error: string | undefined;
}

export interface PlayerVideoTracksRequestingBufferingChangeEventData extends Serializable {
  /** Track whose buffering request changed */
  playerVideoTrack: PlayerVideoTrackState;
  bufferingRequired: boolean;
  /** All tracks currently requesting buffering */
  playerVideoTracks: PlayerVideoTrackState[];
}

export interface PlayerVideoTracksVisibleChangeEventData extends Serializable {
  /** Visible tracks, covering main media, empty when main media is visible */
  playerVideoTracks: PlayerVideoTrackState[];
}

export type PlayerVideoEventTypeDataMap = {
  [PlayerVideoEventType.PLAYER_VIDEO_CHANGE]: {
    playerVideo: PlayerVideoState;
  };

  [PlayerVideoEventType.PLAYER_VIDEO_TRACK_SWITCHED]: PlayerVideoTrackSwitchedEventData;
  [PlayerVideoEventType.PLAYER_VIDEO_TRACK_LOADING]: PlayerVideoTrackEventData;
  [PlayerVideoEventType.PLAYER_VIDEO_TRACK_LOADED]: PlayerVideoTrackEventData;
  [PlayerVideoEventType.PLAYER_VIDEO_TRACK_LOAD_ERROR]: PlayerVideoTrackErrorEventData;
  [PlayerVideoEventType.PLAYER_VIDEO_TRACK_UNLOADED]: PlayerVideoTrackEventData;

  [PlayerVideoEventType.PLAYER_VIDEO_TRACKS_REQUESTING_BUFFERING_CHANGE]: PlayerVideoTracksRequestingBufferingChangeEventData;
  [PlayerVideoEventType.PLAYER_VIDEO_TRACKS_VISIBLE_CHANGE]: PlayerVideoTracksVisibleChangeEventData;
};

export type PlayerVideoEvent = {
  [K in PlayerVideoEventType]: {
    type: K;
    data: PlayerVideoEventTypeDataMap[K];
  };
}[keyof PlayerVideoEventTypeDataMap];

export class PlayerVideo implements PlayerVideoApi, Destroyable {
  protected readonly _onEvent$: Subject<PlayerVideoEvent> = new Subject<PlayerVideoEvent>();

  protected _sessionStore: SessionStore;
  protected _trackRepository: TrackRepository;

  protected _player!: PlayerInternalApi;

  protected _playerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  constructor(ompProvider: OmpProvider, player: PlayerInternalApi) {
    this._sessionStore = ompProvider.sessionStore;
    this._trackRepository = ompProvider.trackRepository;
    this.wirePlayer(player);
  }

  wirePlayer(player: PlayerInternalApi) {
    if (this._player === player) {
      return;
    }

    this._playerBreaker.break();

    this._player = player;

    this._player.videoInternal.onEvent$
      .pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .pipe(filter(() => this.isAttached() || this.isDetached()))
      .subscribe((event) => {
        this._onEvent$.next(event);
      });
  }

  getTracks(): MediaContainerTrack[] {
    return this._player.videoInternal.getTracks().map((p) => this._trackRepository.getOrFail(p.id) as MediaContainerTrack);
  }

  switchTrack(trackId: TrackState['id'], activate?: boolean): Observable<void> {
    return passiveObservable((observer) => {
      this._player.videoInternal.switchTrack(trackId, activate).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
      });
    });
  }

  protected isAttached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED;
  }

  protected isDetached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
  }

  get onEvent$(): Observable<PlayerVideoEvent> {
    return this._onEvent$.asObservable();
  }

  get state(): PlayerVideoState {
    return this._player.videoInternal.state;
  }

  destroy() {
    this._playerBreaker.destroy();
    this._destroyBreaker.destroy();
    freeObserver(this._onEvent$);
  }
}

/**
 * Sidecar video configuration, shared by all sidecar videos of a player. Defaults keep every sidecar video loading at once and awake near its time window.
 */
export interface PlayerVideoConfig {
  /** Maximum number of sidecar video first loads running at once, others wait. Defaults to `Infinity`, no limit. */
  loadConcurrency: number;

  /**
   * Maximum number of sidecar videos awake at once - with source attached, holding decoder, network and buffers.
   * Sidecar videos closer to main media time take precedence, active sidecar video inside its time window always gets a slot. Defaults to `Infinity`, no limit.
   */
  maxAwake: number;

  /**
   * Whether sidecar video first load only resolves duration - MP4 metadata, or HLS playlists - without loading media data.
   * Sidecar video stays dormant until main media time gets near its time window. Defaults to `false`, media is loaded.
   * First load is skipped regardless when sidecar video duration is known, set with `args.duration` in load options.
   */
  metadataLoad: boolean;

  /**
   * Seconds of main media time at 1x, multiplied by absolute playback rate, between seeks of sidecar video that can't play at main media playback rate - backwards, or faster than
   * {@link SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate}. Defaults to {@link SEEK_STEP_PLAYBACK_DEFAULTS.seekStep}.
   */
  seekStep: number;

  /** Minimum milliseconds between seeks of sidecar video that can't play at main media playback rate. Defaults to {@link SEEK_STEP_PLAYBACK_DEFAULTS.minSeekInterval}. */
  minSeekInterval: number;
}

export const PLAYER_VIDEO_CONFIG_DEFAULT: PlayerVideoConfig = {
  loadConcurrency: Number.POSITIVE_INFINITY,
  maxAwake: Number.POSITIVE_INFINITY,
  metadataLoad: false,
  seekStep: SEEK_STEP_PLAYBACK_DEFAULTS.seekStep,
  minSeekInterval: SEEK_STEP_PLAYBACK_DEFAULTS.minSeekInterval,
};

/**
 * Manages sidecar video tracks (HLS streams or MP4 files) played in their own DOM controllers, synced with main media.
 * Only one sidecar video can be active, see {@link PlayerVideoCommonApi.switchTrack}.
 */
export class PlayerVideoInternal implements PlayerVideoInternalApi, Destroyable {
  private readonly _onEvent$: Subject<PlayerVideoEvent> = new Subject<PlayerVideoEvent>();
  private readonly _onEventQueue$ = new Subject<PlayerVideoEvent>();

  private _playerController: PlayerController | undefined;

  private _playerTracks: PlayerSidecarVideoTrack[] = [];
  private _playerTracksRequestingBuffering: Set<PlayerSidecarVideoTrack> = new Set<PlayerSidecarVideoTrack>();
  /** Whether any sidecar video is visible, covering main media */
  private _anyVisible = false;
  /** Buffering requested by sidecar video controllers, main media doesn't wait for sidecar videos covered by trick track, see {@link isCoveredByTrickTrack}. */
  private _bufferingRequired: Map<PlayerSidecarVideoTrack, boolean> = new Map<PlayerSidecarVideoTrack, boolean>();
  /** Loaded trick tracks, main media plays backwards or faster than media element can only while one is loaded, see {@link updateSeekStepPlaybackEnabled}. */
  private _loadedTrickTracks: Set<PlayerSidecarVideoTrack> = new Set<PlayerSidecarVideoTrack>();

  private _config: PlayerVideoConfig;
  private _frameImageConfig: Partial<FrameImageConfig> | undefined;
  private _loadQueue: SidecarVideoLoadQueue;
  private _awakeBudget: SidecarVideoAwakeBudget;

  private _eventBreaker = new ObserverBreaker();
  private _destroyBreaker = new ObserverBreaker();

  constructor(config?: Partial<PlayerVideoConfig> | undefined, frameImageConfig?: Partial<FrameImageConfig> | undefined) {
    this._config = {
      ...PLAYER_VIDEO_CONFIG_DEFAULT,
      ...config,
    };
    this._frameImageConfig = frameImageConfig;
    this._loadQueue = new SidecarVideoLoadQueue(this._config.loadConcurrency);
    this._awakeBudget = new SidecarVideoAwakeBudget(this._config.maxAwake, SIDECAR_VIDEO_DEFAULTS.awakePreemptMargin);

    // guarantees proper event ordering, needed because we're emitting PLAYER_VIDEO_CHANGE on every event
    this._onEventQueue$.pipe(observeOn(queueScheduler), takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._onEvent$.next(event);
    });

    this._onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type !== PlayerVideoEventType.PLAYER_VIDEO_CHANGE))
      .subscribe(() => {
        this.emitPlayerVideoChange();
      });
  }

  protected emitPlayerVideoChange() {
    this._onEventQueue$.next({
      type: PlayerVideoEventType.PLAYER_VIDEO_CHANGE,
      data: {
        playerVideo: this.state,
      },
    });
  }

  get onEvent$(): Observable<PlayerVideoEvent> {
    return this._onEvent$.asObservable();
  }

  get state(): PlayerVideoState {
    return {
      tracks: this._playerTracks.map((p) => p.state),
    };
  }

  getTracks(): MediaContainerTrackState[] {
    return this._playerTracks.map((p) => p.trackState);
  }

  setup(playerController: PlayerController): void {
    if (this._playerController) {
      this.teardown();
    }
    this._playerController = playerController;
  }

  teardown() {
    this._eventBreaker.break();

    // controller is torn down together with tracks, it isn't switched to forward playback
    this._loadedTrickTracks.clear();
    [...this._playerTracks].forEach((p) => {
      this.destroyPlayerTrack(p);
    });

    this._playerController = void 0;
  }

  protected checkIsSetup() {
    if (!this._playerController) {
      throw new Error(`Controller not set up`);
    }
  }

  loadSidecarTrack(
    trackState: MediaContainerTrackState,
    trackUpdater: (attrs: MediaContainerTrackUpdateableAttrs) => Observable<MediaContainerTrackState>,
    loadOptions: PlayerVideoLoadOptions | undefined
  ): Observable<MediaContainerTrackState> {
    return new Observable((observer) => {
      this.checkIsSetup();
      checkSidecarVideoTrackTypeEnabled(trackState.trackType);

      if (trackState.loadStage.status !== OpStageStatus.SUCCESS) {
        throw new Error(`Track must be loaded before loading in player, id=${trackState.id}`);
      }

      if (this._playerTracks.find((p) => p.trackState.id === trackState.id)) {
        throw new Error(`Track already loaded, id=${trackState.id}`);
      }

      let playerTrack = new PlayerSidecarVideoTrack(
        trackState,
        this._playerController!,
        loadOptions,
        {
          metadataLoad: this._config.metadataLoad,
          awakeBudget: this._awakeBudget,
          seekStep: this._config.seekStep,
          minSeekInterval: this._config.minSeekInterval,
        },
        this._frameImageConfig
      );

      this._playerTracks.push(playerTrack);

      let onUnloaded$ = this._onEvent$
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(filter((p) => p.type === PlayerVideoEventType.PLAYER_VIDEO_TRACK_UNLOADED && p.data.playerVideoTrack.trackId === playerTrack.trackState.id));

      playerTrack.videoTrackController.onBufferingRequired$
        .pipe(takeUntil(onUnloaded$))
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe((bufferingRequired) => {
          this.updateRequestingBuffering(playerTrack, bufferingRequired);
        });

      playerTrack.videoTrackController.onShown$
        .pipe(takeUntil(onUnloaded$))
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe(() => {
          this.updateVisibility();
        });

      playerTrack.onEvent$
        .pipe(filter((p) => p.type === PlayerTrackEventType.PLAYER_TRACK_SWITCHED))
        .pipe(takeUntil(onUnloaded$))
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe(() => {
          this._onEventQueue$.next({
            type: PlayerVideoEventType.PLAYER_VIDEO_TRACK_SWITCHED,
            data: {
              playerVideo: this.state,
              playerVideoTrack: playerTrack.state,
            },
          });
        });

      let loadBreaker = new ObserverBreaker();
      playerTrack.onEvent$
        .pipe(takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .pipe(takeUntil(loadBreaker.observer))
        .subscribe((event) => {
          switch (event.type) {
            case PlayerTrackEventType.PLAYER_TRACK_LOADING:
              this._onEventQueue$.next({
                type: PlayerVideoEventType.PLAYER_VIDEO_TRACK_LOADING,
                data: {
                  playerVideoTrack: playerTrack.state,
                },
              });
              break;
            case PlayerTrackEventType.PLAYER_TRACK_LOADED:
              trackUpdater({
                duration: playerTrack.videoTrackController.duration,
              }).subscribe((containerTrackState) => {
                playerTrack.setTrackState(containerTrackState);

                if (playerTrack.trackState.trackType === TrackType.TRICK_TRACK && this._playerTracks.includes(playerTrack)) {
                  this._loadedTrickTracks.add(playerTrack);
                  this.updateSeekStepPlaybackEnabled();
                }

                this._onEventQueue$.next({
                  type: PlayerVideoEventType.PLAYER_VIDEO_TRACK_LOADED,
                  data: {
                    playerVideoTrack: playerTrack.state,
                  },
                });
                loadBreaker.break();
                nextCompleteObserver(observer, containerTrackState);
              });
              break;
            case PlayerTrackEventType.PLAYER_TRACK_LOAD_ERROR:
              this._onEventQueue$.next({
                type: PlayerVideoEventType.PLAYER_VIDEO_TRACK_LOAD_ERROR,
                data: {
                  playerVideoTrack: playerTrack.state,
                  error: event.data.error,
                },
              });
              loadBreaker.break();
              // failed track is not kept in player
              this.destroyPlayerTrack(playerTrack);
              errorCompleteObserver(observer, event.data.error);
              break;
          }
        });

      // load waits in queue while other loads are running, removed track frees its queue slot
      this._loadQueue
        .run(() => playerTrack.loadSource())
        .pipe(take(1))
        .pipe(takeUntil(onUnloaded$), takeUntil(this._eventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          error: () => {
            // handled in events above
          },
        });
    });
  }

  switchTrack(trackId: TrackState['id'], activate: boolean = true): Observable<void> {
    return new Observable<void>((observer) => {
      let playerTrack = this._playerTracks.find((p) => p.trackState.id === trackId);
      if (!playerTrack) {
        errorCompleteObserver(observer, new Error(`Sidecar video track not found, id=${trackId}`));
        return;
      }
      if (playerTrack.trackState.trackType === TrackType.TRICK_TRACK) {
        errorCompleteObserver(observer, new Error(`Trick track is shown only while main media plays backwards or faster than max native playback rate, it can't be switched, id=${trackId}`));
        return;
      }
      if (activate) {
        // only one sidecar video can be active, trick track is not switched
        this._playerTracks.filter((p) => p !== playerTrack && p.active && p.trackState.trackType !== TrackType.TRICK_TRACK).forEach((p) => p.setActive(false));
      }
      playerTrack.setActive(activate);
      nextCompleteObserver(observer);
    });
  }

  updateTrack(trackState: MediaContainerTrackState) {
    let playerTrack = this._playerTracks.find((p) => p.trackState.id === trackState.id);
    if (playerTrack) {
      try {
        playerTrack.setTrackState(trackState);
      } catch (e) {
        console.error(`Failed to update sidecar video id=${trackState.id}`, e);
      }
    }
  }

  removeSidecarTrack(id: TrackState['id']): Observable<void> {
    return new Observable<void>((observer) => {
      let playerTrack = this._playerTracks.find((p) => p.trackState.id === id);

      if (!playerTrack) {
        errorCompleteObserver(observer, new Error('No sidecar track found'));
        return;
      }

      this.destroyPlayerTrack(playerTrack);
      nextCompleteObserver(observer);
    });
  }

  removeAllSidecarTracks(): Observable<void> {
    return new Observable<void>((observer) => {
      [...this._playerTracks].forEach((p) => {
        this.destroyPlayerTrack(p);
      });
      nextCompleteObserver(observer);
    });
  }

  /**
   * @param bufferingRequired Buffering requested by sidecar video controller
   */
  protected updateRequestingBuffering(playerTrack: PlayerSidecarVideoTrack, bufferingRequired: boolean) {
    this._bufferingRequired.set(playerTrack, bufferingRequired);
    this.applyRequestingBuffering(playerTrack);
  }

  /** Main media waits for sidecar video requesting buffering, unless it is covered by shown trick track, nobody sees it then. */
  protected applyRequestingBuffering(playerTrack: PlayerSidecarVideoTrack) {
    let bufferingRequired = !!this._bufferingRequired.get(playerTrack) && !this.isCoveredByTrickTrack(playerTrack);
    let emitEvent = false;
    if (bufferingRequired && !this._playerTracksRequestingBuffering.has(playerTrack)) {
      this._playerTracksRequestingBuffering.add(playerTrack);
      emitEvent = true;
    } else if (!bufferingRequired && this._playerTracksRequestingBuffering.has(playerTrack)) {
      this._playerTracksRequestingBuffering.delete(playerTrack);
      emitEvent = true;
    }

    if (emitEvent) {
      this._onEventQueue$.next({
        type: PlayerVideoEventType.PLAYER_VIDEO_TRACKS_REQUESTING_BUFFERING_CHANGE,
        data: {
          playerVideoTrack: playerTrack.state,
          bufferingRequired: bufferingRequired,
          playerVideoTracks: [...this._playerTracksRequestingBuffering.values()].map((p) => p.state),
        },
      });
    }
  }

  /** Main media plays backwards or faster than media element can only while trick track is loaded. */
  protected updateSeekStepPlaybackEnabled() {
    this._playerController?.setSeekStepPlaybackEnabled(this._loadedTrickTracks.size > 0);
  }

  /** Whether sidecar video is covered by shown trick track. */
  protected isCoveredByTrickTrack(playerTrack: PlayerSidecarVideoTrack): boolean {
    return playerTrack.trackState.trackType !== TrackType.TRICK_TRACK && this._playerTracks.some((p) => p.trackState.trackType === TrackType.TRICK_TRACK && p.videoTrackController.shown);
  }

  /**
   * Sidecar video is visible only while shown, active and inside its time window.
   * Otherwise slate or main media under sidecar videos is visible.
   *
   * Shown trick track covers other sidecar videos, they are hidden while it is shown, so that sidecar video nobody sees isn't painted,
   * and main media doesn't wait for them, see {@link applyRequestingBuffering}.
   *
   * Visible sidecar video covers main media, change is emitted so that main media audio is silenced while it does.
   */
  protected updateVisibility() {
    this._playerTracks.forEach((p) => {
      let visible = p.videoTrackController.shown && !this.isCoveredByTrickTrack(p);
      if (p.videoTrackController.domController.visible !== visible) {
        p.videoTrackController.domController.visible = visible;
      }
    });
    // trick track shown or hidden, covered sidecar videos stop or start holding main media
    this._playerTracks.forEach((p) => this.applyRequestingBuffering(p));

    let visibleTracks = this._playerTracks.filter((p) => p.videoTrackController.domController.visible);
    if (this._anyVisible !== visibleTracks.length > 0) {
      this._anyVisible = visibleTracks.length > 0;
      this._onEventQueue$.next({
        type: PlayerVideoEventType.PLAYER_VIDEO_TRACKS_VISIBLE_CHANGE,
        data: {
          playerVideoTracks: visibleTracks.map((p) => p.state),
        },
      });
    }
  }

  protected destroyPlayerTrack(playerTrack: PlayerSidecarVideoTrack) {
    let index = this._playerTracks.indexOf(playerTrack);
    if (index < 0) {
      return;
    }
    this._playerTracks.splice(index, 1);

    // removed track must not keep main media waiting
    this.updateRequestingBuffering(playerTrack, false);
    this._bufferingRequired.delete(playerTrack);

    let state = playerTrack.state;
    playerTrack.destroy();

    // sidecar videos covered by removed trick track are shown again
    this.updateVisibility();

    if (this._loadedTrickTracks.delete(playerTrack)) {
      this.updateSeekStepPlaybackEnabled();
    }

    this._onEventQueue$.next({
      type: PlayerVideoEventType.PLAYER_VIDEO_TRACK_UNLOADED,
      data: {
        playerVideoTrack: state,
      },
    });
  }

  destroy() {
    this.teardown();
    this._destroyBreaker.destroy();
    freeObserver(this._onEvent$);
  }
}
