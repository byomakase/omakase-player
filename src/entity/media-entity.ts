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

import {BaseEntity, type Entity, type EntityArgs, type EntityState, EntityType} from './index';

/**
 * Discriminator for the two kinds of media entities managed by the player.
 */
export enum MediaEntityType {
  MAIN_MEDIA = 'MAIN_MEDIA',
  TRACK = 'TRACK',
}

/**
 * Serializable snapshot of a {@link MediaEntity} instance.
 *
 * Extends {@link EntityState} with media specific fields, such as media type.
 */
export interface MediaEntityState extends EntityState {
  mediaType: MediaEntity['mediaType'];
}

/**
 * Base contract shared by all media entities ({@link MainMedia}, {@link Track}).
 *
 * Every media entity carries a discriminated {@link MediaEntityType},
 */
export interface MediaEntity extends Entity {
  /** Discriminator indicating whether this media entity is a main media or a track. */
  mediaType: MediaEntityType;
}

/**
 * Construction arguments shared by all {@link BaseMediaEntity} subclasses.
 */
export interface BaseMediaEntityArgs extends EntityArgs {}

export abstract class BaseMediaEntity<S extends MediaEntityState> extends BaseEntity<S> implements MediaEntity {
  protected readonly _entityType = EntityType.MEDIA;

  protected abstract _mediaType: MediaEntityType;

  protected constructor(args?: BaseMediaEntityArgs) {
    super(args);
  }

  protected _getState(): MediaEntityState {
    return {
      ...super._getState(),
      mediaType: this._mediaType,
    };
  }

  get mediaType(): MediaEntityType {
    return this._mediaType;
  }
}
