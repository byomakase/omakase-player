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

import {VideoControllerApi} from './video-controller-api';
import {BehaviorSubject, filter, map, Observable, skip, Subject, takeUntil} from 'rxjs';
import {
  AudioLoadedEvent,
  AudioPeakProcessorMessageEvent,
  AudioSwitchedEvent,
  HelpMenuGroup,
  MainAudioChangeEvent,
  MainAudioInputSoloMuteEvent,
  OmpAudioTrack,
  OmpAudioTrackCreateType,
  OmpNamedEvent,
  OmpNamedEventEventName,
  SidecarAudioChangeEvent,
  SidecarAudioCreateEvent,
  SidecarAudioInputSoloMuteEvent,
  SidecarAudioPeakProcessorMessageEvent,
  SidecarAudioRemoveEvent,
  SidecarAudioVolumeChangeEvent,
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
  VideoWindowPlaybackStateChangeEvent,
  VolumeChangeEvent,
} from '../types';
import {AudioMeterStandard, BufferedTimespan, OmpAudioRouterState, OmpAudioRoutingConnection, OmpAudioRoutingPath, OmpMainAudioState, OmpSidecarAudioState, PlaybackState, Video, VideoLoadOptions, VideoSafeZone, VideoWindowPlaybackState} from './index';
import {nextCompleteSubject} from '../util/rxjs-util';
import {VideoControllerConfig} from './video-controller';
import Hls from 'hls.js';
import {destroyer} from '../util/destroy-util';
import {OmpAudioRouter} from './audio-router';
import {SidecarAudioApi} from '../api/sidecar-audio-api';
import {OmpAudioEffectFilter, OmpAudioEffectParam, OmpAudioEffectsGraphDef} from '../audio';
import {OmpAudioRoutingInputType, OmpMainAudioInputSoloMuteState, OmpSidecarAudioInputSoloMuteState, VideoLoadOptionsInternal} from './model';

/**
 * Used for switching between {@link VideoControllerApi} instances
 */
export class SwitchableVideoController implements VideoControllerApi {
  public readonly onVideoLoaded$: BehaviorSubject<VideoLoadedEvent | undefined> = new BehaviorSubject<VideoLoadedEvent | undefined>(void 0);
  public readonly onVideoLoading$: Subject<VideoLoadingEvent> = new Subject<VideoLoadingEvent>();

  public readonly onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined> = new BehaviorSubject<AudioLoadedEvent | undefined>(void 0);
  public readonly onAudioSwitched$: Subject<AudioSwitchedEvent> = new Subject<AudioSwitchedEvent>();

  public readonly onAudioOutputVolumeChange$: Subject<VolumeChangeEvent> = new Subject<VolumeChangeEvent>();

  public readonly onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined> = new BehaviorSubject<SubtitlesLoadedEvent | undefined>(void 0);
  public readonly onSubtitlesCreate$: Subject<SubtitlesCreateEvent> = new Subject<SubtitlesCreateEvent>();
  public readonly onSubtitlesHide$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onSubtitlesRemove$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onSubtitlesShow$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();

  public readonly onPlay$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onPause$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onVideoTimeChange$: Subject<VideoTimeChangeEvent> = new Subject<VideoTimeChangeEvent>();
  public readonly onSeeking$: Subject<VideoSeekingEvent> = new Subject<VideoSeekingEvent>();
  public readonly onSeeked$: Subject<VideoSeekedEvent> = new Subject<VideoSeekedEvent>();
  public readonly onBuffering$: Subject<VideoBufferingEvent> = new Subject<VideoBufferingEvent>();
  public readonly onEnded$: Subject<VideoEndedEvent> = new Subject<VideoEndedEvent>();
  public readonly onVideoError$: Subject<VideoErrorEvent> = new Subject<VideoErrorEvent>();
  public readonly onVolumeChange$: Subject<VolumeChangeEvent> = new Subject<VolumeChangeEvent>();
  public readonly onFullscreenChange$: Subject<VideoFullscreenChangeEvent> = new Subject<VideoFullscreenChangeEvent>();
  public readonly onVideoSafeZoneChange$: Subject<VideoSafeZoneChangeEvent> = new Subject<VideoSafeZoneChangeEvent>();
  public readonly onPlaybackRateChange$: Subject<VideoPlaybackRateEvent> = new Subject<VideoPlaybackRateEvent>();
  public readonly onVideoWindowPlaybackStateChange$: Subject<VideoWindowPlaybackStateChangeEvent> = new Subject<VideoWindowPlaybackStateChangeEvent>();

  public readonly onHelpMenuChange$: Subject<VideoHelpMenuChangeEvent> = new Subject<VideoHelpMenuChangeEvent>();
  public readonly onPlaybackState$: Subject<PlaybackState> = new Subject<PlaybackState>();

  public readonly onThumbnailVttUrlChanged$: Subject<ThumnbailVttUrlChangedEvent> = new Subject<ThumnbailVttUrlChangedEvent>();

  // audio routing events
  public readonly onMainAudioChange$: BehaviorSubject<MainAudioChangeEvent | undefined> = new BehaviorSubject<MainAudioChangeEvent | undefined>(void 0);
  public readonly onMainAudioPeakProcessorMessage$: Subject<AudioPeakProcessorMessageEvent> = new Subject<AudioPeakProcessorMessageEvent>();
  public readonly onMainAudioInputSoloMute$: BehaviorSubject<MainAudioInputSoloMuteEvent | undefined> = new BehaviorSubject<MainAudioInputSoloMuteEvent | undefined>(void 0);

  // sidecar audio
  public readonly onSidecarAudioCreate$: Subject<SidecarAudioCreateEvent> = new Subject<SidecarAudioCreateEvent>();
  public readonly onSidecarAudioRemove$: Subject<SidecarAudioRemoveEvent> = new Subject<SidecarAudioRemoveEvent>();
  public readonly onSidecarAudioChange$: Subject<SidecarAudioChangeEvent> = new Subject<SidecarAudioChangeEvent>();
  public readonly onSidecarAudioVolumeChange$: Subject<SidecarAudioVolumeChangeEvent> = new Subject<SidecarAudioVolumeChangeEvent>();
  public readonly onSidecarAudioPeakProcessorMessage$: Subject<SidecarAudioPeakProcessorMessageEvent> = new Subject<SidecarAudioPeakProcessorMessageEvent>();
  public readonly onSidecarAudioInputSoloMute$: Subject<SidecarAudioInputSoloMuteEvent> = new Subject<SidecarAudioInputSoloMuteEvent>();

  // VideoHlsLoader specific
  public readonly onActiveNamedEventStreamsChange$: Subject<OmpNamedEventEventName[]> = new Subject<OmpNamedEventEventName[]>();
  public readonly onNamedEvent$: Subject<OmpNamedEvent> = new Subject<OmpNamedEvent>();

  protected _videoController!: VideoControllerApi;
  protected _eventBreaker$ = new Subject<void>();

  protected _destroyed$ = new Subject<void>();

  constructor(videoController: VideoControllerApi) {
    this.switchToController(videoController);
  }

  destroy() {
    nextCompleteSubject(this._eventBreaker$);
    nextCompleteSubject(this._destroyed$);
    destroyer(this._videoController);
  }

  protected switchToController(videoController: VideoControllerApi) {
    nextCompleteSubject(this._eventBreaker$);
    this._eventBreaker$ = new Subject<void>();

    this._videoController = videoController;

    this.attachEventListeners(this._videoController);
  }

  protected attachEventListeners(videoController: VideoControllerApi) {
    videoController.onVideoLoaded$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onVideoLoaded$.next(value);
      },
    });

    videoController.onVideoLoading$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onVideoLoading$.next(value);
      },
    });

    videoController.onPlay$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onPlay$.next(value);
      },
    });

    videoController.onPause$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onPause$.next(value);
      },
    });

    videoController.onVideoTimeChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onVideoTimeChange$.next(value);
      },
    });

    videoController.onSeeking$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSeeking$.next(value);
      },
    });

    videoController.onSeeked$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSeeked$.next(value);
      },
    });

    videoController.onBuffering$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onBuffering$.next(value);
      },
    });

    videoController.onEnded$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onEnded$.next(value);
      },
    });

    // we have to skip first value as it is behaviour subject
    videoController.onAudioLoaded$.pipe(skip(0), takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onAudioLoaded$.next(value);
      },
    });

    videoController.onAudioSwitched$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onAudioSwitched$.next(value);
      },
    });

    videoController.onAudioOutputVolumeChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onAudioOutputVolumeChange$.next(value);
      },
    });

    // audio router

    videoController.onMainAudioChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onMainAudioChange$.next(value);
      },
    });

    videoController.onMainAudioPeakProcessorMessage$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onMainAudioPeakProcessorMessage$.next(value);
      },
    });

    videoController.onMainAudioInputSoloMute$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onMainAudioInputSoloMute$.next(value);
      },
    });

    // sidecar audio

    videoController.onSidecarAudioCreate$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSidecarAudioCreate$.next(value);
      },
    });

    videoController.onSidecarAudioRemove$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSidecarAudioRemove$.next(value);
      },
    });

    videoController.onSidecarAudioChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSidecarAudioChange$.next(value);
      },
    });

    videoController.onSidecarAudioVolumeChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSidecarAudioVolumeChange$.next(value);
      },
    });

    videoController.onSidecarAudioPeakProcessorMessage$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSidecarAudioPeakProcessorMessage$.next(value);
      },
    });

    videoController.onSidecarAudioInputSoloMute$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSidecarAudioInputSoloMute$.next(value);
      },
    });

    videoController.onVideoError$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onVideoError$.next(value);
      },
    });

    videoController.onVolumeChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onVolumeChange$.next(value);
      },
    });

    videoController.onFullscreenChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onFullscreenChange$.next(value);
      },
    });

    videoController.onVideoSafeZoneChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onVideoSafeZoneChange$.next(value);
      },
    });

    videoController.onPlaybackRateChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onPlaybackRateChange$.next(value);
      },
    });

    videoController.onHelpMenuChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onHelpMenuChange$.next(value);
      },
    });

    videoController.onVideoWindowPlaybackStateChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onVideoWindowPlaybackStateChange$.next(value);
      },
    });

    videoController.onPlaybackState$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onPlaybackState$.next(value);
      },
    });

    // we have to skip first value as it is behaviour subject
    videoController.onSubtitlesLoaded$.pipe(skip(0), takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSubtitlesLoaded$.next(value);
      },
    });

    videoController.onSubtitlesCreate$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSubtitlesCreate$.next(value);
      },
    });

    videoController.onSubtitlesHide$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSubtitlesHide$.next(value);
      },
    });

    videoController.onSubtitlesRemove$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSubtitlesRemove$.next(value);
      },
    });

    videoController.onSubtitlesShow$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onSubtitlesShow$.next(value);
      },
    });

    videoController.onThumbnailVttUrlChanged$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onThumbnailVttUrlChanged$.next(value);
      },
    });

    videoController.onActiveNamedEventStreamsChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onActiveNamedEventStreamsChange$.next(value);
      },
    });

    videoController.onNamedEvent$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onNamedEvent$.next(value);
      },
    });
  }

  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone> {
    return this._videoController.addSafeZone(videoSafeZone);
  }

  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return this._videoController.appendHelpMenuGroup(helpMenuGroup);
  }

  calculateFrameToTime(frameNumber: number): number {
    return this._videoController.calculateFrameToTime(frameNumber);
  }

  calculateTimeToFrame(time: number): number {
    return this._videoController.calculateTimeToFrame(time);
  }

  clearSafeZones(): Observable<void> {
    return this._videoController.clearSafeZones();
  }

  getSafeZones(): VideoSafeZone[] {
    return this._videoController.getSafeZones();
  }

  formatToTimecode(time: number): string {
    return this._videoController.formatToTimecode(time);
  }

  getAudioTracks(): any[] {
    return this._videoController.getAudioTracks();
  }

  getBufferedTimespans(): BufferedTimespan[] {
    return this._videoController.getBufferedTimespans();
  }

  getActiveAudioTrack(): OmpAudioTrack | undefined {
    return this._videoController.getActiveAudioTrack();
  }

  getCurrentFrame(): number {
    return this._videoController.getCurrentFrame();
  }

  getCurrentTime(): number {
    return this._videoController.getCurrentTime();
  }

  getCurrentTimecode(): string {
    return this._videoController.getCurrentTimecode();
  }

  getDuration(): number {
    return this._videoController.getDuration();
  }

  getFrameRate(): number {
    return this._videoController.getFrameRate();
  }

  getHTMLVideoElement(): HTMLVideoElement {
    return this._videoController.getHTMLVideoElement();
  }

  getAudioContext(): AudioContext {
    return this._videoController.getAudioContext();
  }

  getAudioOutputNode(): AudioNode {
    return this._videoController.getAudioOutputNode();
  }

  getAudioOutputVolume(): number {
    return this._videoController.getAudioOutputVolume();
  }

  isAudioOutputMuted(): boolean {
    return this._videoController.isAudioOutputMuted();
  }

  setAudioOutputMuted(muted: boolean): Observable<void> {
    return this._videoController.setAudioOutputMuted(muted);
  }

  toggleAudioOutputMuteUnmute(): Observable<void> {
    return this._videoController.toggleAudioOutputMuteUnmute();
  }

  muteAudioOutput(): Observable<void> {
    return this._videoController.muteAudioOutput();
  }

  unmuteAudioOutput(): Observable<void> {
    return this._videoController.unmuteAudioOutput();
  }

  setAudioOutputVolume(volume: number): Observable<void> {
    return this._videoController.setAudioOutputVolume(volume);
  }

  getMainAudioRouter(): OmpAudioRouter | undefined {
    return this._videoController.getMainAudioRouter();
  }

  getHelpMenuGroups(): HelpMenuGroup[] {
    return this._videoController.getHelpMenuGroups();
  }

  getPlaybackRate(): number {
    return this._videoController.getPlaybackRate();
  }

  getPlaybackState(): PlaybackState | undefined {
    return this._videoController.getPlaybackState();
  }

  getTotalFrames(): number {
    return this._videoController.getTotalFrames();
  }

  getVideo(): Video | undefined {
    return this._videoController.getVideo();
  }

  getVideoLoadOptions(): VideoLoadOptions | undefined {
    return this._videoController.getVideoLoadOptions();
  }

  getVolume(): number {
    return this._videoController.getVolume();
  }

  isFullscreen(): boolean {
    return this._videoController.isFullscreen();
  }

  isMuted(): boolean {
    return this._videoController.isMuted();
  }

  isPaused(): boolean {
    return this._videoController.isPaused();
  }

  isPlaying(): boolean {
    return this._videoController.isPlaying();
  }

  isSeeking(): boolean {
    return this._videoController.isSeeking();
  }

  isVideoLoaded(): boolean {
    return this._videoController.isVideoLoaded();
  }

  loadVideoInternal(sourceUrl: string, options: VideoLoadOptions | undefined, optionsInternal: VideoLoadOptionsInternal): Observable<Video> {
    return this._videoController.loadVideoInternal(sourceUrl, options, optionsInternal);
  }

  loadVideo(sourceUrl: string, options?: VideoLoadOptions): Observable<Video> {
    return this._videoController.loadVideo(sourceUrl, options);
  }

  reloadVideo(): Observable<Video> {
    return this._videoController.reloadVideo();
  }

  mute(): Observable<void> {
    return this._videoController.mute();
  }

  parseTimecodeToFrame(timecode: string): number {
    return this._videoController.parseTimecodeToFrame(timecode);
  }

  parseTimecodeToTime(timecode: string): number {
    return this._videoController.parseTimecodeToTime(timecode);
  }

  pause(): Observable<void> {
    return this._videoController.pause();
  }

  play(): Observable<void> {
    return this._videoController.play();
  }

  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return this._videoController.prependHelpMenuGroup(helpMenuGroup);
  }

  clearHelpMenuGroups(): Observable<void> {
    return this._videoController.clearHelpMenuGroups();
  }

  removeSafeZone(id: string): Observable<void> {
    return this._videoController.removeSafeZone(id);
  }

  seekFromCurrentFrame(framesCount: number): Observable<boolean> {
    return this._videoController.seekFromCurrentFrame(framesCount);
  }

  seekFromCurrentTime(timeAmount: number): Observable<boolean> {
    return this._videoController.seekFromCurrentTime(timeAmount);
  }

  seekNextFrame(): Observable<boolean> {
    return this._videoController.seekNextFrame();
  }

  seekPreviousFrame(): Observable<boolean> {
    return this._videoController.seekPreviousFrame();
  }

  seekToFrame(frame: number): Observable<boolean> {
    return this._videoController.seekToFrame(frame);
  }

  seekToPercent(percent: number): Observable<boolean> {
    return this._videoController.seekToPercent(percent);
  }

  seekToEnd(): Observable<boolean> {
    return this._videoController.seekToEnd();
  }

  seekToTime(time: number): Observable<boolean> {
    return this._videoController.seekToTime(time);
  }

  seekToTimecode(timecode: string): Observable<boolean> {
    return this._videoController.seekToTimecode(timecode);
  }

  setActiveAudioTrack(id: string): Observable<void> {
    return this._videoController.setActiveAudioTrack(id);
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return this._videoController.setPlaybackRate(playbackRate);
  }

  setVolume(volume: number): Observable<void> {
    return this._videoController.setVolume(volume);
  }

  toggleFullscreen(): Observable<void> {
    return this._videoController.toggleFullscreen();
  }

  toggleMuteUnmute(): Observable<void> {
    return this._videoController.toggleMuteUnmute();
  }

  togglePlayPause(): Observable<void> {
    return this._videoController.togglePlayPause();
  }

  unmute(): Observable<void> {
    return this._videoController.unmute();
  }

  getVideoWindowPlaybackState(): VideoWindowPlaybackState {
    return this._videoController.getVideoWindowPlaybackState();
  }

  isDetachable(): boolean {
    return this._videoController.isDetachable();
  }

  canDetach(): boolean {
    return this._videoController.canDetach();
  }

  canAttach(): boolean {
    return this._videoController.canAttach();
  }

  detachVideoWindow(): Observable<void> {
    return this._videoController.detachVideoWindow();
  }

  attachVideoWindow(): Observable<void> {
    return this._videoController.attachVideoWindow();
  }

  createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack> {
    return this._videoController.createSubtitlesVttTrack(subtitlesVttTrack);
  }

  getActiveSubtitlesTrack(): SubtitlesVttTrack | undefined {
    return this._videoController.getActiveSubtitlesTrack();
  }

  getSubtitlesTracks(): SubtitlesVttTrack[] {
    return this._videoController.getSubtitlesTracks();
  }

  hideSubtitlesTrack(id: string): Observable<void> {
    return this._videoController.hideSubtitlesTrack(id);
  }

  removeAllSubtitlesTracks(): Observable<void> {
    return this._videoController.removeAllSubtitlesTracks();
  }

  removeSubtitlesTrack(id: string): Observable<void> {
    return this._videoController.removeSubtitlesTrack(id);
  }

  showSubtitlesTrack(id: string): Observable<void> {
    return this._videoController.showSubtitlesTrack(id);
  }

  createMainAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<OmpAudioRouterState> {
    return this._videoController.createMainAudioRouter(inputsNumber, outputsNumber);
  }

  createMainAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<OmpAudioRouterState> {
    return this._videoController.createMainAudioRouterWithOutputsResolver(inputsNumber, outputsNumberResolver);
  }

  createMainAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>> {
    // we have to re-map event stream to this controller
    return this._videoController.createMainAudioPeakProcessor(audioMeterStandard).pipe(map((p) => this.onMainAudioPeakProcessorMessage$));
  }

  getMainAudioNode(): AudioNode {
    return this._videoController.getMainAudioNode();
  }

  getMainAudioState(): OmpMainAudioState | undefined {
    return this._videoController.getMainAudioState();
  }

  getMainAudioInputSoloMuteState(): OmpMainAudioInputSoloMuteState | undefined {
    return this._videoController.getMainAudioInputSoloMuteState();
  }

  getMainAudioRouterInitialRoutingConnections(): OmpAudioRoutingConnection[] | undefined {
    return this._videoController.getMainAudioRouterInitialRoutingConnections();
  }

  setMainAudioRouterInitialRoutingConnections(connections: OmpAudioRoutingConnection[]): Observable<void> {
    return this._videoController.setMainAudioRouterInitialRoutingConnections(connections);
  }

  updateMainAudioRouterConnections(connections: OmpAudioRoutingConnection[]): Observable<void> {
    return this._videoController.updateMainAudioRouterConnections(connections);
  }

  setMainAudioEffectsGraphs(effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    return this._videoController.setMainAudioEffectsGraphs(effectsGraphDef, routingPath);
  }

  removeMainAudioEffectsGraphs(routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    return this._videoController.removeMainAudioEffectsGraphs(routingPath);
  }

  setMainAudioEffectsParams(
    param: OmpAudioEffectParam,
    filter?: {
      routingPath?: Partial<OmpAudioRoutingPath>;
    } & OmpAudioEffectFilter
  ): Observable<void> {
    return this._videoController.setMainAudioEffectsParams(param, filter);
  }

  getSidecarAudios(): SidecarAudioApi[] {
    return this._videoController.getSidecarAudios();
  }

  getSidecarAudio(id: string): SidecarAudioApi | undefined {
    return this._videoController.getSidecarAudio(id);
  }

  getSidecarAudioState(id: string): OmpSidecarAudioState | undefined {
    return this._videoController.getSidecarAudioState(id);
  }

  getSidecarAudioStates(): OmpSidecarAudioState[] {
    return this._videoController.getSidecarAudioStates();
  }

  getSidecarAudioInputSoloMuteState(id: string): OmpSidecarAudioInputSoloMuteState | undefined {
    return this._videoController.getSidecarAudioInputSoloMuteState(id);
  }

  getSidecarAudioInputSoloMuteStates(): OmpSidecarAudioInputSoloMuteState[] {
    return this._videoController.getSidecarAudioInputSoloMuteStates();
  }

  getSidecarAudioRouterInitialRoutingConnections(id: string): OmpAudioRoutingConnection[] | undefined {
    return this._videoController.getSidecarAudioRouterInitialRoutingConnections(id);
  }

  setSidecarAudioRouterInitialRoutingConnections(id: string, connections: OmpAudioRoutingConnection[]): Observable<void> {
    return this._videoController.setSidecarAudioRouterInitialRoutingConnections(id, connections);
  }

  createSidecarAudioTrack(track: OmpAudioTrackCreateType): Observable<OmpAudioTrack> {
    return this._videoController.createSidecarAudioTrack(track);
  }

  createSidecarAudioTracks(tracks: OmpAudioTrackCreateType[]): Observable<OmpAudioTrack[]> {
    return this._videoController.createSidecarAudioTracks(tracks);
  }

  activateSidecarAudioTracks(ids: string[] | undefined, deactivateOthers: boolean | undefined): Observable<void> {
    return this._videoController.activateSidecarAudioTracks(ids, deactivateOthers);
  }

  deactivateSidecarAudioTracks(ids: string[] | undefined): Observable<void> {
    return this._videoController.deactivateSidecarAudioTracks(ids);
  }

  setSidecarVolume(volume: number, ids: string[] | undefined): Observable<void> {
    return this._videoController.setSidecarVolume(volume, ids);
  }

  setSidecarMuted(muted: boolean, ids: string[] | undefined): Observable<void> {
    return this._videoController.setSidecarMuted(muted, ids);
  }

  muteSidecar(ids: string[] | undefined): Observable<void> {
    return this._videoController.muteSidecar(ids);
  }

  unmuteSidecar(ids: string[] | undefined): Observable<void> {
    return this._videoController.unmuteSidecar(ids);
  }

  getActiveSidecarAudioTracks(): OmpAudioTrack[] {
    return this._videoController.getActiveSidecarAudioTracks();
  }

  getSidecarAudioTracks(): OmpAudioTrack[] {
    return this._videoController.getSidecarAudioTracks();
  }

  removeSidecarAudioTracks(ids: string[]): Observable<void> {
    return this._videoController.removeSidecarAudioTracks(ids);
  }

  removeAllSidecarAudioTracks(): Observable<void> {
    return this._videoController.removeAllSidecarAudioTracks();
  }

  createSidecarAudioRouter(sidecarAudioTrackId: string, inputsNumber: number, outputsNumber?: number): Observable<OmpAudioRouterState> {
    return this._videoController.createSidecarAudioRouter(sidecarAudioTrackId, inputsNumber, outputsNumber);
  }

  updateSidecarAudioRouterConnections(sidecarAudioTrackId: string, connections: OmpAudioRoutingConnection[]): Observable<void> {
    return this._videoController.updateSidecarAudioRouterConnections(sidecarAudioTrackId, connections);
  }

  setSidecarAudioEffectsGraph(sidecarAudioTrackId: string, effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    return this._videoController.setSidecarAudioEffectsGraph(sidecarAudioTrackId, effectsGraphDef, routingPath);
  }

  removeSidecarAudioEffectsGraphs(sidecarAudioTrackId: string, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    return this._videoController.removeSidecarAudioEffectsGraphs(sidecarAudioTrackId, routingPath);
  }

  setSidecarAudioEffectsParams(
    sidecarAudioTrackId: string,
    param: OmpAudioEffectParam,
    filter?: {
      routingPath?: Partial<OmpAudioRoutingPath>;
    } & OmpAudioEffectFilter
  ): Observable<void> {
    return this._videoController.setSidecarAudioEffectsParams(sidecarAudioTrackId, param, filter);
  }

  createSidecarAudioPeakProcessor(sidecarAudioTrackId: string, audioMeterStandard?: AudioMeterStandard): Observable<Observable<AudioPeakProcessorMessageEvent>> {
    // we have to re-map event stream to this controller
    return this._videoController
      .createSidecarAudioPeakProcessor(sidecarAudioTrackId, audioMeterStandard)
      .pipe(map((p) => this.onSidecarAudioPeakProcessorMessage$.pipe(filter((p) => p.sidecarAudioTrackId === sidecarAudioTrackId))));
  }

  exportMainAudioTrackToSidecar(mainAudioTrackId: string): Observable<OmpAudioTrack> {
    return this._videoController.exportMainAudioTrackToSidecar(mainAudioTrackId);
  }

  exportMainAudioTracksToSidecar(mainAudioTrackIds: string[]): Observable<OmpAudioTrack[]> {
    return this._videoController.exportMainAudioTracksToSidecar(mainAudioTrackIds);
  }

  getThumbnailVttUrl(): string | undefined {
    return this._videoController.getThumbnailVttUrl();
  }

  loadThumbnailVttUrl(thumbnailVttUrl: string): Observable<void> {
    return this._videoController.loadThumbnailVttUrl(thumbnailVttUrl);
  }

  isPiPSupported(): boolean {
    return this._videoController.isPiPSupported();
  }

  enablePiP(): Observable<void> {
    return this._videoController.enablePiP();
  }

  disablePiP(): Observable<void> {
    return this._videoController.disablePiP();
  }

  getConfig(): VideoControllerConfig {
    return this._videoController.getConfig();
  }

  getHls(): Hls | undefined {
    return this._videoController.getHls();
  }

  updateActiveNamedEventStreams(eventNames: OmpNamedEventEventName[]): Observable<void> {
    return this._videoController.updateActiveNamedEventStreams(eventNames);
  }

  getActiveNamedEventStreams(): OmpNamedEventEventName[] {
    return this._videoController.getActiveNamedEventStreams();
  }

  loadBlackVideo(): Observable<Video> {
    return this._videoController.loadBlackVideo();
  }

  toggleMainAudioRouterSolo(routingPath: OmpAudioRoutingInputType): Observable<void> {
    return this._videoController.toggleMainAudioRouterSolo(routingPath);
  }

  toggleMainAudioRouterMute(routingPath: OmpAudioRoutingInputType): Observable<void> {
    return this._videoController.toggleMainAudioRouterMute(routingPath);
  }

  toggleSidecarAudioRouterSolo(sidecarAudioTrackId: string, routingPath: OmpAudioRoutingInputType): Observable<void> {
    return this._videoController.toggleSidecarAudioRouterSolo(sidecarAudioTrackId, routingPath);
  }

  toggleSidecarAudioRouterMute(sidecarAudioTrackId: string, routingPath: OmpAudioRoutingInputType): Observable<void> {
    return this._videoController.toggleSidecarAudioRouterMute(sidecarAudioTrackId, routingPath);
  }
}
