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

import {type PlayerController, PlayerControllerEventType, PlayerTextHandlerType} from '../player';
import {type TextTrackState} from '../media';
import {FileFormatType} from '../common';
import {filter, Observable, takeUntil} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {BaseTextTrackController} from './text-track-controller';
import {type CaptionsFileFormat, CaptionsRenderer, type ParseByteStreamOptions, type ParsedCaptionsResult, parseResponse} from 'media-captions';
import {DomUtil} from '../dom/dom-util';
import {StringUtil} from '../util/string-util';
import {AuthConfig} from '../common';
import {ObserverBreaker} from '../common/observer-breaker';
import {SourceUtil} from '../source';

export class MediaCaptionsTextTrackController extends BaseTextTrackController {
  protected _playerController: PlayerController;
  protected _captionsRenderer: CaptionsRenderer;

  protected _parsedCaptionsResult: ParsedCaptionsResult | undefined;

  protected _captionsElement: HTMLElement;
  protected _switchBreaker = new ObserverBreaker();

  constructor(trackState: TextTrackState, playerController: PlayerController, format?: FileFormatType) {
    super(trackState, playerController, format);
    this._playerController = playerController;

    let captionsSlot = this._playerController.textMediaCaptionsElement;

    this._captionsElement = DomUtil.createElement<'div'>('div');
    DomUtil.setAttribute(this._captionsElement, 'data-text-track-id', this._trackState.id);

    captionsSlot.appendChild(this._captionsElement);

    this._captionsRenderer = new CaptionsRenderer(this._captionsElement);
  }

  get playerTextHandlerType(): PlayerTextHandlerType {
    return PlayerTextHandlerType.MEDIA_CAPTIONS;
  }

  loadSource(): Observable<void> {
    return new Observable<void>((observer) => {
      let source = this._trackState.source;
      let url: string | undefined;

      if (source) {
        url = SourceUtil.resolveUrlFromSourceState(source)
      }

      if (StringUtil.isEmpty(url)) {
        throw new Error(`Track source not set`);
      }

      let format = this._format;

      let type: CaptionsFileFormat | undefined;
      if (format) {
        type = this.resolveFromFileFormatType(format);
      }

      let options: ParseByteStreamOptions = type ? {type: type} : {};
      parseResponse(fetch(url!, AuthConfig.createRequestInit(url!, AuthConfig.authentication)), options)
        .then((parsedCaptionsResult) => {
          this._parsedCaptionsResult = parsedCaptionsResult;
          nextCompleteObserver(observer);
        })
        .catch((error) => {
          errorCompleteObserver(observer, error);
        });
    });
  }

  protected checkIsLoaded() {
    if (!this._captionsRenderer && this._parsedCaptionsResult) {
      throw new Error(`Track probably not loaded correctly`);
    }
  }

  protected updateCaptions(currentTime: number) {
    this._captionsRenderer.currentTime = currentTime;
  }

  switch(active: boolean): Observable<void> {
    if (active) {
      return this.show();
    } else {
      return this.hide();
    }
  }

  protected clearCaptions(): void {
    this._captionsElement.innerHTML = '';
  }

  show(): Observable<void> {
    return new Observable<void>((observer) => {
      this.checkIsLoaded();

      this._switchBreaker.break();

      this._captionsRenderer.changeTrack({
        regions: this._parsedCaptionsResult!.regions,
        cues: this._parsedCaptionsResult!.cues,
      });

      this.updateCaptions(this._playerController.getCurrentTime());

      this._playerController.onEvent$
        .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS))
        .pipe(takeUntil(this._switchBreaker.observer))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe((event) => {
          this.updateCaptions(event.data.currentTime);
        });

      nextCompleteObserver(observer);
    });
  }

  hide(): Observable<void> {
    return new Observable<void>((observer) => {
      this.checkIsLoaded();

      this._switchBreaker.break();

      this._captionsRenderer.changeTrack({
        regions: [],
        cues: [],
      });

      nextCompleteObserver(observer);
    });
  }

  private resolveFromFileFormatType(fileFormatType: FileFormatType): CaptionsFileFormat {
    switch (fileFormatType) {
      case FileFormatType.VTT:
        return 'vtt';
      case FileFormatType.SRT:
        return 'srt';
      case FileFormatType.SSA:
        return 'ssa';
      case FileFormatType.ASS:
        return 'ass';
      default:
        throw new Error(`Unknown text fileFormatType: ${fileFormatType}`);
    }
  }

  destroy() {
    super.destroy();

    this._switchBreaker.break();
    this.clearCaptions();
    this._captionsElement.remove();

    this._captionsRenderer.destroy();
  }
}
