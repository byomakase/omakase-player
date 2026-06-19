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

import {BaseMessageChannelBinding, MessageChannel} from '../message-channel';
import {OmakaseTrackApiImpl} from '../../track/omakase-track';
import {map, Observable, takeUntil} from 'rxjs';
import type {Track, TrackState} from '../../media';
import {MediaDeserializer} from '../../media/media-deserializer';
import {TrackRepository} from '../../repository';
import {type Source, type SourceState, UrlSource} from '../../source';
import {isString} from '../../util/util-functions';
import type {TrackLoadOptions} from "../../track";
import type {OmpProvider} from '../../omp-provider';

export interface OmakaseTrackApiMessageChannel {
  get(id: TrackState['id']): Observable<TrackState | undefined>;

  delete(id: Track['id']): Observable<boolean>;

  add(track: TrackState): Observable<TrackState>;

  find(): Observable<TrackState[]>;

  load(sourceOrUrl: SourceState | string, loadOptions?: TrackLoadOptions | undefined): Observable<TrackState>;
}

export class OmakaseTrackApiMessageChannelBinding extends BaseMessageChannelBinding {
  protected _trackApi: OmakaseTrackApiImpl;
  protected _trackRepository: TrackRepository;

  private _messageChannel: MessageChannel<OmakaseTrackApiMessageChannel>;

  constructor(messageChannel: MessageChannel<OmakaseTrackApiMessageChannel>, ompProvider: OmpProvider) {
    super(ompProvider);
    this._trackApi = ompProvider.omakaseTrack;
    this._trackRepository = ompProvider.trackRepository;
    this._messageChannel = messageChannel;
  }

  bind() {
    this._messageChannel
      .receiveAndSendResponse('get')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[id], sendResponseHook]) => {
          sendResponseHook(this._trackRepository.get(id)?.state);
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

    this._messageChannel
      .receiveAndSendResponse('add')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[trackState], sendResponseHook]) => {
          let track = MediaDeserializer.createTrack(trackState);
          let newTrack = this._trackApi.add(track);
          sendResponseHook(newTrack.state);
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
      .receiveAndSendResponse('load')
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe({
        next: ([[sourceOrUrl, loadOptions], sendResponseHook]) => {
          let source: Source;
          if (isString(sourceOrUrl)) {
            source = new UrlSource(sourceOrUrl);
          } else {
            source = MediaDeserializer.createSource(sourceOrUrl);
          }

          sendResponseHook(this._trackApi.load(source, loadOptions).pipe(map((p) => p.state)));
        },
      });
  }

  destroy() {
    super.destroy();
  }
}
