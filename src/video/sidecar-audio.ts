/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

import {Destroyable, OmpAudioTrack, VideoPlaybackRateEvent, VideoPlayEvent, VideoSeekedEvent, VideoSeekingEvent, VolumeChangeEvent} from '../types';
import {filter, Observable, Subject, takeUntil} from 'rxjs';
import {OmpAudioRouter} from './audio-router';
import {VideoController} from './video-controller';
import {completeUnsubscribeSubjects, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {isNullOrUndefined} from '../util/object-util';
import {SidecarAudioApi} from '../api/sidecar-audio-api';
import {AudioRouterApi} from '../api/audio-router-api';
import {OmpAudioPeakProcessor} from './audio-peak-processor';
import {AudioMeterStandard, OmpSidecarAudioInputSoloMuteState, OmpSidecarAudioState, PlaybackState} from './model';

export class OmpSidecarAudio implements SidecarAudioApi, Destroyable {
  public readonly onStateChange$: Subject<OmpSidecarAudioState> = new Subject<OmpSidecarAudioState>();
  public readonly onInputSoloMute$: Subject<OmpSidecarAudioInputSoloMuteState> = new Subject<OmpSidecarAudioInputSoloMuteState>();
  public readonly onVolumeChange$: Subject<VolumeChangeEvent> = new Subject<VolumeChangeEvent>();

  protected _videoController: VideoController;

  protected _audioTrack: OmpAudioTrack;
  protected _audioBuffer: AudioBuffer;
  protected _eventBreaker: Subject<void>;

  protected _audioBufferSourceNode?: AudioBufferSourceNode;
  protected _audioInputIfNode: GainNode;
  protected _audioRouter?: OmpAudioRouter;
  protected _audioPeakProcessor?: OmpAudioPeakProcessor;

  protected _muted = VideoController.videoMutedDefault;
  protected _volume = VideoController.videoVolumeDefault;

  protected _sidecarAudioPlaying = false;
  protected _audioStartTime?: number;
  protected _audioOffset?: number;

  protected _audioDriftHistory: number[] = [];

  protected _destroyed$ = new Subject<void>();

  constructor(videoController: VideoController, audioTrack: OmpAudioTrack, audioBuffer: AudioBuffer) {
    this._videoController = videoController;
    this._audioTrack = audioTrack;
    this._audioBuffer = audioBuffer;
    this._eventBreaker = new Subject<void>();

    let audioContext = this._videoController.getAudioContext();
    let audioOutputNode = this._videoController.getAudioOutputNode();

    this._audioInputIfNode = audioContext.createGain();
    this._audioInputIfNode.channelCountMode = 'max';
    this._audioInputIfNode.channelCount = this.getChannelCount();

    this._audioInputIfNode.connect(audioOutputNode);

    this.setupPlayback();
  }

  protected emitStateChange() {
    this.onStateChange$.next(this.getSidecarAudioState());
  }

  protected emitInputSoloMute() {
    this.onInputSoloMute$.next(this.getSidecarAudioInputSoloMuteState());
  }

  createAudioRouter(inputsNumber?: number, outputsNumber?: number): OmpAudioRouter {
    let audioContext = this._videoController.getAudioContext();
    let audioOutputNode = this._videoController.getAudioOutputNode();

    if (this._audioRouter) {
      this._audioRouter.resetInputsSoloMuteState();
      console.debug(`Sidecar audio router already created for ${this.audioTrack.id}`);
      return this._audioRouter;
    } else {
      if (isNullOrUndefined(inputsNumber)) {
        inputsNumber = this.getChannelCount();
      }

      if (isNullOrUndefined(outputsNumber)) {
        this._audioRouter = new OmpAudioRouter(audioContext, audioOutputNode, inputsNumber!);
      } else {
        this._audioRouter = new OmpAudioRouter(audioContext, audioOutputNode, inputsNumber!, (maxChannelCount: number) => outputsNumber!);
      }

      // rewire to router
      // in case of router deletion, we'll have to re-wire it back to destination
      this._audioInputIfNode.disconnect(audioOutputNode);

      this._audioInputIfNode.channelCount = inputsNumber!;

      this._audioRouter.connectSource(this._audioInputIfNode);

      this.emitStateChange();
      this.emitInputSoloMute();

      this._audioRouter.onChange$.pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$)).subscribe((event) => {
        this.emitStateChange();
      });

      this._audioRouter.onInputSoloMute$.pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$)).subscribe((event) => {
        this.emitInputSoloMute();
      });

      return this._audioRouter;
    }
  }

  createAudioPeakProcessor(audioMeterStandard?: AudioMeterStandard): Observable<OmpAudioPeakProcessor> {
    return passiveObservable((observer) => {
      if (this._audioPeakProcessor) {
        console.debug(`Sidecar audio peak processor already created for ${this.audioTrack.id}`);
        nextCompleteObserver(observer, this._audioPeakProcessor);
      } else {
        let audioContext = this._videoController.getAudioContext()!;
        this._audioPeakProcessor = new OmpAudioPeakProcessor(audioContext, audioMeterStandard);
        this._audioPeakProcessor.onAudioWorkletLoaded$.pipe(filter((p) => !!p)).subscribe({
          next: () => {
            this._audioPeakProcessor!.connectSource(this._audioInputIfNode);

            this.emitStateChange();
            nextCompleteObserver(observer, this._audioPeakProcessor);
          },
        });
      }
    });
  }

  protected createSourceNode() {
    this._audioBufferSourceNode = this._videoController.getAudioContext().createBufferSource();
    this._audioBufferSourceNode.buffer = this._audioBuffer;
    this._audioBufferSourceNode.connect(this._audioInputIfNode);
  }

  protected audioPlay(driftOffset = 0) {
    this.stopSourceNode();
    this.createSourceNode();

    this._audioStartTime = this._videoController.getAudioContext().currentTime;
    this._audioOffset = this._videoController.getCurrentTime();

    this._audioBufferSourceNode!.playbackRate.value = this._videoController.getPlaybackRate();
    this._audioBufferSourceNode!.start(this._audioStartTime, this._audioOffset + driftOffset);

    this._sidecarAudioPlaying = true;
  }

  protected audioStop() {
    this.stopSourceNode();
    this._sidecarAudioPlaying = false;
  }

  protected setupPlayback() {
    let createAttachedModeFilter = <T>() => {
      return filter<T>(() => this._videoController.getVideoWindowPlaybackState() === 'attached');
    };

    let createAudioTrackActiveFilter = <T>() => {
      return filter<T>(() => this._audioTrack.active);
    };

    this.onStateChange$
      .pipe(createAttachedModeFilter<OmpSidecarAudioState>())
      .pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          if (this._audioTrack.active) {
            if (this._videoController.isPlaying()) {
              if (!this._sidecarAudioPlaying) {
                this.audioPlay();
              }
            } else {
              if (this._sidecarAudioPlaying) {
                this.audioStop();
              }
            }
          } else {
            if (this._sidecarAudioPlaying) {
              this.audioStop();
            }
          }
        },
      });

    this._videoController.onVideoWindowPlaybackStateChange$
      .pipe(filter((p) => p.videoWindowPlaybackState === 'detaching' || p.videoWindowPlaybackState === 'attaching'))
      .pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.audioStop();
        },
      });

    this._videoController.onPlay$
      .pipe(createAttachedModeFilter<VideoPlayEvent>())
      .pipe(createAudioTrackActiveFilter<VideoPlayEvent>())
      .pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.audioPlay();
        },
      });

    this._videoController.onPause$
      .pipe(createAttachedModeFilter<VideoPlayEvent>())
      .pipe(createAudioTrackActiveFilter<VideoPlayEvent>())
      .pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          this.audioStop();
        },
      });

    this._videoController.onSeeking$
      .pipe(createAttachedModeFilter<VideoSeekingEvent>())
      .pipe(createAudioTrackActiveFilter<VideoSeekingEvent>())
      .pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          stop();
        },
      });

    this._videoController.onSeeked$
      .pipe(createAttachedModeFilter<VideoSeekedEvent>())
      .pipe(createAudioTrackActiveFilter<VideoSeekedEvent>())
      .pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$))
      .subscribe({
        next: (event) => {
          if (this._videoController.isPlaying()) {
            this.audioPlay();
          } else {
            this.audioStop();
          }
        },
      });

    this._videoController.onPlaybackState$
      .pipe(createAttachedModeFilter<PlaybackState>())
      .pipe(createAudioTrackActiveFilter<PlaybackState>())
      .pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$))
      .subscribe({
        next: (state: PlaybackState) => {
          if (state.playing && !state.waiting && !state.buffering && !state.ended && !state.seeking && !state.pausing) {
            if (!this._sidecarAudioPlaying) {
              this.audioPlay();
            }
          }

          if (state.waiting || state.buffering || state.ended) {
            this.audioStop();
          }
        },
      });

    this._videoController.onPlaybackRateChange$
      .pipe(createAttachedModeFilter<VideoPlaybackRateEvent>())
      .pipe(createAudioTrackActiveFilter<VideoPlaybackRateEvent>())
      .pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$))
      .subscribe({
        next: (event: VideoPlaybackRateEvent) => {
          if (this._sidecarAudioPlaying) {
            this.audioPlay();
          }
        },
      });

    // this._videoController.onSyncTick$
    //   // maybe reduced frequency?
    //   .pipe(createAttachedModeFilter<SyncTickEvent>())
    //   .pipe(createAudioTrackActiveFilter<SyncTickEvent>())
    //   .pipe(filter((p) => this._videoController.isPlaying()))
    //   .pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$))
    //   .subscribe({
    //     next: (event: SyncTickEvent) => {
    //       if (this._audioBufferSourceNode && this._audioStartTime && this._audioOffset) {
    //         const audioElapsedTime = this._videoController.getAudioContext().currentTime - this._audioStartTime;
    //         const videoCurrentTime = this._videoController.getCurrentTime();
    //         const audioCurrentTime = this._audioOffset + audioElapsedTime;
    //
    //         const drift = videoCurrentTime - audioCurrentTime;
    //
    //         // positive drift - video is in front of audio
    //         // negative drift - audio is in front of video
    //
    //         this._audioDriftHistory.push(drift);
    //         if (this._audioDriftHistory.length > 15) {
    //           this._audioDriftHistory.shift();
    //         }
    //         let average = this._audioDriftHistory.reduce((sum, val) => sum + val, 0) / this._audioDriftHistory.length;
    //         // console.log(average);
    //       }
    //     },
    //   });

    // initial track activation
    this.setActiveInactive(this._audioTrack.active);
  }

  correctAudioDrift() {
    let driftOffset = this._audioDriftHistory.reduce((sum, val) => sum + val, 0) / this._audioDriftHistory.length;
    this._correctAudioDrift(driftOffset);
  }

  protected _correctAudioDrift(driftOffset: number) {
    if (this._videoController.isPlaying()) {
      console.debug(`Correcting ${this.getSidecarAudioState().audioTrack.id} for drift: ${driftOffset}`);
      this.audioStop();
      this.audioPlay(driftOffset);
    }
  }

  protected stopSourceNode() {
    if (this._audioBufferSourceNode) {
      try {
        this._audioBufferSourceNode.stop();
      } catch (e) {
        console.debug(e);
      }

      try {
        this._audioBufferSourceNode.disconnect();
      } catch (e) {
        console.debug(e);
      }
    }

    this._audioDriftHistory = [];
  }

  get isActive(): boolean {
    return this._audioTrack.active;
  }

  activate() {
    this.setActiveInactive(true);
  }

  deactivate() {
    this.setActiveInactive(false);
  }

  getVolume(): number {
    return this._volume;
  }

  setVolume(volume: number): void {
    let oldVolume = this._volume;
    this._volume = volume;
    this._muted = false;
    this.updateAudioInputIfVolume();
    this.onVolumeChange$.next({
      oldVolume: oldVolume,
      volume: this.getVolume(),
      muted: this.isMuted(),
    });
    this.emitStateChange();
  }

  mute(): void {
    this.setMuted(true);
  }

  unmute() {
    this.setMuted(false);
  }

  isMuted(): boolean {
    return this._muted;
  }

  toggleMuteUnmute() {
    this.setMuted(!this._muted);
  }

  setMuted(muted: boolean = true): void {
    if (this._muted !== muted) {
      this._muted = muted;
      this.updateAudioInputIfVolume();
      this.onVolumeChange$.next({
        oldVolume: this.getVolume(),
        volume: this.getVolume(),
        muted: this.isMuted(),
      });
      this.emitStateChange();
    }
  }

  protected updateAudioInputIfVolume() {
    this._audioInputIfNode.gain.value = this._muted ? 0 : this._volume;
  }

  protected setActiveInactive(value: boolean): void {
    this._audioTrack.active = value;
    this.emitStateChange();
  }

  protected getChannelCount(): number {
    return this._audioTrack.channelCount ? this._audioTrack.channelCount : this._audioBuffer.numberOfChannels
  }

  getSidecarAudioState(): OmpSidecarAudioState {
    return {
      audioTrack: this._audioTrack,
      audioRouterState: this.audioRouter?.getAudioRouterState(),
      audioPeakProcessorState: this.audioPeakProcessor?.getAudioPeakProcessorState(),
      numberOfChannels: this.getChannelCount(),
      volume: this.getVolume(),
      muted: this.isMuted(),
    };
  }

  getSidecarAudioInputSoloMuteState(): OmpSidecarAudioInputSoloMuteState {
    return {
      audioTrack: this._audioTrack,
      audioRouterInputSoloMuteState: this.audioRouter?.getAudioRouterInputSoloMuteState(),
    };
  }

  get audioTrack(): OmpAudioTrack {
    return this._audioTrack;
  }

  get audioRouter(): AudioRouterApi | undefined {
    return this._audioRouter;
  }

  get audioPeakProcessor(): OmpAudioPeakProcessor | undefined {
    return this._audioPeakProcessor;
  }

  destroy(): void {
    this.stopSourceNode();

    this._audioInputIfNode.disconnect();

    if (this._audioRouter) {
      this._audioRouter.destroy();
    }

    if (this._audioPeakProcessor) {
      this._audioPeakProcessor.destroy();
    }

    nextCompleteSubject(this._eventBreaker);

    completeUnsubscribeSubjects(this.onStateChange$);
    completeUnsubscribeSubjects(this.onInputSoloMute$);
    completeUnsubscribeSubjects(this.onVolumeChange$);

    nextCompleteSubject(this._destroyed$);
  }
}
