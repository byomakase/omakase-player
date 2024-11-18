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

import {HTMLVideoElementEventKeys, VIDEO_CONTROLLER_CONFIG_DEFAULT, VideoController, VideoControllerConfig} from './video-controller';
import Hls, {FragLoadedData, HlsConfig, MediaPlaylist} from 'hls.js';

import {first, forkJoin, fromEvent, map, Observable, take, takeUntil, timeout} from 'rxjs';
import {z} from 'zod';
import {VttUtil} from '../vtt/vtt-util';
import {Video, VideoLoadOptions} from './model';
import {BasicAuthenticationData, BearerAuthenticationData, CustomAuthenticationData} from '../authentication/model';
import {isNullOrUndefined} from '../util/object-util';
import Decimal from 'decimal.js';
import {StringUtil} from '../util/string-util';
import {CryptoUtil} from '../util/crypto-util';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {OmakaseAudioTrack, SubtitlesVttTrack} from '../types';
import {VideoDomControllerApi} from './video-dom-controller-api';
import {AuthUtil} from '../util/auth-util';

export interface VideoHlsControllerConfig extends VideoControllerConfig {
  hls: Partial<HlsConfig>,
  fetchManifestSubtitleTracks: boolean,
  subtitleDisplay: boolean
}

export const VIDEO_HLS_CONTROLLER_CONFIG_DEFAULT: VideoHlsControllerConfig = {
  ...VIDEO_CONTROLLER_CONFIG_DEFAULT,
  hls: {
    ...Hls.DefaultConfig
  },
  fetchManifestSubtitleTracks: true,
  subtitleDisplay: false
}

export class VideoHlsController extends VideoController<VideoHlsControllerConfig> {
  protected _hls: Hls | undefined;

  constructor(config: Partial<VideoHlsControllerConfig>, videoDomController: VideoDomControllerApi) {
    super({
      ...VIDEO_HLS_CONTROLLER_CONFIG_DEFAULT,
      ...config
    }, videoDomController);

    if (Hls.isSupported()) {
      console.debug('video load with hls.js')
    } else {
      console.error('hls is not supported through MediaSource extensions')
    }
  }

  loadVideoUsingLoader(sourceUrl: string, frameRate: number, options?: VideoLoadOptions): Observable<Video> {
    return passiveObservable<Video>(observer => {
      this.destroyHls();

      this._hls = new Hls({
        ...this._config.hls
      });

      this.overrideHlsMethods();

      if (AuthUtil.authentication) {
        this._hls.config.xhrSetup = (xhr: XMLHttpRequest, url: string) => {
          if (AuthUtil.authentication!.type === 'basic') {
            const token = btoa(`${(AuthUtil.authentication as BasicAuthenticationData)!.username}:${(AuthUtil.authentication as BasicAuthenticationData)!.password}`);
            xhr.setRequestHeader('Authorization', `Basic ${token}`);
          } else if (AuthUtil.authentication!.type === 'bearer') {
            xhr.setRequestHeader('Authorization', `Bearer ${(AuthUtil.authentication as BearerAuthenticationData)!.token}`);
          } else {
            const authenticationData = (AuthUtil.authentication as CustomAuthenticationData)!.headers(url);
            for (const header in authenticationData.headers) {
              xhr.setRequestHeader(header, authenticationData.headers[header]);
            }
          }
        }
      }

      this._hls.on(Hls.Events.ERROR, function (event, data) {
        let errorType = data.type;
        let errorDetails = data.details;
        let errorFatal = data.fatal;

        /**
         * Temporarily excluding audioTrackLoadError from error handler.
         * This error propagation is causing that HLS streams, with audio group defined but without audio tracks,
         * are not to be playable by OmakasePlayer
         */
        if (!errorDetails.includes('audioTrackLoadError')) {
          errorCompleteObserver(observer, `Error loading video. Hls error details: ${errorDetails}`)
        }
      });

      let hlsMediaAttached$ = new Observable<boolean>(o$ => {
        // MEDIA_ATTACHED event is fired by hls object once MediaSource is ready
        this._hls!.once(Hls.Events.MEDIA_ATTACHED, function (event, data) {
          console.debug('video element and hls.js are now bound together');
          o$.next(true);
          o$.complete();
        });
      })

      let audioOnly = false;
      let hlsManifestParsed$ = new Observable<boolean>(o$ => {
        this._hls!.once(Hls.Events.MANIFEST_PARSED, function (event, data) {
          console.debug(event, data);

          let firstLevelIndex = data.firstLevel;
          let firstLevel = data.levels[firstLevelIndex];

          let hasVideo = !!(!isNullOrUndefined(firstLevel.videoCodec) || (firstLevel.width && firstLevel.height) || (firstLevel.details && firstLevel.details.fragments[0] && firstLevel.details.fragments[0].elementaryStreams && firstLevel.details.fragments[0].elementaryStreams.video))

          audioOnly = !hasVideo; // if it doesn't contain video / audio, it'll still be audioOnly for now

          o$.next(true);
          o$.complete();
        });
      })

      let hasInitSegment = false;
      let hlsFragParsingInitSegment$ = new Observable<boolean>(o$ => {
        this._hls!.once(Hls.Events.FRAG_PARSING_INIT_SEGMENT, function (event, data) {
          if ((data as FragLoadedData).frag.sn === 'initSegment' && (data as FragLoadedData).frag.data) {
            hasInitSegment = true;
          }
          o$.next(true);
          o$.complete();
        });
      })

      // let hlsAudioTracksUpdated$ = new Observable<boolean>(o$ => {
      //   this._hls!.once(Hls.Events.AUDIO_TRACKS_UPDATED, function (event, data) {
      //     console.debug(event, data);
      //     o$.next(true);
      //     o$.complete();
      //   });
      // })

      let videoLoadedData$ = fromEvent(this.videoElement, HTMLVideoElementEventKeys.LOADEDDATA).pipe(first());
      let videoLoadedMetadata$ = fromEvent(this.videoElement, HTMLVideoElementEventKeys.LOADEDMETEDATA).pipe(first());

      forkJoin([hlsMediaAttached$, hlsManifestParsed$, hlsFragParsingInitSegment$, videoLoadedData$, videoLoadedMetadata$]).pipe(first()).subscribe(result => {
        let duration: number;
        if (options && options.duration) {
          duration = z.coerce.number().parse(options.duration);
          duration = duration ? duration : this.videoElement.duration;
        } else {
          duration = this.videoElement.duration;
        }

        let dropFrame = options && options.dropFrame !== void 0 ? options.dropFrame : false;
        let initSegmentTimeOffset = hasInitSegment ? Decimal.div(2, frameRate).toNumber() : void 0; // TODO resolve time offset dynamically

        let video: Video = {
          sourceUrl: sourceUrl,
          frameRate: frameRate,
          dropFrame: dropFrame,
          duration: duration,
          totalFrames: Decimal.mul(duration, frameRate).ceil().toNumber(),
          frameDuration: Decimal.div(1, frameRate).toNumber(),
          audioOnly: audioOnly,
          initSegmentTimeOffset: initSegmentTimeOffset
        }

        this._hls!.on(Hls.Events.FRAG_LOADED, (event, data) => {
          if (data.frag.endList && data.frag.type == 'main' && video.correctedDuration && (video.correctedDuration > (data.frag.start + data.frag.duration))) {
            /**
             * if we land on exact time of the frame start at the end of video, there is the chance that we won't load the frame
             */
            video.correctedDuration = Number.isInteger(data.frag.start + data.frag.duration * video.frameRate) ? data.frag.start + data.frag.duration - this._frameDurationSpillOverCorrection : data.frag.start + data.frag.duration;
          }
        });

        let updateAudioTracks = () => {
          this._audioTracks = new Map<string, OmakaseAudioTrack>();
          this._hls!.audioTracks.forEach(mediaPlaylist => {
            let omakaseAudioTrack = this.createOmakaseAudioTrack(mediaPlaylist);
            this._audioTracks.set(omakaseAudioTrack.id, omakaseAudioTrack);
          });
          this.onAudioLoaded$.next({
            audioTracks: this.getAudioTracks(),
            activeAudioTrack: this.getActiveAudioTrack()
          });
        }

        let updateActiveAudioTrack = () => {
          let hlsAudioTrack = this._hls!.audioTracks[this._hls!.audioTrack];
          if (hlsAudioTrack) {
            let mappingId = `${hlsAudioTrack.id}`;
            if (this._audioTracks.has(mappingId)) {
              this._activeAudioTrack = this._audioTracks.get(mappingId)!;
              this.onAudioSwitched$.next({
                activeAudioTrack: this._activeAudioTrack
              })
            }
          }
        }

        this._hls!.on(Hls.Events.AUDIO_TRACKS_UPDATED, function (event, data) {
          // console.debug(event, data);
          updateAudioTracks();
          updateActiveAudioTrack()
        });

        this._hls!.on(Hls.Events.AUDIO_TRACK_SWITCHED, function (event, data) {
          // console.debug(event, data);
          updateActiveAudioTrack();
        });

        let durationFractionThree = Number.parseFloat(video.duration.toFixed(3));
        if (Number.isInteger(Number.parseFloat(((video.duration) * video.frameRate).toFixed(1)))) {
          durationFractionThree = Number.parseFloat((durationFractionThree - this._frameDurationSpillOverCorrection).toFixed(3));
          video.correctedDuration = durationFractionThree;
        }

        // audio
        updateAudioTracks();
        updateActiveAudioTrack();

        // subtitles
        this._hls!.subtitleDisplay = this._config.subtitleDisplay;
        if (!this._config.subtitleDisplay) {
          this._hls!.subtitleTrack = -1;
        }
        if (this._config.fetchManifestSubtitleTracks && this._hls!.allSubtitleTracks && this._hls!.allSubtitleTracks.length > 0) {
          let os$ = this._hls!.allSubtitleTracks.map(subtitleTrack => {
            return VttUtil.fetchFromM3u8SegmentedConcat(subtitleTrack.url, undefined, AuthUtil.authentication)
              .pipe(map(webvttText => {
                return {
                  mediaPlaylist: subtitleTrack,
                  webvttText: webvttText
                }
              }))
          });

          forkJoin(os$).subscribe({
            next: (resultList) => {
              this._embeddedSubtitlesTracks = [];

              let mediaPlaylistWebvtts = resultList.filter(p => !StringUtil.isNullUndefinedOrWhitespace(p.webvttText));
              if (mediaPlaylistWebvtts && mediaPlaylistWebvtts.length > 0) {
                let os$ = mediaPlaylistWebvtts
                  .map(mediaPlaylistWebvtt => CryptoUtil.digest(mediaPlaylistWebvtt.webvttText!) // digest each VTT's content
                    .pipe(map(contentDigest => {
                      return {
                        ...mediaPlaylistWebvtt,
                        webvttTextDigest: contentDigest
                      }
                    })))
                forkJoin(os$).subscribe({
                  next: (mediaPlaylistWebvtts) => {
                    mediaPlaylistWebvtts
                      .forEach(result => {
                        let subtitlesVttTrack: SubtitlesVttTrack = {
                          id: CryptoUtil.uuid(),
                          kind: 'subtitles',
                          hidden: true,
                          default: false,
                          embedded: true,
                          contentDigest: result.webvttTextDigest,
                          src: VttUtil.createWebvttBlob(result.webvttText!),
                          language: result.mediaPlaylist.lang ? result.mediaPlaylist.lang : 'n/a',
                          label: result.mediaPlaylist.name ? result.mediaPlaylist.name : 'n/a',
                        }

                        this._embeddedSubtitlesTracks!.push(subtitlesVttTrack)
                      })

                    nextCompleteObserver(observer, video)
                  }
                })
              } else {
                nextCompleteObserver(observer, video)
              }
            }
          })

        } else {
          nextCompleteObserver(observer, video)
        }
      })

      this._hls.loadSource(sourceUrl)
      this._hls.attachMedia(this.videoElement);

      this._hls.on(Hls.Events.ERROR, function (event, data) {
        console.error(event, data);
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR
          || data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR
          || data.details === Hls.ErrorDetails.BUFFER_APPENDING_ERROR) {
        }
      });
    })
  }

  /**
   * @internal
   * @private
   */
  private overrideHlsMethods() {
    // unsafe, working on HLS version 1.5.8
    // see https://github.com/video-dev/hls.js/blob/master/src/controller/subtitle-track-controller.ts
    // @ts-ignore
    let hlsSubtitleTrackController = this._hls.subtitleTrackController;

    if (hlsSubtitleTrackController) {
      if (hlsSubtitleTrackController.pollTrackChange) {
        hlsSubtitleTrackController.pollTrackChange = (timeout: number) => {
          // overriden to prevent HLS polling & toggling already shown / hidden subtitles
        }
      }

      if (hlsSubtitleTrackController.asyncPollTrackChange) {
        hlsSubtitleTrackController.asyncPollTrackChange = () => {
          // overriden to prevent HLS polling & toggling already shown / hidden subtitles
        }
      }
    }
  }

  private destroyHls() {
    try {
      if (this._hls) {
        this._hls.destroy();
      }
    } catch (e) {
      console.error(e);
    }
  }

  private createOmakaseAudioTrack(mediaPlaylist: MediaPlaylist): OmakaseAudioTrack {
    return {
      id: `${mediaPlaylist.id}`,
      label: mediaPlaylist.name,
      src: mediaPlaylist.url,
      language: mediaPlaylist.lang
    }
  }

  override getAudioTracks(): OmakaseAudioTrack[] {
    return [...this._audioTracks.values()];
  }

  override getActiveAudioTrack(): OmakaseAudioTrack | undefined {
    return this._activeAudioTrack;
  }

  override setActiveAudioTrack(id: string): Observable<void> {
    return passiveObservable(observer => {
      if (this.isVideoLoaded() && this._hls) {
        let activeTrack = this.getActiveAudioTrack();
        let newActiveTrack = this.getAudioTracks().find(p => p.id === id);

        if (newActiveTrack && newActiveTrack.id !== activeTrack?.id) {
          this.onAudioSwitched$.pipe(take(1), timeout(60000), takeUntil(this._destroyed$)).subscribe({
            next: () => {
              nextCompleteObserver(observer);
            },
            error: (error) => {
              observer.error(error)
              observer.complete();
            }
          })
          this._hls!.audioTrack = parseInt(newActiveTrack.id);
        } else {
          nextCompleteObserver(observer)
        }
      } else {
        nextCompleteObserver(observer)
      }
    })
  }

  override getHls(): Hls | undefined {
    return this._hls;
  }

  override destroy() {
    super.destroy();

    this.destroyHls()
  }
}
