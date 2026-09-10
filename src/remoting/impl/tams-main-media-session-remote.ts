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

import {EMPTY, type Observable, of} from 'rxjs';
import type {MainMedia} from '../../media';
import type {MainMediaSessionRemote} from '../main-media-session-remote';
import type {RemoteNode} from '../remote-node';
import type {TamsMainMediaSession, TamsMainMediaSessionState, TamsMainMediaSessionStateUpdate} from '../../tams/tams-main-media-session';

/**
 * The session of TAMS media this window plays but does not own.
 *
 * Playlists are synthetic URLs backed by text held in the window that built them, so a window that
 * did not prepare the media can neither resolve nor fetch them; it reads them from the owning
 * window instead, and is sent the rewrites made while live.
 */
export class TamsMainMediaSessionRemote implements MainMediaSessionRemote, TamsMainMediaSession {
  protected _session: TamsMainMediaSession | undefined;

  connect(remoteNode: RemoteNode): void {
    this._session = remoteNode.getProxyByName('TamsMainMediaSession');
  }

  /** Preparing happened in the window owning the media; there is nothing to do here. */
  prepare(): Observable<void> {
    return of(void 0);
  }

  get onSessionStateUpdated$(): Observable<TamsMainMediaSessionStateUpdate> {
    return this._session ? this._session.onSessionStateUpdated$ : EMPTY;
  }

  getSessionState(mainMediaId: MainMedia['id']): Observable<TamsMainMediaSessionState | undefined> {
    return this._session ? this._session.getSessionState(mainMediaId) : of(void 0);
  }

  destroy(): void {
    this._session = void 0;
  }
}
