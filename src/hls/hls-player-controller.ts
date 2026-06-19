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

import Hls, {
  ErrorDetails,
  Events as HlsEvents,
  type FragLoadedData,
  type HlsConfig,
  type ManifestParsedData,
  type MediaKeySessionContext,
  type MediaPlaylist
} from 'hls.js';
import {type AudioState, type MainMediaLoadOptions, type TextTrackState} from '../media';
import {combineLatest, filter, fromEvent, map, Observable, Subject, take, takeUntil, timeout} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {HlsJsFactory} from './hls-js-factory';
import {type FrameRateModel, FrameRateResolver} from '../common/frame-rate';
import {isNullOrUndefined} from '../util/util-functions';
import {MediaMetadataResolver} from '../tools';
import {TimecodeConverter, type TimecodeModel} from '../common/timecode';
import {HlsAudio, type HlsAudioState, HlsTextTrack, type HlsTextTrackState, HlsVideo} from './hls-track';
import {
  type AudioTrackIdentifier,
  BasePlayerController,
  type PlayerControllerConfig,
  type TextTrackIdentifier
} from '../player/player-controller';
import {z} from 'zod';
import {BrowserProvider} from '../common/browser-provider';
import {type LoadMainMediaArgsType, PlayerControllerEventType, type PlayerDomController} from '../player';
import {UrlSource} from '../source';
import {AuthConfig, FileFormatType} from '../common';
import {StringUtil} from '../util/string-util';
import {OpStage, OpStageStatus} from '../common/op-stage';
import {PLAYER_CONTROLLER_DEFAULTS} from '../constants';

export type HlsLicenseXhrSetupFn = (xhr: XMLHttpRequest, url: string, keyContext: MediaKeySessionContext, licenseChallenge: Uint8Array) => void | Uint8Array | Promise<Uint8Array | void>;

export interface HlsPlayerControllerConfig extends PlayerControllerConfig {
  /**
   * HLS config
   */
  hlsConfig: Partial<HlsConfig>;

  /**
   * Function that creates hls.js pre-processor function {@link HlsConfig.licenseXhrSetup} for modifying license requests (https://github.com/video-dev/hls.js/blob/master/docs/API.md#licensexhrsetup)
   * If set, created function takes precedence over {@link licenseXhrSetup}
   *
   * @param sourceUrl
   * @param options
   */
  loadVideoLicenseXhrSetup?: (sourceUrl: string, loadOptions?: MainMediaLoadOptions | undefined) => HlsLicenseXhrSetupFn;
}

export const _hlsControllerConfigDefault: HlsPlayerControllerConfig = {
  hlsConfig: {
    ...Hls.DefaultConfig,
    // enableWorker: false,
  },
};

export class HlsPlayerController extends BasePlayerController<HlsPlayerControllerConfig> {
  protected _hls: Hls | undefined;

  constructor(playerDomController: PlayerDomController, config?: Partial<HlsPlayerControllerConfig>) {
    super(playerDomController, {
      ..._hlsControllerConfigDefault,
      ...(config || {}),
      hlsConfig: {
        ..._hlsControllerConfigDefault.hlsConfig,
        ...(config?.hlsConfig || {}),
      },
    });

    this._createMediaElementSourceEnabled = !BrowserProvider.instance.isSafari; // if HLS and Safari then we handle MediaElementSourceEnabled related to audio in different way
  }

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    // console.debug(`loadMainMedia args: `, args);

    this._loadBreaker.break();

    this.destroyHls();

    this.unwireEvents();

    let url = args.url;
    let loadOptions = args.loadOptions;

    return new Observable<boolean>((rootObserver) => {
      let mainMediaEssentialArgsHookCompleted$ = new Subject<void>();
      let tracksCreatedHookCompleted$ = new Subject<void>();

      combineLatest([mainMediaEssentialArgsHookCompleted$, tracksCreatedHookCompleted$])
        .pipe(takeUntil(this._loadBreaker.observer))
        .subscribe({
          next: () => {
            nextCompleteObserver(rootObserver, true);
          },
          error: (error) => {
            console.error(error);
            errorCompleteObserver(rootObserver, 'Error occurred');
          },
        })
        .add(() => {
          this._loadBreaker.break();
        });

      // ...

      let hlsConfig = {
        ...this._config.hlsConfig,
      };

      if (this._config && this._config.loadVideoLicenseXhrSetup) {
        hlsConfig = {
          ...hlsConfig,
          licenseXhrSetup: (xhr: XMLHttpRequest, url: string, keyContext: MediaKeySessionContext, licenseChallenge: Uint8Array) => {
            return this._config!.loadVideoLicenseXhrSetup!(url, loadOptions)(xhr, url, keyContext, licenseChallenge);
          },
        };
      }

      let hls = HlsJsFactory.createHls(this._config);
      this._hls = hls;

      console.debug(`Created new HLS instance, sessionId=${this._hls.sessionId}`, hlsConfig);

      let that = this;

      let isDrm = false;
      this._hls.once(HlsEvents.KEY_LOADED, function (event, data) {
        // console.debug(event, data);
        isDrm = true;
      });

      // Object.values(Hls.Events).forEach(eventName => {
      //   this._hls!.on(eventName, (event, data) => {
      //     console.log(eventName, data);
      //   });
      // });

      this._hls!.on(HlsEvents.AUDIO_TRACK_SWITCHED, function (event, data) {
        // console.debug(event, data);
        that._onEvent$.next({
          type: PlayerControllerEventType.PLAYER_CONTROLLER_AUDIO_SWITCHED,
          data: {
            activeAudioIdentifiers: [hls.audioTrack],
          },
        });
      });

      this._hls!.on(HlsEvents.SUBTITLE_TRACK_SWITCH, function (event, data) {
        // console.debug(event, data);
        that._onEvent$.next({
          type: PlayerControllerEventType.PLAYER_CONTROLLER_TEXT_TRACK_SWITCHED,
          data: {
            activeTextTrackIdentifiers: [data.id],
            textTracksDisplayed: that.textTracksDisplayed,
          },
        });
      });

      if (AuthConfig.authentication) {
        this._hls.config.xhrSetup = (xhr: XMLHttpRequest, url: string) => {
          const requestInit = AuthConfig.createRequestInit(url, AuthConfig.authentication);
          const headers = requestInit.headers as Record<string, string> | undefined;

          if (headers) {
            for (const header in headers) {
              xhr.setRequestHeader(header, headers[header]!);
            }
          }
        };
      }

      this._hls.on(HlsEvents.ERROR, function (event, data) {
        let message = `Hls error occurred; details: ${data.details}, fatal: ${data.fatal}, message: ${data.error?.message}`;

        if (data.fatal) {
          /**
           * Temporarily excluding audioTrackLoadError from error handler.
           * This error propagation is causing that HLS streams, with audio group defined but without audio tracks,
           * are not to be playable by OmakasePlayer
           */
          if (data.details.includes(ErrorDetails.AUDIO_TRACK_LOAD_ERROR)) {
            console.debug(`Hls fatal error "${data.details}" ignored intentionally.`);
          } else {
            errorCompleteObserver(rootObserver, `Error loading manifest. ${message}`);
          }
        } else {
          console.debug(message);
          console.debug(`Hls non-fatal error "${data.details}" identified but ignored intentionally.`);
        }
      });

      let hlsMediaAttached$ = new Subject<void>();
      let hlsManifestParsed$ = new Subject<ManifestParsedData>();
      let hlsFragParsingInitSegment$ = new Subject<void>();
      let initSegmentResolution$ = new Subject<number | undefined>();
      let frameRateResolution$ = new Subject<FrameRateModel | undefined>();
      let videoLoadedData$ = new Subject<void>();
      let videoLoadedMetadata$ = new Subject<void>();

      let hasVideo = false;
      let defaultAudioTrack: MediaPlaylist | undefined;
      let hlsAudioTrackForPreload: MediaPlaylist | undefined;
      let hasInitSegment = false;

      this._hls!.once(HlsEvents.MEDIA_ATTACHED, function (event, data) {
        nextCompleteObserver(hlsMediaAttached$);
      });

      this._hls!.once(HlsEvents.FRAG_PARSING_INIT_SEGMENT, function (event, data) {
        if ((data as FragLoadedData).frag.sn === 'initSegment' && (data as FragLoadedData).frag.data) {
          hasInitSegment = true;
        }
        nextCompleteObserver(hlsFragParsingInitSegment$);
      });

      this._hls.once(HlsEvents.MANIFEST_PARSED, (event, manifestParsedData) => {
        defaultAudioTrack = this._hls!.allAudioTracks.find((p) => p.default);
        defaultAudioTrack = defaultAudioTrack ? defaultAudioTrack : this._hls!.allAudioTracks[0]; // if no tracks are marked as default, take first one as default one

        // audio tracks with channels set
        let audioTracksWithChannels = this._hls!.allAudioTracks.filter((audioTrack) => !!audioTrack.channels).map((audioTrack) => ({
          audioTrack: audioTrack,
          numOfChannels: parseInt(audioTrack.channels!),
        }));

        if (audioTracksWithChannels.length > 0) {
          let maxChannels = Math.max(...audioTracksWithChannels.map((p) => p.numOfChannels));

          // all audio tracks have same number of channels and number of channels is equal to maxChannels
          let isAllAudioTracksChannelsEqualToMaxChannels = audioTracksWithChannels.filter((p) => p.numOfChannels === maxChannels).length === this._hls!.allAudioTracks.length;

          let defaultAudioTrackWithChannels = audioTracksWithChannels.find((p) => p.audioTrack.id === defaultAudioTrack?.id);
          let isDefaultAudioTrackWithMaxChannels = defaultAudioTrackWithChannels && defaultAudioTrackWithChannels.numOfChannels === maxChannels;

          let preloadAudioTrackCandidate = audioTracksWithChannels.find((p) => p.numOfChannels === maxChannels)?.audioTrack;

          if (preloadAudioTrackCandidate && defaultAudioTrack?.id !== preloadAudioTrackCandidate.id && !isAllAudioTracksChannelsEqualToMaxChannels && !isDefaultAudioTrackWithMaxChannels) {
            // set only if candidate is found, and it's not default track
            hlsAudioTrackForPreload = preloadAudioTrackCandidate;
          }
        }

        if (hlsAudioTrackForPreload) {
          // console.debug(`Track marked for preload, setting as default audio option`, hlsAudioTrackForPreload);
          this._hls!.setAudioOption(hlsAudioTrackForPreload);
        }

        let firstLevelIndex = manifestParsedData.firstLevel;
        let firstLevel = manifestParsedData.levels[firstLevelIndex];

        hasVideo =
          !!firstLevel &&
          !!(
            !isNullOrUndefined(firstLevel.videoCodec) ||
            (firstLevel.width && firstLevel.height) ||
            (firstLevel.details && firstLevel.details.fragments[0] && firstLevel.details.fragments[0].elementaryStreams && firstLevel.details.fragments[0].elementaryStreams.video)
          );

        nextCompleteObserver(hlsManifestParsed$, manifestParsedData);
      });

      fromEvent(this._playerDomController.mainMediaVideoElement, 'loadeddata')
        .pipe(take(1))
        .pipe(takeUntil(this._loadBreaker.observer))
        .subscribe({
          next: (event) => {
            nextCompleteObserver(videoLoadedData$);
          },
        });

      fromEvent(this._playerDomController.mainMediaVideoElement, 'loadedmetadata')
        .pipe(take(1))
        .pipe(takeUntil(this._loadBreaker.observer))
        .subscribe({
          next: (event) => {
            nextCompleteObserver(videoLoadedMetadata$);
          },
        });

      hlsManifestParsed$.pipe().subscribe({
        next: (manifestParsedData) => {
          if (!isNullOrUndefined(args.providedMainMedia?.frameRateModel)) {
            let frameRateModel = FrameRateResolver.resolveFrameRateModel(args.providedMainMedia!.frameRateModel!.value, !!args.providedMainMedia!.frameRateModel!.dropFrames);
            nextCompleteObserver(frameRateResolution$, frameRateModel);
          } else {
            // frame rate resolution
            if (loadOptions?.frameRate) {
              try {
                let frameRateModel = FrameRateResolver.resolveFrameRateModel(loadOptions.frameRate, loadOptions.dropFrame);
                nextCompleteObserver(frameRateResolution$, frameRateModel);
              } catch (e) {
                nextCompleteObserver(frameRateResolution$, void 0);
              }
            } else {
              let firstLevelIndex = manifestParsedData.firstLevel;
              let firstLevel = manifestParsedData.levels[firstLevelIndex];
              let firstLevelFrameRate = firstLevel?.frameRate;

              if (firstLevelFrameRate && hasVideo) {
                let frameRateModel = FrameRateResolver.resolveFrameRateModel(firstLevelFrameRate, loadOptions?.dropFrame);
                nextCompleteObserver(frameRateResolution$, frameRateModel);
              } else {
                let firstLevelIndex = manifestParsedData.firstLevel;
                let firstLevel = manifestParsedData.levels[firstLevelIndex];

                if (firstLevel && firstLevel.details && firstLevel.details.fragments && firstLevel.details.fragments[0]) {
                  let firstFragment = firstLevel.details.fragments[0];
                  let firstFragmentUrl = firstFragment.url;
                  if (StringUtil.isNonEmpty(firstFragmentUrl)) {
                    MediaMetadataResolver.getMediaMetadata(firstFragmentUrl, ['firstVideoTrackFrameRate'])
                      .pipe(map((p) => p.firstVideoTrackFrameRate))
                      .subscribe({
                        next: (frameRate) => {
                          if (frameRate) {
                            let frameRateModel = FrameRateResolver.resolveFrameRateModel(frameRate, loadOptions?.dropFrame);
                            nextCompleteObserver(frameRateResolution$, frameRateModel);
                          } else {
                            nextCompleteObserver(frameRateResolution$, void 0);
                          }
                        },
                        error: (err) => {
                          nextCompleteObserver(frameRateResolution$, void 0);
                        },
                      });
                  } else {
                    nextCompleteObserver(frameRateResolution$, void 0);
                  }
                } else {
                  nextCompleteObserver(frameRateResolution$, void 0);
                }
              }
            }
          }
        },
      });

      combineLatest([hlsMediaAttached$, hlsManifestParsed$, hlsFragParsingInitSegment$])
        .pipe(takeUntil(this._loadBreaker.observer))
        .pipe(take(1))
        .subscribe(([mediaAttached, manifestParsed, fragParsingInitSegment]) => {
          if (hasInitSegment) {
            let preloadedLevel = this._hls!.levels.find((p, index) => p.details && p.details.fragments && p.details.fragments[0]);
            if (preloadedLevel?.details?.fragments[0]) {
              if (!isNullOrUndefined(args.providedMainMedia?.initSegmentTimeOffset)) {
                console.debug(`firstVideoTrackInitSegmentTime already provided`);
                nextCompleteObserver(initSegmentResolution$, args.providedMainMedia?.initSegmentTimeOffset);
              } else {
                MediaMetadataResolver.getMediaMetadata(preloadedLevel.details.fragments[0].url, ['firstVideoTrackInitSegmentTime']).subscribe({
                  next: (mediaMetadata) => {
                    let initSegmentTimeOffset = mediaMetadata.firstVideoTrackInitSegmentTime;
                    // console.debug(`Init segment resolved to`, initSegmentTimeOffset);
                    nextCompleteObserver(initSegmentResolution$, initSegmentTimeOffset);
                  },
                  error: (err) => {
                    console.debug(`Could not resolve init segment time offset, setting default`);
                    nextCompleteObserver(initSegmentResolution$, 0);
                  },
                });
              }
            } else {
              console.error('First fragment not detected. How to resolve init segment time offset?');
              nextCompleteObserver(initSegmentResolution$, void 0);
            }
          } else {
            nextCompleteObserver(initSegmentResolution$, void 0);
          }
        });

      combineLatest([hlsMediaAttached$, hlsManifestParsed$, initSegmentResolution$, videoLoadedData$, videoLoadedMetadata$, frameRateResolution$])
        .pipe(takeUntil(this._loadBreaker.observer))
        .pipe(take(1))
        .subscribe(([mediaAttached, manifestParsed, initSegmentTimeOffset, videoLoadedData, videoLoadedMetadata, frameRateModel]) => {
          let duration: number;

          if (!isNullOrUndefined(args.providedMainMedia?.duration)) {
            duration = args.providedMainMedia!.duration!;
          } else {
            if (loadOptions && loadOptions.duration && !isNullOrUndefined(loadOptions.duration)) {
              let parseResult = z.coerce.number().min(0).safeParse(loadOptions.duration);
              if (parseResult.success) {
                duration = parseResult.data;
              } else {
                errorCompleteObserver(rootObserver, `Invalid duration "${loadOptions.duration}"`);
                return;
              }
            } else {
              duration = this._playerDomController.mainMediaVideoElement.duration;
            }
          }

          if (!frameRateModel) {
            errorCompleteObserver(rootObserver, `Frame rate could not be determined. Try by providing frame rate in load options.`);
            return;
          }

          if (isDrm) {
            console.warn(`Init segment time offset for DRM videos set to undefined`);
            initSegmentTimeOffset = void 0;
          }

          let ffomTimecodeModel: TimecodeModel | undefined;
          if (loadOptions?.ffom) {
            let timecodeConverter = TimecodeConverter.create({
              frameRateModel: frameRateModel,
            });
            ffomTimecodeModel = timecodeConverter.parseValueTextToTimecodeModel(loadOptions.ffom);
          }

          args
            .mainMediaEssentialArgsHook({
              isDrm: isDrm,
              duration: duration,
              frameRateModel: frameRateModel,
              initSegmentTimeOffset: initSegmentTimeOffset,
              ffomTimecodeModel: ffomTimecodeModel,
            })
            .pipe(takeUntil(this._loadBreaker.observer))
            .subscribe({
              next: () => {
                nextCompleteObserver(mainMediaEssentialArgsHookCompleted$);
              },
              error: (err) => {
                errorCompleteObserver(mainMediaEssentialArgsHookCompleted$, err);
              },
            });

          let hlsVideo = new HlsVideo({
            source: new UrlSource(url),
            sourceFileFormatType: FileFormatType.HLS,
            loadStage: OpStage.of(OpStageStatus.SUCCESS),
            levels: hls.levels.map((p, index) => ({
              index: index,
              id: p.id,
              bitrate: p.bitrate,
              url: p.url ? p.url[0] : undefined,
            })),
            duration: duration,
          });

          let hlsAudios = hls.allAudioTracks.map((hlsMediaPlaylist) => {
            return new HlsAudio({
              loadStage: OpStage.of(OpStageStatus.SUCCESS),
              source: new UrlSource(hlsMediaPlaylist.url),
              sourceFileFormatType: FileFormatType.HLS,
              mediaPlaylist: {
                id: hlsMediaPlaylist.id,
                type: hlsMediaPlaylist.type,
                url: hlsMediaPlaylist.url,
                audioCodec: hlsMediaPlaylist.audioCodec,
                channels: hlsMediaPlaylist.channels,
                name: hlsMediaPlaylist.name,
                default: hlsMediaPlaylist.default,
                autoselect: hlsMediaPlaylist.autoselect,
                lang: hlsMediaPlaylist.lang,
                forced: hlsMediaPlaylist.forced,
                instreamId: hlsMediaPlaylist.instreamId,
                characteristics: hlsMediaPlaylist.characteristics,
              },
              duration: duration,
            });
          });

          // subtitles
          this._hls!.subtitleTrack = -1;
          this._hls!.subtitleDisplay = false;

          let hlsTextTracks: HlsTextTrack[] = [];
          if (hls.allSubtitleTracks.length > 0) {
            hlsTextTracks = hls.allSubtitleTracks.map((hlsMediaPlaylist) => {
              return new HlsTextTrack({
                loadStage: OpStage.of(OpStageStatus.SUCCESS),
                source: new UrlSource(hlsMediaPlaylist.url),
                sourceFileFormatType: FileFormatType.HLS,
                mediaPlaylist: {
                  id: hlsMediaPlaylist.id,
                  type: hlsMediaPlaylist.type,
                  url: hlsMediaPlaylist.url,
                  audioCodec: hlsMediaPlaylist.audioCodec,
                  channels: hlsMediaPlaylist.channels,
                  name: hlsMediaPlaylist.name,
                  default: hlsMediaPlaylist.default,
                  autoselect: hlsMediaPlaylist.autoselect,
                  lang: hlsMediaPlaylist.lang,
                  forced: hlsMediaPlaylist.forced,
                  instreamId: hlsMediaPlaylist.instreamId,
                  characteristics: hlsMediaPlaylist.characteristics,
                },
              });
            });
          }

          let allTracks = [hlsVideo, ...hlsAudios, ...hlsTextTracks];

          args
            .tracksCreatedHook(allTracks)
            .pipe(takeUntil(this._loadBreaker.observer))
            .subscribe({
              next: () => {
                nextCompleteObserver(tracksCreatedHookCompleted$);
              },
              error: (err) => {
                errorCompleteObserver(tracksCreatedHookCompleted$, err);
              },
            });
        });

      this._hls.on(HlsEvents.ERROR, this.onHlsError);
      this._hls.loadSource(url);
      this._hls.attachMedia(this._playerDomController.mainMediaVideoElement);
    });
  }

  resolveAudioTrackIdentifier(track: HlsAudioState): AudioTrackIdentifier {
    return track.mediaPlaylist.id;
  }

  isAudioTrackActive(track: HlsAudioState): boolean {
    let hlsTrackId = this._hls!.audioTrack;
    return this.resolveAudioTrackIdentifier(track) === hlsTrackId;
  }

  resolveActiveAudioTracks(tracks: HlsAudioState[]): AudioState[] {
    return tracks.filter((p) => this.isAudioTrackActive(p));
  }

  switchAudioTrack(track: HlsAudioState, activate: boolean): Observable<void> {
    return new Observable((observer) => {
      let newActiveIdentifier = this.resolveAudioTrackIdentifier(track);
      // console.debug(`Switch HLS audio track: ${newActiveIdentifier} => ${activate}`);

      if (activate) {
        if (this._hls!.audioTrack !== newActiveIdentifier) {
          this._onEvent$
            .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_AUDIO_SWITCHED))
            .pipe(filter((p) => p.data.activeAudioIdentifiers.includes(newActiveIdentifier)))
            .pipe(take(1), timeout(PLAYER_CONTROLLER_DEFAULTS.HLS.audioTrackSwitchTimeout))
            .subscribe({
              next: (event) => {
                nextCompleteObserver(observer);
              },
              error: (error) => {
                console.debug(`Never caught ${HlsEvents.AUDIO_TRACK_SWITCHED} for audio track: ${newActiveIdentifier}`);
                console.debug(error);
                errorCompleteObserver(observer, error);
              },
            });
          this._hls!.audioTrack = newActiveIdentifier; // this triggers AUDIO_TRACK_SWITCHED
        } else {
          nextCompleteObserver(observer);
        }
      } else {
        // console.debug(`Switch HLS audio track: ${newActiveIdentifier} => ${activate} not supported`);
        nextCompleteObserver(observer);
      }
    });
  }

  get textTracksDisplayed(): boolean {
    return this._hls!.subtitleDisplay;
  }

  setTextTracksDisplayed(textTracksDisplayed: boolean) {
    this._hls!.subtitleDisplay = textTracksDisplayed;
  }

  resolveTextTrackIdentifier(track: HlsTextTrackState): TextTrackIdentifier {
    return track.mediaPlaylist.id;
  }

  isTextTrackActive(track: HlsTextTrackState): boolean {
    let hlsTrackId = this._hls!.subtitleTrack;
    return this.resolveTextTrackIdentifier(track) === hlsTrackId;
  }

  resolveActiveTextTracks(textTrackStates: HlsTextTrackState[]): TextTrackState[] {
    return textTrackStates.filter((p) => this.isTextTrackActive(p));
  }

  switchTextTrack(track: HlsTextTrackState, activate: boolean): Observable<void> {
    return new Observable((observer) => {
      let trackIdentifier = this.resolveTextTrackIdentifier(track);
      if (activate) {
        if (this._hls!.subtitleTrack !== trackIdentifier) {
          console.debug(`Switch HLS text track: ${trackIdentifier} => ${activate}`);

          this._onEvent$
            .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_TEXT_TRACK_SWITCHED))
            .pipe(filter((p) => p.data.activeTextTrackIdentifiers.includes(trackIdentifier)))
            .pipe(take(1), timeout(PLAYER_CONTROLLER_DEFAULTS.HLS.textTrackSwitchTimeout))
            .subscribe({
              next: (event) => {
                this.setTextTracksDisplayed(true);
                nextCompleteObserver(observer);
              },
              error: (error) => {
                console.debug(`Never caught ${HlsEvents.SUBTITLE_TRACK_SWITCH} for text track: ${trackIdentifier}`);
                console.debug(error);
                errorCompleteObserver(observer, error);
              },
            });
          this._hls!.subtitleTrack = trackIdentifier; // this triggers SUBTITLE_TRACK_SWITCH
        } else {
          nextCompleteObserver(observer);
        }
      } else {
        if (this._hls!.subtitleTrack === trackIdentifier) {
          console.debug(`Switch HLS text track: ${trackIdentifier} => ${activate}`);
          this._hls!.subtitleTrack = -1;
        }
        nextCompleteObserver(observer);
      }
    });
  }

  get hls(): Hls | undefined {
    return this._hls;
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

  protected destroyHls() {
    try {
      if (this._hls) {
        console.debug(`Destroying HLS instance sessionId=${this._hls.sessionId}`);
        this._hls.stopLoad();
        this._hls.detachMedia();
        this._hls.removeAllListeners();
        this._hls.destroy();
        this._hls = void 0;
      }
    } catch (e) {
      console.error(e);
    }
  }

  destroy() {
    super.destroy();

    this.destroyHls();
  }
}
