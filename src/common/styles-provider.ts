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

import {BehaviorSubject, Subject} from 'rxjs';
import {OmakasePlayerStyle} from '../omakase-player';

export interface Styles {
  omakasePlayerStyle: OmakasePlayerStyle
}

export class StylesProvider {
  private static _instance: StylesProvider;

  public readonly onChange$: Subject<Styles> = new BehaviorSubject<Styles>(undefined);

  private _styles: Styles;

  private constructor() {

  }

  public static instance(): StylesProvider {
    if (!StylesProvider._instance) {
      StylesProvider._instance = new StylesProvider();
    }
    return StylesProvider._instance;
  }

  get styles(): Styles {
    return this._styles;
  }

  set styles(value: Partial<Styles>) {
    this._styles = {
      ...this._styles,
      ...value
    };
    this.onChange$.next(this._styles);
  }

}
