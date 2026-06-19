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

import {from, map, Observable} from 'rxjs';
import type {Yoga} from 'yoga-layout/load';
import {loadYoga} from 'yoga-layout/load';

export class YogaProvider {
  private static _instance: YogaProvider;

  private static _yoga: Yoga | undefined;

  private constructor() {}

  public static instance(): YogaProvider {
    if (!YogaProvider._instance) {
      YogaProvider._instance = new YogaProvider();
    }
    return YogaProvider._instance;
  }

  init(): Observable<void> {
    return from(loadYoga()).pipe(
      map((loadYogaResult) => {
        YogaProvider._yoga = loadYogaResult;
      })
    );
  }

  get yoga(): Yoga {
    if (YogaProvider._yoga) {
      return YogaProvider._yoga;
    } else {
      throw new Error('Yoga is not initialized');
    }
  }
}
