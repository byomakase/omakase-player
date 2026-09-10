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

import type {Observable} from 'rxjs';
import type {MainMedia, MainMediaLoadOptions} from '../media';

export interface TamsMainMediaSessionState {
  masterUrl: string;
  manifests: Record<string, string>;
  textTimestampShifts: Record<string, number>;
  mediaSequences: Record<string, number>;
  hlsLoadOptions?: MainMediaLoadOptions | undefined;
  thumbnailVtt?: string | undefined;
}

export interface TamsMainMediaSessionStateUpdate {
  mainMediaId: MainMedia['id'];
  sessionState: TamsMainMediaSessionState;
}

/**
 * The TAMS session as the player controller reads it: the session controller when this window owns
 * the media, a remote to the owning window when it does not.
 *
 * Held per media rather than once per page, so two players on the same page cannot answer for each
 * other's media.
 */
export interface TamsMainMediaSession {
  onSessionStateUpdated$: Observable<TamsMainMediaSessionStateUpdate>;

  getSessionState(mainMediaId: MainMedia['id']): Observable<TamsMainMediaSessionState | undefined>;
}
