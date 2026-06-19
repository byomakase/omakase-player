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

import type {MainMedia, MainMediaLoadOptions} from './media';
import {Observable} from 'rxjs';
import type {AuthenticationData} from './common';
import type {PlayerApi, PlayerDetachedApi} from './player';
import type {AlertsApi, SessionApi} from './session';
import type {ChromingApi} from './chroming';
import type {OmakaseTrackApi} from './track';
import type {OmakaseToolsApi} from './tools';
import type {TimelineApi} from './timeline';
import type {UiApi} from './ui';

/**
 * Shared API surface for both attached and detached player modes.
 */
interface OmakasePlayerCommonApi {
  /**
   * Configures authentication for media requests. Supports basic, bearer, and custom header strategies.
   *
   * @param authentication - Authentication configuration (basic, bearer, or custom headers).
   */
  setAuthentication(authentication: AuthenticationData): Observable<void>;
}

/**
 * Primary API for the Omakase Player
 */
export interface OmakasePlayerApi extends OmakasePlayerCommonApi {
  /**
   * Track management API for adding, removing, loading, and querying marker and thumbnail tracks.
   */
  track: OmakaseTrackApi;

  /**
   * Session API for observing session state changes and accessing the current session snapshot
   */
  session: SessionApi;

  /**
   * Player control API.
   */
  player: PlayerApi;

  /**
   * Chroming (UI) API.
   */
  chroming: ChromingApi;

  /**
   * Tools API.
   */
  tools: OmakaseToolsApi;

  /**
   * Alerts API.
   */
  alerts: AlertsApi;

  /**
   * Timeline API.
   */
  timeline: TimelineApi | undefined;

  /**
   * UI API.
   */
  ui: UiApi;

  /**
   * Loads the primary media source (HLS, MP4, or audio file).
   *
   * @param url - URL of the media source.
   * @param loadOptions - Optional load configuration (frame rate, DRM data, poster, etc.).
   * @returns Observable that emits the loaded {@link MainMedia} instance.
   */
  loadMainMedia(url: string, loadOptions?: MainMediaLoadOptions | undefined): Observable<MainMedia>;

  /**
   * Detaches the player, transitioning it into a remote playback mode.
   */
  detachPlayer(): Observable<void>;

  /**
   * Re-attaches a previously detached player.
   */
  attachPlayer(): Observable<void>;
}

/**
 * API for the Omakase Player in detached (remote) mode.
 */
export interface OmakasePlayerDetachedApi extends OmakasePlayerCommonApi {
  /**
   * Reduced player control API available in detached mode.
   */
  get player(): PlayerDetachedApi;
}
