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

import {ManagedBroadcastChannel, MessageChannel} from './message-channel';
import type {MainMediaRepositoryMessageChannel} from './impl/main-media-repository-message-channel';
import type {TrackRepositoryMessageChannel} from './impl/track-repository-message-channel';
import type {MainMediaMessageChannel} from './impl/main-media-message-channel';
import type {TrackMessageChannel} from './impl/track-message-channel';
import type {SessionStoreMessageChannel} from './impl/session-store-message-channel';
import type {PlayerDetachedMessageChannel} from './impl/player-detached-message-channel';
import type {PlayerAudioInternalMessageChannel} from './impl/player-audio-internal-message-channel';
import type {PlayerTextInternalMessageChannel} from './impl/player-text-internal-message-channel';
import type {ChromingDetachedMessageChannel} from './impl/chroming-detached-message-channel';
import type {OmakaseTrackApiMessageChannel} from './impl/omakase-track-api-message-channel';
import type {TextTrackHandlerMessageChannel} from './impl/text-track-handler-message-channel';
import type {AudioHandlerMessageChannel} from './impl/audio-handler-message-channel';
import type {AudioEffectsMessageChannel} from './impl/audio-effects-message-channel';
import type {AudioRouterMessageChannel} from './impl/audio-router-message-channel';
import type {MarkerTrackMessageChannel} from './impl/marker-track-message-channel';
import type {ChromingMarkerBarHandlerMessageChannel} from './impl/chroming-marker-bar-handler-message-channel';
import type {AlertsManagerMessageChannel} from './impl/alerts-manager-message-channel';
import type {TrackUtilsMessageChannel} from './impl/track-utils-message-channel';
import type {ThumbnailTrackMessageChannel} from './impl/thumbnail-track-message-channel';
import type {UiMessageChannel} from './impl/ui-message-channel';

/**
 * Name - Type mappings for supported message channels
 */
export type MessageChannelTypeMap = {
  Ui: UiMessageChannel;

  MainMediaRepository: MainMediaRepositoryMessageChannel;
  TrackRepository: TrackRepositoryMessageChannel;
  SessionStore: SessionStoreMessageChannel;
  OmakaseTrackApi: OmakaseTrackApiMessageChannel;
  TrackUtils: TrackUtilsMessageChannel;

  MainMedia: MainMediaMessageChannel;
  Track: TrackMessageChannel;
  MarkerTrack: MarkerTrackMessageChannel;
  ThumbnailTrack: ThumbnailTrackMessageChannel;

  PlayerDetached: PlayerDetachedMessageChannel;
  PlayerAudioInternal: PlayerAudioInternalMessageChannel;
  PlayerTextInternal: PlayerTextInternalMessageChannel;

  ChromingDetached: ChromingDetachedMessageChannel;
  ChromingMarkerBarHandler: ChromingMarkerBarHandlerMessageChannel;

  TextTrackHandler: TextTrackHandlerMessageChannel;
  AudioHandler: AudioHandlerMessageChannel;
  AudioEffects: AudioEffectsMessageChannel;
  AudioRouter: AudioRouterMessageChannel;
  AlertsManager: AlertsManagerMessageChannel;
};
export type MessageChannelName = keyof MessageChannelTypeMap;
export type MessageChannelType = MessageChannelTypeMap[MessageChannelName];
export type MessageChannelMapping<K extends MessageChannelName = MessageChannelName> = {
  messageChannelName: K;
  messageChannel: MessageChannel<MessageChannelTypeMap[K]>;
};

export class MessageChannelFactory {
  /**
   * Types are erased in runtime and not needed for {@link MessageChannel} instantiation
   * @param managedBroadcastChannel
   * @param topic
   */
  static create<T extends MessageChannelName>(managedBroadcastChannel: ManagedBroadcastChannel, topic?: string): MessageChannel<MessageChannelTypeMap[T]> {
    return new MessageChannel<MessageChannelTypeMap[T]>(managedBroadcastChannel, topic);
  }
}
