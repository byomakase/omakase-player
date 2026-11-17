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

import type {Serializable} from '../common/capabilities';
import {CryptoUtil} from '../util/crypto-util';

/**
 * Discriminator for the two kinds of entities managed by the player.
 */
export enum EntityType {
  MEDIA = 'MEDIA',
  RESOURCE = 'RESOURCE',
}

/**
 * Serializable snapshot of a {@link Entity}, suitable for transfer across
 * worker boundaries or persistence in session storage.
 */
export interface EntityState extends Serializable {
  id: Entity['id'];
  entityType: Entity['entityType'];
}

/**
 * Base contract shared by all entities ({@link MediaEntity}, {@link ResourceEntity}).
 *
 * Every entity carries a unique identifier, a discriminated {@link EntityType},
 * and can produce a serializable {@link EntityState} snapshot via {@link state}.
 */
export interface Entity {
  /** Unique identifier (UUID). */
  id: string;
  /** Discriminator indicating whether this entity is a media or a resource. */
  entityType: EntityType;
  /** Serializable state snapshot of this entity. */
  state: EntityState;
}

/**
 * Construction arguments shared by all {@link BaseEntity} subclasses.
 */
export interface EntityArgs extends Serializable {
  /** Optional pre-assigned UUID. When omitted a new UUID is generated automatically. */
  id?: Entity['id'] | undefined;
}

export abstract class BaseEntity<S extends EntityState> implements Entity {
  protected _id: string;

  protected abstract _entityType: EntityType;

  protected constructor(args?: EntityArgs) {
    this._id = args?.id ? args.id : CryptoUtil.uuid();
  }

  protected abstract getState(): S;

  protected _getState(): EntityState {
    return {
      id: this._id,
      entityType: this._entityType,
    };
  }

  get id(): string {
    return this._id;
  }

  get entityType(): EntityType {
    return this._entityType;
  }

  get state(): S {
    return this.getState();
  }
}
