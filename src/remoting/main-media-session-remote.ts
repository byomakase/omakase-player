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

import type {RemoteNode} from './remote-node';
import type {MainMediaSessionController} from '../media/main-media-session-controller';

/**
 * The session of media this window plays but does not own, reaching the window that does.
 *
 * A session either resolves what the media needs or reaches the one that did, so this is a session
 * like any other - {@link prepare} has nothing to do, because preparing happened in the owning
 * window. Created per media type by {@link MediaFactory.createMainMediaSessionRemote}, so a type
 * needing nothing has none.
 */
export interface MainMediaSessionRemote extends MainMediaSessionController {
  /** Takes hold of the owning window. Called before the media it belongs to is loaded. */
  connect(remoteNode: RemoteNode): void;
}
