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
import {filter, first, forkJoin, Observable, Subject, takeUntil} from 'rxjs';
import {AudioApi, OmakasePlayerApi, SubtitlesApi, TimelineApi, VideoApi} from './api';
import {VIDEO_HLS_CONTROLLER_CONFIG_DEFAULT, VideoHlsController} from './video/video-hls-controller';
import {SubtitlesController} from './subtitles/subtitles-controller';
import EventEmitter from 'eventemitter3';
import {OmakaseEventKey, OmakaseEventListener} from './events';
import {Destroyable, OmakasePlayerEventMap, OmakasePlayerEvents, OmakasePlayerEventsType} from './types';
import {AudioController} from './audio/audio-controller';
import {ConfigWithOptionalStyle} from './common';
// we need to include styles in compilation process, thus import them
import './../style/omakase-player.scss'
import {nextCompleteVoidSubject} from './util/observable-util';
import {VideoControllerApi} from './video/video-controller-api';
import {destroyer, nullifier} from './util/destroy-util';
import {HlsConfig} from 'hls.js';
import {VIDEO_CONTROLLER_CONFIG_DEFAULT} from './video/video-controller';
import {YogaProvider} from './common/yoga-provider';
import {Video, VideoLoadOptions} from './video';
import {SubtitlesHlsController} from './subtitles/subtitles-hls-controller';
import {VideoNativeController} from './video/video-native-controller';
import {AlertsController} from './alerts/alerts-controller';
import {AlertsApi} from './api/alerts-api';
import {BlobUtil} from './util/blob-util';

export interface OmakasePlayerConfig {
  playerHTMLElementId?: string;
  crossorigin?: 'anonymous' | 'use-credentials',
  hls?: Partial<HlsConfig>
}

const configDefault: OmakasePlayerConfig = {
  playerHTMLElementId: VIDEO_CONTROLLER_CONFIG_DEFAULT.playerHTMLElementId,
  crossorigin: VIDEO_CONTROLLER_CONFIG_DEFAULT.crossorigin,
  hls: {
    ...VIDEO_HLS_CONTROLLER_CONFIG_DEFAULT.hls
  }
}

export class OmakasePlayer implements OmakasePlayerApi, Destroyable {
  private readonly _config: OmakasePlayerConfig;
  // controllers
  private _videoController: VideoControllerApi;
  private _audioController: AudioController;
  private _subtitlesController: SubtitlesController;
  private _alertsController: AlertsController;

  private _eventEmitter = new EventEmitter();
  private _destroyed$ = new Subject<void>();

  private _timeline?: Timeline;

  constructor(config?: OmakasePlayerConfig) {
    this._config = config ? {
      ...configDefault,
      ...config
    } : {
      ...configDefault,
    };

    let loader: 'hls' | 'native' = 'hls'; // for now lets just use HLS

    if (loader === 'hls') {
      this._videoController = new VideoHlsController({
        playerHTMLElementId: this._config.playerHTMLElementId,
        crossorigin: this._config.crossorigin,
        hls: this._config.hls
      });
    } else {
      this._videoController = new VideoNativeController({
        playerHTMLElementId: this._config.playerHTMLElementId,
        crossorigin: this._config.crossorigin
      });
    }

    this._audioController = new AudioController(this._videoController);

    if (loader === 'hls') {
      this._subtitlesController = new SubtitlesHlsController(this._videoController);
    } else {
      this._subtitlesController = new SubtitlesController(this._videoController);
    }

    this._alertsController = new AlertsController();

    this.bindEventHandlers();
  }

  loadVideo(videoSourceUrl: string, frameRate: number | string, options?: VideoLoadOptions): Observable<Video> {
    return new Observable<Video>(o$ => {
      this._videoController.loadVideo(videoSourceUrl, frameRate, options).pipe(first()).subscribe({
        next: video => {
          o$.next(video);
          o$.complete();
        },
        error: (error) => {
          o$.error(error);
          o$.complete();
        }
      })
    })
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

    this._videoController.onVideoLoaded$.pipe(takeUntil(this._destroyed$), filter(p => !!p)).subscribe((event) => {
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
    this._subtitlesController.onSubtitlesLoaded$.pipe(takeUntil(this._destroyed$), filter(p => !!p)).subscribe((event) => {
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

    nextCompleteVoidSubject(this._destroyed$);

    nullifier(
      this._timeline,
      this._videoController,
      this._audioController,
      this._subtitlesController,
      this._eventEmitter
    )
  }
}
