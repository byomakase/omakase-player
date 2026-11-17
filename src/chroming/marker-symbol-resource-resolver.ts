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

import {filter, map, type Observable, switchMap, throwError} from 'rxjs';
import {type ResourceEntity, ResourceEntityType} from '../entity';
import type {SvgResource} from '../resource';
import {type ResourceRepositoryEvent, ResourceRepositoryEventType} from '../repository/resource-repository';
import type {ResourceRepositoryProxy} from '../remoting/impl/resource-repository-proxy';
import type {RemoteNode} from '../remoting/remote-node';

/**
 * Resolves custom marker symbol resources (see {@link MarkerStyle.customMarkerSymbolResource}) for marker bars
 */
export interface MarkerSymbolResourceResolver {
  /**
   * Resolves the blob url of an svg resource. Errors if the resource doesn't exist, isn't an svg or its blob can't be created
   * @param resourceId Resource id
   */
  resolveSvgBlobUrl(resourceId: ResourceEntity['id']): Observable<string>;

  /**
   * Emits when the resource is deleted from the resource repository
   * @param resourceId Resource id
   */
  onResourceDeleted$(resourceId: ResourceEntity['id']): Observable<void>;
}

const filterDeleted = (resourceId: ResourceEntity['id']) => (source$: Observable<ResourceRepositoryEvent>) =>
  source$.pipe(
    filter((event) => event.type === ResourceRepositoryEventType.RESOURCE_DELETED && event.data.resourceState.id === resourceId),
    map(() => void 0)
  );

/**
 * Resolves resources from the resource repository of the player in the same window
 */
export class LocalMarkerSymbolResourceResolver implements MarkerSymbolResourceResolver {
  constructor(private readonly _resources: {get(id: ResourceEntity['id']): ResourceEntity | undefined; onEvent$: Observable<ResourceRepositoryEvent>}) {}

  resolveSvgBlobUrl(resourceId: ResourceEntity['id']): Observable<string> {
    const resource = this._resources.get(resourceId);
    if (!resource) {
      return throwError(() => new Error(`Resource ${resourceId} not found in the resource repository`));
    }
    if (resource.resourceType !== ResourceEntityType.SVG_RESOURCE) {
      return throwError(() => new Error(`Resource ${resourceId} is not an svg resource`));
    }
    return (resource as SvgResource).resolveBlobUrl();
  }

  onResourceDeleted$(resourceId: ResourceEntity['id']): Observable<void> {
    return this._resources.onEvent$.pipe(filterDeleted(resourceId));
  }
}

/**
 * Resolves resources from the resource repository of the host player, used while the player is detached
 */
export class DetachedMarkerSymbolResourceResolver implements MarkerSymbolResourceResolver {
  constructor(
    private readonly _remoteNode: RemoteNode,
    private readonly _resourceRepository: ResourceRepositoryProxy
  ) {}

  resolveSvgBlobUrl(resourceId: ResourceEntity['id']): Observable<string> {
    return this._resourceRepository.get(resourceId).pipe(
      switchMap((state) => {
        if (!state) {
          return throwError(() => new Error(`Resource ${resourceId} not found in the resource repository`));
        }
        if (state.resourceType !== ResourceEntityType.SVG_RESOURCE) {
          return throwError(() => new Error(`Resource ${resourceId} is not an svg resource`));
        }
        return this._remoteNode.getOrCreateProxy('SvgResource', resourceId).resolveBlobUrl();
      })
    );
  }

  onResourceDeleted$(resourceId: ResourceEntity['id']): Observable<void> {
    return this._resourceRepository.onEvent$.pipe(filterDeleted(resourceId));
  }
}
