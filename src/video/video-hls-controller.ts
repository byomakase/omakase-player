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

import {first, forkJoin, fromEvent, map, Observable} from 'rxjs';
import {z} from 'zod';
import {VttUtil} from '../vtt/vtt-util';
import {AuthUtil} from '../util/auth-util';
import {SubtitlesVttTrack} from '../track';
import {UuidUtil} from '../util/uuid-util';
import {BasicAuthenticationData, BearerAuthenticationData, Video, VideoLoadOptions} from './model';
import {isNullOrUndefined} from '../util/object-util';
import {BlobUtil} from '../util/blob-util';
import Decimal from 'decimal.js';

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
  protected _hls: Hls;

  constructor(config: Partial<VideoHlsControllerConfig>) {
    super({
      ...VIDEO_HLS_CONTROLLER_CONFIG_DEFAULT,
      ...config
    });

    if (Hls.isSupported()) {
      console.debug('video load with hls.js')
    } else {
      console.error('hls is not supported through MediaSource extensions')
    }

    this._hls = new Hls({
      ...config.hls
    });
  }

  loadVideoInternal(sourceUrl: string, frameRate: number, options?: VideoLoadOptions): Observable<Video> {
    return new Observable<Video>(o$ => {

      if (options?.authentication) {
        this._hls.config.xhrSetup = (xhr: XMLHttpRequest) => {
          if (options.authentication!.type === 'basic') {
            const token = btoa(`${(options.authentication as BasicAuthenticationData)!.username}:${(options.authentication as BasicAuthenticationData)!.password}`);
            xhr.setRequestHeader('Authorization', `Basic ${token}`);
          } else if (options.authentication!.type === 'bearer') {
            xhr.setRequestHeader('Authorization', `Bearer ${(options.authentication as BearerAuthenticationData)!.token}`);
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
          o$.error(`Error loading video. Hls error details: ${errorDetails}`);
          o$.complete();
        }
      });

      let hlsMediaAttached$ = new Observable<boolean>(o$ => {
        // MEDIA_ATTACHED event is fired by hls object once MediaSource is ready
        this._hls.once(Hls.Events.MEDIA_ATTACHED, function (event, data) {
          console.debug('video element and hls.js are now bound together');
          o$.next(true);
          o$.complete();
        });
      })

      let audioOnly = false;
      let hlsManifestParsed$ = new Observable<boolean>(o$ => {
        this._hls.once(Hls.Events.MANIFEST_PARSED, function (event, data) {
          console.debug(`manifest loaded, found ${data.levels.length} quality level`, data);

          let firstLevelIndex = data.firstLevel;
          let firstLevel = data.levels[firstLevelIndex];
          audioOnly = isNullOrUndefined(firstLevel.videoCodec);

          o$.next(true);
          o$.complete();
        });
      })

      let hasInitSegment = false;
      let hlsFragParsingInitSegment$ = new Observable<boolean>(o$ => {
        this._hls.once(Hls.Events.FRAG_PARSING_INIT_SEGMENT, function (event, data) {
          if ((data as FragLoadedData).frag.sn === 'initSegment' && (data as FragLoadedData).frag.data) {
            hasInitSegment = true;
          }
          o$.next(true);
          o$.complete();
        });
      })

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

        let video = new Video(sourceUrl, frameRate, dropFrame, duration, audioOnly, initSegmentTimeOffset);

        this._hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
          if (data.frag.endList && data.frag.type == 'main' && video.correctedDuration && (video.correctedDuration > (data.frag.start + data.frag.duration))) {
            /**
             * if we land on exact time of the frame start at the end of video, there is the chance that we won't load the frame
             */
            video.correctedDuration = Number.isInteger(data.frag.start + data.frag.duration * video.frameRate) ? data.frag.start + data.frag.duration - this._frameDurationSpillOverCorrection : data.frag.start + data.frag.duration;
          }
        });

        let durationFractionThree = Number.parseFloat(video.duration.toFixed(3));
        if (Number.isInteger(Number.parseFloat(((video.duration) * video.frameRate).toFixed(1)))) {
          durationFractionThree = Number.parseFloat((durationFractionThree - this._frameDurationSpillOverCorrection).toFixed(3));
          video.correctedDuration = durationFractionThree;
        }

        this._hls.subtitleDisplay = this._config.subtitleDisplay;
        if (!this._config.subtitleDisplay) {
          this._hls.subtitleTrack = -1;
        }
        if (this._config.fetchManifestSubtitleTracks && this._hls.allSubtitleTracks && this._hls.allSubtitleTracks.length > 0) {
          this._subtitlesVttTracks = [];

          let os$ = this._hls.allSubtitleTracks.map(subtitleTrack => {
            let axiosConfig;
            if (options?.authentication) {
              axiosConfig = AuthUtil.getAuthorizedAxiosConfig(options.authentication);
            }
            return VttUtil.fetchFromM3u8SegmentedConcat(subtitleTrack.url, axiosConfig).pipe(map(webvttText => {
              return {
                subtitleTrack: subtitleTrack,
                webvttText: webvttText
              }
            }))
          });

          forkJoin(os$).subscribe({
            next: (resultList) => {
              resultList.forEach(result => {
                if (result.webvttText) {
                  let subtitlesVttTrack = new SubtitlesVttTrack({
                    id: UuidUtil.uuid(),
                    default: false,
                    src: VttUtil.createWebvttBlob(result.webvttText),
                    language: result.subtitleTrack.lang ? result.subtitleTrack.lang : 'n/a',
                    label: result.subtitleTrack.name ? result.subtitleTrack.name : 'n/a',
                  })
                  this._subtitlesVttTracks?.push(subtitlesVttTrack);
                }
              })

              o$.next(video);
              o$.complete();
            }
          })

        } else {
          o$.next(video);
          o$.complete();
        }


      })

      this._hls.loadSource(sourceUrl)
      this._hls.attachMedia(this.videoElement);
    })
  }

  protected override initEventHandlers() {
    super.initEventHandlers();

    this._hls.on(Hls.Events.ERROR, function (event, data) {
      let errorType = data.type;
      let errorDetails = data.details;
      let errorFatal = data.fatal;

      console.error(event, data);

      if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR
        || data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR
        || data.details === Hls.ErrorDetails.BUFFER_APPENDING_ERROR) {
      }
    });
  }

  override getAudioTracks(): MediaPlaylist[] {
    if (!this.isVideoLoaded) {
      return [];
    }
    return this._hls.audioTracks;
  }

  override getCurrentAudioTrack(): any {
    return this.getAudioTracks()[this._hls.audioTrack];
  }

  override setAudioTrack(audioTrackId: number) {
    if (!this.isVideoLoaded) {
      return;
    }

    let previousIndex: number = this._hls.audioTrack;
    this._hls.audioTrack = audioTrackId;
    let currentIndex: number = this._hls.audioTrack;

    if (currentIndex >= 0 && previousIndex !== currentIndex) {
      this.onAudioSwitched$.next({
        audioTrack: this.getCurrentAudioTrack()
      });
    }
  }

  override getHls(): Hls {
    return this._hls;
  }

  override destroy() {
    super.destroy();

    try {
      if (this._hls) {
        this._hls.removeAllListeners();
        this._hls.destroy();
      }
    } catch (e) {
      console.error(e);
    }
  }
}
