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
import {ResourceRepository, TrackRepository} from './repository';
import {MainMediaRepository} from './repository';
import {TrackUtils} from './track/track-utils';
import {OmakaseTrackApiImpl} from './track/omakase-track';
import {Ui} from './ui';
import {AudioEffectsRegistry} from './audio';
import {MediaDeserializer} from './media/media-deserializer';
import {MainMediaSessionManager} from './media/main-media-session-manager';
import type {Destroyable} from './common/capabilities';
import {OmakaseResourceApiImpl} from './resource/omakase-resource';
import {ResourceDeserializer} from './resource/resource-deserializer';
import {BlobManager} from './util/blob/blob-manager';

export class OmpProvider implements Destroyable {
  readonly alertsManager: AlertsManager;
  readonly sessionStore: SessionStore;
  readonly trackRepository: TrackRepository;
  readonly mainMediaRepository: MainMediaRepository;
  readonly resourceRepository: ResourceRepository;
  readonly mainMediaSessionManager: MainMediaSessionManager;
  readonly trackUtils: TrackUtils;
  readonly omakaseTrack: OmakaseTrackApiImpl;
  readonly omakaseResource: OmakaseResourceApiImpl;
  readonly ui: Ui;
  readonly audioEffectsRegistry: AudioEffectsRegistry;
  readonly mediaDeserializer: MediaDeserializer;
  readonly resourceDeserializer: ResourceDeserializer;
  readonly blobManager: BlobManager;

  constructor() {
    this.alertsManager = new AlertsManager();
    this.blobManager = new BlobManager();
    this.trackRepository = new TrackRepository(this.blobManager);
    this.mainMediaRepository = new MainMediaRepository(this.trackRepository);
    this.resourceRepository = new ResourceRepository();
    this.mainMediaSessionManager = new MainMediaSessionManager(this.trackRepository);
    this.sessionStore = new SessionStore(this.alertsManager);
    this.trackUtils = new TrackUtils(this.trackRepository, this.blobManager);
    this.omakaseTrack = new OmakaseTrackApiImpl(this.trackRepository, this.trackUtils);
    this.omakaseResource = new OmakaseResourceApiImpl(this.resourceRepository);
    this.ui = new Ui();
    this.audioEffectsRegistry = new AudioEffectsRegistry();
    this.mediaDeserializer = new MediaDeserializer();
    this.resourceDeserializer = new ResourceDeserializer();
  }

  destroy() {
    this.sessionStore.destroy();
    this.omakaseTrack.destroy();
    this.omakaseResource.destroy();
    this.mainMediaSessionManager.destroy();
    this.mainMediaRepository.destroy();
    this.resourceRepository.destroy();
    this.trackRepository.destroy();
    this.trackUtils.destroy();
    this.alertsManager.destroy();
    this.audioEffectsRegistry.destroy();
    this.mediaDeserializer.destroy();
    this.ui.destroy();
    this.blobManager.destroy();
  }
}
