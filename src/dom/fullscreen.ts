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

/**
 * https://github.com/imbhargav5/rooks/blob/main/packages/rooks/src/hooks/useFullscreen.ts
 */

export interface FullscreenElement {
  requestFullscreen?: Element['requestFullscreen'];
  webkitRequestFullscreen?: Element['requestFullscreen'];
  webkitRequestFullScreen?: Element['requestFullscreen'];
  mozRequestFullScreen?: Element['requestFullscreen'];
  msRequestFullscreen?: Element['requestFullscreen'];
}

export interface FullscreenDocument {
  fullscreenEnabled?: Document['fullscreenEnabled'];
  webkitFullscreenEnabled?: Document['fullscreenEnabled'];
  mozFullScreenEnabled?: Document['fullscreenEnabled'];
  msFullscreenEnabled?: Document['fullscreenEnabled'];

  fullscreenElement?: Document['fullscreenElement'];
  webkitFullscreenElement?: Document['fullscreenElement'];
  webkitCurrentFullScreenElement?: Document['fullscreenElement'];
  mozFullScreenElement?: Document['fullscreenElement'];
  msFullscreenElement?: Document['fullscreenElement'];

  exitFullscreen?: Document['exitFullscreen'];
  webkitExitFullscreen?: Document['exitFullscreen'];
  webkitCancelFullScreen?: Document['exitFullscreen'];
  mozCancelFullScreen?: Document['exitFullscreen'];
  msExitFullscreen?: Document['exitFullscreen'];

  addEventListener<K extends keyof FullscreenDocumentEventMap>(type: K, listener: (this: Document, ev: FullscreenDocumentEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;

  removeEventListener<K extends keyof FullscreenDocumentEventMap>(type: K, listener: (this: Document, ev: FullscreenDocumentEventMap[K]) => unknown, options?: boolean | EventListenerOptions): void;
}

export interface FullscreenDocumentEventMap {
  fullscreenchange: DocumentEventMap['fullscreenchange'];
  webkitfullscreenchange: DocumentEventMap['fullscreenchange'];
  mozfullscreenchange: DocumentEventMap['fullscreenchange'];
  MSFullscreenChange: DocumentEventMap['fullscreenchange'];

  fullscreenerror: DocumentEventMap['fullscreenerror'];
  webkitfullscreenerror: DocumentEventMap['fullscreenerror'];
  mozfullscreenerror: DocumentEventMap['fullscreenerror'];
  MSFullscreenError: DocumentEventMap['fullscreenerror'];
}

export class Fullscreen {
  public static isFullscreenEnabled() {
    const _document = document as FullscreenDocument;
    return _document.fullscreenEnabled || _document.webkitFullscreenEnabled || !!_document.webkitCancelFullScreen || _document.mozFullScreenEnabled || _document.msFullscreenEnabled || false;
  }

  public static isFullscreen(): boolean {
    const _document = document as FullscreenDocument;
    return !!(_document.fullscreenElement || _document.webkitFullscreenElement || _document.webkitCurrentFullScreenElement || _document.mozFullScreenElement || _document.msFullscreenElement || null);
  }

  public static requestFullscreen(element: Element | null, options?: FullscreenOptions | undefined): Promise<void> {
    const target = (element ?? document.documentElement) as FullscreenElement;
    const method = target.requestFullscreen || target.webkitRequestFullscreen || target.webkitRequestFullScreen || target.mozRequestFullScreen || target.msRequestFullscreen;

    if (!method) {
      throw new Error('Unsupported');
    }

    return method.call(target, options);
  }

  public static exitFullscreen(): Promise<void> {
    const _document = document as FullscreenDocument;
    const method = _document.exitFullscreen || _document.webkitExitFullscreen || _document.webkitCancelFullScreen || _document.mozCancelFullScreen || _document.msExitFullscreen;

    if (!method) {
      throw new Error('Unsupported');
    }

    return method.call(_document);
  }

  public static getEventsNames(): Array<keyof FullscreenDocumentEventMap> | null {
    if (typeof document === 'undefined') return null;

    const _document = document as FullscreenDocument;

    if ('exitFullscreen' in _document) return ['fullscreenchange', 'fullscreenerror'];
    if ('webkitExitFullscreen' in _document) return ['webkitfullscreenchange', 'webkitfullscreenerror'];
    if ('webkitCancelFullScreen' in _document) return ['webkitfullscreenchange', 'webkitfullscreenerror'];
    if ('mozCancelFullScreen' in _document) return ['mozfullscreenchange', 'mozfullscreenerror'];
    if ('msExitFullscreen' in _document) return ['MSFullscreenChange', 'MSFullscreenError'];

    return null;
  }

  public static getEventName(eventType: 'change' | 'error') {
    const eventsNames = this.getEventsNames();
    if (!eventsNames) return null;

    if (eventType === 'change') return eventsNames[0];
    return eventsNames[1];
  }

  public static on(eventType: 'change' | 'error', callback: (event: Event) => void) {
    const eventName = Fullscreen.getEventName(eventType);
    if (!eventName) return;

    (document as FullscreenDocument).addEventListener(eventName, callback);
  }

  public static off(eventType: 'change' | 'error', callback: (event: Event) => void) {
    const eventName = Fullscreen.getEventName(eventType);
    if (!eventName) return;

    (document as FullscreenDocument).removeEventListener(eventName, callback);
  }
}
