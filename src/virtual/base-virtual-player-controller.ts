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

import {asapScheduler, Observable, observeOn, of, Subject, take, takeUntil, throwError} from 'rxjs';
import {MediaTemporalConverter, MediaTemporalFormat, type MediaTemporalFormatValueMap} from '../common';
import {MediaElementPlayback, type MediaElementPlaybackState} from '../common/media-element-playback';
import {ObserverBreaker} from '../common/observer-breaker';
import {
  type LoadMainMediaArgsType,
  type PlayerController,
  type PlayerControllerEvent,
  PlayerControllerEventType,
  type PlayerDomController,
  type PlayerLiveState,
  type RestoreMainMediaSessionArgsType,
} from '../player/player-controller-api';
import type {AudioTrackIdentifier, PlayerControllerConfig, TextTrackIdentifier} from '../player/player-controller';
import type {AudioState, MainMediaState, MainMediaUpdateableAttrs, MediaRotationValue, TextTrackState, Track, VideoKeyframe, VideoKeyframeOptions} from '../media';
import {errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {SourceUtil} from '../source';
import {CryptoUtil} from '../util/crypto-util';
import {isNullOrUndefined} from '../util/util-functions';
import {StringUtil} from '../util/string-util';
import type {VirtualPlaybackDomController} from './virtual-playback-dom-controller';
import {OmakaseAudioContextProvider} from '../omakase-audio-context-provider';
import {PLAYER_CONTROLLER_DEFAULTS} from '../constants';

export interface VirtualPlayerControllerConfig extends PlayerControllerConfig {
  /**
   * If true, playback progress is emitted once per media frame. If false, it is emitted on every sync tick (~3ms)
   */
  throttlePlaybackProgress: boolean;
}

export const VIRTUAL_PLAYER_CONTROLLER_CONFIG_DEFAULT: VirtualPlayerControllerConfig = {
  throttlePlaybackProgress: true,
};

/**
 * Nudge (seconds) applied when snapping time to frame, small enough to stay within frame at any frame rate
 */
const FRAME_SNAP_EPSILON = 0.000001;

/**
 * Plays virtual main media, media without media element. Playback is driven by virtual clock resolved from wall clock,
 * advanced by audio worklet sync tick which keeps ticking while browser tab is in background.
 *
 * Subclasses implement {@link loadMainMedia}, resolving virtual main media essentials (ie. duration, frame rate).
 */
export abstract class BaseVirtualPlayerController<C extends VirtualPlayerControllerConfig> implements PlayerController {
  protected readonly _onEvent$: Subject<PlayerControllerEvent> = new Subject<PlayerControllerEvent>();

  protected readonly _playerControllerId: string;

  protected _config: C;

  protected _playerDomController: PlayerDomController;
  protected _mainMediaState?: MainMediaState | undefined;
  protected _mediaTemporalConverter?: MediaTemporalConverter | undefined;
  protected _mediaElementPlayback?: MediaElementPlayback | undefined;

  /**
   * Virtual clock: media time at the moment of last anchoring
   * @protected
   */
  protected _anchorTime = 0;
  /**
   * Virtual clock: wall time (ms) at the moment of last anchoring
   * @protected
   */
  protected _anchorWall = 0;
  protected _clockRunning = false;
  protected _playbackRate: number = PLAYER_CONTROLLER_DEFAULTS.playbackRate;

  /**
   * Frame of last emitted {@link PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS}, progress is emitted once per media frame.
   * Reset on every clock anchoring, so first frame after play or rate change is always emitted. Seek emits progress itself
   * @protected
   */
  protected _lastProgressFrame: number | undefined;

  /**
   * Stores last playback state before {@link MediaElementPlayback.waitingSyncedMedia} changes to true
   * @protected
   */
  protected _waitingSyncedMediaLastPlaybackState: MediaElementPlaybackState | undefined = void 0;

  /**
   * Incremented on every seek, pending seek completes only if not superseded
   * @protected
   */
  protected _seekId = 0;

  protected _loadBreaker = new ObserverBreaker();
  protected _mediaEventBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  /**
   * Virtual playback dom controller owned by controller (ie. mounted over chroming), destroyed together with controller
   * @protected
   */
  protected _ownedDomController: VirtualPlaybackDomController | undefined;

  protected constructor(playerDomController: PlayerDomController, config: C) {
    this._playerDomController = playerDomController;
    this._config = config;
    this._playerControllerId = CryptoUtil.uuid();
  }

  abstract loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean>;

  get onEvent$(): Observable<PlayerControllerEvent> {
    return this._onEvent$.asObservable();
  }

  protected checkMainMediaEssentials() {
    if (!this._mainMediaState) {
      throw new Error(`Main media is not binded`);
    }

    if (isNullOrUndefined(this._mainMediaState.duration)) {
      throw new Error(`Main media duration not provided`);
    }
  }

  resolveLiveState(): PlayerLiveState | undefined {
    return void 0;
  }

  wireEvents(mainMediaState: MainMediaState): void {
    this.unwireEvents();

    this._mainMediaState = mainMediaState;
    this._mediaTemporalConverter = MediaTemporalConverter.create({
      duration: mainMediaState.duration,
      frameRateModel: mainMediaState.frameRateModel,
      ffomTimecodeModel: mainMediaState.ffomTimecodeModel,
      initSegmentTimeOffset: mainMediaState.initSegmentTimeOffset,
      hasVideo: mainMediaState.hasVideo,
      hasAudio: mainMediaState.hasAudio,
    });

    this.checkMainMediaEssentials();

    if (StringUtil.isNonEmpty(this._mainMediaState.loadOptions?.poster)) {
      this._playerDomController.setVideoPoster(this._mainMediaState.loadOptions!.poster!);
    }

    this._mediaElementPlayback = new MediaElementPlayback();
    this._lastProgressFrame = void 0;

    this._mediaElementPlayback.onChange$.pipe(takeUntil(this._mediaEventBreaker.observer)).subscribe(() => {
      this._onEvent$.next({
        type: PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE,
        data: {
          mediaElementPlaybackState: this._mediaElementPlayback!.state,
          currentTime: this.getCurrentTime(),
        },
      });
    });

    // audio worklet sync tick keeps ticking while browser tab is in background, unlike requestAnimationFrame
    OmakaseAudioContextProvider.instance.onSyncTick$.pipe(takeUntil(this._mediaEventBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe(() => this.tick());

    this._ownedDomController?.refreshMediaState();
  }

  unwireEvents(): void {
    this._mediaEventBreaker.break();

    this._mediaElementPlayback?.destroy();
    this._mediaElementPlayback = void 0;
    this._mainMediaState = void 0;
    this._mediaTemporalConverter = void 0;
  }

  /**
   * Called on every sync tick (audio worklet render quantum, ~3ms). Detects end of media on every tick,
   * playback progress is throttled to once per media frame, unless {@link VirtualPlayerControllerConfig.throttlePlaybackProgress} is disabled.
   * @protected
   */
  protected tick() {
    if (!this._clockRunning || this._mediaElementPlayback!.seeking) {
      return;
    }

    let duration = this._mainMediaState!.duration!;
    let time = this.resolveClockTime();

    if (this._playbackRate > 0 && time >= duration) {
      this.stopClock(duration);
      this._mediaElementPlayback!.setEnded();
      this._onEvent$.next({
        type: PlayerControllerEventType.PLAYER_CONTROLLER_ENDED,
        data: {currentTime: this.getCurrentTime()},
      });
      return;
    }

    // reverse playback pauses at start, like media element
    if (this._playbackRate < 0 && time <= 0) {
      this.stopClock(0);
      this._mediaElementPlayback!.setPaused();
      this._onEvent$.next({
        type: PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE,
        data: {currentTime: this.getCurrentTime()},
      });
      return;
    }

    if (this._config.throttlePlaybackProgress) {
      let frame = this._mediaTemporalConverter!.convert(time, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
      if (frame === this._lastProgressFrame) {
        return;
      }
    }

    this.emitPlaybackProgress(time);
  }

  protected emitPlaybackProgress(currentTime: number = this.getCurrentTime()) {
    // recorded for every emit, so tick doesn't repeat frame already reported by seek
    this._lastProgressFrame = this._mediaTemporalConverter!.convert(currentTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
    this._onEvent$.next({
      type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS,
      data: {currentTime: currentTime},
    });
  }

  // region virtual clock

  protected resolveClockTime(): number {
    let duration = this._mainMediaState?.duration ?? Number.POSITIVE_INFINITY;
    if (!this._clockRunning || this._mediaElementPlayback?.seeking) {
      return this._anchorTime;
    }
    let elapsed = ((performance.now() - this._anchorWall) / 1000) * this._playbackRate;
    return Math.min(Math.max(this._anchorTime + elapsed, 0), duration);
  }

  protected anchorClock(time: number) {
    this._anchorTime = time;
    this._anchorWall = performance.now();
    this._lastProgressFrame = void 0;
  }

  protected startClock() {
    this.anchorClock(this._anchorTime);
    this._clockRunning = true;
  }

  protected stopClock(time: number = this.resolveClockTime()) {
    this.anchorClock(time);
    this._clockRunning = false;
  }

  /**
   * Snaps time to start of its frame. Frame start time converted from frame count can fall just below frame boundary due to floating point,
   * and would be resolved as previous frame, so time is nudged by {@link FRAME_SNAP_EPSILON} before and after snapping.
   * @protected
   */
  protected snapToFrame(time: number): number {
    let converter = this._mediaTemporalConverter!;
    let frame = converter.convert(time + FRAME_SNAP_EPSILON, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
    let frameTime = converter.convert(frame, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
    if (converter.convert(frameTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT) < frame) {
      frameTime = frameTime + FRAME_SNAP_EPSILON;
    }
    return Math.min(frameTime, this._mainMediaState?.duration ?? Number.POSITIVE_INFINITY);
  }

  // endregion

  restoreMainMediaSession(args: RestoreMainMediaSessionArgsType): Observable<void> {
    return new Observable<void>((observer) => {
      this.loadMainMedia({
        providedMainMedia: args.mainMedia,
        url: SourceUtil.resolveUrlFromSourceState(args.mainMedia.source),
        loadOptions: args.mainMedia.loadOptions,
        mainMediaEssentialArgsHook: (args: MainMediaUpdateableAttrs) => new Observable((o) => nextCompleteObserver(o)),
        tracksCreatedHook: (tracks: Track[]) => new Observable((o) => nextCompleteObserver(o)),
        mainMediaSessionController: args.mainMediaSessionController,
      }).subscribe({
        next: () => {
          args.mainMediaLoadedHook().subscribe({
            next: () => nextCompleteObserver(observer),
            error: (error) => errorCompleteObserver(observer, error),
          });
        },
        error: (error) => errorCompleteObserver(observer, error),
      });
    });
  }

  play(): Observable<void> {
    this._waitingSyncedMediaLastPlaybackState = void 0;
    return this._play();
  }

  protected _play(): Observable<void> {
    return passiveObservable((observer) => {
      this.checkMainMediaEssentials();
      if (this._clockRunning) {
        nextCompleteObserver(observer);
        return;
      }

      let mediaElementPlayback = this._mediaElementPlayback!;

      // sync ticks flow only while AudioContext is running
      OmakaseAudioContextProvider.instance
        .tryResumeAudioContext()
        .pipe(takeUntil(this._mediaEventBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
            // unwired or already started while resuming
            if (mediaElementPlayback !== this._mediaElementPlayback || this._clockRunning) {
              nextCompleteObserver(observer);
              return;
            }
            if (this._playbackRate < 0) {
              if (this._anchorTime <= 0) {
                this.anchorClock(this._mainMediaState!.duration!);
              }
            } else if (mediaElementPlayback.ended || this._anchorTime >= this._mainMediaState!.duration!) {
              this.anchorClock(0);
            }
            this.startClock();
            mediaElementPlayback.setPlaying();
            this._onEvent$.next({
              type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAY,
              data: {currentTime: this.getCurrentTime()},
            });
            nextCompleteObserver(observer);
          },
          error: (error) => errorCompleteObserver(observer, error),
        });
    });
  }

  pause(): Observable<void> {
    this._waitingSyncedMediaLastPlaybackState = void 0;
    return this._pause();
  }

  protected _pause(): Observable<void> {
    return passiveObservable((observer) => {
      this.checkMainMediaEssentials();
      // clock is stopped while waiting for synced media, playback is still playing
      if (this._clockRunning || this._mediaElementPlayback!.playing) {
        if (this._clockRunning) {
          this.stopClock(this.snapToFrame(this.resolveClockTime()));
        }
        this._mediaElementPlayback!.setPaused();
        // like PlayerController, report final (frame-snapped) paused time before pause
        this.emitPlaybackProgress();
        this._onEvent$.next({
          type: PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE,
          data: {currentTime: this.getCurrentTime()},
        });
      }
      nextCompleteObserver(observer);
    });
  }

  getCurrentTime(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getCurrentTime<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getCurrentTime(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    this.checkMainMediaEssentials();
    let time = this.resolveClockTime();
    if (format === MediaTemporalFormat.SECONDS) {
      return time;
    }
    return this._mediaTemporalConverter!.convert(time, MediaTemporalFormat.SECONDS, format);
  }

  getDuration(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getDuration<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getDuration(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    this.checkMainMediaEssentials();
    return this._mediaTemporalConverter!.convert(this._mainMediaState!.duration!, MediaTemporalFormat.SECONDS, format);
  }

  convertTime<S extends MediaTemporalFormat, D extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[S], valueFormat: S, destinationFormat: D): MediaTemporalFormatValueMap[D];
  convertTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], valueFormat: MediaTemporalFormat, destinationFormat: MediaTemporalFormat): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    this.checkMainMediaEssentials();
    return this._mediaTemporalConverter!.convert(value, valueFormat, destinationFormat);
  }

  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    this.checkMainMediaEssentials();
    switch (format) {
      case MediaTemporalFormat.SECONDS:
        return this.seekToTime(value as number);
      case MediaTemporalFormat.FRAME_COUNT:
      case MediaTemporalFormat.PERCENT:
      case MediaTemporalFormat.TIMECODE:
      case MediaTemporalFormat.MEDIA_TIME:
      case MediaTemporalFormat.COUNTDOWN_MEDIA_TIME:
        return this.seekToTime(this._mediaTemporalConverter!.convert(value, format, MediaTemporalFormat.SECONDS));
      default:
        throw new Error(`Unknown format: MediaTemporalFormat.${format}`);
    }
  }

  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    this.checkMainMediaEssentials();
    switch (format) {
      case MediaTemporalFormat.SECONDS:
        return this.seekToTime(this.getCurrentTime() + (value as number));
      case MediaTemporalFormat.FRAME_COUNT:
        return this.seekFromCurrentFrame(value as number);
      case MediaTemporalFormat.TIMECODE:
        return this.seekFromCurrentFrame(this._mediaTemporalConverter!.convert(value as string, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.FRAME_COUNT));
      case MediaTemporalFormat.MEDIA_TIME:
        return this.seekToTime(this.getCurrentTime() + this._mediaTemporalConverter!.convert(value as string, MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.SECONDS));
      case MediaTemporalFormat.PERCENT:
      case MediaTemporalFormat.COUNTDOWN_MEDIA_TIME:
        throw new Error(`Cannot resolve seeking value from MediaTemporalFormat.${format} format`);
      default:
        throw new Error(`Unknown format: MediaTemporalFormat.${format}`);
    }
  }

  protected seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    let currentFrame = this.getCurrentTime(MediaTemporalFormat.FRAME_COUNT);
    return this.seekToTime(this._mediaTemporalConverter!.convert(currentFrame + framesCount, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS));
  }

  protected seekToTime(time: number): Observable<boolean> {
    return passiveObservable<boolean>((observer) => {
      let duration = this._mainMediaState!.duration!;
      let fromTime = this.getCurrentTime();
      let toTime = Math.min(Math.max(time, 0), duration);

      let mediaElementPlayback = this._mediaElementPlayback!;
      let seekId = ++this._seekId;

      // clock holds at seek target until seeked
      this.anchorClock(toTime);
      mediaElementPlayback.seeking = true;
      this._onEvent$.next({
        type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING,
        data: {fromTime, toTime},
      });

      // complete at least on next microtask, to behave like media element seeking
      this.awaitSeekReady(toTime)
        .pipe(take(1), observeOn(asapScheduler))
        .subscribe(() => {
          if (seekId !== this._seekId || mediaElementPlayback !== this._mediaElementPlayback) {
            // superseded by newer seek or unwired
            nextCompleteObserver(observer, false);
            return;
          }
          let wasEnded = mediaElementPlayback.ended;
          this.anchorClock(this._clockRunning ? toTime : this.snapToFrame(toTime));
          mediaElementPlayback.seeking = false;
          if (wasEnded && toTime < duration) {
            mediaElementPlayback.setPaused();
          }
          this._onEvent$.next({
            type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED,
            data: {currentTime: this.getCurrentTime(), previousTime: fromTime},
          });
          // like PlayerController, progress after every seek, so paused seeks and frame stepping are reported too
          this.emitPlaybackProgress();
          nextCompleteObserver(observer, true);
        });
    });
  }

  /**
   * Seek completes when returned observable emits, but never sooner than next microtask. Emits immediately by default.
   * @protected
   */
  protected awaitSeekReady(toTime: number): Observable<void> {
    return of(void 0);
  }

  seekToLive(): Observable<boolean> {
    return of(false);
  }

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe> {
    return throwError(() => new Error(`Keyframe extraction not supported for virtual main media`));
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  /** Virtual main media plays at every playback rate, its time always runs on its own clock. */
  get seekStepPlayback(): boolean {
    return false;
  }

  /** Virtual main media plays backwards on its own clock, its supported playback rates don't depend on trick track, see {@link isPlaybackRateSupported}. */
  setSeekStepPlaybackEnabled(_enabled: boolean): void {}

  /**
   * Only positive playback rates are supported by default. Subclasses may allow negative (reverse) playback.
   * @protected
   */
  protected isPlaybackRateSupported(playbackRate: number): boolean {
    return playbackRate > 0;
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return passiveObservable((observer) => {
      if (!this.isPlaybackRateSupported(playbackRate)) {
        errorCompleteObserver(observer, new Error(`Playback rate ${playbackRate} not supported`));
        return;
      }
      if (this._clockRunning) {
        this.anchorClock(this.resolveClockTime());
      }
      this._playbackRate = playbackRate;
      this._onEvent$.next({
        type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE,
        data: {playbackRate},
      });
      nextCompleteObserver(observer);
    });
  }

  get mediaRotation(): MediaRotationValue {
    return 0;
  }

  // region audio

  get createMediaElementSourceEnabled(): boolean {
    return false;
  }

  resolveAudioTrackIdentifier(track: AudioState): AudioTrackIdentifier {
    return track.id;
  }

  resolveActiveAudioTracks(tracks: AudioState[]): AudioState[] {
    return [];
  }

  isAudioTrackActive(track: AudioState): boolean {
    return false;
  }

  switchAudioTrack(track: AudioState, activate: boolean): Observable<void> {
    console.debug(`Switch virtual main media audio track: ${this.resolveAudioTrackIdentifier(track)} => ${activate} not supported`);
    return passiveObservable((observer) => nextCompleteObserver(observer));
  }

  setWaitingForSyncedMedia(syncedMediaWaiting: boolean): void {
    if (syncedMediaWaiting && !this._mediaElementPlayback!.waitingSyncedMedia) {
      this._mediaElementPlayback!.waitingSyncedMedia = true;
      this._waitingSyncedMediaLastPlaybackState = this._mediaElementPlayback!.state;
      if (this._clockRunning) {
        this.stopClock();
      }
      console.debug(`Received waiting request for synced media`);
    } else if (!syncedMediaWaiting && this._mediaElementPlayback!.waitingSyncedMedia) {
      this._mediaElementPlayback!.waitingSyncedMedia = false;
      console.debug(`Cleared waiting request for synced media`);
      if (this._waitingSyncedMediaLastPlaybackState?.playing) {
        this._waitingSyncedMediaLastPlaybackState = void 0;
        this.startClock();
      }
    }
  }

  // endregion

  // region text tracks

  get textTracksDisplayed(): boolean {
    return false;
  }

  setTextTracksDisplayed(textTracksDisplayed: boolean): void {}

  resolveTextTrackIdentifier(track: TextTrackState): TextTrackIdentifier {
    return void 0;
  }

  resolveActiveTextTracks(tracks: TextTrackState[]): TextTrackState[] {
    return [];
  }

  isTextTrackActive(track: TextTrackState): boolean {
    return false;
  }

  switchTextTrack(track: TextTrackState, activate: boolean): Observable<void> {
    console.debug(`Switch virtual main media text track: ${this.resolveTextTrackIdentifier(track)} => ${activate} not supported`);
    return passiveObservable((observer) => nextCompleteObserver(observer));
  }

  // endregion

  get mediaElementPlayback(): MediaElementPlayback | undefined {
    return this._mediaElementPlayback;
  }

  get mediaTemporalConverter(): MediaTemporalConverter | undefined {
    return this._mediaTemporalConverter;
  }

  get videoElement(): HTMLVideoElement | undefined {
    return void 0;
  }

  get textMediaCaptionsElement(): HTMLElement {
    return this._playerDomController.textMediaCaptionsElement;
  }

  get textImscElement(): HTMLElement {
    return this._playerDomController.textImscElement;
  }

  get sidecarVideosElement(): HTMLElement {
    return this._playerDomController.sidecarVideosElement;
  }

  destroy(): void {
    this.unwireEvents();
    this._clockRunning = false;
    this._loadBreaker.destroy();
    this._mediaEventBreaker.destroy();
    this._destroyBreaker.destroy();
    freeObserver(this._onEvent$);
    this._ownedDomController?.destroy();
    this._ownedDomController = void 0;
  }
}
