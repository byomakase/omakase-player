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

import type {MessageChannelName} from './message-channel-types';
import {MainMediaProxy} from './impl/main-media-proxy';
import {TrackProxy} from './impl/track-proxy';
import {MainMediaRepositoryProxy} from './impl/main-media-repository-proxy';
import {TrackRepositoryProxy} from './impl/track-repository-proxy';
import {SessionStoreProxy} from './impl/session-store-proxy';
import {PlayerDetachedProxy} from './impl/player-detached-proxy';
import {PlayerAudioInternalProxy} from './impl/player-audio-internal-proxy';
import {PlayerTextInternalProxy} from './impl/player-text-internal-proxy';
import {ChromingDetachedProxy} from './impl/chroming-detached-proxy';
import {OmakaseTrackApiProxy} from './impl/omakase-track-api-proxy';
import {AudioHandlerProxy} from './impl/audio-handler-proxy';
import {TextTrackHandlerProxy} from './impl/text-track-handler-proxy';
import {AudioEffectsProxy} from './impl/audio-effects-proxy';
import {AudioRouterProxy} from './impl/audio-router-proxy';
import {MarkerTrackProxy} from './impl/marker-track-proxy';
import {ChromingMarkerBarHandlerProxy} from './impl/chroming-marker-bar-handler-proxy';
import {AlertsManagerProxy} from './impl/alerts-manager-proxy';
import {TrackUtilsProxy} from './impl/track-utils-proxy';
import {ThumbnailTrackProxy} from './impl/thumbnail-track-proxy';
import {UiProxy} from './impl/ui-proxy';

export const getMessageChannelProxyMap = () => ({
  Ui: UiProxy,

  MainMediaRepository: MainMediaRepositoryProxy,
  TrackRepository: TrackRepositoryProxy,
  SessionStore: SessionStoreProxy,
  OmakaseTrackApi: OmakaseTrackApiProxy,
  TrackUtils: TrackUtilsProxy,

  MainMedia: MainMediaProxy,
  Track: TrackProxy,
  MarkerTrack: MarkerTrackProxy,
  ThumbnailTrack: ThumbnailTrackProxy,

  PlayerDetached: PlayerDetachedProxy,
  PlayerAudioInternal: PlayerAudioInternalProxy,
  PlayerTextInternal: PlayerTextInternalProxy,

  ChromingDetached: ChromingDetachedProxy,
  ChromingMarkerBarHandler: ChromingMarkerBarHandlerProxy,

  TextTrackHandler: TextTrackHandlerProxy,
  AudioHandler: AudioHandlerProxy,
  AudioEffects: AudioEffectsProxy,
  AudioRouter: AudioRouterProxy,
  AlertsManager: AlertsManagerProxy,
});

export type MessageChannelProxyMapType = ReturnType<typeof getMessageChannelProxyMap>;
export type MessageChannelProxyInstanceMap = {
  [K in MessageChannelName]: InstanceType<MessageChannelProxyMapType[K]>;
};
export type MessageChannelProxyInstance<K extends MessageChannelName> = MessageChannelProxyInstanceMap[K];
