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
import {SubtitlesController} from './subtitles/subtitles-controller';
import {Destroyable} from './types';
import {AudioController} from './audio/audio-controller';
// we need to include styles in compilation process, thus import them
import './../style/omakase-player.scss';
import {nextCompleteObserver, nextCompleteSubject} from './util/rxjs-util';
import {Video, VideoController, VideoControllerApi, VideoLoadOptions} from './video';
import {destroyer, nullifier} from './util/destroy-util';
import {YogaProvider} from './common/yoga-provider';
import {AlertsController} from './alerts/alerts-controller';
import {BlobUtil} from './util/blob-util';
import {DetachableVideoController} from './video/detachable-video-controller';
import {VTT_DOWNSAMPLE_CONFIG_DEFAULT} from './timeline/timeline-lane';
import {MediaChromeVisibility, VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT, VideoDomController} from './video/video-dom-controller';
import {VideoDomControllerApi} from './video/video-dom-controller-api';
import {DetachedVideoController} from './video/detached-video-controller';
import {ConfigWithOptionalStyle} from './layout';
import {MarkerList, MarkerListConfig} from './marker-list/marker-list';
import {AuthConfig} from './auth/auth-config';
import {AuthenticationData} from './authentication/model';
import {VIDEO_CONTROLLER_CONFIG_DEFAULT} from './video/video-controller';
import {OmpHlsConfig} from './video/video-hls-loader';
import {RouterVisualization, RouterVisualizationConfig} from './router-visualization/router-visualization';
import {RouterVisualizationApi} from './api/router-visualization-api';

export interface OmakasePlayerConfig {
  playerHTMLElementId?: string;
  mediaChromeHTMLElementId?: string;
  crossorigin?: 'anonymous' | 'use-credentials';

  /**
   * HLS configuration
   */
  hlsConfig?: Partial<OmpHlsConfig>;

  vttDownsamplePeriod?: number;

  /**
   *  Is this OmakasePlayer instance a detached player instance. Property is set on detached player.
   */
  detachedPlayer?: boolean;

  /**
   *  Function that will return URL where detached player resides. Property is set on non-detached (local) player side.
   */
  detachedPlayerUrlFn?: (video: Video, videoLoadOptions?: VideoLoadOptions) => string;

  /**
   *  Authentication data for HLS.js, VTT and thumbnail image requests
   */
  authentication?: AuthenticationData;

  /**
   *  Show player with or without media chrome controls
   */
  mediaChrome?: MediaChromeVisibility;

  /**
   *  VTT url for the thumbnails (used for preview in media chrome time range)
   */
  thumbnailVttUrl?: string;

  /**
   *  Function to get thumbnail url from time (used for preview in media chrome time range)
   */
  thumbnailFn?: (time: number) => string | undefined;

  /**
   *  Custom video player click handler
   */
  playerClickHandler?: () => void;

  /**
   *  Custom options for playback speed rate
   */
  playbackRateOptions?: number[];

  /**
   *  Watermark text or svg
   */
  watermark?: string;
}

const configDefault: OmakasePlayerConfig = {
  playerHTMLElementId: VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT.playerHTMLElementId,
  crossorigin: VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT.crossorigin,
  hlsConfig: VIDEO_CONTROLLER_CONFIG_DEFAULT.hlsConfig,
  detachedPlayer: false,
  mediaChrome: 'fullscreen-only',
};

export class OmakasePlayer implements OmakasePlayerApi, Destroyable {
  public static instance: OmakasePlayerApi;

  private readonly _config: OmakasePlayerConfig;

  private readonly _videoDomController: VideoDomControllerApi;
  private readonly _alertsController: AlertsApi;

  private _videoController: VideoControllerApi;
  private _audioController: AudioController;
  private _subtitlesController: SubtitlesController;

  private _timeline?: Timeline;

  private _destroyed$ = new Subject<void>();

  constructor(config?: Partial<OmakasePlayerConfig>) {
    this._config = {
      ...configDefault,
      ...(config ? config : {}),
    };

    if (this._config.detachedPlayer && !config?.mediaChrome) {
      this._config.mediaChrome = 'enabled';
    }

    OmakasePlayer.instance = this;

    AuthConfig.authentication = this._config.authentication;

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
      thumbnailFn: this._config.thumbnailFn,
      playerClickHandler: this._config.playerClickHandler,
      playbackRateOptions: this._config.playbackRateOptions,
      watermark: this._config.watermark,
    });

    let createLocalVideoController = () => {
      return new VideoController(
        {
          hlsConfig: this._config.hlsConfig,
        },
        this._videoDomController
      );
    };

    if (this._config.detachedPlayer) {
      this._videoController = new DetachedVideoController(createLocalVideoController());
    } else {
      this._videoController = new DetachableVideoController(
        {
          detachedPlayerUrlFn: this._config.detachedPlayerUrlFn,
          thumbnailVttUrl: this._config.thumbnailVttUrl,
        },
        createLocalVideoController()
      );
    }

    this._videoDomController.attachVideoController(this._videoController);

    this._audioController = new AudioController(this._videoController);
    this._subtitlesController = new SubtitlesController(this._videoController);
  }

  setAuthentication(authentication: AuthenticationData) {
    AuthConfig.authentication = authentication;
  }

  setThumbnailVttUrl(thumbnailVttUrl: string) {
    this._videoController.loadThumbnailVttUrl(thumbnailVttUrl);
  }

  loadVideo(videoSourceUrl: string, options?: VideoLoadOptions): Observable<Video> {
    return this._videoController.loadVideo(videoSourceUrl, options);
  }

  createTimeline(config: Partial<ConfigWithOptionalStyle<TimelineConfig>>): Observable<TimelineApi> {
    return new Observable<Timeline>((observer) => {
      let yogaLayoutReady$ = new Subject<void>();

      forkJoin([yogaLayoutReady$])
        .pipe(takeUntil(this._destroyed$))
        .subscribe(() => {
          this._timeline = new Timeline(config, this._videoController);
          nextCompleteObserver(observer, this._timeline);
        });

      // initalize yoga-layout
      YogaProvider.instance()
        .init()
        .pipe(takeUntil(this._destroyed$))
        .subscribe(() => {
          nextCompleteSubject(yogaLayoutReady$);
        });
    });
  }

  createMarkerList(config: MarkerListConfig): Observable<MarkerListApi> {
    return new Observable<MarkerList>((o$) => {
      const markerList = new MarkerList(config, this._videoController);

      if (config.vttUrl) {
        markerList.onVttLoaded$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
          o$.next(markerList);
          o$.complete();
        });
      } else {
        // timeout is here to make sure the marker list element is created in the dom
        setTimeout(() => {
          o$.next(markerList);
          o$.complete();
        });
      }
    });
  }

  initializeRouterVisualization(config: RouterVisualizationConfig): RouterVisualizationApi {
    return new RouterVisualization(config, this._audioController);
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

  destroy() {
    BlobUtil.revokeAll();

    destroyer(this._timeline, this._subtitlesController, this._audioController, this._videoController, this._videoDomController);

    nextCompleteSubject(this._destroyed$);

    nullifier(this._timeline, this._videoController, this._audioController, this._subtitlesController);
  }
}
