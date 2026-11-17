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

import type {Destroyable} from './common/capabilities';
import {ObserverBreaker} from './common/observer-breaker';
import {OmakaseAudioContextProvider} from './omakase-audio-context-provider';

export abstract class BaseOmakasePlayer implements Destroyable {
  protected _destroyBreaker = new ObserverBreaker();

  private _audioContextProviderReleased = false;

  protected constructor() {
    OmakaseAudioContextProvider.acquire();
  }

  /**
   * Releases this player's hold on the shared {@link OmakaseAudioContextProvider}. Idempotent.
   * Subclasses call it as the last step of destroy(), after all audio nodes are torn down, so nothing touches the
   * provider afterwards and lazily re-creates it.
   */
  protected releaseAudioContextProvider(): void {
    if (!this._audioContextProviderReleased) {
      this._audioContextProviderReleased = true;
      OmakaseAudioContextProvider.release();
    }
  }

  destroy(): void {
    this._destroyBreaker.destroy();
  }
}
