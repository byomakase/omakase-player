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

import {Subject, type Observable} from 'rxjs';
import type {Destroyable} from '../common/capabilities';
import type {MainMedia} from './main-media';
import type {MainMediaSessionController} from './main-media-session-controller';
import {MediaFactory} from './media-factory';
import type {TrackRepository} from '../repository/track-repository';

/**
 * {@link MainMediaSessionController} aggregator
 */
export class MainMediaSessionManager implements Destroyable {
  private readonly _sessionControllers: Map<MainMedia['id'], MainMediaSessionController> = new Map();
  private readonly _onCreated$ = new Subject<{mainMediaId: MainMedia['id']; sessionController: MainMediaSessionController}>();

  private readonly _trackRepository: TrackRepository;

  constructor(trackRepository: TrackRepository) {
    this._trackRepository = trackRepository;
  }

  get onCreated$(): Observable<{mainMediaId: MainMedia['id']; sessionController: MainMediaSessionController}> {
    return this._onCreated$.asObservable();
  }

  create(mainMedia: MainMedia): MainMediaSessionController | undefined {
    this.delete(mainMedia.id);

    const sessionController = MediaFactory.createMainMediaSessionController(mainMedia, this._trackRepository);
    if (sessionController) {
      this._sessionControllers.set(mainMedia.id, sessionController);
      this._onCreated$.next({mainMediaId: mainMedia.id, sessionController: sessionController});
    }

    return sessionController;
  }

  get(mainMediaId: MainMedia['id']): MainMediaSessionController | undefined {
    return this._sessionControllers.get(mainMediaId);
  }

  delete(mainMediaId: MainMedia['id']): void {
    this._sessionControllers.get(mainMediaId)?.destroy();
    this._sessionControllers.delete(mainMediaId);
  }

  clear(): void {
    this._sessionControllers.forEach((sessionController) => sessionController.destroy());
    this._sessionControllers.clear();
  }

  destroy(): void {
    this.clear();
  }
}
