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

import {Destroyable} from '../types';
import {Timeline} from './timeline';
import {StringUtil} from '../util/string-util';
import {DomUtil} from '../util/dom-util';
import {VideoControllerApi} from '../video';
import {filter, Subject, takeUntil} from 'rxjs';
import {nextCompleteSubject} from '../util/rxjs-util';
import {Dimension, Position} from '../common';

const domClasses = {
  timeline: 'omakase-timeline',
  timelineOverlay: 'omakase-timeline-overlay',
  timelineCanvas: 'omakase-timeline-canvas',
  timelineTimecode: 'omakase-timeline-timecode',
}

export class TimelineDomController implements Destroyable {
  private _timeline: Timeline;

  private _videoController!: VideoControllerApi;

  private _divTimeline: HTMLElement;
  private _divTimelineOverlay!: HTMLElement;
  private _divTimelineCanvas!: HTMLDivElement;
  private _divTimelineTimecode!: HTMLDivElement;

  private readonly _destroyed$ = new Subject<void>();

  constructor(timeline: Timeline, videoController: VideoControllerApi) {
    this._timeline = timeline;

    if (StringUtil.isNullUndefinedOrWhitespace(this._timeline.config.timelineHTMLElementId)) {
      throw new Error(`Timeline <div> id not provided`)
    }

    this._divTimeline = DomUtil.getElementById<HTMLElement>(this._timeline.config.timelineHTMLElementId);

    if (!this._divTimeline) {
      throw new Error(`Could not find HTML element id=${this._timeline.config.timelineHTMLElementId}`)
    }

    this.createDom();

    this.videoController = videoController;

    this._timeline.onReady$.pipe(filter(p => !!p)).subscribe((event) => {
      this.settleDom();
    })

    this._videoController.onVideoLoaded$.pipe(filter(p => !!p)).subscribe((event) => {
      this.settleDom();
    })
  }

  private createDom() {
    this._divTimeline.innerHTML = `
      <div class="${domClasses.timelineOverlay}">
        <div class="${domClasses.timelineTimecode}">

        </div>
      </div>
      <div class="${domClasses.timelineCanvas}"></div>
    `;

    this._divTimelineOverlay = this.getTimelineElement<HTMLElement>(domClasses.timelineOverlay);
    this._divTimelineCanvas = this.getTimelineElement<HTMLDivElement>(domClasses.timelineCanvas);
    this._divTimelineTimecode = this.getTimelineElement<HTMLDivElement>(domClasses.timelineTimecode);
  }

  private cleanDom() {
    this._divTimeline.innerHTML = '';
  }

  settleDom() {
    if (this._timeline.getScrubberLane()) {
      this.refreshTimecode();

      let position: Position = this._timeline.getScrubberLane().mainLeftFlexGroup.contentNode.konvaNode.absolutePosition();
      let dimension: Dimension = {
        width: this._timeline.getScrubberLane().mainLeftFlexGroup.contentNode.konvaNode.width(),
        height: this._timeline.getScrubberLane().mainLeftFlexGroup.contentNode.konvaNode.height()
      };

      this._divTimelineTimecode.style.top = `${position.y}px`
      this._divTimelineTimecode.style.left = `${position.x}px`
      this._divTimelineTimecode.style.width = `${dimension.width}px`
      this._divTimelineTimecode.style.height = `${dimension.height}px`

      this._divTimelineTimecode.style.fontStyle = `${this._timeline.style.textFontStyle}`
      this._divTimelineTimecode.style.fontFamily = `${this._timeline.style.textFontFamily}`
    } else {
      this.setDivTimelineTimecode('');
    }
  }

  set videoController(videoController: VideoControllerApi) {
    this._videoController = videoController;

    this._videoController.onVideoTimeChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.refreshTimecode();
    })
  }

  private refreshTimecode() {
    this.setDivTimelineTimecode(this._videoController.isVideoLoaded() ? this._videoController.getCurrentTimecode() : '');
  }

  private setDivTimelineTimecode(text: string) {
    this._divTimelineTimecode.innerHTML = text;
  }

  private getTimelineElement<T>(className: string): T {
    return this.getTimelineElements<T>(className)[0];
  }

  private getTimelineElements<T>(className: string): T[] {
    return Array.from(DomUtil.getElementById<HTMLElement>(this._divTimeline.id).querySelectorAll(`.${className}`)) as T[];
  }

  destroy(): void {
    nextCompleteSubject(this._destroyed$);
    this.cleanDom();
  }


  get divTimeline(): HTMLElement {
    return this._divTimeline;
  }

  get divTimelineCanvas(): HTMLDivElement {
    return this._divTimelineCanvas;
  }
}
