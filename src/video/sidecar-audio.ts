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

import {Destroyable, OmpAudioTrack, SyncTickEvent, VideoPlayEvent, VideoSeekedEvent, VideoSeekingEvent} from '../types';
import {filter, Observable, Subject, takeUntil} from 'rxjs';
import {OmpAudioRouter} from './audio-router';
import {VideoController} from './video-controller';
import {completeUnsubscribeSubjects, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {isNullOrUndefined} from '../util/object-util';
import {SidecarAudioApi} from '../api/sidecar-audio-api';
import {AudioRouterApi} from '../api/audio-router-api';
import {OmpAudioPeakProcessor} from './audio-peak-processor';
import {AudioMeterStandard, OmpSidecarAudioState, PlaybackState} from './model';

export class OmpSidecarAudio implements SidecarAudioApi, Destroyable {
  public readonly onStateChange$: Subject<OmpSidecarAudioState> = new Subject<OmpSidecarAudioState>();

  protected _videoController: VideoController;

  protected _audioTrack: OmpAudioTrack;
  protected _audioBuffer: AudioBuffer;
  protected _eventBreaker: Subject<void>;

  protected _audioBufferSourceNode?: AudioBufferSourceNode;
  protected _audioInterfaceNode: GainNode;
  protected _audioRouter?: OmpAudioRouter;
  protected _audioPeakProcessor?: OmpAudioPeakProcessor;

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

    let audioContext = this._videoController.getAudioContext()!;
    this._audioInterfaceNode = audioContext.createGain();
    this._audioInterfaceNode.channelCountMode = 'max';
    this._audioInterfaceNode.channelCount = this._audioBuffer.numberOfChannels;

    // initially connect to destination
    this._audioInterfaceNode.connect(audioContext.destination);

    this.setupPlayback();
  }

  protected _emitChange() {
    this.onStateChange$.next(this.getSidecarAudioState());
  }

  createAudioRouter(inputsNumber?: number, outputsNumber?: number): OmpAudioRouter {
    let audioContext = this._videoController.getAudioContext()!;
    if (this._audioRouter) {
      console.debug(`Sidecar audio router already created for ${this.audioTrack.id}`);
      return this._audioRouter;
    } else {
      if (isNullOrUndefined(inputsNumber)) {
        inputsNumber = this._audioBuffer.numberOfChannels;
      }

      if (isNullOrUndefined(outputsNumber)) {
        this._audioRouter = new OmpAudioRouter(audioContext, inputsNumber!);
      } else {
        this._audioRouter = new OmpAudioRouter(audioContext, inputsNumber!, (maxChannelCount: number) => outputsNumber!);
      }

      // rewire to router
      // in case of router deletion, we'll have to re-wire it back to destination
      this._audioInterfaceNode.disconnect(audioContext.destination);

      this._audioInterfaceNode.channelCount = inputsNumber!;

      this._audioRouter.connectSource(this._audioInterfaceNode);

      this._emitChange();

      this._audioRouter.onChange$.pipe(takeUntil(this._eventBreaker), takeUntil(this._destroyed$)).subscribe((event) => {
        this._emitChange();
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
            this._audioPeakProcessor!.connectSource(this._audioInterfaceNode);

            this._emitChange();
            nextCompleteObserver(observer, this._audioPeakProcessor);
          },
        });
      }
    });
  }

  protected createSourceNode() {
    this._audioBufferSourceNode = this._videoController.getAudioContext().createBufferSource();
    this._audioBufferSourceNode.buffer = this._audioBuffer;

    // this._audioBufferSourceNode.channelCountMode = 'max';
    // this._audioBufferSourceNode.channelCount = this._audioBuffer.numberOfChannels;

    this._audioBufferSourceNode.connect(this._audioInterfaceNode);
  }

  protected audioPlay(driftOffset = 0) {
    this.stopSourceNode();
    this.createSourceNode();

    this._audioStartTime = this._videoController.getAudioContext().currentTime;
    this._audioOffset = this._videoController.getCurrentTime();

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

  protected setActiveInactive(value: boolean): void {
    this._audioTrack.active = value;
    this._emitChange();
  }

  getSidecarAudioState(): OmpSidecarAudioState {
    return {
      audioTrack: this._audioTrack,
      audioRouterState: this.audioRouter?.getAudioRouterState(),
      audioPeakProcessorState: this.audioPeakProcessor?.getAudioPeakProcessorState(),
      numberOfChannels: this._audioBuffer.numberOfChannels,
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

    this._audioInterfaceNode.disconnect();

    if (this._audioRouter) {
      this._audioRouter.destroy();
    }

    if (this._audioPeakProcessor) {
      this._audioPeakProcessor.destroy();
    }

    nextCompleteSubject(this._eventBreaker);

    completeUnsubscribeSubjects(this.onStateChange$);

    nextCompleteSubject(this._destroyed$);
  }
}
