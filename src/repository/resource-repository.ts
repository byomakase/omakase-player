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

import {BaseRepository} from './repository';
import {BaseSvgResource} from '../resource';
import {type ResourceEntity, type ResourceEntityState} from '../entity';
import {type Serializable} from '../common/capabilities';
import {filter, map, type Observable, Subject} from 'rxjs';
import {freeObserver} from '../util/rxjs-util';

export enum ResourceRepositoryEventType {
  RESOURCE_ADDED = 'RESOURCE_ADDED',
  RESOURCE_DELETED = 'RESOURCE_DELETED',
}

export interface ResourceRepositoryEventData<S extends ResourceEntityState = ResourceEntityState> extends Serializable {
  resourceState: S;
}

export interface ResourceRepositoryEventDataMap<S extends ResourceEntityState = ResourceEntityState> {
  [ResourceRepositoryEventType.RESOURCE_ADDED]: ResourceRepositoryEventData<S>;
  [ResourceRepositoryEventType.RESOURCE_DELETED]: ResourceRepositoryEventData<S>;
}

export type ResourceRepositoryEvent<T extends ResourceRepositoryEventType = ResourceRepositoryEventType, S extends ResourceEntityState = ResourceEntityState> = {
  type: T;
  data: ResourceRepositoryEventDataMap<S>[T];
};

export class ResourceRepository extends BaseRepository<ResourceEntity> {
  protected readonly _onEvent$: Subject<ResourceRepositoryEvent> = new Subject<ResourceRepositoryEvent>();

  constructor() {
    super();
  }

  get onEvent$(): Observable<ResourceRepositoryEvent> {
    return this._onEvent$.asObservable();
  }

  onResourceDeleted$(resourceId: ResourceEntity['id']): Observable<ResourceRepositoryEvent<ResourceRepositoryEventType.RESOURCE_DELETED>> {
    return this.onEvent$
      .pipe(filter((p) => p.type === ResourceRepositoryEventType.RESOURCE_DELETED && p.data.resourceState.id === resourceId))
      .pipe(map((p) => p as ResourceRepositoryEvent<ResourceRepositoryEventType.RESOURCE_DELETED>));
  }

  add(resource: ResourceEntity): ResourceEntity {
    let newResource = super.add(resource);
    this._onEvent$.next({
      type: ResourceRepositoryEventType.RESOURCE_ADDED,
      data: {
        resourceState: newResource.state,
      },
    });

    return newResource;
  }

  addAll(entities: ResourceEntity[]): ResourceEntity[] {
    let resources = super.addAll(entities);
    resources.forEach((resource) => {
      this._onEvent$.next({
        type: ResourceRepositoryEventType.RESOURCE_ADDED,
        data: {
          resourceState: resource.state,
        },
      });
    });

    return resources;
  }

  delete(id: ResourceEntity['id']): boolean {
    let resource = this.get(id);
    let result = false;
    if (resource) {
      let state = resource.state;
      result = super.delete(id);
      if (result) {
        this._onEvent$.next({
          type: ResourceRepositoryEventType.RESOURCE_DELETED,
          data: {
            resourceState: state,
          },
        });
      }
    }

    return result;
  }

  _delete(id: ResourceEntity['id']): boolean {
    let resource = this.get(id);
    if (resource) {
      this.destroyResource(resource);
    }

    return super._delete(id);
  }

  deleteAll(ids: ResourceEntity['id'][]): boolean {
    let resources = ids.map((id) => this.get(id)).filter((p) => !!p);
    let result = false;
    if (resources.length > 0) {
      let states = resources.map((resource) => resource.state);
      result = super.deleteAll(resources.map((resource) => resource.id));
      if (result) {
        states.forEach((state) => {
          this._onEvent$.next({
            type: ResourceRepositoryEventType.RESOURCE_DELETED,
            data: {
              resourceState: state,
            },
          });
        });
      }
    }

    return result;
  }

  protected destroyResource(resource: ResourceEntity): void {
    if (resource instanceof BaseSvgResource) {
      resource.destroy();
    }
  }

  destroy() {
    super.destroy();
    freeObserver(this._onEvent$);
  }
}
