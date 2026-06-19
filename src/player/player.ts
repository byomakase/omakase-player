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

import {COMMON_PLAYER_CONFIG_DEFAULT, type PlayerApi, type PlayerConfig, type PlayerDetachedApi, type PlayerInternalApi, type PlayerLocalApi} from './player-api';
import type {Destroyable} from '../common/capabilities';
import {catchError, filter, finalize, map, Observable, of, Subject, switchMap, takeUntil} from 'rxjs';
import {type PlayerEvent} from './player-event';
import {MainMediaRepository, MainMediaRepositoryEventType, TrackRepository, TrackRepositoryEventType} from '../repository';
import {ObserverBreaker} from '../common/observer-breaker';
import {errorCompleteObserver, freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {FileFormatType, MediaTemporalFormat, type MediaTemporalFormatValueMap, WindowPlaybackMode} from '../common';
import {type MainMedia, type MainMediaLoadOptions, MainMediaType, SlateProvider, SlateType, TimeReference, type Track, TrackType} from '../media';
import {PlayerLocal} from './player-local';
import {type MediaLoadRequest, type PlayerSession, SessionStore} from '../session';
import {type PlayerAudioApi} from './player-audio-api';
import {PlayerAudio} from './player-audio';
import type {ChromingInternalApi} from '../chroming';
import {UnsupportedMethodInDetachedError} from '../types';
import type {PlayerPlaybackEngineMapping} from './player-playback-engine';
import {type Source, SourceType, TrackSource, UrlSource} from '../source';
import {MediaFactory} from '../media/media-factory';
import {isString} from '../util/util-functions';
import {PlayerText} from './player-text';
import type {PlayerTextApi} from './player-text-api';
import {OpStageStatus} from '../common/op-stage';
import {Fullscreen} from '../common/fullscreen';
import type {BufferedTimeRange} from '../dom/dom-media-element';
import {AlertsManager} from '../session/alert';
import type {TrackLoadOptions, TrackLoadOptionsMap} from '../track';
import {TrackUtils} from '../track/track-utils';
import {type TimecodeModel} from '../common/timecode';
import {TextTrackUtil} from '../text/text-track-util';
import type {OmpProvider} from '../omp-provider';
import type {VideoKeyframe, VideoKeyframeOptions} from '../tools/keyframe-extractor';
import {extractErrorMessage} from '../util/error-util';

export const PLAYER_CONFIG_DEFAULT: PlayerConfig = {
  ...COMMON_PLAYER_CONFIG_DEFAULT,
};

export interface PlayerPlayback {
  playing: boolean;
  pausing: boolean;
  paused: boolean;
  waiting: boolean;
  seeking: boolean;
  buffering: boolean;
  ended: boolean;
  waitingSyncedMedia: boolean;

  currentTime: number;
  playbackRate: number;

  bufferedTimeRanges: BufferedTimeRange[];
}

export class Player implements PlayerApi, Destroyable {
  protected readonly _alertsManager: AlertsManager;
  protected readonly _onEvent$: Subject<PlayerEvent> = new Subject<PlayerEvent>();

  protected _config: PlayerConfig;

  protected _sessionStore: SessionStore;
  protected _mainMediaRepository: MainMediaRepository;
  protected _trackRepository: TrackRepository;
  protected _trackUtils: TrackUtils;
  protected _slateProvider: SlateProvider;

  private _playerLocal: PlayerLocalApi;
  private _playerDetached?: PlayerDetachedApi | undefined;

  protected _playerAudio: PlayerAudio;
  protected _playerText: PlayerText;

  protected _playerInternalSwitchBreaker = new ObserverBreaker();

  protected _destroyBreaker = new ObserverBreaker();

  constructor(ompProvider: OmpProvider, config?: Partial<PlayerConfig>) {
    this._alertsManager = ompProvider.alertsManager;
    this._sessionStore = ompProvider.sessionStore;
    this._mainMediaRepository = ompProvider.mainMediaRepository;
    this._trackRepository = ompProvider.trackRepository;
    this._trackUtils = ompProvider.trackUtils;
    this._slateProvider = ompProvider.slateProvider;

    this._config = {
      ...PLAYER_CONFIG_DEFAULT,
      ...config,
    };

    this._playerLocal = new PlayerLocal(ompProvider, this._config);
    this._playerAudio = new PlayerAudio(ompProvider, this._playerLocal);
    this._playerText = new PlayerText(ompProvider, this._playerLocal);

    this.wireLocal();

    this._mainMediaRepository.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type === MainMediaRepositoryEventType.MAIN_MEDIA_DELETED))
      .subscribe((event) => {
        if (this.getPlayerInternalOrFail().isMainMediaLoaded && event.data.mainMediaState.id === this._sessionStore.state.player?.mainMediaId) {
          this.unloadMainMedia();
        }
      });
  }

  setChromingInternal(chromingInternal: ChromingInternalApi): void {
    this._playerLocal.setChromingInternal(chromingInternal);
  }

  wireLocal() {
    this.wirePlayerInternal(this._playerLocal);
  }

  wireDetached(playerDetached: PlayerDetachedApi) {
    this._playerDetached = playerDetached;
    this.wirePlayerInternal(this._playerDetached);
  }

  protected wirePlayerInternal(playerInternal: PlayerInternalApi) {
    this._playerInternalSwitchBreaker.break();

    playerInternal.onEvent$
      .pipe(filter((p) => this.isAttached() || this.isDetached()))
      .pipe(takeUntil(this._playerInternalSwitchBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event: PlayerEvent) => {
        this._onEvent$.next(event);
      });

    this._playerAudio.wirePlayer(playerInternal);
    this._playerText.wirePlayer(playerInternal);
  }

  protected isAttached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED;
  }

  protected isAttaching(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.ATTACHING;
  }

  protected isDetached(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
  }

  protected isDetaching(): boolean {
    return this._sessionStore.state.windowPlayback.mode === WindowPlaybackMode.DETACHING;
  }

  get playerLocal(): PlayerLocalApi {
    return this._playerLocal;
  }

  get playerDetached(): PlayerDetachedApi | undefined {
    return this._playerDetached;
  }

  protected getPlayerInternalOrFail(): PlayerInternalApi {
    if (this.isAttached()) {
      return this._playerLocal;
    } else if (this.isDetached()) {
      return this._playerDetached!;
    } else {
      throw new Error(`Player is in unstable window playback mode: ${this._sessionStore.state.windowPlayback.mode}`);
    }
  }

  clearPlayerSession(): void {
    this._playerLocal.clearPlayerSession();
  }

  getCurrentTime(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getCurrentTime<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getCurrentTime(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    return this.getPlayerInternalOrFail().getCurrentTime(format);
  }

  getDuration(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  getDuration<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  getDuration(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    return this.getPlayerInternalOrFail().getDuration(format);
  }

  get isMainMediaLoaded(): boolean {
    return this.getPlayerInternalOrFail().isMainMediaLoaded;
  }

  loadMainMedia(url: string, loadOptions?: MainMediaLoadOptions | undefined): Observable<MainMedia> {
    this.checkIsStableWindowPlayback();
    return passiveObservable((observer) => {
      let mediaLoadRequest = this._sessionStore.createMediaLoadRequest();

      this.unloadMainMedia()
        .pipe(
          switchMap(() => MediaFactory.createMainMedia(UrlSource.of(url), loadOptions)),
          switchMap((mainMedia) => {
            mediaLoadRequest.mediaId = mainMedia.id;
            return this._loadMainMedia(mainMedia).pipe(map(() => mainMedia));
          }),
          finalize(() => this._sessionStore.removeMediaLoadRequest(mediaLoadRequest))
        )
        .subscribe({
          next: (mainMedia) => nextCompleteObserver(observer, mainMedia),
          error: (err) => {
            this._alertsManager.error(extractErrorMessage(err));
            errorCompleteObserver(observer, err);
          },
        });
    });
  }

  protected _loadMainMedia(mainMedia: MainMedia): Observable<MainMedia> {
    this._mainMediaRepository.add(mainMedia);
    return this.isAttached() ? this._playerLocal.loadMainMedia(mainMedia.id) : this._playerDetached!.loadMainMedia(mainMedia.id).pipe(map((p) => mainMedia));
  }

  protected checkIsMediaLoaded(): void {
    if (!this.isMainMediaLoaded) {
      throw new Error(`Main media not loaded`);
    }
  }

  protected checkIsStableWindowPlayback() {
    if (!(this.isAttached() || this.isDetached())) {
      throw new Error(`Window playback is not stable, windowPlaybackMode=${this._sessionStore.state.windowPlayback.mode}`);
    }
  }

  loadSidecarTrack(source: Source, loadOptions?: TrackLoadOptions | undefined): Observable<Track>;
  loadSidecarTrack(url: string, loadOptions?: TrackLoadOptions | undefined): Observable<Track>;
  loadSidecarTrack(sourceOrUrl: Source | string, loadOptions?: TrackLoadOptions | undefined): Observable<Track> {
    return passiveObservable((observer) => {
      this.checkIsStableWindowPlayback();
      this.checkIsMediaLoaded();

      const mediaLoadRequest: MediaLoadRequest = this._sessionStore.createMediaLoadRequest();

      let createTrack = (source: UrlSource): Observable<Track> => {
        return MediaFactory.createSidecarTrack(source, loadOptions).pipe(
          map((track) => {
            const addedTrack = this._trackRepository.add(track);
            mediaLoadRequest.mediaId = addedTrack.id;
            return addedTrack;
          })
        );
      };

      let track$: Observable<Track>;
      if (isString(sourceOrUrl)) {
        track$ = createTrack(new UrlSource(sourceOrUrl));
      } else if (sourceOrUrl.type === SourceType.URL) {
        track$ = createTrack(sourceOrUrl as UrlSource);
      } else if (sourceOrUrl.type === SourceType.TRACK) {
        const existingTrack = this._trackRepository.getOrFail((sourceOrUrl as TrackSource).trackId);
        mediaLoadRequest.mediaId = existingTrack.id;
        track$ = of(existingTrack);
      } else {
        throw new Error(`Error loading sidecar track`);
      }

      track$
        .pipe(
          switchMap((track) => {
            switch (track.trackType) {
              case TrackType.TEXT_TRACK:
                let textTrackLoadOptions = loadOptions as TrackLoadOptionsMap[TrackType.TEXT_TRACK];
                let slewOptions = TextTrackUtil.resolveSlewOptions(this.resolveTimeReference(textTrackLoadOptions?.timeReference), this.getFfomTimecodeModel());
                let outputFormat = TextTrackUtil.isUnplayableTextTrackFileFormatType(track.sourceFileFormatType)
                  ? textTrackLoadOptions?.fallbackFormat
                    ? TextTrackUtil.resolveOutputFormat(textTrackLoadOptions.fallbackFormat)
                    : FileFormatType.TTML
                  : void 0;

                if (!slewOptions && !outputFormat) {
                  return of(track);
                }
                return this._trackUtils
                  .convertTextTrack(TrackSource.of(track.id), {
                    label: track.label,
                    outputFormat,
                    slewOptions,
                  })
                  .pipe(
                    map((track) => {
                      mediaLoadRequest.mediaId = track.id;
                      return track;
                    })
                  );
              default:
                return of(track);
            }
          })
        )
        .pipe(
          switchMap((track) => {
            if (track.loadStage.status === OpStageStatus.NOT_STARTED) {
              track.loadStart();
              track.loadSuccess();
            }
            if (track.loadStage.status !== OpStageStatus.SUCCESS) {
              throw new Error(`Cannot load track as sidecar in load status: ${track.loadStage.status}`);
            }
            return this.getPlayerInternalOrFail()
              .loadSidecarTrack(track.id, loadOptions)
              .pipe(map(() => track));
          }),
          finalize(() => {
            this._sessionStore.removeMediaLoadRequest(mediaLoadRequest);
          })
        )
        .subscribe({
          next: (track) => nextCompleteObserver(observer, track),
          error: (error) => {
            this._alertsManager.error(error);
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  protected resolveTimeReference(timeReference: TimeReference | undefined): TimeReference {
    if (timeReference) {
      return timeReference;
    } else if (this.getFfomTimecodeModel()) {
      return TimeReference.FFOM;
    }
    return TimeReference.SELF;
  }

  protected getFfomTimecodeModel(): TimecodeModel | undefined {
    return this.mainMedia?.ffomTimecodeModel;
  }

  loadSlate(slateType: SlateType): Observable<MainMedia> {
    this.checkIsStableWindowPlayback();
    return passiveObservable((observer) => {
      this.unloadMainMedia().subscribe(() => {
        let mainMedia = this._slateProvider.getMainMedia(slateType);
        this._loadMainMedia(mainMedia).subscribe({
          next: () => {
            nextCompleteObserver(observer, mainMedia);
          },
          error: (err) => {
            this._alertsManager.error(err);
            errorCompleteObserver(observer, err);
          },
        });
      });
    });
  }

  removeSidecarTrack(id: Track['id']): Observable<void> {
    return passiveObservable((observer) => {
      this.getPlayerInternalOrFail()
        .removeSidecarTrack(id)
        .subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
          error: (error) => {
            this._alertsManager.error(error);
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  removeAllSidecarTracks(): Observable<void> {
    return passiveObservable((observer) => {
      this.getPlayerInternalOrFail()
        .removeAllSidecarTracks()
        .subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
          error: (error) => {
            this._alertsManager.error(error);
            errorCompleteObserver(observer, error);
          },
        });
    });
  }

  restorePlayerSession(playerSession: PlayerSession): Observable<void> {
    return passiveObservable((observer) => {
      let playerInternal = this.isAttaching() ? this._playerLocal : this.isDetaching() ? this._playerDetached : void 0;

      if (!playerInternal) {
        throw new Error(`Player is not in correct window playback mode: ${this._sessionStore.state.windowPlayback.mode}`);
      }

      playerInternal.restorePlayerSession(playerSession).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        },
        error: (err) => {
          this._alertsManager.error(err);
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  pause(): Observable<void> {
    return this.getPlayerInternalOrFail().pause();
  }

  play(): Observable<void> {
    return this.getPlayerInternalOrFail().play();
  }

  seekTo(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    return this.getPlayerInternalOrFail().seekTo(value, format);
  }

  seekFromCurrentTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): Observable<boolean> {
    return this.getPlayerInternalOrFail().seekFromCurrentTime(value, format);
  }

  convertTime<S extends MediaTemporalFormat, D extends MediaTemporalFormat>(value: MediaTemporalFormatValueMap[S], valueFormat: S, destinationFormat: D): MediaTemporalFormatValueMap[D];
  convertTime(value: MediaTemporalFormatValueMap[MediaTemporalFormat], valueFormat: MediaTemporalFormat, destinationFormat: MediaTemporalFormat): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    return this.getPlayerInternalOrFail().convertTime(value, valueFormat, destinationFormat);
  }

  setPlaybackRate(playbackRate: number): Observable<void> {
    return this.getPlayerInternalOrFail().setPlaybackRate(playbackRate);
  }

  unloadMainMedia(): Observable<void> {
    return passiveObservable((observer) => {
      this.getPlayerInternalOrFail()
        .unloadMainMedia()
        .subscribe({
          next: () => {
            this._mainMediaRepository.clear();
            this._trackRepository.clear();
            nextCompleteObserver(observer);
          },
          error: (err) => {
            this._alertsManager.error(err);
            errorCompleteObserver(observer, err);
          },
        });
    });
  }

  getPlaybackEngine(mainMediaType: MainMediaType.HLS): PlayerPlaybackEngineMapping[MainMediaType.HLS];
  getPlaybackEngine(mainMediaType: MainMediaType.MP4): PlayerPlaybackEngineMapping[MainMediaType.MP4];
  getPlaybackEngine(mainMediaType: MainMediaType.AUDIO_FILE): PlayerPlaybackEngineMapping[MainMediaType.AUDIO_FILE];
  getPlaybackEngine(mainMediaType: MainMediaType): PlayerPlaybackEngineMapping[MainMediaType] | undefined {
    if (this.isAttached()) {
      return this._playerLocal.getPlaybackEngine(mainMediaType);
    } else if (this.isDetached()) {
      throw new UnsupportedMethodInDetachedError();
    }
  }

  toggleFullScreen(): Observable<void> {
    return this.getPlayerInternalOrFail().toggleFullScreen();
  }

  isFullScreen(): boolean {
    if (Fullscreen.isFullscreenEnabled()) {
      return Fullscreen.isFullscreen();
    }
    return false;
  }

  extractVideoKeyframe(options?: VideoKeyframeOptions): Observable<VideoKeyframe> {
    return passiveObservable((observer) => {
      this.checkIsMediaLoaded();

      this.getPlayerInternalOrFail()
        .extractVideoKeyframe(options)
        .subscribe({
          next: (videoKeyframe) => {
            nextCompleteObserver(observer, videoKeyframe);
          },
          error: (err) => {
            this._alertsManager.error(err);
            errorCompleteObserver(observer, err);
          },
        });
    });
  }

  get playerSession(): PlayerSession {
    return this.getPlayerInternalOrFail().playerSession;
  }

  get mainMedia(): MainMedia | undefined {
    let activePlayer = this.getPlayerInternalOrFail();
    return activePlayer.playerSession.mainMediaId ? this._mainMediaRepository.getOrFail(activePlayer.playerSession.mainMediaId) : void 0;
  }

  get htmlMediaElement(): HTMLMediaElement | undefined {
    if (this.isAttached()) {
      return this._playerLocal.htmlMediaElement;
    } else if (this.isDetached()) {
      throw new UnsupportedMethodInDetachedError();
    }
  }

  get onEvent$(): Observable<PlayerEvent> {
    return this._onEvent$.asObservable();
  }

  get audio(): PlayerAudioApi {
    return this._playerAudio;
  }

  get text(): PlayerTextApi {
    return this._playerText;
  }

  destroy(): void {
    this._destroyBreaker.destroy();
    this._playerInternalSwitchBreaker.destroy();

    this._playerLocal.destroy();
    this._playerDetached?.destroy();
    this._playerAudio.destroy();
    this._playerText.destroy();

    freeObserver(this._onEvent$);
  }
}
