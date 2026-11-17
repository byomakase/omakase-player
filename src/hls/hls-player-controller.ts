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
  type Fragment,
  type FragLoadedData,
  type FragParsedData,
  type HlsConfig,
  type InitPTSFoundData,
  type ManifestParsedData,
  type MediaKeySessionContext,
  type MediaPlaylist,
  type SubtitleFragProcessedData,
} from 'hls.js';
import Decimal from 'decimal.js';
import {type AudioState, LiveMode, type MainMediaLoadOptions, type MainMediaState, type MainMediaUpdateableAttrs, type TextTrackState} from '../media';
import {catchError, combineLatest, filter, forkJoin, fromEvent, interval, map, Observable, of, ReplaySubject, Subject, type Subscription, switchMap, take, takeUntil, throwError, timeout} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {HlsJsFactory} from './hls-js-factory';
import {createHlsPlaylistAlignLoader, resolvePlaylistMediaSequence} from './hls-playlist-align-loader';
import {type FrameRateModel, FrameRateResolver} from '../common/frame-rate';
import {isNullOrUndefined} from '../util/util-functions';
import {MediaMetadataResolver} from '../tools';
import {TimecodeConverter, type TimecodeModel} from '../common/timecode';
import {HlsAudio, type HlsAudioState, HlsTextTrack, type HlsTextTrackState, HlsVideo} from './hls-track';
import {type AudioTrackIdentifier, BasePlayerController, type PlayerControllerConfig, type TextTrackIdentifier} from '../player/player-controller';
import {z} from 'zod';
import {BrowserProvider} from '../common/browser-provider';
import {type LiveTimelineAnchor, type LoadMainMediaArgsType, PlayerControllerEventType, type PlayerDomController, type PlayerLiveState, toMediaLiveState} from '../player/player-controller-api';
import {UrlSource} from '../source';
import {AuthConfig, FileFormatType, MediaTemporalFormat, type MediaTemporalFormatValueMap} from '../common';
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
  },
};

export class HlsPlayerController extends BasePlayerController<HlsPlayerControllerConfig> {
  protected _hls: Hls | undefined;

  protected _wasLive: boolean = false;
  protected _liveStateTickSubscription: Subscription | undefined;
  protected _lastLiveSignature: string | undefined;
  protected _manifestUpdatedTime: number = 0;
  /** Embedded cues already shifted by {@link resolveEmbeddedCueTimeOffset}, so they're never shifted twice. */
  protected _shiftedEmbeddedCues = new WeakSet<TextTrackCue>();

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

  wireEvents(mainMediaState: MainMediaState) {
    super.wireEvents(mainMediaState);

    // cues hls.js appended before the offset was known
    this.shiftEmbeddedCues();

    let liveState = this.resolveLiveState();
    if (liveState) {
      this.onEvent$
        .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE))
        .pipe(takeUntil(this._loadBreaker.observer), takeUntil(this._destroyBreaker.observer))
        .subscribe((event) => {
          if (event.data.mediaElementPlaybackState.paused) {
            this.startPausedLiveStateTick();
          } else {
            this.stopPausedLiveStateTick();
          }
        });
    }
  }

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    // console.debug(`loadMainMedia args: `, args);

    let url = args.url;
    if (!url) {
      return throwError(() => new Error(`Main media url not provided`));
    }

    this._loadBreaker.break();

    this._wasLive = false;
    this._lastLiveSignature = void 0;
    this._manifestUpdatedTime = 0;

    this.destroyHls();

    this.unwireEvents();

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

      const timelineOffset = this.resolveTimelineOffset(args.liveTimelineAnchor);
      if (timelineOffset !== void 0) {
        hls.config.timelineOffset = timelineOffset;
      }

      const liveTimelineAnchor = args.liveTimelineAnchor;
      if (liveTimelineAnchor) {
        this.alignLiveTimeline(hls, liveTimelineAnchor);

        const alignPlayheadToWindow = () => {
          const videoElement = this._playerDomController.mainMediaVideoElement;
          const buffered = videoElement.buffered;

          if (!buffered.length) {
            return; // nothing appended yet
          }

          // runs once, before the session restores its own position
          hls.off(HlsEvents.FRAG_BUFFERED, alignPlayheadToWindow);

          if (videoElement.currentTime < buffered.start(0) || videoElement.currentTime > buffered.end(buffered.length - 1)) {
            videoElement.currentTime = buffered.start(0);
          }
        };

        hls.on(HlsEvents.FRAG_BUFFERED, alignPlayheadToWindow);
      } else {
        this.anchorTimelineAtFirstFragment(hls);
      }

      let that = this;

      let hasDrm = false;
      this._hls.once(HlsEvents.KEY_LOADED, function (event, data) {
        hasDrm = true;
      });

      this._hls!.on(HlsEvents.AUDIO_TRACK_SWITCHED, function (event, data) {
        that._onEvent$.next({
          type: PlayerControllerEventType.PLAYER_CONTROLLER_AUDIO_SWITCHED,
          data: {
            activeAudioIdentifiers: [hls.audioTrack],
          },
        });
      });

      this._shiftedEmbeddedCues = new WeakSet<TextTrackCue>();
      // hls.js appends parsed cues to native text track right before it triggers SUBTITLE_FRAG_PROCESSED
      this._hls!.on(HlsEvents.SUBTITLE_FRAG_PROCESSED, function (event, data: SubtitleFragProcessedData) {
        if (data.success) {
          that.shiftEmbeddedCues(data.frag.level);
        }
      });

      this._hls!.on(HlsEvents.SUBTITLE_TRACK_SWITCH, function (event, data) {
        that._onEvent$.next({
          type: PlayerControllerEventType.PLAYER_CONTROLLER_TEXT_TRACK_SWITCHED,
          data: {
            activeTextTrackIdentifiers: [data.id],
            textTracksDisplayed: that.textTracksDisplayed,
          },
        });
      });

      // LEVEL_UPDATED fires on every live playlist reload (i.e. when a new segment appears) and when playlist ends.
      // enforceLiveWindowFloor() runs first and, when it seeks, does so synchronously (currentTime
      // is updated immediately, even though full seek completion/re-buffering is async) - so
      // emitLiveStateUpdate()'s geometry reflow, which runs after, sees the corrected currentTime
      // and positions the playhead inside the new window on the very first render. The other way
      // around, the reflow would render once against the just-advanced window while currentTime
      // still held the about-to-be-evicted position, flashing the playhead off-screen until the
      // seek's events caught up.
      this._hls!.on(HlsEvents.LEVEL_UPDATED, function (event, data) {
        that._manifestUpdatedTime = Date.now();
        that.enforceLiveWindowFloor();
        that.emitLiveStateUpdate(true);
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

      // fMP4: hls.js shifts timeline by initPTS, so that the first media fragment it parses starts at its playlist time. initPTS can be found
      // more than once, ie. placeholder for init segment without samples, then the one of the first media fragment, so the latest one is taken
      // once the first media fragment is parsed
      let latestInitPts: number | undefined;
      let onInitPtsFound = (event: HlsEvents.INIT_PTS_FOUND, data: InitPTSFoundData) => {
        if (data.id === 'main') {
          latestInitPts = data.initPTS / data.timescale;
        }
      };
      hls.on(HlsEvents.INIT_PTS_FOUND, onInitPtsFound);
      let initPts$ = new ReplaySubject<number>(1);

      // MPEG-TS: where hls.js placed the first video frame, measured on the first main fragment it parsed (hls.js anchors
      // its timeline on that fragment). Emits undefined if media loaded data without it
      let firstVideoFrameTime$ = new ReplaySubject<number | undefined>(1);
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
        nextCompleteObserver(initPts$, latestInitPts ?? 0);
        nextCompleteObserver(firstVideoFrameTime$, Math.max(0, videoStreamInfo.startPTS - data.frag.start));
      };
      hls.on(HlsEvents.FRAG_PARSED, onFragParsed);

      hls.subtitleDisplay = false;

      //IMPORTANT - we have to switch before the frag starts getting loaded as cues
      // if there is no default there is no issue, hence the guard
      this._hls!.once(HlsEvents.SUBTITLE_TRACKS_UPDATED, function (event, data) {
        let autoSelects = data.subtitleTracks.some((subtitleTrack) => subtitleTrack.default) || !!hls.config.subtitlePreference;

        if (!autoSelects) {
          return;
        }

        hls.once(HlsEvents.SUBTITLE_TRACK_SWITCH, function () {
          hls.subtitleTrack = -1;
          hls.subtitleDisplay = false;
        });
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
            hls.off(HlsEvents.FRAG_PARSED, onFragParsed);
            // no-op if first video frame time was already emitted
            nextCompleteObserver(firstVideoFrameTime$, void 0);
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
                try {
                  let frameRateModel = FrameRateResolver.resolveFrameRateModel(firstLevelFrameRate, loadOptions?.dropFrame);
                  nextCompleteObserver(frameRateResolution$, frameRateModel);
                } catch (e) {
                  errorCompleteObserver(rootObserver, e);
                }
              } else {
                let firstLevelIndex = manifestParsedData.firstLevel;
                let firstLevel = manifestParsedData.levels[firstLevelIndex];

                if (firstLevel && firstLevel.details && firstLevel.details.fragments && firstLevel.details.fragments[0]) {
                  let firstFragment = firstLevel.details.fragments[0];
                  let firstFragmentUrl = firstFragment.url;
                  if (loadOptions?.forceSkipMetadataResolution) {
                    nextCompleteObserver(frameRateResolution$, void 0);
                  } else if (StringUtil.isNonEmpty(firstFragmentUrl)) {
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
              } else if (loadOptions?.forceSkipMetadataResolution) {
                nextCompleteObserver(initSegmentResolution$, 0);
              } else {
                this.resolveFmp4InitSegmentTimeOffset(preloadedLevel.details.fragments[0], initPts$)
                  .pipe(takeUntil(this._loadBreaker.observer))
                  .subscribe((initSegmentTimeOffset) => {
                    nextCompleteObserver(initSegmentResolution$, initSegmentTimeOffset);
                  });
              }
            } else {
              console.error('First fragment not detected. How to resolve init segment time offset?');
              nextCompleteObserver(initSegmentResolution$, void 0);
            }
          } else if (hasVideo) {
            this.resolveMpegTsInitSegmentTimeOffset(firstVideoFrameTime$, args.providedMainMedia?.initSegmentTimeOffset)
              .pipe(takeUntil(this._loadBreaker.observer))
              .subscribe((initSegmentTimeOffset) => {
                nextCompleteObserver(initSegmentResolution$, initSegmentTimeOffset);
              });
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

          if (hasDrm) {
            console.warn(`Init segment time offset for DRM videos set to undefined`);
            initSegmentTimeOffset = void 0;
          }

          let hlsVideo: HlsVideo | undefined;
          if (hasVideo) {
            hlsVideo = new HlsVideo({
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
          }

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

          let hasAudio = hlsAudios.length > 0;

          if (hasVideo && !frameRateModel) {
            errorCompleteObserver(rootObserver, `Frame rate could not be determined. Try by providing frame rate in load options.`);
            return;
          }

          if (hasAudio && !hasVideo && !frameRateModel) {
            frameRateModel = FrameRateResolver.FR_100;
          }

          let ffomTimecodeModel: TimecodeModel | undefined;
          if (loadOptions?.ffom && frameRateModel) {
            let timecodeConverter = TimecodeConverter.create({
              frameRateModel: frameRateModel,
              hasVideo: hasVideo,
              hasAudio: hasAudio,
            });
            try {
              ffomTimecodeModel = timecodeConverter.parseValueTextToTimecodeModel(loadOptions.ffom);
            } catch (e) {
              errorCompleteObserver(rootObserver, e);
            }
          }

          let liveState = this.resolveLiveState();
          let essentialArgs: MainMediaUpdateableAttrs = {
            duration: duration,
            frameRateModel: frameRateModel,
            initSegmentTimeOffset: initSegmentTimeOffset,
            ffomTimecodeModel: ffomTimecodeModel,
            hasDrm: hasDrm,
            hasVideo: hasVideo,
            hasAudio: hlsAudios.length > 0,
            isLive: !!liveState,
            liveState: liveState ? toMediaLiveState(liveState) : void 0,
          };

          args
            .mainMediaEssentialArgsHook(essentialArgs)
            .pipe(takeUntil(this._loadBreaker.observer))
            .subscribe({
              next: () => {
                nextCompleteObserver(mainMediaEssentialArgsHookCompleted$);
              },
              error: (err) => {
                errorCompleteObserver(mainMediaEssentialArgsHookCompleted$, err);
              },
            });

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

          let allTracks = [];

          if (hlsVideo) {
            allTracks.push(hlsVideo);
          }

          if (hlsAudios.length > 0) {
            allTracks.push(...hlsAudios);
          }

          if (hlsTextTracks.length > 0) {
            allTracks.push(...hlsTextTracks);
          }

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

  /**
   * syncs LSP while paused
   */
  protected startPausedLiveStateTick(): void {
    this.stopPausedLiveStateTick();

    this._liveStateTickSubscription = interval(PLAYER_CONTROLLER_DEFAULTS.liveStateTickIntervalMs)
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        if (this._playerDomController.mainMediaVideoElement.paused) {
          this.emitLiveStateUpdate(false);
        }
      });
  }

  protected stopPausedLiveStateTick(): void {
    this._liveStateTickSubscription?.unsubscribe();
    this._liveStateTickSubscription = void 0;
  }

  protected emitLiveStateUpdate(manifestChanged: boolean): void {
    let liveState = this.resolveLiveState();

    // no emit for vod
    if (!liveState && !this._wasLive) {
      return;
    }

    let signature = liveState ? `${liveState.liveStartTime}|${liveState.liveEdgeDuration}|${liveState.liveSyncPosition}` : 'ended';

    if (!manifestChanged && signature === this._lastLiveSignature) {
      return;
    }

    this._wasLive = !!liveState;
    this._lastLiveSignature = signature;

    this._onEvent$.next({
      type: PlayerControllerEventType.PLAYER_CONTROLLER_LIVE_STATE_UPDATE,
      data: {liveState: liveState, manifestChanged: manifestChanged},
    });
  }

  protected override emitPlaybackProgress(): void {
    super.emitPlaybackProgress();
    this.emitLiveStateUpdate(false);
  }

  protected override _play(): Observable<void> {
    let liveState = this.resolveLiveState();
    if (liveState && this.getCurrentTime() < liveState.liveStartTime) {
      // in case we fall out of current manifest window
      return this.seekTo(liveState.liveStartTime).pipe(switchMap(() => super._play()));
    }
    return super._play();
  }

  /**
   * Continuous live's sliding window evicts its oldest fragment on every manifest reload. If the
   * playhead is paused at a position behind the new window start, that position no longer has
   * fetchable media - snap it forward to the first still-available position instead of leaving it
   * stranded there. Only while paused: during playback, eviction naturally advances past old
   * fragments as playback itself moves forward, so no correction is needed. EVENT-mode playlists
   * never evict, so they're excluded too.
   */
  protected enforceLiveWindowFloor(): void {
    if (!this._mainMediaState || !this._playerDomController.mainMediaVideoElement.paused) {
      return;
    }

    let liveState = this.resolveLiveState();
    if (!liveState || liveState.liveMode !== LiveMode.CONTINUOUS) {
      return;
    }

    if (this.getCurrentTime() < liveState.liveStartTime) {
      this.seekTo(liveState.liveStartTime).subscribe();
    }
  }

  /**
   * Resolves live info from the loaded HLS playlist. Returns `isLive: false` for VOD or before
   * any playlist details are available.
   */
  resolveLiveState(): PlayerLiveState | undefined {
    let details = this._hls?.loadLevelObj?.details ?? this._hls?.levels.find((level) => level.details)?.details;
    let twoFrameTimeOffset = this._mainMediaState?.frameRateModel ? Decimal.mul(this._mainMediaState.frameRateModel.frameDuration, 2).toNumber() : 0;

    if (!details || !details.live) {
      return undefined;
    }

    // start of first fragment from current level
    let liveStartTime = Math.max(0, details.fragmentStart);
    // end of last fragment from level
    let liveEdgeDuration = Math.max(liveStartTime, details.edge);

    let liveSyncPosition = this._hls?.liveSyncPosition ?? liveEdgeDuration;

    if (this._mainMediaState && !isNullOrUndefined(this._mainMediaState.duration)) {
      let currentTime = this.getCurrentTime();
      if (liveSyncPosition - twoFrameTimeOffset < currentTime) {
        // if close enough we lie due to UI reasons
        liveSyncPosition = currentTime;
      }
    }

    let liveState: PlayerLiveState = {
      isLive: true,
      liveStartTime: liveStartTime,
      liveEdgeDuration: liveEdgeDuration,
      liveSyncPosition: liveSyncPosition,
      leadingSegmentDurations: details.fragments.slice(0, PLAYER_CONTROLLER_DEFAULTS.liveLeadingSegmentsCaptured).map((fragment) => fragment.duration),
      startSN: details.startSN,
      duration: liveSyncPosition,
      targetDuration: details.targetduration,
      liveMode: details.type === 'EVENT' ? LiveMode.EVENT : LiveMode.CONTINUOUS,
      manifestUpdatedTime: this._manifestUpdatedTime,
    };

    return liveState;
  }

  /**
   * Resolves where the first video frame of fMP4 stream lands on media element timeline: first fragment's lowest video presentation time
   * as appended to SourceBuffer, without edit lists which browsers ignore in MSE, see {@link MediaMetadataResolver.getHlsFmp4MseFirstVideoFrameTime},
   * shifted the same way hls.js shifts fMP4 timeline - hls.js sets SourceBuffer timestampOffset to -initPTS, where initPTS is decode time of
   * the first media fragment it parses minus that fragment's playlist time.
   *
   * @param firstFragment First fragment of media playlist
   * @param initPts$ hls.js initPTS in seconds, emitted once the first media fragment is parsed
   */
  protected resolveFmp4InitSegmentTimeOffset(firstFragment: Fragment, initPts$: Observable<number>): Observable<number | undefined> {
    return forkJoin([MediaMetadataResolver.getHlsFmp4MseFirstVideoFrameTime(firstFragment), initPts$.pipe(take(1))]).pipe(
      map(([firstVideoFrameTime, initPts]) => (firstVideoFrameTime ?? 0) - initPts)
    );
  }

  /**
   * Resolves where the first video frame of MPEG-TS stream lands on media element timeline. hls.js rewrites MPEG-TS
   * timestamps relative to its initPTS, which changed in hls.js 1.6.18 from lowest video PTS to lowest video DTS
   * (https://github.com/video-dev/hls.js/issues/8102), so instead of predicting it, it is taken from the position hls.js
   * reports for the first fragment it parsed. Falls back to 0 if media loaded without it.
   */
  protected resolveMpegTsInitSegmentTimeOffset(firstVideoFrameTime$: Observable<number | undefined>, providedInitSegmentTimeOffset: number | undefined): Observable<number | undefined> {
    if (!isNullOrUndefined(providedInitSegmentTimeOffset)) {
      console.debug(`MPEG-TS init segment time offset already provided`);
      return of(providedInitSegmentTimeOffset);
    }

    return firstVideoFrameTime$.pipe(
      take(1),
      map((measured) => {
        console.debug(`MPEG-TS init segment time offset measured: ${measured}`);
        return measured ?? 0;
      })
    );
  }

  /**
   * Anchors the timeline on the first fragment, then hands playback back to the live edge.
   */
  protected anchorTimelineAtFirstFragment(hls: Hls): void {
    hls.config.startPosition = 0;

    const jumpToLive = (event: HlsEvents.FRAG_BUFFERED, data: {frag: {type: string}}) => {
      if (data.frag.type !== 'main') {
        return;
      }

      hls.off(HlsEvents.FRAG_BUFFERED, jumpToLive);

      // VOD keeps the position it was given; only live has an edge to return to
      const liveState = this.resolveLiveState();
      if (liveState) {
        this._playerDomController.mainMediaVideoElement.currentTime = liveState.liveSyncPosition;
      }
    };

    hls.on(HlsEvents.FRAG_BUFFERED, jumpToLive);
  }

  /**
   * Corrects {@link resolveTimelineOffset} from the resuming instance's own media playlist, which is
   * the last moment before hls.js shifts the fragments with it.
   *
   * Takes the `pLoader` slot to get there. Subclasses that build their own manifests already know the
   * offset exactly and override this to do nothing, keeping the slot for their own loader.
   */
  protected alignLiveTimeline(hls: Hls, liveTimelineAnchor: LiveTimelineAnchor): void {
    let aligned = false;

    hls.config.pLoader = createHlsPlaylistAlignLoader((playlistText) => {
      if (aligned) {
        return;
      }
      aligned = true;

      const alignedOffset = this.resolveAlignedTimelineOffset(liveTimelineAnchor, playlistText);
      if (alignedOffset !== void 0) {
        hls.config.timelineOffset = alignedOffset;
      }
    });
  }

  protected resolveTimelineOffset(liveTimelineAnchor: LiveTimelineAnchor | undefined): number | undefined {
    return liveTimelineAnchor ? Math.max(0, liveTimelineAnchor.liveStartTime) : void 0;
  }

  protected resolveAlignedTimelineOffset(liveTimelineAnchor: LiveTimelineAnchor, playlistText: string): number | undefined {
    const evictedCount = resolvePlaylistMediaSequence(playlistText) - liveTimelineAnchor.startSN;
    if (evictedCount < 0 || evictedCount > liveTimelineAnchor.segmentDurations.length) {
      return void 0;
    }

    const evicted = liveTimelineAnchor.segmentDurations.slice(0, evictedCount).reduce((total, duration) => total + duration, 0);

    return Math.max(0, liveTimelineAnchor.liveStartTime + evicted);
  }

  protected override constrainSeekTime(time: number): number {
    let base = super.constrainSeekTime(time);
    let liveState = this.resolveLiveState();
    if (liveState) {
      // constrain to live window
      return Math.min(liveState.liveSyncPosition, Math.max(liveState.liveStartTime, base));
    }
    return base;
  }

  override getDuration(): MediaTemporalFormatValueMap[MediaTemporalFormat.SECONDS];
  override getDuration<F extends MediaTemporalFormat>(format: F): MediaTemporalFormatValueMap[F];
  override getDuration(format: MediaTemporalFormat = MediaTemporalFormat.SECONDS): MediaTemporalFormatValueMap[MediaTemporalFormat] {
    let liveState = this.resolveLiveState();
    if (liveState) {
      return this._mediaTemporalConverter!.convert(liveState.liveSyncPosition, MediaTemporalFormat.SECONDS, format);
    }
    return super.getDuration(format);
  }

  seekToLive(): Observable<boolean> {
    let liveState = this.resolveLiveState();
    if (!liveState) {
      return of(false);
    }
    return this.seekTo(liveState.liveSyncPosition);
  }

  protected override isLive(): boolean {
    return !!this.resolveLiveState();
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
        // Switch HLS audio track not supported
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
    // queried on every switch, including after the engine is gone - nothing is active without one
    return !!this._hls && this.resolveTextTrackIdentifier(track) === this._hls.subtitleTrack;
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

  /**
   * Time added to cues hls.js renders natively (embedded text). hls.js places cues on media element timeline the same way it places
   * video, relative to its initPTS, while player time starts at first video frame, {@link MainMediaState.initSegmentTimeOffset} later on
   * that timeline (ie. composition offset of B-frames in fMP4, which edit list would remove, but browsers ignore it in MSE). Without it,
   * embedded cues show that much before their time.
   */
  protected resolveEmbeddedCueTimeOffset(): number {
    return this._mainMediaState?.initSegmentTimeOffset ?? 0;
  }

  /**
   * Shifts cues of native text tracks hls.js renders subtitles into by {@link resolveEmbeddedCueTimeOffset}, so they line up with
   * player time like sidecar text tracks do. Cues are shifted once, cues appended before the offset is known are shifted once it is.
   *
   * @param subtitleTrackIndex index in `hls.subtitleTracks` whose text track is shifted, all if not provided
   */
  protected shiftEmbeddedCues(subtitleTrackIndex?: number): void {
    let hls = this._hls;
    if (!hls || !this._mainMediaState) {
      return;
    }

    let offset = this.resolveEmbeddedCueTimeOffset();
    if (!offset) {
      return;
    }

    let subtitleTracks = subtitleTrackIndex === void 0 ? hls.subtitleTracks : hls.subtitleTracks.filter((p, index) => index === subtitleTrackIndex);
    if (subtitleTracks.length === 0) {
      return;
    }

    let videoElement = this._playerDomController.mainMediaVideoElement;
    let trackElementIds = new Set(
      Array.from(videoElement.querySelectorAll('track'))
        .map((p) => p.id)
        .filter((p) => StringUtil.isNonEmpty(p))
    );

    Array.from(videoElement.textTracks)
      .filter((textTrack) => {
        // <track> elements belong to sidecar text tracks, CEA-608/708 tracks (textTrack1..4) are timed by video samples already
        let isHlsSubtitleTextTrack = !trackElementIds.has(textTrack.id) && !Object.keys(textTrack).some((key) => /^textTrack\d$/.test(key));
        return isHlsSubtitleTextTrack && !!textTrack.cues && subtitleTracks.some((subtitleTrack) => this.isSubtitleTextTrack(subtitleTrack, textTrack));
      })
      .forEach((textTrack) => {
        Array.from(textTrack.cues!)
          .filter((cue) => !this._shiftedEmbeddedCues.has(cue))
          .forEach((cue) => {
            this._shiftedEmbeddedCues.add(cue);
            // end first, start can't be after end
            cue.endTime = cue.endTime + offset;
            cue.startTime = cue.startTime + offset;
          });
      });
  }

  /** Same matching hls.js uses to bind subtitle track to native text track */
  private isSubtitleTextTrack(subtitleTrack: MediaPlaylist, textTrack: TextTrack): boolean {
    return (
      (textTrack.kind === 'subtitles' || textTrack.kind === 'captions') &&
      textTrack.label.toLowerCase() === subtitleTrack.name.toLowerCase() &&
      (!textTrack.language || textTrack.language.toLowerCase() === (subtitleTrack.lang || '').toLowerCase())
    );
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
    this.destroyHls();

    super.destroy();
  }
}
