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
import {BehaviorSubject, Observable, skip, Subject, takeUntil} from 'rxjs';
import {
  AudioContextChangeEvent,
  AudioLoadedEvent,
  AudioPeakProcessorWorkletNodeMessageEvent,
  AudioRoutingEvent,
  AudioSwitchedEvent,
  AudioWorkletNodeCreatedEvent,
  HelpMenuGroup,
  OmpNamedEvent,
  OmpNamedEvents,
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
import {AudioMeterStandard, PlaybackState, Video, VideoLoadOptions} from './index';
import {nextCompleteSubject} from '../util/rxjs-util';
import {VideoControllerConfig} from './video-controller';
import Hls from 'hls.js';
import {destroyer} from '../util/destroy-util';
import {AudioInputOutputNode, BufferedTimespan, VideoLoadOptionsInternal, VideoSafeZone, VideoWindowPlaybackState} from './model';

/**
 * Used for switching between {@link VideoControllerApi} instances
 */
export class SwitchableVideoController implements VideoControllerApi {
  public readonly onVideoLoaded$: BehaviorSubject<VideoLoadedEvent | undefined> = new BehaviorSubject<VideoLoadedEvent | undefined>(void 0);
  public readonly onVideoLoading$: Subject<VideoLoadingEvent> = new Subject<VideoLoadingEvent>();
  public readonly onPlay$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onPause$: Subject<VideoPlayEvent> = new Subject<VideoPlayEvent>();
  public readonly onVideoTimeChange$: Subject<VideoTimeChangeEvent> = new Subject<VideoTimeChangeEvent>();
  public readonly onSeeking$: Subject<VideoSeekingEvent> = new Subject<VideoSeekingEvent>();
  public readonly onSeeked$: Subject<VideoSeekedEvent> = new Subject<VideoSeekedEvent>();
  public readonly onBuffering$: Subject<VideoBufferingEvent> = new Subject<VideoBufferingEvent>();
  public readonly onEnded$: Subject<VideoEndedEvent> = new Subject<VideoEndedEvent>();
  public readonly onVideoError$: Subject<VideoErrorEvent> = new Subject<VideoErrorEvent>();
  public readonly onVolumeChange$: Subject<VideoVolumeEvent> = new Subject<VideoVolumeEvent>();
  public readonly onFullscreenChange$: Subject<VideoFullscreenChangeEvent> = new Subject<VideoFullscreenChangeEvent>();
  public readonly onVideoSafeZoneChange$: Subject<VideoSafeZoneChangeEvent> = new Subject<VideoSafeZoneChangeEvent>();
  public readonly onPlaybackRateChange$: Subject<VideoPlaybackRateEvent> = new Subject<VideoPlaybackRateEvent>();
  public readonly onVideoWindowPlaybackStateChange$: Subject<VideoWindowPlaybackStateChangeEvent> = new Subject<VideoWindowPlaybackStateChangeEvent>();

  public readonly onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined> = new BehaviorSubject<AudioLoadedEvent | undefined>(void 0);
  public readonly onAudioSwitched$: Subject<AudioSwitchedEvent> = new Subject<AudioSwitchedEvent>();
  public readonly onAudioContextChange$: Subject<AudioContextChangeEvent> = new Subject<AudioContextChangeEvent>();
  public readonly onAudioRouting$: Subject<AudioRoutingEvent> = new Subject<AudioRoutingEvent>();
  public readonly onAudioPeakProcessorWorkletNodeMessage$: Subject<AudioPeakProcessorWorkletNodeMessageEvent> = new Subject<AudioPeakProcessorWorkletNodeMessageEvent>();
  public readonly onAudioWorkletNodeCreated$: BehaviorSubject<AudioWorkletNodeCreatedEvent | undefined> = new BehaviorSubject<AudioWorkletNodeCreatedEvent | undefined>(void 0);

  public readonly onHelpMenuChange$: Subject<VideoHelpMenuChangeEvent> = new Subject<VideoHelpMenuChangeEvent>();
  public readonly onPlaybackState$: Subject<PlaybackState> = new Subject<PlaybackState>();
  public readonly onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined> = new BehaviorSubject<SubtitlesLoadedEvent | undefined>(void 0);
  public readonly onSubtitlesCreate$: Subject<SubtitlesCreateEvent> = new Subject<SubtitlesCreateEvent>();
  public readonly onSubtitlesHide$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onSubtitlesRemove$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onSubtitlesShow$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();

  public readonly onThumbnailVttUrlChanged$: Subject<ThumnbailVttUrlChangedEvent> = new Subject<ThumnbailVttUrlChangedEvent>();

  public readonly onActiveNamedEventStreamsChange$: Subject<OmpNamedEvents[]> = new Subject<OmpNamedEvents[]>();
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

    videoController.onAudioContextChange$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onAudioContextChange$.next(value);
      },
    });

    videoController.onAudioRouting$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onAudioRouting$.next(value);
      },
    });

    videoController.onAudioPeakProcessorWorkletNodeMessage$.pipe(takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onAudioPeakProcessorWorkletNodeMessage$.next(value);
      },
    });

    videoController.onAudioWorkletNodeCreated$.pipe(skip(0), takeUntil(this._eventBreaker$)).subscribe({
      next: (value) => {
        this.onAudioWorkletNodeCreated$.next(value);
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

  getActiveAudioTrack(): any {
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

  getAudioContext(): AudioContext | undefined {
    return this._videoController.getAudioContext();
  }

  getMediaElementAudioSourceNode(): MediaElementAudioSourceNode | undefined {
    return this._videoController.getMediaElementAudioSourceNode();
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

  loadVideoInternal(sourceUrl: string, frameRate: number | string, options: VideoLoadOptions | undefined, optionsInternal: VideoLoadOptionsInternal): Observable<Video> {
    return this._videoController.loadVideoInternal(sourceUrl, frameRate, options, optionsInternal);
  }

  dispatchVideoTimeChange(): void {
    return this._videoController.dispatchVideoTimeChange();
  }

  loadVideo(sourceUrl: string, frameRate: number | string, options?: VideoLoadOptions): Observable<Video> {
    return this._videoController.loadVideo(sourceUrl, frameRate, options);
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

  createSubtitlesVttTrack(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack | undefined> {
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

  createAudioContext(contextOptions?: AudioContextOptions): Observable<void> {
    return this._videoController.createAudioContext(contextOptions);
  }

  createAudioRouter(inputsNumber: number, outputsNumber?: number): Observable<void> {
    return this._videoController.createAudioRouter(inputsNumber, outputsNumber);
  }

  createAudioRouterWithOutputsResolver(inputsNumber: number, outputsNumberResolver: (maxChannelCount: number) => number): Observable<void> {
    return this._videoController.createAudioRouterWithOutputsResolver(inputsNumber, outputsNumberResolver);
  }

  getAudioInputOutputNodes(): AudioInputOutputNode[][] {
    return this._videoController.getAudioInputOutputNodes();
  }

  routeAudioInputOutputNode(newAudioInputOutputNode: AudioInputOutputNode): Observable<void> {
    return this._videoController.routeAudioInputOutputNode(newAudioInputOutputNode);
  }

  routeAudioInputOutputNodes(newAudioInputOutputNodes: AudioInputOutputNode[]): Observable<void> {
    return this._videoController.routeAudioInputOutputNodes(newAudioInputOutputNodes);
  }

  getAudioPeakProcessorWorkletNode(): AudioWorkletNode | undefined {
    return this._videoController.getAudioPeakProcessorWorkletNode();
  }

  createAudioPeakProcessorWorkletNode(audioMeterStandard: AudioMeterStandard): Observable<void> {
    return this._videoController.createAudioPeakProcessorWorkletNode(audioMeterStandard);
  }

  getThumbnailVttUrl(): string | undefined {
    return this._videoController.getThumbnailVttUrl();
  }

  loadThumbnailVttUrl(thumbnailVttUrl: string): Observable<void> {
    return this._videoController.loadThumbnailVttUrl(thumbnailVttUrl);
  }

  getHTMLAudioUtilElement(): HTMLAudioElement {
    return this._videoController.getHTMLAudioUtilElement();
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

  updateActiveNamedEventStreams(eventNames: OmpNamedEvents[]): Observable<void> {
    return this._videoController.updateActiveNamedEventStreams(eventNames);
  }

  getActiveNamedEventStreams(): OmpNamedEvents[] {
    return this._videoController.getActiveNamedEventStreams();
  }

  loadBlackVideo(): Observable<Video> {
    return this._videoController.loadBlackVideo()
  }
}
