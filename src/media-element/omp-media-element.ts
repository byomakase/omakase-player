/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

import {BehaviorSubject, first, forkJoin, fromEvent, Observable, Subject, take, takeUntil} from 'rxjs';
import {CryptoUtil} from '../util/crypto-util';
import {Destroyable, OmpMediaElementErrorEvent, OmpMediaElementLoadedEvent, OmpMediaElementLoadingEvent} from '../types';
import {completeUnsubscribeSubjects, errorCompleteSubject, nextCompleteSubject} from '../util/rxjs-util';
import {BufferedTimespan, OmpMediaElementState} from '../video/model';
import {StringUtil} from '../util/string-util';
import {MediaElementUtil} from '../util/media-element-util';

export const HTMLElementEvents = {
  ERROR: 'error',
  LOAD: 'load',
};
export const HTMLMediaElementEvents = {
  ...HTMLElementEvents,
  DURATIONCHANGE: 'durationchange',
  ENDED: 'ended',
  LOADEDDATA: 'loadeddata',
  LOADEDMETEDATA: 'loadedmetadata',
  PAUSE: 'pause',
  PLAYING: 'playing',
  PROGRESS: 'progress',
  RATECHANGE: 'ratechange',
  SEEKED: 'seeked',
  SEEKING: 'seeking',
  TIMEUPDATE: 'timeupdate',
  VOLUMECHANGE: 'volumechange',
  WAITING: 'waiting',
};
export const HTMLVideoElementEvents = {
  ...HTMLMediaElementEvents,
  ENTERPIP: 'enterpictureinpicture',
  LEAVEPIP: 'leavepictureinpicture',
};

export interface OmpMediaElementApi extends Destroyable {
  onLoading$: Observable<OmpMediaElementLoadingEvent>;

  onLoaded$: Observable<OmpMediaElementLoadedEvent | undefined>;

  onError$: Observable<OmpMediaElementErrorEvent>;

  loadSource(src: string): void;

  getBufferedTimespans(): BufferedTimespan[];

  getMediaElementState(): OmpMediaElementState;
}

export abstract class BaseOmpMediaElement<T extends HTMLMediaElement, S extends OmpMediaElementState> implements OmpMediaElementApi {
  public readonly onLoading$: Subject<OmpMediaElementLoadingEvent> = new Subject<OmpMediaElementLoadingEvent>();
  public readonly onLoaded$: BehaviorSubject<OmpMediaElementLoadedEvent | undefined> = new BehaviorSubject<OmpMediaElementLoadedEvent | undefined>(void 0);
  public readonly onError$: Subject<OmpMediaElementErrorEvent> = new Subject<OmpMediaElementErrorEvent>();

  protected _mediaElement: T;
  protected readonly _id: string;
  protected _loaded: boolean = false;
  protected _src: string | undefined;

  protected _loadBreaker$ = new Subject<void>();
  protected _nextLoadBreaker$ = new Subject<void>();

  protected _destroyed$ = new Subject<void>();

  protected constructor(mediaElement: T) {
    this._mediaElement = mediaElement;
    this._id = CryptoUtil.uuid();
  }

  abstract getMediaElementState(): S;

  loadSource(src: string): void {
    let firstLoad = StringUtil.isEmpty(this._src);
    this._src = src;
    this._loaded = false;

    if (!this._loadBreaker$.closed) {
      errorCompleteSubject(this._loadBreaker$, 'loadSource() called again before previous resource loaded');
    }
    this._loadBreaker$ = new Subject<void>();

    nextCompleteSubject(this._nextLoadBreaker$);
    this._nextLoadBreaker$ = new Subject<void>();

    let loadedData$ = fromEvent(this._mediaElement, HTMLMediaElementEvents.LOADEDDATA).pipe(first());
    let loadedMetadata$ = fromEvent(this._mediaElement, HTMLMediaElementEvents.LOADEDMETEDATA).pipe(first());
    let error$ = fromEvent(this._mediaElement, HTMLMediaElementEvents.ERROR).pipe(take(1));

    error$.pipe(takeUntil(this._loadBreaker$), takeUntil(this._destroyed$)).subscribe((error) => {
      this.onLoaded$.error(error);
      nextCompleteSubject(this._loadBreaker$);
    });

    forkJoin([loadedData$, loadedMetadata$])
      .pipe(takeUntil(this._loadBreaker$), takeUntil(this._destroyed$))
      .pipe(take(1))
      .subscribe({
        next: ([loadedData, loadedMetadata]) => {
          this._loaded = true;
          this.onLoaded$.next({
            mediaElementState: this.getMediaElementState(),
          });

          fromEvent(this._mediaElement, HTMLVideoElementEvents.ERROR)
            .pipe(takeUntil(this._nextLoadBreaker$), takeUntil(this._destroyed$))
            .subscribe({
              next: (error) => {
                console.debug(error);
                this.onError$.next({
                  mediaElementState: this.getMediaElementState(),
                  error: error,
                });
              },
            });
        },
        error: (error) => {
          this.onLoaded$.error(error);
        },
        complete: () => {
          nextCompleteSubject(this._loadBreaker$);
        },
      });

    this.onLoading$.next({
      mediaElementState: this.getMediaElementState(),
    });

    this._mediaElement.src = src;

    if (!firstLoad) {
      this._mediaElement.load();
    }
  }

  getBufferedTimespans(): BufferedTimespan[] {
    return MediaElementUtil.getBufferedTimespans(this._mediaElement);
  }

  get mediaElement() {
    return this._mediaElement;
  }

  destroy() {
    nextCompleteSubject(this._destroyed$);
    nextCompleteSubject(this._loadBreaker$);
    nextCompleteSubject(this._nextLoadBreaker$);

    completeUnsubscribeSubjects(this.onLoading$, this.onLoaded$, this.onError$);

    this._mediaElement.pause();
    this._mediaElement.src = "";
    this._mediaElement.load();

    // @ts-ignore
    this._mediaElement = void 0;
  }
}

export interface OmpMediaElementConfig {}

export interface OmpAudioElementConfig extends OmpMediaElementConfig {
  loop?: boolean;
  crossOrigin?: string | undefined;
}

export class OmpAudioElement extends BaseOmpMediaElement<HTMLAudioElement, OmpMediaElementState> {
  constructor(config?: OmpAudioElementConfig) {
    super(new Audio());

    // don't display any of the <audio> elements
    // audioElement.style.display = 'none'; // TODO remove

    // don't allow controls (not visible anyway)
    // audioElement.controls = false;
    // this._mediaElement.controls = true; // TODO remove

    this._mediaElement.id = this._id;
    if (config && config.loop !== void 0) {
      this._mediaElement.loop = config.loop;
    }
    if (config && config.crossOrigin !== void 0) {
      this._mediaElement.crossOrigin = config.crossOrigin;
    }
  }

  override getMediaElementState(): OmpMediaElementState {
    return {
      id: this._id,
      src: this._src,
      loaded: this._loaded,
    };
  }
}
