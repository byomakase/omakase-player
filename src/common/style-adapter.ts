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

import {Subject} from 'rxjs';

export class StyleAdapter<T> {
  public readonly onChange$: Subject<T> = new Subject<T>();

  private _style!: T;

  constructor(style: T) {
    this.style = {
      ...style
    };
  }

  get style(): T {
    return this._style;
  }

  set style(value: Partial<T>) {
    let oldStringified = JSON.stringify(this._style);
    this._style = {
      ...this._style,
      ...value
    };
    if (oldStringified !== JSON.stringify(this._style)) {
      this.onChange$.next(this._style);
    }
  }
}
