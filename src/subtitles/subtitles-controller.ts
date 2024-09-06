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

import {SubtitlesVttTrack} from '../track';
import {Destroyable, SubtitlesCreateEvent, SubtitlesEvent, SubtitlesLoadedEvent, SubtitlesVttTrackConfig} from '../types';
import {BehaviorSubject, filter, forkJoin, Observable, of, Subject, takeUntil} from 'rxjs';
import {SubtitlesApi} from '../api';
import {completeUnsubscribeSubjects, nextCompleteVoidSubject} from '../util/observable-util';
import {VideoControllerApi} from '../video/video-controller-api';
import {nullifier} from '../util/destroy-util';

export class SubtitlesController implements SubtitlesApi, Destroyable {
  public readonly onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined> = new BehaviorSubject<SubtitlesLoadedEvent | undefined>(void 0);
  public readonly onCreate$: Subject<SubtitlesCreateEvent> = new Subject<SubtitlesCreateEvent>();
  public readonly onRemove$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onShow$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onHide$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();

  protected _currentTrack?: SubtitlesVttTrack;
  protected _videoController: VideoControllerApi;
  protected _subtitlesTracks: Map<string, SubtitlesVttTrack> = new Map<string, SubtitlesVttTrack>();

  protected _destroyed$ = new Subject<void>();

  constructor(videoController: VideoControllerApi) {
    this._videoController = videoController;

    this._videoController.onVideoLoaded$.pipe(takeUntil(this._destroyed$), filter(p => !!p)).subscribe((event) => {
      this.removeAllTracks();

      let subtitlesVttTracks = this._videoController.getSubtitlesVttTracks();
      if (subtitlesVttTracks && subtitlesVttTracks.length > 0) {
        let os$ = subtitlesVttTracks.map(subtitlesVttTrack => this.createVttTrackInternal(subtitlesVttTrack));
        forkJoin(os$).subscribe({
          next: () => {
            this.onSubtitlesLoaded$.next({});
          },
          error: (err) => {
            console.error(err);
            this.onSubtitlesLoaded$.next({});
          }
        })
      } else {
        // subtitles are loaded, but no subtitles found
        this.onSubtitlesLoaded$.next({});
      }
    })
  }

  createVttTrack(config: SubtitlesVttTrackConfig): Observable<SubtitlesVttTrack | undefined> {
    if (!this._videoController.isVideoLoaded) {
      return of(void 0);
    } else {
      return this.createVttTrackInternal(new SubtitlesVttTrack(config));
    }
  }

  protected createVttTrackInternal(subtitlesVttTrack: SubtitlesVttTrack): Observable<SubtitlesVttTrack | undefined> {
    return new Observable<SubtitlesVttTrack>(o$ => {
      if (this._subtitlesTracks.has(subtitlesVttTrack.id)) {
        this.removeTrack(subtitlesVttTrack.id);
      }

      this._videoController.appendHTMLTrackElement(subtitlesVttTrack).subscribe(element => {
        if (element) {
          subtitlesVttTrack.element = element;

          this._subtitlesTracks.set(subtitlesVttTrack.id, subtitlesVttTrack);

          this.onCreate$.next({
            textTrack: subtitlesVttTrack
          });

          o$.next(subtitlesVttTrack);
          o$.complete();
        } else {
          o$.next(void 0);
          o$.complete();
        }
      })
    });
  }

  getTracks(): SubtitlesVttTrack[] {
    if (!this._videoController.isVideoLoaded) {
      return [];
    }

    return [...this._subtitlesTracks.values()];
  }

  removeAllTracks() {
    if (!this._videoController.isVideoLoaded) {
      return;
    }

    this._subtitlesTracks.forEach((value, key) => {
      this.removeTrack(value.id);
    })
  }

  removeTrack(id: string) {
    if (!this._videoController.isVideoLoaded) {
      return;
    }

    let track = this._subtitlesTracks.get(id);
    if (track) {
      // remove existing track
      this._subtitlesTracks.delete(id);
      // remove existing track from HTML DOM
      this._videoController.removeTextTrackById(track.id);

      this.onRemove$.next({});
    }
  }

  getCurrentTrack(): SubtitlesVttTrack | undefined {
    return this._currentTrack;
  }

  showTrack(id: string): void {
    this.showTrackInternal(id);
  }

  protected showTrackInternal(id: string): void {
    if (!this._videoController.isVideoLoaded) {
      return;
    }

    let textTracksList = this._videoController.getTextTrackList();
    if (textTracksList && textTracksList.length > 0) {
      for (let i = 0; i < textTracksList.length; i++) {
        let textTrack = textTracksList[i];
        if (textTrack.id !== id && !(textTrack.mode === 'hidden' || textTrack.mode === 'disabled')) {
          textTrack.mode = 'hidden';
        }
      }
    }

    let subtitlesVttTrack = this._subtitlesTracks.get(id);
    if (subtitlesVttTrack) {
      let textTrack = this._videoController.getTextTrackById(subtitlesVttTrack.id);

      if (textTrack) {
        textTrack.mode = 'showing';
        subtitlesVttTrack.hidden = false;

        this._currentTrack = subtitlesVttTrack;

        this.onShow$.next({});
      }
    }
  }

  showActiveTrack(): void {
    let currentTrack = this.getCurrentTrack();
    if (currentTrack) {
      this.showTrack(currentTrack.id);
    }
  }

  hideTrack(id: string) {
    if (!this._videoController.isVideoLoaded) {
      return;
    }

    let track = this._subtitlesTracks.get(id);
    if (track) {
      let domTextTrack = this._videoController.getTextTrackById(track.id);
      if (domTextTrack) {
        domTextTrack.mode = 'hidden';
        track.hidden = true;

        this.onHide$.next({});
      }
    }
  }

  hideActiveTrack(): void {
    let currentTrack = this.getCurrentTrack();
    if (currentTrack) {
      this.hideTrack(currentTrack.id);
    }
  }

  toggleShowHideActiveTrack(): void {
    let currentTrack = this.getCurrentTrack();
    if (currentTrack) {
      if (currentTrack.hidden) {
        this.showActiveTrack();
      } else {
        this.hideActiveTrack();
      }
    }
  }

  destroy() {
    this.removeAllTracks();

    completeUnsubscribeSubjects(
      this.onCreate$,
      this.onRemove$,
      this.onShow$,
      this.onHide$
    );

    nextCompleteVoidSubject(this._destroyed$);

    nullifier(
      this._currentTrack,
      this._videoController,
      this._subtitlesTracks
    )
  }
}
