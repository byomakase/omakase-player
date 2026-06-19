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
import {FrameRateResolver} from '../common/frame-rate';
import {Mp4Audio, type Mp4AudioState, Mp4Video} from './mp4-track';
import {TimecodeConverter} from '../common/timecode';
import {type LoadMainMediaArgsType, type PlayerDomController} from '../player';
import {type AudioTrackIdentifier, BasePlayerController, type PlayerControllerConfig, type TextTrackIdentifier} from '../player/player-controller';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import type {MediaMetadata} from '../tools/media-metadata-resolver';
import type {AudioState, TextTrackState} from '../media';
import {OpStage, OpStageStatus} from '../common/op-stage';
import {PLAYER_CONTROLLER_DEFAULTS} from '../constants';

export interface Mp4PlayerControllerConfig extends PlayerControllerConfig {}

export class Mp4PlayerController extends BasePlayerController<Mp4PlayerControllerConfig> {
  private _audioTrack?: Mp4Audio;

  constructor(playerDomController: PlayerDomController, config?: Mp4PlayerControllerConfig) {
    super(playerDomController, {
      ...(config || {}),
    });
  }

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    return new Observable<boolean>((observer) => {
      this._loadBreaker.break();
      const videoElement = this._playerDomController.mainMediaVideoElement;

      // clear video element
      videoElement.src = '';
      videoElement.load();

      let videoLoadedData$ = fromEvent(videoElement, 'loadeddata').pipe(takeUntil(this._loadBreaker.observer), first());
      fromEvent(videoElement, 'error')
        .pipe(takeUntil(this._loadBreaker.observer), take(1))
        .subscribe((error) => {
          this._loadBreaker.break();
          errorCompleteObserver(observer, error);
        });

      let mainMediaEssentialArgsHookCompleted$ = new Subject<void>();
      let tracksCreatedHookCompleted$ = new Subject<void>();
      let metadataNames: (keyof MediaMetadata)[] = ['firstVideoTrackInitSegmentTime', 'firstAudioTrackChannelsNumber', 'firstAudioTrackAudioCodec'];

      if (!args.loadOptions?.frameRate) {
        metadataNames.push('firstVideoTrackFrameRate');
      }

      let metadataFromResolver$ = MediaMetadataResolver.getMediaMetadata(args.url, metadataNames);

      // once both hooks are completed finish loading
      forkJoin([mainMediaEssentialArgsHookCompleted$, tracksCreatedHookCompleted$]).subscribe(() => {
        this._loadBreaker.break();
        nextCompleteObserver(observer, true);
      });

      // wait until video is loaded to complete both hooks
      forkJoin([videoLoadedData$, metadataFromResolver$])
        .pipe(takeUntil(this._loadBreaker.observer), take(1))
        .subscribe(([_, metadata]) => {
          if (!metadata.firstVideoTrackFrameRate && !args.loadOptions?.frameRate) {
            this._loadBreaker.break();
            errorCompleteObserver(observer, `Could not infer frame rate and none was provided`);
          }

          const frameRate = args.loadOptions?.frameRate ?? metadata.firstVideoTrackFrameRate!;
          const frameRateModel = FrameRateResolver.resolveFrameRateModel(frameRate, args.loadOptions?.dropFrame);

          let ffomTimecodeModel;
          if (args.loadOptions?.ffom) {
            let timecodeConverter = TimecodeConverter.create({
              frameRateModel: frameRateModel,
            });
            ffomTimecodeModel = timecodeConverter.parseValueTextToTimecodeModel(args.loadOptions.ffom);
          }

          args
            .mainMediaEssentialArgsHook({
              duration: videoElement.duration,
              frameRateModel: frameRateModel,
              initSegmentTimeOffset: metadata.firstVideoTrackInitSegmentTime,
              ffomTimecodeModel: ffomTimecodeModel,
            })
            .subscribe(() => {
              nextCompleteObserver(mainMediaEssentialArgsHookCompleted$);
            });

          const mp4VideoTrack = new Mp4Video({
            loadStage: OpStage.of(OpStageStatus.SUCCESS),
            duration: videoElement.duration,
            relations: [],
          });

          const mp4AudioTrack = new Mp4Audio({
            loadStage: OpStage.of(OpStageStatus.SUCCESS),
            url: args.url,
            duration: videoElement.duration,
            channels: metadata.firstAudioTrackChannelsNumber,
            audioCodec: metadata.firstAudioTrackAudioCodec,
            label: PLAYER_CONTROLLER_DEFAULTS.MP4.audioLabel,
          });
          this._audioTrack = mp4AudioTrack;

          args.tracksCreatedHook([mp4VideoTrack, mp4AudioTrack]).subscribe(() => {
            nextCompleteObserver(tracksCreatedHookCompleted$);
          });
        });

      // load new mp4 media
      videoElement.src = args.url;
      videoElement.load();
    });
  }

  resolveAudioTrackIdentifier(track: Mp4AudioState): AudioTrackIdentifier {
    return track.id;
  }

  isAudioTrackActive(track: Mp4AudioState): boolean {
    let mp4TrackId = this._audioTrack?.id;
    return this.resolveAudioTrackIdentifier(track) === mp4TrackId;
  }

  resolveActiveAudioTracks(tracks: Mp4AudioState[]): AudioState[] {
    return tracks.filter((p) => this.isAudioTrackActive(p));
  }
  switchAudioTrack(track: Mp4AudioState, activate: boolean): Observable<void> {
    let newActiveIdentifier = this.resolveAudioTrackIdentifier(track);
    console.debug(`Switch MP4 audio track: ${newActiveIdentifier} => ${activate} not supported`);
    return passiveObservable((observer) => nextCompleteObserver(observer));
  }

  resolveTextTrackIdentifier(track: TextTrackState): TextTrackIdentifier {
    return void 0;
  }

  isTextTrackActive(textTrackState: TextTrackState): boolean {
    return false;
  }

  resolveActiveTextTracks(textTrackStates: TextTrackState[]): TextTrackState[] {
    return [];
  }

  switchTextTrack(track: TextTrackState, activate: boolean): Observable<void> {
    let newActiveIdentifier = this.resolveTextTrackIdentifier(track);
    console.debug(`Switch MP4 text track: ${newActiveIdentifier} => ${activate} not supported`);
    return passiveObservable((observer) => nextCompleteObserver(observer));
  }

  setTextTracksDisplayed(textTracksDisplayed: boolean): void {}

  get textTracksDisplayed(): boolean {
    return false;
  }
}
