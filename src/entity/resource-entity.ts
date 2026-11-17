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

import {BaseEntity, type Entity, type EntityArgs, type EntityState, EntityType} from './entity';
import {FileFormatType} from '../common';
import type {ResourceCreateOptions} from '../resource';

/**
 * Discriminator for the one kind of resource entities managed by the player.
 */
export enum ResourceEntityType {
  SVG_RESOURCE = 'SVG_RESOURCE',
}

/**
 * Serializable snapshot of a {@link ResourceEntity} instance.
 *
 * Extends {@link EntityState} with resource specific fields, such as resource type.
 */
export interface ResourceEntityState extends EntityState {
  resourceType: ResourceEntity['resourceType'];
  sourceFileFormatType: ResourceEntity['sourceFileFormatType'];

  createOptions: ResourceCreateOptions | undefined;
}

/**
 * Base contract shared by all resource entities {@link SvgResource}.
 *
 * Every resource entity carries a discriminated {@link ResourceEntityType},
 */
export interface ResourceEntity extends Entity {
  /** Serializable state snapshot of this resource. */
  state: ResourceEntityState;
  /** The resolved file format type of the source. */
  sourceFileFormatType: FileFormatType | undefined;
  /** Discriminator indicating this resource entity is a svg. */
  resourceType: ResourceEntityType;
}

/** Base create options shared by all resource entity types. */
export interface BaseResourceEntityCreateOptions {
  fileFormatType?: FileFormatType | undefined;
}

/**
 * Construction arguments shared by all {@link BaseResourceEntity} subclasses.
 */
export interface BaseResourceEntityArgs extends EntityArgs {
  /** The resolved file format of the source. */
  sourceFileFormatType?: FileFormatType | undefined;
  /** Create options when the resource was requested. */
  createOptions?: ResourceCreateOptions | undefined;
}

export abstract class BaseResourceEntity<S extends ResourceEntityState> extends BaseEntity<S> implements ResourceEntity {
  protected readonly _entityType = EntityType.RESOURCE;

  protected abstract _resourceType: ResourceEntityType;

  protected _sourceFileFormatType: FileFormatType | undefined;

  protected _createOptions: ResourceCreateOptions | undefined;

  protected constructor(args?: BaseResourceEntityArgs) {
    super(args);

    this._sourceFileFormatType = args?.sourceFileFormatType;

    this._createOptions = args?.createOptions;
  }

  protected _getState(): ResourceEntityState {
    return {
      ...super._getState(),
      resourceType: this._resourceType,
      sourceFileFormatType: this._sourceFileFormatType,
      createOptions: this._createOptions,
    };
  }

  get sourceFileFormatType(): FileFormatType | undefined {
    return this._sourceFileFormatType;
  }

  get resourceType(): ResourceEntityType {
    return this._resourceType;
  }
}
