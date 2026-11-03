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

import {filter, merge, Observable, Subject, takeUntil} from 'rxjs';
import type {AudioState, MainMediaState, MediaRotationValue, TextTrackState, VideoKeyframe, VideoKeyframeOptions} from '../media';
import type {MediaElementPlayback} from '../common/media-element-playback';
import {MediaTemporalConverter, MediaTemporalFormat, type MediaTemporalFormatValueMap} from '../common';
import {ObserverBreaker} from '../common/observer-breaker';
import {errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {PLAYER_CONTROLLER_DEFAULTS, SEEK_STEP_PLAYBACK_DEFAULTS} from '../constants';
import {isMediaElementBuffered, type SeekStepConfigOptions, SeekStepper, SeekStepPlaybackUtil} from '../common/seek-step-playback';
import type {ClockPlayerController} from '../virtual/clock-player-controller';
import {
  type LoadMainMediaArgsType,
  type PlayerController,
  type PlayerControllerEvent,
  PlayerControllerEventType,
  type PlayerLiveState,
  type RestoreMainMediaSessionArgsType,
} from './player-controller-api';
import type {AudioTrackIdentifier, TextTrackIdentifier} from './player-controller';
import type {CompositePlaybackDomController} from './composite-playback-dom-controller';

export interface CompositePlayerControllerConfig extends SeekStepConfigOptions {}

/**
 * Plays main media with media element controller (forward), such as HLS or MP4, and with headless virtual clock controller (reverse)
 * at playback rates media element can't play at - backwards, or faster than {@link SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate}.
 *
 * One of them is active at a time. Both are wired once, at construction - composite emits events of active controller only,
 * so that switching between them doesn't rewire anything, and consumers subscribed to composite keep their subscriptions.
 * Inner controller events emitted while switching are dropped, composite emits playback rate update and playback state change instead.
 *
 * Forward controller loads main media and owns media element, audio and text tracks. Reverse controller only runs main media time,
 * while it is active forward controller's paused media element is seeked in steps ahead of main media time, see {@link SeekStepper},
 * so that media where playback resumes starts buffering, and its picture roughly follows main media time. Trick track, when loaded, is shown over it.
 * Once paused, seeked or ended, media element is seeked frame accurately to main media time, so that paused main media shows it,
 * trick track is hidden while paused. Seek steps wait for such seek to finish.
 * Once playback rate is supported by media element again, forward controller continues from main media time.
 *
 * Live main media is played by forward controller only.
 *
 * media-chrome follows composite through {@link CompositePlaybackDomController}, attached once, see {@link attachPlaybackDomController}.
 */
export class CompositePlayerController implements PlayerController {
  protected readonly _onEvent$: Subject<PlayerControllerEvent> = new Subject<PlayerControllerEvent>();

  protected readonly _forward: PlayerController;
  protected readonly _reverse: ClockPlayerController;
  protected _active: PlayerController;
  /** Inner controller events are not emitted while switching */
  protected _switching = false;

  /** Whether main media waits for synced media, applied to active controller and carried over on switch, see {@link setWaitingForSyncedMedia} */
  protected _syncedMediaWaiting = false;
  /** Whether main media was playing once it started waiting for synced media, active controller can be paused while waiting */
  protected _syncedMediaWaitingPlaying = false;

  /** Seeks forward controller's paused media element in steps while reverse controller is active */
  protected readonly _seekStepper: SeekStepper;
  /** Whether playback rates media element can't play at are enabled, only while trick track is loaded, see {@link setSeekStepPlaybackEnabled} */
  protected _seekStepPlaybackEnabled = false;
  /** Whether forward controller seeks its media element frame accurately to reverse controller's main media time, see {@link seekForwardExactly} */
  protected _forwardSeeking = false;
  /** Id of latest frame accurate forward seek, only latest one completes it */
  protected _forwardSeekId = 0;
  protected _mainMediaState: MainMediaState | undefined;

  /** Media slot element media-chrome observes as media, owned by composite */
  protected _playbackDomController: CompositePlaybackDomController | undefined;

  protected readonly _destroyBreaker = new ObserverBreaker();

  constructor(forward: PlayerController, reverse: ClockPlayerController, config?: CompositePlayerControllerConfig) {
    this._forward = forward;
    this._reverse = reverse;
    this._active = forward;
    this._seekStepper = new SeekStepper(config);

    merge(forward.onEvent$.pipe(filter(() => this._active === forward && !this._switching)), reverse.onEvent$.pipe(filter(() => this._active === reverse && !this._switching)))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => this._onEvent$.next(event));

    reverse.onEvent$
      .pipe(filter(() => this._active === reverse && !this._switching))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        switch (event.type) {
          case PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS:
            this.seekStepForward(event.data.currentTime);
            break;
          case PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE:
          case PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED:
          case PlayerControllerEventType.PLAYER_CONTROLLER_ENDED:
            // paused media element shows frame at main media time
            this.seekForwardExactly(reverse.getCurrentTime());
            break;
        }
      });
  }

  get onEvent$(): Observable<PlayerControllerEvent> {
    return this._onEvent$.asObservable();
  }

  get forward(): PlayerController {
    return this._forward;
  }

  get reverse(): ClockPlayerController {
    return this._reverse;
  }

  /**
   * Attaches media slot element media-chrome observes as media, it follows composite at every playback rate. Destroyed together with composite.
   */
  attachPlaybackDomController(playbackDomController: CompositePlaybackDomController) {
    this._playbackDomController = playbackDomController;
    playbackDomController.setVideoTimeOffset(() => this._mainMediaState?.initSegmentTimeOffset ?? 0);
    playbackDomController.attachController(this);
  }

  /** Controller main media time, playback and events come from. */
  get active(): PlayerController {
    return this._active;
  }

  // region playback rate

  get playbackRate(): number {
    return this._active.playbackRate;
  }

  /** Whether reverse controller is active, forward controller's media element is paused and seeked in steps. */
  get seekStepPlayback(): boolean {
    return this._active === this._reverse;
  }

  /**
   * Playback rates media element can't play at are enabled only while trick track is loaded. Once disabled during such playback rate,
   * forward controller continues at default playback rate.
   */
  setSeekStepPlaybackEnabled(enabled: boolean) {
    if (this._seekStepPlaybackEnabled === enabled) {
      return;
    }
    this._seekStepPlaybackEnabled = enabled;
    if (!enabled && this._active === this._reverse) {
      this.switchToForward(PLAYER_CONTROLLER_DEFAULTS.playbackRate);
    }
  }

  /**
   * Playback rates media element can't play at are played by reverse controller, others by forward controller. Live main media and
   * invalid playback rates are left to forward controller.
   * Playback rates media element can't play at are rejected while they are disabled, see {@link setSeekStepPlaybackEnabled}.
   */
  setPlaybackRate(playbackRate: number): Observable<void> {
    let newPlaybackRate = Number(playbackRate);
    if (!Number.isFinite(newPlaybackRate) || Math.abs(newPlaybackRate) < SEEK_STEP_PLAYBACK_DEFAULTS.minNativePlaybackRate) {
      newPlaybackRate = PLAYER_CONTROLLER_DEFAULTS.playbackRate;
    }
    let reverse = SeekStepPlaybackUtil.isSeekStepPlaybackRate(newPlaybackRate) && !!this._mainMediaState && !this._forward.resolveLiveState();

    if (reverse && !this._seekStepPlaybackEnabled) {
      return passiveObservable((observer) => {
        errorCompleteObserver(observer, new Error(`Playback rate ${newPlaybackRate} not supported, playing backwards or faster than ${SEEK_STEP_PLAYBACK_DEFAULTS.maxNativePlaybackRate} requires trick track`));
      });
    }

    if (reverse) {
      if (this._active === this._reverse) {
        this._seekStepper.reset();
        return this._reverse.setPlaybackRate(newPlaybackRate);
      }
      return passiveObservable((observer) => {
        this.switchToReverse(newPlaybackRate);
        nextCompleteObserver(observer);
      });
    }
    if (this._active === this._reverse) {
      return passiveObservable((observer) => {
        this.switchToForward(newPlaybackRate);
        nextCompleteObserver(observer);
      });
    }
    return this._forward.setPlaybackRate(newPlaybackRate);
  }

  /**
   * Reverse controller continues from forward controller's main media time and playing state, forward controller's media element is paused.
   * Waiting for synced media is moved from forward to reverse controller.
   */
  protected switchToReverse(playbackRate: number) {
    let time = this._forward.getCurrentTime();
    // forward controller pauses media element while waiting for synced media
    let playing = this.isForwardPlaying() || (this._syncedMediaWaiting && this._syncedMediaWaitingPlaying);

    this._switching = true;
    try {
      this._active = this._reverse;
      // pause drops playback state forward controller would resume once waiting is cleared
      this._forward.pause().subscribe();
      this._forward.setWaitingForSyncedMedia(false);
      this._reverse.syncClock(time, playbackRate, playing);
      if (this._syncedMediaWaiting) {
        // clock stops until waiting is cleared, then it continues
        this._reverse.setWaitingForSyncedMedia(true);
      }
    } finally {
      this._switching = false;
    }

    this.emitPlaybackRateUpdate(playbackRate);
    this.emitPlaybackChange();

    this._seekStepper.reset();
    if (playing) {
      // first seek step leads main media time right away
      this.seekStepForward(time);
    } else {
      this._seekStepper.markSeek(time, this.toVideoTime(time));
    }
  }

  /**
   * Forward controller continues from reverse controller's main media time and playing state. Its seek events are emitted, so that
   * synced media follows main media again. Waiting for synced media is moved from reverse to forward controller.
   */
  protected switchToForward(playbackRate: number) {
    let time = this._reverse.getCurrentTime();
    // reverse controller stays in playing state while waiting for synced media
    let playing = !!this._reverse.mediaElementPlayback?.state.playing;
    // forward controller's seek below supersedes frame accurate seek in progress
    this.resetForwardSeek();

    this._switching = true;
    try {
      // pause drops playback state reverse controller would resume once waiting is cleared
      this._reverse.pause().subscribe();
      this._reverse.setWaitingForSyncedMedia(false);
      this._reverse.syncClock(time, this._reverse.playbackRate, false);
      this._active = this._forward;
      this._forward.setPlaybackRate(playbackRate).subscribe();
    } finally {
      this._switching = false;
    }

    this.emitPlaybackRateUpdate(playbackRate);
    this.emitPlaybackChange();

    this.seekForwardTo(time, !playing).subscribe({
      next: () => {
        if (playing) {
          // play drops playback state forward controller resumes once waiting is cleared, waiting is applied once playing
          this._forward.play().subscribe(() => this.applySyncedMediaWaitingToForward());
        } else {
          this.applySyncedMediaWaitingToForward();
        }
      },
    });
  }

  /** Forward controller waits for synced media, unless waiting was cleared or reverse controller became active meanwhile. */
  protected applySyncedMediaWaitingToForward() {
    if (this._active === this._forward && this._syncedMediaWaiting) {
      this._forward.setWaitingForSyncedMedia(true);
    }
  }

  protected isForwardPlaying(): boolean {
    let videoElement = this._forward.videoElement;
    // video element is unpaused while playing, also while stalled waiting for data
    return videoElement ? !videoElement.paused : !!this._forward.mediaElementPlayback?.state.playing;
  }

  protected resetForwardSeek() {
    this._forwardSeekId++;
    this._forwardSeeking = false;
  }

  protected emitPlaybackRateUpdate(playbackRate: number) {
    this._onEvent$.next({
      type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE,
      data: {playbackRate},
    });
  }

  protected emitPlaybackChange() {
    let mediaElementPlayback = this._active.mediaElementPlayback;
    if (!mediaElementPlayback || !this._mainMediaState) {
      return;
    }
    this._onEvent$.next({
      type: PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE,
      data: {
        mediaElementPlaybackState: mediaElementPlayback.state,
        currentTime: this.getCurrentTime(),
      },
    });
  }

  // endregion

  // region seek steps

  protected toVideoTime(time: number): number {
    return time + (this._mainMediaState?.initSegmentTimeOffset ?? 0);
  }

  /**
   * Seeks forward controller's paused media element ahead of main media time when seek step is due, see {@link SeekStepper}.
   * Fire-and-forget, nothing waits for it.
   */
  protected seekStepForward(time: number) {
    let videoElement = this._forward.videoElement;
    if (!videoElement || !this._mainMediaState || this._forwardSeeking) {
      // seek steps continue once frame accurate seek finishes, so that they don't fight its frame sync
      return;
    }
    let duration = this._forward.getDuration();
    let seekTime = this._seekStepper.resolveSeekTime(time, {
      playbackRate: this._reverse.playbackRate,
      seeking: videoElement.seeking,
      mapTime: (leadTime) => this.toVideoTime(Math.min(Math.max(leadTime, 0), duration)),
      isBuffered: (seekTime) => isMediaElementBuffered(videoElement, seekTime),
    });
    if (seekTime !== void 0) {
      videoElement.currentTime = seekTime;
    }
  }

  /**
   * Seeks forward controller's paused media element to main media time, next seek step is due one seek step from it.
   *
   * While main media is paused or ended, media element is seeked frame accurately by forward controller, its seek events are not emitted.
   * Main media doesn't wait for it, paused main media shows media element as it is seeked.
   * While main media plays, media element is only seeked, seek steps follow.
   */
  protected seekForwardExactly(time: number) {
    let videoElement = this._forward.videoElement;
    if (!videoElement || !this._mainMediaState) {
      return;
    }
    let videoTime = this.toVideoTime(time);
    this._seekStepper.markSeek(time, videoTime);

    if (this.isReversePlaying()) {
      if (!this._forwardSeeking) {
        videoElement.currentTime = videoTime;
      }
      return;
    }

    let seekId = ++this._forwardSeekId;
    this._forwardSeeking = true;
    let onSeeked = () => {
      // superseded by newer seek otherwise
      if (seekId === this._forwardSeekId) {
        this._forwardSeeking = false;
      }
    };
    this.seekForwardTo(time, true).subscribe({
      next: onSeeked,
      error: (error) => {
        console.debug(`Seeking media element to main media time failed`, error);
        onSeeked();
      },
    });
  }

  /**
   * Seeks forward controller to main media time. Paused media element is seeked to frame at main media time, not to main media time itself -
   * reverse controller's time is snapped to frame start, while frame's presentation timestamp in media can be slightly later, ie. rounded to
   * 90kHz in MPEG-TS, so media element seeked to frame start can show previous frame. Seek to frame lands inside frame and syncs to it.
   */
  protected seekForwardTo(time: number, paused: boolean): Observable<boolean> {
    if (!paused || !this._mainMediaState?.frameRateModel) {
      return this._forward.seekTo(time);
    }
    let frame = this._forward.convertTime(time, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
    return this._forward.seekTo(frame, MediaTemporalFormat.FRAME_COUNT);
  }

  protected isReversePlaying(): boolean {
    return !!this._reverse.mediaElementPlayback?.state.playing;
  }

  // endregion

  // region main media

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    return this._forward.loadMainMedia(args);
  }

  restoreMainMediaSession(args: RestoreMainMediaSessionArgsType): Observable<void> {
    return this._forward.restoreMainMediaSession(args);
  }

  resolveLiveState(): PlayerLiveState | undefined {
    return this._forward.resolveLiveState();
  }

  wireEvents(mainMediaState: MainMediaState): void {
    this._mainMediaState = mainMediaState;
    this._forward.wireEvents(mainMediaState);
    this._reverse.wireEvents(mainMediaState);
    // ie. duration is resolved on wiring
    this._playbackDomController?.refreshMediaState();
  }

  /** Forward controller is active again once unwired, main media plays forward after it is wired again. */
  unwireEvents(): void {
    this._syncedMediaWaiting = false;
    this._syncedMediaWaitingPlaying = false;
    this._switching = true;
    try {
      this._active = this._forward;
      this._forward.unwireEvents();
      this._reverse.unwireEvents();
    } finally {
      this._switching = false;
    }
    this._mainMediaState = void 0;
    this._seekStepper.reset();
    this.resetForwardSeek();
  }

  // endregion

  // region playback

  play(): Observable<void> {
    this._syncedMediaWaitingPlaying = this._syncedMediaWaiting;
    return this._active.play();
  }

  pause(): Observable<void> {
    this._syncedMediaWaitingPlaying = false;
    return this._active.pause();
  }

  getCurrentTime(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getCurrentTime<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getCurrentTime(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    let time = this._active.getCurrentTime();
    if (format === MediaTemporalFormat.SECONDS) {
      return time;
    }
    // forward controller converts with main media time offset
    return this._forward.convertTime(time, MediaTemporalFormat.SECONDS, format);
  }

  getDuration(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getDuration<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getDuration(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    return this._forward.getDuration(format);
  }

  convertTime<S extends MediaTemporalFormat, D extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[S], valueFormat: S, destinationFormat: D): MediaTemporalFormatValueMap[D];
  convertTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], valueFormat: MediaTemporalFormat, destinationFormat: MediaTemporalFormat): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    return this._forward.convertTime(value, valueFormat, destinationFormat);
  }

  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    if (this._active === this._reverse && format !== MediaTemporalFormat.SECONDS) {
      // reverse controller has no main media time offset, value is converted by forward controller
      return this._reverse.seekTo(this._forward.convertTime(value, format, MediaTemporalFormat.SECONDS));
    }
    return this._active.seekTo(value, format);
  }

  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    return this._active.seekFromCurrentTime(value, format);
  }

  seekToLive(): Observable<boolean> {
    return this._forward.seekToLive();
  }

  /** Only active controller waits, waiting is moved to other controller on switch, see {@link switchToReverse} and {@link switchToForward}. */
  setWaitingForSyncedMedia(syncedMediaWaiting: boolean): void {
    if (syncedMediaWaiting && !this._syncedMediaWaiting) {
      this._syncedMediaWaitingPlaying = this._active === this._forward ? this.isForwardPlaying() : !!this._reverse.mediaElementPlayback?.state.playing;
    }
    this._syncedMediaWaiting = syncedMediaWaiting;
    this._active.setWaitingForSyncedMedia(syncedMediaWaiting);
  }

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe> {
    return this._forward.extractVideoKeyframe(options);
  }

  get mediaElementPlayback(): MediaElementPlayback | undefined {
    return this._active.mediaElementPlayback;
  }

  get mediaTemporalConverter(): MediaTemporalConverter | undefined {
    return this._forward.mediaTemporalConverter;
  }

  // endregion

  // region dom

  get videoElement(): HTMLVideoElement | undefined {
    return this._forward.videoElement;
  }

  get textMediaCaptionsElement(): HTMLElement {
    return this._forward.textMediaCaptionsElement;
  }

  get textImscElement(): HTMLElement {
    return this._forward.textImscElement;
  }

  get sidecarVideosElement(): HTMLElement {
    return this._forward.sidecarVideosElement;
  }

  get mediaRotation(): MediaRotationValue {
    return this._forward.mediaRotation;
  }

  // endregion

  // region audio

  get createMediaElementSourceEnabled(): boolean {
    return this._forward.createMediaElementSourceEnabled;
  }

  resolveAudioTrackIdentifier(track: AudioState): AudioTrackIdentifier {
    return this._forward.resolveAudioTrackIdentifier(track);
  }

  resolveActiveAudioTracks(tracks: AudioState[]): AudioState[] {
    return this._forward.resolveActiveAudioTracks(tracks);
  }

  isAudioTrackActive(track: AudioState): boolean {
    return this._forward.isAudioTrackActive(track);
  }

  switchAudioTrack(track: AudioState, activate: boolean): Observable<void> {
    return this._forward.switchAudioTrack(track, activate);
  }

  // endregion

  // region text tracks

  get textTracksDisplayed(): boolean {
    return this._forward.textTracksDisplayed;
  }

  setTextTracksDisplayed(textTracksDisplayed: boolean): void {
    this._forward.setTextTracksDisplayed(textTracksDisplayed);
  }

  resolveTextTrackIdentifier(track: TextTrackState): TextTrackIdentifier {
    return this._forward.resolveTextTrackIdentifier(track);
  }

  resolveActiveTextTracks(tracks: TextTrackState[]): TextTrackState[] {
    return this._forward.resolveActiveTextTracks(tracks);
  }

  isTextTrackActive(track: TextTrackState): boolean {
    return this._forward.isTextTrackActive(track);
  }

  switchTextTrack(track: TextTrackState, activate: boolean): Observable<void> {
    return this._forward.switchTextTrack(track, activate);
  }

  // endregion

  destroy(): void {
    this._destroyBreaker.destroy();
    this._playbackDomController?.destroy();
    this._playbackDomController = void 0;
    this._forward.destroy();
    this._reverse.destroy();
    freeObserver(this._onEvent$);
  }
}
