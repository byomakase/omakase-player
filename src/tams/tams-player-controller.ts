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

import {map, type Observable, of, type Subscription, switchMap, takeUntil, tap, throwError} from 'rxjs';
import type {HlsConfig} from 'hls.js';
import {HlsPlayerController, type HlsPlayerControllerConfig} from '../hls';
import {type LiveTimelineAnchor, type LoadMainMediaArgsType, type PlayerDomController} from '../player';
import {ThumbnailTrack} from '../media';
import {FileFormatType} from '../common';
import {UrlSource} from '../source';
import {OmpError} from '../types';
import {BlobUtil} from '../util/blob-util';
import {TamsManifestLoader} from './tams-loader';
import {createTamsSubtitleLoader, TamsSubtitleShiftRegistry} from './tams-subtitle-loader';
import {TamsManifestRegistry} from './hls-bridge/tams-manifest-registry';
import type {TamsMainMediaSession, TamsMainMediaSessionState} from './tams-main-media-session';
import type {TamsMainMediaState, TamsMediaMetadata} from './tams-main-media';
import {TamsPlaybackMode} from './tams-playback';
import {TAMS_CONTAINER} from './constants';

/**
 * Plays TAMS media by bridging it to HLS.
 */
export class TamsPlayerController extends HlsPlayerController {
  protected _thumbnailVttTrackUrl: string | undefined;
  protected _sessionState: TamsMainMediaSessionState | undefined;
  protected _republishedPlaylistsSubscription: Subscription | undefined;

  constructor(playerDomController: PlayerDomController, config?: Partial<HlsPlayerControllerConfig>) {
    super(playerDomController, {
      ...(config ?? {}),
      hlsConfig: {
        ...(config?.hlsConfig ?? {}),
        // hls.js types pLoader with PlaylistLoaderContext; our loader uses the generic LoaderContext
        pLoader: TamsManifestLoader as NonNullable<HlsConfig['pLoader']>,
        fLoader: createTamsSubtitleLoader(config?.hlsConfig?.fLoader),
      },
    });
  }

  override loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    const mainMediaId = args.providedMainMedia?.id;
    if (!mainMediaId) {
      return throwError(() => new OmpError(`TAMS media cannot be played without its state`));
    }

    const session = this.resolveSession(args);
    if (!session) {
      return throwError(() => new OmpError(`TAMS media has no session - it was not prepared by a session controller`));
    }

    return this.resolveSessionState(session, mainMediaId).pipe(
      switchMap((sessionState) => {
        this._sessionState = sessionState;

        TamsSubtitleShiftRegistry.restore(sessionState.textTimestampShifts);

        this.revokeThumbnailVttTrackUrl();
        TamsManifestRegistry.restore(sessionState.manifests);
        this.trackRepublishedPlaylists(session);

        if (!sessionState.hlsLoadOptions) {
          delete args.loadOptions?.duration;
        } else {
          delete sessionState.hlsLoadOptions.duration;
        }

        return super.loadMainMedia({...args, url: sessionState.masterUrl, loadOptions: sessionState.hlsLoadOptions ?? args.loadOptions}).pipe(
          tap(() => this.applyLiveBufferConfig((args.providedMainMedia as TamsMainMediaState | undefined)?.tamsMetadata)),
          switchMap((loaded) => this.createThumbnailTrack(args, sessionState).pipe(map(() => loaded)))
        );
      })
    );
  }

  /**
   * The session carrying this media's playlists, the same either side of a detach: the session
   * controller when this window owns the media, a remote to the owning window when it does not.
   */
  protected resolveSession(args: LoadMainMediaArgsType): TamsMainMediaSession | undefined {
    const sessionController = args.mainMediaSessionController;
    return sessionController && 'getSessionState' in sessionController ? (sessionController as unknown as TamsMainMediaSession) : void 0;
  }

  /**
   * The playlists to play, from this window if it built them or from the window that did.
   *
   * They are held on the session rather than on the media state: a client can make no use of a
   * synthetic URL, and the playlist text behind it is the largest thing the media would carry.
   */
  protected resolveSessionState(session: TamsMainMediaSession, mainMediaId: string): Observable<TamsMainMediaSessionState> {
    return session.getSessionState(mainMediaId).pipe(
      map((sessionState) => {
        if (!sessionState) {
          throw new OmpError(`TAMS media has no resolved manifest in the window that owns it`);
        }
        return sessionState;
      })
    );
  }

  protected override alignLiveTimeline(): void {
    // no-op
  }

  protected override resolveTimelineOffset(liveTimelineAnchor: LiveTimelineAnchor | undefined): number | undefined {
    if (!liveTimelineAnchor) {
      return super.resolveTimelineOffset(liveTimelineAnchor);
    }

    const mediaPlaylist = this.resolveVideoMediaPlaylist();

    return (mediaPlaylist ? this.resolveAlignedTimelineOffset(liveTimelineAnchor, mediaPlaylist) : void 0) ?? super.resolveTimelineOffset(liveTimelineAnchor);
  }

  protected resolveVideoMediaPlaylist(): string | undefined {
    const sessionState = this._sessionState;
    const master = sessionState ? sessionState.manifests[sessionState.masterUrl] : void 0;
    if (!master) {
      return void 0;
    }

    const lines = master.split(/\r?\n/);
    const streamIndex = lines.findIndex((line) => line.startsWith('#EXT-X-STREAM-INF'));
    if (streamIndex < 0) {
      return void 0;
    }

    const uri = lines
      .slice(streamIndex + 1)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'));

    return uri ? sessionState!.manifests[uri] : void 0;
  }

  protected trackRepublishedPlaylists(session: TamsMainMediaSession): void {
    this._republishedPlaylistsSubscription?.unsubscribe();

    this._republishedPlaylistsSubscription = session.onSessionStateUpdated$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((update) => {
      this._sessionState = update.sessionState;
      TamsManifestRegistry.restore(update.sessionState.manifests);
      TamsSubtitleShiftRegistry.restore(update.sessionState.textTimestampShifts);
    });
  }

  protected createThumbnailTrack(args: LoadMainMediaArgsType, sessionState: TamsMainMediaSessionState): Observable<void> {
    if (!sessionState.thumbnailVtt) {
      return of(void 0);
    }

    this._thumbnailVttTrackUrl = BlobUtil.createBlobURL([sessionState.thumbnailVtt], {type: TAMS_CONTAINER.vtt});

    return args.tracksCreatedHook([
      new ThumbnailTrack({
        source: UrlSource.of(this._thumbnailVttTrackUrl),
        sourceFileFormatType: FileFormatType.VTT,
        label: 'TAMS thumbnails',
      }),
    ]);
  }

  protected revokeThumbnailVttTrackUrl(): void {
    if (this._thumbnailVttTrackUrl) {
      BlobUtil.revokeObjectURL(this._thumbnailVttTrackUrl);
      this._thumbnailVttTrackUrl = undefined;
    }
  }

  protected applyLiveBufferConfig(tamsMetadata: TamsMediaMetadata | undefined): void {
    if (tamsMetadata?.playbackMode !== TamsPlaybackMode.CONTINUOUS || !tamsMetadata.windowDuration || !this._hls) {
      return;
    }
    this._hls.config.backBufferLength = tamsMetadata.windowDuration;
  }

  override destroy() {
    this._republishedPlaylistsSubscription?.unsubscribe();
    this._republishedPlaylistsSubscription = undefined;
    this.revokeThumbnailVttTrackUrl();
    super.destroy();
  }
}
