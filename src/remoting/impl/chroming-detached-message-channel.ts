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

import {ChromingMarkerBarHandlerMessageChannelBinding, ChromingMarkerBarHandlerMessageChannelUtil} from './chroming-marker-bar-handler-message-channel';
import {ChromingTrackDestination, type ChromingDetachedApi} from '../../chroming';
import {BaseMessageChannelBinding, MessageChannel, type MessageChannelBinding} from '../message-channel';
import {filter, takeUntil} from 'rxjs';
import type {ChromingMarkerBarHandlerApi} from '../../chroming/chroming-marker-bar';
import {ChromingEventType} from '../../chroming/chroming-event';
import type {OmpProvider} from '../../omp-provider';

export interface ChromingDetachedMessageChannel extends ChromingDetachedApi {}

export class ChromingDetachedMessageChannelBinding extends BaseMessageChannelBinding {
  private _chromingDetachedMessageChannel: MessageChannel<ChromingDetachedMessageChannel>;
  private _chromingDetached: ChromingDetachedApi;

  private _markerTrackMessageChannels: Map<string, MessageChannel<ChromingMarkerBarHandlerMessageChannelBinding>> = new Map<string, MessageChannel<ChromingMarkerBarHandlerMessageChannelBinding>>();
  private _innerBindings: Map<string, MessageChannelBinding> = new Map();

  constructor(messageChannel: MessageChannel<ChromingDetachedMessageChannel>, chromingDetached: ChromingDetachedApi, ompProvider: OmpProvider) {
    super(ompProvider);
    this._chromingDetachedMessageChannel = messageChannel;
    this._chromingDetached = chromingDetached;
  }

  bind() {
    this._chromingDetached.onEvent$
      .pipe(
        takeUntil(this._destroyBreaker.observer),
        filter((event) => event.type === ChromingEventType.CHROMING_CHANGE)
      )
      .subscribe({
        next: (event) => {
          this._chromingDetachedMessageChannel.send('onEvent$', event);
          this.update();
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([_, sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.state);
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('addSafeZone')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[safeZone], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.addSafeZone(safeZone));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('removeSafeZone')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.removeSafeZone(id));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('removeAllSafeZones')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.removeAllSafeZones());
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('addHelpMenuGroup')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[helpMenuGroup, insertPosition], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.addHelpMenuGroup(helpMenuGroup, insertPosition));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('clearHelpMenuGroups')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.clearHelpMenuGroups());
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('setFloatingTimeVisible')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[visible], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.setFloatingTimeVisible(visible));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('setFloatingVuMeterVisible')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[visible], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.setFloatingVuMeterVisible(visible));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('setWatermark')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[watermark], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.setWatermark(watermark));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('addMarkerBar')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackId, destination, config], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.addMarkerBar(trackId, destination, config));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('deleteMarkerBar')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackId], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.deleteMarkerBar(trackId));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('setThumbnailTrack')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackId], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.setThumbnailTrack(trackId));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('setTimeFormat')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[timeFormat], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.setTimeFormat(timeFormat));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('setThemeConfig')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[themeConfig], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.setThemeConfig(themeConfig));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('setVuMeterConfig')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[vuMeterConfig, position], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.setVuMeterConfig(vuMeterConfig, position));
        },
      });

    this._chromingDetachedMessageChannel
      .receiveAndSendResponse('restoreChromingSession')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[chromingSession], sendResponseHook]) => {
          sendResponseHook(this._chromingDetached.restoreChromingSession(chromingSession));
        },
      });

    this.update();
  }

  private update() {
    this.updateMarkerTrackMessageChannels();
  }

  private updateMarkerTrackMessageChannels() {
    let pairs: {
      topic: string;
      handler: ChromingMarkerBarHandlerApi | undefined;
    }[] = [
      ...this._chromingDetached.state.markerBars.map((state) => ({
        topic: ChromingMarkerBarHandlerMessageChannelUtil.formatMessageChannelTopic(state.id),
        handler: this._chromingDetached.getMarkerBar(state.id),
      })),
    ];

    if (this._chromingDetached.state.progressBarMarkerBar) {
      pairs.push({
        topic: ChromingMarkerBarHandlerMessageChannelUtil.formatMessageChannelTopic(this._chromingDetached.state.progressBarMarkerBar.id),
        handler: this._chromingDetached.getMarkerBar(this._chromingDetached.state.progressBarMarkerBar.id),
      });
    }

    pairs.forEach((pair) => {
      if (pair.handler) {
        let topic = pair.topic;

        if (!this._markerTrackMessageChannels.has(topic)) {
          let messageChannel = new MessageChannel<ChromingMarkerBarHandlerMessageChannelBinding>(this._chromingDetachedMessageChannel.managedBroadcastChannel, topic);
          this._markerTrackMessageChannels.set(topic, messageChannel);

          let binding = new ChromingMarkerBarHandlerMessageChannelBinding(messageChannel, pair.handler, this._ompProvider);
          binding.bind();

          this._innerBindings.set(topic, binding);
        }
      }
    });

    const activeTopics = new Set(pairs.filter((p) => p.handler).map((p) => p.topic));
    const staleTopics = [...this._markerTrackMessageChannels.keys()].filter((t) => !activeTopics.has(t));
    for (const topic of staleTopics) {
      this._innerBindings.get(topic)?.destroy();
      this._innerBindings.delete(topic);
      this._markerTrackMessageChannels.get(topic)?.destroy();
      this._markerTrackMessageChannels.delete(topic);
    }
  }

  destroy(): void {
    super.destroy();
    [...this._innerBindings.values()].forEach((innerBinding) => innerBinding.destroy());
    this._markerTrackMessageChannels.forEach((messageChannel) => messageChannel.destroy());
  }
}
