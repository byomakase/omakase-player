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
import {AuthConfig, FileFormatType} from '../common';
import {filter, Observable, takeUntil} from 'rxjs';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {BaseTextTrackController} from './text-track-controller';
import {DomUtil} from '../dom/dom-util';
import {StringUtil} from '../util/string-util';
import {ObserverBreaker} from '../common/observer-breaker';
import type {TTDocument} from 'smp-imsc';
import * as imsc from 'smp-imsc';
import {httpGetText} from '../http';
import {fastHashObject} from '../util/object-util';
import {ChromingUtil} from '../chroming/chroming-util';
import {SourceUtil} from '../source';

export class ImscTextTrackController extends BaseTextTrackController {
  protected _ttDocument: TTDocument | undefined;

  protected _captionsElement: HTMLElement | undefined;
  protected _switchBreaker = new ObserverBreaker();

  constructor(trackState: TextTrackState, playerController: PlayerController, format?: FileFormatType) {
    super(trackState, playerController, format);
    this._playerController = playerController;
  }

  get playerTextHandlerType(): PlayerTextHandlerType {
    return PlayerTextHandlerType.IMSC;
  }

  private createCaptionsElement(): HTMLElement {
    let element = DomUtil.createElement<'div'>('div');
    DomUtil.setAttributes(element, {
      'data-text-track-id': this._trackState.id,
      'width': '100%',
      'height': '100%',
    });
    return element;
  }

  private deleteCaptionsElement() {
    if (this._captionsElement) {
      this._captionsElement.remove();
      this._captionsElement = void 0;
    }
  }

  loadSource(): Observable<void> {
    return new Observable<void>((observer) => {
      let source = this._trackState.source;
      let url: string | undefined;

      if (source) {
        url = SourceUtil.resolveUrlFromSourceState(source);
      }

      if (StringUtil.isEmpty(url)) {
        throw new Error(`Track source not set`);
      }

      this.checkIsFormatSupported();

      httpGetText(url!, AuthConfig.createRequestInit(url!, AuthConfig.authentication))
        .then((ttmlText) => {
          this._ttDocument = imsc.fromXML(ttmlText);
          nextCompleteObserver(observer);
        })
        .catch((error) => {
          errorCompleteObserver(observer, error);
        });
    });
  }

  protected checkIsLoaded() {
    if (!this._ttDocument) {
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

      this._switchBreaker.break();
      this.deleteCaptionsElement();

      let captionsSlot = this._playerController.textImscElement;
      let captionsElement = this.createCaptionsElement();
      captionsSlot.appendChild(captionsElement);
      this._captionsElement = captionsElement;

      let lastRenderedIsd: imsc.ISD | undefined = void 0;
      let lastRenderedIsdHash: number | undefined = void 0;

      ChromingUtil.onResize$.pipe(takeUntil(this._switchBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe(() => {
        if (lastRenderedIsd) {
          captionsElement.innerHTML = '';
          imsc.renderHTML(lastRenderedIsd, captionsElement);
        }
      });

      this._playerController.onEvent$
        .pipe(filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS || p.type === PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE))
        .pipe(takeUntil(this._switchBreaker.observer))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe((event) => {
          let currentTime = event.data.currentTime;

          let isd = imsc.generateISD(this._ttDocument!, currentTime);
          let isdHasContents = isd.contents && isd.contents.length > 0;

          if (isdHasContents) {
            let isdHash = fastHashObject(isd);
            if (isdHash !== lastRenderedIsdHash) {
              captionsElement.innerHTML = '';
              imsc.renderHTML(isd, captionsElement);
              lastRenderedIsdHash = isdHash;
              lastRenderedIsd = isd;
            } else {
              // already rendered, skip re-rendering
            }
          } else {
            captionsElement.innerHTML = '';
            lastRenderedIsdHash = void 0;
            lastRenderedIsd = void 0;
          }
        });

      nextCompleteObserver(observer);
    });
  }

  hide(): Observable<void> {
    return new Observable<void>((observer) => {
      this.checkIsLoaded();

      this._switchBreaker.break();
      this.deleteCaptionsElement();

      nextCompleteObserver(observer);
    });
  }

  private checkIsFormatSupported() {
    let format = this._format;
    if (format && format !== FileFormatType.TTML) {
      throw new Error(`Unknown text fileFormatType: ${format}`);
    }
  }

  destroy() {
    super.destroy();
    this._switchBreaker.destroy();
    this.deleteCaptionsElement();
  }
}
