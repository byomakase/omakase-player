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

import {BehaviorSubject, distinctUntilChanged, filter, map, Observable, sampleTime, takeUntil, timeout, timer} from 'rxjs';
import {BaseTrackController, type TrackController, type TrackControllerEvent, TrackControllerEventType} from '../player/track-controller';
import type {MediaContainerTrackState} from '../media';
import {type PlayerController, PlayerControllerEventType} from '../player/player-controller-api';
import {OpStageStatus} from '../common/op-stage';
import {SourceUtil} from '../source';
import {errorCompleteObserver, freeObserver, nextCompleteObserver} from '../util/rxjs-util';
import {isNullOrUndefined} from '../util/util-functions';
import {ObserverBreaker} from '../common/observer-breaker';
import type {Destroyable} from '../common/capabilities';
import {SIDECAR_VIDEO_DEFAULTS} from '../constants';
import {SeekStepPlaybackUtil} from '../common/seek-step-playback';
import {SidecarTimeWindow, SidecarTimeWindowPosition} from './sidecar-time-window';
import {type SidecarVideoAwakeCandidate, SidecarVideoAwakeBudget} from './sidecar-video-awake-budget';

/**
 * Owns sidecar media element and everything needed for its playback, mounted into host element.
 */
export interface SidecarDomController extends Destroyable {
  /**
   * Sidecar element visibility. Hidden element keeps its layout box, so it's not painted but keeps its size and becomes visible without re-layout.
   */
  visible: boolean;

  /**
   * Loads source, completes when media data needed to show sidecar is loaded.
   *
   * @param url Source url, not set when source is held by track state itself, ie. frame images of frame image track
   * @param startTime Sidecar time loading should start from, so the first fetched data is the one that will be played. Defaults to 0.
   */
  loadSource(url: string | undefined, startTime?: number): Observable<void>;

  /**
   * Resolves source duration without loading media data. Element is left without source.
   *
   * @param url Source url, not set when source is held by track state itself
   */
  loadDuration(url: string | undefined): Observable<number>;

  /**
   * Releases media resources, so network, decoded data and buffers are freed. Element stays mounted with its layout box.
   * Source is attached again with {@link loadSource}.
   */
  release(): void;
}

export interface SidecarTrackControllerConfig {
  /** Seconds before time window start sidecar starts warming up hidden. */
  warmUpDuration: number;

  /** Seconds before warm-up start dormant sidecar is woken up. Scaled by playback rate. */
  wakeAhead: number;

  /** Seconds after time window end sidecar is kept awake. */
  keepAwakeAfter: number;

  /**
   * Whether first load only resolves duration, without loading media data, see {@link SidecarDomController.loadDuration}.
   * Sidecar stays dormant until main media time gets near its time window. Ignored when track state has duration, first load is skipped then.
   */
  metadataLoad: boolean;

  /** Budget limiting number of sidecars awake at once, shared by all sidecars of a player. Defaults to budget without limit. */
  awakeBudget: SidecarVideoAwakeBudget;

  /** Seconds of main media time at 1x between seeks of sidecar that can't play at main media playback rate, multiplied by absolute playback rate, see {@link SeekStepper}. */
  seekStep: number;

  /** Minimum milliseconds between seeks of sidecar that can't play at main media playback rate, see {@link SeekStepper}. */
  minSeekInterval: number;
}

/**
 * Whether sidecar element has its source attached.
 * - DORMANT - source is released, sidecar uses no decoder, network or buffers
 * - WAKING - source is being attached again
 * - AWAKE - source is attached, sidecar is synced with main media
 */
export type SidecarVideoResidency = 'DORMANT' | 'WAKING' | 'AWAKE';

export interface SidecarTrackController<D extends SidecarDomController = SidecarDomController> extends TrackController<TrackControllerEvent> {
  onBufferingRequired$: Observable<boolean>;

  /** Whether sidecar is active. Only active sidecar is shown, inactive sidecar only warms up. */
  active: boolean;

  /** Emits whether sidecar should be shown, see {@link shown}. */
  onShown$: Observable<boolean>;

  /** Whether sidecar should be shown, sidecar is active and main media time is inside its time window. */
  shown: boolean;

  /** Whether sidecar is warming up hidden, ahead of its time window, or inside it while inactive. */
  warmingUp: boolean;

  /** Whether sidecar element has its source attached, see {@link SidecarVideoResidency}. */
  residency: SidecarVideoResidency;

  domController: D;

  /** Resolved time window, available once loaded. */
  timeWindow: SidecarTimeWindow | undefined;

  /** Sidecar duration in seconds, available once loaded. */
  duration: number | undefined;

  /** Updates track state, time window is re-resolved and sidecar is re-synced with main media. */
  setTrackState(trackState: MediaContainerTrackState): void;

  /** Activates or deactivates sidecar, sidecar is re-synced with main media. */
  setActive(active: boolean): void;
}

/**
 * Plays sidecar in its own {@link SidecarDomController}, synced with main media.
 *
 * Main media is the master clock. Main media time is mapped to sidecar time through {@link SidecarTimeWindow}.
 * Base controller resolves time window position, warm-up, visibility, residency and whether main media has to wait for sidecar.
 * Playing, pausing and seeking sidecar media is left to subclass, see {@link syncPlayback}.
 *
 * Sidecar element has its source attached only while main media time is near its time window, from
 * {@link SidecarTrackControllerConfig.wakeAhead} before warm-up to {@link SidecarTrackControllerConfig.keepAwakeAfter} after time window.
 * Elsewhere sidecar is dormant, source is released, so many sidecars on main media timeline don't hold decoders, network and buffers.
 * Dormant active sidecar inside its time window is woken up and main media waits for it.
 * Number of sidecars awake at once is limited by {@link SidecarTrackControllerConfig.awakeBudget}, sidecars closer to main media time take precedence.
 *
 * First load needs sidecar duration, to validate time window:
 * - duration known from track state - nothing is loaded, sidecar starts dormant
 * - {@link SidecarTrackControllerConfig.metadataLoad} - only duration is loaded, sidecar starts dormant
 * - otherwise - media is loaded from first sidecar time to be played, sidecar starts awake
 */
export abstract class BaseSidecarTrackController<D extends SidecarDomController>
  extends BaseTrackController<MediaContainerTrackState, TrackControllerEvent>
  implements SidecarTrackController<D>, SidecarVideoAwakeCandidate
{
  protected readonly _onBufferingRequired$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  protected readonly _onShown$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  protected _config: SidecarTrackControllerConfig;
  protected _playerController: PlayerController;
  protected _domController: D;

  protected _active = false;
  protected _warmingUp = false;

  protected _timeWindow: SidecarTimeWindow | undefined;

  protected _url: string | undefined;
  protected _residency: SidecarVideoResidency = 'DORMANT';
  /** Duration resolved on load, released element has no duration. */
  protected _duration: number | undefined;
  /** Set when waking up failed, sidecar stays dormant and main media doesn't wait for it until it is released or main media is seeked. */
  protected _wakeFailed = false;
  protected _wakeBreaker = new ObserverBreaker();

  protected constructor(trackState: MediaContainerTrackState, playerController: PlayerController, domController: D, config?: Partial<SidecarTrackControllerConfig>) {
    super(trackState);

    this._config = {
      warmUpDuration: SIDECAR_VIDEO_DEFAULTS.warmUpDuration,
      wakeAhead: SIDECAR_VIDEO_DEFAULTS.wakeAhead,
      keepAwakeAfter: SIDECAR_VIDEO_DEFAULTS.keepAwakeAfter,
      metadataLoad: false,
      ...config,
      // explicitly undefined seek step options resolve to defaults
      ...SeekStepPlaybackUtil.resolveConfig(config),
      awakeBudget: config?.awakeBudget ?? new SidecarVideoAwakeBudget(Number.POSITIVE_INFINITY, SIDECAR_VIDEO_DEFAULTS.awakePreemptMargin),
    };
    this._playerController = playerController;
    this._domController = domController;
  }

  get onBufferingRequired$(): Observable<boolean> {
    return this._onBufferingRequired$.asObservable();
  }

  get active(): boolean {
    return this._active;
  }

  get onShown$(): Observable<boolean> {
    return this._onShown$.pipe(distinctUntilChanged());
  }

  get shown(): boolean {
    return this._onShown$.value;
  }

  get warmingUp(): boolean {
    return this._warmingUp;
  }

  get residency(): SidecarVideoResidency {
    return this._residency;
  }

  get domController(): D {
    return this._domController;
  }

  get timeWindow(): SidecarTimeWindow | undefined {
    return this._timeWindow;
  }

  get duration(): number | undefined {
    return this.isLoaded() ? this._duration : void 0;
  }

  protected isLoaded(): boolean {
    return this._loadStage.state.status === OpStageStatus.SUCCESS;
  }

  protected isAwake(): boolean {
    return this.isLoaded() && this._residency === 'AWAKE';
  }

  protected isPlayerPlaying(): boolean {
    let state = this._playerController.mediaElementPlayback!.state;
    // virtual main media stays in playing state while waiting for synced media, only its clock is stopped
    return state.playing && !(state.waiting || state.buffering || state.ended || state.seeking || state.pausing || state.waitingSyncedMedia);
  }

  /** Whether main media plays backwards, warm-up and awake range follow main media playback direction. */
  protected isReversePlayback(): boolean {
    return this._playerController.playbackRate < 0;
  }

  protected isPlayerSeeking(): boolean {
    return !!this._playerController.mediaElementPlayback?.seeking;
  }

  /** Has to be called by subclass constructor, once subclass is initialized. */
  protected initEventHandlers() {
    let createLoadedFilter = <T>() => {
      return filter<T>(() => this.isLoaded());
    };

    this._playerController.onEvent$
      .pipe(createLoadedFilter())
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        switch (event.type) {
          case PlayerControllerEventType.PLAYER_CONTROLLER_PLAY:
          case PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE:
          case PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE:
            this.syncWithMain(this._playerController.getCurrentTime());
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED:
            this.syncWithMain(this._playerController.getCurrentTime());
            // main media can land inside time window of sidecar that is still waking up
            this.updateBufferingRequired();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS:
            this.syncWithMain(event.data.currentTime);
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_ENDED:
            this.pausePlayback();
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING:
            // seek can bring main media back to sidecar that failed to wake up
            this._wakeFailed = false;
            this.updateResidency(event.data.toTime);
            this.updateShown(event.data.toTime);
            if (this.isAwake()) {
              this.pausePlayback();
              this.seekToTime(this._timeWindow!.toSidecarTime(event.data.toTime, this._config.warmUpDuration, this.isReversePlayback()));
            }
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE:
            this.onPlaybackRateUpdate(event.data.playbackRate);
            // whether main media waits for sidecar can depend on playback rate
            this.updateBufferingRequired();
            break;
        }
      });

    let bufferingBreaker = new ObserverBreaker();
    this._onBufferingRequired$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((bufferingRequired) => {
      if (bufferingRequired) {
        // check periodically if sidecar got enough data to play, main media is paused while waiting
        timer(0, 200)
          .pipe(takeUntil(bufferingBreaker.observer))
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe(() => {
            this.updateBufferingRequired();
          });
      } else {
        bufferingBreaker.break();
      }
    });

    this._playerController.onEvent$
      .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS))
      .pipe(sampleTime(SIDECAR_VIDEO_DEFAULTS.bufferingCheckInterval))
      .pipe(createLoadedFilter())
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.updateBufferingRequired();
      });
  }

  loadSource(): Observable<void> {
    // without source, DOM controller loads from track state or fails
    let url = this._trackState.source ? SourceUtil.resolveUrlFromSourceStateOrFail(this._trackState.source) : void 0;
    this._url = url;

    return new Observable<void>((observer) => {
      this._loadStage.start();
      this._onEvent$.next({
        type: TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOADING,
        data: {},
      });

      let loadError = (error: any) => {
        this._loadStage.failure(error);
        this._onEvent$.next({
          type: TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOAD_ERROR,
          data: {
            error: error,
          },
        });
        errorCompleteObserver(observer, error);
      };

      let loaded = (duration: number, sourceAttached: boolean) => {
        try {
          this._timeWindow = SidecarTimeWindow.resolve(this._trackState, duration);
        } catch (error) {
          if (sourceAttached) {
            this._domController.release();
          }
          loadError(error instanceof Error ? error.message : error);
          return;
        }

        this._duration = duration;
        this._loadStage.success();

        if (sourceAttached) {
          this.onSourceAttached();
          this._residency = 'AWAKE';
          if (!this._config.awakeBudget.tryAcquire(this)) {
            this.releaseSource();
          }
        }

        this._onEvent$.next({
          type: TrackControllerEventType.TRACK_CONTROLLER_TRACK_LOADED,
          data: {},
        });

        // dormant sidecar near main media time is woken up
        this.syncWithMain(this._playerController.getCurrentTime());
        this.updateBufferingRequired();

        nextCompleteObserver(observer);
      };

      let knownDuration = this._trackState.duration;
      if (!isNullOrUndefined(knownDuration) && Number.isFinite(knownDuration) && knownDuration! > 0) {
        loaded(knownDuration!, false);
        return;
      }

      let load$ = this._config.metadataLoad
        ? this._domController.loadDuration(url).pipe(map((duration) => ({duration, sourceAttached: false})))
        : this._domController.loadSource(url, this.resolveLoadStartTime()).pipe(map(() => ({duration: this.resolveAttachedDuration(), sourceAttached: true})));

      let subscription = load$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
        next: ({duration, sourceAttached}) => {
          loaded(duration, sourceAttached);
        },
        error: (error) => {
          loadError(error);
        },
      });

      return () => subscription.unsubscribe();
    });
  }

  /**
   * Sidecar time that will be played first, from main media current time. Same mapping as {@link SidecarTimeWindow.toSidecarTime} with warm-up,
   * clamped to cutEndTime only when set, as duration is not known before load. Synced with main media once loaded.
   * Reverse warm-up needs sidecar duration, so it is not applied when main media plays backwards.
   */
  protected resolveLoadStartTime(): number {
    let mainTime = this._playerController.getCurrentTime();
    let warmUp = this.isReversePlayback() ? 0 : SidecarTimeWindow.resolveWarmUpDuration(this._trackState, this._config.warmUpDuration);
    let startTime = Math.max(mainTime - this._trackState.playerStartTime + this._trackState.cutStartTime, this._trackState.cutStartTime - warmUp);
    return isNullOrUndefined(this._trackState.cutEndTime) ? startTime : Math.min(startTime, this._trackState.cutEndTime!);
  }

  setTrackState(trackState: MediaContainerTrackState) {
    this._trackState = trackState;
    if (this.isLoaded()) {
      this._timeWindow = SidecarTimeWindow.resolve(this._trackState, this._duration);
      this.syncWithMain(this._playerController.getCurrentTime());
      this.updateBufferingRequired();
    }
  }

  setActive(active: boolean) {
    if (this._active === active) {
      return;
    }
    this._active = active;
    this.resetSync();
    if (this.isLoaded()) {
      this.syncWithMain(this._playerController.getCurrentTime());
      this.updateBufferingRequired();
    }
  }

  /**
   * Updates residency, visibility and warm-up from main media time, and syncs awake sidecar playback with main media, see {@link syncPlayback}.
   */
  protected syncWithMain(mainTime: number) {
    if (!this.isLoaded() || !this._timeWindow) {
      return;
    }

    if (this.isPlayerSeeking()) {
      // sidecar is seeked on PLAYER_CONTROLLER_SEEKING and synced again on PLAYER_CONTROLLER_SEEKED
      if (this.isAwake()) {
        this.pausePlayback();
      }
      return;
    }

    this.updateResidency(mainTime);
    this.updateShown(mainTime);
    if (!this.isAwake()) {
      // synced once woken up
      return;
    }

    let reverse = this.isReversePlayback();
    let position = this._timeWindow.resolvePosition(mainTime, this._config.warmUpDuration, reverse);
    let targetTime = this._timeWindow.toSidecarTime(mainTime, this._config.warmUpDuration, reverse);

    // inactive sidecar keeps warming up inside time window
    this.updateWarmingUp(position === SidecarTimeWindowPosition.WARM_UP || (position === SidecarTimeWindowPosition.IN_WINDOW && !this._active));

    this.syncPlayback(position, targetTime);
  }

  /**
   * Wakes dormant sidecar when main media time enters its awake range, and releases awake sidecar once main media time leaves it,
   * extended by {@link SIDECAR_VIDEO_DEFAULTS.releaseHysteresis}.
   *
   * Awake range follows main media playback direction, {@link SidecarTrackControllerConfig.wakeAhead} is ahead of time window
   * in the direction main media moves and {@link SidecarTrackControllerConfig.keepAwakeAfter} is behind it.
   */
  protected updateResidency(mainTime: number) {
    if (!this.isLoaded() || !this._timeWindow) {
      return;
    }
    let reverse = this.isReversePlayback();
    let warmUpIn = this._timeWindow.warmUpIn(this._config.warmUpDuration, reverse);
    let wakeAhead = this._config.wakeAhead * Math.abs(this._playerController.playbackRate);
    let wakeIn: number;
    let wakeOut: number;
    if (reverse) {
      // main media plays backwards, it enters warm-up and time window at its end and leaves it at its start
      wakeIn = this._timeWindow.playerStartTime - this._config.keepAwakeAfter;
      wakeOut = warmUpIn + wakeAhead;
    } else {
      wakeIn = warmUpIn - wakeAhead;
      wakeOut = this._timeWindow.playerEndTime + this._config.keepAwakeAfter;
    }
    if (this._residency === 'DORMANT') {
      if (mainTime >= wakeIn && mainTime < wakeOut && !this._wakeFailed) {
        // waits for free slot otherwise, retried with retryAwake
        if (this._config.awakeBudget.tryAcquire(this)) {
          this.wake(mainTime);
        }
      } else {
        this._config.awakeBudget.withdraw(this);
      }
    } else {
      let hysteresis = SIDECAR_VIDEO_DEFAULTS.releaseHysteresis;
      if (mainTime < wakeIn - hysteresis || mainTime >= wakeOut + hysteresis) {
        this.sleep();
      }
    }
  }

  /**
   * Awake priority is distance in seconds of main media time from sidecar warm-up and time window, active sidecar inside its time window comes first.
   * Warm-up is on the side main media enters time window from, see {@link SidecarTimeWindow.warmUpIn}.
   */
  awakePriority(): number {
    if (!this._timeWindow) {
      return Number.POSITIVE_INFINITY;
    }
    let mainTime = this._playerController.getCurrentTime();
    if (this._active && this._timeWindow.isInWindow(mainTime)) {
      return Number.NEGATIVE_INFINITY;
    }
    let reverse = this.isReversePlayback();
    let warmUpIn = this._timeWindow.warmUpIn(this._config.warmUpDuration, reverse);
    let spanStart = reverse ? this._timeWindow.playerStartTime : warmUpIn;
    let spanEnd = reverse ? warmUpIn : this._timeWindow.playerEndTime;
    if (mainTime < spanStart) {
      return spanStart - mainTime;
    }
    return mainTime < spanEnd ? 0 : mainTime - spanEnd;
  }

  yieldAwake() {
    this.releaseSource(false);
    this.updateShown(this._playerController.getCurrentTime());
    this.updateBufferingRequired();
  }

  retryAwake() {
    if (this.isLoaded() && this._residency === 'DORMANT') {
      this.syncWithMain(this._playerController.getCurrentTime());
      this.updateBufferingRequired();
    }
  }

  /** Attaches source, loading from sidecar time at main media time, and syncs sidecar once loaded. Awake slot has to be acquired before. */
  protected wake(mainTime: number) {
    this._residency = 'WAKING';
    this._wakeBreaker.break();
    this._domController
      .loadSource(this._url, this._timeWindow!.toSidecarTime(mainTime, this._config.warmUpDuration, this.isReversePlayback()))
      .pipe(timeout(SIDECAR_VIDEO_DEFAULTS.wakeTimeout))
      .pipe(takeUntil(this._wakeBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: () => {
          this._residency = 'AWAKE';
          this.onSourceAttached();
          this.syncWithMain(this._playerController.getCurrentTime());
          this.updateBufferingRequired();
        },
        error: (error: unknown) => {
          console.warn(`Sidecar video id=${this._trackState.id} failed to wake up, main media will not wait for it`, error);
          this.releaseSource();
          this._wakeFailed = true;
          this.updateShown(this._playerController.getCurrentTime());
          this.updateBufferingRequired();
        },
      });
  }

  protected sleep() {
    this.releaseSource();
    this._wakeFailed = false;
    this.updateShown(this._playerController.getCurrentTime());
    this.updateBufferingRequired();
  }

  /**
   * @param releaseSlot Whether awake slot is released, slot of yielding sidecar was already taken by budget
   */
  protected releaseSource(releaseSlot = true) {
    if (releaseSlot) {
      this._config.awakeBudget.release(this);
    }
    this._wakeBreaker.break();
    if (this._residency === 'AWAKE') {
      this.pausePlayback();
    }
    this.updateWarmingUp(false);
    this._domController.release();
    this._residency = 'DORMANT';
    this.resetSync();
  }

  /** Whether sidecar is shown at main media time. */
  protected resolveShown(mainTime: number): boolean {
    // dormant sidecar has no frame to show
    return this._active && this.isAwake() && !!this._timeWindow?.isInWindow(mainTime);
  }

  protected updateShown(mainTime: number) {
    let shown = this.resolveShown(mainTime);
    if (this._onShown$.value !== shown) {
      this._onShown$.next(shown);
    }
  }

  protected updateWarmingUp(warmingUp: boolean) {
    if (this._warmingUp === warmingUp) {
      return;
    }
    this._warmingUp = warmingUp;
    this.onWarmingUpChange(warmingUp);
  }

  protected updateBufferingRequired() {
    let bufferingRequired = this.checkIsBuffering();
    if (this._onBufferingRequired$.value !== bufferingRequired) {
      this._onBufferingRequired$.next(bufferingRequired);
    }
  }

  protected checkIsBuffering(): boolean {
    if (!this.isLoaded() || !this._timeWindow) {
      return false;
    }
    // warm-up is best effort, main media waits only for active sidecar inside its time window
    if (!this._active || !this._timeWindow.isInWindow(this._playerController.getCurrentTime())) {
      return false;
    }
    if (!this.isAwake()) {
      // main media waits for sidecar to wake up, unless it failed to
      return !this._wakeFailed;
    }
    return this.isAwakeBuffering();
  }

  /** Duration of source attached on first load, see {@link SidecarDomController.loadSource}. */
  protected abstract resolveAttachedDuration(): number;

  /** Called once source is attached, on first load or once woken up, before sidecar is synced with main media. */
  protected abstract onSourceAttached(): void;

  /**
   * Plays, pauses and seeks awake sidecar according to main media playback state.
   *
   * @param position Main media time position relative to time window, with warm-up
   * @param targetTime Sidecar time at main media time, with warm-up
   */
  protected abstract syncPlayback(position: SidecarTimeWindowPosition, targetTime: number): void;

  /** Pauses sidecar playback, sidecar holds its current frame. */
  protected abstract pausePlayback(): void;

  /** Seeks sidecar to sidecar time. */
  protected abstract seekToTime(time: number): void;

  /** Whether awake active sidecar inside its time window doesn't have enough data to play, main media waits for it while it does not. */
  protected abstract isAwakeBuffering(): boolean;

  /** Called when sidecar starts or stops warming up. */
  protected onWarmingUpChange(_warmingUp: boolean): void {}

  /** Called on main media playback rate update. */
  protected onPlaybackRateUpdate(_playbackRate: number): void {}

  /** Resets sync state, called when sidecar is activated, deactivated or released. */
  protected resetSync(): void {}

  destroy() {
    try {
      this.pausePlayback();
    } catch (e) {
      console.debug(e);
    }

    super.destroy();

    this._config.awakeBudget.withdraw(this);
    this._wakeBreaker.destroy();
    freeObserver(this._onBufferingRequired$);
    freeObserver(this._onShown$);
    this._domController.destroy();
  }
}
