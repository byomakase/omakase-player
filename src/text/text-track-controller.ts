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

import {BaseTrackController, type TrackController, type TrackControllerEvent} from '../player/track-controller';
import {type TextTrackState} from '../media';
import {FileFormatType} from '../common';
import {type PlayerController, PlayerTextHandlerType} from '../player';
import {Observable} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {DomTextTrackElement} from '../dom/dom-track-element';

export interface TextTrackController extends TrackController<TrackControllerEvent> {
  playerTextHandlerType: PlayerTextHandlerType;

  switch(active: boolean): Observable<void>;

  show(): Observable<void>;

  hide(): Observable<void>;
}

export abstract class BaseTextTrackController extends BaseTrackController<TextTrackState, TrackControllerEvent> implements TextTrackController {
  protected _playerController: PlayerController;
  protected _format: FileFormatType | undefined;

  protected constructor(trackState: TextTrackState, playerController: PlayerController, format?: FileFormatType) {
    super(trackState);
    this._playerController = playerController;
    this._format = format ?? trackState.sourceFileFormatType;
  }

  abstract get playerTextHandlerType(): PlayerTextHandlerType;
  abstract hide(): Observable<void>;
  abstract show(): Observable<void>;
  abstract switch(active: boolean): Observable<void>;
}

export class NativeTextTrackController extends BaseTextTrackController {
  protected _playerController: PlayerController;

  protected _domTextTrackElement: DomTextTrackElement | undefined;
  protected _videoElementTextTrack: TextTrack | undefined;

  constructor(trackState: TextTrackState, playerController: PlayerController, format?: FileFormatType) {
    super(trackState, playerController, format);
    this._playerController = playerController;
  }

  get playerTextHandlerType(): PlayerTextHandlerType {
    return PlayerTextHandlerType.NATIVE;
  }

  loadSource(): Observable<void> {
    return new Observable<void>((observer) => {
      this.checkIsFormatSupported();

      this._domTextTrackElement = new DomTextTrackElement(this._trackState);
      this._domTextTrackElement
        .load((htmlElement: HTMLTrackElement) => {
          this._playerController.videoElement.appendChild(htmlElement);
          let textTrack = this._playerController.videoElement.textTracks.getTrackById(htmlElement.id);
          if (textTrack) {
            this._videoElementTextTrack = textTrack;
            return textTrack;
          } else {
            throw new Error(`Error appending track to video element`);
          }
        })
        .subscribe({
          next: (event) => {
            nextCompleteObserver(observer);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
    });
  }

  protected checkIsLoaded() {
    if (!(this._domTextTrackElement && this._videoElementTextTrack)) {
      throw new Error(`Track probably not loaded correctly`);
    }
  }

  switch(active: boolean): Observable<void> {
    if (active) {
      return this.show();
    } else {
      return this.hide();
    }
  }

  show(): Observable<void> {
    return new Observable<void>((observer) => {
      this.checkIsLoaded();
      this._videoElementTextTrack!.mode = 'showing';
      nextCompleteObserver(observer);
    });
  }

  hide(): Observable<void> {
    return new Observable<void>((observer) => {
      this.checkIsLoaded();
      this._videoElementTextTrack!.mode = 'hidden';
      nextCompleteObserver(observer);
    });
  }

  destroy(): void {
    if (this._videoElementTextTrack) {
      this._videoElementTextTrack.mode = 'disabled';
      this._videoElementTextTrack = void 0;
    }

    if (this._domTextTrackElement) {
      const htmlElement = this._domTextTrackElement.htmlElement;
      htmlElement.parentElement?.removeChild(htmlElement);
      this._domTextTrackElement.destroy();
      this._domTextTrackElement = void 0;
    }

    super.destroy();
  }

  private checkIsFormatSupported() {
    let format = this._format;
    if (format && format !== FileFormatType.VTT) {
      throw new Error(`Unknown text fileFormatType: ${format}`);
    }
  }
}
