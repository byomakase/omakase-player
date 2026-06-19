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

import {type Track} from '../media';
import type {TrackUtilsApi} from './track-utils';
import {Observable} from 'rxjs';
import type {Source} from '../source';
import type {TrackLoadOptions} from './track-load-options';

export interface OmakaseTrackApi extends OmakaseTrackCommonApi {
  /** Utility helpers for working with tracks. */
  utils: TrackUtilsApi;

  /**
   * Returns the track with the given ID, or `undefined` if not found.
   *
   * @param id - The unique identifier of the track.
   */
  get(id: Track['id']): Track | undefined;

  /**
   * Registers a pre-constructed track instance.
   *
   * @param track - The track to add.
   * @returns The added track.
   */
  add(track: Track): Track;

  /**
   * Removes the track with the given ID.
   *
   * @param id - The unique identifier of the track to remove.
   * @returns `true` if the track was found and removed, `false` otherwise.
   */
  delete(id: Track['id']): boolean;

  /**
   * Returns all tracks that satisfy the predicate, or all tracks if no predicate is provided.
   *
   * @param predicate - Optional filter function applied to each track.
   */
  find(predicate?: (value: Track, index: number, array: Track[]) => unknown): Track[];

  findFirst(predicate?: (value: Track, index: number, array: Track[]) => unknown): Track | undefined;

  /**
   * Loads a track from a {@link Source} object or a URL string.
   *
   * @param source - A {@link Source} descriptor or a URL string pointing to the track resource.
   * @param loadOptions - Optional type-specific load options (e.g. marker or thumbnail track options).
   * @returns An Observable that emits the loaded {@link Track}.
   */
  load(source: Source, loadOptions?: TrackLoadOptions | undefined): Observable<Track>;
  load(url: string, loadOptions?: TrackLoadOptions | undefined): Observable<Track>;
}

interface OmakaseTrackCommonApi {}
