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

import Hls, {ErrorDetails, ErrorTypes, Events as HlsEvents, type ErrorData, type FragParsedData, type HlsConfig, type InitPTSFoundData, type LevelLoadedData} from 'hls.js';
import {catchError, forkJoin, fromEvent, map, merge, Observable, of, ReplaySubject, switchMap, take, takeUntil, tap, throwError, timeout} from 'rxjs';
import {type BufferedTimeRange, DomVideoElement, HTMLMediaElementEvent} from '../dom/dom-media-element';
import {UrlSource} from '../source';
import {M3u8File} from '../m3u8/m3u8-file';
import {AuthConfig} from '../common/authentication';
import {ObserverBreaker} from '../common/observer-breaker';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import type {SidecarDomController} from './sidecar-track-controller';
import {MediaMetadataResolver} from '../tools/media-metadata-resolver';
import {StringUtil} from '../util/string-util';

export const SidecarVideoDomClasses = {
  video: 'omakase-sidecar-video',
};

/**
 * Owns sidecar video element and everything needed for its playback. Sidecar video element is mounted into host element.
 */
export interface SidecarVideoDomController extends SidecarDomController {
  videoElement: HTMLVideoElement;

  /** Buffered time ranges, in video element time. */
  bufferedTimeRanges: BufferedTimeRange[];

  /**
   * Video element time of sidecar time 0 - where the first video frame of attached source lands on video element timeline,
   * same as main media init segment time offset. Sidecar time is video element time minus time offset.
   * Resolved by {@link loadSource}, 0 until resolved.
   */
  timeOffset: number;

  /** Duration of attached source, in sidecar time, see {@link timeOffset}. */
  duration: number;

  /**
   * Sidecar video element visibility. Hidden element keeps its layout box, so it's not painted but keeps its size
   * (hls.js level capping relies on it) and becomes visible without re-layout.
   */
  visible: boolean;

  /**
   * Loads source into sidecar video element and resolves its {@link timeOffset}, completes when media data and metadata are loaded.
   *
   * @param url Source url
   * @param startTime Sidecar time loading should start from, so the first fetched data is the one that will be played. Defaults to 0.
   */
  loadSource(url: string | undefined, startTime?: number): Observable<void>;

  /**
   * Resolves source duration in sidecar time without loading media data, so no frame is decoded. Video element is left without source.
   * - MP4 - only metadata is loaded, and the first video frame time is read to resolve time offset
   * - HLS - only playlists are fetched, duration is sum of media playlist segment durations
   *
   * @param url Source url
   */
  loadDuration(url: string | undefined): Observable<number>;

  /**
   * Releases media resources - detaches source, so decoder, network and buffered data are freed. Element stays mounted with its layout box.
   * Source is attached again with {@link loadSource}.
   */
  release(): void;
}

export interface SidecarVideoDomControllerConfig {
  /** Element sidecar video element will be mounted into. */
  hostElement: HTMLElement;

  crossOrigin?: string | undefined;

  /** Whether sidecar video element is muted, defaults to `false`. */
  muted?: boolean | undefined;
}

const LOAD_TIMEOUT_MS = 20000;

/**
 * hls.js config for sidecar video, subtitles and captions are not needed as only video is played.
 * Sidecar plays only a short cut, so buffer is kept much smaller than for main media.
 */
const SIDECAR_HLS_CONFIG: Partial<HlsConfig> = {
  autoStartLoad: true,
  maxBufferLength: 10,
  maxMaxBufferLength: 20,
  backBufferLength: 5,
  capLevelToPlayerSize: true,
  enableWebVTT: false,
  enableIMSC1: false,
  enableCEA708Captions: false,
  renderTextTracksNatively: false,
};

export abstract class BaseSidecarVideoDomController implements SidecarVideoDomController {
  protected readonly _hostElement: HTMLElement;
  protected readonly _domVideoElement: DomVideoElement;

  protected _timeOffset = 0;

  protected constructor(config: SidecarVideoDomControllerConfig) {
    this._hostElement = config.hostElement;

    this._domVideoElement = new DomVideoElement({
      crossOrigin: config.crossOrigin,
      muted: config.muted ?? false,
    });

    let videoElement = this._domVideoElement.htmlElement;
    videoElement.classList.add(SidecarVideoDomClasses.video);
    videoElement.style.display = 'block';
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';

    this._hostElement.appendChild(videoElement);
  }

  abstract loadSource(url: string | undefined, startTime?: number): Observable<void>;

  abstract loadDuration(url: string | undefined): Observable<number>;

  /** Sidecar video is loaded only from url. */
  protected urlNotSet<T>(): Observable<T> {
    return throwError(() => new Error(`Sidecar video source url not set`));
  }

  abstract release(): void;

  /** Detaches source from video element, removing src attribute, unlike setting empty src, doesn't raise error. */
  protected detachVideoElementSource() {
    let videoElement = this.videoElement;
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();
  }

  get videoElement(): HTMLVideoElement {
    return this._domVideoElement.htmlElement;
  }

  get bufferedTimeRanges(): BufferedTimeRange[] {
    return this._domVideoElement.bufferedTimeRanges;
  }

  get timeOffset(): number {
    return this._timeOffset;
  }

  get duration(): number {
    return Math.max(0, this.videoElement.duration - this._timeOffset);
  }

  get visible(): boolean {
    return this.videoElement.style.visibility !== 'hidden';
  }

  set visible(visible: boolean) {
    this.videoElement.style.visibility = visible ? '' : 'hidden';
  }

  destroy() {
    // removes video element from host element as well
    this._domVideoElement.destroy();
  }
}

/**
 * Sidecar video DOM controller for MP4 files, source is set directly on video element.
 */
export class Mp4SidecarVideoDomController extends BaseSidecarVideoDomController {
  /** Time offset is read from file once, and reused when source is attached again. */
  protected _resolvedTimeOffset: {url: string; timeOffset: number} | undefined;

  constructor(config: SidecarVideoDomControllerConfig) {
    super(config);
  }

  loadSource(url: string | undefined, startTime?: number): Observable<void> {
    if (!url) {
      return this.urlNotSet();
    }
    return this.resolveTimeOffset(url).pipe(
      switchMap((timeOffset) => {
        this._timeOffset = timeOffset;
        // media fragment makes browser fetch byte range at start time first, instead of from file start and again after seek
        let fragmentStartTime = startTime && startTime > 0 ? startTime + timeOffset : void 0;
        return this._domVideoElement.loadSource(UrlSource.of(Mp4SidecarVideoDomController.resolveFragmentUrl(url, fragmentStartTime)));
      })
    );
  }

  /**
   * First video frame time, same as for main media MP4, see {@link MediaMetadataResolver.getMediaMetadata}. Only moov box and first samples are fetched.
   * Falls back to 0 if it can't be read.
   */
  protected resolveTimeOffset(url: string): Observable<number> {
    if (this._resolvedTimeOffset?.url === url) {
      return of(this._resolvedTimeOffset.timeOffset);
    }
    return MediaMetadataResolver.getMediaMetadata(url, ['firstVideoTrackInitSegmentTime']).pipe(
      timeout(LOAD_TIMEOUT_MS),
      map((metadata) => metadata.firstVideoTrackInitSegmentTime ?? 0),
      tap((timeOffset) => {
        this._resolvedTimeOffset = {url, timeOffset};
      }),
      catchError((error) => {
        console.debug(`Sidecar MP4 time offset could not be resolved, setting default`, error);
        return of(0);
      })
    );
  }

  loadDuration(url: string | undefined): Observable<number> {
    if (!url) {
      return this.urlNotSet();
    }
    return forkJoin([this.loadElementDuration(url), this.resolveTimeOffset(url)]).pipe(
      map(([elementDuration, timeOffset]) => {
        this._timeOffset = timeOffset;
        return Math.max(0, elementDuration - timeOffset);
      })
    );
  }

  /** Video element duration, in video element time. */
  protected loadElementDuration(url: string): Observable<number> {
    return new Observable<number>((observer) => {
      let videoElement = this.videoElement;
      let preload = videoElement.preload;
      let restore = () => {
        this.detachVideoElementSource();
        videoElement.preload = preload;
      };

      // browser fetches only moov box, media data is not fetched
      videoElement.preload = 'metadata';
      let subscription = merge(
        fromEvent(videoElement, HTMLMediaElementEvent.LOADEDMETEDATA).pipe(map(() => videoElement.duration)),
        fromEvent(videoElement, HTMLMediaElementEvent.ERROR).pipe(
          map(() => {
            throw new Error(`Error loading sidecar MP4 metadata: ${videoElement.error?.message}`);
          })
        )
      )
        .pipe(take(1), timeout(LOAD_TIMEOUT_MS))
        .subscribe({
          next: (duration) => {
            restore();
            nextCompleteObserver(observer, duration);
          },
          error: (error) => {
            restore();
            errorCompleteObserver(observer, error);
          },
        });

      videoElement.src = url;
      videoElement.load();

      return () => subscription.unsubscribe();
    });
  }

  release() {
    this.detachVideoElementSource();
  }

  protected static resolveFragmentUrl(url: string, startTime: number | undefined): string {
    if (!startTime || startTime <= 0) {
      return url;
    }
    let hashIndex = url.indexOf('#');
    return `${hashIndex === -1 ? url : url.substring(0, hashIndex)}#t=${startTime}`;
  }
}

/**
 * Sidecar video DOM controller for HLS streams, owns its own hls.js instance attached to sidecar video element.
 */
export class HlsSidecarVideoDomController extends BaseSidecarVideoDomController {
  protected _hls: Hls | undefined;

  /** fMP4 first video frame time is read from playlist's first fragment once, and reused when source is attached again. */
  protected _resolvedFirstVideoFrameTime: {url: string; time: number} | undefined;

  protected _loadBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  constructor(config: SidecarVideoDomControllerConfig) {
    super(config);
  }

  loadSource(url: string | undefined, startTime?: number): Observable<void> {
    if (!url) {
      return this.urlNotSet();
    }
    return new Observable<void>((observer) => {
      this._loadBreaker.break();
      this.destroyHls();

      // hls.js starts fetching segments from start position, instead of from 0 and then again after seek
      let hls = new Hls({...SIDECAR_HLS_CONFIG, startPosition: Math.max(startTime ?? 0, 0)});
      this._hls = hls;

      if (AuthConfig.authentication) {
        hls.config.xhrSetup = (xhr: XMLHttpRequest, url: string) => {
          const requestInit = AuthConfig.createRequestInit(url, AuthConfig.authentication);
          const headers = requestInit.headers as Record<string, string> | undefined;

          if (headers) {
            for (const header in headers) {
              xhr.setRequestHeader(header, headers[header]!);
            }
          }
        };
      }

      let loaded = false;

      hls.on(HlsEvents.ERROR, (event, data) => {
        if (!data.fatal) {
          console.debug(`Sidecar hls non-fatal error ignored; details: ${data.details}`);
          return;
        }

        if (!loaded) {
          // audio group without audio tracks should not prevent video playback, same as in main media
          if (data.details === ErrorDetails.AUDIO_TRACK_LOAD_ERROR) {
            console.debug(`Sidecar hls fatal error "${data.details}" ignored intentionally.`);
            return;
          }
          this._loadBreaker.break();
          errorCompleteObserver(observer, `Error loading sidecar HLS. details: ${data.details}, message: ${data.error?.message}`);
        } else {
          this.tryRecover(data);
        }
      });

      let videoElement = this.videoElement;

      let timeOffset$ = this.resolveTimeOffset(hls, url);

      forkJoin([
        new Observable<void>((manifestObserver) => {
          let onManifestParsed = () => nextCompleteObserver(manifestObserver);
          hls.once(HlsEvents.MANIFEST_PARSED, onManifestParsed);
          return () => hls.off(HlsEvents.MANIFEST_PARSED, onManifestParsed);
        }),
        fromEvent(videoElement, HTMLMediaElementEvent.LOADEDMETEDATA).pipe(take(1)),
        fromEvent(videoElement, HTMLMediaElementEvent.LOADEDDATA).pipe(take(1)),
        timeOffset$,
      ])
        .pipe(timeout(LOAD_TIMEOUT_MS))
        .pipe(takeUntil(this._loadBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: ([, , , timeOffset]) => {
            this._timeOffset = timeOffset;
            loaded = true;
            nextCompleteObserver(observer);
          },
          error: (error) => {
            errorCompleteObserver(observer, error);
          },
        });

      hls.loadSource(url);
      hls.attachMedia(videoElement);
    });
  }

  /**
   * Resolves where the first video frame lands on video element timeline, the same way as for main media HLS:
   * - fMP4 - first fragment's lowest video presentation time without edit lists, see {@link MediaMetadataResolver.getHlsFmp4MseFirstVideoFrameTime}, shifted the same way hls.js
   *   shifts fMP4 timeline: hls.js sets SourceBuffer timestampOffset to -initPTS, where initPTS is decode time of the first fragment it parses
   *   minus that fragment's playlist time. First video frame time is read once and reused when source is attached again, initPTS is taken on every load
   * - MPEG-TS - hls.js rewrites timestamps relative to first fragment it parses, so it is measured on every load, from the position
   *   hls.js reports for that fragment. Falls back to 0 if media loaded without it
   *
   * Start position given to hls.js stays in sidecar time, fragments are looked up on playlist timeline, which starts at 0.
   */
  protected resolveTimeOffset(hls: Hls, url: string): Observable<number> {
    let timeOffset$ = new ReplaySubject<number>(1);
    let resolved = false;
    let resolve = (timeOffset: number) => {
      if (!resolved) {
        resolved = true;
        nextCompleteObserver(timeOffset$, timeOffset);
      }
    };

    let mpegTs = false;

    // fMP4: hls.js shifts timeline by initPTS, so that first media fragment it parses starts at its playlist time.
    // initPTS can be found more than once, ie. placeholder for init segment without samples, then the one of the first media fragment,
    // so the latest one is taken once first media fragment is parsed
    let latestInitPts: number | undefined;
    let onInitPtsFound = (event: HlsEvents.INIT_PTS_FOUND, data: InitPTSFoundData) => {
      if (data.id === 'main') {
        latestInitPts = data.initPTS / data.timescale;
      }
    };
    let initPts$ = new ReplaySubject<number>(1);

    let onFragParsed = (event: HlsEvents.FRAG_PARSED, data: FragParsedData) => {
      if (data.frag.type !== 'main' || data.frag.sn === 'initSegment') {
        return;
      }
      let videoStreamInfo = data.frag.elementaryStreams.video ?? data.frag.elementaryStreams.audiovideo;
      if (!videoStreamInfo) {
        return;
      }
      hls.off(HlsEvents.FRAG_PARSED, onFragParsed);
      hls.off(HlsEvents.INIT_PTS_FOUND, onInitPtsFound);
      if (mpegTs) {
        let timeOffset = Math.max(0, videoStreamInfo.startPTS - data.frag.start);
        console.debug(`Sidecar HLS MPEG-TS time offset ${timeOffset}`);
        resolve(timeOffset);
      } else {
        nextCompleteObserver(initPts$, latestInitPts ?? 0);
      }
    };

    hls.once(HlsEvents.LEVEL_LOADED, (event, data: LevelLoadedData) => {
      let firstFragment = data.details.fragments[0];
      if (firstFragment?.initSegment && StringUtil.isNonEmpty(firstFragment.initSegment.url)) {
        let firstVideoFrameTime$: Observable<number> =
          this._resolvedFirstVideoFrameTime?.url === url
            ? of(this._resolvedFirstVideoFrameTime.time)
            : MediaMetadataResolver.getHlsFmp4MseFirstVideoFrameTime(firstFragment).pipe(
                map((time) => time ?? 0),
                tap((time) => (this._resolvedFirstVideoFrameTime = {url, time}))
              );
        forkJoin([firstVideoFrameTime$, initPts$])
          .pipe(takeUntil(this._loadBreaker.observer), takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: ([firstVideoFrameTime, initPts]) => {
              console.debug(`Sidecar HLS fMP4 time offset ${firstVideoFrameTime - initPts}, first video frame time ${firstVideoFrameTime}, hls.js initPTS ${initPts}`);
              resolve(firstVideoFrameTime - initPts);
            },
            error: (error) => {
              console.debug(`Sidecar HLS fMP4 time offset could not be resolved, setting default`, error);
              resolve(0);
            },
          });
      } else {
        mpegTs = true;
      }
    });
    hls.on(HlsEvents.FRAG_PARSED, onFragParsed);
    hls.on(HlsEvents.INIT_PTS_FOUND, onInitPtsFound);

    fromEvent(this.videoElement, HTMLMediaElementEvent.LOADEDDATA)
      .pipe(take(1), takeUntil(this._loadBreaker.observer), takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        if (mpegTs && !resolved) {
          console.debug(`Sidecar HLS MPEG-TS time offset not measured, setting default`);
          resolve(0);
        }
      });

    return timeOffset$;
  }

  /** HLS duration is resolved from playlist, video element duration depends on how hls.js aligned it. */
  override get duration(): number {
    let details = this._hls?.levels.find((level) => level.details)?.details;
    return details ? details.totalduration : super.duration;
  }

  loadDuration(url: string | undefined): Observable<number> {
    if (!url) {
      return this.urlNotSet();
    }
    let fetchManifest = (manifestUrl: string) =>
      M3u8File.create(manifestUrl, AuthConfig.authentication).pipe(
        map((file) => {
          if (!file.manifest) {
            throw new Error(`Error loading sidecar HLS playlist ${manifestUrl}`);
          }
          return file.manifest;
        })
      );

    return fetchManifest(url)
      .pipe(
        switchMap((manifest) => {
          // multivariant playlist, all variants have the same duration, first one is used
          let variantUri: string | undefined = (manifest.playlists?.[0] as {uri?: string} | undefined)?.uri;
          return variantUri ? fetchManifest(new URL(variantUri, url).href) : of(manifest);
        }),
        map((manifest) => {
          let duration = (manifest.segments ?? []).reduce((sum, segment) => sum + segment.duration, 0);
          if (!manifest.endList || !(duration > 0)) {
            throw new Error(`Sidecar HLS duration can't be resolved from playlist, only VOD playlists are supported`);
          }
          return duration;
        })
      )
      .pipe(timeout(LOAD_TIMEOUT_MS));
  }

  release() {
    this._loadBreaker.break();
    this.destroyHls();
    this.detachVideoElementSource();
  }

  protected tryRecover(data: ErrorData) {
    if (!this._hls) {
      return;
    }
    switch (data.type) {
      case ErrorTypes.NETWORK_ERROR:
        console.debug(`Sidecar hls fatal network error, trying to recover; details: ${data.details}`);
        this._hls.startLoad();
        break;
      case ErrorTypes.MEDIA_ERROR:
        console.debug(`Sidecar hls fatal media error, trying to recover; details: ${data.details}`);
        this._hls.recoverMediaError();
        break;
      default:
        console.error(`Sidecar hls fatal error, cannot recover; details: ${data.details}`, data);
    }
  }

  protected destroyHls() {
    try {
      this._hls?.destroy();
    } catch (e) {
      console.debug(e);
    }
    this._hls = void 0;
  }

  destroy() {
    this._loadBreaker.destroy();
    this._destroyBreaker.destroy();
    this.destroyHls();
    super.destroy();
  }
}
