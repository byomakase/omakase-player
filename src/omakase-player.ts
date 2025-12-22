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
import {AlertsApi, AudioApi, MarkerListApi, MarkerTrackApi, OmakasePlayerApi, RouterVisualizationApi, SubtitlesApi, TimelineApi, VideoApi} from './api';
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
import {VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT, VideoDomController} from './video/video-dom-controller';
import {VideoDomControllerApi} from './video/video-dom-controller-api';
import {DetachedVideoController} from './video/detached-video-controller';
import {ConfigWithOptionalStyle} from './layout';
import {MarkerList, MarkerListConfig} from './marker-list/marker-list';
import {VIDEO_CONTROLLER_CONFIG_DEFAULT, VideoControllerConfig} from './video/video-controller';
import {OmpHlsConfig} from './video/video-hls-loader';
import {RouterVisualization, RouterVisualizationConfig} from './router-visualization/router-visualization';
import {removeEmptyValues} from './util/object-util';
import {
  AudioChroming,
  DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG,
  DEFAULT_OMAKASE_PLAYER_CHROMING_CONFIG,
  DEFAULT_PLAYER_CHROMING_CONFIG,
  DEFAULT_STAMP_PLAYER_CHROMING_CONFIG,
  DefaultChroming,
  OmakaseChroming,
  FullscreenChroming,
  PlayerChroming,
  PlayerChromingTheme,
  StampChroming,
  WatermarkVisibility,
  DEFAULT_PLAYER_CHROMING,
  DEFAULT_CHROMELESS_PLAYER_CHROMING_CONFIG,
  ChromelessChroming,
} from './player-chroming/model';
import {AuthConfig, AuthenticationData} from './common/authentication';
import {ConfigAdapter} from './common/config-adapter';
import {PlayerChromingController} from './player-chroming/player-chroming-controller';
import {ChromingApi} from './api/chroming-api';

export interface OmakasePlayerConfig {
  playerHTMLElementId?: string;
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
   * Is PIP (picture-in-picture) disabled
   */
  disablePictureInPicture?: boolean;

  /**
   *  Function that will return URL where detached player resides. Property is set on non-detached (local) player side.
   */
  detachedPlayerUrlFn?: (video: Video, videoLoadOptions?: VideoLoadOptions) => string;

  /**
   *  Authentication data for HLS.js, VTT and thumbnail image requests
   */
  authentication?: AuthenticationData;

  /**
   *  Custom video player click handler
   */
  playerClickHandler?: () => void;

  audioPlayMode?: VideoControllerConfig['audioPlayMode'];

  /**
   * Player chroming configuration
   */
  playerChroming?: PlayerChroming;
}

const configDefault: OmakasePlayerConfig = {
  playerHTMLElementId: VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT.playerHTMLElementId,
  crossorigin: VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT.crossorigin,
  hlsConfig: VIDEO_CONTROLLER_CONFIG_DEFAULT.hlsConfig,
  detachedPlayer: VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT.detachedPlayer,
  disablePictureInPicture: VIDEO_DOM_CONTROLLER_CONFIG_DEFAULT.disablePictureInPicture,
  audioPlayMode: VIDEO_CONTROLLER_CONFIG_DEFAULT.audioPlayMode,
};

export class OmakasePlayer implements OmakasePlayerApi, Destroyable {
  public static instance: OmakasePlayerApi;

  protected readonly _configAdapter: ConfigAdapter;

  private readonly _config: OmakasePlayerConfig;

  private readonly _videoDomController: VideoDomControllerApi;
  private readonly _alertsController: AlertsApi;

  private _videoController: VideoControllerApi;
  private _audioController: AudioController;
  private _subtitlesController: SubtitlesController;
  private _chromingController: PlayerChromingController;

  private _timeline?: Timeline;

  private _destroyed$ = new Subject<void>();

  constructor(config?: Partial<OmakasePlayerConfig>) {
    this._config = {
      ...configDefault,
      ...(config ? config : {}),
    };

    if (!config?.playerChroming) {
      this._config.playerChroming = DEFAULT_PLAYER_CHROMING;
    }

    if (this._config.playerChroming?.theme === PlayerChromingTheme.Default) {
      this._config.playerChroming.themeConfig = {
        ...DEFAULT_PLAYER_CHROMING_CONFIG,
        ...(config?.playerChroming as DefaultChroming)?.themeConfig,
      };
      this._config.playerChroming.fullscreenChroming = config?.playerChroming?.fullscreenChroming ?? FullscreenChroming.Enabled;
    } else if (this._config.playerChroming?.theme === PlayerChromingTheme.Stamp) {
      this._config.playerChroming.themeConfig = {
        ...DEFAULT_STAMP_PLAYER_CHROMING_CONFIG,
        ...(config?.playerChroming as StampChroming)?.themeConfig,
      };
      this._config.playerChroming.fullscreenChroming = config?.playerChroming?.fullscreenChroming ?? FullscreenChroming.Disabled;
      this._config.playerChroming.watermarkVisibility = config?.playerChroming?.watermarkVisibility ?? WatermarkVisibility.AutoHide;
    } else if (this._config.playerChroming?.theme === PlayerChromingTheme.Audio) {
      this._config.playerChroming.themeConfig = {
        ...DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG,
        ...(config?.playerChroming as AudioChroming)?.themeConfig,
        visualizationConfig: {
          ...DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG.visualizationConfig,
          ...(config?.playerChroming as AudioChroming)?.themeConfig?.visualizationConfig,
        },
      };
    } else if (this._config.playerChroming?.theme === PlayerChromingTheme.Omakase) {
      this._config.playerChroming.themeConfig = {
        ...DEFAULT_OMAKASE_PLAYER_CHROMING_CONFIG,
        ...(config?.playerChroming as OmakaseChroming)?.themeConfig,
      };
    } else if (this._config.playerChroming?.theme === PlayerChromingTheme.Chromeless) {
      this._config.playerChroming.themeConfig = {
        ...DEFAULT_CHROMELESS_PLAYER_CHROMING_CONFIG,
        ...(config?.playerChroming as ChromelessChroming)?.themeConfig,
      };
      this._config.playerChroming.fullscreenChroming = config?.playerChroming?.fullscreenChroming ?? FullscreenChroming.Disabled;
    } else {
      console.log('Provided chroming theme is not recognized. Fallback to default chroming theme.');
      this._config.playerChroming = DEFAULT_PLAYER_CHROMING;
    }

    OmakasePlayer.instance = this;

    AuthConfig.authentication = this._config.authentication;

    if (config?.vttDownsamplePeriod) {
      VTT_DOWNSAMPLE_CONFIG_DEFAULT.downsamplePeriod = config.vttDownsamplePeriod;
    }

    this._alertsController = new AlertsController(this._config.playerHTMLElementId!);

    this._videoDomController = new VideoDomController(
      removeEmptyValues({
        playerHTMLElementId: this._config.playerHTMLElementId,
        crossorigin: this._config.crossorigin,
        detachedPlayer: this._config.detachedPlayer,
        disablePictureInPicture: this._config.disablePictureInPicture,
        playerChroming: this._config.playerChroming,
        playerClickHandler: this._config.playerClickHandler,
      })
    );

    let createLocalVideoController = () => {
      return new VideoController(
        {
          hlsConfig: this._config.hlsConfig,
          audioPlayMode: this._config.audioPlayMode,
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
          thumbnailVttUrl: this._config.playerChroming?.thumbnailUrl,
        },
        createLocalVideoController()
      );
    }

    this._chromingController = new PlayerChromingController(this._videoController, this._videoDomController, this._alertsController);

    this._videoDomController.attachVideoController(this._videoController);

    this._audioController = new AudioController(this._videoController);
    this._subtitlesController = new SubtitlesController(this._videoController);

    this._configAdapter = new ConfigAdapter(this._config);

    this._configAdapter.onWatermarkChange$.pipe(takeUntil(this._destroyed$)).subscribe((watermark) => {
      this._videoDomController.setWatermark(watermark ?? '');
    });

    this._configAdapter.onThumbnailUrlChange$.pipe(takeUntil(this._destroyed$)).subscribe((thumbnailUrl) => {
      if (thumbnailUrl) {
        this._videoDomController.loadThumbnailVtt(thumbnailUrl);
      }
    });

    this._configAdapter.onThemeConfigChange$.pipe(takeUntil(this._destroyed$)).subscribe((config) => {
      this._videoDomController.updateChromingTemplate(config.playerChroming!);
    });
  }

  setAuthentication(authentication: AuthenticationData) {
    AuthConfig.authentication = authentication;
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
    return new Observable<MarkerList>((observer) => {
      const markerList = new MarkerList(config, this._videoController);

      if (config.vttUrl) {
        markerList.onVttLoaded$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
          nextCompleteObserver(observer, markerList);
        });
      } else {
        // timeout is here to make sure the marker list element is created in the dom
        setTimeout(() => {
          nextCompleteObserver(observer, markerList);
        });
      }
    });
  }

  initializeRouterVisualization(config: RouterVisualizationConfig): RouterVisualizationApi {
    return new RouterVisualization(config, this._videoController);
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

  get chroming(): ChromingApi {
    return this._chromingController;
  }

  get config(): OmakasePlayerConfig {
    return this._configAdapter.config;
  }

  set config(config: Partial<OmakasePlayerConfig>) {
    this._configAdapter.config = config;
  }

  destroy() {
    BlobUtil.revokeAll();

    destroyer(this._timeline, this._subtitlesController, this._audioController, this._videoController, this._chromingController, this._videoDomController);

    nextCompleteSubject(this._destroyed$);

    nullifier(this._timeline, this._videoController, this._audioController, this._subtitlesController, this._chromingController);
  }
}
