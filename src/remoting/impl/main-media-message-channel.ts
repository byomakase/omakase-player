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

import type {MainMedia, MainMediaState, MainMediaUpdateableAttrs, TrackState} from '../../media';
import {type Observable, takeUntil} from 'rxjs';
import {TrackRepository} from '../../repository';
import {BaseMessageChannelBinding, ManagedBroadcastChannel, MessageChannel} from '../message-channel';
import {MediaDeserializer} from '../../media/media-deserializer';
import type {OmpProvider} from '../../omp-provider';

export class MainMediMessageChannelUtil {
  static formatMessageChannelTopic(mainMediaId: MainMedia['id']) {
    return `MainMedia[${mainMediaId}]`;
  }
}

export interface MainMediaMessageChannel {
  // onEvent$: Observable<MainMediaEvent>;

  loadStart(): Observable<boolean>;

  loadSuccess(): Observable<boolean>;

  loadError(error: string | undefined): Observable<boolean>;

  addTrack(trackState: TrackState): Observable<boolean>;

  addTracks(trackStates: TrackState[]): Observable<boolean>;

  updateAttributes(attrs: MainMediaUpdateableAttrs): Observable<boolean>;

  state(): Observable<MainMediaState>;
}

export class MainMediaMessageChannelBinding extends BaseMessageChannelBinding {
  private _mainMedia: MainMedia;
  private _trackRepository: TrackRepository;
  private _messageChannel: MessageChannel<MainMediaMessageChannel>;

  constructor(managedBroadcastChannel: ManagedBroadcastChannel, mainMedia: MainMedia, ompProvider: OmpProvider) {
    super(ompProvider);
    this._mainMedia = mainMedia;
    this._trackRepository = ompProvider.trackRepository;
    this._messageChannel = new MessageChannel<MainMediaMessageChannel>(managedBroadcastChannel, MainMediMessageChannelUtil.formatMessageChannelTopic(this._mainMedia.id));
  }

  bind() {
    this._messageChannel
      .receiveAndSendResponse('loadStart')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          this._mainMedia.loadStart();
          sendResponseHook(true);
        },
      });
    this._messageChannel
      .receiveAndSendResponse('loadSuccess')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          this._mainMedia.loadSuccess();
          sendResponseHook(true);
        },
      });
    this._messageChannel
      .receiveAndSendResponse('loadError')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[error], sendResponseHook]) => {
          this._mainMedia.loadError(error);
          sendResponseHook(true);
        },
      });
    this._messageChannel
      .receiveAndSendResponse('addTrack')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackState], sendResponseHook]) => {
          let track = this._trackRepository.get(trackState.id);
          if (!track) {
            track = MediaDeserializer.createTrack(trackState);
            this._trackRepository.add(track);
          }

          this._mainMedia.addTrack(track);

          sendResponseHook(true);
        },
      });
    this._messageChannel
      .receiveAndSendResponse('addTracks')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackStates], sendResponseHook]) => {
          let tracks = trackStates.map((trackState) => {
            let track = this._trackRepository.get(trackState.id);
            if (!track) {
              track = MediaDeserializer.createTrack(trackState);
              this._trackRepository.add(track);
            }
            return track;
          });

          this._mainMedia.addTracks(tracks);

          sendResponseHook(true);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('updateAttributes')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[attrs], sendResponseHook]) => {
          this._mainMedia.updateAttrs(attrs);
          sendResponseHook(true);
        },
      });

    this._messageChannel
      .receiveAndSendResponse('state')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([request, sendResponseHook]) => {
          sendResponseHook(this._mainMedia.state);
        },
      });
  }
}
