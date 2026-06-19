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

import {type Observable, takeUntil} from 'rxjs';
import type {MarkerTrack, ThumbnailTrack} from '../../media';
import {type Track, type TrackEvent, type TrackState, TrackType} from '../../media';
import {BaseMessageChannelBinding, MessageChannel, type MessageChannelBinding} from '../message-channel';
import {MediaDeserializer} from '../../media/media-deserializer';
import {TrackRepository, type TrackRepositoryEvent, TrackRepositoryEventType} from '../../repository';
import {TrackMessageChannelBinding} from './track-message-channel';
import {MarkerTrackMessageChannelBinding} from './marker-track-message-channel';
import {ThumbnailTrackMessageChannelBinding} from './thumbnail-track-message-channel';
import type {OmpProvider} from '../../omp-provider';

export interface TrackRepositoryMessageChannel {
  onEvent$: Observable<TrackRepositoryEvent>;

  onTrackEvent$: Observable<TrackEvent>;

  get(id: TrackState['id']): Observable<TrackState | undefined>;

  getOrFail(id: TrackState['id']): Observable<TrackState>;

  find(): Observable<TrackState[]>;

  add(state: TrackState): Observable<TrackState>;

  addAll(states: TrackState[]): Observable<TrackState[]>;

  delete(id: TrackState['id']): Observable<boolean>;
}

export class TrackRepositoryMessageChannelBinding extends BaseMessageChannelBinding {
  private _trackRepository: TrackRepository;
  private _messageChannel: MessageChannel<TrackRepositoryMessageChannel>;

  private _innerBindings: Map<string, MessageChannelBinding> = new Map();

  constructor(messageChannel: MessageChannel<TrackRepositoryMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._trackRepository = ompProvider.trackRepository;
    this._messageChannel = messageChannel;
  }

  bind() {
    let createTrackBinding = (track: Track) => {
      let binding: MessageChannelBinding;

      switch (track.trackType) {
        case TrackType.MARKER_TRACK:
          binding = new MarkerTrackMessageChannelBinding(this._messageChannel.managedBroadcastChannel, track as MarkerTrack, this._ompProvider);
          break;
        case TrackType.THUMBNAIL_TRACK:
          binding = new ThumbnailTrackMessageChannelBinding(this._messageChannel.managedBroadcastChannel, track as ThumbnailTrack, this._ompProvider);
          break;
        default:
          binding = new TrackMessageChannelBinding(this._messageChannel.managedBroadcastChannel, track, this._ompProvider);
      }

      binding.bind();
      this._innerBindings.set(track.id, binding);
    };

    this._trackRepository.find().forEach((track) => createTrackBinding(track));

    this._trackRepository.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onEvent$', event);

      if (event.type === TrackRepositoryEventType.TRACK_ADDED) {
        createTrackBinding(this._trackRepository.getOrFail(event.data.trackState.id));
      } else if (event.type === TrackRepositoryEventType.TRACK_DELETED) {
        this._innerBindings.get(event.data.trackState.id)?.destroy();
        this._innerBindings.delete(event.data.trackState.id);
      }
    });

    this._trackRepository.onTrackEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
      this._messageChannel.send('onTrackEvent$', event);
    });

    this._messageChannel
      .receiveAndSendResponse('get')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._trackRepository.get(id)?.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('getOrFail')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._trackRepository.getOrFail(id).state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('find')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._trackRepository.find().map((p) => p.state));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('add')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[state], sendResponseHook]) => {
          let track = this._trackRepository.add(MediaDeserializer.createTrack(state));
          sendResponseHook(track.state);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('addAll')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[states], sendResponseHook]) => {
          let tracks = states.map((state) => MediaDeserializer.createTrack(state));
          this._trackRepository.addAll(tracks);
          sendResponseHook(tracks.map((p) => p.state));
        },
      });

    this._messageChannel
      .receiveAndSendResponse('delete')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._trackRepository.delete(id));
        },
      });
  }

  destroy() {
    super.destroy();

    [...this._innerBindings.values()].forEach((binding) => binding.destroy());
    this._innerBindings.clear();
  }
}
