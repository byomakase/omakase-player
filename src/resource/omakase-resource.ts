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

import type {OmakaseResourceApi} from './omakase-resource-api';
import type {Destroyable} from '../common/capabilities';
import type {ResourceEntity} from '../entity';
import type {ResourceCreateOptions} from './resource-create-options';
import {map, type Observable, switchMap, takeUntil} from 'rxjs';
import {ResourceRepository, type ResourceRepositoryEvent} from '../repository';
import {ObserverBreaker} from '../common/observer-breaker';
import {SourceType, UrlSource} from '../source';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {isString} from '../util/util-functions';
import {ResourceFactory} from './resource-factory';
import {UrlUtil} from '../util/url-util';

export class OmakaseResourceApiImpl implements OmakaseResourceApi, Destroyable {
  protected _resourceRepository: ResourceRepository;

  protected _destroyBreaker = new ObserverBreaker();

  constructor(resourceRepository: ResourceRepository) {
    this._resourceRepository = resourceRepository;
  }

  get onEvent$(): Observable<ResourceRepositoryEvent> {
    return this._resourceRepository.onEvent$;
  }

  add(resource: ResourceEntity): ResourceEntity {
    return this._resourceRepository.add(resource);
  }

  delete(id: ResourceEntity['id']): boolean {
    return this._resourceRepository.delete(id);
  }

  find(predicate?: (value: ResourceEntity, index: number, array: ResourceEntity[]) => unknown): ResourceEntity[] {
    return this._resourceRepository.find(predicate);
  }

  findFirst(predicate?: (value: ResourceEntity, index: number, array: ResourceEntity[]) => unknown): ResourceEntity | undefined {
    return this._resourceRepository.findFirst(predicate);
  }

  get(id: ResourceEntity['id']): ResourceEntity | undefined {
    return this._resourceRepository.get(id);
  }

  create(source: UrlSource, createOptions?: ResourceCreateOptions | undefined): Observable<ResourceEntity>;
  create(inlineData: string, createOptions?: ResourceCreateOptions | undefined): Observable<ResourceEntity>;
  create(sourceOrInline: UrlSource | string, createOptions?: ResourceCreateOptions | undefined): Observable<ResourceEntity>;
  create(sourceOrInline: UrlSource | string, createOptions?: ResourceCreateOptions | undefined): Observable<ResourceEntity> {
    let resource$: Observable<ResourceEntity>;

    const createSource = (sourceOrInline: UrlSource | string) => {
      resource$ = ResourceFactory.createResource(sourceOrInline, createOptions).pipe(map((t) => this.add(t)));
    };

    if (isString(sourceOrInline)) {
      UrlUtil.isUrlAbsolute(sourceOrInline) || UrlUtil.isDataBase64Url(sourceOrInline) || UrlUtil.isBlobUrl(sourceOrInline)
        ? createSource(new UrlSource(sourceOrInline))
        : createSource(sourceOrInline);
    } else if (sourceOrInline.type === SourceType.URL) {
      createSource(sourceOrInline as UrlSource);
    } else {
      throw new Error(`Error creating resource`);
    }

    return passiveObservable<ResourceEntity>((observer) => {
      resource$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (resource) => {
          nextCompleteObserver(observer, resource);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  destroy(): void {
    this._destroyBreaker.destroy();
  }
}
