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

import {combineLatest, filter, Observable, take, takeUntil, tap} from 'rxjs';
import type {PlayerDetachedApi, PlayerTextInternalApi} from '../../player';
import {type PlayerAudioInternalApi, type PlayerEvent} from '../../player';
import {type MainMedia, MainMediaEventType, type MainMediaState} from '../../media';
import {MediaTemporalConverter, MediaTemporalFormat, type MediaTemporalFormatValueMap} from '../../common';
import {Validators} from '../../common/validators';
import type {Destroyable} from '../../common/capabilities';
import {MainMediaRepository, MainMediaRepositoryEventType} from '../../repository';
import {ObserverBreaker} from '../../common/observer-breaker';
import {type PlayerSession, SessionStore} from '../../session';
import {PlayerAudioInternalProxy} from './player-audio-internal-proxy';
import {type PlayerDetachedMessageChannel} from './player-detached-message-channel';
import {BaseMessageChannelProxy} from '../message-channel-proxy';
import type {Track} from 'hls.js';
import {PlayerTextInternalProxy} from './player-text-internal-proxy';
import type {RemoteNode} from '../remote-node';
import type {OmpProvider} from '../../omp-provider';
import type {VideoKeyframe, VideoKeyframeOptions} from '../../tools/keyframe-extractor';

const longTimeout = 10 * 60000;

export class PlayerDetachedProxy extends BaseMessageChannelProxy<PlayerDetachedMessageChannel> implements PlayerDetachedApi, Destroyable {
  private readonly _playerAudioInternal: PlayerAudioInternalProxy;
  private readonly _playerTextInternal: PlayerTextInternalProxy;

  protected _mainMedia: MainMedia | undefined;
  protected _mediaTemporalConverter: MediaTemporalConverter | undefined;

  protected _sessionStore: SessionStore;
  protected _mainMediaRepository: MainMediaRepository;

  protected _remoteNode: RemoteNode;

  protected _utilsBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  constructor(remoteNode: RemoteNode, ompProvider: OmpProvider) {
    super(remoteNode.getRemoteChannelOrFail('PlayerDetached'));

    this._sessionStore = ompProvider.sessionStore;
    this._mainMediaRepository = ompProvider.mainMediaRepository;
    this._remoteNode = remoteNode;

    this._playerAudioInternal = remoteNode.getProxyByName('PlayerAudioInternal');
    this._playerTextInternal = remoteNode.getProxyByName('PlayerTextInternal');

    this._mainMediaRepository.onEvent$
      .pipe(filter((p) => p.type === MainMediaRepositoryEventType.MAIN_MEDIA_DELETED))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: (event) => {
          this.unloadMainMedia();
        },
      });

    combineLatest([this._playerAudioInternal.onInitialized$.pipe(filter((p) => p)), this._playerTextInternal.onInitialized$.pipe(filter((p) => p))])
      .pipe(take(1))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this._onInitialized$.next(true);
      });
  }

  get onEvent$(): Observable<PlayerEvent> {
    return this.messageChannel.listen('onEvent$');
  }

  unloadMainMedia(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('unloadMainMedia').pipe(
      tap(() => {
        this._utilsBreaker.break();
        this._mainMedia = void 0;
        this._mediaTemporalConverter = void 0;
      })
    );
  }

  loadMainMedia(mainMediaId: MainMedia['id']): Observable<MainMediaState> {
    return this.messageChannel
      .sendAndWaitForResponse('loadMainMedia', [mainMediaId], {
        timeout: longTimeout,
      })
      .pipe(
        tap((mainMediaState) => {
          this.initUtils(mainMediaState.id);
        })
      );
  }

  loadSidecarTrack(trackId: Track['id']): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('loadSidecarTrack', [trackId], {
      timeout: longTimeout,
    });
  }

  removeSidecarTrack(trackId: Track['id']): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeSidecarTrack', [trackId]);
  }

  removeAllSidecarTracks(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('removeAllSidecarTracks');
  }

  restorePlayerSession(playerSession: PlayerSession): Observable<void> {
    return this.messageChannel
      .sendAndWaitForResponse('restorePlayerSession', [playerSession], {
        timeout: longTimeout,
      })
      .pipe(
        tap(() => {
          this.initUtils(playerSession.mainMediaId!);
        })
      );
  }

  protected initUtils(mainMediaId: MainMediaState['id']) {
    this._utilsBreaker.break();

    this._mainMedia = this._mainMediaRepository.getOrFail(mainMediaId);
    this._mediaTemporalConverter = MediaTemporalConverter.create({
      duration: this._mainMedia.duration,
      frameRateModel: this._mainMedia.frameRateModel,
      ffomTimecodeModel: this._mainMedia.ffomTimecodeModel,
      initSegmentTimeOffset: this._mainMedia.initSegmentTimeOffset,
    });

    this._mainMedia.onEvent$
      .pipe(filter((p) => p.type === MainMediaEventType.MAIN_MEDIA_UPDATED))
      .pipe(takeUntil(this._utilsBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this._mainMedia = this._mainMediaRepository.getOrFail(mainMediaId);
        this._mediaTemporalConverter = MediaTemporalConverter.create({
          duration: this._mainMedia.duration,
          frameRateModel: this._mainMedia.frameRateModel,
          ffomTimecodeModel: this._mainMedia.ffomTimecodeModel,
          initSegmentTimeOffset: this._mainMedia.initSegmentTimeOffset,
        });
      });
  }

  play(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('play');
  }

  pause(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('pause');
  }

  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('seekTo', [value, format]);
  }

  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    return this.messageChannel.sendAndWaitForResponse('seekFromCurrentTime', [value, format]);
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('setPlaybackRate', [playbackRate]);
  }

  toggleFullScreen(): Observable<void> {
    return this.messageChannel.sendAndWaitForResponse('toggleFullScreen');
  }

  getCurrentTime(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getCurrentTime<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getCurrentTime(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    format = Validators.mediaTemporalFormat()(format);
    this.checkIsMediaLoaded();
    let seconds = this._sessionStore.state.player.playback.currentTime;
    return this._mediaTemporalConverter!.convert(seconds, MediaTemporalFormat.SECONDS, format);
  }

  getDuration(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getDuration<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getDuration(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    format = Validators.mediaTemporalFormat()(format);
    this.checkIsMediaLoaded();
    let seconds = this._mainMedia!.duration!;
    return this._mediaTemporalConverter!.convert(seconds, MediaTemporalFormat.SECONDS, format);
  }

  convertTime<S extends MediaTemporalFormat, D extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[S], valueFormat: S, destinationFormat: D): MediaTemporalFormatValueMap[D];
  convertTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], valueFormat: MediaTemporalFormat, destinationFormat: MediaTemporalFormat): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    return this._mediaTemporalConverter!.convert(value, valueFormat, destinationFormat);
  }

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe> {
    return this.messageChannel.sendAndWaitForResponse('extractVideoKeyframe', [options]);
  }

  protected checkIsMediaLoaded(): void {
    if (!this.isMainMediaLoaded) {
      throw new Error(`Main media not loaded`);
    }
  }

  get isMainMediaLoaded(): boolean {
    return !!this.playerSession.mainMediaId;
  }

  get playerSession(): PlayerSession {
    return this._sessionStore.state.player;
  }

  get audioInternal(): PlayerAudioInternalApi {
    return this._playerAudioInternal;
  }

  get textInternal(): PlayerTextInternalApi {
    return this._playerTextInternal;
  }

  destroy() {
    this._destroyBreaker.destroy();
    this._utilsBreaker.destroy();
  }
}
