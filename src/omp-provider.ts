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

import {AlertsManager} from './session/alert';
import {SessionStore} from './session';
import {TrackRepository} from './repository';
import {MainMediaRepository} from './repository';
import {TrackUtils} from './track/track-utils';
import {OmakaseTrackApiImpl} from './track/omakase-track';
import {Ui} from './ui';
import {AudioEffectsRegistry} from './audio';
import {MediaDeserializer} from './media/media-deserializer';
import {SlateProvider} from './media';
import type {Destroyable} from './common/capabilities';

export class OmpProvider implements Destroyable {
  readonly alertsManager: AlertsManager;
  readonly sessionStore: SessionStore;
  readonly trackRepository: TrackRepository;
  readonly mainMediaRepository: MainMediaRepository;
  readonly trackUtils: TrackUtils;
  readonly omakaseTrack: OmakaseTrackApiImpl;
  readonly ui: Ui;
  readonly audioEffectsRegistry: AudioEffectsRegistry;
  readonly mediaDeserializer: MediaDeserializer;
  readonly slateProvider: SlateProvider;

  constructor() {
    this.alertsManager = new AlertsManager();
    this.trackRepository = new TrackRepository();
    this.mainMediaRepository = new MainMediaRepository(this.trackRepository);
    this.sessionStore = new SessionStore(this.alertsManager);
    this.trackUtils = new TrackUtils(this.trackRepository);
    this.omakaseTrack = new OmakaseTrackApiImpl(this.trackRepository, this.trackUtils);
    this.ui = new Ui();
    this.audioEffectsRegistry = new AudioEffectsRegistry();
    this.mediaDeserializer = new MediaDeserializer();
    this.slateProvider = new SlateProvider();
  }

  destroy() {
    this.sessionStore.destroy();
    this.omakaseTrack.destroy();
    this.mainMediaRepository.destroy();
    this.trackRepository.destroy();
    this.trackUtils.destroy();
    this.alertsManager.destroy();
    this.audioEffectsRegistry.destroy();
    this.mediaDeserializer.destroy();
    this.slateProvider.destroy();
    this.ui.destroy();
  }
}