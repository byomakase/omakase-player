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

import {type ChromingMarkerBarHandlerMessageChannel, ChromingMarkerBarHandlerMessageChannelUtil} from './impl/chroming-marker-bar-handler-message-channel';
import {ManagedBroadcastChannel, MessageChannel, type MessageChannelBinding} from './message-channel';
import {combineLatest, filter, Observable, Subject, take, takeUntil, timeout} from 'rxjs';
import type {Destroyable, Serializable} from '../common/capabilities';
import {ObserverBreaker} from '../common/observer-breaker';
import {MessageChannelFactory, type MessageChannelMapping, type MessageChannelName, type MessageChannelType, type MessageChannelTypeMap} from './message-channel-types';
import {errorCompleteObserver, freeObserver, nextCompleteObserver} from '../util/rxjs-util';
import {REMOTING} from '../constants';
import type {MessageChannelProxyInstance, MessageChannelProxyInstanceMap} from './proxy-instance-types';
import {MainMediaRepositoryProxy} from './impl/main-media-repository-proxy';
import {TrackRepositoryProxy} from './impl/track-repository-proxy';
import {MainMediaProxy} from './impl/main-media-proxy';
import {TrackProxy} from './impl/track-proxy';
import {SessionStoreProxy} from './impl/session-store-proxy';
import {OmakaseTrackApiProxy} from './impl/omakase-track-api-proxy';
import {PlayerDetachedProxy} from './impl/player-detached-proxy';
import {ChromingDetachedProxy} from './impl/chroming-detached-proxy';
import {AudioHandlerProxy} from './impl/audio-handler-proxy';
import {type AudioHandlerMessageChannel, AudioHandlerMessageChannelUtil} from './impl/audio-handler-message-channel';
import {TextTrackHandlerProxy} from './impl/text-track-handler-proxy';
import {AudioRouterProxy} from './impl/audio-router-proxy';
import {type TextTrackHandlerMessageChannel, TextTrackHandlerMessageChannelUtil} from './impl/text-track-handler-message-channel';
import {AudioEffectsProxy} from './impl/audio-effects-proxy';
import type {AudioEffectsMessageChannel} from './impl/audio-effects-message-channel';
import type {AudioRouterMessageChannel} from './impl/audio-router-message-channel';
import {PlayerAudioInternalProxy} from './impl/player-audio-internal-proxy';
import {PlayerTextInternalProxy} from './impl/player-text-internal-proxy';
import type {Audio, MainMedia, MarkerTrack, ThumbnailTrack, Track} from '../media';
import {type TrackMessageChannel, TrackMessageChannelUtil} from './impl/track-message-channel';
import {type MainMediaMessageChannel, MainMediMessageChannelUtil} from './impl/main-media-message-channel';
import {MarkerTrackProxy} from './impl/marker-track-proxy';
import type {MarkerTrackMessageChannel} from './impl/marker-track-message-channel';
import {ChromingMarkerBarHandlerProxy} from './impl/chroming-marker-bar-handler-proxy';
import {PlayerAudioType} from '../player';
import type {AudioHandlerState} from '../audio';
import type {TextTrackHandlerState} from '../text';
import type {AudioRouterState} from '../audio';
import type {ChromingMarkerBarState} from '../chroming';
import {AlertsManagerProxy} from './impl/alerts-manager-proxy';
import {TrackUtilsProxy} from './impl/track-utils-proxy';
import type {MessageChannelProxy} from './message-channel-proxy';
import {ThumbnailTrackProxy} from './impl/thumbnail-track-proxy';
import type {ThumbnailTrackMessageChannel} from './impl/thumbnail-track-message-channel';
import type {OmpProvider} from '../omp-provider';
import {UiProxy} from './impl/ui-proxy';

interface MessageChannelDto {
  messageChannelName: MessageChannelName;
  topic: string;
}

export interface HandshakeMessageChannel {
  requestConnect(remoteMessageChannels: MessageChannelDto[]): Observable<{
    messageChannels: MessageChannelDto[];
  }>;

  connected(): Observable<void>;

  heartbeat(heartbeat: number): Observable<number>;
}

export enum RemoteNodeEventType {
  REMOTE_NODE_CONNECTING = 'REMOTE_NODE_CONNECTING',
  REMOTE_NODE_CONNECTED = 'REMOTE_NODE_CONNECTED',
  REMOTE_NODE_CONNECT_FAILURE = 'REMOTE_NODE_CONNECT_FAILURE',

  REMOTE_NODE_DISCONNECTED = 'REMOTE_NODE_DISCONNECTED',
}

export interface RemoteNodeEventData extends Serializable {}

export interface RemoteNodeErrorEventData extends RemoteNodeEventData {
  error: string | undefined;
}

export type RemoteNodeEventTypeDataMap = {
  [RemoteNodeEventType.REMOTE_NODE_CONNECTING]: RemoteNodeEventData;
  [RemoteNodeEventType.REMOTE_NODE_CONNECTED]: RemoteNodeEventData;
  [RemoteNodeEventType.REMOTE_NODE_CONNECT_FAILURE]: RemoteNodeErrorEventData;

  [RemoteNodeEventType.REMOTE_NODE_DISCONNECTED]: RemoteNodeEventData;
};

export type RemoteNodeEvent = {
  [K in RemoteNodeEventType]: {
    type: K;
    data: RemoteNodeEventTypeDataMap[K];
  };
}[keyof RemoteNodeEventTypeDataMap];

export type MessageChannelProxyFactoryArgs = {
  AudioHandler: [mainMediaId: MainMedia['id'], playerAudioType: PlayerAudioType, trackId: Audio['id'] | undefined, state: AudioHandlerState];
  TextTrackHandler: [mainMediaId: MainMedia['id'], trackId: Track['id'], state: TextTrackHandlerState];
  AudioEffects: [topic: string];
  AudioRouter: [topic: string, state: AudioRouterState];
  MainMedia: [mainMediaId: MainMedia['id']];
  Track: [trackId: Track['id']];
  MarkerTrack: [trackId: MarkerTrack['id']];
  ThumbnailTrack: [trackId: ThumbnailTrack['id']];
  ChromingMarkerBarHandler: [state: ChromingMarkerBarState];
};

export type MessageChannelFactoryMap = {
  [K in keyof MessageChannelProxyFactoryArgs]: (...args: MessageChannelProxyFactoryArgs[K]) => MessageChannelProxyInstance<K & MessageChannelName>;
};

export interface RemoteNode {
  getChannelOrFail<T extends MessageChannelName>(messageChannelName: T, topic?: string): MessageChannel<MessageChannelTypeMap[T]>;

  getRemoteChannelOrFail<T extends MessageChannelName>(messageChannelName: T, topic?: string): MessageChannel<MessageChannelTypeMap[T]>;

  initRemoteProxies(): Observable<void>;

  getProxyByName<T extends MessageChannelName>(messageChannelName: T): MessageChannelProxyInstanceMap[T];

  getOrCreateProxy<K extends keyof MessageChannelFactoryMap>(name: K, ...args: Parameters<MessageChannelFactoryMap[K]>): ReturnType<MessageChannelFactoryMap[K]>;

  deleteProxy(proxy: MessageChannelProxy<any>): void;

  deleteProxies(proxy: MessageChannelProxy<any>[]): void;
}

export abstract class BaseRemoteNode implements RemoteNode, Destroyable {
  protected readonly _onEvent$: Subject<RemoteNodeEvent> = new Subject<RemoteNodeEvent>();

  protected _managedBroadcastChannel: ManagedBroadcastChannel;

  protected _handshakeChannel: MessageChannel<HandshakeMessageChannel>;
  protected _handshakeChannelBreaker = new ObserverBreaker();

  protected _messageChannelsByName: Map<MessageChannelName, Map<string, MessageChannel<MessageChannelType>>> = new Map<MessageChannelName, Map<string, MessageChannel<MessageChannelType>>>();
  protected _remoteMessageChannelsByName: Map<MessageChannelName, Map<string, MessageChannel<MessageChannelType>>> = new Map<MessageChannelName, Map<string, MessageChannel<MessageChannelType>>>();

  protected _messageChannelBindings: MessageChannelBinding[] = [];
  protected _proxyByName: Partial<MessageChannelProxyInstanceMap> = {};
  protected _proxyByTopic: Map<string, MessageChannelProxyInstance<any>> = new Map();

  private readonly _proxyFactories: MessageChannelFactoryMap = {
    AudioHandler: (mainMediaId: MainMedia['id'], playerAudioType, trackId, state) => {
      let topic = AudioHandlerMessageChannelUtil.formatMessageChannelTopic(mainMediaId, playerAudioType, trackId);
      if (!this._proxyByTopic.has(topic)) {
        this._proxyByTopic.set(topic, new AudioHandlerProxy(new MessageChannel<AudioHandlerMessageChannel>(this._managedBroadcastChannel, topic), this, state));
      }
      return this._proxyByTopic.get(topic);
    },

    TextTrackHandler: (mainMediaId: MainMedia['id'], trackId, state) => {
      let topic = TextTrackHandlerMessageChannelUtil.formatMessageChannelTopic(mainMediaId, trackId);
      if (!this._proxyByTopic.has(topic)) {
        this._proxyByTopic.set(topic, new TextTrackHandlerProxy(new MessageChannel<TextTrackHandlerMessageChannel>(this._managedBroadcastChannel, topic), state));
      }
      return this._proxyByTopic.get(topic);
    },

    AudioEffects: (topic) => {
      if (!this._proxyByTopic.has(topic)) {
        this._proxyByTopic.set(topic, new AudioEffectsProxy(new MessageChannel<AudioEffectsMessageChannel>(this._managedBroadcastChannel, topic)));
      }
      return this._proxyByTopic.get(topic);
    },

    AudioRouter: (topic, state) => {
      if (!this._proxyByTopic.has(topic)) {
        this._proxyByTopic.set(topic, new AudioRouterProxy(new MessageChannel<AudioRouterMessageChannel>(this._managedBroadcastChannel, topic)));
      }
      return this._proxyByTopic.get(topic);
    },

    MainMedia: (mainMediaId) => {
      let topic: string = MainMediMessageChannelUtil.formatMessageChannelTopic(mainMediaId);
      if (!this._proxyByTopic.has(topic)) {
        this._proxyByTopic.set(topic, new MainMediaProxy(new MessageChannel<MainMediaMessageChannel>(this._managedBroadcastChannel, topic)));
      }
      return this._proxyByTopic.get(topic);
    },

    Track: (trackId) => {
      let topic: string = TrackMessageChannelUtil.formatMessageChannelTopic(trackId);
      if (!this._proxyByTopic.has(topic)) {
        this._proxyByTopic.set(topic, new TrackProxy(new MessageChannel<TrackMessageChannel>(this._managedBroadcastChannel, topic)));
      }
      return this._proxyByTopic.get(topic);
    },

    MarkerTrack: (trackId) => {
      let topic: string = TrackMessageChannelUtil.formatMessageChannelTopic(trackId);
      if (!this._proxyByTopic.has(topic)) {
        this._proxyByTopic.set(topic, new MarkerTrackProxy(new MessageChannel<MarkerTrackMessageChannel>(this._managedBroadcastChannel, topic)));
      }
      return this._proxyByTopic.get(topic);
    },

    ThumbnailTrack: (trackId) => {
      let topic: string = TrackMessageChannelUtil.formatMessageChannelTopic(trackId);
      if (!this._proxyByTopic.has(topic)) {
        this._proxyByTopic.set(topic, new ThumbnailTrackProxy(new MessageChannel<ThumbnailTrackMessageChannel>(this._managedBroadcastChannel, topic)));
      }
      return this._proxyByTopic.get(topic);
    },

    ChromingMarkerBarHandler: (state) => {
      let topic = ChromingMarkerBarHandlerMessageChannelUtil.formatMessageChannelTopic(state.id);
      if (!this._proxyByTopic.has(topic)) {
        this._proxyByTopic.set(topic, new ChromingMarkerBarHandlerProxy(new MessageChannel<ChromingMarkerBarHandlerMessageChannel>(this._managedBroadcastChannel, topic), this, state));
      }
      return this._proxyByTopic.get(topic);
    },
  };

  protected _ompProvider: OmpProvider;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(broadcastChannelId: string, ompProvider: OmpProvider) {
    this._managedBroadcastChannel = new ManagedBroadcastChannel(broadcastChannelId);
    this._handshakeChannel = new MessageChannel<HandshakeMessageChannel>(this._managedBroadcastChannel, `${broadcastChannelId}_${REMOTING.handshakeTopicPart}`);
    this._ompProvider = ompProvider;
  }

  get onEvent$(): Observable<RemoteNodeEvent> {
    return this._onEvent$.asObservable();
  }

  protected setRemoteChannels(messageChannelMappings: MessageChannelMapping[]) {
    messageChannelMappings.forEach((messageChannelMapping) => {
      let byTopic = this._messageChannelsByName.get(messageChannelMapping.messageChannelName);
      if (!byTopic) {
        byTopic = new Map<string, MessageChannel<any>>();
        this._messageChannelsByName.set(messageChannelMapping.messageChannelName, byTopic);
      }
      byTopic.set(messageChannelMapping.messageChannel.topic, messageChannelMapping.messageChannel);
    });
    console.debug(`Remote node message channels`, this._messageChannelsByName);
  }

  getChannelOrFail<T extends MessageChannelName>(messageChannelName: T, topic?: string): MessageChannel<MessageChannelTypeMap[T]> {
    return this.findMessageChannelOrFail<T>(this._messageChannelsByName, messageChannelName, topic);
  }

  getRemoteChannelOrFail<T extends MessageChannelName>(messageChannelName: T, topic?: string): MessageChannel<MessageChannelTypeMap[T]> {
    return this.findMessageChannelOrFail<T>(this._remoteMessageChannelsByName, messageChannelName, topic);
  }

  protected findMessageChannelOrFail<T extends MessageChannelName>(
    source: Map<MessageChannelName, Map<string, MessageChannel<any>>>,
    messageChannelName: T,
    topic?: string
  ): MessageChannel<MessageChannelTypeMap[T]> {
    let byTopic = source.get(messageChannelName);
    if (byTopic && byTopic.size > 0) {
      if (topic) {
        let messageChannel = byTopic.get(topic);
        if (!messageChannel) {
          throw new Error(`Message channel with topic "${topic}" not found`);
        } else {
          return messageChannel;
        }
      } else {
        if (byTopic && byTopic.size > 1) {
          throw new Error(`Multiple message channels exist for message channel type "${messageChannelName}". Provide message channel topic.`);
        } else {
          let [topic, messageChannel] = Array.from(byTopic.entries())[0]!;
          return messageChannel;
        }
      }
    } else {
      throw new Error(`Message channel with type "${messageChannelName}" not found`);
    }
  }

  protected getMessageChannelDtos(): MessageChannelDto[] {
    let messageChannels: MessageChannelDto[] = [];
    Array.from(this._messageChannelsByName.entries()).forEach(([messageChannelName, byTopic]) => {
      Array.from(byTopic.entries()).forEach(([topic, messageChannel]) => {
        messageChannels.push({
          messageChannelName: messageChannelName,
          topic: messageChannel.topic,
        });
      });
    });
    return messageChannels;
  }

  protected createRemoteMessageChannels(messageChannelDtos: MessageChannelDto[]) {
    messageChannelDtos.forEach((messageChannelDto) => {
      let messageChannel = MessageChannelFactory.create(this._managedBroadcastChannel, messageChannelDto.topic);
      let byTopic = this._remoteMessageChannelsByName.get(messageChannelDto.messageChannelName);
      if (!byTopic) {
        byTopic = new Map<string, MessageChannel<any>>();
        this._remoteMessageChannelsByName.set(messageChannelDto.messageChannelName, byTopic);
      }
      byTopic.set(messageChannelDto.topic, messageChannel);
    });
  }

  initRemoteProxies(): Observable<void> {
    return new Observable((observer) => {
      if (this._remoteMessageChannelsByName.has('MainMediaRepository')) {
        this._proxyByName['MainMediaRepository'] = new MainMediaRepositoryProxy(this);
      }

      if (this._remoteMessageChannelsByName.has('TrackRepository')) {
        this._proxyByName['TrackRepository'] = new TrackRepositoryProxy(this);
      }

      if (this._remoteMessageChannelsByName.has('SessionStore')) {
        this._proxyByName['SessionStore'] = new SessionStoreProxy(this);
      }

      if (this._remoteMessageChannelsByName.has('OmakaseTrackApi')) {
        this._proxyByName['OmakaseTrackApi'] = new OmakaseTrackApiProxy(this);
      }

      if (this._remoteMessageChannelsByName.has('TrackUtils')) {
        this._proxyByName['TrackUtils'] = new TrackUtilsProxy(this);
      }

      if (this._remoteMessageChannelsByName.has('PlayerAudioInternal')) {
        this._proxyByName['PlayerAudioInternal'] = new PlayerAudioInternalProxy(this, this._ompProvider);
      }

      if (this._remoteMessageChannelsByName.has('PlayerTextInternal')) {
        this._proxyByName['PlayerTextInternal'] = new PlayerTextInternalProxy(this, this._ompProvider);
      }

      if (this._remoteMessageChannelsByName.has('PlayerDetached')) {
        this._proxyByName['PlayerDetached'] = new PlayerDetachedProxy(this, this._ompProvider);
      }

      if (this._remoteMessageChannelsByName.has('ChromingDetached')) {
        this._proxyByName['ChromingDetached'] = new ChromingDetachedProxy(this, this._ompProvider);
      }

      if (this._remoteMessageChannelsByName.has('AlertsManager')) {
        this._proxyByName['AlertsManager'] = new AlertsManagerProxy(this);
      }

      if (this._remoteMessageChannelsByName.has('Ui')) {
        this._proxyByName['Ui'] = new UiProxy(this);
      }

      combineLatest(Object.values(this._proxyByName).map((p) => p.onInitialized$.pipe(filter((p) => p))))
        .pipe(take(1))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .pipe(timeout(20000))
        .subscribe({
          next: () => {
            console.debug(`Proxies initialized!`);
            nextCompleteObserver(observer);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
    });
  }

  getProxyByName<T extends MessageChannelName>(messageChannelName: T): MessageChannelProxyInstance<T> {
    const proxy = this._proxyByName[messageChannelName];

    if (!proxy) {
      throw new Error(`Proxy for message channel "${messageChannelName}" not found.`);
    }

    return proxy;
  }

  getOrCreateProxy<K extends keyof MessageChannelFactoryMap>(name: K, ...args: Parameters<MessageChannelFactoryMap[K]>): ReturnType<MessageChannelFactoryMap[K]> {
    return (this._proxyFactories[name] as (...args: any[]) => ReturnType<MessageChannelFactoryMap[K]>)(...args);
  }

  deleteProxy(proxy: MessageChannelProxy<any>) {
    let topic = proxy.messageChannel.topic;
    let deleted = this._proxyByTopic.delete(topic);
    if (deleted) {
      proxy.destroy();
    }
  }

  deleteProxies(proxies: MessageChannelProxy<any>[]) {
    proxies.forEach((proxy) => this.deleteProxy(proxy));
  }

  destroy() {
    this._destroyBreaker.break();

    this._handshakeChannelBreaker.destroy();
    this._handshakeChannel.destroy();

    freeObserver(this._onEvent$);

    Array.from(this._messageChannelsByName.entries()).forEach(([messageChannelName, byTopic]) => {
      Array.from(byTopic.entries()).forEach(([topic, messageChannel]) => {
        try {
          messageChannel.destroy();
        } catch (e) {
          // nop
        }
      });
    });

    Array.from(this._remoteMessageChannelsByName.entries()).forEach(([messageChannelName, byTopic]) => {
      Array.from(byTopic.entries()).forEach(([topic, messageChannel]) => {
        try {
          messageChannel.destroy();
        } catch (e) {
          // nop
        }
      });
    });

    this._managedBroadcastChannel.destroy();

    this._proxyByTopic.forEach((proxy) => proxy.destroy());
    Object.values(this._proxyByName).forEach((proxy) => proxy.destroy());
  }
}
