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

import type {Entity, MediaEntity} from '../entity';
import type {Destroyable} from '../common/capabilities';

export interface Repository<T extends Entity> {
  add(entity: T): T;

  addAll(entities: T[]): T[];

  get(id: T['id']): T | undefined;

  getOrFail(id: T['id']): T;

  find(predicate?: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[];

  findFirst(predicate?: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): T | undefined;

  /**
   * @returns true if entity is deleted successfully
   * @param id
   */
  delete(id: T['id']): boolean;

  /**
   * @returns true if all entities are deleted successfully
   * @param ids
   */
  deleteAll(ids: T['id'][]): boolean;

  /**
   * @returns true if all entities are deleted successfully
   */
  clear(): boolean;

  toString(): string;
}

export abstract class BaseRepository<T extends Entity> implements Repository<T>, Destroyable {
  protected _entities: Map<T['id'], T> = new Map();

  add(entity: T): T {
    return this._add(entity);
  }

  delete(id: T['id']): boolean {
    return this._delete(id);
  }

  addAll(entities: T[]): T[] {
    let existingEntities = entities.filter((e) => this._entities.has(e.id));
    if (existingEntities.length > 0) {
      throw new Error(`Entities with ids=${entities.map((p) => p.id)} already exist`);
    } else if (entities.length < 1) {
      // nop
    } else {
      entities.forEach((p) => this._add(p));
    }
    return entities;
  }

  get(id: T['id']): T | undefined {
    return this._entities.get(id);
  }

  getOrFail(id: T['id']): T {
    let entity = this.get(id);
    if (!entity) {
      throw new Error(`Entity with id=${id} does not exist`);
    }
    return entity;
  }

  clear(): boolean {
    return this.deleteAll(this.find().map((p) => p.id));
  }

  deleteAll(ids: T['id'][]): boolean {
    if (ids.length > 0) {
      let nonExistingEntitiesIds = ids
        .map((id) => {
          return !this._entities.has(id) ? id : void 0;
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

  _add(entity: T): T {
    if (this._entities.has(entity.id)) {
      throw new Error(`Entity with id=${entity.id} already exists`);
    } else {
      this._entities.set(entity.id, entity);
    }
    return entity;
  }

  _delete(id: T['id']): boolean {
    if (this._entities.has(id)) {
      return this._entities.delete(id);
    } else {
      throw new Error(`Entity with id=${id} does not exist`);
    }
  }

  _find(): T[] {
    return [...this._entities.values()];
  }

  destroy() {
    this.clear();
  }
}

export abstract class BaseMediaRepository<T extends MediaEntity> extends BaseRepository<T> {}
