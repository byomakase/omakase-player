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

import {Observable} from 'rxjs';
import type {SessionEvent} from './session-event';
import type {SessionState} from './session-store';
import {WindowPlaybackMode} from '../common';

export interface SessionApi {
  onEvent$: Observable<SessionEvent>;

  get state(): SessionState;
}

export const WINDOW_PLAYBACK_MODE_TRANSITIONS: Record<WindowPlaybackMode, WindowPlaybackMode[]> = {
  [WindowPlaybackMode.ATTACHED]: [WindowPlaybackMode.ATTACHING],
  [WindowPlaybackMode.ATTACHING]: [WindowPlaybackMode.DETACHED, WindowPlaybackMode.FAILURE],
  [WindowPlaybackMode.DETACHING]: [WindowPlaybackMode.ATTACHED],
  [WindowPlaybackMode.DETACHED]: [WindowPlaybackMode.DETACHING],
  [WindowPlaybackMode.FAILURE]: [WindowPlaybackMode.ATTACHED, WindowPlaybackMode.ATTACHING, WindowPlaybackMode.DETACHED, WindowPlaybackMode.DETACHING],
};
