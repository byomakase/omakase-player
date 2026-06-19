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

import type {MediaEntity, MediaEntityState} from './media-entity';
import type {Serializable} from '../common/capabilities';

/**
 * Describes how two {@link MediaEntity} instances are related.
 */
export enum RelationType {
  /** The entity is a constituent part of another entity. */
  PART_OF = 'PART_OF',
  /** The entity was derived from another entity. */
  DERIVED_FROM = 'DERIVED_FROM',
}

/**
 * Serializable snapshot of a {@link Relation}, referencing the related entity
 * by its id and {@link MediaEntityType}.
 */
export interface RelationState extends Serializable {
  relationType: RelationType;
  entityId: MediaEntityState['id'];
  entityType: MediaEntityState['mediaType'];
}

export class Relation {
  private readonly _relationType: RelationType;
  private readonly _entityId: MediaEntity['id'];
  private readonly _entityType: MediaEntity['mediaType'];

  protected constructor(relationType: RelationType, entityId: MediaEntity['id'], entityType: MediaEntity['mediaType']) {
    this._relationType = relationType;
    this._entityId = entityId;
    this._entityType = entityType;
  }

  static of(relationType: RelationType, entityId: MediaEntity['id'], entityType: MediaEntity['mediaType']) {
    return new Relation(relationType, entityId, entityType);
  }

  static fromEntity(relationType: RelationType, entity: MediaEntity): Relation {
    return new Relation(relationType, entity.id, entity.mediaType);
  }

  static fromState(relationState: RelationState): Relation {
    return new Relation(relationState.relationType, relationState.entityId, relationState.entityType);
  }

  isEqualTo(relation: Relation): boolean {
    return this.relationType === relation.relationType && this.entityId === relation.entityId && this.entityType === relation.entityType;
  }

  get state(): RelationState {
    return {
      relationType: this._relationType,
      entityId: this._entityId,
      entityType: this._entityType,
    };
  }

  get relationType(): RelationType {
    return this._relationType;
  }

  get entityId(): MediaEntity['id'] {
    return this._entityId;
  }

  get entityType(): MediaEntity['mediaType'] {
    return this._entityType;
  }
}
