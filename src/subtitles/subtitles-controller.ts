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

import {Destroyable, SubtitlesCreateEvent, SubtitlesEvent, SubtitlesLoadedEvent, SubtitlesVttTrack} from '../types';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {SubtitlesApi} from '../api';
import {nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {VideoControllerApi} from '../video';
import {nullifier} from '../util/destroy-util';
import {CryptoUtil} from '../util/crypto-util';
import {isNullOrUndefined} from '../util/object-util';

export class SubtitlesController implements SubtitlesApi, Destroyable {
  public readonly onSubtitlesLoaded$: BehaviorSubject<SubtitlesLoadedEvent | undefined>;
  public readonly onCreate$: Observable<SubtitlesCreateEvent>;
  public readonly onRemove$: Observable<SubtitlesEvent>;
  public readonly onShow$: Observable<SubtitlesEvent>;
  public readonly onHide$: Observable<SubtitlesEvent>;

  protected _videoController: VideoControllerApi;

  protected _destroyed$ = new Subject<void>();

  constructor(videoController: VideoControllerApi) {
    this._videoController = videoController;

    this.onSubtitlesLoaded$ = this._videoController.onSubtitlesLoaded$;
    this.onCreate$ = this._videoController.onSubtitlesCreate$;
    this.onRemove$ = this._videoController.onSubtitlesRemove$;
    this.onShow$ = this._videoController.onSubtitlesShow$;
    this.onHide$ = this._videoController.onSubtitlesHide$;
  }

  createVttTrack(track: Pick<SubtitlesVttTrack, 'id' | 'src' | 'default' | 'label' | 'language'>): Observable<SubtitlesVttTrack | undefined> {
    return this._videoController.createSubtitlesVttTrack({
      ...track,
      id: isNullOrUndefined(track.id) ? CryptoUtil.uuid() : track.id,
      default: track.default ? track.default : false,
      hidden: true,
      kind: 'subtitles',
      embedded: false,
    });
  }

  getTracks(): SubtitlesVttTrack[] {
    return this._videoController.getSubtitlesTracks();
  }

  removeAllTracks(): Observable<void> {
    return passiveObservable(observer => {
      this._videoController.removeAllSubtitlesTracks().subscribe({
        next: () => {
          nextCompleteObserver(observer);
        }
      })
    });
  }

  removeTrack(id: string): Observable<void> {
    return passiveObservable(observer => {
      this._videoController.removeSubtitlesTrack(id).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        }
      })
    });
  }

  getActiveTrack(): SubtitlesVttTrack | undefined {
    return this._videoController.getActiveSubtitlesTrack();
  }

  showTrack(id: string): Observable<void> {
    return passiveObservable(observer => {
      this._videoController.showSubtitlesTrack(id).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        }
      })
    });
  }

  showActiveTrack(): Observable<void> {
    return passiveObservable((observer => {
      let activeTrack = this.getActiveTrack();
      if (activeTrack) {
        this.showTrack(activeTrack.id).subscribe({
          next: () => {
            nextCompleteObserver(observer);
          }
        });
      } else {
        nextCompleteObserver(observer);
      }
    }))
  }

  hideTrack(id: string): Observable<void> {
    return passiveObservable(observer => {
      this._videoController.hideSubtitlesTrack(id).subscribe({
        next: () => {
          nextCompleteObserver(observer);
        }
      })
    })
  }

  hideActiveTrack(): Observable<void> {
    return passiveObservable(observer => {
      let activeTrack = this.getActiveTrack();
      if (activeTrack) {
        this.hideTrack(activeTrack.id).subscribe({
          next: () => {
            nextCompleteObserver(observer);
          }
        })
      } else {
        nextCompleteObserver(observer);
      }
    })
  }

  toggleShowHideActiveTrack(): Observable<void> {
    return passiveObservable(observer => {
      let activeTrack = this.getActiveTrack();
      if (activeTrack) {
        if (activeTrack.hidden) {
          this.showActiveTrack().subscribe({
            next: () => {
              nextCompleteObserver(observer);
            }
          });
        } else {
          this.hideActiveTrack().subscribe({
            next: () => {
              nextCompleteObserver(observer);
            }
          });
        }
      } else {
        nextCompleteObserver(observer);
      }
    })
  }

  destroy() {
    nextCompleteSubject(this._destroyed$);

    nullifier(
      this._videoController
    )
  }
}
