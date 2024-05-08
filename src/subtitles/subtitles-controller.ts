/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 *
 */

import {SubtitlesVttTrack} from '../track/subtitles-vtt-track';
import {Destroyable, OmakaseTextTrack, OmakaseTextTrackCue, SubtitlesCreateEvent, SubtitlesEvent, SubtitlesVttTrackConfig} from '../types';
import {filter, Observable, of, Subject} from 'rxjs';
import {SubtitlesApi} from '../api/subtitles-api';
import {completeSubjects, unsubscribeSubjects} from '../util/observable-util';
import {VideoControllerApi} from '../video/video-controller-api';

export class SubtitlesController implements SubtitlesApi, Destroyable {
  protected currentTrack: OmakaseTextTrack<OmakaseTextTrackCue>;

  protected videoController: VideoControllerApi;

  protected subtitlesTracks: Map<string, OmakaseTextTrack<OmakaseTextTrackCue>> = new Map<string, OmakaseTextTrack<OmakaseTextTrackCue>>();

  public readonly onCreate$: Subject<SubtitlesCreateEvent> = new Subject<SubtitlesCreateEvent>();
  public readonly onRemove$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onShow$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();
  public readonly onHide$: Subject<SubtitlesEvent> = new Subject<SubtitlesEvent>();

  constructor(videoController: VideoControllerApi) {
    this.videoController = videoController;

    this.videoController.onVideoLoaded$.pipe(filter(p => !!p)).subscribe((event) => {
      this.removeAllTracks();
    })
  }

  createVttTrack(config: SubtitlesVttTrackConfig): Observable<SubtitlesVttTrack | undefined> {
    if (!this.videoController.isVideoLoaded) {
      return of(void 0);
    } else {
      return new Observable<SubtitlesVttTrack>(o$ => {
        let track = new SubtitlesVttTrack(config)

        if (this.subtitlesTracks.has(track.id)) {
          this.removeTrack(track.id);
        }

        this.videoController.appendHTMLTrackElement(track).subscribe(element => {
          track.element = element;

          this.subtitlesTracks.set(track.id, track);

          let textTrack = this.videoController.getTextTrackById(track.id);
          textTrack.mode = 'hidden';

          this.onCreate$.next({
            textTrack: track
          });

          o$.next(track);
          o$.complete();
        })
      });
    }
  }

  getTracks(): OmakaseTextTrack<OmakaseTextTrackCue>[] {
    if (!this.videoController.isVideoLoaded) {
      return void 0;
    }

    return [...this.subtitlesTracks.values()];
  }

  removeAllTracks() {
    if (!this.videoController.isVideoLoaded) {
      return;
    }

    this.subtitlesTracks.forEach((value, key) => {
      this.removeTrack(value.id);
    })
  }

  removeTrack(id: string) {
    if (!this.videoController.isVideoLoaded) {
      return;
    }

    let track = this.subtitlesTracks.get(id);
    if (track) {
      // remove existing track
      this.subtitlesTracks.delete(id);
      // remove existing track from HTML DOM
      this.videoController.removeTextTrackById(track.id);

      this.onRemove$.next({});
    }
  }

  getCurrentTrack(): OmakaseTextTrack<OmakaseTextTrackCue> | undefined {
    return this.currentTrack;
  }

  showTrack(id: string = void 0) {
    if (!this.videoController.isVideoLoaded) {
      return;
    }

    id = id ? id : this.getCurrentTrack() ? this.getCurrentTrack().id : void 0;

    if (!id) {
      return;
    }

    let track = this.subtitlesTracks.get(id);

    if (track) {
      let domTextTrack = this.videoController.getTextTrackById(track.id);

      if (domTextTrack) {
        let textTracksList = this.videoController.getTextTrackList();
        for (let i = 0; i < textTracksList.length; i++) {
          let textTrack = textTracksList[i];
          textTrack.mode = 'hidden';
        }
        domTextTrack.mode = 'showing';
        track.hidden = false;

        this.currentTrack = track;

        this.onShow$.next({});
      }
    }
  }

  hideTrack(id: string = void 0) {
    if (!this.videoController.isVideoLoaded) {
      return;
    }

    id = id ? id : this.getCurrentTrack() ? this.getCurrentTrack().id : void 0;

    if (!id) {
      return;
    }

    let track = this.subtitlesTracks.get(id);
    if (track) {
      let domTextTrack = this.videoController.getTextTrackById(track.id);
      if (domTextTrack) {
        domTextTrack.mode = 'hidden';
        track.hidden = true;

        this.onHide$.next({});
      }
    }
  }

  destroy() {
    this.removeAllTracks();

    let subjects = [this.onCreate$, this.onRemove$, this.onShow$, this.onHide$];
    completeSubjects(...subjects)
    unsubscribeSubjects(...subjects);

    this.currentTrack = void 0;
    this.videoController = void 0;
  }
}
