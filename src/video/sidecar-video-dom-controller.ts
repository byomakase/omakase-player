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

import Hls, {ErrorDetails, ErrorTypes, Events as HlsEvents, type ErrorData, type HlsConfig} from 'hls.js';
import {forkJoin, fromEvent, map, merge, Observable, of, switchMap, take, takeUntil, throwError, timeout} from 'rxjs';
import {type BufferedTimeRange, DomVideoElement, HTMLMediaElementEvent} from '../dom/dom-media-element';
import {UrlSource} from '../source';
import {M3u8File} from '../m3u8/m3u8-file';
import {AuthConfig} from '../common/authentication';
import {ObserverBreaker} from '../common/observer-breaker';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import type {SidecarDomController} from './sidecar-track-controller';

export const SidecarVideoDomClasses = {
  video: 'omakase-sidecar-video',
};

/**
 * Owns sidecar video element and everything needed for its playback. Sidecar video element is mounted into host element.
 */
export interface SidecarVideoDomController extends SidecarDomController {
  videoElement: HTMLVideoElement;

  bufferedTimeRanges: BufferedTimeRange[];

  /**
   * Sidecar video element visibility. Hidden element keeps its layout box, so it's not painted but keeps its size
   * (hls.js level capping relies on it) and becomes visible without re-layout.
   */
  visible: boolean;

  /**
   * Loads source into sidecar video element, completes when media data and metadata are loaded.
   *
   * @param url Source url
   * @param startTime Sidecar time loading should start from, so the first fetched data is the one that will be played. Defaults to 0.
   */
  loadSource(url: string | undefined, startTime?: number): Observable<void>;

  /**
   * Resolves source duration without loading media data, so no frame is decoded. Video element is left without source.
   * - MP4 - only metadata is loaded
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
  constructor(config: SidecarVideoDomControllerConfig) {
    super(config);
  }

  loadSource(url: string | undefined, startTime?: number): Observable<void> {
    if (!url) {
      return this.urlNotSet();
    }
    // media fragment makes browser fetch byte range at start time first, instead of from file start and again after seek
    return this._domVideoElement.loadSource(UrlSource.of(Mp4SidecarVideoDomController.resolveFragmentUrl(url, startTime)));
  }

  loadDuration(url: string | undefined): Observable<number> {
    if (!url) {
      return this.urlNotSet();
    }
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

      forkJoin([
        new Observable<void>((manifestObserver) => {
          let onManifestParsed = () => nextCompleteObserver(manifestObserver);
          hls.once(HlsEvents.MANIFEST_PARSED, onManifestParsed);
          return () => hls.off(HlsEvents.MANIFEST_PARSED, onManifestParsed);
        }),
        fromEvent(videoElement, HTMLMediaElementEvent.LOADEDMETEDATA).pipe(take(1)),
        fromEvent(videoElement, HTMLMediaElementEvent.LOADEDDATA).pipe(take(1)),
      ])
        .pipe(timeout(LOAD_TIMEOUT_MS))
        .pipe(takeUntil(this._loadBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: () => {
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
