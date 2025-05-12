/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {first, forkJoin, from, fromEvent, map, Observable, Subject, takeUntil} from 'rxjs';
import {Video, VideoLoadOptions} from './model';
import {BaseVideoLoader} from './video-loader';
import Hls, {AudioTrackSwitchingData, ErrorData, Events as HlsEvents, FragLoadedData, FragLoadingData, HlsConfig, ManifestParsedData, MediaAttachedData, MediaKeySessionContext, MediaPlaylist} from 'hls.js';
import {errorCompleteObserver, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {AuthConfig} from '../auth/auth-config';
import {BasicAuthenticationData, BearerAuthenticationData, CustomAuthenticationData} from '../authentication/model';
import {isNullOrUndefined} from '../util/object-util';
import {HTMLVideoElementEventKeys} from './video-controller';
import {z} from 'zod';
import {FrameRateUtil} from '../util/frame-rate-util';
import {OmpAudioTrack, OmpError, OmpHlsNamedEvent, OmpNamedEventEventName, SubtitlesVttTrack} from '../types';
import {VttUtil} from '../vtt/vtt-util';
import {StringUtil} from '../util/string-util';
import {CryptoUtil} from '../util/crypto-util';
import {VideoControllerApi} from './video-controller-api';
import {M3u8Util} from '../m3u8/m3u8-util';
import {UrlUtil} from '../util/url-util';
import {AudioGroup} from '../m3u8/m3u8.model';
import {httpGet} from '../http';
import {BlobUtil} from '../util/blob-util';
import {AudioUtil} from '../util/audio-util';
import {M3u8File} from '../m3u8/m3u8-file';

export type HlsLicenseXhrSetupFn = (xhr: XMLHttpRequest, url: string, keyContext: MediaKeySessionContext, licenseChallenge: Uint8Array) => void | Uint8Array | Promise<Uint8Array | void>;

export interface OmpHlsConfig extends HlsConfig {
  /**
   * Should fetch hls.js embedded subtitles
   */
  fetchManifestSubtitleTracks: boolean;

  /**
   * Should display hls.js subtitles
   */
  subtitleDisplay: boolean;

  /**
   * Function that creates hls.js pre-processor function {@link HlsConfig.licenseXhrSetup} for modifying license requests (https://github.com/video-dev/hls.js/blob/master/docs/API.md#licensexhrsetup)
   * If set, created function takes precedence over {@link licenseXhrSetup}
   *
   * @param sourceUrl
   * @param options
   */
  loadVideoLicenseXhrSetup?: (sourceUrl: string, options?: VideoLoadOptions | undefined) => HlsLicenseXhrSetupFn;
}

type OmpHlsEventListener = (event: any, data: any) => void;

export interface OmpHlsAudioTrackPackage {
  audioTrackName: string;
  audioGroup: AudioGroup;
  m3u8File: M3u8File;
}

export class VideoHlsLoader extends BaseVideoLoader {
  public _eventMapping: Map<OmpNamedEventEventName, HlsEvents> = new Map<OmpNamedEventEventName, HlsEvents>([
    ['hlsManifestParsed', HlsEvents.MANIFEST_PARSED],
    ['hlsMediaAttached', HlsEvents.MEDIA_ATTACHED],
    ['hlsFragLoading', HlsEvents.FRAG_LOADING],
    ['hlsFragLoaded', HlsEvents.FRAG_LOADED],
    ['hlsError', HlsEvents.ERROR],
  ]);
  protected _hls: Hls | undefined;
  protected _hlsEventListenersMap: Map<OmpNamedEventEventName, OmpHlsEventListener> = new Map<OmpNamedEventEventName, OmpHlsEventListener>();

  protected _videoEventBreaker$ = new Subject<void>();

  constructor(videoController: VideoControllerApi) {
    super(videoController);
    if (Hls.isSupported()) {
      console.debug('video load with hls.js');
    } else {
      console.error('hls is not supported through MediaSource extensions');
    }
  }

  override loadVideo(sourceUrl: string, options?: VideoLoadOptions | undefined): Observable<Video> {
    nextCompleteSubject(this._loadVideoBreaker$);
    this._loadVideoBreaker$ = new Subject<void>();

    nextCompleteSubject(this._videoEventBreaker$);
    this._videoEventBreaker$ = new Subject<void>();

    return passiveObservable<Video>((observer) => {

      this.destroyHls();

      let hlsConfig = this._videoController.getConfig().hlsConfig;

      this._hls = new Hls({
        ...hlsConfig,
        licenseXhrSetup: hlsConfig.loadVideoLicenseXhrSetup
          ? (xhr: XMLHttpRequest, url: string, keyContext: MediaKeySessionContext, licenseChallenge: Uint8Array) => {
              return hlsConfig.loadVideoLicenseXhrSetup!(sourceUrl, options)(xhr, url, keyContext, licenseChallenge);
            }
          : hlsConfig.licenseXhrSetup,
      });

      this.updateActiveNamedEventStreams(this._videoController.getActiveNamedEventStreams());

      this._videoController.onActiveNamedEventStreamsChange$.pipe(takeUntil(this._videoEventBreaker$), takeUntil(this._destroyed$)).subscribe({
        next: (eventNames) => {
          this.updateActiveNamedEventStreams(eventNames);
        },
      });

      let onAudioTracksUpdated = () => {
        let audioTracks = this._hls!.audioTracks.map((mediaPlaylist) => this.createOmpAudioTrack(mediaPlaylist));

        let activeHlsAudioTrack = this._hls!.audioTracks[this._hls!.audioTrack];
        let activeAudioTrack = activeHlsAudioTrack ? audioTracks.find((p) => p.id === `${activeHlsAudioTrack.id}`) : void 0;

        this.onAudioLoaded$.next({
          audioTracks: audioTracks,
          activeAudioTrack: activeAudioTrack,
        });
      };

      let onAudioTrackSwitched = () => {
        let hlsAudioTrack = this._hls!.audioTracks[this._hls!.audioTrack];
        if (hlsAudioTrack) {
          this.onAudioSwitched$.next({
            activeAudioTrack: this.createOmpAudioTrack(hlsAudioTrack),
          });
        }
      };

      let isDrm = false;
      this._hls!.once(HlsEvents.KEY_LOADED, function (event, data) {
        // console.debug(event, data);
        isDrm = true;
      });

      this._hls!.on(HlsEvents.AUDIO_TRACKS_UPDATED, function (event, data) {
        // console.debug(event, data);
        onAudioTracksUpdated();
      });

      this._hls!.on(HlsEvents.AUDIO_TRACK_SWITCHED, function (event, data) {
        // console.debug(event, data);
        onAudioTrackSwitched();
      });

      this.overrideHlsMethods();

      if (AuthConfig.authentication) {
        this._hls.config.xhrSetup = (xhr: XMLHttpRequest, url: string) => {
          if (AuthConfig.authentication!.type === 'basic') {
            const token = btoa(`${(AuthConfig.authentication as BasicAuthenticationData)!.username}:${(AuthConfig.authentication as BasicAuthenticationData)!.password}`);
            xhr.setRequestHeader('Authorization', `Basic ${token}`);
          } else if (AuthConfig.authentication!.type === 'bearer') {
            xhr.setRequestHeader('Authorization', `Bearer ${(AuthConfig.authentication as BearerAuthenticationData)!.token}`);
          } else {
            const authenticationData = (AuthConfig.authentication as CustomAuthenticationData)!.headers(url);
            for (const header in authenticationData.headers) {
              xhr.setRequestHeader(header, authenticationData.headers[header]);
            }
          }
        };
      }

      this._hls.on(HlsEvents.ERROR, function (event, data) {
        let errorType = data.type;
        let errorDetails = data.details;
        let errorFatal = data.fatal;

        /**
         * Temporarily excluding audioTrackLoadError from error handler.
         * This error propagation is causing that HLS streams, with audio group defined but without audio tracks,
         * are not to be playable by OmakasePlayer
         */
        if (!errorDetails.includes('audioTrackLoadError')) {
          errorCompleteObserver(observer, `Error loading video. Hls error details: ${errorDetails}`);
        }
      });

      let hlsMediaAttached$ = new Observable<boolean>((observer) => {
        // MEDIA_ATTACHED event is fired by hls object once MediaSource is ready
        this._hls!.once(HlsEvents.MEDIA_ATTACHED, function (event, data) {
          // console.debug('video element and hls.js are now bound together');
          nextCompleteObserver(observer, true);
        });
      });

      let audioOnly = false;
      let hlsManifestParsed$ = new Observable<boolean>((observer) => {
        this._hls!.once(HlsEvents.MANIFEST_PARSED, (event, data) => {
          // set audio track with 6 channels as default, if it exists
          let defaultAudioTrack = this._hls!.allAudioTracks.find((track) => track.channels === '6');
          this._hls!.setAudioOption(defaultAudioTrack);

          let firstLevelIndex = data.firstLevel;
          let firstLevel = data.levels[firstLevelIndex];

          let hasVideo = !!(
            !isNullOrUndefined(firstLevel.videoCodec) ||
            (firstLevel.width && firstLevel.height) ||
            (firstLevel.details && firstLevel.details.fragments[0] && firstLevel.details.fragments[0].elementaryStreams && firstLevel.details.fragments[0].elementaryStreams.video)
          );

          audioOnly = !hasVideo; // if it doesn't contain video / audio, it'll still be audioOnly for now

          nextCompleteObserver(observer, true);
        });
      });

      let hasInitSegment = false;
      let hlsFragParsingInitSegment$ = new Observable<boolean>((observer) => {
        this._hls!.once(HlsEvents.FRAG_PARSING_INIT_SEGMENT, function (event, data) {
          if ((data as FragLoadedData).frag.sn === 'initSegment' && (data as FragLoadedData).frag.data) {
            hasInitSegment = true;
          }
          nextCompleteObserver(observer, true);
        });
      });

      let frameRateResolved$ = new Observable<number | undefined>((observer) => {
        this._hls!.once(HlsEvents.MANIFEST_PARSED, function (event, data) {
          if (options?.frameRate) {
            nextCompleteObserver(observer, FrameRateUtil.resolveFrameRate(options.frameRate));
          } else {
            let firstLevelIndex = data.firstLevel;
            let firstLevel = data.levels[firstLevelIndex];
            nextCompleteObserver(observer, FrameRateUtil.resolveFrameRate(firstLevel.frameRate));
          }
        });
      });

      let videoLoadedData$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEventKeys.LOADEDDATA).pipe(first());
      let videoLoadedMetadata$ = fromEvent(this._videoController.getHTMLVideoElement(), HTMLVideoElementEventKeys.LOADEDMETEDATA).pipe(first());

      forkJoin([hlsMediaAttached$, hlsManifestParsed$, hlsFragParsingInitSegment$, videoLoadedData$, videoLoadedMetadata$, frameRateResolved$])
        .pipe(first())
        .subscribe((result) => {
          let duration: number;
          if (options && options.duration) {
            duration = z.coerce.number().parse(options.duration);
            duration = duration ? duration : this._videoController.getHTMLVideoElement().duration;
          } else {
            duration = this._videoController.getHTMLVideoElement().duration;
          }

          let dropFrame = options && options.dropFrame !== void 0 ? options.dropFrame : false;

          const frameRate = result[5];
          if (!frameRate) {
            throw new Error('Frame rate could not be determined');
          }

          let initSegmentTimeOffset = hasInitSegment ? FrameRateUtil.frameNumberToTime(2, frameRate) : void 0; // TODO resolve time offset dynamically

          let video: Video = {
            protocol: 'hls',
            sourceUrl: sourceUrl,
            frameRate: frameRate,
            dropFrame: dropFrame,
            duration: duration,
            totalFrames: FrameRateUtil.totalFramesNumber(duration, frameRate),
            frameDuration: FrameRateUtil.frameDuration(frameRate),
            audioOnly: audioOnly,
            initSegmentTimeOffset: initSegmentTimeOffset,
            drm: isDrm,
          };

          // audio
          if (!this._hls!.audioTracks || this._hls!.audioTracks.length < 1) {
            // produce onAudioLoaded$ event manually, because there are no audio tracks and AUDIO_TRACKS_UPDATED will never fire
            onAudioTracksUpdated();
          }

          // subtitles
          this._hls!.subtitleDisplay = !!hlsConfig.subtitleDisplay;
          if (!hlsConfig.subtitleDisplay) {
            this._hls!.subtitleTrack = -1;
          }
          if (!!hlsConfig.fetchManifestSubtitleTracks && this._hls!.allSubtitleTracks && this._hls!.allSubtitleTracks.length > 0) {
            let os$ = this._hls!.allSubtitleTracks.map((subtitleTrack) => {
              return M3u8Util.fetchVttSegmentedConcat(subtitleTrack.url, AuthConfig.authentication).pipe(
                map((webvttText) => {
                  return {
                    mediaPlaylist: subtitleTrack,
                    webvttText: webvttText,
                  };
                })
              );
            });

            forkJoin(os$).subscribe({
              next: (resultList) => {
                let mediaPlaylistWebvtts = resultList.filter((p) => !StringUtil.isNullUndefinedOrWhitespace(p.webvttText));
                if (mediaPlaylistWebvtts && mediaPlaylistWebvtts.length > 0) {
                  let os$ = mediaPlaylistWebvtts.map((mediaPlaylistWebvtt) =>
                    CryptoUtil.digest(mediaPlaylistWebvtt.webvttText!) // digest each VTT's content
                      .pipe(
                        map((contentDigest) => {
                          return {
                            ...mediaPlaylistWebvtt,
                            webvttTextDigest: contentDigest,
                          };
                        })
                      )
                  );
                  forkJoin(os$).subscribe({
                    next: (mediaPlaylistWebvtts) => {
                      let embeddedSubtitlesTracks: SubtitlesVttTrack[] = mediaPlaylistWebvtts.map((result) => ({
                        id: CryptoUtil.uuid(),
                        kind: 'subtitles',
                        hidden: true,
                        default: false,
                        embedded: true,
                        contentDigest: result.webvttTextDigest,
                        src: VttUtil.createWebvttBlob(result.webvttText!),
                        language: result.mediaPlaylist.lang ? result.mediaPlaylist.lang : 'n/a',
                        label: result.mediaPlaylist.name ? result.mediaPlaylist.name : 'n/a',
                      }));
                      this.onSubtitlesLoaded$.next({
                        tracks: embeddedSubtitlesTracks,
                        currentTrack: void 0,
                      });
                    },
                    error: (err) => {
                      console.error(err);
                      this.onSubtitlesLoaded$.next({
                        tracks: [],
                        currentTrack: void 0,
                      });
                    },
                  });
                }
              },
            });
          } else {
            this.onSubtitlesLoaded$.next({
              tracks: [],
              currentTrack: void 0,
            });
          }

          nextCompleteObserver(observer, video);
        })
        .add(() => {
          nextCompleteSubject(this._loadVideoBreaker$);
        });

      this._hls.loadSource(sourceUrl);
      this._hls.attachMedia(this._videoController.getHTMLVideoElement());

      this._hls.on(HlsEvents.ERROR, this.onHlsError);
    });
  }

  protected createOmpAudioTrack(mediaPlaylist: MediaPlaylist): OmpAudioTrack {
    return {
      id: `${mediaPlaylist.id}`,
      label: mediaPlaylist.name,
      src: mediaPlaylist.url,
      language: mediaPlaylist.lang,
      embedded: true,
      active: false,
      channelCount: StringUtil.isNonEmpty(mediaPlaylist.channels) ? parseInt(mediaPlaylist.channels!) : void 0,
    };
  }

  protected onHlsError(event: any, data: any) {
    if (this._hls) {
      console.error(event, data);
      if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR || data.details === Hls.ErrorDetails.BUFFER_APPENDING_ERROR) {
      }
    } else {
      // console.debug(`hls.js destroyed, error ocurred in already destroyed instance`, data)
    }
  }

  // override getActiveAudioTracks(): OmpAudioTrack[] {
  //   let activeMediaPlaylist = this._hls!.audioTracks[this._hls!.audioTrack];
  //   return activeMediaPlaylist ? [this._audioTracks.get(this._mediaPlaylistsMapping.get(activeMediaPlaylist.id)!)!] : []
  // }

  override setActiveAudioTrack(ompAudioTrackId: string): Observable<void> {
    return new Observable((observer) => {
      let hlsAudioTrackId = parseInt(ompAudioTrackId);
      if (this._hls!.audioTrack !== hlsAudioTrackId) {
        // proceed with change
        this._hls!.once(HlsEvents.AUDIO_TRACK_SWITCHED, (event: string, data: AudioTrackSwitchingData) => {
          // console.debug(event, data);
          nextCompleteObserver(observer);
        });
        this._hls!.audioTrack = hlsAudioTrackId; // this triggers AUDIO_TRACK_SWITCHED
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  override exportAudioTrack(ompAudioTrackId: string): Observable<Partial<OmpAudioTrack>> {
    let hlsAudioTrackId = parseInt(ompAudioTrackId);

    return new Observable<Partial<OmpAudioTrack>>((observer) => {
      if (this._hls && this._hls.audioTracks.length > 0 && this._hls.audioTracks.find((p) => p.id === hlsAudioTrackId)) {
        let hlsMediaPlaylist = this._hls.audioTracks.find((p) => p.id === hlsAudioTrackId)!;
        let hlsMediaPlaylistRootUrl = hlsMediaPlaylist.url.substring(0, hlsMediaPlaylist.url.lastIndexOf('/'));

        M3u8File.create(hlsMediaPlaylist.url, AuthConfig.authentication)
          .pipe(
            map(
              (m3u8File) =>
                ({
                  audioTrackName: hlsMediaPlaylist.name,
                  audioGroup: {
                    uri: hlsMediaPlaylist.url,
                    default: hlsMediaPlaylist.default,
                    autoselect: hlsMediaPlaylist.autoselect,
                    language: hlsMediaPlaylist.lang,
                    forced: hlsMediaPlaylist.forced,
                    instreamId: hlsMediaPlaylist.instreamId,
                    characteristics: hlsMediaPlaylist.characteristics,
                  },
                  m3u8File: m3u8File,
                }) as OmpHlsAudioTrackPackage
            )
          )
          .subscribe({
            next: (audioPackage: OmpHlsAudioTrackPackage) => {
              const firstSegment = audioPackage.m3u8File.manifest!.segments[0];
              const firstSegmentAbsUrl = UrlUtil.absolutizeUrl(hlsMediaPlaylistRootUrl, firstSegment.uri);
              const isNonFragmented = audioPackage.m3u8File.manifest!.segments.every((segment) => UrlUtil.absolutizeUrl(hlsMediaPlaylistRootUrl, segment.uri) === firstSegmentAbsUrl);

              if (isNonFragmented) {
                from(
                  httpGet<ArrayBuffer>(firstSegmentAbsUrl, {
                    ...AuthConfig.createAxiosRequestConfig(firstSegmentAbsUrl, AuthConfig.authentication),
                    responseType: 'arraybuffer',
                  })
                ).subscribe({
                  next: (response) => {
                    let audioTrack: Partial<OmpAudioTrack> = {
                      src: BlobUtil.createBlobURL([response.data]),
                      label: hlsMediaPlaylist.name,
                      language: hlsMediaPlaylist.lang,
                    };

                    nextCompleteObserver(observer, audioTrack);
                  },
                  error: (error) => {
                    errorCompleteObserver(observer, error);
                  },
                });
              } else {
                let fragmentsAbsUrls = audioPackage.m3u8File.manifest!.segments.map((segment) => UrlUtil.absolutizeUrl(hlsMediaPlaylistRootUrl, segment.uri));
                let initSegmentUrl = StringUtil.isNonEmpty(firstSegment.map.uri) ? UrlUtil.absolutizeUrl(hlsMediaPlaylistRootUrl, firstSegment.map.uri) : void 0;

                fragmentsAbsUrls = initSegmentUrl ? [initSegmentUrl, ...fragmentsAbsUrls] : fragmentsAbsUrls;

                AudioUtil.fetchAndMergeAudioFiles(fragmentsAbsUrls, AuthConfig.authentication).subscribe({
                  next: (audioArrayBuffer) => {
                    let audioTrack: Partial<OmpAudioTrack> = {
                      src: BlobUtil.createBlobURL([audioArrayBuffer]),
                      label: hlsMediaPlaylist.name,
                      language: hlsMediaPlaylist.lang,
                    };

                    nextCompleteObserver(observer, audioTrack);
                  },
                  error: (error) => {
                    errorCompleteObserver(observer, error);
                  },
                });
              }
            },
          });
      } else {
        errorCompleteObserver(observer, new OmpError(`Audio track not found`));
      }
    });
  }

  updateActiveNamedEventStreams(eventNames: OmpNamedEventEventName[]): void {
    for (let eventName of this._eventMapping.keys()) {
      if (eventNames.filter((p) => this.isEventSupported(p)).find((p) => p === eventName)) {
        if (!this._hlsEventListenersMap.has(eventName)) {
          let eventListener: OmpHlsEventListener = this.createHlsEventListener(eventName);
          this._hlsEventListenersMap.set(eventName, eventListener);
        }
      } else {
        if (this._hlsEventListenersMap.has(eventName)) {
          let eventListener = this._hlsEventListenersMap.get(eventName)!;
          this._hls!.off(this.resolveHlsEventName(eventName), eventListener);
          this._hlsEventListenersMap.delete(eventName);
        }
      }
    }
  }

  getHls(): Hls | undefined {
    return this._hls;
  }

  protected isEventSupported(eventName: OmpNamedEventEventName): boolean {
    return this._eventMapping.has(eventName);
  }

  protected resolveHlsEventName(eventName: OmpNamedEventEventName): HlsEvents {
    if (this._eventMapping.has(eventName)) {
      return this._eventMapping.get(eventName)!;
    } else {
      throw new OmpError(`Unsupported HLS event: ${eventName}`);
    }
  }

  protected createHlsEventListener(eventName: OmpNamedEventEventName): OmpHlsEventListener {
    let listener: OmpHlsEventListener;

    switch (eventName) {
      case 'hlsManifestParsed':
        listener = (event: string, data: ManifestParsedData) => {
          let serializableData = {
            ...data,
          };
          this.onNamedEvent$.next({
            eventName: eventName,
            hlsEventName: this.resolveHlsEventName(eventName),
            data: serializableData,
          } as OmpHlsNamedEvent);
        };
        break;
      case 'hlsMediaAttached':
        listener = (event: string, data: MediaAttachedData) => {
          let serializableData = {};
          this.onNamedEvent$.next({
            eventName: eventName,
            hlsEventName: this.resolveHlsEventName(eventName),
            data: serializableData,
          } as OmpHlsNamedEvent);
        };
        break;
      case 'hlsFragLoading':
        listener = (event: string, data: FragLoadingData) => {
          let serializableData = {};
          this.onNamedEvent$.next({
            eventName: eventName,
            hlsEventName: this.resolveHlsEventName(eventName),
            data: serializableData,
          } as OmpHlsNamedEvent);
        };
        break;
      case 'hlsFragLoaded':
        listener = (event: string, data: FragLoadedData) => {
          let serializableData = {};
          this.onNamedEvent$.next({
            eventName: eventName,
            hlsEventName: this.resolveHlsEventName(eventName),
            data: serializableData,
          } as OmpHlsNamedEvent);
        };
        break;
      case 'hlsError':
        listener = (event: string, data: ErrorData) => {
          let serializableData: Partial<ErrorData> = {
            error: data.error,
            details: data.details,
            reason: data.reason,
            fatal: data.fatal,
            level: data.level,
          };

          this.onNamedEvent$.next({
            eventName: eventName,
            hlsEventName: this.resolveHlsEventName(eventName),
            data: serializableData,
          } as OmpHlsNamedEvent);
        };
        break;
      default:
        throw new OmpError(`Unsupported HLS event: ${eventName}`);
    }

    this._hls!.on(this.resolveHlsEventName(eventName), listener);

    return listener;
  }

  protected overrideHlsMethods() {
    // unsafe, working on HLS version 1.5.8
    // see https://github.com/video-dev/hls.js/blob/master/src/controller/subtitle-track-controller.ts
    // @ts-ignore
    let hlsSubtitleTrackController = this._hls.subtitleTrackController;

    if (hlsSubtitleTrackController) {
      if (hlsSubtitleTrackController.pollTrackChange) {
        hlsSubtitleTrackController.pollTrackChange = (timeout: number) => {
          // overriden to prevent HLS polling & toggling already shown / hidden subtitles
        };
      }

      if (hlsSubtitleTrackController.asyncPollTrackChange) {
        hlsSubtitleTrackController.asyncPollTrackChange = () => {
          // overriden to prevent HLS polling & toggling already shown / hidden subtitles
        };
      }
    }
  }

  protected destroyHls() {
    try {
      if (this._hls) {
        this._hls.detachMedia();
        this._hls.off(HlsEvents.ERROR);
        this._hls.destroy();
        this._hls = void 0;
      }
    } catch (e) {
      console.error(e);
    }
  }

  override destroy() {
    nextCompleteSubject(this._videoEventBreaker$);

    this.destroyHls();
    super.destroy();
  }
}
