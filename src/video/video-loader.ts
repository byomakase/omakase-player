/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {Video, VideoLoadOptions} from './model';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {VideoControllerApi} from './video-controller-api';
import {AudioLoadedEvent, AudioSwitchedEvent, Destroyable, OmpAudioTrack, OmpNamedEvent, OmpNamedEventEventName, SubtitlesLoadedEvent} from '../types';
import {completeUnsubscribeSubjects, nextCompleteSubject} from '../util/rxjs-util';

export interface VideoLoader extends Destroyable {
  onNamedEvent$: Observable<OmpNamedEvent>;

  onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined>;
  onAudioSwitched$: Observable<AudioSwitchedEvent>;
  onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined>;

  loadVideo(sourceUrl: string, options?: VideoLoadOptions): Observable<Video>;

  setActiveAudioTrack(ompAudioTrackId: string): Observable<void>;

  exportAudioTrack(ompAudioTrackId: string): Observable<Partial<OmpAudioTrack>>;

  updateActiveNamedEventStreams(eventNames: OmpNamedEventEventName[]): void;
}

export abstract class BaseVideoLoader implements VideoLoader {
  public readonly onNamedEvent$: Subject<OmpNamedEvent> = new Subject<OmpNamedEvent>();

  public readonly onAudioLoaded$: BehaviorSubject<AudioLoadedEvent | undefined> = new BehaviorSubject<AudioLoadedEvent | undefined>(void 0);
  public readonly onAudioSwitched$: Subject<AudioSwitchedEvent> = new Subject<AudioSwitchedEvent>();
  public readonly onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined> = new BehaviorSubject<SubtitlesLoadedEvent | undefined>(void 0);

  protected _videoController: VideoControllerApi;

  protected _loadVideoBreaker$ = new Subject<void>();

  protected readonly _destroyed$ = new Subject<void>();

  protected constructor(videoController: VideoControllerApi) {
    this._videoController = videoController;
  }

  abstract loadVideo(sourceUrl: string, options?: VideoLoadOptions): Observable<Video>;

  abstract updateActiveNamedEventStreams(eventNames: OmpNamedEventEventName[]): void;

  setActiveAudioTrack(ompAudioTrackId: string): Observable<void> {
    throw new Error('Not supported');
  }

  exportAudioTrack(ompAudioTrackId: string): Observable<Partial<OmpAudioTrack>> {
    throw new Error('Not supported');
  }

  destroy(): void {
    completeUnsubscribeSubjects(this.onNamedEvent$, this.onAudioLoaded$, this.onAudioSwitched$, this.onSubtitlesLoaded$);
    nextCompleteSubject(this._loadVideoBreaker$);
    nextCompleteSubject(this._destroyed$);
  }
}
