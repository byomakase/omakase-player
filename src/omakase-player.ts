/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import {Timeline, TimelineConfig} from "./timeline/timeline";
import {filter, first, Observable, Subject, takeUntil} from "rxjs";
import {OmakasePlayerApi} from "./api/omakase-player-api";
import {VideoHlsController} from "./video/video-hls-controller";
import {SubtitlesController} from "./subtitles/subtitles-controller";
import {SubtitlesApi} from "./api/subtitles-api";
import {VideoApi} from "./api/video-api";
import {Video} from "./video/video";
import EventEmitter from "eventemitter3";
import {OmakaseEventKey, OmakaseEventListener} from "./events";
import {Destroyable, OmakasePlayerEventMap, OmakasePlayerEvents, OmakasePlayerEventsType} from "./types";
import {AudioController} from "./audio/audio-controller";
import {AudioApi} from "./api/audio-api";
import {StyleAdapter} from "./common/style-adapter";
import {StylesProvider} from "./common/styles-provider";
import {ComponentConfigStyleComposed} from "./common/component";
import {WithOptionalPartial} from "./types/types";
// needed for styles compilation
import './../style/omakase-player.scss'
import {nextCompleteVoidSubject} from "./util/observable-util";
import {VideoControllerApi} from "./video/video-controller-api";
import {DestroyUtil} from "./util/destroy-util";

export interface OmakasePlayerStyle {
  fontFamily: string
}

export const OMAKASE_PLAYER_STYLE_DEFAULT: OmakasePlayerStyle = {
  fontFamily: 'Arial'
}

export interface OmakasePlayerConfig {
    playerHTMLElementId: string;
    crossorigin: 'anonymous' | 'use-credentials',
    style: OmakasePlayerStyle
}

const configDefault: OmakasePlayerConfig = {
    playerHTMLElementId: 'omakase-player',
    crossorigin: 'anonymous',
    style: {
        ...OMAKASE_PLAYER_STYLE_DEFAULT
    }
}

export class OmakasePlayer implements OmakasePlayerApi, Destroyable {
  private stylesProvider: StylesProvider = StylesProvider.instance();

  // controllers
  private videoController: VideoControllerApi;
  private audioController: AudioController;
  private subtitlesController: SubtitlesController;

  private readonly config: OmakasePlayerConfig;
  private readonly playerHTMLElementId: string;

  private eventEmitter = new EventEmitter();
  private onDestroy$ = new Subject<void>();

  private styleAdapter: StyleAdapter<OmakasePlayerStyle>;
  private _timeline: Timeline;

  constructor(config: WithOptionalPartial<OmakasePlayerConfig, 'style'>) {
    this.config = {
      ...configDefault,
      ...config,
      style: {
        ...configDefault.style,
        ...config.style,
      }
    };

    this.styleAdapter = new StyleAdapter<OmakasePlayerStyle>({
      ...OMAKASE_PLAYER_STYLE_DEFAULT,
      ...this.config.style
    })

    // set initial style to provider
    this.stylesProvider.styles = {
      omakasePlayerStyle: this.style
    }

    this.styleAdapter.onChange$.pipe(takeUntil(this.onDestroy$)).subscribe((style) => {
      this.stylesProvider.styles = {
        omakasePlayerStyle: this.style
      }
    })

        this.videoController = new VideoHlsController(this.config.playerHTMLElementId, this.config.crossorigin);
        this.audioController = new AudioController(this.videoController);
        this.subtitlesController = new SubtitlesController(this.videoController);

    this.bindEventHandlers();
  }

  loadVideo(videoSourceUrl: string, videoFrameRate: number, duration?: number): Observable<Video> {
    return new Observable<Video>(o$ => {
      this.videoController.loadVideo(videoSourceUrl, videoFrameRate, duration).pipe(first()).subscribe({
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

  createTimeline(config: Partial<ComponentConfigStyleComposed<TimelineConfig>>): Observable<Timeline> {
    return new Observable<Timeline>(o$ => {
      let createTimeline = () => {
        console.debug('Creating timeline')

        this._timeline = new Timeline(config, this.videoController);

        this._timeline.initCanvasNode();

        // bind timeline event handlers
        this._timeline.onScroll$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
          this.emit('omakaseTimelineScroll', event);
        })

        this._timeline.onZoom$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
          this.emit('omakaseTimelineZoom', event);
        })
      }

      if (!this.timeline) {
        // wait for video to load and then create Timeline
        // stay subscribed, every next change of video will trigger setVideo
        console.debug('Timeline creation in progress, checking video load status..')

        if (this.videoController.isVideoLoaded()) {
          console.debug('Video is already loaded')
          createTimeline();

          o$.next(this._timeline);
          o$.complete();
        } else {
          console.debug('Waiting video to load..')
          this.videoController.onVideoLoaded$.pipe(filter(p => !!p), first()).subscribe(video => {
            console.debug('Video just loaded')
            createTimeline();

            o$.next(this._timeline);
            o$.complete();
          })
        }

      } else {
        // cannot create Timeline twice, just return current instance
        o$.next(this._timeline);
        o$.complete();
      }
    })
  }

  private bindEventHandlers() {
    // video
    this.videoController.onPlay$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseVideoPlay', event);
    })

    this.videoController.onPause$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseVideoPause', event);
    })

    this.videoController.onVideoLoaded$.pipe(takeUntil(this.onDestroy$), filter(p => !!p)).subscribe((event) => {
      this.emit('omakaseVideoLoaded', event);
    })

    this.videoController.onVideoTimeChange$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseVideoTimeChange', event);
    })

    this.videoController.onSeeking$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseVideoSeeking', event);
    })

    this.videoController.onSeeked$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseVideoSeeked', event);
    })

    this.videoController.onBuffering$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseVideoBuffering', event);
    })

    this.videoController.onEnded$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseVideoEnded', event);
    })

    this.videoController.onAudioSwitched$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseVideoAudioSwitched', event);
    })

    // audio
    this.audioController.onAudioSwitched$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseAudioSwitched', event);
    })

    // subtitles
    this.subtitlesController.onCreate$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseSubtitlesCreate', event);
    })

    this.subtitlesController.onRemove$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseSubtitlesRemove', event);
    })

    this.subtitlesController.onShow$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseSubtitlesShow', event);
    })

    this.subtitlesController.onHide$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
      this.emit('omakaseSubtitlesHide', event);
    })
  }

  // region eventemmiter

  emit<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K, event: OmakasePlayerEventMap[K]): void {
    this.eventEmitter.emit(eventKey, event);
  }

  off<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K, handler: OmakaseEventListener<OmakasePlayerEventMap[K]>): void {
    this.eventEmitter.off(eventKey, handler);
  }

  on<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K, handler: OmakaseEventListener<OmakasePlayerEventMap[K]>): void {
    this.eventEmitter.on(eventKey, handler);
  }

  listenerCount<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K): void {
    this.eventEmitter.listenerCount(eventKey);
  }

  listeners<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K): OmakaseEventListener<OmakasePlayerEventMap[K]>[] {
    return this.eventEmitter.listeners(eventKey);
  }

  once<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey: K, handler: OmakaseEventListener<OmakasePlayerEventMap[K]>): void {
    this.eventEmitter.once(eventKey, handler);
  }

  removeAllListeners<K extends OmakaseEventKey<OmakasePlayerEventMap>>(eventKey?: K): void {
    this.eventEmitter.removeAllListeners(eventKey);
  }

  // endregion

  get style(): OmakasePlayerStyle {
    return this.styleAdapter.style;
  }

  set style(value: Partial<OmakasePlayerStyle>) {
    this.styleAdapter.style = value;
  }

  get timeline(): Timeline {
    return this._timeline;
  }

  get video(): VideoApi {
    return this.videoController;
  }

  get audio(): AudioApi {
    return this.audioController;
  }

  get subtitles(): SubtitlesApi {
    return this.subtitlesController;
  }

  get EVENTS(): OmakasePlayerEventsType {
    return OmakasePlayerEvents;
  }

  destroy() {
    DestroyUtil.destroy(this._timeline, this.videoController, this.audioController, this.subtitlesController);

    this.eventEmitter.removeAllListeners();

    this._timeline = void 0;
    this.videoController = void 0;
    this.audioController = void 0;
    this.subtitlesController = void 0;

    this.styleAdapter = void 0;
    this.stylesProvider = void 0;
    this.eventEmitter = void 0;

    nextCompleteVoidSubject(this.onDestroy$);

    // TODO: clean remaining items
  }
}
