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

import {ObserverBreaker} from './common/observer-breaker';
import {type MainMedia, type MainMediaLoadOptions, ThumbnailTrack} from './media';
import {BehaviorSubject, combineLatest, concat, filter, Observable, takeUntil} from 'rxjs';
import {Player, type PlayerApi, type PlayerConfig, type PlayerDetachedApi, type PlayerInternalApi} from './player';
import {type PrefixKeys} from './types/ts-types';
import {type AlertsApi, type SessionApi, SessionEventType, type SessionState, SessionStore} from './session';
import {AuthConfig, type AuthenticationData, WindowPlaybackMode} from './common';
import {PLAYER_LOCAL_CONFIG_DEFAULT} from './player/player-local';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from './util/rxjs-util';
import {RemoteNodeEventType} from './remoting/remote-node';
import {WindowUtil} from './util/window-util';
// @ts-ignore
import './../style/omakase-player.scss';
import type {OmakasePlayerApi} from './omakase-player-api';
import {Chroming} from './chroming/chroming';
import {type ChromingApi, type ChromingDetachedApi, type ChromingInternalApi, DEFAULT_PLAYER_CHROMING, type PlayerChromingConfig} from './chroming';
import type {OmakaseTrackApi} from './track';
import {BaseOmakasePlayer} from './base-omakase-player';
import {HostRemoteNode} from './remoting/host-remote-node';
import {StringUtil} from './util/string-util';
import {REMOTING} from './constants';
import {OmakaseTools, type OmakaseToolsApi} from './tools/omakase-tools-api';
import {prefixKeys} from './util/util-functions';
import type {ConfigAndStyle, TimelineApi, TimelineConfig, TimelineStyle} from './timeline';
import {TimelineImpl} from './timeline';
import {YogaProvider} from './timeline/layout/yoga-provider';
import {type UiApi} from './ui';
import {OmpProvider} from './omp-provider';
import type {OmakaseTrackApiImpl} from './track/omakase-track';

export type OmakasePlayerConfig = {
  authentication?: AuthenticationData | undefined;

  detachedBroadcastChannelId?: string | undefined;
  detachWindowUrlFn?: (mainMedia: MainMedia) => string;
  detachWindowFeatures?: string | undefined;
} & PrefixKeys<PlayerConfig, 'player'> &
  PrefixKeys<PlayerChromingConfig, 'chroming'>;

const _configDefault: OmakasePlayerConfig = {
  detachedBroadcastChannelId: REMOTING.detachedBroadcastChannelId,

  ...prefixKeys(PLAYER_LOCAL_CONFIG_DEFAULT, 'player'),

  chromingTheme: DEFAULT_PLAYER_CHROMING.theme,
  chromingFullscreenChroming: DEFAULT_PLAYER_CHROMING.fullscreenChroming,
};

export class OmakasePlayer extends BaseOmakasePlayer implements OmakasePlayerApi {
  private _config: OmakasePlayerConfig;

  private readonly _ompProvider = new OmpProvider();
  private readonly _session: SessionStore;

  private _player: Player;
  private _playerDetached?: PlayerDetachedApi | undefined;

  private _chroming: Chroming;
  private _chromingDetached?: ChromingDetachedApi | undefined;

  private _omakaseTrack: OmakaseTrackApiImpl;

  private _remoteNode: HostRemoteNode | undefined;
  private _playerDetachedWindow: WindowProxy | undefined;

  private _timelines: Map<TimelineApi['id'], TimelineApi> = new Map();

  private _detachingBreaker = new ObserverBreaker();
  private _detachedBreaker = new ObserverBreaker();
  private _attachingBreaker = new ObserverBreaker();

  constructor(config?: Partial<OmakasePlayerConfig>) {
    super();
    this._config = {
      ..._configDefault,
      ...config,
    } as OmakasePlayerConfig;

    AuthConfig.authentication = this._config.authentication;

    this._session = this._ompProvider.sessionStore;

    this._session.update({
      isDetachable: !!this._config.detachWindowUrlFn,
    });

    this._player = new Player(this._ompProvider, {
      htmlElementId: this._config.playerHtmlElementId,
      audioMode: this._config.playerAudioMode,
      textMode: this._config.playerTextMode,
      textMainTracksHandler: this._config.playerTextMainTracksHandler,
      ...(this._config.playerControllerConfig ? {controllerConfig: this._config.playerControllerConfig} : {}),
    });
    this._chroming = new Chroming(this._ompProvider, {
      playerHtmlElementId: this._config.playerHtmlElementId,
      playerDetachable: this._session.state.isDetachable,
      theme: this._config.chromingTheme,
      themeConfig: this._config.chromingThemeConfig,
      watermark: this._config.chromingWatermark,
      watermarkVisibility: this._config.chromingWatermarkVisibility,
      fullscreenChroming: this._config.chromingFullscreenChroming,
      styleUrl: this._config.chromingStyleUrl,
      requestDetachFn: () => {
        this._session.requestWindowPlaybackModeChange(WindowPlaybackMode.DETACHED);
      },
      requestAttachFn: () => {
        this._session.requestWindowPlaybackModeChange(WindowPlaybackMode.ATTACHED);
      },
    });
    this._player.setChromingInternal(this._chroming.chromingLocal);
    this._chroming.setPlayerInternal(this._player.playerLocal);
    this._ompProvider.omakaseTrack.setPlayerInternal(this._player.playerLocal);

    this._omakaseTrack = this._ompProvider.omakaseTrack;

    this._session.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type === SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED))
      .subscribe((event) => {
        switch (event.data.windowPlayback.mode) {
          case WindowPlaybackMode.ATTACHING:
            this._chroming.prepareDomForAttaching();
            this._chroming.chromingLocal.domController.showLoading();
            break;
          case WindowPlaybackMode.ATTACHED:
            this._chroming.chromingLocal.domController.showLoaded();
            this._chroming.chromingLocal.domController.setAttachDetachButtonEnabled(event.data.windowPlayback.canDetach);
            break;
          case WindowPlaybackMode.DETACHING:
            this._chroming.prepareDomForDetaching();
            break;
        }
      });

    this._session.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type === SessionEventType.SESSION_WINDOW_PLAYBACK_MODE_CHANGE_REQUEST))
      .subscribe((event) => {
        switch (event.data.mode) {
          case WindowPlaybackMode.ATTACHED:
            this.attachPlayer();
            break;
          case WindowPlaybackMode.DETACHED:
            this.detachPlayer();
            break;
        }
      });
  }

  loadMainMedia(url: string, loadOptions?: MainMediaLoadOptions): Observable<MainMedia> {
    return this._player.loadMainMedia(url, loadOptions);
  }

  detachPlayer(): Observable<void> {
    // start detaching process
    let sessionState = this._session.state;

    if (!sessionState.windowPlayback.canDetach) {
      throw new Error(`Cannot detach.`);
    }

    if (!this._player.mainMedia) {
      throw new Error(`Main media not loaded in local player, cannot detach`);
    }

    if (StringUtil.isEmpty(this._config.detachedBroadcastChannelId)) {
      throw new Error(`Cannot detach, broadcast channel id is not defined.`);
    }

    let mainMedia = this._player.mainMedia;

    let prepare = new Observable((observer) => {
      if (sessionState.player.playback.playing) {
        this._player.pause().subscribe(() => {
          nextCompleteObserver(observer);
        });
      } else {
        nextCompleteObserver(observer);
      }
    });

    return passiveObservable((observer) => {
      let connectFailure = () => {
        this._session.updateWindowPlaybackMode(WindowPlaybackMode.FAILURE);
        this.attachPlayer();
      };

      let detachingFailure = () => {
        this._session.updateWindowPlaybackMode(WindowPlaybackMode.FAILURE);
        this.tryDisconnectDetached();
      };

      prepare.subscribe(() => {
        this._detachingBreaker.break();
        this._session.updateWindowPlaybackMode(WindowPlaybackMode.DETACHING);

        let remoteNode = new HostRemoteNode(this._config.detachedBroadcastChannelId!, this._ompProvider);
        this._remoteNode = remoteNode;

        let remoteNodeConnected = () => {
          this._player.clearPlayerSession();

          let playerDetached = remoteNode.getProxyByName('PlayerDetached');
          let chromingDetached = remoteNode.getProxyByName('ChromingDetached');

          this.restoreSession(sessionState, playerDetached, chromingDetached)
            .pipe(takeUntil(this._detachingBreaker.observer))
            .pipe(takeUntil(this._destroyBreaker.observer))
            .subscribe({
              next: () => {
                this._playerDetached = playerDetached;
                this._player.wireDetached(playerDetached);

                this._chromingDetached = chromingDetached;
                this._chroming.wireDetached(chromingDetached);

                remoteNode.onEvent$
                  .pipe(takeUntil(this._detachedBreaker.observer))
                  .pipe(takeUntil(this._destroyBreaker.observer))
                  .subscribe((event) => {
                    switch (event.type) {
                      case RemoteNodeEventType.REMOTE_NODE_DISCONNECTED:
                        this.attachPlayer();
                        break;
                    }
                  });

                this._detachingBreaker.break();

                this._session.updateWindowPlaybackMode(WindowPlaybackMode.DETACHED);
                nextCompleteObserver(observer);
              },
              error: (err) => {
                console.error(err);
                detachingFailure();

                this._detachingBreaker.break();

                errorCompleteObserver(observer, err);
              },
            });
        };

        remoteNode.onEvent$
          .pipe(takeUntil(this._detachingBreaker.observer))
          .pipe(takeUntil(this._destroyBreaker.observer))
          .pipe(
            filter((p) => p.type === RemoteNodeEventType.REMOTE_NODE_CONNECTED || p.type === RemoteNodeEventType.REMOTE_NODE_DISCONNECTED || p.type === RemoteNodeEventType.REMOTE_NODE_CONNECT_FAILURE)
          )
          .subscribe((event) => {
            switch (event.type) {
              case RemoteNodeEventType.REMOTE_NODE_CONNECTED:
                remoteNodeConnected();
                break;
              case RemoteNodeEventType.REMOTE_NODE_DISCONNECTED:
                console.debug(`Remote node disconnected`);
                connectFailure();
                break;
              case RemoteNodeEventType.REMOTE_NODE_CONNECT_FAILURE:
                console.debug(`Remote node connect failure`);
                connectFailure();
                errorCompleteObserver(observer, event.data.error);
                break;
            }
          });

        remoteNode.listenForConnections();

        this.openPlayerDetachedWindow(mainMedia);
      });
    });
  }

  protected tryDisconnectDetached() {
    if (this._playerDetached) {
      this._detachedBreaker.break();
      this._playerDetached?.destroy();
      this._remoteNode?.destroy();
      this.tryClosePlayerDetachedWindow();

      this._playerDetached = void 0;
    }
  }

  protected openPlayerDetachedWindow(mainMedia: MainMedia): void {
    if (this._config.detachWindowUrlFn) {
      let url = this._config.detachWindowUrlFn(mainMedia);
      this._playerDetachedWindow = WindowUtil.open(url, '_blank', this._config.detachWindowFeatures);
      if (!this._playerDetachedWindow) {
        console.debug(`Detached window was not available immediately after detaching`);
      }
    } else {
      throw new Error(`Cannot detach, provide detachWindowUrlFn`);
    }
  }

  protected tryClosePlayerDetachedWindow(): Observable<void> {
    return passiveObservable((observer) => {
      if (this._playerDetachedWindow) {
        try {
          this._playerDetachedWindow.close();
        } catch (e) {
          console.debug(e);
        }
      } else {
        // console.debug(`Window reference not found. Please close it manually.`);
      }
      // return immediately, this will enable closing window ASAP
      nextCompleteObserver(observer);
    });
  }

  attachPlayer(): Observable<void> {
    let sessionState = this._session.state;

    if (!sessionState.windowPlayback.canAttach) {
      throw new Error(`Cannot attach.`);
    }

    let prepare = new Observable((observer) => {
      if (sessionState.player.playback.playing) {
        try {
          this._player.pause();
          nextCompleteObserver(observer);
        } catch (err) {
          console.error(err);
          nextCompleteObserver(observer);
        }
      } else {
        nextCompleteObserver(observer);
      }
    });

    return passiveObservable((observer) => {
      prepare.subscribe(() => {
        this._attachingBreaker.break();
        this._session.updateWindowPlaybackMode(WindowPlaybackMode.ATTACHING);
        this.tryDisconnectDetached();

        let attachingFailure = () => {
          this._session.updateWindowPlaybackMode(WindowPlaybackMode.FAILURE);
        };

        let completeAttaching = () => {
          this._attachingBreaker.break();
        };

        this.restoreSession(sessionState, this._player.playerLocal, this._chroming.chromingLocal)
          .pipe(takeUntil(this._attachingBreaker.observer))
          .subscribe({
            next: (event) => {
              this._player.wireLocal();
              this._session.updateWindowPlaybackMode(WindowPlaybackMode.ATTACHED);

              completeAttaching();
              nextCompleteObserver(observer);
            },
            error: (err) => {
              console.error(err);
              attachingFailure();
              completeAttaching();
              errorCompleteObserver(observer, err);
            },
          });
      });
    });
  }

  protected restoreSession(sessionState: SessionState, player: PlayerInternalApi, chroming: ChromingInternalApi): Observable<void> {
    return new Observable((observer) => {
      let player$ = new Observable((observer) => {
        player.restorePlayerSession(sessionState.player).subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
        });
      });

      let chroming$ = new Observable((observer) => {
        chroming.restoreChromingSession(sessionState.chroming).subscribe({
          next: () => {
            nextCompleteObserver(observer);
          },
        });
      });

      concat(player$, chroming$)
        .pipe(takeUntil(this._detachingBreaker.observer))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          complete: () => {
            nextCompleteObserver(observer);
          },
        });
    });
  }

  protected isAttached(): boolean {
    return this._session.state.windowPlayback.mode === WindowPlaybackMode.ATTACHED;
  }

  protected isDetached(): boolean {
    return this._session.state.windowPlayback.mode === WindowPlaybackMode.DETACHED;
  }

  protected isFailure(): boolean {
    return this._session.state.windowPlayback.mode === WindowPlaybackMode.FAILURE;
  }

  setAuthentication(authentication: AuthenticationData): Observable<void> {
    return passiveObservable((observer) => {
      AuthConfig.authentication = authentication;
      nextCompleteObserver(observer);
    });
  }

  get player(): PlayerApi {
    return this._player;
  }

  get chroming(): ChromingApi {
    return this._chroming;
  }

  get session(): SessionApi {
    return this._session;
  }

  get track(): OmakaseTrackApi {
    return this._omakaseTrack;
  }

  get tools(): OmakaseToolsApi {
    return OmakaseTools.instance;
  }

  get alerts(): AlertsApi {
    return this._ompProvider.alertsManager;
  }

  get timeline(): TimelineApi | undefined {
    return this.getTimeline();
  }

  get ui(): UiApi {
    return this._ompProvider.ui;
  }

  createTimeline(configAndStyle?: ConfigAndStyle<TimelineConfig, TimelineStyle>): Observable<TimelineApi> {
    return passiveObservable((observer) => {
      let yogaLayoutReady$ = new BehaviorSubject<boolean>(false);

      // initialize yoga-layout
      YogaProvider.instance()
        .init()
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe(() => {
          yogaLayoutReady$.next(true);
        });

      combineLatest([yogaLayoutReady$.pipe(filter((p) => p))])
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe(() => {
          [...this._timelines.values()].forEach((p) => {
            p.destroy();
            this._timelines.delete(p.id);
          });

          let timeline = new TimelineImpl(this._player, this._ompProvider, configAndStyle);

          this._timelines.set(timeline.id, timeline);
          nextCompleteObserver(observer, timeline);
        });
    });
  }

  getTimeline(id?: TimelineApi['id']): TimelineApi | undefined {
    if (id) {
      return this._timelines.get(id);
    } else {
      return [...this._timelines.values()][0] ?? undefined;
    }
  }

  destroy(): void {
    super.destroy();

    this._attachingBreaker.destroy();
    this._detachingBreaker.destroy();
    this._detachedBreaker.destroy();

    this._player.destroy();
    this.tryDisconnectDetached();

    this._chroming.destroy();
    this._chromingDetached?.destroy();

    this._timelines.forEach((timeline) => timeline.destroy());
    this._timelines.clear();

    this._ompProvider.destroy();
  }
}
