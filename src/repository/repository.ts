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

import type {MediaEntity} from '../media';

export interface Repository<T extends MediaEntity> {
  add(mediaEntity: T): T;

  addAll(entities: T[]): T[];

  get(id: T['id']): T | undefined;

  getOrFail(id: T['id']): T;

  find(predicate?: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[];

  findFirst(predicate?: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): T | undefined;

  /**
   * @returns true if media entity is deleted successfully
   * @param id
   */
  delete(id: T['id']): boolean;

  /**
   * @returns true if all media entities are deleted successfully
   * @param ids
   */
  deleteAll(ids: T['id'][]): boolean;

  /**
   * @returns true if all media entities are deleted successfully
   */
  clear(): boolean;

  toString(): string;
}

export abstract class BaseRepository<T extends MediaEntity> implements Repository<T> {
  protected _mediaEntities: Map<T['id'], T> = new Map();

  add(mediaEntity: T): T {
    return this._add(mediaEntity);
  }

  _add(mediaEntity: T): T {
    if (this._mediaEntities.has(mediaEntity.id)) {
      throw new Error(`Media entity with id=${mediaEntity.id} already exists`);
    } else {
      this._mediaEntities.set(mediaEntity.id, mediaEntity);
    }
    return mediaEntity;
  }

  addAll(mediaEntities: T[]): T[] {
    let existingEntities = mediaEntities.filter((e) => this._mediaEntities.has(e.id));
    if (existingEntities.length > 0) {
      throw new Error(`Entities with ids=${mediaEntities.map((p) => p.id)} already exist`);
    } else if (mediaEntities.length < 1) {
      // console.debug(`Nothing to add`)
    } else {
      mediaEntities.forEach((p) => this._add(p));
    }
    return mediaEntities;
  }

  get(id: T['id']): T | undefined {
    return this._mediaEntities.get(id);
  }

  getOrFail(id: T['id']): T {
    let mediaEntity = this.get(id);
    if (!mediaEntity) {
      throw new Error(`Media entity with id=${id} does not exist`);
    }
    return mediaEntity;
  }

  delete(id: T['id']): boolean {
    return this._mediaEntities.delete(id);
  }

  clear(): boolean {
    return this.deleteAll(this.find().map((p) => p.id));
  }

  _delete(id: T['id']): boolean {
    if (this._mediaEntities.has(id)) {
      return this._mediaEntities.delete(id);
    } else {
      throw new Error(`Entity with id=${id} does not exist`)
    }
  }

  deleteAll(ids: T['id'][]): boolean {
    if (ids.length > 0) {
      let nonExistingEntitiesIds = ids
        .map((id) => {
          return !this._mediaEntities.has(id) ? id : void 0;
        })
        .filter((p) => !!p);

      if (nonExistingEntitiesIds.length > 0) {
        console.debug(`Entities with ids=${nonExistingEntitiesIds} does not exist. Delete skipped for all provided ids.`);
        return false;
      } else {
        ids.forEach((id) => this._delete(id));
        return true;
      }
    } else {
      return false;
    }
  }

  find(predicate?: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[] {
    return predicate ? this._find().filter(predicate) : this._find();
  }

  private _find(): T[] {
    return [...this._mediaEntities.values()];
  }

  findFirst(predicate?: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): T | undefined {
    return this.find(predicate)[0];
  }

  toString(): string {
    return JSON.stringify(
      this.find().map((p) => p.state),
      null,
      2
    );
  }
}
