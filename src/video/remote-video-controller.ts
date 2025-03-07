/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import Hls from 'hls.js';
import {BehaviorSubject, filter, firstValueFrom, map, merge, Observable, Subject, takeUntil} from 'rxjs';
import {
  AudioLoadedEvent,
  AudioPeakProcessorMessageEvent,
  AudioSwitchedEvent,
  HelpMenuGroup,
  MainAudioChangeEvent,
  OmpAudioTrack,
  OmpNamedEvent,
  OmpNamedEventEventName,
  OmpVideoWindowPlaybackError,
  SidecarAudioChangeEvent,
  SidecarAudioCreateEvent,
  SidecarAudioPeakProcessorMessageEvent,
  SidecarAudioRemoveEvent,
  SubtitlesCreateEvent,
  SubtitlesEvent,
  SubtitlesLoadedEvent,
  SubtitlesVttTrack,
  ThumnbailVttUrlChangedEvent,
  VideoBufferingEvent,
  VideoEndedEvent,
  VideoErrorEvent,
  VideoFullscreenChangeEvent,
  VideoHelpMenuChangeEvent,
  VideoLoadedEvent,
  VideoLoadingEvent,
  VideoPlaybackRateEvent,
  VideoPlayEvent,
  VideoSafeZoneChangeEvent,
  VideoSeekedEvent,
  VideoSeekingEvent,
  VideoTimeChangeEvent,
  VideoVolumeEvent,
  VideoWindowPlaybackStateChangeEvent,
} from '../types';
import {AudioMeterStandard, PlaybackState, Video, VideoControllerApi, VideoLoadOptions} from './index';
import {VideoControllerConfig} from './video-controller';
import {nextCompleteSubject} from '../util/rxjs-util';
import {Validators} from '../validators';
import {TimecodeUtil} from '../util/timecode-util';
import {FrameRateUtil} from '../util/frame-rate-util';
import Decimal from 'decimal.js';
import {TypedOmpBroadcastChannel} from '../common/omp-broadcast-channel';
import {MessageChannelActionsMap} from './channel-types';
import {fromPromise} from 'rxjs/internal/observable/innerFrom';
import {AudioInputOutputNode, BufferedTimespan, OmpAudioRouterState, OmpMainAudioState, OmpSidecarAudioState, VideoLoadOptionsInternal, VideoSafeZone, VideoWindowPlaybackState} from './model';
import {OmpAudioRouter} from './audio-router';
import {SidecarAudioApi} from '../api/sidecar-audio-api';

export class RemoteVideoController implements VideoControllerApi {
  private readonly _messageChannel: TypedOmpBroadcastChannel<MessageChannelActionsMap>;
  private readonly _attachVideoWindowHook: () => Observable<void>;

  private readonly _get_onVideoLoaded$: BehaviorSubject<VideoLoadedEvent | undefined> = new BehaviorSubject<VideoLoadedEvent | undefined>(void 0);
  private readonly _get_onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined> = new BehaviorSubject<AudioLoadedEvent | undefined>(void 0);
  private readonly _get_onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined> = new BehaviorSubject<SubtitlesLoadedEvent | undefined>(void 0);

  private readonly _get_onMainAudioChange$: BehaviorSubject<MainAudioChangeEvent | undefined> = new BehaviorSubject<MainAudioChangeEvent | undefined>(void 0);

  // region transfer helper variables
  /**
   * Tracks VideoController.getPlaybackState()
   * @private
   */
  private _playbackState: PlaybackState | undefined = void 0;
  private _currentTime: number = 0;
  private _videoElementVolume: number = 1;
  private _videoElementMuted: boolean = false;
  private _videoElementPlaybackRate: number = 1;
  private _documentFullscreen = false;
  private _videoSafeZones: VideoSafeZone[] = [];
  private _videoHelpMenuGroups: HelpMenuGroup[] = [];
  private _bufferedTimespans: BufferedTimespan[] = [];
  private _subtitlesTracks: SubtitlesVttTrack[] = [];
  private _activeSubtitlesTrack: SubtitlesVttTrack | undefined;
  private _activeAudioTrack: OmpAudioTrack | undefined = void 0;

  private _sidecarAudioStates: OmpSidecarAudioState[] = [];

  private _thumbnailVttUrl: string | undefined = void 0;
  private _activeNamedEventStreams: OmpNamedEventEventName[] = [];

  // endregion

  private _destroyed$ = new Subject<void>();

  constructor(messageChannel: TypedOmpBroadcastChannel<MessageChannelActionsMap>, attachVideoWindowHook: () => Observable<void>) {
    this._messageChannel = messageChannel;
    this._attachVideoWindowHook = attachVideoWindowHook;

    this._messageChannel
      .createRequestResponseStream('VideoControllerApi.attachVideoWindow')
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this.attachVideoWindow());
        },
      });

    this._messageChannel
      .createRequestStream('VideoControllerApi.onVideoLoaded$')
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (value) => {
          this._get_onVideoLoaded$.next(value);
          this._currentTime = 0;
        },
      });

    this._messageChannel
      .createRequestStream('VideoControllerApi.onSubtitlesLoaded$')
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (value) => this._get_onSubtitlesLoaded$.next(value),
      });

    this._messageChannel
      .createRequestStream('VideoControllerApi.onAudioLoaded$')
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (value) => this._get_onAudioLoaded$.next(value),
      });

    this._messageChannel
      .createRequestStream('VideoControllerApi.onMainAudioChange$')
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (value) => this._get_onMainAudioChange$.next(value),
      });

    this.onPlaybackState$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._playbackState = value;
      },
    });

    this.onPlaybackRateChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._videoElementPlaybackRate = value.playbackRate;
      },
    });

    this.onVideoTimeChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._currentTime = value.currentTime;
      },
    });

    this.onVolumeChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._videoElementVolume = value.volume;
        this._videoElementMuted = value.muted;
      },
    });

    this.onBuffering$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._bufferedTimespans = value.bufferedTimespans;
      },
    });

    merge(this.onSubtitlesLoaded$, this.onSubtitlesCreate$, this.onSubtitlesRemove$, this.onSubtitlesShow$, this.onSubtitlesHide$)
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          if (event) {
            this._subtitlesTracks = event.tracks;
            this._activeSubtitlesTrack = event.currentTrack;
          }
        },
      });

    merge(this.onAudioLoaded$, this.onAudioSwitched$)
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (value) => {
          if (value) {
            this._activeAudioTrack = value.activeAudioTrack;
          }
        },
      });

    merge(this.onSidecarAudioCreate$, this.onSidecarAudioRemove$, this.onSidecarAudioChange$)
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: (value) => {
          if (value) {
            this._sidecarAudioStates = value.sidecarAudioStates;
          }
        },
      });

    this.onFullscreenChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._documentFullscreen = value.fullscreen;
      },
    });

    this.onVideoSafeZoneChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._videoSafeZones = value.videoSafeZones;
      },
    });

    this.onHelpMenuChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._videoHelpMenuGroups = value.helpMenuGroups;
      },
    });

    this.onThumbnailVttUrlChanged$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._thumbnailVttUrl = value.thumbnailVttUrl;
      },
    });

    this.onActiveNamedEventStreamsChange$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: (value) => {
        this._activeNamedEventStreams = value;
      },
    });
  }

  destroy(): void {
    nextCompleteSubject(this._destroyed$);
  }

  get onVideoLoaded$(): BehaviorSubject<VideoLoadedEvent | undefined> {
    return this._get_onVideoLoaded$;
  }

  get onVideoLoading$(): Observable<VideoLoadingEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onVideoLoading$');
  }

  get onPlay$(): Observable<VideoPlayEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onPlay$');
  }

  get onPause$(): Observable<VideoPlayEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onPause$');
  }

  get onVideoTimeChange$(): Observable<VideoTimeChangeEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onVideoTimeChange$');
  }

  get onSeeking$(): Observable<VideoSeekingEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSeeking$');
  }

  get onSeeked$(): Observable<VideoSeekedEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSeeked$');
  }

  get onBuffering$(): Observable<VideoBufferingEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onBuffering$');
  }

  get onEnded$(): Observable<VideoEndedEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onEnded$');
  }

  get onAudioSwitched$(): Observable<AudioSwitchedEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onAudioSwitched$');
  }

  get onPlaybackState$(): Observable<PlaybackState> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onPlaybackState$');
  }

  get onPlaybackRateChange$(): Observable<VideoPlaybackRateEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onPlaybackRateChange$');
  }

  get onHelpMenuChange$(): Observable<VideoHelpMenuChangeEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onHelpMenuChange$');
  }

  get onVideoWindowPlaybackStateChange$(): Observable<VideoWindowPlaybackStateChangeEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onVideoWindowPlaybackStateChange$');
  }

  get onVideoError$(): Observable<VideoErrorEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onVideoError$');
  }

  get onVolumeChange$(): Observable<VideoVolumeEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onVolumeChange$');
  }

  get onFullscreenChange$(): Observable<VideoFullscreenChangeEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onFullscreenChange$');
  }

  get onVideoSafeZoneChange$(): Observable<VideoSafeZoneChangeEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onVideoSafeZoneChange$');
  }

  get onAudioLoaded$(): BehaviorSubject<AudioLoadedEvent | undefined> {
    return this._get_onAudioLoaded$;
  }

  get onSubtitlesLoaded$(): BehaviorSubject<SubtitlesLoadedEvent | undefined> {
    return this._get_onSubtitlesLoaded$;
  }

  get onSubtitlesCreate$(): Observable<SubtitlesCreateEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSubtitlesCreate$');
  }

  get onSubtitlesHide$(): Observable<SubtitlesEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSubtitlesHide$');
  }

  get onSubtitlesRemove$(): Observable<SubtitlesEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSubtitlesRemove$');
  }

  get onSubtitlesShow$(): Observable<SubtitlesEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSubtitlesShow$');
  }

  get onMainAudioChange$(): Observable<MainAudioChangeEvent | undefined> {
    return this._get_onMainAudioChange$;
  }

  get onMainAudioPeakProcessorMessage$(): Observable<AudioPeakProcessorMessageEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onMainAudioPeakProcessorMessage$');
  }

  get onSidecarAudioCreate$(): Observable<SidecarAudioCreateEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSidecarAudioCreate$');
  }

  get onSidecarAudioRemove$(): Observable<SidecarAudioRemoveEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSidecarAudioRemove$');
  }

  get onSidecarAudioChange$(): Observable<SidecarAudioChangeEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSidecarAudioChange$');
  }

  get onSidecarAudioPeakProcessorMessage$(): Observable<SidecarAudioPeakProcessorMessageEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onSidecarAudioPeakProcessorMessage$');
  }

  get onThumbnailVttUrlChanged$(): Observable<ThumnbailVttUrlChangedEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onThumbnailVttUrlChanged$');
  }

  get onActiveNamedEventStreamsChange$(): Observable<OmpNamedEventEventName[]> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onActiveNamedEventStreamsChange$');
  }

  get onNamedEvent$(): Observable<OmpNamedEvent> {
    return this._messageChannel.createRequestStream('VideoControllerApi.onNamedEvent$');
  }

  loadVideoInternal(sourceUrl: string, frameRate: number | string, options: VideoLoadOptions | undefined, optionsInternal: VideoLoadOptionsInternal): Observable<Video> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.loadVideoInternal', [sourceUrl, frameRate, options, optionsInternal])));
  }

  loadVideo(sourceUrl: string, frameRate: string | number, options?: VideoLoadOptions | undefined): Observable<Video> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.loadVideo', [sourceUrl, frameRate, options])));
  }

  reloadVideo(): Observable<Video> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.reloadVideo')));
  }

  getPlaybackState(): PlaybackState | undefined {
    return this._playbackState;
  }

  getBufferedTimespans(): BufferedTimespan[] {
    return this._bufferedTimespans;
  }

  isVideoLoaded(): boolean {
    return !!this.onVideoLoaded$.value;
  }

  getVideo(): Video | undefined {
    return this.onVideoLoaded$.value?.video;
  }

  getVideoLoadOptions(): VideoLoadOptions | undefined {
    return this.onVideoLoaded$.value?.videoLoadOptions;
  }

  getHTMLVideoElement(): HTMLVideoElement {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  getAudioContext(): AudioContext {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  getMainAudioRouter(): OmpAudioRouter | undefined {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  getDuration(): number {
    this.validateVideoLoaded();
    return this.getVideo()!.duration;
  }

  getCurrentTime(): number {
    return this.isVideoLoaded() ? this._currentTime : 0;
  }

  getCurrentTimecode(): string {
    return this.formatToTimecode(this.getCurrentTime());
  }

  getPlaybackRate(): number {
    return this._videoElementPlaybackRate;
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.setPlaybackRate', [playbackRate])));
  }

  getVolume(): number {
    return this.isVideoLoaded() ? this._videoElementVolume : 0;
  }

  setVolume(volume: number): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.setVolume', [volume])));
  }

  getCurrentFrame(): number {
    return this.isVideoLoaded() ? this.calculateTimeToFrame(this.getCurrentTime()) : 0;
  }

  getFrameRate(): number {
    this.validateVideoLoaded();
    return this.getVideo()!.frameRate;
  }

  getTotalFrames(): number {
    this.validateVideoLoaded();
    return this.getVideo()!.totalFrames;
  }

  isPlaying(): boolean {
    return this.getPlaybackState() ? this.getPlaybackState()!.playing : false;
  }

  isPaused(): boolean {
    return !this.isPlaying();
  }

  isSeeking(): boolean {
    return !!this.getPlaybackState() && this.getPlaybackState()!.seeking;
  }

  pause(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.pause')));
  }

  play(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.play')));
  }

  togglePlayPause(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.togglePlayPause')));
  }

  seekToFrame(frame: number): Observable<boolean> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.seekToFrame', [frame])));
  }

  seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.seekFromCurrentFrame', [framesCount])));
  }

  seekFromCurrentTime(timeAmount: number): Observable<boolean> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.seekFromCurrentTime', [timeAmount])));
  }

  seekPreviousFrame(): Observable<boolean> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.seekPreviousFrame')));
  }

  seekNextFrame(): Observable<boolean> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.seekNextFrame')));
  }

  seekToTime(time: number): Observable<boolean> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.seekToTime', [time])));
  }

  seekToTimecode(timecode: string): Observable<boolean> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.seekToTimecode', [timecode])));
  }

  seekToPercent(percent: number): Observable<boolean> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.seekToPercent', [percent])));
  }

  seekToEnd(): Observable<boolean> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.seekToEnd')));
  }

  formatToTimecode(time: number): string {
    this.validateVideoLoaded();
    time = Validators.videoTime()(time);
    return TimecodeUtil.formatToTimecode(time, this.getVideo()!);
  }

  parseTimecodeToFrame(timecode: string): number {
    this.validateVideoLoaded();
    timecode = Validators.videoTimecode()(timecode, this.getVideo()!);
    return TimecodeUtil.parseTimecodeToFrame(timecode, new Decimal(this.getVideo()!.frameRate), this.getVideo()!.ffomTimecodeObject);
  }

  parseTimecodeToTime(timecode: string): number {
    this.validateVideoLoaded();
    timecode = Validators.videoTimecode()(timecode, this.getVideo()!);
    return TimecodeUtil.parseTimecodeToTime(timecode, this.getVideo()!, this.getVideo()!.ffomTimecodeObject);
  }

  calculateTimeToFrame(time: number): number {
    this.validateVideoLoaded();
    return FrameRateUtil.videoTimeToVideoFrameNumber(time, this.getVideo()!);
  }

  calculateFrameToTime(frameNumber: number): number {
    this.validateVideoLoaded();
    return FrameRateUtil.videoFrameNumberToVideoTime(frameNumber, this.getVideo()!);
  }

  mute(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.mute')));
  }

  unmute(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.unmute')));
  }

  isMuted(): boolean {
    return this._videoElementMuted;
  }

  toggleMuteUnmute(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.toggleMuteUnmute')));
  }

  isFullscreen(): boolean {
    return this._documentFullscreen;
  }

  toggleFullscreen(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.toggleFullscreen')));
  }

  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.appendHelpMenuGroup', [helpMenuGroup])));
  }

  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.prependHelpMenuGroup', [helpMenuGroup])));
  }

  clearHelpMenuGroups(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.clearHelpMenuGroups')));
  }

  getHelpMenuGroups(): HelpMenuGroup[] {
    return this._videoHelpMenuGroups;
  }

  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.addSafeZone', [videoSafeZone])));
  }

  removeSafeZone(id: string): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.removeSafeZone', [id])));
  }

  clearSafeZones(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.clearSafeZones')));
  }

  getSafeZones(): VideoSafeZone[] {
    return this._videoSafeZones;
  }

  getVideoWindowPlaybackState(): VideoWindowPlaybackState {
    return 'detached';
  }

  isDetachable(): boolean {
    return false;
  }

  canDetach(): boolean {
    return false;
  }

  canAttach(): boolean {
    return true;
  }

  detachVideoWindow(): Observable<void> {
    throw new OmpVideoWindowPlaybackError('I am not detachable');
  }

  attachVideoWindow(): Observable<void> {
    return this._attachVideoWindowHook();
  }

  private validateVideoLoaded() {
    if (!this.isVideoLoaded()) {
      throw new Error('Video not loaded');
    }
  }

  createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack | undefined> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.createSubtitlesVttTrack', [subtitlesVttTrack])));
  }

  getSubtitlesTracks(): SubtitlesVttTrack[] {
    return this._subtitlesTracks;
  }

  getActiveSubtitlesTrack(): SubtitlesVttTrack | undefined {
    return this._activeSubtitlesTrack;
  }

  hideSubtitlesTrack(id: string): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.hideSubtitlesTrack', [id])));
  }

  removeAllSubtitlesTracks(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.removeAllSubtitlesTracks')));
  }

  removeSubtitlesTrack(id: string): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.removeSubtitlesTrack', [id])));
  }

  showSubtitlesTrack(id: string): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.showSubtitlesTrack', [id])));
  }

  getActiveAudioTrack(): OmpAudioTrack | undefined {
    return this._activeAudioTrack;
  }

  getAudioTracks(): OmpAudioTrack[] {
    return this.onAudioLoaded$.value ? this.onAudioLoaded$.value.audioTracks : [];
  }

  setActiveAudioTrack(id: string): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.setActiveAudioTrack', [id])));
  }

  // region audio router

  createMainAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<OmpAudioRouterState> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.createMainAudioRouter', [inputsNumber, outputsNumber])));
  }

  createMainAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<OmpAudioRouterState> {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  createMainAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>> {
    // return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.createMainAudioPeakProcessor', [audioMeterStandard])));
    return fromPromise(
      firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.createMainAudioPeakProcessor', [audioMeterStandard]).pipe(map((p) => this.onMainAudioPeakProcessorMessage$)))
    );
  }

  getMainAudioSourceNode(): AudioNode {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  getMainAudioState(): OmpMainAudioState | undefined {
    return this._get_onMainAudioChange$.value?.mainAudioState;
  }

  routeMainAudioRouterNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.routeMainAudioRouterNodes', [newAudioInputOutputNodes])));
  }

  // endregion

  // region sidecar audio

  getSidecarAudios(): SidecarAudioApi[] {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  getSidecarAudio(id: string): SidecarAudioApi | undefined {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  getSidecarAudioStates(): OmpSidecarAudioState[] {
    return this._sidecarAudioStates;
  }

  createSidecarAudioTrack(track: Partial<OmpAudioTrack>): Observable<OmpAudioTrack> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.createSidecarAudioTrack', [track], {timeout: 60000 * 5})));
  }

  createSidecarAudioTracks(tracks: Partial<OmpAudioTrack>[]): Observable<OmpAudioTrack[]> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.createSidecarAudioTracks', [tracks], {timeout: 60000 * 5})));
  }

  activateSidecarAudioTracks(ids: string[], deactivateOthers: boolean | undefined): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.activateSidecarAudioTracks', [ids, deactivateOthers])));
  }

  deactivateSidecarAudioTracks(ids: string[]): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.deactivateSidecarAudioTracks', [ids])));
  }

  getActiveSidecarAudioTracks(): OmpAudioTrack[] {
    return this.getSidecarAudioTracks().filter((p) => p.active);
  }

  getSidecarAudioTracks(): OmpAudioTrack[] {
    return this._sidecarAudioStates.map((p) => p.audioTrack);
  }

  removeSidecarAudioTracks(ids: string[]): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.removeSidecarAudioTracks', [ids])));
  }

  removeAllSidecarAudioTracks(): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.removeAllSidecarAudioTracks')));
  }

  createSidecarAudioRouter(sidecarAudioTrackId: string, inputsNumber: number, outputsNumber?: number): Observable<OmpAudioRouterState> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.createSidecarAudioRouter', [sidecarAudioTrackId, inputsNumber, outputsNumber])));
  }

  routeSidecarAudioRouterNodes(sidecarAudioTrackId: string, newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.routeSidecarAudioRouterNodes', [sidecarAudioTrackId, newAudioInputOutputNodes])));
  }

  createSidecarAudioPeakProcessor(sidecarAudioTrackId: string, audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>> {
    // return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.createSidecarAudioPeakProcessor', [sidecarAudioTrackId, audioMeterStandard])));
    return fromPromise(
      firstValueFrom(
        this._messageChannel
          .sendAndObserveResponse('VideoControllerApi.createSidecarAudioPeakProcessor', [sidecarAudioTrackId, audioMeterStandard])
          .pipe(map((p) => this.onSidecarAudioPeakProcessorMessage$.pipe(filter((p) => p.sidecarAudioTrackId === sidecarAudioTrackId))))
      )
    );
  }

  exportMainAudioTrackToSidecar(mainAudioTrackId: string): Observable<OmpAudioTrack> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.exportMainAudioTrackToSidecar', [mainAudioTrackId])));
  }

  exportMainAudioTracksToSidecar(mainAudioTrackIds: string[]): Observable<OmpAudioTrack[]> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.exportMainAudioTracksToSidecar', [mainAudioTrackIds])));
  }

  // endregion

  getThumbnailVttUrl(): string | undefined {
    return this._thumbnailVttUrl;
  }

  loadThumbnailVttUrl(thumbnailVttUrl: string): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.loadThumbnailVttUrl', [thumbnailVttUrl])));
  }

  isPiPSupported(): boolean {
    return false;
  }

  enablePiP(): Observable<void> {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  disablePiP(): Observable<void> {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  getConfig(): VideoControllerConfig {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
    // TODO verify this
  }

  getHls(): Hls | undefined {
    throw new OmpVideoWindowPlaybackError('Method cannot be used in detached mode');
  }

  updateActiveNamedEventStreams(eventNames: OmpNamedEventEventName[]): Observable<void> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.updateActiveNamedEventStreams', [eventNames])));
  }

  getActiveNamedEventStreams(): OmpNamedEventEventName[] {
    return this._activeNamedEventStreams;
  }

  loadBlackVideo(): Observable<Video> {
    return fromPromise(firstValueFrom(this._messageChannel.sendAndObserveResponse('VideoControllerApi.loadBlackVideo')));
  }
}
