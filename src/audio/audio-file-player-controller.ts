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
import {MediaTemporalFormat, type MediaTemporalFormatValueMap} from '../common';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {type AudioTrackIdentifier, BasePlayerController, type PlayerControllerConfig, type TextTrackIdentifier} from '../player/player-controller';
import type {LoadMainMediaArgsType, PlayerDomController} from '../player';
import {OmpError} from '../types';
import {AudioFile, type AudioState, type TextTrackState} from '../media';
import {OpStage, OpStageStatus} from '../common/op-stage';

export interface AudioFilePlayerControllerConfig extends PlayerControllerConfig {}

export class AudioFilePlayerController extends BasePlayerController<AudioFilePlayerControllerConfig> {
  private _audioTrack?: AudioFile;

  constructor(playerDomController: PlayerDomController, config?: AudioFilePlayerControllerConfig) {
    super(playerDomController, {
      ...(config || {}),
    });
  }

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    this._loadBreaker.break();
    const videoElement = this._playerDomController.mainMediaVideoElement;
    const result$ = new Subject<boolean>();

    // clear video element
    videoElement.src = '';
    videoElement.load();

    let audioLoadedData$ = fromEvent(videoElement, 'loadeddata').pipe(takeUntil(this._loadBreaker.observer), first());

    fromEvent(videoElement, 'error')
      .pipe(takeUntil(this._loadBreaker.observer), take(1))
      .subscribe((error) => {
        result$.error(error);
        result$.complete();
        this._loadBreaker.break();
      });

    let mainMediaEssentialArgsHookCompleted$ = new Subject<void>();
    let tracksCreatedHookCompleted$ = new Subject<void>();

    let metadataFromResolver$ = MediaMetadataResolver.getMediaMetadata(args.url, ['firstAudioTrackChannelsNumber', 'firstAudioTrackAudioCodec']);

    // once both hooks are completed finish loading
    forkJoin([mainMediaEssentialArgsHookCompleted$, tracksCreatedHookCompleted$]).subscribe(() => {
      result$.next(true);
      result$.complete();
      this._loadBreaker.break();
    });

    forkJoin([audioLoadedData$, metadataFromResolver$])
      .pipe(takeUntil(this._loadBreaker.observer), take(1))
      .subscribe(([_, metadata]) => {
        args
          .mainMediaEssentialArgsHook({
            duration: videoElement.duration,
          })
          .subscribe(() => {
            mainMediaEssentialArgsHookCompleted$.next();
            mainMediaEssentialArgsHookCompleted$.complete();
          });

        let audioTrack = new AudioFile({
          loadStage: OpStage.of(OpStageStatus.SUCCESS),
          url: args.url,
          duration: videoElement.duration,
          channels: metadata.firstAudioTrackChannelsNumber,
          audioCodec: metadata.firstAudioTrackAudioCodec,
        });
        this._audioTrack = audioTrack;

        args.tracksCreatedHook([audioTrack]).subscribe(() => {
          nextCompleteObserver(tracksCreatedHookCompleted$);
        });
      });

    // load new audio media
    videoElement.src = args.url;
    videoElement.load();

    return result$;
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

  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format?: MediaTemporalFormat): Observable<boolean> {
    if (format === MediaTemporalFormat.FRAME_COUNT || format === MediaTemporalFormat.TIMECODE) {
      return passiveObservable((observer) => errorCompleteObserver(observer, 'Frame based seeking is not supported for audio'));
    }

    return super.seekTo(value, format);
  }

  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format?: MediaTemporalFormat): Observable<boolean> {
    if (format === MediaTemporalFormat.FRAME_COUNT || format === MediaTemporalFormat.TIMECODE) {
      return passiveObservable((observer) => errorCompleteObserver(observer, 'Frame based seeking is not supported for audio'));
    }

    return super.seekFromCurrentTime(value, format);
  }

  protected getTotalFrames(): number {
    throw new OmpError(`Audio main media does not have frames`);
  }

  getCurrentTime(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getCurrentTime<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getCurrentTime(format?: MediaTemporalFormat): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    if (format === MediaTemporalFormat.FRAME_COUNT || format === MediaTemporalFormat.TIMECODE) {
      throw new OmpError(`Can't return current time for audio main media in frame based temporal formats`);
    }

    if (format) {
      return super.getCurrentTime(format);
    }

    return super.getCurrentTime();
  }
}
