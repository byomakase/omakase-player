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

import type {Observable} from 'rxjs';
import type {TimedItem} from '../../media';
import type {TrackGenerationOptions} from '../track-load-options';

export interface TrackTimedItems<TI> {
  trackLabel: string;
  timedItems: TI[];
}

export interface TimedItemsGenerator {
  generateTimedItems(): Observable<TrackTimedItems<TimedItem>[]>;
}

export abstract class BaseTimedItemsGenerator<TI extends TimedItem> implements TimedItemsGenerator {
  protected _url: string;
  protected _generationOptions?: TrackGenerationOptions | undefined;

  protected constructor(url: string, generationOptions?: TrackGenerationOptions | undefined) {
    this._url = url;
    this._generationOptions = generationOptions;
  }

  public abstract generateTimedItems(): Observable<TrackTimedItems<TI>[]>;
}
