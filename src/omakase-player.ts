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

import {Timeline, TimelineConfig} from './timeline';
import {forkJoin, Observable, Subject, takeUntil} from 'rxjs';
import {AlertsApi, AudioApi, MarkerListApi, OmakasePlayerApi, SubtitlesApi, TimelineApi, VideoApi} from './api';
import {VIDEO_HLS_CONTROLLER_CONFIG_DEFAULT, VideoHlsController} from './video/video-hls-controller';
import {SubtitlesController} from './subtitles/subtitles-controller';
import EventEmitter from 'eventemitter3';
import {OmakaseEventKey, OmakaseEventListener} from './events';
import {Destroyable, OmakasePlayerEventMap, OmakasePlayerEvents, OmakasePlayerEventsType} from './types';
import {AudioController} from './audio/audio-controller';
// we need to include styles in compilation process, thus import them
import './../style/omakase-player.scss'
import {nextCompleteSubject} from './util/rxjs-util';
import {Video, VideoControllerApi, VideoLoadOptions} from './video';
import {destroyer, nullifier} from './util/destroy-util';
import {HlsConfig} from 'hls.js';
import {YogaProvider} from './common/yoga-provider';
import {VideoNativeController} from './video/video-native-controller';
import {AlertsController} from './alerts/alerts-controller';
import {BlobUtil} from './util/blob-util';
import {DetachableVideoController} from './video/detachable-video-controller';
import {VTT_DOWNSAMPLE_CONFIG_DEFAULT} from './timeline/timeline-lane';
import {MediaChromeVisibility, VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT, VideoDomController} from './video/video-dom-controller';
import {VideoDomControllerApi} from './video/video-dom-controller-api';
import {DetachedVideoController} from './video/detached-video-controller';
import {ConfigWithOptionalStyle} from './layout';
import {MarkerList, MarkerListConfig} from './marker-list/marker-list';
import {AuthUtil} from './util/auth-util';
import { AuthenticationData } from './authentication/model';

export interface OmakasePlayerConfig {
  playerHTMLElementId?: string;
  mediaChromeHTMLElementId?: string;
  crossorigin?: 'anonymous' | 'use-credentials',

  /**
   * HLS.js configuration
   */
  hls?: Partial<HlsConfig>,

  vttDownsamplePeriod?: number;

  /**
   *  Is this OmakasePlayer instance a detached player instance. Property is set on detached player.
   */
  detachedPlayer?: boolean,

  /**
   *  URL where detached player resides. Property is set on non-detached (local) player side.
   */
  detachedPlayerUrl?: string,

  /**
   *  Authentication data for HLS.js, VTT and thumbnail image requests
   */
  authentication?: AuthenticationData,

  /**
   *  Show player with or without media chrome controls
   */
  mediaChrome?: MediaChromeVisibility,

  /**
   *  VTT url for the thumbnails (used for preview in media chrome time range)
   */
  thumbnailVttUrl?: string,

  /**
   *  Function to get thumbnail url from time (used for preview in media chrome time range)
   */
  thumbnailFn?: (time: number) => string | undefined,
}

const configDefault: OmakasePlayerConfig = {
  playerHTMLElementId: VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT.playerHTMLElementId,
  crossorigin: VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT.crossorigin,
  hls: {
    ...VIDEO_HLS_CONTROLLER_CONFIG_DEFAULT.hls
  },
  detachedPlayer: false,
  mediaChrome: 'fullscreen-only'
}

export class OmakasePlayer implements OmakasePlayerApi, Destroyable {
  public static instance: OmakasePlayerApi;

  private readonly _config: OmakasePlayerConfig;

  private readonly _videoDomController: VideoDomControllerApi;
  private readonly _alertsController: AlertsApi;

  private _videoController: VideoControllerApi;
  private _audioController: AudioController;
  private _subtitlesController: SubtitlesController;

  private _timeline?: Timeline;

  private _eventEmitter = new EventEmitter();
  private _destroyed$ = new Subject<void>();

  constructor(config?: OmakasePlayerConfig) {
    this._config = config ? {
      ...configDefault,
      ...config
    } : {
      ...configDefault,
    };

    if (this._config.detachedPlayer && !config?.mediaChrome) {
      this._config.mediaChrome = 'enabled';
    }

    OmakasePlayer.instance = this;

    AuthUtil.authentication = this._config.authentication;

    if (config?.vttDownsamplePeriod) {
      VTT_DOWNSAMPLE_CONFIG_DEFAULT.downsamplePeriod = config.vttDownsamplePeriod;
    }

    this._alertsController = new AlertsController();

    this._videoDomController = new VideoDomController({
      playerHTMLElementId: this._config.playerHTMLElementId,
      crossorigin: this._config.crossorigin,
      detachedPlayer: this._config.detachedPlayer,
      mediaChrome: this._config.mediaChrome,
      mediaChromeHTMLElementId: this._config.mediaChromeHTMLElementId,
      thumbnailVttUrl: this._config.thumbnailVttUrl,
      thumbnailFn: this._config.thumbnailFn
    })

    let createLocalVideoController = () => {
      let loader: 'hls' | 'native' = 'hls'; // for now lets just use HLS

      if (loader === 'hls') {
        return new VideoHlsController({
          hls: this._config.hls
        }, this._videoDomController);
      } else {
        return new VideoNativeController({}, this._videoDomController);
      }
    }

    if (this._config.detachedPlayer) {
      this._videoController = new DetachedVideoController(createLocalVideoController());
    } else {
      this._videoController = new DetachableVideoController({
        detachedPlayerUrl: this._config.detachedPlayerUrl,
        thumbnailVttUrl: this._config.thumbnailVttUrl
      }, createLocalVideoController());
    }

    this._videoDomController.attachVideoController(this._videoController);

    this._audioController = new AudioController(this._videoController);
    this._subtitlesController = new SubtitlesController(this._videoController);

    this.bindEventHandlers();
  }

  setAuthentication(authentication: AuthenticationData) {
    AuthUtil.authentication = authentication;
  }

  setThumbnailVttUrl(thumbnailVttUrl: string) {
    this._videoController.loadThumbnailVttUrl(thumbnailVttUrl);
  }

  loadVideo(videoSourceUrl: string, frameRate: number | string, options?: VideoLoadOptions): Observable<Video> {
    return this._videoController.loadVideo(videoSourceUrl, frameRate, options)
  }

  createTimeline(config: Partial<ConfigWithOptionalStyle<TimelineConfig>>): Observable<TimelineApi> {
    return new Observable<Timeline>(o$ => {

      let createTimeline = () => {

        this._timeline = new Timeline(config, this._videoController);

        // bind timeline event handlers
        this._timeline.onScroll$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
          this.emit('omakaseTimelineScroll', event);
        })

        this._timeline.onZoom$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
          this.emit('omakaseTimelineZoom', event);
        })
      }

      let yogaLayoutReady$ = new Subject<void>();

      forkJoin([yogaLayoutReady$]).pipe(takeUntil(this._destroyed$)).subscribe(() => {
        createTimeline();
        o$.next(this._timeline);
        o$.complete();
      })

      // initalize yoga-layout
      YogaProvider.instance().init().pipe(takeUntil(this._destroyed$)).subscribe(() => {
        yogaLayoutReady$.next();
        yogaLayoutReady$.complete();
      })

    })
  }

  createMarkerList(config: MarkerListConfig): Observable<MarkerListApi> {
    return new Observable<MarkerList>(o$ => {
      const markerList = new MarkerList(config, this._videoController);

      // bind marker list event handlers
      markerList.onMarkerAction$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        this.emit('omakaseMarkerListAction', event);
      })

      markerList.onMarkerClick$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        this.emit('omakaseMarkerListClick', event);
      })

      markerList.onMarkerDelete$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        this.emit('omakaseMarkerListDelete', event);
      })

      markerList.onMarkerCreate$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        this.emit('omakaseMarkerListCreate', event);
      })

      markerList.onMarkerUpdate$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        this.emit('omakaseMarkerListUpdate', event);
      })

      markerList.onMarkerInit$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        this.emit('omakaseMarkerListInit', event);
      })

      if (config.vttUrl) {
        markerList.onVttLoaded$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
          o$.next(markerList);
          o$.complete();
        })
      } else {
        // timeout is here to make sure the marker list element is created in the dom
        setTimeout(() => {
          o$.next(markerList);
          o$.complete();
        })
      }

    })
  }

  private bindEventHandlers() {
    // video
    this._videoController.onPlay$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoPlay', event);
    })

    this._videoController.onPause$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoPause', event);
    })

    this._videoController.onVideoLoading$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoLoading', event!);
    })

    this._videoController.onVideoLoaded$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoLoaded', event!);
    })

    this._videoController.onVideoTimeChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoTimeChange', event);
    })

    this._videoController.onSeeking$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoSeeking', event);
    })

    this._videoController.onSeeked$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoSeeked', event);
    })

    this._videoController.onBuffering$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoBuffering', event);
    })

    this._videoController.onEnded$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoEnded', event);
    })

    this._videoController.onAudioSwitched$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseVideoAudioSwitched', event);
    })

    // audio
    this._audioController.onAudioSwitched$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseAudioSwitched', event);
    })

    // subtitles
    this._subtitlesController.onSubtitlesLoaded$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseSubtitlesLoaded', event!);
    })

    this._subtitlesController.onCreate$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseSubtitlesCreate', event);
    })

    this._subtitlesController.onRemove$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseSubtitlesRemove', event);
    })

    this._subtitlesController.onShow$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseSubtitlesShow', event);
    })

    this._subtitlesController.onHide$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.emit('omakaseSubtitlesHide', event);
    })
  }

  // region eventemmiter

  emit<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K, event: OmakasePlayerEventMap[K]): void {
    this._eventEmitter.emit(eventKey, event);
  }

  off<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K, handler: OmakaseEventListener<OmakasePlayerEventMap[K]>): void {
    this._eventEmitter.off(eventKey, handler);
  }

  on<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K, handler: OmakaseEventListener<OmakasePlayerEventMap[K]>): void {
    this._eventEmitter.on(eventKey, handler);
  }

  listenerCount<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K): void {
    this._eventEmitter.listenerCount(eventKey);
  }

  listeners<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K): OmakaseEventListener<OmakasePlayerEventMap[K]>[] {
    return this._eventEmitter.listeners(eventKey);
  }

  once<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K, handler: OmakaseEventListener<OmakasePlayerEventMap[K]>): void {
    this._eventEmitter.once(eventKey, handler);
  }

  removeAllListeners<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey?: K): void {
    this._eventEmitter.removeAllListeners(eventKey);
  }

  get timeline(): TimelineApi | undefined {
    return this._timeline;
  }

  get video(): VideoApi {
    return this._videoController;
  }

  get audio(): AudioApi {
    return this._audioController;
  }

  get subtitles(): SubtitlesApi {
    return this._subtitlesController;
  }

  get alerts(): AlertsApi {
    return this._alertsController;
  }

  get EVENTS(): OmakasePlayerEventsType {
    return OmakasePlayerEvents;
  }

  destroy() {
    BlobUtil.revokeAll();

    destroyer(
      this._timeline,
      this._subtitlesController,
      this._audioController,
      this._videoController
    );

    this._eventEmitter.removeAllListeners();

    nextCompleteSubject(this._destroyed$);

    nullifier(
      this._timeline,
      this._videoController,
      this._audioController,
      this._subtitlesController,
      this._eventEmitter
    )
  }
}
