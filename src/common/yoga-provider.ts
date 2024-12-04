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

import {from, map, Observable} from 'rxjs';
// @ts-ignore
import {Config, loadYoga, Yoga} from 'yoga-layout';

export class YogaProvider {
  private static _instance: YogaProvider;

  Yoga: Yoga;
  Config: Config;

  private constructor() {}

  public static instance(): YogaProvider {
    if (!YogaProvider._instance) {
      YogaProvider._instance = new YogaProvider();
    }
    return YogaProvider._instance;
  }

  init(): Observable<void> {
    return from(loadYoga()).pipe(
      map((Yoga) => {
        this.Yoga = Yoga;
        this.Config = this.Yoga.Config;
      })
    );
  }
}
