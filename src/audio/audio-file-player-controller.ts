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

import {first, forkJoin, fromEvent, Observable, Subject, take, takeUntil} from 'rxjs';

import {MediaMetadataResolver} from '../tools';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {type AudioTrackIdentifier, BasePlayerController, type PlayerControllerConfig, type TextTrackIdentifier} from '../player/player-controller';
import type {LoadMainMediaArgsType, PlayerDomController} from '../player';
import {AudioFile, type AudioState, type TextTrackState} from '../media';
import {OpStage, OpStageStatus} from '../common/op-stage';
import {FrameRateResolver} from '../common/frame-rate';
import {TimecodeConverter, type TimecodeModel} from '../common/timecode';
import {PLAYER_CONTROLLER_DEFAULTS} from '../constants';

export interface AudioFilePlayerControllerConfig extends PlayerControllerConfig {}

export class AudioFilePlayerController extends BasePlayerController<AudioFilePlayerControllerConfig> {
  private _audioTrack?: AudioFile;

  constructor(playerDomController: PlayerDomController, config?: AudioFilePlayerControllerConfig) {
    super(playerDomController, {
      ...(config || {}),
    });
  }

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    let url = args.url;
    let loadOptions = args.loadOptions;
    let frameRateModel = FrameRateResolver.FR_100;

    this._loadBreaker.break();
    const videoElement = this._playerDomController.mainMediaVideoElement;

    // clear video element
    videoElement.src = '';
    videoElement.load();

    return new Observable<boolean>((observer) => {

      let audioLoadedData$ = fromEvent(videoElement, 'loadeddata').pipe(takeUntil(this._loadBreaker.observer), first());

      fromEvent(videoElement, 'error')
        .pipe(takeUntil(this._loadBreaker.observer), take(1))
        .subscribe((error) => {
          errorCompleteObserver(observer, error);
          this._loadBreaker.break();
        });

      let mainMediaEssentialArgsHookCompleted$ = new Subject<void>();
      let tracksCreatedHookCompleted$ = new Subject<void>();

      let metadataFromResolver$ = MediaMetadataResolver.getMediaMetadata(args.url, ['firstAudioTrackChannelsNumber', 'firstAudioTrackAudioCodec']);

      // once both hooks are completed finish loading
      forkJoin([mainMediaEssentialArgsHookCompleted$, tracksCreatedHookCompleted$]).subscribe(() => {
        nextCompleteObserver(observer, true);
        this._loadBreaker.break();
      });

      forkJoin([audioLoadedData$, metadataFromResolver$])
        .pipe(takeUntil(this._loadBreaker.observer), take(1))
        .subscribe({
          next: ([_, metadata]) => {
            let ffomTimecodeModel: TimecodeModel | undefined;
            if (loadOptions?.ffom) {
              let timecodeConverter = TimecodeConverter.create({
                frameRateModel: frameRateModel,
                hasVideo: false,
                hasAudio: true,
              });
              try {
                ffomTimecodeModel = timecodeConverter.parseValueTextToTimecodeModel(loadOptions.ffom);
              } catch (e) {
                errorCompleteObserver(observer, e);
                return;
              }
            }

            args
              .mainMediaEssentialArgsHook({
                duration: videoElement.duration,
                frameRateModel: frameRateModel,
                ffomTimecodeModel: ffomTimecodeModel,
                hasVideo: false,
                hasAudio: true,
              })
              .subscribe(() => {
                nextCompleteObserver(mainMediaEssentialArgsHookCompleted$);
              });

            let audioTrack = new AudioFile({
              loadStage: OpStage.of(OpStageStatus.SUCCESS),
              url: args.url,
              duration: videoElement.duration,
              channels: metadata.firstAudioTrackChannelsNumber,
              audioCodec: metadata.firstAudioTrackAudioCodec,
              label: PLAYER_CONTROLLER_DEFAULTS.AUDIO.audioLabel,
            });
            this._audioTrack = audioTrack;

            args.tracksCreatedHook([audioTrack]).subscribe(() => {
              nextCompleteObserver(tracksCreatedHookCompleted$);
            });
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });

      // load new audio media
      videoElement.src = args.url;
      videoElement.load();
    })
  }

  resolveAudioTrackIdentifier(track: AudioState): AudioTrackIdentifier {
    return track.id;
  }

  isAudioTrackActive(track: AudioState): boolean {
    let audioFileTrackId = this._audioTrack?.id;
    return this.resolveAudioTrackIdentifier(track) === audioFileTrackId;
  }
  resolveActiveAudioTracks(tracks: AudioState[]): AudioState[] {
    return tracks.filter((p) => this.isAudioTrackActive(p));
  }
  switchAudioTrack(track: AudioState, activate: boolean): Observable<void> {
    let newActiveIdentifier = this.resolveAudioTrackIdentifier(track);
    console.debug(`Switch audio file audio track: ${newActiveIdentifier} => ${activate} not supported`);
    return passiveObservable((observer) => nextCompleteObserver(observer));
  }

  resolveTextTrackIdentifier(track: TextTrackState): TextTrackIdentifier {
    return void 0;
  }

  isTextTrackActive(track: TextTrackState): boolean {
    return false;
  }

  resolveActiveTextTracks(tracks: TextTrackState[]): TextTrackState[] {
    return [];
  }

  switchTextTrack(track: TextTrackState, activate: boolean): Observable<void> {
    let newActiveIdentifier = this.resolveTextTrackIdentifier(track);
    console.debug(`Switch audio file text track: ${newActiveIdentifier} => ${activate} not supported`);
    return passiveObservable((observer) => nextCompleteObserver(observer));
  }

  setTextTracksDisplayed(textTracksDisplayed: boolean): void {}

  get textTracksDisplayed(): boolean {
    return false;
  }
}
