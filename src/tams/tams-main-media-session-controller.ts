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

import {map, type Observable, of, Subject, type Subscription, throwError} from 'rxjs';
import {AuthConfig} from '../common';
import {type MainMediaLoadOptions, type MainMediaSessionController, type TamsMainMediaLoadOptions} from '../media';
import type {TrackRepository} from '../repository';
import type {TextTrackCueReaders} from '../track';
import {TamsTextTrackCueReaders} from './tams-text-track-cue-readers';
import {SourceUtil} from '../source';
import {OmpError} from '../types';
import {ManifestResourcesFetcher} from './hls-bridge/tams-resource-fetcher';
import {buildTamsManifest} from './hls-bridge/tams-manifest-builder';
import {TamsLiveManifestUpdater} from './hls-bridge/tams-live-manifest-updater';
import {TamsManifestRegistry} from './hls-bridge/tams-manifest-registry';
import {TamsThumbnailGenerator} from './hls-bridge/tams-thumbnail-generator';
import type {Manifest} from './hls-bridge/tams-adapter';
import type {TamsMediaData} from './hls-bridge/model/tams-media-data-model';
import type {TamsMainMedia, TamsMediaMetadata} from './tams-main-media';
import {resolveAbsoluteFlowStartSeconds, resolveFlowStartSeconds, resolveTamsFfom, resolveTamsMediaInfo, type TamsMediaInfo} from './tams-media-info';
import {isTamsLivePlayback, resolveTamsPlayback, TamsPlaybackMode, type TamsPlayback} from './tams-playback';
import type {TamsMainMediaSession, TamsMainMediaSessionState, TamsMainMediaSessionStateUpdate} from './tams-main-media-session';
import {TamsUtil} from './tams-util';
import {TimeRangeUtil} from './time-range-util';
import {validateTamsLoadOptions, validateTamsPayload} from './tams-validation';
import {StringUtil} from '../util/string-util';

/**
 * Controls TAMS media lifecycle. Has no bearing on the actual playback.
 */
export class TamsMainMediaSessionController implements MainMediaSessionController, TamsMainMediaSession {
  protected readonly _mainMedia: TamsMainMedia;
  protected readonly _textTrackCueReaders: TextTrackCueReaders;

  protected _liveManifestUpdater: TamsLiveManifestUpdater | undefined;
  protected _liveUpdatesSubscription: Subscription | undefined;
  protected _manifest: Manifest | undefined;
  protected _destroyed = false;

  protected _sessionState: TamsMainMediaSessionState | undefined;
  protected readonly _onSessionStateUpdated$ = new Subject<TamsMainMediaSessionStateUpdate>();

  /** Resolved with the manifest, and read by the readers whenever they map a segment. */
  protected _textCueTimeShifts: Record<string, number> = {};

  constructor(mainMedia: TamsMainMedia, trackRepository: TrackRepository) {
    this._mainMedia = mainMedia;
    this._textTrackCueReaders = new TamsTextTrackCueReaders({
      mainMedia: mainMedia,
      trackRepository: trackRepository,
      cueTimeShift: (playlistUrl) => this._textCueTimeShifts[playlistUrl],
    });
    this._textTrackCueReaders.start();
  }

  get onSessionStateUpdated$(): Observable<TamsMainMediaSessionStateUpdate> {
    return this._onSessionStateUpdated$.asObservable();
  }

  getSessionState(mainMediaId: string): Observable<TamsMainMediaSessionState | undefined> {
    return of(mainMediaId === this._mainMedia.id ? this._sessionState : void 0);
  }

  protected setSessionState(sessionState: TamsMainMediaSessionState): void {
    this._sessionState = sessionState;
    this._onSessionStateUpdated$.next({mainMediaId: this._mainMedia.id, sessionState: sessionState});
  }

  /**
   * Fetches the TAMS media, bridges it to HLS and publishes the result onto the media. Errors with an
   * {@link OmpError} describing what is wrong when the URL, the load options or the fetched payload
   * cannot produce playable media.
   */
  prepare(): Observable<void> {
    const url = SourceUtil.resolveUrlFromSource(this._mainMedia.source);
    const parsed = TamsUtil.extractApiEndpointAndId(url);
    if (!parsed) {
      return throwError(() => new OmpError(`Invalid TAMS URL: ${url}`));
    }
    const [endpoint] = parsed;

    const loadOptions = this._mainMedia.state.loadOptions as TamsMainMediaLoadOptions | undefined;
    const loadOptionsValidation = validateTamsLoadOptions(loadOptions);
    if (!loadOptionsValidation.valid) {
      return throwError(() => new OmpError(loadOptionsValidation.message ?? `Invalid TAMS load options`));
    }

    const auth = AuthConfig.authentication;
    const headers = auth ? TamsUtil.getHeadersFunction(auth) : undefined;

    const fetcher = new ManifestResourcesFetcher(endpoint, headers);
    const playback = resolveTamsPlayback(loadOptions);
    const durationOrTimeRange = playback.requestTimerange ?? playback.windowDuration;

    const additionalFlowUrls = loadOptions?.additionalFlowUrls ?? [];
    const resources$ =
      additionalFlowUrls.length > 0 ? fetcher.fetchManifestResourcesForMultipleFlows([url, ...additionalFlowUrls], durationOrTimeRange) : fetcher.fetchManifestResources(url, durationOrTimeRange);

    return resources$.pipe(
      map((tamsMediaData) => {
        const payloadValidation = validateTamsPayload(tamsMediaData);
        if (!payloadValidation.valid) {
          throw new OmpError(payloadValidation.message ?? `TAMS media cannot be played`);
        }

        // a live mode only means something while the store is still being written to
        if (playback.mode !== TamsPlaybackMode.VOD) {
          const streamCarrierFlows = TamsUtil.resolveStreamCarrierFlows([tamsMediaData.flow, ...(tamsMediaData.subflows ?? [])]);
          const anyIngesting = streamCarrierFlows.some((flow) => TamsUtil.isFlowIngesting(flow));

          if (!anyIngesting) {
            console.debug(`[tams] ${playback.mode} requested, but no stream carrier flow is ingesting - playing back as ${TamsPlaybackMode.VOD}`);
            playback.mode = TamsPlaybackMode.VOD;
          }
        }

        // continue where the last build left off, so the same segment keeps the same sequence number
        const mediaSequences = new Map<string, number>(Object.entries(this._sessionState?.mediaSequences ?? {}));

        const manifest = buildTamsManifest(tamsMediaData, playback, mediaSequences);
        const mediaInfo = resolveTamsMediaInfo(tamsMediaData);

        this._manifest = manifest;
        this._textCueTimeShifts = this.resolveTextCueTimeShifts(tamsMediaData, manifest, mediaInfo);
        this.publish(
          this.resolveMetadata(tamsMediaData, playback, mediaInfo),
          this.resolveSessionState(tamsMediaData, manifest, playback, mediaInfo, loadOptions, mediaSequences),
          tamsMediaData,
          loadOptions
        );

        // a load superseded mid-fetch must not leave a poller behind
        if (isTamsLivePlayback(playback) && !this._destroyed) {
          this.startLiveUpdates(new TamsLiveManifestUpdater({fetcher, manifest, tamsMediaData, playback, mediaSequences}));
        }
      })
    );
  }

  destroy(): void {
    this._destroyed = true;

    this._textTrackCueReaders.destroy();

    this._liveUpdatesSubscription?.unsubscribe();
    this._liveUpdatesSubscription = undefined;

    this._liveManifestUpdater?.destroy();
    this._liveManifestUpdater = undefined;

    this._sessionState = undefined;
    this._onSessionStateUpdated$.complete();
  }

  /**
   * Polls the flow head, republishing the playlists after every rewrite so the window playing the
   * media picks them up - which is the whole live path when that window is the detached one.
   */
  protected startLiveUpdates(liveManifestUpdater: TamsLiveManifestUpdater): void {
    this._liveManifestUpdater = liveManifestUpdater;

    this._liveUpdatesSubscription = liveManifestUpdater.onPlaylistsUpdated$.subscribe(() => {
      const tamsMetadata = this._mainMedia.tamsMetadata;
      const sessionState = this._sessionState;

      if (tamsMetadata && sessionState && !this._destroyed) {
        this.setSessionState({
          ...sessionState,
          manifests: this.resolveManifestSnapshot(),
          mediaSequences: Object.fromEntries(liveManifestUpdater.mediaSequences),
        });

        this._mainMedia.updateAttrs({
          tamsMetadata: {...tamsMetadata, timerange: liveManifestUpdater.loadedTimerange ?? tamsMetadata.timerange},
        });
      }
    });

    liveManifestUpdater.start();
  }

  protected publish(tamsMetadata: TamsMediaMetadata, sessionState: TamsMainMediaSessionState, tamsMediaData: TamsMediaData, loadOptions: TamsMainMediaLoadOptions | undefined): void {
    if (this._destroyed) {
      return;
    }

    this.setSessionState(sessionState);

    this._mainMedia.updateAttrs({
      tamsMetadata: tamsMetadata,
      ...(loadOptions?.returnTamsMediaData ? {tamsMediaData: this.resolveReturnedMediaData(tamsMediaData)} : {}),
    });
  }

  protected resolveMetadata(tamsMediaData: TamsMediaData & {timerange: string}, playback: TamsPlayback, mediaInfo: TamsMediaInfo | undefined): TamsMediaMetadata {
    return {
      timerange: tamsMediaData.timerange,
      mediaStartTime: mediaInfo?.mediaStartTime ?? 0,
      // a continuous window is asked for as a duration, so there is no requested range to report
      ...(playback.requestTimerange ? {requestedTimeRange: playback.requestTimerange} : {}),
      ...this.resolveRequestedTimeRange(playback, mediaInfo),
      playbackMode: playback.mode,
      ...(playback.windowDuration !== undefined ? {windowDuration: playback.windowDuration} : {}),
    };
  }

  protected resolveSessionState(
    tamsMediaData: TamsMediaData & {timerange: string},
    manifest: Manifest,
    playback: TamsPlayback,
    mediaInfo: TamsMediaInfo | undefined,
    loadOptions: TamsMainMediaLoadOptions | undefined,
    mediaSequences: Map<string, number>
  ): TamsMainMediaSessionState {
    const hlsLoadOptions = this.resolveHlsLoadOptions(playback, mediaInfo, loadOptions);
    const thumbnailVtt = this.resolveThumbnailVtt(tamsMediaData, mediaInfo);

    return {
      // videoUrls: mapToRecord(manifest.video ?? new Map<string, string>()),
      // audioUrls: mapToRecord(manifest.audio ?? new Map<string, string>()),
      // textUrls: mapToRecord(manifest.text ?? new Map<string, string>()),
      masterUrl: manifest.url,
      manifests: this.resolveManifestSnapshot(),
      mediaSequences: Object.fromEntries(mediaSequences),
      textTimestampShifts: this.resolveTextTimestampShifts(tamsMediaData, manifest, mediaInfo),
      ...(hlsLoadOptions ? {hlsLoadOptions: hlsLoadOptions} : {}),
      ...(thumbnailVtt ? {thumbnailVtt: thumbnailVtt} : {}),
    };
  }

  /**
   * The flows as loaded, with the virtual one dropped.
   *
   */
  protected resolveReturnedMediaData(tamsMediaData: TamsMediaData): TamsMediaData {
    if (tamsMediaData.flow.id !== TamsUtil.VIRTUAL_FLOW_ID) {
      return tamsMediaData;
    }

    const [primaryFlow, ...remainingFlows] = tamsMediaData.subflows ?? [];
    const flowsSegments = new Map(tamsMediaData.flowsSegments);
    flowsSegments.delete(TamsUtil.VIRTUAL_FLOW_ID);

    return primaryFlow ? {...tamsMediaData, flow: primaryFlow, subflows: remainingFlows, flowsSegments} : {...tamsMediaData, flowsSegments};
  }

  protected resolveRequestedTimeRange(playback: TamsPlayback, mediaInfo: TamsMediaInfo | undefined): Pick<TamsMediaMetadata, 'requestedTimeRangeStartTime' | 'requestedTimeRangeEndTime'> {
    if (!playback.requestTimerange || !mediaInfo) {
      return {};
    }

    const requested = TimeRangeUtil.parseTimeRange(playback.requestTimerange);
    const mediaStartTime = mediaInfo.mediaStartTime;

    return {
      ...(requested.start ? {requestedTimeRangeStartTime: TimeRangeUtil.timeMomentToSeconds(requested.start) - mediaStartTime} : {}),
      ...(requested.end ? {requestedTimeRangeEndTime: TimeRangeUtil.timeMomentToSeconds(requested.end) - mediaStartTime} : {}),
    };
  }

  /** What the fragment loader moves `LOCAL` by, so hls.js renders these cues on the media timeline. */
  protected resolveTextTimestampShifts(tamsMediaData: TamsMediaData, manifest: Manifest, mediaInfo: TamsMediaInfo | undefined): Record<string, number> {
    const mediaStartTime = mediaInfo?.mediaStartTime;
    if (mediaStartTime === undefined) {
      return {};
    }

    const shifts: Record<string, number> = {};

    for (const [flowId, playlistUrl] of manifest.text ?? []) {
      const flowStartTime = resolveFlowStartSeconds(tamsMediaData, flowId);
      if (flowStartTime !== undefined && flowStartTime !== mediaStartTime) {
        shifts[playlistUrl] = mediaStartTime - flowStartTime;
      }
    }

    return shifts;
  }

  /**
   *
   * IMPORTANT: we assume that vtts in TAMS are always in media time -> shift is based on when the stream carrier flow starts
   * not the requested segments from the stream carrier flow.
   */
  protected resolveTextCueTimeShifts(tamsMediaData: TamsMediaData, manifest: Manifest, mediaInfo: TamsMediaInfo | undefined): Record<string, number> {
    const mediaStartTime = mediaInfo?.mediaStartTime;
    const carrierStartTime = this.resolveCarrierFlowStartSeconds(tamsMediaData, manifest);

    if (mediaStartTime === undefined || carrierStartTime === undefined) {
      return {};
    }

    const shift = mediaStartTime - carrierStartTime;
    const shifts: Record<string, number> = {};

    for (const playlistUrl of manifest.text?.values() ?? []) {
      shifts[playlistUrl] = shift;
    }

    return shifts;
  }

  protected resolveCarrierFlowStartSeconds(tamsMediaData: TamsMediaData, manifest: Manifest): number | undefined {
    const carrierFlowIds = [...(manifest.video?.keys() ?? []), ...(manifest.audio?.keys() ?? [])];

    for (const flowId of carrierFlowIds) {
      const startTime = resolveAbsoluteFlowStartSeconds(tamsMediaData, flowId);
      if (startTime !== undefined) {
        return startTime;
      }
    }

    return undefined;
  }

  protected resolveManifestSnapshot(): Record<string, string> {
    const manifest = this._manifest;
    if (!manifest) {
      return {};
    }

    const urls = [manifest.url, ...(manifest.video?.values() ?? []), ...(manifest.audio?.values() ?? []), ...(manifest.text?.values() ?? [])];

    return urls.reduce<Record<string, string>>((snapshot, url) => {
      const content = TamsManifestRegistry.get(url);
      if (content !== undefined) {
        snapshot[url] = content;
      }
      return snapshot;
    }, {});
  }

  protected resolveThumbnailVtt(tamsMediaData: TamsMediaData, mediaInfo: TamsMediaInfo | undefined): string | undefined {
    if (!mediaInfo) {
      return undefined;
    }

    const flows = [tamsMediaData.flow, ...(tamsMediaData.subflows ?? [])];
    const imageFlow = TamsThumbnailGenerator.resolveLowestQualityImageFlow(flows);
    const segments = imageFlow ? tamsMediaData.flowsSegments.get(imageFlow.id) : undefined;
    if (!segments?.length) {
      return undefined;
    }

    return TamsThumbnailGenerator.generateThumbnailVtt(segments, mediaInfo.mediaEndTime, mediaInfo.mediaStartTime);
  }

  /**
   * Load options for the HLS controller, filled in from what the flows declare.
   */
  protected resolveHlsLoadOptions(playback: TamsPlayback, mediaInfo: TamsMediaInfo | undefined, loadOptions: TamsMainMediaLoadOptions | undefined): MainMediaLoadOptions | undefined {
    if (!loadOptions && !mediaInfo) {
      return loadOptions;
    }

    const hlsLoadOptions: TamsMainMediaLoadOptions = {...(loadOptions ?? {})};

    if (mediaInfo) {
      hlsLoadOptions.frameRate = loadOptions?.frameRate ?? mediaInfo.frameRate;
      hlsLoadOptions.dropFrame = loadOptions?.dropFrame ?? mediaInfo.dropFrame;

      const ffom = resolveTamsFfom(mediaInfo.mediaStartTime, hlsLoadOptions.frameRate, hlsLoadOptions.dropFrame, mediaInfo.hasVideo, loadOptions?.ffomTimeZoneOffset);
      if (ffom) {
        hlsLoadOptions.ffom = ffom;
      }
    }

    if (isTamsLivePlayback(playback)) {
      delete hlsLoadOptions.duration;
    }

    return hlsLoadOptions;
  }
}
