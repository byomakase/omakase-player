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

import {type ResourceEntity} from '../entity';
import {UrlSource} from '../source';
import type {Observable} from 'rxjs';
import type {ResourceCreateOptions} from './resource-create-options';
import type {ResourceRepositoryEvent} from '../repository';

export interface OmakaseResourceCommonApi {}

export interface OmakaseResourceApi extends OmakaseResourceCommonApi {
  /** Emits resource repository events, such as resources being added or deleted. */
  onEvent$: Observable<ResourceRepositoryEvent>;

  /**
   * Returns the resource with the given ID, or `undefined` if not found.
   *
   * @param id - The unique identifier of the resource.
   */
  get(id: ResourceEntity['id']): ResourceEntity | undefined;

  /**
   * Registers a pre-constructed resource instance.
   *
   * @param resource - The resource to add.
   * @returns The added resource.
   */
  add(resource: ResourceEntity): ResourceEntity;

  /**
   * Removes the track with the given ID.
   *
   * @param id - The unique identifier of the track to remove.
   * @returns `true` if the track was found and removed, `false` otherwise.
   */
  delete(id: ResourceEntity['id']): boolean;

  /**
   * Returns all resources that satisfy the predicate, or all resources if no predicate is provided.
   *
   * @param predicate - Optional filter function applied to each track.
   */
  find(predicate?: (value: ResourceEntity, index: number, array: ResourceEntity[]) => unknown): ResourceEntity[];

  findFirst(predicate?: (value: ResourceEntity, index: number, array: ResourceEntity[]) => unknown): ResourceEntity | undefined;

  /**
   * Creates a resource from a {@link UrlSource} object, a URL string,
   * resource markup (such as XML for SVG) or a base64 string.
   *
   * @param source - A {@link UrlSource} descriptor or a URL/markup/bas64 string pointing to the resource data.
   * @param createOptions - Optional type-specific create options (e.g. svg resource create options).
   * @returns An Observable that emits the created {@link ResourceEntity}.
   */
  create(source: UrlSource, createOptions?: ResourceCreateOptions | undefined): Observable<ResourceEntity>;
  create(inlineData: string, createOptions?: ResourceCreateOptions | undefined): Observable<ResourceEntity>;
}
