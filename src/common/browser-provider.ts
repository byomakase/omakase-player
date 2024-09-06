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

export class BrowserProvider {
  private static _instance: BrowserProvider;

  private _userAgent: string;

  private _isFirefox;
  private _isEdge;
  private _isChromium;
  private _isChrome;
  private _isAndroid;
  private _isSafari;

  private constructor() {
    this._userAgent = window.navigator && window.navigator.userAgent || '';

    this._isAndroid = (/Android/i).test(this._userAgent);
    this._isFirefox = (/Firefox/i).test(this._userAgent);
    this._isEdge = (/Edg/i).test(this._userAgent);
    this._isChromium = ((/Chrome/i).test(this._userAgent) || (/CriOS/i).test(this._userAgent));
    this._isChrome = !this.isEdge && this.isChromium;
    this._isSafari = (/Safari/i).test(this._userAgent) && !this.isChrome && !this.isAndroid && !this.isEdge;
  }

  public static instance(): BrowserProvider {
    if (!BrowserProvider._instance) {
      BrowserProvider._instance = new BrowserProvider();
    }
    return BrowserProvider._instance;
  }

  get isSafari() {
    return this._isSafari;
  }

  get isFirefox() {
    return this._isFirefox;
  }

  get isEdge() {
    return this._isEdge;
  }

  get isChromium() {
    return this._isChromium;
  }

  get isChrome() {
    return this._isChrome;
  }

  get isAndroid() {
    return this._isAndroid;
  }
}
