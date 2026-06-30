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
import {DETACHED_PLAYER_CONFIG_DEFAULT, PlayerDetached} from './player/player-detached';

import {type PlayerDetachedApi, type PlayerDetachedConfig} from './player';
import type {PrefixKeys} from './types/ts-types';

// @ts-ignore
import './../style/omakase-player.scss';
import type {OmakasePlayerDetachedApi} from './omakase-player-api';
import {filter, fromEvent, Observable, race, takeUntil} from 'rxjs';
import {AuthConfig, type AuthenticationData, WindowPlaybackMode} from './common';
import {nextCompleteObserver, passiveObservable} from './util/rxjs-util';
import {DEFAULT_PLAYER_CHROMING, type PlayerChromingConfig} from './chroming';
import {RemoteNodeEventType} from './remoting/remote-node';
import {SessionEventType} from './session';
import {SessionStoreProxy} from './remoting/impl/session-store-proxy';
import {ChromingDetached} from './chroming/chroming-detached';
import {BaseOmakasePlayer} from './base-omakase-player';
import {ClientRemoteNode} from './remoting/client-remote-node';
import {REMOTING} from './constants';
import {prefixKeys} from './util/util-functions';
import {OmpProvider} from './omp-provider';

export interface OmakasePlayerDetachedConfigApi {
  detachedBroadcastChannelId: string;

  authentication?: AuthenticationData;
}

export type OmakasePlayerDetachedConfig = OmakasePlayerDetachedConfigApi & PrefixKeys<PlayerDetachedConfig, 'player'> & PrefixKeys<PlayerChromingConfig, 'chroming'>;

const _configDefault: OmakasePlayerDetachedConfig = {
  detachedBroadcastChannelId: REMOTING.detachedBroadcastChannelId,

  ...prefixKeys(DETACHED_PLAYER_CONFIG_DEFAULT, 'player'),

  chromingTheme: DEFAULT_PLAYER_CHROMING.theme,
  chromingFullscreenChroming: DEFAULT_PLAYER_CHROMING.fullscreenChroming,
};

export class OmakasePlayerDetached extends BaseOmakasePlayer implements OmakasePlayerDetachedApi {
  protected _config: OmakasePlayerDetachedConfig;

  private readonly _ompProvider = new OmpProvider();

  private _remoteNode: ClientRemoteNode;

  private _sessionStore?: SessionStoreProxy;

  protected _playerDetached: PlayerDetached;
  protected _chroming: ChromingDetached;

  protected _destroyBreaker = new ObserverBreaker();

  constructor(config?: Partial<OmakasePlayerDetachedConfig>) {
    super();
    this._config = {
      ..._configDefault,
      ...config,
    } as OmakasePlayerDetachedConfig;

    this._playerDetached = new PlayerDetached({
      htmlElementId: this._config.playerHtmlElementId,
      audioMode: this._config.playerAudioMode,
      textMode: this._config.playerTextMode,
      textMainTracksHandler: this._config.playerTextMainTracksHandler,
      ...(this._config.playerControllerConfig ? {controllerConfig: this._config.playerControllerConfig} : {}),
    });
    this._chroming = new ChromingDetached({
      playerHtmlElementId: this._config.playerHtmlElementId,
      playerDetachable: false,
      theme: this._config.chromingTheme,
      themeConfig: this._config.chromingThemeConfig,
      watermark: this._config.chromingWatermark,
      watermarkVisibility: this._config.chromingWatermarkVisibility,
      fullscreenChroming: this._config.chromingFullscreenChroming,
      styleUrl: this._config.chromingStyleUrl,
      requestAttachFn: () => {
        this._sessionStore?.requestWindowPlaybackModeChange(WindowPlaybackMode.ATTACHED);
      },
      requestDetachFn: () => {
        throw new Error(`Cannot detach from detached`);
      },
    });
    this._playerDetached.setChromingInternal(this._chroming);
    this._chroming.setPlayerInternal(this._playerDetached);
    this._ompProvider.omakaseTrack.setPlayerInternal(this._playerDetached);

    let remoteNode = new ClientRemoteNode(this._config.detachedBroadcastChannelId, this._playerDetached, this._chroming, this._ompProvider);
    this._remoteNode = remoteNode;

    let disconnect = () => {
      this.destroy();
    };

    remoteNode.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type === RemoteNodeEventType.REMOTE_NODE_CONNECT_FAILURE || p.type === RemoteNodeEventType.REMOTE_NODE_DISCONNECTED))
      .subscribe(() => {
        this.destroy();
      });

    remoteNode.onEvent$
      .pipe(takeUntil(this._destroyBreaker.observer))
      .pipe(filter((p) => p.type === RemoteNodeEventType.REMOTE_NODE_CONNECTED))
      .subscribe((event) => {
        this._playerDetached.setRemoteProxies(remoteNode);
        this._chroming.setRemoteProxies(remoteNode);

        this._sessionStore = remoteNode.getProxyByName('SessionStore');
        this._sessionStore.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
          next: (event) => {
            if (event.type === SessionEventType.SESSION_WINDOW_PLAYBACK_UPDATED) {
              switch (event.data.windowPlayback.mode) {
                case WindowPlaybackMode.ATTACHED:
                  console.error('Something is wrong, I should not exist by now..');
                  this.destroy();
                  break;
                case WindowPlaybackMode.DETACHED:
                  this._chroming.domController.showLoaded();
                  this._chroming.domController.setAttachDetachButtonEnabled(event.data.windowPlayback.canAttach);
                  break;
                case WindowPlaybackMode.FAILURE:
                  this._chroming.domController.showError();
                  break;
                case WindowPlaybackMode.ATTACHING:
                  this.destroy();
                  break;
                default:
                  break;
              }
            }
          },
        });

        race(fromEvent(window, 'unload'), fromEvent(window, 'beforeunload'))
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: (event) => {
              this._sessionStore!.requestWindowPlaybackModeChange(WindowPlaybackMode.ATTACHED);
            },
          });
      });

    remoteNode.startConnectLoop();
  }

  setAuthentication(authentication: AuthenticationData): Observable<void> {
    return passiveObservable<void>((observer) => {
      AuthConfig.authentication = authentication;
      nextCompleteObserver(observer);
    });
  }

  get player(): PlayerDetachedApi {
    return this._playerDetached;
  }

  destroy(): void {
    super.destroy();

    this._remoteNode.destroy();
    this._ompProvider.destroy();
  }
}
